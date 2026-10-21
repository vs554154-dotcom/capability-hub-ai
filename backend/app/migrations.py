"""Versioned schema migrations.

The schema version is SQLite's built-in `PRAGMA user_version`. Each migration below
moves the database from version N-1 to N, inside one transaction that also records
the new version - so a migration either applies completely or not at all, and a
database can never claim a version whose changes it does not have.

To change the schema, append a Migration with the next version number. Never edit
schema_sql.py: it is the frozen version-1 baseline, and editing it would make new
databases differ from upgraded ones (test_migrations.py enforces this).

Guarantees, each covered by a test:
  * an empty database is built to the latest version;
  * any older database - including one built by any version of the Node server,
    which added 20 columns over time with ALTER TABLE - is upgraded in place, with
    its rows kept and new columns given their defaults;
  * migrating twice changes nothing;
  * a failing migration leaves the database exactly as it was;
  * a migration that would introduce a foreign-key violation is rolled back;
  * a database newer than this code is refused instead of being misread.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Callable, Sequence

from .schema_sql import SCHEMA_STATEMENTS


class MigrationError(RuntimeError):
    """The database cannot be brought to the schema this code expects."""


@dataclass(frozen=True)
class Migration:
    version: int
    description: str
    apply: Callable[[sqlite3.Connection], None]


# --------------------------------------------------------------------------- #
# Migrations
# --------------------------------------------------------------------------- #

def _baseline(conn: sqlite3.Connection) -> None:
    """Bring any database to the version-1 schema in schema_sql.py.

    Missing tables are created. Then each table is compared column by column with
    the baseline and anything missing is added, with the type and default the
    baseline declares. That covers every historical shape at once - an empty file,
    a database this backend built, and a Node-built database from before any of its
    ALTER TABLE statements ran - without listing them one by one.
    """
    for statement in SCHEMA_STATEMENTS:
        conn.execute(statement)

    reference = sqlite3.connect(":memory:")
    try:
        for statement in SCHEMA_STATEMENTS:
            reference.execute(statement)
        tables = [r[0] for r in reference.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )]
        for table in tables:
            present = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
            for _cid, name, col_type, notnull, default, pk in reference.execute(
                f'PRAGMA table_info("{table}")'
            ):
                if name in present:
                    continue
                if pk:
                    raise MigrationError(
                        f"{table}.{name} is part of the primary key and cannot be added "
                        "to an existing table."
                    )
                if notnull and default is None:
                    raise MigrationError(
                        f"{table}.{name} is NOT NULL with no default, so existing rows "
                        "would have no value for it."
                    )
                ddl = f'ALTER TABLE "{table}" ADD COLUMN "{name}" {col_type}'
                if notnull:
                    ddl += " NOT NULL"
                if default is not None:
                    ddl += f" DEFAULT {default}"
                conn.execute(ddl)
    finally:
        reference.close()


def _sessions(conn: sqlite3.Connection) -> None:
    """Session records kept in the database, so signing out ends a session."""
    conn.execute(
        """CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            revokedAt TEXT,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )"""
    )
    conn.execute("CREATE INDEX idx_sessions_user ON sessions(userId)")


def _rate_limits(conn: sqlite3.Connection) -> None:
    """Sign-in attempt counters, shared by every process using the database."""
    conn.execute(
        """CREATE TABLE rate_limits (
            key TEXT PRIMARY KEY,
            windowStart REAL NOT NULL,
            count INTEGER NOT NULL
        )"""
    )


MIGRATIONS: list[Migration] = [
    Migration(
        1,
        "Baseline: create all 12 tables and add any column an older database lacks",
        _baseline,
    ),
    Migration(2, "Sessions table: database-backed sign-in sessions", _sessions),
    Migration(3, "Rate-limit table: sign-in attempt counters shared across processes", _rate_limits),
]

LATEST_VERSION = max(m.version for m in MIGRATIONS)


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

def current_version(conn: sqlite3.Connection) -> int:
    return conn.execute("PRAGMA user_version").fetchone()[0]


def _foreign_key_violations(conn: sqlite3.Connection) -> set[tuple]:
    return {tuple(row) for row in conn.execute("PRAGMA foreign_key_check").fetchall()}


def migrate(
    conn: sqlite3.Connection, migrations: Sequence[Migration] = MIGRATIONS
) -> list[int]:
    """Apply every migration newer than the database, in order. Returns the versions
    applied (empty if the database was already current).

    `conn` must be in autocommit mode (isolation_level=None) so that each migration's
    transaction is controlled explicitly here.
    """
    if conn.isolation_level is not None:
        raise ValueError("migrate() needs a connection opened with isolation_level=None")

    ordered = sorted(migrations, key=lambda m: m.version)
    known = ordered[-1].version if ordered else 0
    if current_version(conn) > known:
        raise MigrationError(
            f"This database is at schema version {current_version(conn)}, newer than the "
            f"{known} this code knows. It was migrated by a newer release; run that "
            "release, or restore a backup taken before the upgrade."
        )

    applied: list[int] = []
    for migration in ordered:
        # IMMEDIATE takes the write lock up front. The version is then re-read under
        # that lock, so two processes starting together cannot both apply it.
        conn.execute("BEGIN IMMEDIATE")
        try:
            if migration.version <= current_version(conn):
                conn.execute("ROLLBACK")
                continue
            before = _foreign_key_violations(conn)
            migration.apply(conn)
            introduced = _foreign_key_violations(conn) - before
            if introduced:
                raise MigrationError(
                    f"Migration {migration.version} would leave {len(introduced)} row(s) "
                    "violating foreign keys; it was rolled back."
                )
            conn.execute(f"PRAGMA user_version = {int(migration.version)}")
            conn.execute("COMMIT")
        except BaseException:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        applied.append(migration.version)
    return applied
