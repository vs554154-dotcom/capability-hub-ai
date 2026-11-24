"""Adds the demo data set to an existing database. Safe to run again.

    python backend/scripts/load_demo_data.py                    add what is missing
    python backend/scripts/load_demo_data.py --refresh-dates    also move passed demo interview dates ahead
    python backend/scripts/load_demo_data.py --dry-run          say what would be added, change nothing

The database is DATABASE_PATH, or capability-hub.db in the repository root. When there is
something to add it is copied to backups/ first, and a backup is never overwritten. Rows
that are already there are never changed, so your own people, scores and demands stay as
they are; a fresh database gets the demo data by itself.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app import config, seed_data  # noqa: E402
from backend.app.database import init_database  # noqa: E402


def back_up() -> Path:
    """A copy of the database as last committed, under a name not used before. Read over
    its own connection, so it does not see what the load has not committed yet."""
    folder = config.DB_PATH.parent / "backups"
    folder.mkdir(exist_ok=True)
    stem = f"{config.DB_PATH.stem}-{datetime.now():%Y%m%d-%H%M%S}"
    target, n = folder / f"{stem}.db", 2
    while target.exists():
        target, n = folder / f"{stem}-{n}.db", n + 1
    source, copy = sqlite3.connect(config.DB_PATH), sqlite3.connect(target)
    try:
        source.backup(copy)
    finally:
        copy.close()
        source.close()
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Add the demo data set to the database.")
    parser.add_argument("--refresh-dates", action="store_true", help="move passed demo interview dates ahead of today")
    parser.add_argument("--dry-run", action="store_true", help="show what would change, and change nothing")
    args = parser.parse_args()

    init_database()
    conn = sqlite3.connect(config.DB_PATH, isolation_level=None, timeout=10)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            added = seed_data.load_demo(conn)
            moved = seed_data.refresh_demo_dates(conn) if args.refresh_dates else 0
            if not args.dry_run and (any(added.values()) or moved):
                print(f"Backup: {back_up()}")
        except seed_data.Clash as clash:
            conn.execute("ROLLBACK")
            print(f"Nothing was changed. {clash}")
            return 1
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        conn.execute("ROLLBACK" if args.dry_run else "COMMIT")
    finally:
        conn.close()

    if any(added.values()):
        print("Would add:" if args.dry_run else "Added:")
        for table, count in added.items():
            print(f"  {table:20} {count}")
    else:
        print("Nothing to add: the demo data is already there.")
    if args.refresh_dates:
        print(f"Demo interview dates moved ahead: {moved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
