"""The six authorization scenarios, run against a live server.

Written against the brief's Priority 2 list. Each scenario asserts server-side
enforcement only - the UI is never consulted, so a passing run proves the API
holds even if every client-side guard were bypassed.

    python backend/scripts/verify_authz_scenarios.py                       # :8000
    python backend/scripts/verify_authz_scenarios.py https://staging.example.com
    python backend/scripts/verify_authz_scenarios.py <url> --expect-demo-hole

--expect-demo-hole inverts scenario 5a, for demonstrating that DEMO_MODE=true
reopens bare-userId authentication. Used to prove the flag is the real fix.
"""
from __future__ import annotations

import http.cookiejar  # noqa: F401 (kept for reference; manual cookie handling below)
import json
import sys
import urllib.error
import urllib.request

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = (args[0] if args else "http://localhost:8000").rstrip("/")
EXPECT_DEMO_HOLE = "--expect-demo-hole" in sys.argv

EMPLOYEE = {"identifier": "E1000", "password": "demo123"}          # Aarav, reports to user_2
MANAGER = {"identifier": "marcus.sterling@capabilityhub.ai",
           "password": "mgr-demo-pass"}                            # Marcus = user_2
LEADERSHIP = {"identifier": "david.vance@capabilityhub.ai",
              "password": "exec-demo-pass"}                        # David = user_4
EMP_ID = "E1000"
MGR_ID = "user_2"
FOREIGN_EMP = "E1002"      # Rohan - reports to mgr_3, NOT to Marcus
FOREIGN_MGR = "mgr_3"

results: list[tuple[str, bool, str]] = []


class Session:
    """Manual cookie handling.

    Under NODE_ENV=production the session cookie is issued Secure + SameSite=None.
    Python's http.cookiejar refuses to *store* a Secure cookie received over
    http://, so an automatic jar silently drops it and every post-login request
    401s - a client-side artefact that looks exactly like broken authorization.
    Capturing and replaying the cookie by hand removes that false signal, so the
    production bundle can be tested under its real cookie policy.
    """

    def __init__(self) -> None:
        self.opener = urllib.request.build_opener()
        self.cookie: str | None = None

    def call(self, method: str, path: str, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        if data:
            req.add_header("Content-Type", "application/json")
        if self.cookie:
            req.add_header("Cookie", self.cookie)
        # On an HTTPS deploy (NODE_ENV=production or an https APP_URL) the server
        # issues the session cookie as Secure + SameSite=None. Over plain HTTP that cookie is
        # never sent, so a production build tested locally would 401 on every call
        # after login. A TLS-terminating proxy forwards this header; sending it
        # here reproduces that, so the production bundle can be
        # exercised under production cookie policy. Harmless in dev (secure=false).
        req.add_header("X-Forwarded-Proto", "https")
        try:
            with self.opener.open(req, timeout=30) as r:
                self._capture(r)
                raw = r.read().decode()
                return r.status, (json.loads(raw) if raw.startswith(("{", "[")) else raw)
        except urllib.error.HTTPError as e:
            self._capture(e)
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, raw[:80]
        except urllib.error.URLError as e:
            print("  cannot reach " + BASE + ": " + str(e.reason))
            sys.exit(2)

    def _capture(self, response) -> None:
        for header in response.headers.get_all("Set-Cookie") or []:
            name_value = header.split(";", 1)[0].strip()
            if name_value.startswith("chub_sid="):
                self.cookie = name_value


def expect(label: str, actual: int, allowed, note: str = "") -> None:
    allowed_list = allowed if isinstance(allowed, (list, tuple)) else [allowed]
    ok = actual in allowed_list
    results.append((label, ok, str(actual)))
    want = "/".join(str(a) for a in allowed_list)
    print("    [" + ("PASS" if ok else "FAIL") + "] " + label
          + "  -> " + str(actual) + " (want " + want + ")" + (("  " + note) if note else ""))


print("Target: " + BASE)
print("Mode  : " + ("expecting DEMO_MODE hole OPEN" if EXPECT_DEMO_HOLE
                    else "expecting DEMO_MODE closed") + "\n")

# --------------------------------------------------------------------------- #
print("SCENARIO 1 - employee accessing employee features (must succeed)")
emp = Session()
s, b = emp.call("POST", "/api/auth/login", EMPLOYEE)
expect("employee logs in with credentials", s, 200)
if isinstance(b, dict) and b.get("user"):
    print("           signed in as " + b["user"]["name"] + " / " + b["user"]["role"])
expect("reads own profile", emp.call("GET", "/api/users/" + EMP_ID)[0], 200)
expect("reads own capability", emp.call("GET", "/api/users/" + EMP_ID + "/capability")[0], 200)
expect("reads own learning plan", emp.call("GET", "/api/users/" + EMP_ID + "/learning-plan")[0], 200)
expect("reads own evidence", emp.call("GET", "/api/evidence")[0], 200)
expect("reads shared catalogues", emp.call("GET", "/api/skills")[0], 200)

# --------------------------------------------------------------------------- #
print("\nSCENARIO 2 - manager accessing manager features (must succeed)")
mgr = Session()
s, b = mgr.call("POST", "/api/auth/login", MANAGER)
expect("manager logs in with credentials", s, 200)
if isinstance(b, dict) and b.get("user"):
    print("           signed in as " + b["user"]["name"] + " / " + b["user"]["role"])
expect("reads own team", mgr.call("GET", "/api/manager/" + MGR_ID + "/team")[0], 200)
expect("reads a direct report", mgr.call("GET", "/api/users/" + EMP_ID)[0], 200)
expect("reads direct report capability",
       mgr.call("GET", "/api/users/" + EMP_ID + "/capability")[0], 200)
expect("lists project demands", mgr.call("GET", "/api/project-demand/list")[0], 200)
expect("reads the readiness index", mgr.call("GET", "/api/analytics/eri")[0], 200)
expect("reads the leadership overview", mgr.call("GET", "/api/analytics/leadership")[0], 200)
exe = Session()
expect("leadership logs in with credentials", exe.call("POST", "/api/auth/login", LEADERSHIP)[0], 200)
expect("leadership reads the readiness index", exe.call("GET", "/api/analytics/eri")[0], 200)

# --------------------------------------------------------------------------- #
print("\nSCENARIO 3 - employee attempting manager access (must be refused)")
expect("employee -> manager's team", emp.call("GET", "/api/manager/" + MGR_ID + "/team")[0], 403)
expect("employee -> manager's profile", emp.call("GET", "/api/users/" + MGR_ID)[0], 403)
expect("employee -> manager's capability",
       emp.call("GET", "/api/users/" + MGR_ID + "/capability")[0], 403)
expect("employee -> validate evidence", emp.call("POST", "/api/validation", {
    "evidenceId": "x", "reviewerId": EMP_ID, "status": "approved", "comment": "x"})[0], 403)
expect("employee -> assign learning track", emp.call("POST", "/api/learning-plan/assign", {
    "userId": EMP_ID, "targetDeadline": "2026-12-01", "steps": [{"title": "x"}]})[0], 403)
expect("employee -> create project demand", emp.call("POST", "/api/project-demand/create", {
    "projectName": "x", "customerName": "y", "businessUnit": "z"})[0], 403)
expect("employee -> manager insight", emp.call("POST", "/api/manager/insight",
                                               {"employeeId": EMP_ID})[0], 403)
expect("employee -> parse JD", emp.call("POST", "/api/project-demand/parse-jd",
                                        {"jobDescriptionText": "x"})[0], 403)
expect("employee -> download source zip", emp.call("GET", "/api/download-app-zip")[0], 403)
expect("employee -> readiness index", emp.call("GET", "/api/analytics/eri")[0], 403)
expect("employee -> leadership overview", emp.call("GET", "/api/analytics/leadership")[0], 403)
expect("employee -> launch an L&D campaign", emp.call("POST", "/api/analytics/campaign",
                                                     {"skillId": "sk_20"})[0], 403)

# --------------------------------------------------------------------------- #
print("\nSCENARIO 4 - manager attempting unauthorized employee impersonation")
print("             (Marcus acting on E1002, who reports to mgr_3 - must be refused)")
expect("manager -> foreign employee profile",
       mgr.call("GET", "/api/users/" + FOREIGN_EMP)[0], 403)
expect("manager -> foreign employee capability",
       mgr.call("GET", "/api/users/" + FOREIGN_EMP + "/capability")[0], 403)
expect("manager -> foreign employee learning plan",
       mgr.call("GET", "/api/users/" + FOREIGN_EMP + "/learning-plan")[0], 403)
expect("manager -> submit evidence AS foreign employee",
       mgr.call("POST", "/api/evidence", {
           "userId": FOREIGN_EMP, "skillId": "sk_26", "title": "impersonation probe",
           "description": "d", "evidenceText": "t"})[0], 403)
expect("manager -> change foreign employee target role",
       mgr.call("POST", "/api/users/" + FOREIGN_EMP + "/target-role",
                {"roleId": "role_2"})[0], 403)
expect("manager -> another manager's team",
       mgr.call("GET", "/api/manager/" + FOREIGN_MGR + "/team")[0], 403)

# --------------------------------------------------------------------------- #
print("\nSCENARIO 5 - arbitrary userId manipulation")
anon = Session()
s, b = anon.call("POST", "/api/auth/login", {"userId": MGR_ID})
if EXPECT_DEMO_HOLE:
    ok = s == 200
    results.append(("bare userId login (demo hole demo)", ok, str(s)))
    print("    [" + ("HOLE OPEN" if ok else "closed") + "] bare userId -> " + str(s)
          + ("  *** granted a session as "
             + (b.get("user", {}).get("name", "?") if isinstance(b, dict) else "?")
             + " with no credential ***" if ok else ""))
else:
    expect("bare userId is NOT authentication", s, [400, 401, 404])

expect("employee cannot read another's evidence via ?userId",
       emp.call("GET", "/api/evidence?userId=" + MGR_ID)[0], 200,
       "(scoping checked below)")
_s, ev = emp.call("GET", "/api/evidence?userId=" + MGR_ID)
scoped = isinstance(ev, list) and all(e.get("userId") == EMP_ID for e in ev)
results.append(("?userId is ignored for employees", scoped, "scoped" if scoped else "LEAKED"))
print("    [" + ("PASS" if scoped else "FAIL")
      + "] ?userId override ignored - returned only own rows ("
      + str(len(ev) if isinstance(ev, list) else "?") + " rows)")

expect("employee cannot submit evidence as another user",
       emp.call("POST", "/api/evidence", {
           "userId": MGR_ID, "skillId": "sk_16", "title": "spoof",
           "description": "d", "evidenceText": "t"})[0], 403)
expect("employee cannot change another user's target role",
       emp.call("POST", "/api/users/" + MGR_ID + "/target-role", {"roleId": "role_2"})[0], 403)

# --------------------------------------------------------------------------- #
print("\nSCENARIO 6 - direct API access with no session (must be refused)")
none = Session()
for path in ["/api/skills", "/api/roles", "/api/courses",
             "/api/users/" + EMP_ID, "/api/users/" + EMP_ID + "/capability",
             "/api/evidence", "/api/reminders", "/api/project-demand/list",
             "/api/learning-tracker/resources", "/api/analytics/eri",
             "/api/analytics/leadership", "/api/analytics/ld"]:
    expect("anonymous -> " + path, none.call("GET", path)[0], 401)
expect("anonymous -> manager team", none.call("GET", "/api/manager/" + MGR_ID + "/team")[0],
       [401, 403])
expect("anonymous -> launch an L&D campaign", none.call("POST", "/api/analytics/campaign",
                                                          {"skillId": "sk_20"})[0], 401)
expect("anonymous -> AI orchestrator", none.call("POST", "/api/ai/orchestrator",
                                                 {"prompt": "hi"})[0], 401)
expect("anonymous -> submit evidence", none.call("POST", "/api/evidence", {
    "userId": EMP_ID, "skillId": "sk_16", "title": "x",
    "description": "d", "evidenceText": "t"})[0], 401)
# The staff directory used to be public so the login screen could count profiles. It
# served every employee's name, email, title and department to anonymous callers, and
# the client only ever used the list's length - so the count moved to a dedicated
# summary route and the directory itself became session-gated.
expect("anonymous -> staff directory", none.call("GET", "/api/users")[0], 401)
expect("public directory summary stays public", none.call("GET", "/api/directory/summary")[0], 200)
_, summary = none.call("GET", "/api/directory/summary")
# expect() treats its third argument as the set of ALLOWED values, so compare a joined
# string rather than handing it a list (which would read as a list of alternatives).
expect("summary exposes a count and nothing else",
       ",".join(sorted(summary.keys())) if isinstance(summary, dict) else None, "totalProfiles")

# --------------------------------------------------------------------------- #
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print("\n" + "=" * 62)
print("  " + str(passed) + " / " + str(total) + " checks passed")
failed = [(l, v) for l, ok, v in results if not ok]
if failed:
    print("  FAILED:")
    for l, v in failed:
        print("    - " + l + "  (got " + v + ")")
    sys.exit(1)
print("  All six authorization scenarios enforced server-side.")
