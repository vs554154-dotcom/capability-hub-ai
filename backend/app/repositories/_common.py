"""Helpers shared by the repositories: clock, id generation and row mapping.

These define the JSON contract the React client relies on, so they are kept exact:
timestamps in millisecond-precision UTC with a Z suffix, absent optional fields
omitted rather than sent as null, and whole-number REAL values sent as integers.
"""
from __future__ import annotations

import json
import random
import string
from datetime import datetime, timezone
from typing import Any

BASE36 = string.digits + string.ascii_lowercase


def iso(moment: datetime) -> str:
    """A UTC datetime with millisecond precision and a Z suffix, e.g.
    2026-08-27T10:00:00.000Z - the format every timestamp column uses. Strings in
    this format sort in time order, so SQL can compare them directly."""
    return f"{moment.strftime('%Y-%m-%dT%H:%M:%S')}.{moment.microsecond // 1000:03d}Z"


def now_iso() -> str:
    return iso(datetime.now(timezone.utc))


def now_date() -> str:
    """Date-only stamp, as used for user_skills.lastUpdated."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def random_id(prefix: str) -> str:
    """Short random id: `prefix` followed by nine base-36 characters."""
    return prefix + "".join(random.choices(BASE36, k=9))


def compact(payload: dict[str, Any]) -> dict[str, Any]:
    """Drop keys whose value is None, so optional fields are omitted from the JSON
    rather than sent as null - the shape the frontend was built against."""
    return {k: v for k, v in payload.items() if v is not None}


def js_number(raw: Any) -> int | float | None:
    """Send a REAL column the way a single-number-type client expects: 8.0 becomes
    8, while 9.5 stays 9.5."""
    if raw is None:
        return None
    value = float(raw)
    return int(value) if value.is_integer() else value


def json_column(raw: Any) -> Any:
    """Decode a JSON-encoded TEXT column, tolerating already-decoded values."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
