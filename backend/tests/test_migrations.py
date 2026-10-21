"""Schema migrations.

Each test runs the migration runner directly against its own throwaway database
file, so it never touches the app's database or any shared state.
"""
from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pytest

from backend.app import migrations
from backend.app.migrations import LATEST_VERSION, MIGRATIONS, Migration, MigrationError, migrate
from backend.app.schema_sql import SCHEMA_STATEMENTS

# Fingerprint of the frozen version-1 baseline. If this test fails you edited
# schema_sql.py. Revert it and add a migration instead: databases already at
# version 1 never re-run migration 1, so they would never receive the change.
BASELINE_FINGERPRINT = "a2463ad1fe3f52072d652cd19af5796dc9d3990a23b356782cad2aab8da7a830"


def connect(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(path, isolation_level=None)


def columns(conn: sqlite3.Connection) -> dict[str, dict[str, tuple]]:
    """table -> column name -> (type, notnull, default, pk). Keyed by name, so a
    column added later by ALTER compares equal to one created in place."""
    result = {}
    for (table,) in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ):
        result[table] = {
            name: (col_type, notnull, default, pk)
            for _cid, name, col_type, notnull, default, pk
            in conn.execute(f'PRAGMA table_info("{table}")')
        }
    return result


@pytest.fixture
def baseline_columns() -> dict[str, dict[str, tuple]]:
    reference = sqlite3.connect(":memory:")
    for statement in SCHEMA_STATEMENTS:
        reference.execute(statement)
    return columns(reference)


# --------------------------------------------------------------------------- #
# The rules that keep migrations trustworthy
# --------------------------------------------------------------------------- #

def test_the_baseline_schema_is_frozen():
    fingerprint = hashlib.sha256("\n".join(SCHEMA_STATEMENTS).encode()).hexdigest()
    assert fingerprint == BASELINE_FINGERPRINT, (
        "schema_sql.py changed. It is the frozen version-1 baseline - add a migration "
        "in migrations.py instead."
    )


def test_migration_versions_run_one_to_n_without_gaps():
    versions = [m.version for m in MIGRATIONS]
    assert versions == list(range(1, len(MIGRATIONS) + 1))
    assert all(m.description.strip() for m in MIGRATIONS)


def test_the_runner_needs_an_autocommit_connection(tmp_path):
    with pytest.raises(ValueError):
        migrate(sqlite3.connect(tmp_path / "db.sqlite"))


# --------------------------------------------------------------------------- #
# Building and upgrading
# --------------------------------------------------------------------------- #

def test_an_empty_database_is_built_to_the_latest_version(tmp_path, baseline_columns):
    conn = connect(tmp_path / "fresh.db")
    assert migrate(conn) == list(range(1, LATEST_VERSION + 1))
    assert migrations.current_version(conn) == LATEST_VERSION
    built = columns(conn)
    assert {t: c for t, c in built.items() if t in baseline_columns} == baseline_columns
    # Later migrations only add tables on top of the baseline.
    assert set(built) - set(baseline_columns) == {"sessions", "rate_limits"}


def _legacy_node_database(path: Path) -> sqlite3.Connection:
    """The oldest shape a Node-built database can have: users, courses and
    learning_plans as first created, before any of the 20 columns the Node server
    later added with ALTER TABLE, and no project-demand or assessment tables yet."""
    conn = connect(path)
    conn.executescript("""
        CREATE TABLE skills (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            category TEXT NOT NULL, description TEXT NOT NULL);
        CREATE TABLE users (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
            role TEXT NOT NULL, avatar TEXT NOT NULL, title TEXT NOT NULL,
            department TEXT NOT NULL, targetRoleId TEXT);
        CREATE TABLE courses (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL,
            duration TEXT NOT NULL, skillId TEXT NOT NULL, description TEXT NOT NULL,
            type TEXT NOT NULL, url TEXT,
            FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE);
        CREATE TABLE learning_plans (
            id TEXT PRIMARY KEY, userId TEXT NOT NULL, weekNumber INTEGER NOT NULL,
            title TEXT NOT NULL, skillFocus TEXT NOT NULL, courseName TEXT NOT NULL,
            provider TEXT NOT NULL, milestone TEXT NOT NULL, assessment TEXT NOT NULL,
            targetScore TEXT NOT NULL, status TEXT NOT NULL, progressPercent INTEGER NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE);

        INSERT INTO skills VALUES ('sk_1', 'SQL', 'Data', 'Relational querying');
        INSERT INTO users VALUES ('E1', 'Asha', 'asha@x', 'employee', 'a.png', 'Engineer', 'QA', NULL);
        INSERT INTO courses VALUES ('c_1', 'SQL 101', 'Coursera', '2h', 'sk_1', 'Intro', 'course', NULL);
        INSERT INTO learning_plans VALUES
            ('p_1', 'E1', 1, 'Joins', 'SQL', 'SQL 101', 'Coursera', 'Write joins', 'Quiz', '80%', 'in_progress', 40);
    """)
    return conn


def test_an_old_node_database_is_upgraded_in_place(tmp_path):
    conn = _legacy_node_database(tmp_path / "legacy.db")
    assert migrations.current_version(conn) == 0

    assert migrate(conn) == list(range(1, LATEST_VERSION + 1))

    # Same schema as a database built fresh: every missing column and table added.
    fresh = connect(tmp_path / "fresh.db")
    migrate(fresh)
    assert columns(conn) == columns(fresh)

    # Existing rows survive, and the added columns take their declared defaults.
    plan = conn.execute(
        "SELECT title, progressPercent, learningType, quizScore, timeSpentMins, purpose "
        "FROM learning_plans WHERE id = 'p_1'"
    ).fetchone()
    assert plan == ("Joins", 40, "in_depth", 0, 0, "career_growth")

    course = conn.execute(
        "SELECT title, rating, enrollmentCount, isLatest2026 FROM courses WHERE id = 'c_1'"
    ).fetchone()
    assert course == ("SQL 101", 4.9, "180,000+ Learners", 1)

    user = conn.execute("SELECT name, passwordHash, managerId FROM users WHERE id = 'E1'").fetchone()
    assert user == ("Asha", None, None)


def test_migrating_twice_changes_nothing(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    migrate(conn)
    schema_before = conn.execute("SELECT type, name, sql FROM sqlite_master ORDER BY name").fetchall()

    assert migrate(conn) == []
    assert conn.execute("SELECT type, name, sql FROM sqlite_master ORDER BY name").fetchall() == schema_before
    assert migrations.current_version(conn) == LATEST_VERSION


# --------------------------------------------------------------------------- #
# Failure is all-or-nothing
# --------------------------------------------------------------------------- #

def _then(*extra: Migration) -> list[Migration]:
    return [*MIGRATIONS, *extra]


def test_a_failing_migration_leaves_the_database_untouched(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    migrate(conn)

    def half_done(c: sqlite3.Connection) -> None:
        c.execute("CREATE TABLE half_done (id TEXT)")
        c.execute("ALTER TABLE users ADD COLUMN nickname TEXT")
        raise RuntimeError("simulated failure part-way through")

    with pytest.raises(RuntimeError, match="part-way"):
        migrate(conn, _then(Migration(LATEST_VERSION + 1, "fails", half_done)))

    assert migrations.current_version(conn) == LATEST_VERSION
    assert conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'half_done'").fetchone() is None
    assert "nickname" not in {r[1] for r in conn.execute("PRAGMA table_info(users)")}


def test_a_migration_that_breaks_foreign_keys_is_rolled_back(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    migrate(conn)

    def orphan_evidence(c: sqlite3.Connection) -> None:
        c.execute(
            "INSERT INTO evidences (id, userId, skillId, title, description, evidenceText, "
            "status, submittedAt) VALUES ('ev_x', 'nobody', 'no_skill', 't', 'd', 'e', "
            "'pending', '2026-01-01T00:00:00.000Z')"
        )

    with pytest.raises(MigrationError, match="foreign keys"):
        migrate(conn, _then(Migration(LATEST_VERSION + 1, "orphans", orphan_evidence)))

    assert migrations.current_version(conn) == LATEST_VERSION
    assert conn.execute("SELECT COUNT(*) FROM evidences WHERE id = 'ev_x'").fetchone()[0] == 0


def test_a_database_newer_than_the_code_is_refused(tmp_path):
    conn = connect(tmp_path / "db.sqlite")
    migrate(conn)
    conn.execute(f"PRAGMA user_version = {LATEST_VERSION + 1}")

    with pytest.raises(MigrationError, match="newer"):
        migrate(conn)
