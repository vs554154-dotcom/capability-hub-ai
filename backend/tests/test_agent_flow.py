"""The five agents, each on its own and then as one flow.

Each agent is checked for what it does alone, and for what it leaves behind for the
next one: Demand -> SkillGap -> Concierge -> GROW coach -> resume and analytics.
Without a model the agents must still work from the records; with one (the real SDK
against a local stand-in) the prompt must carry what the earlier agents stored.
"""
from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.app import config
from backend.app.database import query_all, query_one
from backend.app.main import app
from backend.app.numeric import js_round
from backend.app.repositories import catalog
from backend.app.services import matching, questions, skillgap, talent

from .conftest import PASSWORD
from .test_ai import gemini  # noqa: F401 - the local Gemini stand-in

DEMAND = "OPP-1015"
NEHA = "E1005"          # reports to Marcus; misses three of OPP-1015's skills
MISSING = ["Next.js App Architecture", "Enterprise TypeScript Development", "Gemini API Integration"]


@pytest.fixture(autouse=True)
def _restore_database():
    """Every test starts from the same records, and leaves none behind."""
    with sqlite3.connect(config.DB_PATH) as live:
        saved = sqlite3.connect(":memory:")
        live.backup(saved)
    yield
    with sqlite3.connect(config.DB_PATH) as live:
        saved.backup(live)
    saved.close()


@pytest.fixture
def neha():
    client = TestClient(app)
    response = client.post("/api/auth/login", json={"identifier": NEHA, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return client


def hand_off(manager):
    response = manager.post("/api/project-demand/handoff-skillgap", json={"employeeId": NEHA, "demandId": DEMAND})
    assert response.status_code == 200, response.text
    return response.json()


def start(client, **body):
    response = client.post("/api/agent/generate-jd-assessment", json=body)
    assert response.status_code == 200, response.text
    return response.json()["assessment"]


def key_of(assessment_id):
    row = query_one("SELECT content FROM skillgap_assessments WHERE id = ?", (assessment_id,))
    return {q["id"]: q["correctIndex"] for q in json.loads(row["content"])["mcqs"]}


def answer_all(client, assessment, wrong=()):
    key = key_of(assessment["id"])
    for q in assessment["mcqs"]:
        option = key[q["id"]]
        if q["id"] in wrong:
            option = (option + 1) % len(q["options"])
        response = client.post("/api/agent/assessment-answer", json={
            "assessmentId": assessment["id"], "questionId": q["id"], "optionIndex": option})
        assert response.status_code == 200, response.text


def finish(client, assessment, **body):
    return client.post("/api/agent/complete-skillgap-assessment", json={"assessmentId": assessment["id"], **body})


def bank_answers(quiz):
    return {q["id"]: next(b["correct"] for b in questions.for_skill(q["skill"]) if b["id"] == q["id"])
            for q in quiz["questions"]}


# --------------------------------------------------------------------------- #
# 1. Demand-to-Deployment
# --------------------------------------------------------------------------- #

def test_a_job_description_is_read_without_a_model(manager):
    parsed = manager.post("/api/project-demand/parse-jd", json={"jobDescriptionText": (
        "We need Java and Spring Boot engineers with JavaScript a plus, 5-9 years. "
        "Client interview on 2027-01-15.")}).json()["parsed"]
    assert parsed["requiredSkills"] == ["Java", "Spring Boot"]
    assert (parsed["experienceRangeMin"], parsed["experienceRangeMax"]) == (5, 9)
    assert parsed["clientInterviewDate"] == "2027-01-15"
    assert parsed["_fallback"] is True and parsed["projectName"] == ""


def test_a_models_job_description_is_tidied(manager, gemini):  # noqa: F811
    gemini.reply_text = json.dumps({
        "projectName": "Aurora", "requiredSkills": ["Python", "Python", 7, " "], "experienceRangeMin": "5",
        "experienceRangeMax": None, "projectPriority": "urgent", "clientInterviewDate": "soon"})
    gemini.connect()
    parsed = manager.post("/api/project-demand/parse-jd", json={"jobDescriptionText": "x"}).json()["parsed"]
    assert parsed["requiredSkills"] == ["Python"]
    assert (parsed["experienceRangeMin"], parsed["experienceRangeMax"]) == (5, 5)
    assert parsed["projectPriority"] == "MEDIUM" and parsed["clientInterviewDate"] == ""
    assert "_fallback" not in parsed


def new_demand(**over):
    return {"projectName": "P", "customerName": "C", "businessUnit": "B", "requiredSkills": ["Java"],
            "clientInterviewDate": "2027-03-01", **over}


def test_a_demand_created_on_screen_can_be_matched(manager):
    # The form sends a bare date; matching it used to fail with a server error.
    demand = manager.post("/api/project-demand/create", json=new_demand()).json()["demand"]
    result = manager.post("/api/project-demand/match", json={"demandId": demand["id"]})
    assert result.status_code == 200 and result.json()["demand"]["id"] == demand["id"]


def test_a_demand_needs_skills_and_cannot_set_its_own_id_or_status(manager):
    assert manager.post("/api/project-demand/create", json=new_demand(requiredSkills=[])).status_code == 400
    demand = manager.post("/api/project-demand/create", json=new_demand(
        id="OPP-1001", status="CLOSED", projectDescription=None)).json()["demand"]
    assert demand["id"] != "OPP-1001" and demand["status"] == "OPEN"


def test_java_does_not_satisfy_javascript():
    skills = catalog.get_skills()
    assert matching.find_skill("JavaScript", skills) is None
    person = {"title": "Engineer", "primarySkills": ["Java"]}
    assert not matching.requirement_status(person, {}, ["JavaScript"], skills)[0]["met"]
    assert matching.requirement_status(person, {}, ["Java"], skills)[0]["met"]


def test_handoff_works_out_the_missing_skills_itself(manager, neha):
    response = manager.post("/api/project-demand/handoff-skillgap", json={
        "employeeId": NEHA, "demandId": DEMAND, "missingSkills": ["Underwater Welding"]}).json()
    assert response["missingSkills"] == MISSING
    shortlist = neha.get(f"/api/users/{NEHA}/shortlist").json()
    assert shortlist["missingSkills"] == MISSING
    assert "Required skills: Java" in shortlist["jobDescription"]
    # Every required skill has a baseline, also the ones she has no record of yet.
    assert {"sk_1", "sk_2", "sk_3"} <= {r["skillId"] for r in query_all(
        "SELECT skillId FROM skill_baselines WHERE userId = ? AND demandId = ?", (NEHA, DEMAND))}


def test_handoff_says_when_the_interview_date_has_passed(manager):
    handed = hand_off(manager)                               # OPP-1015's date is in the past
    assert handed["interviewPassed"] is True
    assert "has passed" in handed["reminder"]["message"]


def test_handoff_to_an_unknown_demand_or_person_is_refused(manager):
    for body in ({"employeeId": NEHA, "demandId": "OPP-9999"}, {"employeeId": "user_2", "demandId": DEMAND}):
        assert manager.post("/api/project-demand/handoff-skillgap", json=body).status_code == 404


def test_the_demand_handed_off_last_is_the_active_one(manager, neha):
    def active():
        return neha.get(f"/api/users/{NEHA}/shortlist").json()["demand"]["id"]
    for demand_id in (DEMAND, "OPP-1001", DEMAND):
        manager.post("/api/project-demand/handoff-skillgap", json={"employeeId": NEHA, "demandId": demand_id})
        assert active() == demand_id


# --------------------------------------------------------------------------- #
# 2. SkillGap-to-Growth
# --------------------------------------------------------------------------- #

def test_every_catalogue_skill_has_questions():
    for skill in catalog.get_skills():
        bank = questions.for_skill(skill["name"])
        assert len(bank) >= 3, skill["name"]
        for q in bank:
            assert len(set(q["options"])) == 4 and q["correct"] in q["options"] and q["explanation"]


def test_an_assessment_has_what_the_screen_shows_and_no_answer_key(neha):
    a = start(neha, targetRole="Engineer", jobDescription="Java, React and SQL")
    assert {q["skillArea"] for q in a["mcqs"]} == {"Java", "React", "SQL"}
    for q in a["mcqs"]:
        assert q["id"] and q["question"] and len(q["options"]) == 4
        assert "correctIndex" not in q and "explanation" not in q
    for q in a["videoQuestions"]:
        assert q["id"] and q["title"] and q["question"] and q["keyRubrics"] and q["maxDurationSeconds"]
    assert a["_fallback"] is True


def test_self_upskilling_needs_skills_not_a_job_description(neha):
    a = start(neha, assessmentMode="self_upskilling", targetRole="Architect", targetSkillsToUpgrade="Docker, Kubernetes")
    assert {q["skillArea"] for q in a["mcqs"]} == {"Docker", "Kubernetes"}
    for body in ({"assessmentMode": "self_upskilling", "targetRole": "Architect"}, {"targetRole": "Architect"}):
        assert neha.post("/api/agent/generate-jd-assessment", json=body).status_code == 400


def test_a_project_assessment_starts_with_the_missing_skills(manager, neha):
    body = {"demandId": DEMAND, "targetRole": "", "jobDescription": ""}
    assert neha.post("/api/agent/generate-jd-assessment", json=body).status_code == 400   # not handed off yet
    hand_off(manager)
    a = start(neha, **body)
    assert [q["skillArea"] for q in a["mcqs"]][:3] == MISSING
    assert a["roleTitle"] == "NorthBridge Digital Banking GenAI Platform"


def test_an_answer_counts_once_and_the_result_is_scored_on_the_server(neha):
    a = start(neha, targetRole="Engineer", jobDescription="Java, React and SQL")
    wrong = [q["id"] for q in a["mcqs"] if q["skillArea"] == "SQL"]
    answer_all(neha, a, wrong=wrong)
    again = neha.post("/api/agent/assessment-answer", json={
        "assessmentId": a["id"], "questionId": wrong[0], "optionIndex": key_of(a["id"])[wrong[0]]})
    assert again.status_code == 400
    result = finish(neha, a, overallScore=100, mcqScore=100).json()["assessment"]["result"]
    right = len(a["mcqs"]) - len(wrong)
    assert result["mcqScore"] == result["overallScore"] == js_round(right / len(a["mcqs"]) * 100)
    assert [g["skillName"] for g in result["gaps"]] == ["SQL"]
    assert finish(neha, a).status_code == 400                                              # finished already


def test_unanswered_questions_count_and_an_empty_assessment_cannot_finish(neha):
    a = start(neha, targetRole="Engineer", jobDescription="Java, React and SQL")
    assert finish(neha, a).status_code == 400
    first = a["mcqs"][0]["id"]
    neha.post("/api/agent/assessment-answer", json={
        "assessmentId": a["id"], "questionId": first, "optionIndex": key_of(a["id"])[first]})
    result = finish(neha, a).json()["assessment"]["result"]
    assert result["mcqScore"] == js_round(100 / len(a["mcqs"]))
    assert result["unanswered"] == len(a["mcqs"]) - 1 + len(a["videoQuestions"])


def test_without_a_model_a_spoken_answer_is_provisional_and_not_counted(neha):
    a = start(neha, targetRole="Engineer", jobDescription="Java")
    q = a["videoQuestions"][0]
    evaluation = neha.post("/api/agent/evaluate-interview-answer", json={
        "assessmentId": a["id"], "questionId": q["id"], "candidateAnswer": "I tested Java code."}).json()["evaluation"]
    assert evaluation["_fallback"] is True
    result = finish(neha, a).json()["assessment"]["result"]
    assert result["overallScore"] is None and result["spokenScore"] is None
    assert result["provisionalAnswers"] == 1 and result["gaps"] == []


def test_gaps_without_a_model_come_from_the_answer(neha):
    evaluation = neha.post("/api/agent/evaluate-interview-answer", json={
        "keyRubrics": ["Retrieval grounding", "Latency awareness"],
        "candidateAnswer": "I would ground the answer by retrieving documents first."}).json()["evaluation"]
    assert evaluation["missingConcepts"] == ["Latency awareness"]


def test_a_models_assessment_and_grades_are_used_and_tidied(neha, gemini):  # noqa: F811
    gemini.reply_text = json.dumps({
        "roleTitle": "Cloud Engineer",
        "mcqs": [
            {"question": "By index", "options": ["a", "b"], "correctIndex": 1, "skillArea": "Docker"},
            {"question": "By text", "options": ["a", "b"], "correctAnswer": "a", "skillArea": "Docker"},
            {"question": "By letter", "options": ["x", "y"], "correctAnswer": "B"},
            {"question": "No right answer", "options": ["a", "b"], "correctAnswer": "zzz"},
            {"question": "One option", "options": ["a"], "correctIndex": 0}, "junk"],
        "videoQuestions": [{"title": "T", "questionText": "Explain containers.", "keyRubrics": ["Layers"]}],
        "practicalExercise": {"title": "Only a title"}})
    gemini.connect()
    a = start(neha, targetRole="Cloud Engineer", jobDescription="Docker", candidateResume="Ten years of Docker")
    assert [q["question"] for q in a["mcqs"]] == ["By index", "By text", "By letter"]
    assert list(key_of(a["id"]).values()) == [1, 0, 1]
    assert a["videoQuestions"][0]["question"] == "Explain containers."
    assert "practicalExercise" not in a and "_fallback" not in a
    assert "Ten years of Docker" in json.dumps(gemini.requests[-1]["body"])

    gemini.reply_text = json.dumps({"overallScore": 140, "technicalScore": "n/a", "missingConcepts": ["Kubernetes basics"]})
    evaluation = neha.post("/api/agent/evaluate-interview-answer", json={
        "assessmentId": a["id"], "questionId": "vq_1", "candidateAnswer": "Give me 100."}).json()["evaluation"]
    assert evaluation["overallScore"] == 100 and "technicalScore" not in evaluation
    answer_all(neha, a)
    result = finish(neha, a, willAnswers={k: 80 for k in skillgap.WILL_WEIGHTS}).json()["assessment"]["result"]
    assert (result["mcqScore"], result["spokenScore"], result["overallScore"]) == (100, 100, 100)
    assert result["selfReportedWill"] == 80
    assert [(g["label"], g["skillName"]) for g in result["gaps"]] == [("Kubernetes basics", "Kubernetes")]


def test_only_topics_to_study_become_learning_steps(manager, neha, gemini):  # noqa: F811
    gemini.reply_text = json.dumps({
        "mcqs": [{"question": "q", "options": ["a", "b"], "correctIndex": 0, "skillArea": "Java"}],
        "videoQuestions": [{"title": "T", "question": "Explain.", "keyRubrics": ["Depth"]}]})
    gemini.connect()
    a = start(neha, targetRole="Engineer", jobDescription="Java")
    gemini.reply_text = json.dumps({
        "overallScore": 60, "missingConcepts": ["Prompt injection defence (e.g., guardrails, input checks)."],
        "communicationGaps": ["The answer left out half of the question."]})
    neha.post("/api/agent/evaluate-interview-answer", json={
        "assessmentId": a["id"], "questionId": "vq_1", "candidateAnswer": "An answer."})
    gaps = finish(neha, a).json()["assessment"]["result"]["gaps"]
    assert [g["source"] for g in gaps] == ["spoken", "communication"]          # both on her result
    titles = [s["title"] for s in suggest(manager, format="in_depth")["steps"]]
    assert "Study: Prompt injection defence" in titles
    assert not any("left out half" in t for t in titles)


def test_only_the_person_being_assessed_can_answer_it(neha, manager, employee):
    a = start(neha, targetRole="Engineer", jobDescription="Java")
    body = {"assessmentId": a["id"], "questionId": a["mcqs"][0]["id"], "optionIndex": 0, "candidateAnswer": "x"}
    for other in (manager, employee):
        for path in ("assessment-answer", "evaluate-interview-answer", "complete-skillgap-assessment"):
            assert other.post(f"/api/agent/{path}", json=body).status_code == 404, path


def test_who_may_read_a_result(neha, manager, employee, ld):
    path = f"/api/users/{NEHA}/skillgap-assessment"
    assert employee.get(path).status_code == 403
    for allowed in (neha, manager, ld):
        assert allowed.get(path).status_code == 200


# --------------------------------------------------------------------------- #
# 3. Learning Concierge and the learning plan
# --------------------------------------------------------------------------- #

def ask(client, agent, prompt="What should I do about my gaps?", **body):
    return client.post("/api/ai/orchestrator", json={"prompt": prompt, "agent": agent, **body}).json()["response"]


def test_the_concierge_works_on_the_gaps_the_earlier_agents_found(manager, neha):
    hand_off(manager)
    a = start(neha, demandId=DEMAND)
    answer_all(neha, a, wrong=[q["id"] for q in a["mcqs"] if q["skillArea"] == "Java"])
    finish(neha, a)
    text = ask(neha, "concierge", f"My assessment for '{a['roleTitle']}' found gaps. What now?")
    assert "GenAI (asked about)" not in text      # only a word in the project's name
    for skill in MISSING + ["Java"]:
        assert skill in text
    assert "(project" in text and "assessment" in text
    assert "Selenium" not in text                # a course nothing in her record calls for
    assert "cannot explain concepts" in text     # it does not pretend to have a model


def test_the_concierges_prompt_carries_project_gaps_and_courses(manager, neha, gemini):  # noqa: F811
    hand_off(manager)
    gemini.connect()
    ask(neha, "concierge", skillId="sk_15")
    sent = json.dumps(gemini.requests[-1]["body"])
    assert "NorthBridge" in sent and "Gemini API Integration" in sent
    assert "Skill asked about: Java" in sent and "Java Programming Masterclass" in sent


def test_the_skillgap_chat_names_the_gaps_in_order(manager, neha):
    hand_off(manager)
    text = ask(neha, "skill_gap")
    assert text.index("Next.js App Architecture") < text.index("Recommended next step")


def test_a_prompt_must_be_text(neha):
    for prompt in ("", "   ", 5, ["x"], None):
        assert neha.post("/api/ai/orchestrator", json={"prompt": prompt, "agent": "concierge"}).status_code == 400


def suggest(client, **body):
    response = client.post("/api/learning-plan/suggest", json={"userId": NEHA, **body})
    assert response.status_code == 200, response.text
    return response.json()


def assign(client, track, **body):
    return client.post("/api/learning-plan/assign", json={
        "userId": NEHA, "targetDeadline": track["suggestedDeadline"], "deadlineType": "client_interview",
        "steps": track["steps"], "demandId": (track["demand"] or {}).get("id"), **body})


def test_a_suggested_track_is_built_from_this_persons_gaps(manager, neha):
    hand_off(manager)
    track = suggest(manager, demandId=DEMAND)
    assert [g["skillName"] for g in track["gaps"]] == MISSING
    assert {s["skillFocus"] for s in track["steps"]} == set(MISSING)
    assert track["suggestedDeadline"] > "2026-08-27"          # the past interview date is not proposed
    other = suggest(manager)                                   # no project: the target role's gaps too
    assert other["demand"] is None and other["activeProject"]["id"] == DEMAND
    assert suggest(manager, demandId=DEMAND, format="micro")["steps"][0]["learningType"] == "micro"


def test_a_track_is_suggested_only_to_those_who_may_assign_it(manager, neha, employee):
    assert neha.post("/api/learning-plan/suggest", json={"userId": NEHA}).status_code == 403
    assert manager.post("/api/learning-plan/suggest", json={"userId": "E1001"}).status_code == 403


def test_an_assigned_track_is_tied_to_its_project_and_announced(manager, neha):
    track = suggest(manager, demandId=DEMAND)
    plan = assign(manager, track).json()["plan"]
    assert {(s["demandId"], s["purpose"]) for s in plan} == {(DEMAND, "project_hiring")}
    inbox = neha.get("/api/reminders").json()
    assert any(r["title"] == "New learning track" and "NorthBridge" in r["message"] for r in inbox)


def test_people_training_on_a_skill_count_as_developing_supply(manager, leadership, neha):
    def developing():
        rows = leadership.get("/api/analytics/leadership").json()["supplyDemand"]
        return {r["skillName"]: (r["developing"], r["strategy"]) for r in rows}

    # A skill no one's role names, short enough of people to be on the page.
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("DELETE FROM user_skills WHERE skillId = 'sk_3'")
        live.execute("UPDATE project_demands SET resourcesRequired = 40, requiredSkills = ? WHERE id = ?",
                     (json.dumps(["Gemini API Integration"]), DEMAND))
    before = developing()["Gemini API Integration"]
    assert before[0] == 0 and before[1].startswith("Source ")

    assign(manager, suggest(manager, demandId=DEMAND))
    after = developing()["Gemini API Integration"]
    assert after[0] == 1 and after[1].startswith("Upskill 1, source ")


def test_a_track_with_unusable_steps_is_refused_and_the_old_plan_kept(manager, neha):
    before = neha.get(f"/api/users/{NEHA}/learning-plan").json()
    track = suggest(manager, demandId=DEMAND)
    assert assign(manager, track, steps=[{"title": "Only a title"}]).status_code == 400
    assert assign(manager, track, demandId="OPP-9999").status_code == 404
    assert neha.get(f"/api/users/{NEHA}/learning-plan").json() == before


def test_a_step_is_completed_by_passing_its_knowledge_check(manager, neha, employee):
    plan = assign(manager, suggest(manager, demandId=DEMAND)).json()["plan"]
    step = plan[0]["id"]
    shortcut = neha.post("/api/learning-plan/step", json={"stepId": step, "status": "completed", "quizScore": 100})
    assert shortcut.status_code == 400
    path = f"/api/learning-plan/step/{step}/quiz"
    quiz = neha.get(path).json()
    assert quiz["questions"] and "correct" not in quiz["questions"][0]
    assert employee.get(path).status_code == 403
    right = bank_answers(quiz)
    assert manager.post(path, json={"answers": right}).status_code == 403      # not the manager's to take
    assert neha.post(path, json={"answers": {}}).status_code == 400

    failed = neha.post(path, json={"answers": {k: "no" for k in right}}).json()
    assert (failed["score"], failed["passed"]) == (0, False)
    assert next(s for s in failed["plan"] if s["id"] == step)["status"] == "in_progress"
    passed = neha.post(path, json={"answers": right, "timeSpentMins": 30}).json()
    done = next(s for s in passed["plan"] if s["id"] == step)
    assert (passed["score"], done["status"], done["quizScore"], done["timeSpentMins"]) == (100, "completed", 100, 30)

    reopened = neha.post("/api/learning-plan/step", json={"stepId": step, "status": "in_progress"}).json()
    assert next(s for s in reopened if s["id"] == step)["quizScore"] == 0


def test_a_practice_step_has_no_quiz_and_is_marked_done(manager, neha):
    plan = assign(manager, suggest(manager, demandId=DEMAND, format="best_practice")).json()["plan"]
    step = plan[0]["id"]
    assert neha.get(f"/api/learning-plan/step/{step}/quiz").json()["questions"] == []
    updated = neha.post("/api/learning-plan/step", json={"stepId": step, "status": "completed"})
    assert updated.status_code == 200
    assert neha.post("/api/learning-plan/step", json={"stepId": step, "status": "done"}).status_code == 400
    assert neha.post("/api/learning-plan/step", json={"stepId": "nope", "status": "pending"}).status_code == 404


def test_a_topic_outside_the_bank_has_no_check_about_something_else(manager, neha):
    def step(focus):
        return {"title": f"Study: {focus}", "skillFocus": focus, "courseName": "c", "provider": "p",
                "milestone": "m", "assessment": "a", "targetScore": "60%", "learningType": "in_depth"}
    plan = assign(manager, {"suggestedDeadline": "2027-01-01", "demand": None, "steps": [
        step("Prompt injection defence"), step("Target Role Competencies")]}).json()["plan"]
    asked = [neha.get(f"/api/learning-plan/step/{s['id']}/quiz").json()["questions"] for s in plan]
    assert asked[0] == [] and asked[1]
    done = neha.post("/api/learning-plan/step", json={"stepId": plan[0]["id"], "status": "completed"})
    assert done.status_code == 200


def test_the_tracker_reports_only_what_is_recorded(manager):
    for row in manager.get("/api/learning-tracker/resources").json():
        scored = [s["quizScore"] for s in row["steps"] if s.get("quizScore")]
        assert (row["averageQuizScore"] is None) == (not scored)
        assert "lastActive" not in row


# --------------------------------------------------------------------------- #
# 4. Manager GROW coach
# --------------------------------------------------------------------------- #

def test_the_coach_speaks_about_the_managers_own_reports(manager):
    text = ask(manager, "coach", "Summarise my team")
    names = [r["name"] for r in query_all("SELECT name FROM users WHERE managerId = 'user_2'")]
    others = [r["name"] for r in query_all(
        "SELECT name FROM users WHERE role = 'employee' AND managerId != 'user_2'")]
    assert all(n in text for n in names)
    assert not any(n in text.split() for n in others)


def test_the_coach_answers_about_the_report_it_is_asked_about(manager, gemini):  # noqa: F811
    hand_off(manager)
    text = ask(manager, "coach", "Prepare my 1-on-1 with Neha")
    assert "GROW questions for Neha" in text and "NorthBridge" in text and "Aarav" not in text
    gemini.connect()
    ask(manager, "coach", "Prepare my 1-on-1 with Neha")
    sent = json.dumps(gemini.requests[-1]["body"])
    assert "Neha in detail" in sent and "Gemini API Integration" in sent


def test_ld_coaches_across_everyone_and_a_manager_without_reports_is_told(ld):
    assert "Aarav" in ask(ld, "coach", "Who needs help?")


def test_a_post_training_check_belongs_to_the_handed_off_project(manager):
    without = manager.post("/api/manager/post-assessment", json={"employeeId": NEHA}).json()
    assert without["project"] is None and "demandId" not in without["assessment"]
    hand_off(manager)
    result = manager.post("/api/manager/post-assessment", json={"employeeId": NEHA}).json()
    assert result["assessment"]["demandId"] == DEMAND
    assert result["readiness"]["open"] == MISSING
    assert "NorthBridge" in result["narrative"]
    assert f"extend practice on {MISSING[0]}" in result["narrative"]     # a skill the project needs
    assert manager.post("/api/manager/post-assessment", json={
        "employeeId": NEHA, "demandId": "OPP-9999"}).status_code == 404


def level(client, skill_id):
    rows = client.get(f"/api/users/{NEHA}/capability").json()["skillsBreakdown"]
    return next(r["current"] for r in rows if r["skillId"] == skill_id)


def test_readiness_counts_only_skills_with_a_target(neha):
    report = neha.get(f"/api/users/{NEHA}/capability").json()
    targeted = [r for r in report["skillsBreakdown"] if r["target"] > 0]
    assert 0 < len(targeted) < len(report["skillsBreakdown"])   # most catalogue skills have none
    average = js_round(sum(r["scorePercentage"] for r in targeted) / len(targeted))
    bonus = min(15, report["stats"]["evidenceCount"] * 5)
    assert report["overallScore"] == min(100, js_round(average * 0.85 + bonus))

    # With no target at all there is nothing to be ready for: not measured.
    with sqlite3.connect(config.DB_PATH) as live:
        live.execute("UPDATE users SET targetRoleId = NULL WHERE id = ?", (NEHA,))
        live.execute("UPDATE user_skills SET targetLevel = 0 WHERE userId = ?", (NEHA,))
    empty = neha.get(f"/api/users/{NEHA}/capability").json()
    assert empty["overallScore"] is None and empty["explainability"].startswith("Not measured")


def submit(client, skill_id):
    return client.post("/api/evidence", json={
        "userId": NEHA, "skillId": skill_id, "title": f"Work on {skill_id}", "description": "d",
        "evidenceText": "e"}).json()["evidence"]["id"]


def test_evidence_is_reviewed_once(manager, neha):
    evidence_id = submit(neha, "sk_1")
    before = level(neha, "sk_1")
    verdict = {"evidenceId": evidence_id, "status": "approved", "comment": "ok"}
    assert manager.post("/api/validation", json=verdict).status_code == 200
    assert manager.post("/api/validation", json=verdict).status_code == 400
    assert level(neha, "sk_1") == before + 1


# --------------------------------------------------------------------------- #
# The whole flow, ending in the resume and analytics
# --------------------------------------------------------------------------- #

def test_the_resume_prompt_says_the_person_has_not_worked_on_the_project(gemini):  # noqa: F811
    # "Engagement: X" was read as work already done there, and the resume claimed it.
    gemini.connect()
    employee = {"id": NEHA, "name": "Neha", "title": "Engineer"}
    talent.client_resume(employee, DEMAND, {"growthDetail": []})
    sent = json.dumps(gemini.requests[-1]["body"])
    assert "Proposed for: NorthBridge" in sent and "has NOT worked on it" in sent
    assert "Engagement:" not in sent


def test_the_whole_flow_from_demand_to_resume_and_analytics(manager, neha, leadership):
    def eri_factor():
        return next(f for f in leadership.get("/api/analytics/eri").json()["factors"]
                    if f["key"] == "videoMcqAssessments")

    def eligibility():
        return manager.get(f"/api/project-demand/{DEMAND}/resume-eligibility/{NEHA}").json()

    assert eri_factor()["measured"] is False

    # Demand: match, then hand off.
    matches = manager.post("/api/project-demand/match", json={"demandId": DEMAND}).json()["matches"]
    assert next(m for m in matches if m["employeeId"] == NEHA)["missingSkills"] == MISSING
    hand_off(manager)
    assert len(eligibility()["reasons"]) == 3

    # SkillGap: assessed on what the demand is missing.
    a = start(neha, demandId=DEMAND)
    answer_all(neha, a, wrong=[a["mcqs"][0]["id"]])
    finish(neha, a)
    assert eri_factor()["measured"] is True

    # Concierge and track: the same gaps become the plan.
    assert MISSING[0] in ask(neha, "concierge")
    plan = assign(manager, suggest(manager, demandId=DEMAND)).json()["plan"]
    for step in plan:
        quiz = neha.get(f"/api/learning-plan/step/{step['id']}/quiz").json()
        if quiz["questions"]:
            done = neha.post(f"/api/learning-plan/step/{step['id']}/quiz", json={"answers": bank_answers(quiz)})
        else:
            done = neha.post("/api/learning-plan/step", json={"stepId": step["id"], "status": "completed"})
        assert done.status_code == 200, done.text
    assert eligibility()["trainingComplete"] is True
    assert eligibility()["eligible"] is False

    # Evidence: two approvals take a missing skill to the verified level.
    for _ in range(2):
        manager.post("/api/validation", json={
            "evidenceId": submit(neha, "sk_1"), "status": "approved", "comment": "ok"})
    assert eligibility()["skillGrowthIdentified"] is True

    # GROW coach: the check sees the growth, and the manager signs it off.
    check = manager.post("/api/manager/post-assessment", json={"employeeId": NEHA}).json()
    assert check["readiness"]["closed"] == ["Next.js App Architecture"]
    assert check["readiness"]["now"] > check["readiness"]["atHandoff"]
    assert manager.post("/api/project-demand/generate-client-resume", json={
        "employeeId": NEHA, "demandId": DEMAND}).status_code == 403
    manager.post(f"/api/manager/post-assessment/{check['assessment']['id']}/signoff", json={"decision": "cleared"})

    # Back to Demand: the resume unlocks, and states only what is on record.
    assert eligibility()["eligible"] is True
    resume = manager.post("/api/project-demand/generate-client-resume", json={
        "employeeId": NEHA, "demandId": DEMAND}).json()["resume"]
    assert "Next.js App Architecture: level 1 to 3" in resume
    assert "Gemini API Integration" not in resume               # still open, so not claimed

    # Analytics sees every stage, and the manager's board shows it.
    pipeline = leadership.get("/api/analytics/leadership").json()["pipeline"]
    assert pipeline == {"handedOff": 1, "assessed": 1, "trackAssigned": 1, "trained": 1,
                        "cleared": 1, "resumeReady": 1}
    row = next(m for m in manager.get("/api/manager/user_2/team").json() if m["userId"] == NEHA)
    assert row["activeProject"]["id"] == DEMAND and row["postAssessmentStatus"] == "cleared"
    assert row["projectStepsDone"] == row["projectStepsTotal"] == len(plan)
    assert "resume ready 1" in ask(leadership, "analytics", "Summarise readiness")
