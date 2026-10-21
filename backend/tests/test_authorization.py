"""Object-level authorization.

Role checks alone are not enough: a manager is a manager whichever employee they
name. These tests pin the second check - that the person a request is *about* is
one the caller may act on - on every endpoint that reads or changes a specific
person's data, and the scoping of every list endpoint to what the caller may see.

The rule, from deps.may_access: yourself; your direct reports if you manage;
anyone if you are L&D or Leadership.

Seed facts relied on: Marcus (user_2) manages E1000, E1005, E1010 and E1015.
Priya (E1001) reports to a different manager.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app

from .conftest import PASSWORD

MARCUS_TEAM = {"E1000", "E1005", "E1010", "E1015"}
OUTSIDE_EMPLOYEE = "E1001"


# --------------------------------------------------------------------------- #
# AI copilots: whose skills and evidence go into the prompt
# --------------------------------------------------------------------------- #

def test_orchestrator_is_grounded_in_the_caller_by_default(manager):
    # The caller is Marcus. The old default grounded every unspecified request in
    # E1000 (Aarav) - one real person's records in anyone's prompt - so this has to
    # be someone other than E1000 to tell the two apart.
    response = manager.post("/api/ai/orchestrator", json={"prompt": "next?", "agent": "skill_gap"})
    assert response.status_code == 200
    text = response.json()["response"]
    assert "Marcus" in text and "Aarav" not in text


def test_orchestrator_refuses_another_employees_data(employee):
    response = employee.post(
        "/api/ai/orchestrator", json={"userId": "E1005", "prompt": "next?", "agent": "skill_gap"}
    )
    assert response.status_code == 403


def test_manager_insight_only_for_own_reports(manager):
    assert manager.post("/api/manager/insight", json={"employeeId": "E1005"}).status_code == 200
    assert manager.post("/api/manager/insight", json={"employeeId": OUTSIDE_EMPLOYEE}).status_code == 403


def test_manager_insight_requires_an_employee(manager):
    # There used to be a silent default to E1000 - one real person's records.
    assert manager.post("/api/manager/insight", json={}).status_code == 400


def test_post_assessment_only_for_own_reports(manager):
    response = manager.post("/api/manager/post-assessment", json={"employeeId": OUTSIDE_EMPLOYEE})
    assert response.status_code == 403


def test_sign_off_requires_access_to_the_assessed_employee(manager, ld):
    created = ld.post("/api/manager/post-assessment", json={"employeeId": OUTSIDE_EMPLOYEE})
    assert created.status_code == 200
    assessment_id = created.json()["assessment"]["id"]

    # Sign-off unlocks the client resume, so a manager from another team cannot give it.
    refused = manager.post(
        f"/api/manager/post-assessment/{assessment_id}/signoff", json={"decision": "cleared"}
    )
    assert refused.status_code == 403

    allowed = ld.post(
        f"/api/manager/post-assessment/{assessment_id}/signoff", json={"decision": "cleared"}
    )
    assert allowed.status_code == 200


# --------------------------------------------------------------------------- #
# Evidence review
# --------------------------------------------------------------------------- #

def test_review_records_the_signed_in_reviewer(manager):
    response = manager.post("/api/validation", json={
        "evidenceId": "eng_ev_E1010_1",
        "reviewerId": "somebody_else",   # ignored: the reviewer is whoever is signed in
        "status": "revision_requested",
        "comment": "More detail please.",
    })
    assert response.status_code == 200
    assert response.json()["evidence"]["reviewedBy"] == "user_2"


def test_review_refused_for_another_teams_evidence(manager):
    response = manager.post("/api/validation", json={
        "evidenceId": "eng_ev_E1001_2", "status": "approved", "comment": "ok",
    })
    assert response.status_code == 403


def test_review_rejects_an_unknown_verdict(manager):
    # Every other field is valid - including reviewerId, which older code required -
    # so the verdict is the only thing that can be rejected.
    response = manager.post("/api/validation", json={
        "evidenceId": "eng_ev_E1010_2", "reviewerId": "user_2",
        "status": "promoted", "comment": "ok",
    })
    assert response.status_code == 400


def test_review_of_missing_evidence_is_404(manager):
    response = manager.post("/api/validation", json={
        "evidenceId": "does-not-exist", "status": "approved", "comment": "ok",
    })
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# List endpoints show no more than the single-record endpoints would
# --------------------------------------------------------------------------- #

def test_manager_evidence_queue_is_their_team(manager):
    owners = {e["userId"] for e in manager.get("/api/evidence").json()}
    assert owners and owners <= MARCUS_TEAM | {"user_2"}


def test_manager_cannot_list_another_teams_evidence(manager):
    assert manager.get(f"/api/evidence?userId={OUTSIDE_EMPLOYEE}").status_code == 403


def test_employee_evidence_is_always_their_own(employee):
    owners = {e["userId"] for e in employee.get(f"/api/evidence?userId={OUTSIDE_EMPLOYEE}").json()}
    assert owners == {"E1000"}


def test_manager_cannot_list_another_teams_reminders(manager):
    assert manager.get(f"/api/reminders?userId={OUTSIDE_EMPLOYEE}").status_code == 403


def test_learning_tracker_is_closed_to_employees(employee):
    assert employee.get("/api/learning-tracker/resources").status_code == 403


def test_learning_tracker_scope_follows_the_role(manager, ld):
    team = {row["userId"] for row in manager.get("/api/learning-tracker/resources").json()}
    assert team == MARCUS_TEAM
    everyone = ld.get("/api/learning-tracker/resources").json()
    assert len(everyone) == 20


def test_assigning_a_track_is_limited_to_own_reports(manager):
    response = manager.post("/api/learning-plan/assign", json={
        "userId": OUTSIDE_EMPLOYEE,
        "targetDeadline": "2026-12-01",
        "steps": [{"title": "Step"}],
    })
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Organisation-wide views
# --------------------------------------------------------------------------- #

def test_talent_matching_is_closed_to_employees(employee, manager):
    assert employee.post("/api/project-demand/match", json={"demandId": "OPP-1015"}).status_code == 403
    assert manager.post("/api/project-demand/match", json={"demandId": "OPP-1015"}).status_code == 200


def test_readiness_index_requires_an_org_wide_role(anon, employee, leadership):
    assert anon.get("/api/analytics/eri").status_code == 401
    assert employee.get("/api/analytics/eri").status_code == 403
    assert leadership.get("/api/analytics/eri").status_code == 200


# --------------------------------------------------------------------------- #
# Sign-in resolves to exactly the person named
# --------------------------------------------------------------------------- #

def test_a_name_signs_in_as_that_person_not_a_partial_match():
    # "neha" used to match Sneha (E1003) as a substring, because her row came first.
    # The first sign-in sets an account's password, so that would have claimed the
    # wrong person's account.
    client = TestClient(app)
    response = client.post("/api/auth/login", json={"identifier": "neha", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["id"] == "E1005"


def test_a_name_fragment_does_not_sign_in():
    response = TestClient(app).post("/api/auth/login", json={"identifier": "neh", "password": PASSWORD})
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Session cookie policy
# --------------------------------------------------------------------------- #

def test_plain_http_session_cookie_is_lax_and_not_secure():
    response = TestClient(app).post(
        "/api/auth/login", json={"identifier": "E1000", "password": PASSWORD}
    )
    cookie = response.headers["set-cookie"].lower()
    assert "samesite=lax" in cookie
    assert "secure" not in cookie
