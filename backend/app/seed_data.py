"""The rows a database starts with: the base seed, and the demo data set beside it.

Two files, each a list of rows per table:

* seed/seed.json       the base people, skills, demands and learning history;
* seed/demo_seed.json  a larger, made-up company for demos, built from the sources in
                       seed/source/ by scripts/build_demo_seed.py.

A third, seed/demo_journeys.json, holds demo people part-way from a client demand to a
resume: what the application stored when scripts/build_demo_journeys.py took them there.

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
# The same inside a text: {{+12d}}, or {{+12d|d/m/yyyy}} for a date written 6/12/2026.
_IN_TEXT = re.compile(r"\{\{([+-]\d+)d(\|d/m/yyyy)?\}\}")


def _resolve(value: Any, today: date) -> Any:
    if not isinstance(value, str):
        return value
    found = _RELATIVE.match(value)
    if found:
        return (today + timedelta(days=int(found.group(1)))).isoformat() + (found.group(2) or "")

    def spell(match: re.Match[str]) -> str:
        day = today + timedelta(days=int(match.group(1)))
        return f"{day.day}/{day.month}/{day.year}" if match.group(2) else day.isoformat()

    return _IN_TEXT.sub(spell, value) if "{{" in value else value


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
    demo: Rows = {}
    if include_demo and config.SEED_DEMO_DATA:
        # A demo starts with interviews ahead, also for the base demands.
        demo = demo_rows(today)
        base["project_demands"] = [
            r for r in sample_demands(today) if r["id"] in {d["id"] for d in base.get("project_demands", [])}
        ]
    rows = {t: (base.get(t) or []) + (demo.get(t) or []) for t in SEED_TABLE_ORDER}
    if demo and config.SEED_DEMO_JOURNEYS:
        for user_id, journey in journeys(today).items():
            for table in _REPLACED:
                rows[table] = [r for r in rows[table] if r["userId"] != user_id]
            for table, added in journey["rows"].items():
                rows.setdefault(table, []).extend(added)
    return rows


# --------------------------------------------------------------------------- #
# Sample journeys
# --------------------------------------------------------------------------- #

# A journey sets a person's whole plan and levels anew; in the other tables it adds.
_REPLACED = ("learning_plans", "user_skills")


def _journey_file() -> dict[str, Any]:
    if not config.DEMO_JOURNEYS_PATH.exists():
        return {"cast": [], "people": {}}
    return json.loads(config.DEMO_JOURNEYS_PATH.read_text(encoding="utf-8"))


def cast() -> list[dict[str, str]]:
    """The people a presenter shows, with what to show for each."""
    return _journey_file()["cast"]


def journeys(today: date | None = None) -> dict[str, dict[str, Any]]:
    """Each travelling person's stage, demand and rows."""
    today = today or date.today()
    return {
        user_id: {**j, "rows": {
            table: [{c: _resolve(v, today) for c, v in row.items()} for row in rows]
            for table, rows in j["rows"].items()
        }}
        for user_id, j in _journey_file()["people"].items()
    }


def _untouched(conn: sqlite3.Connection, user_id: str, demo: Rows) -> bool:
    """Is this demo person's record still as it was loaded? Someone who has been handed
    off, studied, sent proof or been reviewed since is left to their own journey."""
    if conn.execute("SELECT 1 FROM skill_baselines WHERE userId = ?", (user_id,)).fetchone():
        return False
    for table, columns in (
        ("user_skills", "skillId, currentLevel, targetLevel"), ("learning_plans", "id, status, quizScore"),
        ("evidences", "id, status"),
    ):
        names = [c.strip() for c in columns.split(",")]
        loaded = {tuple(r[c] for c in names) for r in demo.get(table, []) if r["userId"] == user_id}
        now = {tuple(r) for r in conn.execute(f"SELECT {columns} FROM {table} WHERE userId = ?", (user_id,))}
        if loaded != now:
            return False
    return True


def load_journeys(conn: sqlite3.Connection, today: date | None = None) -> dict[str, int]:
    """Put the sample journeys of demo people whose records are untouched, in the
    caller's transaction. Returns how many were put and how many were left alone."""
    today = today or date.today()
    demo = demo_rows(today)
    put = left = 0
    for user_id, journey in journeys(today).items():
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone() or not _untouched(conn, user_id, demo):
            left += 1
            continue
        for table in _REPLACED:
            conn.execute(f"DELETE FROM {table} WHERE userId = ?", (user_id,))
        for table, rows in journey["rows"].items():
            insert_missing(conn, table, rows)
        put += 1
    if put:
        # The journeys were counted from today, so their projects are too: asked for before
        # anyone was handed off to them, and with the interview the messages name.
        for row in demo.get("project_demands", []):
            conn.execute(
                "UPDATE project_demands SET createdAt = MIN(createdAt, ?), clientInterviewDate = ?, "
                "expectedJoiningDate = ? WHERE id = ? AND status = 'OPEN'",
                (row["createdAt"], row["clientInterviewDate"], row["expectedJoiningDate"], row["id"]),
            )
    return {"put": put, "left": left}


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
    # A plan is replaced whole when someone is given a track, so a missing step was removed
    # on purpose: steps are added only for people with no plan at all.
    planned = {r[0] for r in conn.execute("SELECT DISTINCT userId FROM learning_plans")}
    rows["learning_plans"] = [r for r in rows.get("learning_plans", []) if r["userId"] not in planned]
    return {t: insert_missing(conn, t, rows[t]) for t in SEED_TABLE_ORDER if rows.get(t)}


_DAYS_AHEAD = {"CRITICAL": 12, "HIGH": 20, "MEDIUM": 32, "LOW": 45}


def sample_demands(today: date | None = None) -> list[dict[str, Any]]:
    """The sample demands with upcoming dates. The base ones were written with fixed
    dates; those are set from the priority, the more urgent the sooner, a day apart."""
    today = today or date.today()
    base = []
    for n, row in enumerate(_read(config.SEED_PATH, today).get("project_demands", [])):
        days = _DAYS_AHEAD.get(row["projectPriority"], 32) + n
        time = row["clientInterviewDate"][10:] or "T10:00:00Z"
        base.append({**row, "clientInterviewDate": f"{today + timedelta(days=days)}{time}",
                     "expectedJoiningDate": f"{today + timedelta(days=days + 30)}T09:00:00Z"})
    return base + demo_rows(today).get("project_demands", [])


def refresh_demo_dates(conn: sqlite3.Connection, today: date | None = None) -> int:
    """Give open sample demands whose interview date has passed new dates, counted from
    today. Demands people created, and dates still ahead, are left alone."""
    today = today or date.today()
    moved = 0
    for row in sample_demands(today):
        moved += conn.execute(
            "UPDATE project_demands SET clientInterviewDate = ?, expectedJoiningDate = ? "
            "WHERE id = ? AND status = 'OPEN' AND substr(clientInterviewDate, 1, 10) < ?",
            (row["clientInterviewDate"], row["expectedJoiningDate"], row["id"], today.isoformat()),
        ).rowcount
    return moved
