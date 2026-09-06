"""Gemini access.

Mirrors the posture of server.ts: the client is optional. When GEMINI_API_KEY is
absent, or when a call fails, every endpoint falls back to deterministic text
rather than surfacing an error - so the product stays usable without a key, which
is how the demo environments run.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from .config import GEMINI_API_KEY

logger = logging.getLogger("cybridge.ai")

MODEL = "gemini-3.6-flash"

_client: Any = None
_init_attempted = False


def _client_or_none() -> Any:
    """Lazily construct the client so a missing/broken SDK never blocks startup."""
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True

    if not GEMINI_API_KEY:
        return None

    try:
        from google import genai  # type: ignore

        _client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info("Secure Gemini AI Client Initialized.")
    except Exception as exc:  # SDK missing, version drift, bad key shape
        logger.warning("Gemini client could not be initialised: %s", exc)
        _client = None
    return _client


def is_available() -> bool:
    return _client_or_none() is not None


def generate(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.7,
) -> str | None:
    """Return generated text, or None so the caller can use its fallback.

    Never raises: a Gemini outage must not turn into a 500 for the UI.
    """
    client = _client_or_none()
    if client is None:
        return None

    try:
        from google.genai import types  # type: ignore

        config = types.GenerateContentConfig(temperature=temperature)
        if system_instruction:
            config.system_instruction = system_instruction

        response = client.models.generate_content(
            model=MODEL, contents=prompt, config=config
        )
        return getattr(response, "text", None) or None
    except Exception as exc:
        logger.warning(
            "Gemini call failed, activating intelligent fallback mode: %s", exc
        )
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
