"""The rows a database starts with: the base seed, and the demo data set beside it.

Two files, each a list of rows per table:

* seed/seed.json       the base people, skills, demands and learning history;
* seed/demo_seed.json  a larger, made-up company for demos, built from the sources in
                       seed/source/ by scripts/build_demo_seed.py.

A date in the demo file can be written relative to today ("@+21d", "@-3dT10:00:00Z"),
so a demo has upcoming interviews whenever it is loaded.
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from . import config
from .schema_sql import SEED_TABLE_ORDER

Rows = dict[str, list[dict[str, Any]]]

_RELATIVE = re.compile(r"^@([+-]\d+)d(T[\d:.]+Z)?$")


def _resolve(value: Any, today: date) -> Any:
    found = _RELATIVE.match(value) if isinstance(value, str) else None
    if not found:
        return value
    return (today + timedelta(days=int(found.group(1)))).isoformat() + (found.group(2) or "")


def _read(path: Path, today: date) -> Rows:
    if not path.exists():
        return {}
    raw: Rows = json.loads(path.read_text(encoding="utf-8"))
    return {
        table: [{c: _resolve(v, today) for c, v in row.items()} for row in rows]
        for table, rows in raw.items()
    }


def demo_rows(today: date | None = None) -> Rows:
    return _read(config.DEMO_SEED_PATH, today or date.today())


def starting_rows(include_demo: bool = True, today: date | None = None) -> Rows:
    """What an empty database is filled with: the base rows, then the demo rows
    unless SEED_DEMO_DATA is off."""
    today = today or date.today()
    base = _read(config.SEED_PATH, today)
    demo = demo_rows(today) if include_demo and config.SEED_DEMO_DATA else {}
    return {t: (base.get(t) or []) + (demo.get(t) or []) for t in SEED_TABLE_ORDER}


def insert_missing(conn: sqlite3.Connection, table: str, rows: list[dict[str, Any]]) -> int:
    """Insert the rows whose key is not in the table yet, and return how many. A row
    that is already there is left exactly as it is."""
    added = 0
    for row in rows:
        columns = ", ".join(f'"{c}"' for c in row)
        marks = ", ".join("?" for _ in row)
        added += conn.execute(
            f"INSERT OR IGNORE INTO {table} ({columns}) VALUES ({marks})", tuple(row.values())
        ).rowcount
    return added


class Clash(ValueError):
    """The demo data names something the database already has under another id."""


def load_demo(conn: sqlite3.Connection, today: date | None = None) -> dict[str, int]:
    """Add the demo rows that are missing, in the caller's transaction. Returns rows
    added per table. Stops, adding nothing, when a skill, role or person of the same
    name exists under another id: two skills of one name would split a person's levels."""
    rows = demo_rows(today)
    for table, column in (("skills", "name"), ("target_roles", "title"), ("users", "email"), ("users", "name")):
        ours = {str(r[column]).lower(): r["id"] for r in rows.get(table, [])}
        for other_id, value in conn.execute(f"SELECT id, {column} FROM {table}").fetchall():
            if ours.get(str(value).lower(), other_id) != other_id:
                raise Clash(f"{table}: {value!r} is already in the database as {other_id}.")
    return {t: insert_missing(conn, t, rows[t]) for t in SEED_TABLE_ORDER if rows.get(t)}


def refresh_demo_dates(conn: sqlite3.Connection, today: date | None = None) -> int:
    """Give open demo demands whose interview date has passed their dates again,
    counted from today. Other demands, and dates still ahead, are left alone."""
    today = today or date.today()
    moved = 0
    for row in demo_rows(today).get("project_demands", []):
        moved += conn.execute(
            "UPDATE project_demands SET clientInterviewDate = ?, expectedJoiningDate = ? "
            "WHERE id = ? AND status = 'OPEN' AND substr(clientInterviewDate, 1, 10) < ?",
            (row["clientInterviewDate"], row["expectedJoiningDate"], row["id"], today.isoformat()),
        ).rowcount
    return moved
