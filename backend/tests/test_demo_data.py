"""The demo data set: complete, consistent, safe to load twice, and able to answer job
descriptions nobody prepared it for."""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from datetime import date, timedelta

import pytest

from backend.app import config, seed_data
from backend.app.repositories import catalog
from backend.app.services import matching, questions, talent

from .conftest import PASSWORD
from .test_ai import gemini  # noqa: F401 - the local Gemini stand-in
from .unseen_jds import NOBODY_HAS, UNSEEN

TODAY = date(2026, 11, 24)


@pytest.fixture
def demo():
    """The test database with the demo rows added, put back afterwards."""
    with sqlite3.connect(config.DB_PATH) as live:
        saved = sqlite3.connect(":memory:")
        live.backup(saved)
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("PRAGMA foreign_keys = ON")
        added = seed_data.load_demo(live)
    yield added
    with sqlite3.connect(config.DB_PATH) as live:
        saved.backup(live)
    saved.close()


def rows(table):
    return seed_data.demo_rows(TODAY)[table]


# --------------------------------------------------------------------------- #
# The data itself
# --------------------------------------------------------------------------- #

def test_the_demo_company_is_large_and_every_reference_holds(demo):
    assert demo["skills"] >= 160 and demo["users"] >= 170 and demo["project_demands"] >= 30
    with sqlite3.connect(config.DB_PATH) as live:
        assert live.execute("PRAGMA foreign_key_check").fetchall() == []
        assert live.execute("SELECT COUNT(*) FROM users WHERE role = 'employee' AND managerId IS NOT NULL "
                            "AND managerId NOT IN (SELECT id FROM users WHERE role = 'manager')").fetchone()[0] == 0
        assert live.execute("SELECT COUNT(*) FROM users WHERE role = 'employee' AND targetRoleId IS NOT NULL "
                            "AND targetRoleId NOT IN (SELECT id FROM target_roles)").fetchone()[0] == 0


def test_loading_again_adds_nothing_and_changes_nothing(demo):
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("UPDATE users SET title = 'Changed by hand' WHERE id = 'E2001'")
        again = seed_data.load_demo(live)
        assert set(again.values()) == {0}
        assert live.execute("SELECT title FROM users WHERE id = 'E2001'").fetchone()[0] == "Changed by hand"


def test_the_load_script_backs_up_first_and_never_over_an_older_backup(tmp_path):
    import os
    import subprocess
    import sys

    def run(*args):
        done = subprocess.run(
            [sys.executable, str(config.REPO_ROOT / "backend" / "scripts" / "load_demo_data.py"), *args],
            env={**os.environ, "DATABASE_PATH": str(tmp_path / "own.db"), "SEED_DEMO_DATA": "false"},
            capture_output=True, text=True)
        assert done.returncode == 0, done.stderr
        return done.stdout

    def people(path):
        with sqlite3.connect(path) as db:
            return db.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    backups = tmp_path / "backups"
    assert "Would add" in run("--dry-run") and not backups.exists()
    assert "Backup" in run() and people(tmp_path / "own.db") == people(next(backups.iterdir())) + len(rows("users"))
    assert "Nothing to add" in run() and len(list(backups.iterdir())) == 1


def test_a_fresh_database_gets_the_demo_company_and_an_old_one_is_left_alone(monkeypatch):
    from backend.app.database import _seed_empty_tables

    monkeypatch.setattr(config, "SEED_DEMO_DATA", True)
    with sqlite3.connect(config.DB_PATH, isolation_level=None) as live:
        saved = sqlite3.connect(":memory:")
        live.backup(saved)
        before = live.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        live.execute("DELETE FROM reminders")
        _seed_empty_tables(live)                                          # has people: nothing is added
        assert live.execute("SELECT COUNT(*) FROM users").fetchone()[0] == before
        for table in ("skill_baselines", "evidences", "learning_plans", "user_skills", "target_role_skills",
                      "courses", "project_demands", "sessions", "users", "skills", "target_roles"):
            live.execute(f"DELETE FROM {table}")
        _seed_empty_tables(live)
        assert live.execute("SELECT COUNT(*) FROM users").fetchone()[0] == before + len(rows("users"))
        saved.backup(live)
    saved.close()


def test_a_name_that_is_already_taken_stops_the_load():
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("INSERT INTO skills VALUES ('sk_own', 'javascript', 'Technical', 'ours')")
        with pytest.raises(seed_data.Clash, match="sk_own"):
            seed_data.load_demo(live)
        assert live.execute("SELECT COUNT(*) FROM users WHERE id = 'E2001'").fetchone()[0] == 0
        live.rollback()


def test_names_and_addresses_are_unique_so_sign_in_finds_one_person(demo):
    with sqlite3.connect(config.DB_PATH) as live:
        for column in ("id", "name", "email"):
            values = [r[0].lower() for r in live.execute(f"SELECT {column} FROM users")]
            assert max(Counter(values).values()) == 1, column


def test_no_password_rating_or_learner_count_is_made_up():
    assert all(u["passwordHash"] is None for u in rows("users"))
    assert all(c["rating"] is None and c["enrollmentCount"] is None and c["lastUpdated"] is None for c in rows("courses"))
    assert all(re.match(r"https://", c["url"]) for c in rows("courses"))


def test_every_demo_skill_has_a_course_and_three_fair_questions():
    taught = {c["skillId"] for c in rows("courses")}
    longest = total = 0
    for skill in rows("skills"):
        assert skill["id"] in taught, skill["name"]
        bank = questions.for_skill(skill["name"])
        assert len(bank) >= 3, skill["name"]
        for q in bank:
            assert len(set(q["options"])) == 4 and q["explanation"], q["id"]
            longest += len(q["correct"]) > max(len(o) for o in q["options"] if o != q["correct"])
            total += 1
    assert longest / total < 0.35                   # by chance it would be a quarter


def test_upcoming_interviews_are_counted_from_the_day_the_data_is_loaded():
    for d in rows("project_demands"):
        assert d["clientInterviewDate"][:10] > TODAY.isoformat()
        assert d["expectedJoiningDate"] > d["clientInterviewDate"]


def test_passed_interviews_of_demo_demands_can_be_moved_ahead(demo):
    later = date.today() + timedelta(days=400)
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("UPDATE project_demands SET status = 'CLOSED' WHERE id = 'OPP-1003'")
        live.execute("INSERT INTO project_demands SELECT 'OPP-own', projectName, customerName, businessUnit, projectDescription, "
                     "rawJobDescription, requiredSkills, preferredSkills, experienceRangeMin, experienceRangeMax, technologyStack, "
                     "resourcesRequired, clientInterviewDate, expectedJoiningDate, projectPriority, location, domain, "
                     "employmentType, additionalNotes, status, createdAt FROM project_demands WHERE id = 'OPP-1001'")
        kept = "SELECT id, clientInterviewDate FROM project_demands WHERE id IN ('OPP-1003', 'OPP-own')"
        before = live.execute(kept).fetchall()
        samples = len(seed_data.sample_demands(later))
        assert seed_data.refresh_demo_dates(live, later) == samples - 1                 # not the closed one
        assert live.execute(kept).fetchall() == before                                  # nor a person's own
        assert live.execute("SELECT MIN(clientInterviewDate) FROM project_demands "
                            "WHERE id NOT IN ('OPP-1003', 'OPP-own')").fetchone()[0] > later.isoformat()
        assert seed_data.refresh_demo_dates(live, later) == 0                           # dates ahead stay
        priorities = dict(live.execute("SELECT projectPriority, MIN(clientInterviewDate) FROM project_demands "
                                       "WHERE id LIKE 'OPP-1%' AND id != 'OPP-1003' GROUP BY 1").fetchall())
        assert priorities["CRITICAL"] < priorities["HIGH"] < priorities["MEDIUM"]
        live.rollback()


def test_demands_and_profiles_name_catalogue_skills_exactly(demo):
    skills = catalog.get_skills()
    for d in rows("project_demands"):
        for name in json.loads(d["requiredSkills"]) + json.loads(d["preferredSkills"]):
            assert matching.named_exactly(name, skills), name
    for u in rows("users"):
        for name in json.loads(u["primarySkills"] or "[]"):
            assert matching.named_exactly(name, skills), (u["id"], name)


def test_someone_can_do_the_work_for_every_demo_skill():
    able = {s["skillId"] for s in rows("user_skills") if s["currentLevel"] >= matching.VERIFIED_LEVEL}
    assert {s["id"] for s in rows("skills")} <= able


def test_people_differ_so_there_are_gaps_to_train(demo):
    levels = Counter(s["currentLevel"] for s in rows("user_skills"))
    assert set(levels) == {1, 2, 3, 4, 5}
    below = {s["userId"] for s in rows("user_skills") if s["currentLevel"] < s["targetLevel"]}
    people = {u["id"] for u in rows("users") if u["role"] == "employee"}
    assert 0.5 < len(below) / len(people) < 0.95


# --------------------------------------------------------------------------- #
# Skills under other names
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("written, skill", [
    ("K8s", "Kubernetes"), ("Azure Kubernetes Service", "Kubernetes"), ("ReactJS", "React"), (".NET", "ASP.NET Core"),
    ("Postgres", "PostgreSQL & Vector Database Optimization"), ("Go", "Go (Golang)"), ("GCP", "Google Cloud"),
    ("SQL", "SQL"), ("SQL Server 2022", "SQL Server"), ("REST API", "REST APIs"), ("LLMs", "Large Language Models"),
    ("Amazon Web Services (AWS)", "AWS"), ("TypeScript", "Enterprise TypeScript Development"), ("Power Automate", "Power Platform"),
    ("SAFe", "Scaled Agile"), ("React Native", "React Native"), ("Spring", "Spring Boot"), ("JavaScript", "JavaScript"), ("Java", "Java"),
])
def test_a_skill_is_found_under_its_other_names(demo, written, skill):
    assert matching.find_skill(written, catalog.get_skills())["name"] == skill


def test_an_ordinary_word_is_not_read_as_a_technology(demo):
    text = ("You will go to market with us, rest assured, and express ideas as part of a swift team that "
            "works with the product owner and the project manager in a safe place. Our SaaS company excels.")
    assert matching.mentioned_skills(text, catalog.get_skills()) == []


def test_knowing_one_skill_is_not_knowing_another_that_contains_its_name(demo):
    skills = catalog.get_skills()
    met = lambda primary, needed: matching.requirement_status(
        {"title": "Engineer", "primarySkills": [primary]}, {}, [needed], skills)[0]["met"]
    assert not met("SQL", "SQL Server") and not met("React", "React Native") and not met("Azure", "Azure Data Factory")
    assert met("K8s", "Kubernetes") and met("Node.js", "NodeJS") and met("SQL", "SQL")


# --------------------------------------------------------------------------- #
# A job description nobody has seen before, without a model
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("name, text, needed, titles", UNSEEN, ids=[u[0] for u in UNSEEN])
def test_an_unseen_job_description_finds_the_right_person(demo, manager, name, text, needed, titles):
    parsed = manager.post("/api/project-demand/parse-jd", json={"jobDescriptionText": text}).json()["parsed"]
    assert needed <= set(parsed["requiredSkills"])
    demand = manager.post("/api/project-demand/create", json={
        **parsed, "projectName": parsed["projectName"] or name, "customerName": "Client", "businessUnit": "Unit",
    }).json()["demand"]
    result = manager.post("/api/project-demand/match", json={"demandId": demand["id"]}).json()
    best = result["matches"][0]
    assert any(word in best["currentRole"] for word in titles), best["currentRole"]
    assert best["technicalMatchPct"] >= 60
    assert result["uncoveredSkills"] == []


def test_a_models_wording_becomes_catalogue_names_once(demo, manager, gemini):  # noqa: F811
    # As gemini-3.6-flash worded the "rag engineer" description on 24 November 2026.
    gemini.reply_text = json.dumps({
        "projectName": "Assistant", "preferredSkills": ["AWS SageMaker", "Python scripting"],
        "requiredSkills": ["Python", "Large language models", "RAG pipelines", "LangGraph", "Vector stores",
                           "Pinecone", "pgvector", "LLM fine-tuning", "FastAPI", "Qiskit"]})
    gemini.connect()
    parsed = manager.post("/api/project-demand/parse-jd", json={"jobDescriptionText": "x"}).json()["parsed"]
    assert parsed["requiredSkills"] == ["Python", "Large Language Models", "Retrieval-Augmented Generation", "LangChain",
                                        "Vector Databases", "FastAPI", "Qiskit"]
    assert parsed["preferredSkills"] == ["Amazon SageMaker"]


# --------------------------------------------------------------------------- #
# Several people for every opening, with different fitment
# --------------------------------------------------------------------------- #

def ladder(demand):
    """The people who meet at least two in five of an opening's skills, best first."""
    return [m for m in talent.match_candidates(demand)["matches"] if m["technicalMatchPct"] >= 40]


def assert_ladder(name, demand, low_rung=65):
    people = ladder(demand)
    places = [m["overallMatchPct"] for m in people]
    assert len(people) >= 6, (name, places)
    assert 75 <= places[0] < 99, (name, places)                    # someone close to ready, nobody perfect
    assert len(set(places[:6])) >= 4, (name, places)               # different percentages at the top
    assert sum(60 <= p < 80 for p in places) >= 1, (name, places)  # the Partial band on screen
    assert places[-1] < low_rung, (name, places)                   # some who need training
    assert people[-1]["missingSkills"], name


def test_every_opening_has_several_people_with_different_fitment(demo):
    from backend.app.repositories import demands
    for d in demands.get_project_demands():
        if d["id"].startswith(("OPP-1", "OPP-2")):
            assert_ladder(d["projectName"], d)


def test_every_job_description_file_has_several_people_with_different_fitment(demo):
    files = sorted((config.REPO_ROOT / "sample-data" / "job-descriptions").glob("*.txt"))
    assert len(files) == len(rows("target_roles"))
    for f in files:
        assert_ladder(f.stem, {**talent.parse_job_description(f.read_text(encoding="utf-8")), "projectName": f.stem})


@pytest.mark.parametrize("name, text, needed, titles", UNSEEN, ids=[u[0] for u in UNSEEN])
def test_an_unseen_job_description_has_several_people_with_different_fitment(demo, name, text, needed, titles):
    assert_ladder(name, {**talent.parse_job_description(text), "projectName": name}, low_rung=75)


def test_specialist_skills_count_twice_as_much_as_general_ones(demo):
    required = ["Apex", "Lightning Web Components", "REST APIs", "Git & Version Control"]
    people = {m["employeeId"]: m for m in talent.match_candidates({"projectName": "CRM", "requiredSkills": required})["matches"]}
    general = next(m for m in people.values() if set(m["missingSkills"]) == {"Apex", "Lightning Web Components"})
    special = next(m for m in people.values() if set(m["missingSkills"]) == {"REST APIs", "Git & Version Control"})
    assert (general["technicalMatchPct"], special["technicalMatchPct"]) == (33, 67)      # 1 of 3, 2 of 3
    assert "specialist ones counting double" in general["matchExplanation"]
    # An opening named after a general skill counts it in full.
    assert matching.weight("SQL") == 0.5 and matching.weight("SQL", "SQL Developer") == 1 and matching.weight("Apex") == 1
    assert all(matching.named_exactly(s, catalog.get_skills()) for s in matching.GENERAL_SKILLS)


def test_people_of_another_trade_do_not_crowd_the_top(demo):
    """Among the best five for each opening, those from an unrelated role are rare."""
    related = {}
    for line in (config.REPO_ROOT / "backend" / "seed" / "source" / "related_roles.txt").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            role, near = line.split(":")
            related[role.strip()] = {n.strip() for n in near.split(",")}
    odd = places = 0
    for f in sorted((config.REPO_ROOT / "sample-data" / "job-descriptions").glob("*.txt")):
        text = f.read_text(encoding="utf-8")
        role = text.splitlines()[0].split(":", 1)[1].strip()
        kin = {role, *related[role], *(r for r, near in related.items() if role in near)}
        best = ladder({**talent.parse_job_description(text), "projectName": role})[:5]
        odd += sum(m["primaryRole"] not in kin for m in best)
        places += len(best)
    assert odd / places < 0.04, f"{odd} of {places}"


def test_the_first_people_of_the_base_data_keep_their_place(demo):
    from backend.app.repositories import demands
    first = talent.match_candidates(demands.get_project_demand_by_id("OPP-1015"))["matches"][0]
    assert first["fullName"] == "Neha"


def test_no_team_is_too_large_to_coach_or_has_two_people_of_one_first_name():
    teams = {}
    for u in rows("users"):
        if u["role"] == "employee":
            teams.setdefault(u["managerId"], []).append(u["name"].split()[0])
    assert max(map(len, teams.values())) <= 17
    assert all(len(names) == len(set(names)) for names in teams.values())


def test_optional_skills_are_kept_apart_from_required_ones(demo, manager):
    text = "Java Developer\nMust have\n- Java\n- Spring Boot\nGood to have\n- Docker\nKafka would be a plus."
    parsed = manager.post("/api/project-demand/parse-jd", json={"jobDescriptionText": text}).json()["parsed"]
    assert parsed["requiredSkills"] == ["Java", "Spring Boot"]
    assert set(parsed["preferredSkills"]) == {"Docker", "Apache Kafka"}


def test_the_labelled_lines_of_a_job_description_are_read(demo):
    parsed = talent.parse_job_description(
        "Job title: Senior Java Developer\nClient: Acme Bank\nLocation: Pune\nOpenings: 3\nExperience: 5+ years\n"
        "Skills: Java, SQL\nJoining by 2027-02-01. Client interview on 2027-01-10. Contract role.")
    assert (parsed["projectName"], parsed["customerName"], parsed["location"]) == ("Senior Java Developer", "Acme Bank", "Pune")
    assert (parsed["resourcesRequired"], parsed["experienceRangeMin"], parsed["experienceRangeMax"]) == (3, 5, 5)
    assert (parsed["clientInterviewDate"], parsed["expectedJoiningDate"]) == ("2027-01-10", "2027-02-01")
    assert parsed["domain"] == "Banking" and parsed["employmentType"] == "Contract"


def test_a_skill_nobody_has_is_said_so_and_not_matched_away(demo, manager):
    parsed = manager.post("/api/project-demand/parse-jd", json={"jobDescriptionText": NOBODY_HAS}).json()["parsed"]
    assert {"Qiskit", "Quantum error correction", "Python"} <= set(parsed["requiredSkills"])
    result = talent.match_candidates(parsed)
    assert set(result["uncoveredSkills"]) == {"Qiskit", "Quantum error correction"}
    assert all(m["technicalMatchPct"] < 50 for m in result["matches"])
    assert {"Qiskit", "Quantum error correction"} <= set(result["matches"][0]["missingSkills"])


def test_every_demo_job_description_reads_back_as_its_own_demand(demo):
    for d in rows("project_demands"):
        parsed = talent.parse_job_description(d["rawJobDescription"])
        assert set(parsed["requiredSkills"]) == set(json.loads(d["requiredSkills"])), d["projectName"]
        assert (parsed["projectName"], parsed["customerName"]) == (d["projectName"], d["customerName"])
        assert (parsed["experienceRangeMin"], parsed["experienceRangeMax"]) == (d["experienceRangeMin"], d["experienceRangeMax"])


# --------------------------------------------------------------------------- #
# The whole flow, for someone in the demo company
# --------------------------------------------------------------------------- #

def test_a_demo_employee_can_be_handed_off_and_assessed(demo, manager):
    from fastapi.testclient import TestClient
    from backend.app.main import app

    demand = next(d for d in rows("project_demands") if d["projectName"] == "Claims Knowledge Assistant")
    ranking = manager.post("/api/project-demand/match", json={"demandId": demand["id"]}).json()["matches"]
    person = next(m for m in ranking if m["missingSkills"])
    handed = manager.post("/api/project-demand/handoff-skillgap", json={
        "employeeId": person["employeeId"], "demandId": demand["id"]}).json()
    assert handed["missingSkills"] == person["missingSkills"] and handed["interviewPassed"] is False

    me = TestClient(app)
    assert me.post("/api/auth/login", json={"identifier": person["employeeId"], "password": PASSWORD}).status_code == 200
    made = me.post("/api/agent/generate-jd-assessment", json={
        "assessmentMode": "project_hiring", "demandId": demand["id"]}).json()["assessment"]
    assert len(made["mcqs"]) == 8
    assert {q["skillArea"] for q in made["mcqs"]} <= set(json.loads(demand["requiredSkills"]))
    assert made["mcqs"][0]["skillArea"] in person["missingSkills"]     # what is missing is asked first
