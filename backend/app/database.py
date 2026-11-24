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

import logging
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

from . import seed_data
from .config import DB_PATH
from .migrations import current_version, migrate
from .schema_sql import SEED_TABLE_ORDER

logger = logging.getLogger("cybridge.database")


class DatabaseMissingError(RuntimeError):
    """Raised when the SQLite file cannot be created or seeded."""


_state = threading.local()
_init_lock = threading.Lock()
_initialised = False


def _ensure_directory() -> None:
    if DB_PATH.exists():
        return
    try:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # unwritable volume, read-only filesystem
        raise DatabaseMissingError(
            f"Cannot create the SQLite database at {DB_PATH}: {exc}. "
            "Set DATABASE_PATH to a writable location."
        ) from exc


def _open() -> sqlite3.Connection:
    """A connection for request work: Python manages its transactions, and
    `transaction()` decides when to commit."""
    _ensure_directory()
    # timeout: how long a writer waits for another writer's lock before raising,
    # which matters because requests run concurrently in the threadpool.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _seed_empty_tables(conn: sqlite3.Connection) -> list[str]:
    """Load seed rows into every table that is still empty, and return their names.

    A table with rows is never touched, so a deployment's data survives restarts and
    a fresh one builds itself. Runs under the write lock, so two processes starting
    together cannot both decide a table is empty and both fill it.
    """
    seeded: list[str] = []
    conn.execute("BEGIN IMMEDIATE")
    try:
        # The demo company is for a database that starts from nothing. One that already
        # has people gets it with scripts/load_demo_data.py, when someone asks for it.
        fresh = not conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        seed = seed_data.starting_rows(include_demo=fresh)
        for table in SEED_TABLE_ORDER:
            rows = seed.get(table) or []
            if not rows or conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]:
                continue
            seed_data.insert_missing(conn, table, rows)
            seeded.append(table)
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    return seeded


def init_database() -> None:
    """Migrate the schema to the latest version, then seed any empty table.
    Idempotent and thread-safe.

    Called from the application's startup hook, and again lazily by the first
    transaction, so code that runs without the lifespan (tests, scripts) still finds
    a built database. A database that cannot be migrated stops startup with the
    reason rather than letting requests run against the wrong schema.
    """
    global _initialised
    if _initialised:
        return
    with _init_lock:
        if _initialised:
            return
        _ensure_directory()
        # Autocommit mode: the migration runner and the seeder each control their
        # own transactions explicitly.
        conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=10)
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            applied = migrate(conn)
            if applied:
                logger.info(
                    "Database migrated to schema version %s (applied %s).",
                    current_version(conn), ", ".join(map(str, applied)),
                )
            seeded = _seed_empty_tables(conn)
            if seeded:
                logger.info("Seeded empty tables: %s.", ", ".join(seeded))
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
