"""Copies of the database: backups before something big, and the demo's starting point.

Going back to the starting point puts every table back except three: sessions and sign-in
counters, so nobody is signed out by it, and the daily readiness readings, which are
history. Passwords people have set since are kept too.
"""
from __future__ import annotations

import sqlite3
import tempfile
from datetime import date, datetime
from pathlib import Path

from . import config, seed_data
from .migrations import migrate

KEPT = {"sessions", "rate_limits", "eri_snapshots"}


def folder() -> Path:
    path = config.DB_PATH.parent / "backups"
    path.mkdir(exist_ok=True)
    return path


def starting_point() -> Path:
    return config.DB_PATH.parent / "backups" / "demo-starting-point.db"


def _copy(source: Path, target: Path) -> None:
    """A consistent copy of a database as last committed, safe while it is in use."""
    reading, writing = sqlite3.connect(source), sqlite3.connect(target)
    try:
        reading.backup(writing)
    finally:
        writing.close()
        reading.close()


def back_up() -> Path:
    """Copy the database to backups/, under a name not used before."""
    stem = f"{config.DB_PATH.stem}-{datetime.now():%Y%m%d-%H%M%S}"
    target, n = folder() / f"{stem}.db", 2
    while target.exists():
        target, n = folder() / f"{stem}-{n}.db", n + 1
    _copy(config.DB_PATH, target)
    return target


def save_starting_point() -> Path:
    """Keep the database as it is now as what a reset goes back to."""
    folder()
    fresh = starting_point().with_suffix(".new")
    fresh.unlink(missing_ok=True)
    _copy(config.DB_PATH, fresh)
    fresh.replace(starting_point())
    return starting_point()


def _build_from_seed(target: Path) -> None:
    """A new database with the seed, the demo company and the sample journeys."""
    conn = sqlite3.connect(target, isolation_level=None)
    try:
        migrate(conn)
        conn.execute("BEGIN")
        for table, rows in seed_data.starting_rows().items():
            seed_data.insert_missing(conn, table, rows)
        conn.execute("COMMIT")
    finally:
        conn.close()


class RestoreFailed(RuntimeError):
    """The copy could not be put back; the database is as it was."""


def _restore(source: Path) -> None:
    conn = sqlite3.connect(config.DB_PATH, isolation_level=None, timeout=10)
    try:
        # Rows are replaced table by table, so keys are only checked at the end.
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("ATTACH DATABASE ? AS start", (str(source),))
        conn.execute("BEGIN IMMEDIATE")
        try:
            passwords = conn.execute("SELECT passwordHash, id FROM main.users WHERE passwordHash IS NOT NULL").fetchall()
            tables = [r[0] for r in conn.execute(
                "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
            for table in tables:
                if table in KEPT:
                    continue
                columns = ", ".join(f'"{c[1]}"' for c in conn.execute(f"PRAGMA main.table_info({table})"))
                conn.execute(f"DELETE FROM main.{table}")
                conn.execute(f"INSERT INTO main.{table} ({columns}) SELECT {columns} FROM start.{table}")
            conn.executemany("UPDATE main.users SET passwordHash = ? WHERE id = ?", passwords)
            conn.execute("DELETE FROM main.sessions WHERE userId NOT IN (SELECT id FROM main.users)")
            if seed_data.demo_rows():
                seed_data.refresh_demo_dates(conn, date.today())
            broken = conn.execute("PRAGMA main.foreign_key_check").fetchall()
            if broken:
                raise RestoreFailed(f"{len(broken)} broken references, first: {broken[0]}")
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
    finally:
        conn.close()


def reset_demo() -> Path:
    """Put the demo back to its starting point: the saved one, else the one the seed
    gives. The database is backed up first; returns that backup."""
    backup = back_up()
    with tempfile.TemporaryDirectory(prefix="cybridge-reset-") as temp:
        source = Path(temp) / "start.db"
        if starting_point().exists():
            _copy(starting_point(), source)
            # A starting point saved by an older version gets the newer tables first.
            conn = sqlite3.connect(source, isolation_level=None)
            try:
                migrate(conn)
            finally:
                conn.close()
        else:
            _build_from_seed(source)
        _restore(source)
    return backup
