"""Gemini access.

The client is optional. When GEMINI_API_KEY is absent, or when a call fails or
times out, every caller falls back to deterministic text rather than surfacing an
error - so the product stays usable without a model.

Every request is bounded by GEMINI_TIMEOUT_SECONDS in total. No model is asked twice,
but when one is overloaded, out of quota, gone or too slow, the next configured model
gets the time that is left - a busy model used to send every agent to its fallback.
Route handlers run in the threadpool, so a slow call never blocks other requests; the
bound stops a call that never answers from holding a worker thread indefinitely.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from .config import GEMINI_API_KEY, GEMINI_BACKUP_MODELS, GEMINI_MODEL, GEMINI_TIMEOUT_SECONDS

logger = logging.getLogger("cybridge.ai")

# The records hold no one's gender, and a name does not tell it; the models guessed.
NEUTRAL = "Refer to people by name or as \"they\"; never as he or she."

MODEL = GEMINI_MODEL
BACKUP_MODELS: list[str] = GEMINI_BACKUP_MODELS

# Answers that another model may not give: not found, quota, unavailable, deadline.
# A rejected key (400/403) or a bad request would fail the same way on every model.
TRY_ANOTHER_MODEL = {404, 429, 503, 504}

# How long a model that just failed that way is passed over, in this process: what Google
# says (a used-up daily quota can be hours), up to an hour, else two minutes.
COOL_DOWN_SECONDS = 120.0
MAX_COOL_DOWN_SECONDS = 3600.0
_resting_until: dict[str, float] = {}

_client: Any = None
_init_attempted = False


def build_client(api_key: str, timeout_seconds: float, base_url: str | None = None) -> Any:
    """A Gemini client whose every request is bounded by `timeout_seconds`.

    Retries are switched off explicitly. The SDK's retry policy, whenever retry
    options are set, retries timeouts up to five times with backoff - which would
    turn a 120-second bound into roughly ten minutes. Pinning attempts to 1 keeps
    the bound true even if a future SDK release changes its default.

    `base_url` points the client at another endpoint; the tests use it to run the
    real SDK against a local stand-in for Gemini.

    Certificates are verified against the operating system's trust store, as a
    browser does, instead of the bundle shipped with the HTTP library. Machines whose
    antivirus or proxy inspects TLS install their own root in the OS store only, and
    there every call otherwise fails with CERTIFICATE_VERIFY_FAILED.
    """
    import ssl

    import truststore
    from google import genai
    from google.genai import types

    options = types.HttpOptions(
        timeout=int(timeout_seconds * 1000),  # the SDK takes milliseconds
        retry_options=types.HttpRetryOptions(attempts=1),
        base_url=base_url,
        client_args={"verify": truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)},
    )
    return genai.Client(api_key=api_key, http_options=options)


def _client_or_none() -> Any:
    """Construct the client on first use, so a missing or broken SDK never blocks
    startup."""
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True

    if not GEMINI_API_KEY:
        return None
    try:
        _client = build_client(GEMINI_API_KEY, GEMINI_TIMEOUT_SECONDS)
        logger.info("Gemini client initialised (timeout %ss).", GEMINI_TIMEOUT_SECONDS)
    except Exception as exc:  # SDK missing, version drift, bad key shape
        logger.warning("Gemini client could not be initialised: %s", exc)
        _client = None
    return _client


def is_available() -> bool:
    return _client_or_none() is not None


def _is_timeout(exc: BaseException) -> bool:
    try:
        import httpx
    except ImportError:  # pragma: no cover - httpx ships with the SDK
        return False
    return isinstance(exc, httpx.TimeoutException)


def _cool_down(exc: BaseException) -> float:
    """How long to pass over a model after `exc`, from the retry delay in the error."""
    details = getattr(exc, "details", None)
    error = details.get("error", details) if isinstance(details, dict) else {}
    for item in error.get("details", []) if isinstance(error, dict) else []:
        delay = re.fullmatch(r"([\d.]+)s", str(item.get("retryDelay", ""))) if isinstance(item, dict) else None
        if delay:
            return min(MAX_COOL_DOWN_SECONDS, max(COOL_DOWN_SECONDS, float(delay.group(1))))
    return COOL_DOWN_SECONDS


def _models_to_try() -> list[str]:
    """The models in order, those that recently failed last, soonest free first: they
    are still tried if nothing else answers."""
    now = time.monotonic()
    return sorted([MODEL, *BACKUP_MODELS], key=lambda m: max(0.0, _resting_until.get(m, 0.0) - now))


def generate(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.7,
    as_json: bool = False,
) -> str | None:
    """Generated text, or None so the caller can use its fallback. `as_json` asks the
    model for JSON output, which it otherwise sometimes returns malformed.

    Never raises: a Gemini outage or timeout must not turn into a 500 for the UI.
    """
    client = _client_or_none()
    if client is None:
        return None

    models = _models_to_try()
    deadline = time.monotonic() + GEMINI_TIMEOUT_SECONDS
    for i, model in enumerate(models):
        left = deadline - time.monotonic()
        if left < 1:
            break
        last = i == len(models) - 1
        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                temperature=temperature,
                system_instruction=f"{system_instruction}\n\n{NEUTRAL}" if system_instruction else NEUTRAL,
                response_mime_type="application/json" if as_json else None,
                # Half of what is left, so the next model still gets a real chance; the
                # last one may use all of it. With one model the client's own bound holds.
                http_options=(
                    types.HttpOptions(timeout=int((left if last else left / 2) * 1000))
                    if len(models) > 1 else None
                ),
            )
            response = client.models.generate_content(model=model, contents=prompt, config=config)
            if i:
                logger.info("Gemini answered from %s.", model)
            return getattr(response, "text", None) or None
        except Exception as exc:
            timed_out = _is_timeout(exc)
            if timed_out:
                logger.warning(
                    "Gemini call to %s timed out. Raise GEMINI_TIMEOUT_SECONDS if long "
                    "responses are being cut off.", model,
                )
            else:
                logger.warning("Gemini call to %s failed: %s", model, exc)
            if not timed_out and getattr(exc, "code", None) not in TRY_ANOTHER_MODEL:
                break
            _resting_until[model] = time.monotonic() + _cool_down(exc)
    logger.warning("No Gemini model answered; using the fallback.")
    return None


def generate_json(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.4,
) -> Any | None:
    """Generate and parse a JSON payload.

    Models routinely wrap JSON in ``` fences or add prose around it, so strip
    fences and fall back to the outermost {...} / [...] span before parsing.
    Returns None if nothing parseable comes back.
    """
    raw = generate(prompt, system_instruction, temperature, as_json=True)
    if not raw:
        return None

    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"[\{\[].*[\}\]]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    logger.warning("Gemini returned unparseable JSON; using fallback.")
    return None
