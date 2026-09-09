"""Fixed-window rate limiting for authentication.

Mirrors the express-rate-limit configuration on the Node login route: IP-keyed,
30 attempts per 15-minute window by default, tunable via AUTH_RATE_LIMIT_MAX. Both
successful and failed attempts count, so it caps rapid password-claiming as well as
brute-force guessing.

Deliberately dependency-free: this is a counter with a window, and a small audited
module is easier to reason about than another package in the deployment. The store is
in-memory, so the count is per process - fine for a single-instance deployment; a
shared store (Redis) is the change to make when scaling horizontally.
"""
from __future__ import annotations

import os
import time
from threading import Lock

from fastapi import HTTPException, Request

WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS = int(os.getenv("AUTH_RATE_LIMIT_MAX", "30"))

TOO_MANY = (
    "Too many login attempts from this location. "
    "Please wait a few minutes and try again."
)

# Behind a proxy the peer address is the proxy, so the forwarded client is used when
# present - matching `app.set("trust proxy", 1)` on the Node server. Only meaningful
# when the app actually sits behind a trusted proxy; a direct-to-internet deployment
# should set TRUST_PROXY=false so a client cannot spoof its own key.
TRUST_PROXY = os.getenv("TRUST_PROXY", "true").lower() != "false"

_hits: dict[str, tuple[int, float]] = {}  # key -> (count, window_started_at)
_lock = Lock()


def client_key(request: Request) -> str:
    if TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _prune(now: float) -> None:
    """Drop windows that have expired, so the store cannot grow without bound."""
    stale = [k for k, (_, started) in _hits.items() if now - started >= WINDOW_SECONDS]
    for k in stale:
        del _hits[k]


def enforce_auth_rate_limit(request: Request) -> None:
    """Count this attempt and raise 429 once the ceiling is passed.

    Called before any credential is examined, so an attacker is refused even on the
    request where they would finally guess correctly.
    """
    now = time.monotonic()
    key = client_key(request)

    with _lock:
        if len(_hits) > 2048:
            _prune(now)
        count, started = _hits.get(key, (0, now))
        if now - started >= WINDOW_SECONDS:
            count, started = 0, now
        count += 1
        _hits[key] = (count, started)
        over_limit = count > MAX_ATTEMPTS
        retry_after = max(1, int(WINDOW_SECONDS - (now - started)))

    if over_limit:
        raise HTTPException(
            status_code=429,
            detail=TOO_MANY,
            headers={"Retry-After": str(retry_after)},
        )


def reset() -> None:
    """Clear all counters. Used by tests, never in request handling."""
    with _lock:
        _hits.clear()
