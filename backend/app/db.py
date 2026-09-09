"""SQLite access layer.

Deliberately thin and hand-written rather than an ORM: the schema already exists
and is owned by server-db.ts, so this layer's job is to read and write it exactly
as the Node server does - including the JSON-encoded TEXT columns and the
"omit empty optional fields" JSON shape the React app expects.
"""
from __future__ import annotations

import json
import random
import sqlite3
import string
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import DB_PATH, SEED_PATH
from .numeric import js_round
from .schema_sql import SCHEMA_STATEMENTS, SEED_TABLE_ORDER

_BASE36 = string.digits + string.ascii_lowercase


def _now_iso() -> str:
    """Match JavaScript's Date().toISOString(): millisecond precision, Z suffix.

    Python's isoformat() emits microseconds and no Z, which would put a visibly
    different timestamp format in the same columns the Node server writes.
    """
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y-%m-%dT%H:%M:%S')}.{now.microsecond // 1000:03d}Z"


def _now_date() -> str:
    """Date-only stamp, as used for user_skills.lastUpdated."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _random_id(prefix: str) -> str:
    """Mirror `prefix + Math.random().toString(36).substr(2, 9)` in server-db.ts."""
    return prefix + "".join(random.choices(_BASE36, k=9))


class DatabaseMissingError(RuntimeError):
    """Raised when the SQLite file cannot be created or seeded."""


_initialised = False


def _apply_schema_and_seed(conn: sqlite3.Connection) -> None:
    """Create every table, then load seed data into any table that is still empty.

    This backend owns its schema. It previously refused to start unless the Node
    server had created the database first, which made it impossible to deploy on its
    own. The DDL and the seed rows are checked in alongside this module.
    """
    for statement in SCHEMA_STATEMENTS:
        conn.execute(statement)

    if not SEED_PATH.exists():
        conn.commit()
        return

    seed: dict[str, list[dict[str, Any]]] = json.loads(
        SEED_PATH.read_text(encoding="utf-8")
    )

    for table in SEED_TABLE_ORDER:
        rows = seed.get(table) or []
        if not rows:
            continue
        # Only seed a table nobody has written to yet, so a running deployment's data
        # is never overwritten on restart.
        existing = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if existing:
            continue
        columns = list(rows[0].keys())
        placeholders = ", ".join("?" for _ in columns)
        column_list = ", ".join(f'"{c}"' for c in columns)
        conn.executemany(
            f"INSERT OR IGNORE INTO {table} ({column_list}) VALUES ({placeholders})",
            [tuple(row.get(c) for c in columns) for row in rows],
        )
    conn.commit()


def _connect() -> sqlite3.Connection:
    global _initialised
    fresh = not DB_PATH.exists()
    if fresh:
        try:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:  # unwritable volume, read-only filesystem
            raise DatabaseMissingError(
                f"Cannot create the SQLite database at {DB_PATH}: {exc}. "
                "Set CAPABILITY_DB_PATH to a writable location."
            ) from exc

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")

    # Schema/seed only needs applying once per process; after that every connection
    # opens against a database that is already built.
    if not _initialised:
        _apply_schema_and_seed(conn)
        _initialised = True

    return conn


@contextmanager
def cursor() -> Iterator[sqlite3.Cursor]:
    conn = _connect()
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    finally:
        conn.close()


def query_all(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql: str, params: tuple = ()) -> sqlite3.Row | None:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def execute(sql: str, params: tuple = ()) -> None:
    with cursor() as cur:
        cur.execute(sql, params)


# --------------------------------------------------------------------------- #
# Row mappers
#
# server-db.ts maps optional columns to `undefined`, which JSON.stringify drops
# from the payload entirely. `_compact` reproduces that: keys whose value is None
# are omitted rather than serialised as null, so the two backends emit byte-identical
# JSON for the same row.
# --------------------------------------------------------------------------- #

def _compact(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}


def _js_number(raw: Any) -> int | float | None:
    """Serialise a numeric column the way JavaScript's single number type does.

    SQLite REAL 8.0 becomes `8` (not `8.0`), while 9.5 stays `9.5`.
    """
    if raw is None:
        return None
    value = float(raw)
    return int(value) if value.is_integer() else value


def _json_column(raw: Any) -> Any:
    """Decode a JSON-encoded TEXT column, tolerating already-decoded values."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def map_user(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    keys = row.keys()

    def col(name: str) -> Any:
        return row[name] if name in keys else None

    experience = col("experienceYears")
    return _compact({
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "avatar": row["avatar"],
        "title": row["title"],
        "department": row["department"],
        "targetRoleId": col("targetRoleId") or None,
        "managerId": col("managerId") or None,
        # JavaScript has one number type, so Number(8) serialises as `8` and
        # Number(9.5) as `9.5`. Python would emit `8.0` for the same REAL column,
        # a 2-byte difference in every user payload - so collapse integral values
        # back to int to match the Node output exactly.
        "experienceYears": _js_number(experience),
        "domain": col("domain") or None,
        "primaryRole": col("primaryRole") or None,
        "primarySkills": _json_column(col("primarySkills")),
    })


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #

def get_users() -> list[dict[str, Any]]:
    return [map_user(r) for r in query_all("SELECT * FROM users")]


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    return map_user(query_one("SELECT * FROM users WHERE id = ?", (user_id,)))


def find_user_by_identifier(identifier: str) -> dict[str, Any] | None:
    """Resolve by id, email, or a loose name match - the same lookup surface as
    the /api/auth/login handler in server.ts."""
    target = (identifier or "").strip().lower()
    if not target:
        return None
    for row in query_all("SELECT * FROM users"):
        if (
            row["id"].lower() == target
            or row["email"].lower() == target
            or target in row["name"].lower()
        ):
            return map_user(row)
    return None


def get_direct_reports(manager_id: str) -> list[dict[str, Any]]:
    rows = query_all("SELECT * FROM users WHERE managerId = ?", (manager_id,))
    return [map_user(r) for r in rows]


# --------------------------------------------------------------------------- #
# Credentials
#
# The bcrypt hash lives in a `passwordHash` column on `users`, added by a lazy
# ALTER TABLE in server-db.ts. It is deliberately never included in map_user(),
# matching getUserById() which excludes it from every API response.
# --------------------------------------------------------------------------- #

def get_user_password_hash(user_id: str) -> str | None:
    try:
        row = query_one("SELECT passwordHash FROM users WHERE id = ?", (user_id,))
    except sqlite3.OperationalError:
        # Column absent: the Node server has not run its migration yet.
        return None
    return (row["passwordHash"] or None) if row else None


def set_user_password(user_id: str, password_hash: str) -> None:
    execute(
        "UPDATE users SET passwordHash = ? WHERE id = ?", (password_hash, user_id)
    )


# --------------------------------------------------------------------------- #
# Reference data
# --------------------------------------------------------------------------- #

def get_skills() -> list[dict[str, Any]]:
    return [dict(r) for r in query_all("SELECT * FROM skills")]


def get_target_roles() -> list[dict[str, Any]]:
    """Roles with their required skills joined in, matching getTargetRoles()."""
    roles = query_all("SELECT * FROM target_roles")
    role_skills = query_all("SELECT * FROM target_role_skills")
    result = []
    for r in roles:
        result.append({
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "requiredSkills": [
                {"skillId": rs["skillId"], "minLevel": rs["minLevel"]}
                for rs in role_skills
                if rs["roleId"] == r["id"]
            ],
        })
    return result


def get_courses() -> list[dict[str, Any]]:
    rows = query_all("SELECT * FROM courses")
    return [
        _compact({
            "id": r["id"],
            "title": r["title"],
            "provider": r["provider"],
            "duration": r["duration"],
            "skillId": r["skillId"],
            "description": r["description"],
            "type": r["type"],
            "url": r["url"] or None,
            # Defaults mirror getCourses() in server-db.ts.
            "rating": r["rating"] or 4.9,
            "enrollmentCount": r["enrollmentCount"] or "180,000+ Learners",
            "lastUpdated": r["lastUpdated"] or "Updated June 2026",
            "isLatest2026": bool(r["isLatest2026"]) if r["isLatest2026"] is not None else True,
        })
        for r in rows
    ]


def get_user_skills(user_id: str) -> list[dict[str, Any]]:
    return [dict(r) for r in query_all(
        "SELECT * FROM user_skills WHERE userId = ?", (user_id,)
    )]


def get_current_level(user_id: str, skill_id: str) -> int:
    """Current level, defaulting to 1 when the pairing has no row yet."""
    row = query_one(
        "SELECT currentLevel FROM user_skills WHERE userId = ? AND skillId = ?",
        (user_id, skill_id),
    )
    return row["currentLevel"] if row else 1


def update_user_skill(
    user_id: str, skill_id: str, level: int, status: str | None = None
) -> list[dict[str, Any]]:
    """Upsert a user/skill pairing. New rows default to targetLevel 4 and
    status "learning", matching updateUserSkill() in server-db.ts."""
    exists = query_one(
        "SELECT 1 FROM user_skills WHERE userId = ? AND skillId = ?",
        (user_id, skill_id),
    )
    stamp = _now_date()

    if exists:
        if status:
            execute(
                """
                UPDATE user_skills SET currentLevel = ?, status = ?, lastUpdated = ?
                 WHERE userId = ? AND skillId = ?
                """,
                (level, status, stamp, user_id, skill_id),
            )
        else:
            execute(
                """
                UPDATE user_skills SET currentLevel = ?, lastUpdated = ?
                 WHERE userId = ? AND skillId = ?
                """,
                (level, stamp, user_id, skill_id),
            )
    else:
        execute(
            """
            INSERT INTO user_skills
                (userId, skillId, currentLevel, targetLevel, status, lastUpdated)
            VALUES (?, ?, ?, 4, ?, ?)
            """,
            (user_id, skill_id, level, status or "learning", stamp),
        )

    return get_user_skills(user_id)


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #

def _map_evidence(r: sqlite3.Row) -> dict[str, Any]:
    return _compact({
        "id": r["id"],
        "userId": r["userId"],
        "skillId": r["skillId"],
        "title": r["title"],
        "description": r["description"],
        "evidenceText": r["evidenceText"],
        "documentUrl": r["documentUrl"] or None,
        "status": r["status"],
        "submittedAt": r["submittedAt"],
        "reviewedBy": r["reviewedBy"] or None,
        "reviewComment": r["reviewComment"] or None,
        "reviewedAt": r["reviewedAt"] or None,
    })


def get_evidences() -> list[dict[str, Any]]:
    return [_map_evidence(r) for r in query_all("SELECT * FROM evidences")]


def get_evidence_by_id(evidence_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM evidences WHERE id = ?", (evidence_id,))
    return _map_evidence(row) if row else None


def submit_evidence(
    user_id: str,
    skill_id: str,
    title: str,
    description: str,
    evidence_text: str,
    document_url: str | None = None,
) -> dict[str, Any]:
    evidence_id = _random_id("ev_")
    execute(
        """
        INSERT INTO evidences
            (id, userId, skillId, title, description, evidenceText, documentUrl,
             status, submittedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """,
        (evidence_id, user_id, skill_id, title, description, evidence_text,
         document_url, _now_iso()),
    )
    # Side effect carried over from submitEvidence(): submitting proof moves the
    # skill into "practicing" at its current level. Omitting this would silently
    # desynchronise the skill status between the two backends.
    update_user_skill(user_id, skill_id, get_current_level(user_id, skill_id), "practicing")
    return get_evidence_by_id(evidence_id)


def review_evidence(
    evidence_id: str, reviewer_id: str, status: str, comment: str
) -> dict[str, Any] | None:
    if get_evidence_by_id(evidence_id) is None:
        return None
    execute(
        """
        UPDATE evidences
           SET status = ?, reviewedBy = ?, reviewComment = ?, reviewedAt = ?
         WHERE id = ?
        """,
        (status, reviewer_id, comment, _now_iso(), evidence_id),
    )
    updated = get_evidence_by_id(evidence_id)

    # Side effects from reviewEvidence(). Approving proof promotes the skill one
    # level (capped at 5) and marks it validated; anything else drops it back to
    # "learning" at its current level. Skipping this would leave skill levels
    # diverging between the two backends after the first manager review.
    skill = next(
        (s for s in get_user_skills(updated["userId"])
         if s["skillId"] == updated["skillId"]),
        None,
    )
    if skill:
        if status == "approved":
            update_user_skill(
                updated["userId"], updated["skillId"],
                min(5, skill["currentLevel"] + 1), "validated",
            )
        else:
            update_user_skill(
                updated["userId"], updated["skillId"],
                skill["currentLevel"], "learning",
            )

    return updated


# --------------------------------------------------------------------------- #
# Target role
# --------------------------------------------------------------------------- #

def update_target_role(user_id: str, role_id: str) -> dict[str, Any] | None:
    execute("UPDATE users SET targetRoleId = ? WHERE id = ?", (role_id, user_id))
    user = get_user_by_id(user_id)
    if not user:
        return None

    # Side effect from updateTargetRole(): choosing a role seeds the user's skill
    # rows for that role's requirements - new pairings start at level 1 with the
    # role's minLevel as target, existing ones just have their target raised.
    role_skills = query_all(
        "SELECT * FROM target_role_skills WHERE roleId = ?", (role_id,)
    )
    stamp = _now_date()
    for req in role_skills:
        exists = query_one(
            "SELECT 1 FROM user_skills WHERE userId = ? AND skillId = ?",
            (user_id, req["skillId"]),
        )
        if exists:
            execute(
                "UPDATE user_skills SET targetLevel = ? WHERE userId = ? AND skillId = ?",
                (req["minLevel"], user_id, req["skillId"]),
            )
        else:
            execute(
                """
                INSERT INTO user_skills
                    (userId, skillId, currentLevel, targetLevel, status, lastUpdated)
                VALUES (?, ?, 1, ?, 'not_started', ?)
                """,
                (user_id, req["skillId"], req["minLevel"], stamp),
            )

    return user


# --------------------------------------------------------------------------- #
# Project demands
# --------------------------------------------------------------------------- #

def _map_demand(r: sqlite3.Row) -> dict[str, Any]:
    return _compact({
        "id": r["id"],
        "projectName": r["projectName"],
        "customerName": r["customerName"],
        "businessUnit": r["businessUnit"],
        "projectDescription": r["projectDescription"],
        "rawJobDescription": r["rawJobDescription"] or None,
        "requiredSkills": _json_column(r["requiredSkills"]) or [],
        "preferredSkills": _json_column(r["preferredSkills"]) or [],
        "experienceRangeMin": r["experienceRangeMin"],
        "experienceRangeMax": r["experienceRangeMax"],
        "technologyStack": _json_column(r["technologyStack"]) or [],
        "resourcesRequired": r["resourcesRequired"],
        "clientInterviewDate": r["clientInterviewDate"],
        "expectedJoiningDate": r["expectedJoiningDate"],
        "projectPriority": r["projectPriority"],
        "location": r["location"],
        "domain": r["domain"],
        "employmentType": r["employmentType"],
        "additionalNotes": r["additionalNotes"] or None,
        "status": r["status"],
        "createdAt": r["createdAt"],
    })


def get_project_demands() -> list[dict[str, Any]]:
    rows = query_all("SELECT * FROM project_demands ORDER BY createdAt DESC")
    return [_map_demand(r) for r in rows]


def get_project_demand_by_id(demand_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM project_demands WHERE id = ?", (demand_id,))
    return _map_demand(row) if row else None


def create_project_demand(data: dict[str, Any]) -> dict[str, Any]:
    demand_id = data.get("id") or _random_id("OPP-")
    execute(
        """
        INSERT INTO project_demands (
            id, projectName, customerName, businessUnit, projectDescription,
            rawJobDescription, requiredSkills, preferredSkills, experienceRangeMin,
            experienceRangeMax, technologyStack, resourcesRequired,
            clientInterviewDate, expectedJoiningDate, projectPriority, location,
            domain, employmentType, additionalNotes, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            demand_id,
            data.get("projectName"), data.get("customerName"), data.get("businessUnit"),
            data.get("projectDescription", ""), data.get("rawJobDescription"),
            json.dumps(data.get("requiredSkills") or []),
            json.dumps(data.get("preferredSkills") or []),
            data.get("experienceRangeMin", 0), data.get("experienceRangeMax", 0),
            json.dumps(data.get("technologyStack") or []),
            data.get("resourcesRequired", 1),
            data.get("clientInterviewDate", ""), data.get("expectedJoiningDate", ""),
            data.get("projectPriority", "MEDIUM"), data.get("location", ""),
            data.get("domain", ""), data.get("employmentType", "Full-Time"),
            data.get("additionalNotes"), data.get("status", "OPEN"),
            data.get("createdAt") or _now_iso(),
        ),
    )
    return get_project_demand_by_id(demand_id)


# --------------------------------------------------------------------------- #
# Learning plans
# --------------------------------------------------------------------------- #

def _map_learning_step(r: sqlite3.Row) -> dict[str, Any]:
    keys = r.keys()

    def col(name: str, default: Any = None) -> Any:
        return r[name] if name in keys else default

    return _compact({
        "id": r["id"],
        "userId": r["userId"],
        "weekNumber": r["weekNumber"],
        "title": r["title"],
        "skillFocus": r["skillFocus"],
        "courseName": r["courseName"],
        "provider": r["provider"],
        "milestone": r["milestone"],
        "assessment": r["assessment"],
        "targetScore": r["targetScore"],
        "status": r["status"],
        "progressPercent": r["progressPercent"],
        # Defaults below mirror getLearningPlan(); the columns were added by later
        # ALTER TABLE migrations and are NULL on older rows.
        "learningType": col("learningType") or "in_depth",
        "estimatedDuration": col("estimatedDuration") or "1 hour",
        "phaseLabel": col("phaseLabel") or f"Phase {r['weekNumber']}",
        "targetDeadline": col("targetDeadline") or "2026-08-15",
        "deadlineType": col("deadlineType") or "client_interview",
        "quizScore": col("quizScore") or 0,
        "timeSpentMins": col("timeSpentMins") or 0,
        "completedAt": col("completedAt") or None,
        "demandId": col("demandId") or None,
        "purpose": col("purpose") or "career_growth",
    })


def get_learning_plan(user_id: str) -> list[dict[str, Any]]:
    rows = query_all(
        "SELECT * FROM learning_plans WHERE userId = ? ORDER BY weekNumber ASC",
        (user_id,),
    )
    return [_map_learning_step(r) for r in rows]


def update_learning_plan_week(
    step_id: str,
    status: str,
    progress_percent: int,
    quiz_score: int | None = None,
    time_spent_mins: int | None = None,
) -> list[dict[str, Any]]:
    sets = ["status = ?", "progressPercent = ?"]
    params: list[Any] = [status, progress_percent]

    if quiz_score is not None:
        sets.append("quizScore = ?")
        params.append(quiz_score)
    if time_spent_mins is not None:
        # Accumulates rather than overwrites, as in updateLearningPlanWeek().
        sets.append("timeSpentMins = timeSpentMins + ?")
        params.append(time_spent_mins)
    if status == "completed":
        sets.append("completedAt = ?")
        params.append(_now_date())

    params.append(step_id)
    execute(f"UPDATE learning_plans SET {', '.join(sets)} WHERE id = ?", tuple(params))

    row = query_one("SELECT userId FROM learning_plans WHERE id = ?", (step_id,))
    return get_learning_plan(row["userId"]) if row else []


def update_learning_plan_deadline(
    user_id: str, target_deadline: str, deadline_type: str | None = None
) -> list[dict[str, Any]]:
    execute(
        "UPDATE learning_plans SET targetDeadline = ?, deadlineType = ? WHERE userId = ?",
        (target_deadline, deadline_type or "client_interview", user_id),
    )
    return get_learning_plan(user_id)


def assign_flexible_learning_track(
    user_id: str,
    track_title: str,
    target_deadline: str,
    deadline_type: str,
    steps: list[dict[str, Any]],
    demand_id: str | None = None,
    purpose: str = "career_growth",
) -> list[dict[str, Any]]:
    """Replace the user's plan with a new track.

    Destructive by design - assignFlexibleLearningTrack() deletes the existing
    steps first, so reassigning a track discards prior progress.
    """
    execute("DELETE FROM learning_plans WHERE userId = ?", (user_id,))

    for idx, step in enumerate(steps, start=1):
        step_id = f"plan_{user_id}_{idx}_" + "".join(random.choices(_BASE36, k=5))
        execute(
            """
            INSERT INTO learning_plans (
                id, userId, weekNumber, title, skillFocus, courseName, provider,
                milestone, assessment, targetScore, status, progressPercent,
                learningType, estimatedDuration, phaseLabel, targetDeadline,
                deadlineType, quizScore, timeSpentMins, demandId, purpose
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            """,
            (
                step_id, user_id, idx,
                step.get("title"), step.get("skillFocus"), step.get("courseName"),
                step.get("provider"), step.get("milestone"), step.get("assessment"),
                step.get("targetScore"), step.get("learningType"),
                step.get("estimatedDuration"), step.get("phaseLabel"),
                target_deadline, deadline_type, demand_id, purpose,
            ),
        )

    return get_learning_plan(user_id)


def get_resource_learning_progress() -> list[dict[str, Any]]:
    """Per-employee learning roll-up for the manager / L&D tracker."""
    employees = [u for u in get_users() if u["role"] == "employee"]
    target_roles = get_target_roles()
    result = []

    for user in employees:
        steps = get_learning_plan(user["id"])
        total_steps = len(steps)
        completed = [s for s in steps if s["status"] == "completed"]
        in_progress = [s for s in steps if s["status"] == "in_progress"]

        overall = (
            js_round(sum(s["progressPercent"] for s in steps) / total_steps)
            if total_steps else 0
        )

        scored = [s for s in steps if (s.get("quizScore") or 0) > 0]
        if scored:
            avg_quiz = js_round(sum(s["quizScore"] for s in scored) / len(scored))
        else:
            # Assumed pass mark when steps are complete but unscored.
            avg_quiz = 82 if completed else 0

        status = "not_started"
        if total_steps and len(completed) == total_steps:
            status = "completed"
        elif completed or in_progress:
            status = "in_progress"

        role = next(
            (r for r in target_roles if r["id"] == user.get("targetRoleId")), None
        )

        result.append({
            "userId": user["id"],
            "userName": user["name"],
            "userTitle": user["title"],
            "userAvatar": user["avatar"],
            "department": user["department"],
            "trackName": f"{role['title'] if role else 'Custom Capability Track'} Fast-Track",
            "targetDeadline": steps[0]["targetDeadline"] if steps else "2026-08-15",
            "deadlineType": steps[0]["deadlineType"] if steps else "client_interview",
            "totalSteps": total_steps,
            "completedSteps": len(completed),
            "overallProgressPercent": overall,
            "averageQuizScore": avg_quiz,
            "totalTimeSpentMins": sum(s.get("timeSpentMins") or 0 for s in steps),
            "microCount": len([s for s in steps if s["learningType"] == "micro"]),
            "inDepthCount": len([s for s in steps if s["learningType"] == "in_depth"]),
            "bestPracticeCount": len([s for s in steps if s["learningType"] == "best_practice"]),
            "status": status,
            "lastActive": "Today",
            "steps": steps,
        })

    return result


# --------------------------------------------------------------------------- #
# Reminders
# --------------------------------------------------------------------------- #

def get_reminders(user_id: str | None = None) -> list[dict[str, Any]]:
    if user_id:
        rows = query_all(
            "SELECT * FROM reminders WHERE userId = ? ORDER BY createdAt DESC",
            (user_id,),
        )
    else:
        rows = query_all("SELECT * FROM reminders ORDER BY createdAt DESC")
    return [dict(r) for r in rows]


def create_reminder(
    user_id: str, target_role: str, type_: str, title: str, message: str
) -> dict[str, Any]:
    reminder_id = _random_id("rem_")
    execute(
        """
        INSERT INTO reminders
            (id, userId, targetRole, type, title, message, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)
        """,
        (reminder_id, user_id, target_role, type_, title, message, _now_iso()),
    )
    row = query_one("SELECT * FROM reminders WHERE id = ?", (reminder_id,))
    return dict(row) if row else {}


# --------------------------------------------------------------------------- #
# Post-training assessments, skill baselines and resume eligibility
#
# These three tables back the Client Resume Generator's gating: a resume can only
# be produced when a real learning track was completed, a manager explicitly
# signed off, and measurable skill growth exists. All of it is checked against
# persisted records, never against claims in the request body.
# --------------------------------------------------------------------------- #

def create_post_assessment(
    employee_id: str, demand_id: str | None, manager_id: str, narrative: str
) -> dict[str, Any]:
    assessment_id = f"pa_{employee_id}_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    created_at = _now_iso()
    execute(
        """
        INSERT INTO post_assessments
            (id, employeeId, demandId, managerId, narrative, status, createdAt)
        VALUES (?, ?, ?, ?, ?, 'pending_signoff', ?)
        """,
        (assessment_id, employee_id, demand_id, manager_id, narrative, created_at),
    )
    return _compact({
        "id": assessment_id,
        "employeeId": employee_id,
        "demandId": demand_id or None,
        "managerId": manager_id,
        "narrative": narrative,
        "status": "pending_signoff",
        "createdAt": created_at,
    })


def get_post_assessment(assessment_id: str) -> dict[str, Any] | None:
    row = query_one("SELECT * FROM post_assessments WHERE id = ?", (assessment_id,))
    return dict(row) if row else None


def get_latest_post_assessment(
    employee_id: str, demand_id: str | None = None
) -> dict[str, Any] | None:
    if demand_id:
        row = query_one(
            """
            SELECT * FROM post_assessments
             WHERE employeeId = ? AND demandId = ?
             ORDER BY createdAt DESC LIMIT 1
            """,
            (employee_id, demand_id),
        )
    else:
        row = query_one(
            """
            SELECT * FROM post_assessments
             WHERE employeeId = ? ORDER BY createdAt DESC LIMIT 1
            """,
            (employee_id,),
        )
    return dict(row) if row else None


def sign_off_post_assessment(
    assessment_id: str, signed_off_by: str, decision: str
) -> dict[str, Any] | None:
    if get_post_assessment(assessment_id) is None:
        return None
    execute(
        """
        UPDATE post_assessments
           SET status = ?, signedOffBy = ?, signedOffAt = ?
         WHERE id = ?
        """,
        (decision, signed_off_by, _now_iso(), assessment_id),
    )
    return get_post_assessment(assessment_id)


def capture_skill_baselines(user_id: str, demand_id: str) -> None:
    """Snapshot current levels as the "before" state for this demand.

    INSERT OR IGNORE, so a repeat handoff never resets the original baseline -
    otherwise measured growth would silently collapse to zero.
    """
    captured_at = _now_iso()
    for skill in get_user_skills(user_id):
        execute(
            """
            INSERT OR IGNORE INTO skill_baselines
                (userId, skillId, demandId, baselineLevel, capturedAt)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, skill["skillId"], demand_id, skill["currentLevel"], captured_at),
        )


def get_learning_step_owner_id(step_id: str) -> str | None:
    """Resolve a learning step to the user who owns it, so a route can authorize the
    write against that owner rather than trusting whoever sent the id."""
    if not step_id:
        return None
    row = query_one("SELECT userId FROM learning_plans WHERE id = ?", (step_id,))
    return row["userId"] if row else None


def get_active_shortlist(user_id: str) -> dict[str, Any] | None:
    """An employee counts as shortlisted once a manager hands them to a demand: that
    handoff is exactly what writes their skill baselines for it, so the most recent
    capture identifies their active opportunity. Deriving it this way avoids a second
    source of truth that could disagree with the handoff itself."""
    row = query_one(
        """
        SELECT demandId, MAX(capturedAt) AS capturedAt
        FROM skill_baselines
        WHERE userId = ?
        GROUP BY demandId
        ORDER BY capturedAt DESC
        LIMIT 1
        """,
        (user_id,),
    )
    if not row:
        return None
    demand = get_project_demand_by_id(row["demandId"])
    # A demand can be deleted after a handoff; treat the dangling baseline as no
    # shortlist rather than surfacing a half-populated banner.
    if not demand:
        return None
    return {"demand": demand, "shortlistedAt": row["capturedAt"]}


def compute_motivation_scores(user_id: str) -> dict[str, int]:
    """Skill measures capability; Will measures motivation/drive - they must stay
    independent for the 2x2 matrix to mean anything. Will is a transparent blend of
    behavioural signals already recorded elsewhere in the app:
        40% learning engagement  - plan completion, quiz performance, time invested
        30% evidence initiative  - submissions made, approved OR pending
        20% goal progress        - how far skills are driven toward their targets
        10% goal commitment      - whether a target role has actively been chosen
    Engagement is the distinct LMS course-completion percentage. Both derive only from
    real rows, so they reconcile with the employee's own learning plan and evidence.
    """
    skills = get_user_skills(user_id)
    plans = get_learning_plan(user_id)
    evidences = [e for e in get_evidences() if e["userId"] == user_id]
    user = get_user_by_id(user_id)

    total_steps = len(plans)
    completed_steps = sum(1 for p in plans if p["status"] == "completed")
    completion_ratio = completed_steps / total_steps if total_steps else 0.0

    completed_with_quiz = [
        p for p in plans if p["status"] == "completed" and (p.get("quizScore") or 0) > 0
    ]
    avg_quiz = (
        sum(p.get("quizScore") or 0 for p in completed_with_quiz) / len(completed_with_quiz)
        if completed_with_quiz else 0.0
    )

    minutes = sum(p.get("timeSpentMins") or 0 for p in plans)
    time_norm = min(1.0, minutes / 300)  # ~5h of study reads as fully invested

    learning = 0.5 * completion_ratio * 100 + 0.3 * avg_quiz + 0.2 * time_norm * 100
    evidence_initiative = min(100, len(evidences) * 30)

    with_target = [s for s in skills if s["targetLevel"] > 0]
    progress = (
        sum(min(1.0, s["currentLevel"] / s["targetLevel"]) for s in with_target)
        / len(with_target) * 100
        if with_target else 0.0
    )

    commitment = 100 if (user or {}).get("targetRoleId") else 0

    will_score = js_round(max(0.0, min(100.0,
        0.40 * learning + 0.30 * evidence_initiative + 0.20 * progress + 0.10 * commitment)))
    return {"willScore": will_score, "engagementScore": js_round(completion_ratio * 100)}


def get_workforce_metrics() -> dict[str, Any]:
    """Organisation-wide metrics, computed from real rows.

    The L&D dashboard previously displayed these as hard-coded literals (a 78.4%
    readiness index, a "+12.2% vs last month" delta, "48 active enrollments" in a
    20-person org). Anything genuinely derivable is derived here; anything that needs
    history the system does not keep - month-over-month deltas - is not invented.
    """
    employees = [u for u in get_users() if u["role"] == "employee"]
    evidences = get_evidences()
    skills_by_id = {s["id"]: s["name"] for s in get_skills()}

    readiness_total = 0
    active_learners = 0
    gap_counts: dict[str, int] = {}

    for emp in employees:
        user_skills = get_user_skills(emp["id"])
        # Same readiness formula the manager team view uses, so org and team agree.
        total_levels = sum(s["currentLevel"] for s in user_skills)
        avg_level = (total_levels / (len(user_skills) * 5)) * 100 if user_skills else 0
        approved = sum(
            1 for e in evidences if e["userId"] == emp["id"] and e["status"] == "approved"
        )
        readiness_total += min(100, js_round(avg_level + approved * 5))

        # "Actively upskilling" = at least one learning step under way or finished.
        plans = get_learning_plan(emp["id"])
        if any(p["status"] in ("in_progress", "completed") for p in plans):
            active_learners += 1

        for s in user_skills:
            if s["targetLevel"] > 0 and s["currentLevel"] < s["targetLevel"]:
                gap_counts[s["skillId"]] = gap_counts.get(s["skillId"], 0) + 1

    top_skill_gap = None
    if gap_counts:
        skill_id, count = max(gap_counts.items(), key=lambda kv: kv[1])
        top_skill_gap = {
            "skillName": skills_by_id.get(skill_id, skill_id),
            "employeesBelowTarget": count,
        }

    return {
        "employeeCount": len(employees),
        "readinessIndex": js_round(readiness_total / len(employees)) if employees else 0,
        "activeLearners": active_learners,
        "verifiedEvidence": sum(1 for e in evidences if e["status"] == "approved"),
        "topSkillGap": top_skill_gap,
    }


def get_skill_growth(user_id: str, demand_id: str) -> list[dict[str, Any]]:
    baselines = query_all(
        "SELECT skillId, baselineLevel FROM skill_baselines WHERE userId = ? AND demandId = ?",
        (user_id, demand_id),
    )
    current_skills = get_user_skills(user_id)
    skills_dict = get_skills()

    growth = []
    for b in baselines:
        current = next(
            (s for s in current_skills if s["skillId"] == b["skillId"]), None
        )
        name = next(
            (s["name"] for s in skills_dict if s["id"] == b["skillId"]), b["skillId"]
        )
        growth.append({
            "skillId": b["skillId"],
            "skillName": name,
            "baselineLevel": b["baselineLevel"],
            "currentLevel": current["currentLevel"] if current else b["baselineLevel"],
        })
    return growth


def check_client_resume_eligibility(employee_id: str, demand_id: str) -> dict[str, Any]:
    reasons: list[str] = []

    all_steps = get_learning_plan(employee_id)
    demand_steps = [
        s for s in all_steps
        if s.get("demandId") == demand_id and s.get("purpose") == "project_hiring"
    ]
    training_complete = bool(demand_steps) and all(
        s["status"] == "completed" for s in demand_steps
    )
    if not demand_steps:
        reasons.append(
            "No project-hiring learning track has been assigned for this employee "
            "and this demand yet."
        )
    elif not training_complete:
        remaining = len([s for s in demand_steps if s["status"] != "completed"])
        reasons.append(
            f"{remaining} of {len(demand_steps)} learning track step(s) are not yet completed."
        )

    latest = get_latest_post_assessment(employee_id, demand_id)
    assessment_cleared = bool(latest) and latest["status"] == "cleared"
    if not latest:
        reasons.append(
            "No post-training GROW assessment has been generated for this employee "
            "and this demand yet."
        )
    elif latest["status"] == "pending_signoff":
        reasons.append(
            "The post-training assessment has been generated but not yet signed off "
            "by a manager."
        )
    elif latest["status"] == "not_ready":
        reasons.append(
            "The most recent post-training assessment was marked 'not ready' by a manager."
        )

    growth_detail = get_skill_growth(employee_id, demand_id)
    growth_identified = bool(growth_detail) and any(
        g["currentLevel"] > g["baselineLevel"] for g in growth_detail
    )
    if not growth_detail:
        reasons.append(
            "No skill baseline was captured for this employee and this demand "
            "(handoff may not have run)."
        )
    elif not growth_identified:
        reasons.append(
            "No measurable skill growth was found since this employee was matched "
            "to this demand."
        )

    return {
        "eligible": training_complete and assessment_cleared and growth_identified,
        "trainingComplete": training_complete,
        "assessmentCleared": assessment_cleared,
        "skillGrowthIdentified": growth_identified,
        "reasons": reasons,
        "growthDetail": growth_detail,
    }
