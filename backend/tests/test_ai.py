"""Gemini integration, exercised through the real SDK.

Mocking the client would only prove that our code calls a mock. These tests run
the actual google-genai client against a small local stand-in for the Gemini API,
so they check what matters: that a real request is sent, that its response is
parsed, and that a call which does not answer is cut off at the configured timeout
without being retried.
"""
from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from backend.app import ai, config


class FakeGemini:
    """Answers generateContent requests the way Gemini does, with switchable
    behaviour: reply normally, reply after a delay, or fail with a 500."""

    def __init__(self) -> None:
        self.mode = "ok"
        self.reply_text = "Hello from the model."
        self.delay_seconds = 0.0
        self.busy: dict[str, int] = {}      # model -> the error status it answers with
        self.retry_delay: str | None = None  # what a busy model says about trying again
        self.slow: dict[str, float] = {}    # model -> seconds before it answers
        self.requests: list[dict] = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - http.server naming
                length = int(self.headers.get("Content-Length") or 0)
                fake.requests.append({
                    "path": self.path,
                    "body": json.loads(self.rfile.read(length) or b"{}"),
                })
                model = self.path.split("models/")[1].split(":")[0]
                delay = fake.slow.get(model, fake.delay_seconds)
                if delay:
                    time.sleep(delay)
                if model in fake.busy:
                    status = fake.busy[model]
                    payload = {"error": {"code": status, "message": "busy", "status": "UNAVAILABLE"}}
                    if fake.retry_delay:
                        payload["error"]["details"] = [{"retryDelay": fake.retry_delay}]
                elif fake.mode == "error":
                    payload, status = {"error": {"code": 500, "message": "boom"}}, 500
                else:
                    payload, status = {
                        "candidates": [{
                            "content": {"role": "model", "parts": [{"text": fake.reply_text}]},
                            "finishReason": "STOP",
                        }]
                    }, 200
                data = json.dumps(payload).encode()
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass  # the client gave up first - the point of the timeout tests

            def log_message(self, *_args) -> None:
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self._server.block_on_close = False  # don't wait on a deliberately slow reply
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}/"
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()


@pytest.fixture
def gemini(monkeypatch):
    # Talk to the local server directly, whatever proxy the environment defines.
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")
    server = FakeGemini()

    def connect(timeout_seconds: float = 5.0) -> None:
        client = ai.build_client("test-key", timeout_seconds, base_url=server.url)
        monkeypatch.setattr(ai, "_client", client)
        monkeypatch.setattr(ai, "_init_attempted", True)

    server.connect = connect
    yield server
    server.close()


def test_generate_returns_the_models_text(gemini):
    gemini.connect()
    assert ai.generate("What next?", system_instruction="You are a coach.") == "Hello from the model."

    request = gemini.requests[0]
    assert request["path"].endswith(f"models/{ai.MODEL}:generateContent")
    # The system instruction and prompt reach the API, not just our code.
    assert "You are a coach." in json.dumps(request["body"])
    assert "What next?" in json.dumps(request["body"])
    assert "never as he or she" in json.dumps(request["body"]["systemInstruction"])


def test_generate_json_recovers_fenced_output(gemini):
    gemini.reply_text = '```json\n{"roleTitle": "Data Engineer", "mcqs": []}\n```'
    gemini.connect()
    assert ai.generate_json("assessment please") == {"roleTitle": "Data Engineer", "mcqs": []}


def test_json_is_asked_for_as_json_and_prose_is_not(gemini):
    gemini.reply_text = "{}"
    gemini.connect()
    ai.generate_json("assessment please")
    ai.generate("What next?")
    asked_for = [r["body"].get("generationConfig", {}).get("responseMimeType") for r in gemini.requests]
    assert asked_for == ["application/json", None]


def test_a_call_that_does_not_answer_is_cut_off_at_the_timeout(gemini):
    gemini.delay_seconds = 4.0
    gemini.connect(timeout_seconds=1.0)

    started = time.monotonic()
    result = ai.generate("What next?")
    elapsed = time.monotonic() - started

    assert result is None                 # the caller falls back
    assert elapsed < 2.5, f"took {elapsed:.2f}s against a 1s timeout"
    assert len(gemini.requests) == 1      # and it was not retried


def test_server_errors_are_not_retried(gemini):
    gemini.mode = "error"
    gemini.connect()
    assert ai.generate("What next?") is None
    assert len(gemini.requests) == 1


# --------------------------------------------------------------------------- #
# A busy model hands over to a backup, inside the same time limit
# --------------------------------------------------------------------------- #

@pytest.fixture
def backups(gemini, monkeypatch):
    monkeypatch.setattr(ai, "BACKUP_MODELS", ["backup-1", "backup-2"])
    monkeypatch.setattr(ai, "_resting_until", {})
    gemini.connect()
    return gemini


def asked(gemini):
    return [r["path"].split("models/")[1].split(":")[0] for r in gemini.requests]


@pytest.mark.parametrize("status", [404, 429, 503, 504])
def test_a_busy_model_hands_over_to_the_next_one(backups, status):
    backups.busy = {ai.MODEL: status}
    assert ai.generate("What next?") == "Hello from the model."
    assert asked(backups) == [ai.MODEL, "backup-1"]


def test_the_first_model_is_used_when_it_answers(backups):
    ai.generate("What next?")
    assert asked(backups) == [ai.MODEL]


def test_every_model_is_asked_once_before_falling_back(backups):
    backups.busy = {ai.MODEL: 503, "backup-1": 503, "backup-2": 503}
    assert ai.generate("What next?") is None
    assert asked(backups) == [ai.MODEL, "backup-1", "backup-2"]


@pytest.mark.parametrize("status", [400, 403, 500])
def test_an_error_every_model_would_give_is_not_passed_on(backups, status):
    backups.busy = {ai.MODEL: status}
    assert ai.generate("What next?") is None
    assert asked(backups) == [ai.MODEL]


def test_a_model_that_was_busy_is_passed_over_for_a_while(backups, monkeypatch):
    backups.busy = {ai.MODEL: 503}
    ai.generate("one")
    backups.busy = {}
    ai.generate("two")
    assert asked(backups) == [ai.MODEL, "backup-1", "backup-1"]
    monkeypatch.setattr(ai, "_resting_until", {m: 0.0 for m in ai._resting_until})   # later
    ai.generate("three")
    assert asked(backups)[-1] == ai.MODEL


@pytest.mark.parametrize("said, rests", [(None, 120), ("5s", 120), ("600s", 600), ("50883s", 3600), ("soon", 120)])
def test_a_used_up_model_rests_as_long_as_google_says(backups, said, rests):
    backups.busy, backups.retry_delay = {ai.MODEL: 429}, said
    ai.generate("What next?")
    assert ai._resting_until[ai.MODEL] - time.monotonic() == pytest.approx(rests, abs=5)


def test_a_model_with_no_quota_left_is_tried_last(backups):
    now = time.monotonic()
    ai._resting_until.update({ai.MODEL: now + 3600, "backup-1": now + 900, "backup-2": now + 30})
    ai.generate("What next?")
    assert asked(backups) == ["backup-2"]


def test_a_slow_model_is_cut_off_in_time_for_the_next(backups, monkeypatch):
    monkeypatch.setattr(ai, "GEMINI_TIMEOUT_SECONDS", 4.0)
    backups.slow = {ai.MODEL: 8.0}
    started = time.monotonic()
    assert ai.generate("What next?") == "Hello from the model."
    assert time.monotonic() - started < 4.0
    assert asked(backups) == [ai.MODEL, "backup-1"]


def test_the_total_time_is_bounded_however_many_models_there_are(backups, monkeypatch):
    monkeypatch.setattr(ai, "GEMINI_TIMEOUT_SECONDS", 4.0)
    backups.slow = {ai.MODEL: 8.0, "backup-1": 8.0, "backup-2": 8.0}
    started = time.monotonic()
    assert ai.generate("What next?") is None
    assert time.monotonic() - started < 5.0


@pytest.mark.parametrize("raw", ["0", "-5", "soon"])
def test_an_invalid_timeout_setting_is_refused(monkeypatch, raw):
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", raw)
    with pytest.raises(ValueError):
        config._positive_seconds("GEMINI_TIMEOUT_SECONDS", 120.0)


def test_timeout_setting_defaults_and_overrides(monkeypatch):
    monkeypatch.delenv("GEMINI_TIMEOUT_SECONDS", raising=False)
    assert config._positive_seconds("GEMINI_TIMEOUT_SECONDS", 120.0) == 120.0
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", "45")
    assert config._positive_seconds("GEMINI_TIMEOUT_SECONDS", 120.0) == 45.0
