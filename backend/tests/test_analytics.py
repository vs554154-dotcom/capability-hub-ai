"""Organisation analytics: the Enterprise Readiness Index and the Leadership overview.

The index used to be the constant 84. These tests pin that it is computed from
stored records, that components the system cannot measure are excluded rather than
assumed, and that its trend comes only from recorded daily readings.
"""
from __future__ import annotations

from backend.app.database import query_all, query_one
from backend.app.numeric import js_round
from backend.app.repositories import catalog, user_skills
from backend.app.services import capability
from backend.app.services.talent import find_skill

NOT_MEASURABLE = {"videoMcqAssessments", "certificationHealth"}

# Analytics covers employees only, so direct checks against the tables do too.
EMPLOYEE_SKILLS = (
    "FROM user_skills us JOIN users u ON u.id = us.userId WHERE u.role = 'employee'"
)


def factors_by_key(report: dict) -> dict[str, dict]:
    return {f["key"]: f for f in report["factors"]}


def composite(report: dict) -> tuple[int, int]:
    measured = [f for f in report["factors"] if f["measured"]]
    coverage = sum(f["weight"] for f in measured)
    return js_round(sum(f["score"] * f["weight"] for f in measured) / coverage), coverage


# --------------------------------------------------------------------------- #
# The index
# --------------------------------------------------------------------------- #

def test_the_index_is_the_weighted_mean_of_its_measured_components(leadership):
    report = leadership.get("/api/analytics/eri").json()

    assert [f["weight"] for f in report["factors"]] == [25, 20, 15, 15, 10, 5, 5, 5]
    assert (report["enterpriseReadinessIndex"], report["coverage"]) == composite(report)


def test_components_with_no_data_are_excluded_not_assumed(leadership):
    factors = factors_by_key(leadership.get("/api/analytics/eri").json())
    for key in NOT_MEASURABLE:
        assert factors[key]["measured"] is False
        assert factors[key]["score"] is None
        assert factors[key]["basis"].startswith("Not measured")


def test_approving_evidence_moves_the_index(leadership, manager):
    before = factors_by_key(leadership.get("/api/analytics/eri").json())["workplaceEvidence"]
    approved = query_one("SELECT COUNT(*) FROM evidences WHERE status = 'approved'")[0]
    total = query_one("SELECT COUNT(*) FROM evidences")[0]
    assert before["score"] == js_round(approved / total * 100)

    review = manager.post("/api/validation", json={
        "evidenceId": "eng_ev_E1015_1", "status": "approved", "comment": "Verified.",
    })
    assert review.status_code == 200

    after_report = leadership.get("/api/analytics/eri").json()
    after = factors_by_key(after_report)["workplaceEvidence"]
    assert after["score"] == js_round((approved + 1) / total * 100)
    assert (after_report["enterpriseReadinessIndex"], after_report["coverage"]) == composite(after_report)


def test_deploy_now_counts_skill_and_will_at_sixty_or_more(leadership):
    report = leadership.get("/api/analytics/eri").json()
    employees = [r["id"] for r in query_all("SELECT id FROM users WHERE role = 'employee'")]
    expected = 0
    for user_id in employees:
        levels = user_skills.get_user_skills(user_id)
        approved = query_one(
            "SELECT COUNT(*) FROM evidences WHERE userId = ? AND status = 'approved'", (user_id,)
        )[0]
        will = capability.compute_motivation_scores(user_id)["willScore"]
        expected += capability.skill_score(levels, approved) >= 60 and will >= 60
    assert report["deployNowCount"] == expected
    assert report["workforceCount"] == len(employees)


# --------------------------------------------------------------------------- #
# The trend comes from recorded readings only
# --------------------------------------------------------------------------- #

def test_each_reading_is_recorded_once_per_day(leadership):
    first = leadership.get("/api/analytics/eri").json()
    second = leadership.get("/api/analytics/eri").json()

    days = [point["day"] for point in second["trend"]]
    assert len(days) == len(set(days))
    assert second["trend"][-1]["eri"] == second["enterpriseReadinessIndex"]
    assert query_one("SELECT COUNT(*) FROM eri_snapshots")[0] == len(second["trend"])
    assert first["trend"][-1]["day"] == second["trend"][-1]["day"]


# --------------------------------------------------------------------------- #
# Leadership overview
# --------------------------------------------------------------------------- #

def test_supply_counts_employees_at_the_verified_level(leadership):
    overview = leadership.get("/api/analytics/leadership").json()
    assert overview["supplyDemand"], "the seed has open demands"
    for row in overview["supplyDemand"]:
        skill = find_skill(row["skillName"], catalog.get_skills())
        ready = query_one(
            f"SELECT COUNT(*) {EMPLOYEE_SKILLS} AND us.skillId = ? AND us.currentLevel >= 3",
            (skill["id"] if skill else None,),
        )[0]
        assert row["ready"] == ready
        assert row["balance"] == ready - row["resourcesNeeded"]


def test_closing_every_gap_cannot_lower_the_projection(leadership):
    projection = leadership.get("/api/analytics/leadership").json()["projection"]
    assert projection["projectedEri"] >= projection["currentEri"]
    assert projection["openGaps"] == query_one(
        f"SELECT COUNT(*) {EMPLOYEE_SKILLS} AND us.currentLevel < us.targetLevel"
    )[0]


def test_org_figures_need_a_manager_or_above(anon, employee):
    for path in ("/api/analytics/eri", "/api/analytics/leadership"):
        assert anon.get(path).status_code == 401
        assert employee.get(path).status_code == 403


# --------------------------------------------------------------------------- #
# The analytics copilot
# --------------------------------------------------------------------------- #

def test_analytics_copilot_quotes_the_computed_index(leadership):
    eri = leadership.get("/api/analytics/eri").json()["enterpriseReadinessIndex"]
    text = leadership.post(
        "/api/ai/orchestrator", json={"prompt": "Board summary", "agent": "analytics"}
    ).json()["response"]
    assert f"Enterprise Readiness Index: {eri}%" in text


def test_analytics_copilot_gives_an_employee_no_org_figures(employee):
    text = employee.post(
        "/api/ai/orchestrator", json={"prompt": "Board summary", "agent": "analytics"}
    ).json()["response"]
    assert "Enterprise Readiness Index" not in text
    assert "Supply against open demand" not in text


# --------------------------------------------------------------------------- #
# Honest inputs
# --------------------------------------------------------------------------- #

def test_a_demand_skill_resolves_to_the_skill_of_that_exact_name():
    skills = catalog.get_skills()
    for name in ("SQL", "Java", "Azure", "CI/CD", "Azure ML", "azure devops"):
        assert find_skill(name, skills)["name"].lower() == name.lower()
    # With no exact match, containment still applies.
    assert find_skill("Gemini", skills)["name"] == "Gemini API Integration"


def test_a_report_with_no_skill_records_scores_from_evidence_only(monkeypatch):
    real = user_skills.get_user_skills
    monkeypatch.setattr(
        user_skills, "get_user_skills", lambda uid: [] if uid == "E1000" else real(uid)
    )
    approved = query_one(
        "SELECT COUNT(*) FROM evidences WHERE userId = 'E1000' AND status = 'approved'"
    )[0]
    row = next(r for r in capability.team_rollup("user_2") if r["userId"] == "E1000")
    assert row["skillScore"] == min(100, approved * 5)


# --------------------------------------------------------------------------- #
# L&D: readiness by department, gap cohorts, campaigns
# --------------------------------------------------------------------------- #

def test_heatmap_cells_are_computed_from_the_records(ld):
    data = ld.get("/api/analytics/ld").json()
    assert data["heatmap"], "the seed has targeted skills"
    for row in data["heatmap"][:3]:
        for cell in row["cells"]:
            rows = query_all(
                f"SELECT us.currentLevel, us.targetLevel {EMPLOYEE_SKILLS} "
                "AND u.department = ? AND us.skillId = ? AND us.targetLevel > 0",
                (cell["department"], row["skillId"]),
            )
            assert cell["employees"] == len(rows)
            expected = (
                js_round(sum(min(1, c / t) for c, t in rows) / len(rows) * 100) if rows else None
            )
            assert cell["targetReached"] == expected
    counts = [r["employees"] for r in data["heatmap"]]
    assert counts == sorted(counts, reverse=True)


def test_cohorts_count_the_employees_below_target(ld):
    for cohort in ld.get("/api/analytics/ld").json()["cohorts"][:5]:
        below = query_one(
            f"SELECT COUNT(*) {EMPLOYEE_SKILLS} AND us.skillId = ? AND us.currentLevel < us.targetLevel",
            (cohort["skillId"],),
        )[0]
        assert cohort["belowTarget"] == below


def test_a_campaign_reminds_exactly_the_employees_below_target(ld):
    cohort = ld.get("/api/analytics/ld").json()["cohorts"][0]
    expected = {
        r["userId"] for r in query_all(
            f"SELECT us.userId {EMPLOYEE_SKILLS} AND us.skillId = ? AND us.currentLevel < us.targetLevel",
            (cohort["skillId"],),
        )
    }
    before = query_one("SELECT COUNT(*) FROM reminders WHERE type = 'campaign'")[0]

    response = ld.post("/api/analytics/campaign", json={"skillId": cohort["skillId"]})

    assert response.status_code == 200
    assert set(response.json()["employeeIds"]) == expected
    assert response.json()["reminded"] == len(expected)
    assert query_one("SELECT COUNT(*) FROM reminders WHERE type = 'campaign'")[0] == before + len(expected)


def test_the_reminded_employee_sees_the_campaign(ld, employee):
    skill_id = query_one(
        "SELECT skillId FROM user_skills WHERE userId = 'E1000' AND currentLevel < targetLevel"
    )["skillId"]
    name = ld.post("/api/analytics/campaign", json={"skillId": skill_id}).json()["skillName"]

    inbox = employee.get("/api/reminders").json()
    assert any(r["type"] == "campaign" and name in r["title"] for r in inbox)
    assert {r["userId"] for r in inbox} == {"E1000"}


def test_campaigns_are_for_ld_and_leadership_only(manager, employee, anon):
    body = {"skillId": "sk_20"}
    assert manager.post("/api/analytics/campaign", json=body).status_code == 403
    assert employee.post("/api/analytics/campaign", json=body).status_code == 403
    assert anon.post("/api/analytics/campaign", json=body).status_code == 401


def test_a_campaign_needs_a_known_skill(ld):
    assert ld.post("/api/analytics/campaign", json={}).status_code == 400
    assert ld.post("/api/analytics/campaign", json={"skillId": "no_such_skill"}).status_code == 404
