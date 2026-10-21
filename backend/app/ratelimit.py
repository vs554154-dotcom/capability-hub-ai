"""Fixed-window rate limiting for authentication.

IP-keyed, 30 attempts per 15-minute window by default, tunable via
AUTH_RATE_LIMIT_MAX. Both successful and failed attempts count, so it caps rapid
password-claiming as well as brute-force guessing.

The counters live in the `rate_limits` table, so every worker and process using the
database shares one count: running two workers does not double the allowance. Each
attempt is counted inside one write transaction, so concurrent attempts are
serialised by SQLite and none can slip under the limit.
"""
from __future__ import annotations

import os
import time

from fastapi import HTTPException, Request

from .database import transaction

WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS = int(os.getenv("AUTH_RATE_LIMIT_MAX", "30"))

TOO_MANY = (
    "Too many login attempts from this location. "
    "Please wait a few minutes and try again."
)

# Behind a proxy the peer address is the proxy, so the forwarded client is used when
# present. Only meaningful when the app actually sits behind a trusted proxy; a
# direct-to-internet deployment should set TRUST_PROXY=false so a client cannot
# spoof its own key.
TRUST_PROXY = os.getenv("TRUST_PROXY", "true").lower() != "false"


def client_key(request: Request) -> str:
    if TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def record_attempt(key: str, now: float | None = None) -> tuple[int, int]:
    """Count one attempt for `key`. Returns the attempts in the current window,
    including this one, and the seconds until that window ends.

    Wall-clock time, because the windows are shared between processes.
    """
    now = time.time() if now is None else now
    with transaction() as conn:
        # Expired windows go first - this key's and everyone else's - so the table
        # cannot grow without bound and a new window starts from an insert.
        conn.execute("DELETE FROM rate_limits WHERE windowStart <= ?", (now - WINDOW_SECONDS,))
        conn.execute(
            "INSERT INTO rate_limits (key, windowStart, count) VALUES (?, ?, 1) "
            "ON CONFLICT(key) DO UPDATE SET count = count + 1",
            (key, now),
        )
        count, started = conn.execute(
            "SELECT count, windowStart FROM rate_limits WHERE key = ?", (key,)
        ).fetchone()
    return count, max(1, int(WINDOW_SECONDS - (now - started)))


def enforce_auth_rate_limit(request: Request) -> None:
    """Count this attempt and raise 429 once the ceiling is passed.

    Called before any credential is examined, so an attacker is refused even on the
    request where they would finally guess correctly.
    """
    count, retry_after = record_attempt(client_key(request))
    if count > MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=TOO_MANY,
            headers={"Retry-After": str(retry_after)},
        )


def reset() -> None:
    """Clear all counters. Used by tests, never in request handling."""
    with transaction() as conn:
        conn.execute("DELETE FROM rate_limits")
