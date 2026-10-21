"""Gemini access.

The client is optional. When GEMINI_API_KEY is absent, or when a call fails or
times out, every caller falls back to deterministic text rather than surfacing an
error - so the product stays usable without a model.

Every call is bounded by GEMINI_TIMEOUT_SECONDS and is never retried, so the worst
case for one request is exactly that long. Route handlers run in the threadpool,
so a slow call never blocks other requests; the bound stops a call that never
answers from holding a worker thread indefinitely.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from .config import GEMINI_API_KEY, GEMINI_TIMEOUT_SECONDS

logger = logging.getLogger("cybridge.ai")

MODEL = "gemini-3.6-flash"

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
    """
    from google import genai
    from google.genai import types

    options = types.HttpOptions(
        timeout=int(timeout_seconds * 1000),  # the SDK takes milliseconds
        retry_options=types.HttpRetryOptions(attempts=1),
        base_url=base_url,
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


def generate(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.7,
) -> str | None:
    """Generated text, or None so the caller can use its fallback.

    Never raises: a Gemini outage or timeout must not turn into a 500 for the UI.
    """
    client = _client_or_none()
    if client is None:
        return None

    try:
        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system_instruction,
        )
        response = client.models.generate_content(model=MODEL, contents=prompt, config=config)
        return getattr(response, "text", None) or None
    except Exception as exc:
        if _is_timeout(exc):
            logger.warning(
                "Gemini call timed out after %ss; using the fallback. Raise "
                "GEMINI_TIMEOUT_SECONDS if long responses are being cut off.",
                GEMINI_TIMEOUT_SECONDS,
            )
        else:
            logger.warning("Gemini call failed, using the fallback: %s", exc)
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
    raw = generate(prompt, system_instruction, temperature)
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
