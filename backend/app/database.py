"""SQLite connection management, transactions and schema initialisation.

Every database access goes through `transaction()`. It hands out one connection and
commits once at the end - or rolls back everything if anything inside raises. Calls
nest: a repository function called inside a service's `with transaction():` block
joins that transaction instead of opening its own, so a multi-step write (insert the
evidence, then move the skill to "practicing") is atomic as a whole.

The active connection is thread-local. Route handlers are plain `def` functions that
FastAPI runs in its threadpool, so a request's work happens on one thread and its
transaction cannot leak into another request.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

from .config import DB_PATH, SEED_PATH
from .schema_sql import SCHEMA_STATEMENTS, SEED_TABLE_ORDER


class DatabaseMissingError(RuntimeError):
    """Raised when the SQLite file cannot be created or seeded."""


_state = threading.local()
_init_lock = threading.Lock()
_initialised = False


def _open() -> sqlite3.Connection:
    if not DB_PATH.exists():
        try:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:  # unwritable volume, read-only filesystem
            raise DatabaseMissingError(
                f"Cannot create the SQLite database at {DB_PATH}: {exc}. "
                "Set DATABASE_PATH to a writable location."
            ) from exc

    # timeout: how long a writer waits for another writer's lock before raising,
    # which matters now that requests run concurrently in the threadpool.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _apply_schema_and_seed(conn: sqlite3.Connection) -> None:
    """Create every table, then load seed data into any table that is still empty.

    A table that already has rows is never re-seeded, so a running deployment's data
    survives restarts and a fresh deployment builds itself.
    """
    for statement in SCHEMA_STATEMENTS:
        conn.execute(statement)

    if SEED_PATH.exists():
        seed: dict[str, list[dict[str, Any]]] = json.loads(
            SEED_PATH.read_text(encoding="utf-8")
        )
        for table in SEED_TABLE_ORDER:
            rows = seed.get(table) or []
            if not rows:
                continue
            if conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]:
                continue
            columns = list(rows[0].keys())
            placeholders = ", ".join("?" for _ in columns)
            column_list = ", ".join(f'"{c}"' for c in columns)
            conn.executemany(
                f"INSERT OR IGNORE INTO {table} ({column_list}) VALUES ({placeholders})",
                [tuple(row.get(c) for c in columns) for row in rows],
            )
    conn.commit()


def init_database() -> None:
    """Create the schema and seed empty tables. Idempotent and thread-safe.

    Called from the application's startup hook, and again lazily by the first
    transaction - so code that runs without the lifespan (tests, scripts) still finds
    a built database.
    """
    global _initialised
    if _initialised:
        return
    with _init_lock:
        if _initialised:
            return
        conn = _open()
        try:
            _apply_schema_and_seed(conn)
        finally:
            conn.close()
        _initialised = True


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """A unit of work: one connection, committed once, or rolled back as a whole.

    Re-entrant: inside an open transaction this yields the same connection and lets
    the outermost block decide whether to commit.
    """
    current = getattr(_state, "conn", None)
    if current is not None:
        yield current
        return

    init_database()
    conn = _open()
    _state.conn = conn
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        _state.conn = None
        conn.close()


def query_all(sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
    with transaction() as conn:
        return conn.execute(sql, tuple(params)).fetchall()


def query_one(sql: str, params: Sequence[Any] = ()) -> sqlite3.Row | None:
    with transaction() as conn:
        return conn.execute(sql, tuple(params)).fetchone()


def execute(sql: str, params: Sequence[Any] = ()) -> None:
    with transaction() as conn:
        conn.execute(sql, tuple(params))
