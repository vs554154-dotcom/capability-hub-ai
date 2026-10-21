"""Authorization parity probes.

Runs the same checks that were used to verify the Node backend's role hierarchy,
against whichever backend is listening. The point is that authority comes from the
session cookie alone - never from an id in the URL or body.

    python backend/scripts/verify_auth.py                  # defaults to :8000
    python backend/scripts/verify_auth.py http://localhost:3000   # the Node server

Exits non-zero if any expectation fails.
"""
from __future__ import annotations

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"

EMPLOYEE_ID = "E1000"
EMPLOYEE_PASSWORD = "demo123"
MANAGER_EMAIL = "marcus.sterling@capabilityhub.ai"
MANAGER_PASSWORD = "mgr-demo-pass"
MANAGER_ID = "user_2"
OTHER_MANAGER_ID = "mgr_3"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

failures: list[str] = []


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | None]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return e.code, None
    except urllib.error.URLError as e:
        print(f"  cannot reach {BASE}: {e.reason}")
        sys.exit(2)


def expect(label: str, actual: int, wanted: int) -> None:
    ok = actual == wanted
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: {actual} (expected {wanted})")
    if not ok:
        failures.append(f"{label}: got {actual}, expected {wanted}")


print(f"Probing {BASE}\n")

print("Signed out")
call("POST", "/api/auth/logout")
expect("bare userId as a manager is refused", call("POST", "/api/auth/login", {"userId": MANAGER_ID})[0], 400)
expect("skills require a session", call("GET", "/api/skills")[0], 401)
expect("staff directory needs a session", call("GET", "/api/users")[0], 401)
expect("directory head-count stays public", call("GET", "/api/directory/summary")[0], 200)

print("\nEmployee session")
status, payload = call("POST", "/api/auth/login", {"identifier": EMPLOYEE_ID, "password": EMPLOYEE_PASSWORD})
expect("employee logs in with a credential", status, 200)
if isinstance(payload, dict) and payload.get("user"):
    print(f"         -> {payload['user']['name']} / {payload['user']['role']}")
expect("reads own capability", call("GET", f"/api/users/{EMPLOYEE_ID}/capability")[0], 200)
expect("blocked from manager's team", call("GET", f"/api/manager/{MANAGER_ID}/team")[0], 403)
expect("blocked from manager's profile", call("GET", f"/api/users/{MANAGER_ID}")[0], 403)
expect("blocked from manager's capability", call("GET", f"/api/users/{MANAGER_ID}/capability")[0], 403)

print("\nManager session")
call("POST", "/api/auth/logout")
status, payload = call("POST", "/api/auth/login", {"identifier": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
expect("manager logs in with a credential", status, 200)
expect("reads own team", call("GET", f"/api/manager/{MANAGER_ID}/team")[0], 200)
expect("reads a direct report", call("GET", f"/api/users/{EMPLOYEE_ID}")[0], 200)
expect("blocked from another manager's team", call("GET", f"/api/manager/{OTHER_MANAGER_ID}/team")[0], 403)
expect("blocked from another manager's capability", call("GET", f"/api/users/{OTHER_MANAGER_ID}/capability")[0], 403)

print()
if failures:
    print(f"{len(failures)} FAILED")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("All authorization probes passed.")
