"""The sample journeys, and the presenter's tools: refused anywhere but this computer, and a
reset that puts the demo back without signing anyone out or losing a password."""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import config, seed_data, snapshot
from backend.app.database import query_all, query_one
from backend.app.main import app
from backend.app.repositories import demands
from backend.app.services import analytics, talent

from .conftest import ACCOUNTS, PASSWORD
from .test_demo_data import assert_ladder


@pytest.fixture
def saved_database():
    """Every test starts from the same records, and leaves none behind."""
    with sqlite3.connect(config.DB_PATH) as live:
        saved = sqlite3.connect(":memory:")
        live.backup(saved)
    yield
    with sqlite3.connect(config.DB_PATH) as live:
        saved.backup(live)
    saved.close()


@pytest.fixture
def company(saved_database):
    """The demo company with the sample journeys under way."""
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("PRAGMA foreign_keys = ON")
        seed_data.load_demo(live)
        return seed_data.load_journeys(live)


@pytest.fixture
def tools(company, monkeypatch):
    """The company, with the tools on and no saved starting point."""
    monkeypatch.setattr(config, "DEMO_TOOLS", True)
    monkeypatch.setattr(config, "SEED_DEMO_DATA", True)
    snapshot.starting_point().unlink(missing_ok=True)
    yield
    snapshot.starting_point().unlink(missing_ok=True)


def browser(host: str = "127.0.0.1", base_url: str = "http://localhost:8000", **options) -> TestClient:
    """A browser on the computer at `host`."""
    async def reached(scope, receive, send):
        if scope["type"] == "http":
            scope = {**scope, "client": (host, 50000)}
        await app(scope, receive, send)
    return TestClient(reached, base_url=base_url, **options)


def here(identifier: str | None = None) -> TestClient:
    """A browser on this computer, signed in as `identifier`."""
    client = browser()
    if identifier:
        answer = client.post("/api/auth/login", json={"identifier": identifier, "password": PASSWORD})
        assert answer.status_code == 200, answer.text
    return client


LEADER, MANAGER, EMPLOYEE = ACCOUNTS["leadership"], "mgr_108", "E2095"


# --------------------------------------------------------------------------- #
# The journeys
# --------------------------------------------------------------------------- #

def test_the_journeys_fill_every_stage_of_the_pipeline(company):
    assert company["put"] >= 40 and company["left"] == 0
    stages = list(analytics.deployment_pipeline().values())
    assert stages[0] >= 40 and stages == sorted(stages, reverse=True) and stages[-1] >= 5
    report = analytics.readiness_index()
    measured = {f["key"]: f["score"] for f in report["factors"]}
    assert measured["videoMcqAssessments"] is not None and measured["managerGrowValidation"] is not None
    assert report["coverage"] == 85                            # all but certifications


def test_every_result_of_a_journey_is_what_the_application_works_out(company):
    for row in query_all("SELECT content, answers, result FROM skillgap_assessments WHERE status = 'completed'"):
        content, answers, result = (json.loads(row[c]) for c in ("content", "answers", "result"))
        right = sum(answers.get(q["id"]) == q["correctIndex"] for q in content["mcqs"])
        assert (result["mcqCorrect"], result["mcqTotal"]) == (right, len(content["mcqs"]))
        assert result["overallScore"] == result["mcqScore"] and result["spokenScore"] is None   # no model: not counted
    scores = [r["quizScore"] for r in query_all(
        "SELECT quizScore FROM learning_plans WHERE purpose = 'project_hiring' AND status = 'completed' AND quizScore > 0")]
    assert scores and min(scores) >= 60
    for user_id, j in seed_data.journeys().items():
        eligible = talent.resume_eligibility(user_id, j["demandId"])["eligible"]
        assert eligible == (j["stage"] == "cleared"), (user_id, j["stage"])


def test_each_journey_happens_in_order_and_after_the_demand(company):
    today = date.today().isoformat()
    created = {d["id"]: d["createdAt"] for d in demands.get_project_demands()}
    for user_id, j in seed_data.journeys().items():
        r = j["rows"]
        # Assigning the track captures the baseline again; the handoff is the first message.
        handed = r["reminders"][0]["createdAt"]
        assert r["reminders"][0]["type"] == "escalation"
        assert created[j["demandId"]] < handed[:10] <= r["skill_baselines"][0]["capturedAt"][:10] <= today
        moments = [handed, *(a["completedAt"] for a in r["skillgap_assessments"]),
                   *(p["createdAt"] for p in r["post_assessments"]), *(p["signedOffAt"] for p in r["post_assessments"] if p["signedOffAt"])]
        assert moments == sorted(moments) and moments[-1][:10] <= today, user_id
        for e in r["evidences"]:
            assert handed < e["submittedAt"] and (not e["reviewedAt"] or e["submittedAt"] < e["reviewedAt"])
            assert e["reviewedBy"] in (None, query_one("SELECT managerId FROM users WHERE id = ?", (user_id,))[0])


def test_journey_dates_move_with_the_day_they_are_loaded():
    now, later = date(2026, 12, 1), date(2027, 3, 1)
    first, second = seed_data.journeys(now), seed_data.journeys(later)
    for user_id in first:
        a, b = (x[user_id]["rows"]["skill_baselines"][0]["capturedAt"][:10] for x in (first, second))
        assert date.fromisoformat(b) - date.fromisoformat(a) == later - now
    text = str(first)
    assert "{{" not in text and "@-" not in text and "@+" not in text
    # A date written inside a message moves too.
    told = next(r["message"] for r in next(iter(first.values()))["rows"]["reminders"] if "interview on" in r["message"])
    assert re.search(r"interview on \d{1,2}/\d{1,2}/20(26|27)", told)


def test_a_message_names_the_interview_date_of_its_project(saved_database):
    """Also where the company was loaded on an earlier day than the journeys."""
    today = date.today()
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("PRAGMA foreign_keys = ON")
        seed_data.load_demo(live, today - timedelta(days=9))
        assert seed_data.load_journeys(live, today)["put"] == len(seed_data.journeys())
    for user_id, j in seed_data.journeys(today).items():
        demand = demands.get_project_demand_by_id(j["demandId"])
        day = date.fromisoformat(demand["clientInterviewDate"][:10])
        told = [r["message"] for r in j["rows"]["reminders"] if "interview on" in r["message"]]
        assert told and all(f"interview on {day.day}/{day.month}/{day.year}" in m for m in told)
        assert demand["createdAt"][:10] < min(r["capturedAt"] for r in j["rows"]["skill_baselines"])[:10]


def test_journeys_are_put_once_and_never_over_someone_people_have_worked_with(company):
    with sqlite3.connect(config.DB_PATH) as live:
        assert seed_data.load_journeys(live)["put"] == 0
        assert not any(seed_data.load_demo(live).values())            # no replaced plan comes back
    with sqlite3.connect(config.DB_PATH) as live:                     # someone trained on their own
        user = next(u for u, j in seed_data.journeys().items() if j["stage"] == "handed_off")
        for table in ("skill_baselines", "reminders"):
            live.execute(f"DELETE FROM {table} WHERE userId = ?", (user,))
        live.execute("UPDATE user_skills SET currentLevel = 5 WHERE userId = ?", (user,))
    with sqlite3.connect(config.DB_PATH) as live:
        assert seed_data.load_journeys(live)["put"] == 0
        assert live.execute("SELECT COUNT(*) FROM skill_baselines WHERE userId = ?", (user,)).fetchone()[0] == 0


def test_openings_still_rank_several_people_once_some_are_trained(company):
    for d in demands.get_project_demands():
        if d["id"].startswith("OPP-"):
            assert_ladder(d["projectName"], d)
    assert talent.match_candidates(demands.get_project_demand_by_id("OPP-1015"))["matches"][0]["fullName"] == "Neha"


def test_the_presenter_has_one_person_at_each_stage_in_one_team(company):
    people = seed_data.cast()
    assert Counter(p["label"] for p in people) == {"Leadership": 1, "L&D": 1, "Manager": 1, "Employee": 4}
    stages = [seed_data.journeys()[p["userId"]]["stage"] for p in people if p["label"] == "Employee"]
    assert stages == ["handed_off", "training", "trained", "cleared"]      # the order the script counts on
    teams = {query_one("SELECT managerId FROM users WHERE id = ?", (p["userId"],))[0] for p in people if p["label"] == "Employee"}
    assert teams == {next(p["userId"] for p in people if p["label"] == "Manager")}
    learner = [p["userId"] for p in people if p["label"] == "Employee"][1]
    steps = query_all("SELECT status, learningType FROM learning_plans WHERE userId = ? ORDER BY weekNumber, rowid", (learner,))
    left = [s["learningType"] for s in steps if s["status"] != "completed"]
    assert len(steps) > 2 and left == ["in_depth", "best_practice"]        # a knowledge check, then its practice
    assert query_one("SELECT COUNT(*) FROM evidences WHERE userId = ? AND status = 'pending'", (learner,))[0] >= 1


# --------------------------------------------------------------------------- #
# Where the tools may be used
# --------------------------------------------------------------------------- #

ROUTES = [("get", "/api/demo"), ("post", "/api/demo/switch"), ("post", "/api/demo/reset"), ("post", "/api/demo/starting-point")]


def call(client: TestClient, method: str, path: str):
    return client.get(path) if method == "get" else client.post(path, json={"confirm": True, "userId": EMPLOYEE})


def test_the_tools_are_not_there_unless_they_are_switched_on(company):
    client = here(LEADER)
    for method, path in ROUTES:
        assert call(client, method, path).status_code == 404, path


@pytest.mark.parametrize("why, options", [
    ("another computer", {"host": "192.168.1.20"}),
    ("the internet", {"host": "203.0.113.9"}),
    ("an address that is not one", {"host": "testclient"}),
    ("a name that is not this computer", {"base_url": "http://cybridge.example.com"}),
    ("a proxy", {"headers": {"X-Forwarded-For": "127.0.0.1"}}),
    ("a proxy", {"headers": {"Forwarded": "for=127.0.0.1"}}),
    ("another site's page", {"headers": {"Origin": "https://evil.example"}}),
    ("a page with no origin of its own", {"headers": {"Origin": "null"}}),
])
def test_the_tools_are_not_there_for_anyone_but_this_computer(tools, why, options):
    cookie = "; ".join(f"{k}={v}" for k, v in here(LEADER).cookies.items())
    client = browser(**{**options, "headers": {"Cookie": cookie, **options.get("headers", {})}})
    assert client.get("/api/auth/me").status_code == 200              # signed in, and still refused
    before = query_one("SELECT COUNT(*) FROM users")[0]
    for method, path in ROUTES:
        assert call(client, method, path).status_code == 404, (why, path)
    assert query_one("SELECT COUNT(*) FROM users")[0] == before


def test_a_user_id_alone_never_signs_anyone_in(tools):
    for method, path in ROUTES:
        assert call(here(), method, path).status_code == 401, path
    assert here().get("/api/auth/me").status_code == 401


def test_only_the_people_of_the_demo_can_be_switched_to(tools):
    client = here(MANAGER)
    for target in ("E1005", "E2001", "mgr_101", "nobody", None, 5, ["E2095"]):
        assert client.post("/api/demo/switch", json={"userId": target}).status_code == 403, target
    assert client.get("/api/auth/me").json()["user"]["id"] == MANAGER


def test_a_switch_moves_this_browser_and_ends_the_session_it_had(tools):
    client = here(MANAGER)
    old = dict(client.cookies)
    people = client.get("/api/demo").json()["people"]
    assert len(people) == 7 and all(p["name"] and p["note"] for p in people)
    moved = client.post("/api/demo/switch", json={"userId": EMPLOYEE}, headers={"Origin": "http://localhost:5173"})
    assert moved.status_code == 200 and client.get("/api/auth/me").json()["user"]["id"] == EMPLOYEE
    assert "passwordHash" not in moved.text
    assert client.get("/api/analytics/eri").status_code == 403          # an employee's rights now
    stale = browser(headers={"Cookie": "; ".join(f"{k}={v}" for k, v in old.items())})
    assert stale.get("/api/auth/me").status_code == 401


# --------------------------------------------------------------------------- #
# Starting over
# --------------------------------------------------------------------------- #

def test_an_employee_cannot_reset_and_a_reset_must_be_confirmed(tools):
    for path in ("/api/demo/reset", "/api/demo/starting-point"):
        assert here(EMPLOYEE).post(path, json={"confirm": True}).status_code == 403
        for body in ({}, {"confirm": "yes"}, {"confirm": 1}):
            assert here(LEADER).post(path, json=body).status_code == 400
    assert not snapshot.starting_point().exists()


def counts() -> dict[str, int]:
    tables = [r[0] for r in query_all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    return {t: query_one(f"SELECT COUNT(*) FROM {t}")[0] for t in tables if t not in snapshot.KEPT}


def test_a_reset_puts_the_demo_back_and_keeps_passwords_and_sessions(tools):
    leader, manager = here(LEADER), here(MANAGER)
    leader.get("/api/analytics/eri")                                    # a reading of today, which is kept
    snapshot.reset_demo()                                               # whatever earlier tests left
    start = counts()
    manager.post("/api/project-demand/create", json={
        "projectName": "Made during the demo", "customerName": "C", "businessUnit": "B", "requiredSkills": ["Java"]})
    learner = here("E2096")
    learner.post("/api/evidence", json={"userId": "E2096", "skillId": "sk_1", "title": "t", "description": "d", "evidenceText": "e"})
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("DELETE FROM learning_plans WHERE userId = 'E2099'")
        live.execute("UPDATE users SET title = 'Renamed' WHERE id = 'E1005'")
    assert counts() != start

    answer = leader.post("/api/demo/reset", json={"confirm": True})
    assert answer.status_code == 200
    assert counts() == start
    assert query_one("SELECT title FROM users WHERE id = 'E1005'")[0] == "Lead Senior Software Engineer"
    assert query_all("SELECT 1 FROM project_demands WHERE projectName = 'Made during the demo'") == []
    assert query_all("PRAGMA foreign_key_check") == []
    # Nobody is signed out, and passwords set before still work.
    assert all(c.get("/api/auth/me").status_code == 200 for c in (leader, manager, learner))
    assert here().post("/api/auth/login", json={"identifier": MANAGER, "password": "wrong"}).status_code == 401
    assert here(MANAGER).get("/api/auth/me").status_code == 200
    assert query_one("SELECT COUNT(*) FROM eri_snapshots")[0] >= 1
    # What was removed is in the backup.
    backup = sqlite3.connect(snapshot.folder() / answer.json()["backup"])
    assert backup.execute("SELECT COUNT(*) FROM project_demands WHERE projectName = 'Made during the demo'").fetchone()[0] == 1
    backup.close()
    assert all(d["clientInterviewDate"][:10] > date.today().isoformat() for d in demands.get_project_demands())


def test_a_saved_starting_point_is_what_a_reset_goes_back_to(tools):
    leader = here(LEADER)
    leader.post("/api/project-demand/create", json={
        "projectName": "Prepared for the client", "customerName": "C", "businessUnit": "B", "requiredSkills": ["Java"]})
    assert leader.post("/api/demo/starting-point", json={"confirm": True}).status_code == 200
    assert leader.get("/api/demo").json()["startingPointSavedAt"]
    start = counts()
    leader.post("/api/project-demand/create", json={
        "projectName": "Made during the demo", "customerName": "C", "businessUnit": "B", "requiredSkills": ["Java"]})
    assert leader.post("/api/demo/reset", json={"confirm": True}).status_code == 200
    assert counts() == start
    names = {d["projectName"] for d in demands.get_project_demands()}
    assert "Prepared for the client" in names and "Made during the demo" not in names


def test_a_reset_that_cannot_be_completed_changes_nothing(tools, monkeypatch):
    leader = here(LEADER)
    leader.post("/api/demo/starting-point", json={"confirm": True})
    broken = sqlite3.connect(snapshot.starting_point())                 # a person whose skill is not there
    broken.execute("INSERT INTO user_skills VALUES ('E1005', 'sk_gone', 1, 1, 'learning', '2026-01-01')")
    broken.commit()
    broken.close()
    leader.post("/api/project-demand/create", json={
        "projectName": "Still here", "customerName": "C", "businessUnit": "B", "requiredSkills": ["Java"]})
    before = counts()
    with pytest.raises(snapshot.RestoreFailed):
        snapshot.reset_demo()
    assert counts() == before and leader.get("/api/auth/me").status_code == 200


def test_a_reset_brings_passed_interviews_ahead(tools):
    leader = here(LEADER)
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("UPDATE project_demands SET clientInterviewDate = ?", ((date.today() - timedelta(days=9)).isoformat(),))
    leader.post("/api/demo/starting-point", json={"confirm": True})
    leader.post("/api/demo/reset", json={"confirm": True})
    assert all(d["clientInterviewDate"][:10] > date.today().isoformat()
               for d in demands.get_project_demands() if d["id"].startswith(("OPP-1", "OPP-2")))


def test_the_script_names_the_demo_and_its_printed_version_says_the_same(company):
    root = Path(__file__).resolve().parents[2]
    panel = (root / "frontend/src/components/demoScript.ts").read_text(encoding="utf-8")
    printed = (root / "docs/DEMO_SCRIPT.md").read_text(encoding="utf-8")
    steps = panel.split("export const DEMO_SCRIPT", 1)[1]
    lines = [line for line in re.findall(r'"([^"]+)"', steps) if " " in line]
    assert len(lines) > 25
    assert [line for line in lines if line not in printed] == []
    people = seed_data.cast()
    name = lambda p: query_one("SELECT name FROM users WHERE id = ?", (p["userId"],))[0]
    employees = [p for p in people if p["label"] == "Employee"]
    for p in [next(p for p in people if p["label"] == "Leadership"), next(p for p in people if p["label"] == "Manager"), *employees[:2]]:
        assert f"As **{name(p)} (" in printed
    assert name(employees[2]) in panel                                     # the one the manager clears
    for p in (employees[0], employees[2]):
        assert demands.get_project_demand_by_id(seed_data.journeys()[p["userId"]]["demandId"])["projectName"] in panel
