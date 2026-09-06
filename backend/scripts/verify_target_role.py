"""Target-role write-path parity probe.

updateTargetRole() in server-db.ts is not a simple column update: selecting a role
also seeds the user's skill rows for that role's requirements - inserting missing
pairings at level 1 with the role's minLevel as target, and raising targetLevel on
pairings that already exist.

That side effect is easy to miss when porting, so it gets its own check. Snapshots
and restores the affected rows, leaving the database as found.

    python backend/scripts/verify_target_role.py
"""
from __future__ import annotations

import http.cookiejar
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DB = REPO / "capability-hub.db"

NODE = "http://localhost:3000"
PY = "http://127.0.0.1:8000"

SUBJECT = "E1000"
EMP_CREDS = {"identifier": SUBJECT, "password": "demo123"}

failures: list[str] = []


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def snapshot() -> dict:
    with connect() as c:
        skills = [dict(r) for r in c.execute(
            "SELECT * FROM user_skills WHERE userId = ?", (SUBJECT,)
        )]
        role = c.execute(
            "SELECT targetRoleId FROM users WHERE id = ?", (SUBJECT,)
        ).fetchone()["targetRoleId"]
    return {"skills": skills, "targetRoleId": role}


def restore(snap: dict) -> None:
    with connect() as c:
        c.execute("DELETE FROM user_skills WHERE userId = ?", (SUBJECT,))
        for s in snap["skills"]:
            cols = ",".join(s.keys())
            marks = ",".join("?" * len(s))
            c.execute(
                f"INSERT INTO user_skills ({cols}) VALUES ({marks})", tuple(s.values())
            )
        c.execute(
            "UPDATE users SET targetRoleId = ? WHERE id = ?",
            (snap["targetRoleId"], SUBJECT),
        )
        c.commit()


def skill_map() -> dict[str, dict]:
    with connect() as c:
        return {
            r["skillId"]: {"currentLevel": r["currentLevel"],
                           "targetLevel": r["targetLevel"],
                           "status": r["status"]}
            for r in c.execute(
                "SELECT skillId, currentLevel, targetLevel, status "
                "FROM user_skills WHERE userId = ?", (SUBJECT,)
            )
        }


def role_requirements(role_id: str) -> dict[str, int]:
    with connect() as c:
        return {
            r["skillId"]: r["minLevel"]
            for r in c.execute(
                "SELECT skillId, minLevel FROM target_role_skills WHERE roleId = ?",
                (role_id,),
            )
        }


def call(base: str, opener, method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, None
    except urllib.error.URLError as e:
        print("  cannot reach " + base + ": " + str(e.reason))
        sys.exit(2)


def run(base: str, label: str, new_role: str) -> dict:
    print("\n" + label + "  (" + base + ")")
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    call(base, opener, "POST", "/api/auth/login", EMP_CREDS)

    status, _ = call(
        base, opener, "POST", "/api/users/" + SUBJECT + "/target-role",
        {"roleId": new_role},
    )
    if status != 200:
        failures.append(label + " target-role -> " + str(status))
        print("    [FAIL] POST target-role -> " + str(status))
        return {}

    after = skill_map()
    reqs = role_requirements(new_role)
    seeded = {k: v for k, v in after.items() if k in reqs}
    print("    role " + new_role + " requires " + str(len(reqs)) + " skills; "
          + str(len(seeded)) + " present on the user afterwards")
    for sid in sorted(reqs):
        print("      " + sid + " minLevel=" + str(reqs[sid]) + " -> " + str(after.get(sid)))
    return after


snap = snapshot()
print("Subject " + SUBJECT + "  current target role: " + str(snap["targetRoleId"]))
print("Baseline skill rows: " + str(len(snap["skills"])))

# role_2 (AI Solutions Architect) differs from the seeded role_1, so its
# requirements exercise both the insert and the raise-target branches.
NEW_ROLE = "role_2"
reqs = role_requirements(NEW_ROLE)
baseline = skill_map()
missing_before = [s for s in reqs if s not in baseline]
print("Role " + NEW_ROLE + " requires " + str(len(reqs)) + " skills, of which "
      + str(len(missing_before)) + " are absent from the user right now")

node_after = run(NODE, "NODE", NEW_ROLE)
restore(snap)

py_after = run(PY, "PYTHON", NEW_ROLE)
restore(snap)

print("\nRestored. Database back to baseline: "
      + str(skill_map() == baseline
            and snapshot()["targetRoleId"] == snap["targetRoleId"]))

print("\nResults:")
all_seeded_node = all(s in node_after for s in reqs)
all_seeded_py = all(s in py_after for s in reqs)
identical = node_after == py_after

for label, cond in [
    ("Node seeded every required skill", all_seeded_node),
    ("Python seeded every required skill", all_seeded_py),
    ("Resulting skill tables identical", identical),
]:
    print("  [" + ("PASS" if cond else "FAIL") + "] " + label)
    if not cond:
        failures.append(label)

if not identical:
    only_node = {k: v for k, v in node_after.items() if py_after.get(k) != v}
    only_py = {k: v for k, v in py_after.items() if node_after.get(k) != v}
    print("    node-only/differing : " + str(only_node))
    print("    python-only/differing: " + str(only_py))

print()
if failures:
    print(str(len(failures)) + " FAILED")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("Target-role seeding identical on both backends; database restored.")
