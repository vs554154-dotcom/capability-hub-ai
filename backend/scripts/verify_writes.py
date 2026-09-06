"""Write-path parity probes.

The read suites deliberately avoid mutating the shared database, which left the
riskiest ported logic untested: the *side effects* on user_skills that fire when
evidence is submitted and reviewed.

    submit  -> skill moves to "practicing" at its current level
    approve -> skill promotes by one level (capped at 5) and becomes "validated"
    reject  -> skill drops back to "learning" at its current level

This runs the identical sequence against each backend, snapshotting and restoring
the affected rows around each run, so the database is left exactly as found.

    python backend/scripts/verify_writes.py
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

SUBJECT = "E1000"                       # Aarav - Marcus (user_2) is his manager
REVIEWER = "user_2"
EMP_CREDS = {"identifier": SUBJECT, "password": "demo123"}
MGR_CREDS = {"identifier": "marcus.sterling@capabilityhub.ai", "password": "mgr-demo-pass"}

PROMOTABLE = "sk_16"                    # Spring Boot, level 4 -> expect 5
CAPPED = "sk_15"                        # Java, already level 5 -> must stay 5
REJECTED = "sk_17"                      # React, level 4 -> expect "learning", level unchanged

failures: list[str] = []


# --------------------------------------------------------------------------- #
# Database snapshot / restore
# --------------------------------------------------------------------------- #

def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def snapshot() -> dict:
    with connect() as c:
        skills = [dict(r) for r in c.execute(
            "SELECT * FROM user_skills WHERE userId = ?", (SUBJECT,)
        )]
        evidence_ids = [r["id"] for r in c.execute(
            "SELECT id FROM evidences WHERE userId = ?", (SUBJECT,)
        )]
    return {"skills": skills, "evidence_ids": evidence_ids}


def restore(snap: dict) -> None:
    with connect() as c:
        # Remove any evidence this test created.
        placeholders = ",".join("?" * len(snap["evidence_ids"])) or "''"
        c.execute(
            f"DELETE FROM evidences WHERE userId = ? AND id NOT IN ({placeholders})",
            (SUBJECT, *snap["evidence_ids"]),
        )
        # Reset the skill rows to their captured values.
        c.execute("DELETE FROM user_skills WHERE userId = ?", (SUBJECT,))
        for s in snap["skills"]:
            cols = ",".join(s.keys())
            marks = ",".join("?" * len(s))
            c.execute(
                f"INSERT INTO user_skills ({cols}) VALUES ({marks})", tuple(s.values())
            )
        c.commit()


def skill_state(skill_id: str) -> dict | None:
    with connect() as c:
        r = c.execute(
            "SELECT currentLevel, status FROM user_skills WHERE userId = ? AND skillId = ?",
            (SUBJECT, skill_id),
        ).fetchone()
    return dict(r) if r else None


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

class Client:
    def __init__(self, base: str) -> None:
        self.base = base
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    def call(self, method: str, path: str, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(req) as r:
                raw = r.read().decode()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, None
        except urllib.error.URLError as e:
            print("  cannot reach " + self.base + ": " + str(e.reason))
            sys.exit(2)


def run_sequence(base: str, label: str) -> dict:
    """Submit -> approve -> (capped) approve -> reject, recording skill state."""
    print("\n" + label + "  (" + base + ")")
    emp, mgr = Client(base), Client(base)
    emp.call("POST", "/api/auth/login", EMP_CREDS)
    mgr.call("POST", "/api/auth/login", MGR_CREDS)

    result: dict = {}

    def submit(skill_id: str, title: str) -> str | None:
        status, body = emp.call("POST", "/api/evidence", {
            "userId": SUBJECT, "skillId": skill_id, "title": title,
            "description": "write-path probe", "evidenceText": "probe body",
        })
        if status != 201:
            failures.append(label + " submit " + skill_id + " -> " + str(status))
            print("    [FAIL] submit " + skill_id + " -> " + str(status))
            return None
        return body["evidence"]["id"]

    def review(evidence_id: str, decision: str) -> None:
        status, _ = mgr.call("POST", "/api/validation", {
            "evidenceId": evidence_id, "reviewerId": REVIEWER,
            "status": decision, "comment": "probe review",
        })
        if status != 200:
            failures.append(label + " review -> " + str(status))
            print("    [FAIL] review -> " + str(status))

    # 1. submit only -> practicing, level unchanged
    ev1 = submit(PROMOTABLE, "probe promote")
    result["after_submit"] = skill_state(PROMOTABLE)
    print("    after submit    " + PROMOTABLE + ": " + str(result["after_submit"]))

    # 2. approve -> level + 1, validated
    if ev1:
        review(ev1, "approved")
    result["after_approve"] = skill_state(PROMOTABLE)
    print("    after approve   " + PROMOTABLE + ": " + str(result["after_approve"]))

    # 3. approve on a level-5 skill -> must stay 5
    ev2 = submit(CAPPED, "probe cap")
    if ev2:
        review(ev2, "approved")
    result["after_cap"] = skill_state(CAPPED)
    print("    after cap       " + CAPPED + ": " + str(result["after_cap"]))

    # 4. reject -> learning, level unchanged
    ev3 = submit(REJECTED, "probe reject")
    if ev3:
        review(ev3, "revision_requested")
    result["after_reject"] = skill_state(REJECTED)
    print("    after reject    " + REJECTED + ": " + str(result["after_reject"]))

    return result


print("Subject: " + SUBJECT + "   database: " + str(DB))
snap = snapshot()
print("Snapshot: " + str(len(snap["skills"])) + " skill rows, "
      + str(len(snap["evidence_ids"])) + " existing evidence rows")

before = {sid: skill_state(sid) for sid in (PROMOTABLE, CAPPED, REJECTED)}
print("Baseline: " + json.dumps(before))

node_result = run_sequence(NODE, "NODE")
restore(snap)

py_result = run_sequence(PY, "PYTHON")
restore(snap)

print("\nRestored. Verifying the database is back to baseline:")
after = {sid: skill_state(sid) for sid in (PROMOTABLE, CAPPED, REJECTED)}
clean = after == before
with connect() as c:
    leftover = c.execute(
        "SELECT COUNT(*) FROM evidences WHERE userId = ?", (SUBJECT,)
    ).fetchone()[0]
print("  skill rows match baseline : " + str(clean))
print("  evidence rows: " + str(leftover) + " (baseline "
      + str(len(snap["evidence_ids"])) + ")")
if not clean or leftover != len(snap["evidence_ids"]):
    failures.append("database not restored cleanly")

print("\nExpected semantics vs observed:")
expectations = [
    ("submit  -> practicing, level unchanged", "after_submit",
     {"currentLevel": before[PROMOTABLE]["currentLevel"], "status": "practicing"}),
    ("approve -> level +1, validated", "after_approve",
     {"currentLevel": before[PROMOTABLE]["currentLevel"] + 1, "status": "validated"}),
    ("approve at 5 -> stays 5", "after_cap",
     {"currentLevel": 5, "status": "validated"}),
    ("reject  -> learning, level unchanged", "after_reject",
     {"currentLevel": before[REJECTED]["currentLevel"], "status": "learning"}),
]
for desc, key, expected in expectations:
    n_ok = node_result.get(key) == expected
    p_ok = py_result.get(key) == expected
    match = node_result.get(key) == py_result.get(key)
    ok = n_ok and p_ok and match
    print("  [" + ("PASS" if ok else "FAIL") + "] " + desc)
    if not ok:
        print("        expected " + str(expected))
        print("        node     " + str(node_result.get(key)))
        print("        python   " + str(py_result.get(key)))
        failures.append(desc)

print()
if failures:
    print(str(len(failures)) + " FAILED")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("Write-path side effects identical on both backends; database restored.")
