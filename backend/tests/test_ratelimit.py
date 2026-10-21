"""Sign-in rate limiting.

The counters live in the database, so the limit holds across threads and across
processes - the property that lets the app run more than one worker.
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import ratelimit
from backend.app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]


def attempt(client: TestClient, ip: str):
    # A wrong identifier: the limiter runs before the account lookup, so this counts
    # as an attempt without signing anyone in.
    return client.post(
        "/api/auth/login",
        json={"identifier": "nobody-at-all", "password": "x"},
        headers={"X-Forwarded-For": ip},
    )


def test_attempts_past_the_limit_are_refused_with_retry_after(monkeypatch, anon):
    monkeypatch.setattr(ratelimit, "MAX_ATTEMPTS", 3)

    statuses = [attempt(anon, "198.51.100.1").status_code for _ in range(3)]
    assert statuses == [404, 404, 404]

    refused = attempt(anon, "198.51.100.1")
    assert refused.status_code == 429
    assert 1 <= int(refused.headers["Retry-After"]) <= ratelimit.WINDOW_SECONDS


def test_each_address_has_its_own_count(monkeypatch, anon):
    monkeypatch.setattr(ratelimit, "MAX_ATTEMPTS", 2)
    for _ in range(3):
        attempt(anon, "198.51.100.2")
    assert attempt(anon, "198.51.100.2").status_code == 429
    assert attempt(anon, "198.51.100.3").status_code == 404


def test_a_new_window_starts_from_zero():
    start = 1_000_000.0
    for _ in range(5):
        ratelimit.record_attempt("k-window", now=start)
    assert ratelimit.record_attempt("k-window", now=start + 10)[0] == 6

    count, retry_after = ratelimit.record_attempt("k-window", now=start + ratelimit.WINDOW_SECONDS)
    assert count == 1
    assert retry_after == ratelimit.WINDOW_SECONDS


def test_concurrent_attempts_are_each_counted_once():
    threads_n, per_thread = 8, 25
    barrier = threading.Barrier(threads_n)

    def hammer():
        barrier.wait()
        for _ in range(per_thread):
            ratelimit.record_attempt("k-concurrent")

    threads = [threading.Thread(target=hammer) for _ in range(threads_n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert ratelimit.record_attempt("k-concurrent")[0] == threads_n * per_thread + 1


def test_the_count_is_shared_with_another_process():
    for _ in range(4):
        ratelimit.record_attempt("k-shared")

    # A separate Python process on the same database file - what a second worker is.
    child = subprocess.run(
        [sys.executable, "-c",
         "from backend.app import ratelimit; print(ratelimit.record_attempt('k-shared')[0])"],
        cwd=REPO_ROOT, env=os.environ.copy(), capture_output=True, text=True, timeout=60,
    )
    assert child.returncode == 0, child.stderr
    assert child.stdout.strip() == "5"

    assert ratelimit.record_attempt("k-shared")[0] == 6


def test_reset_clears_every_counter():
    ratelimit.record_attempt("k-reset")
    ratelimit.reset()
    assert ratelimit.record_attempt("k-reset")[0] == 1
