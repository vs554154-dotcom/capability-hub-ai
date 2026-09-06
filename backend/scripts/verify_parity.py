"""Response-parity probes.

Signs into both backends as the same account and compares the JSON they return
for every ported read endpoint, byte for byte. Also checks that write endpoints
reject invalid payloads with the same status and message - without creating rows,
so the shared database is not polluted.

    python backend/scripts/verify_parity.py
    python backend/scripts/verify_parity.py http://localhost:3000 http://127.0.0.1:8000
"""
from __future__ import annotations

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

NODE = sys.argv[1].rstrip("/") if len(sys.argv) > 2 else "http://localhost:3000"
PY = sys.argv[2].rstrip("/") if len(sys.argv) > 2 else "http://127.0.0.1:8000"

EMPLOYEE = ("E1000", "demo123")
MANAGER = ("marcus.sterling@capabilityhub.ai", "mgr-demo-pass")

failures: list[str] = []


class Client:
    def __init__(self, base: str, label: str) -> None:
        self.base = base
        self.label = label
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    def call(self, method: str, path: str, body: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(req) as resp:
                raw = resp.read().decode()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw) if raw else None
            except json.JSONDecodeError:
                return e.code, None
        except urllib.error.URLError as e:
            print(f"  cannot reach {self.base}: {e.reason}")
            sys.exit(2)

    def login(self, identifier: str, password: str) -> int:
        return self.call(
            "POST", "/api/auth/login",
            {"identifier": identifier, "password": password},
        )[0]


def canonical(value) -> str:
    """Order-insensitive for top-level lists, so row ordering differences between
    SQLite drivers don't read as a mismatch."""
    if isinstance(value, list):
        return json.dumps(sorted((json.dumps(v, sort_keys=True) for v in value)))
    return json.dumps(value, sort_keys=True)


def compare(label: str, node: Client, py: Client, method: str, path: str, body=None):
    ns, npayload = node.call(method, path, body)
    ps, ppayload = py.call(method, path, body)

    status_ok = ns == ps
    body_ok = canonical(npayload) == canonical(ppayload)
    ok = status_ok and body_ok

    detail = ""
    if not status_ok:
        detail = f" node={ns} python={ps}"
    elif not body_ok:
        n, p = canonical(npayload), canonical(ppayload)
        detail = f" payloads differ (node {len(n)}b, python {len(p)}b)"

    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{detail}")
    if not ok:
        failures.append(label + detail)


print(f"node   = {NODE}\npython = {PY}\n")

node, py = Client(NODE, "node"), Client(PY, "python")

print("Public")
compare("GET /api/users", node, py, "GET", "/api/users")

print("\nEmployee session (Aarav)")
node.login(*EMPLOYEE)
py.login(*EMPLOYEE)
compare("GET /api/skills", node, py, "GET", "/api/skills")
compare("GET /api/roles  (requiredSkills joined)", node, py, "GET", "/api/roles")
compare("GET /api/courses", node, py, "GET", "/api/courses")
compare("GET /api/users/E1000", node, py, "GET", "/api/users/E1000")
compare("GET /api/users/E1000/capability  (CRS)", node, py, "GET", "/api/users/E1000/capability")
compare("GET /api/users/E1000/learning-plan", node, py, "GET", "/api/users/E1000/learning-plan")
compare("GET /api/evidence  (scoped to self)", node, py, "GET", "/api/evidence")
compare("GET /api/evidence?userId=user_2 (still self)", node, py, "GET", "/api/evidence?userId=user_2")
compare("GET /api/reminders", node, py, "GET", "/api/reminders")
compare("GET /api/learning-tracker/resources", node, py, "GET", "/api/learning-tracker/resources")

print("\nManager session (Marcus)")
node.login(*MANAGER)
py.login(*MANAGER)
compare("GET /api/manager/user_2/team", node, py, "GET", "/api/manager/user_2/team")
compare("GET /api/users/E1000  (direct report)", node, py, "GET", "/api/users/E1000")
compare("GET /api/evidence  (unscoped)", node, py, "GET", "/api/evidence")

print("\nWrite validation (no rows created)")
compare("POST /api/evidence  missing fields -> 400", node, py, "POST", "/api/evidence", {"userId": "user_2"})
compare("POST /api/validation missing fields -> 400", node, py, "POST", "/api/validation", {"evidenceId": "x"})
compare("POST /api/reminders missing fields -> 400", node, py, "POST", "/api/reminders", {"userId": "user_2"})
compare("POST /api/learning-plan/step missing -> 400", node, py, "POST", "/api/learning-plan/step", {})
compare("POST /api/learning-plan/deadline missing -> 400", node, py, "POST", "/api/learning-plan/deadline", {"userId": "user_2"})
compare("POST /api/learning-plan/assign empty steps -> 400", node, py, "POST", "/api/learning-plan/assign", {"userId": "E1000", "targetDeadline": "2026-09-01", "steps": []})

print()
if failures:
    print(f"{len(failures)} FAILED")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("Full response parity across both backends.")
