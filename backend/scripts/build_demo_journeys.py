"""Builds the sample journeys: demo people part-way from a client demand to a resume.

    python backend/scripts/build_demo_journeys.py

Runs about forty people of the demo company through the application's own services - the
handoff, the Level-1 assessment, the track, the knowledge checks, evidence and its review,
the post-training check and the sign-off - on a throwaway database, without a model and with
a calendar set to the day each step happened. What the application stored is then written to
backend/seed/demo_journeys.json. Every score in it was worked out by the application; only
the answers people gave are made up.

Run it again after build_demo_seed.py has changed the demo people.
"""
from __future__ import annotations

import json
import os
import random
import re
import shutil
import sys
import tempfile
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "backend" / "seed" / "demo_journeys.json"
TEMP = Path(tempfile.mkdtemp(prefix="cybridge-journeys-"))
os.environ.update(
    DATABASE_PATH=str(TEMP / "journeys.db"), GEMINI_API_KEY="", SEED_DEMO_DATA="true", SEED_DEMO_JOURNEYS="false",
)
sys.path.insert(0, str(ROOT))

from backend.app.database import query_all, query_one  # noqa: E402
from backend.app.repositories import (  # noqa: E402
    assessments, demands, evidence, learning as plans, reminders, skillgap as stored, user_skills, users,
)
from backend.app.services import capability, copilot, learning, questions, skillgap, talent  # noqa: E402

TODAY = date.today()
rng = random.Random(20261125)

# How many people end at each stage, and how many days ago they were handed off.
STAGES = {
    "handed_off": (7, (1, 4)), "assessed": (7, (5, 9)), "training": (9, (10, 18)), "trained": (5, (18, 24)),
    "awaiting_signoff": (3, (20, 26)), "not_ready": (2, (22, 28)), "cleared": (8, (26, 36)),
}
ORDER = list(STAGES)
# The team the presenter shows: one person at each of these stages.
SHOWCASE_MANAGER = "mgr_108"
SHOWCASE = ["handed_off", "training", "trained", "cleared"]
STAFF = [("user_4", "Leadership"), ("user_3", "L&D"), (SHOWCASE_MANAGER, "Manager")]

WORK = [
    ("{s} on the client prototype", "The prototype covers the client's main case",
     "Used {s} on the prototype for {p}: built the main case, checked it with two colleagues and fixed what they found."),
    ("{s}: second piece of work", "The earlier review points are closed",
     "Went back over the first {s} work for {p}, closed the review points and added checks so they stay closed."),
    ("{s} in a reusable example", "The next person starts from a working example",
     "Wrote a small reusable example of {s} for {p}, with a short guide, and walked the team through it."),
]
VERDICTS = ["Checked the work and the notes. Meets the standard.", "Saw it running; the checks are real. Approved.",
            "Good, specific work. Approved.", "The review points are closed. Approved."]


# --------------------------------------------------------------------------- #
# The calendar
# --------------------------------------------------------------------------- #

class Clock(datetime):
    """The services' clock: `set_day` moves it, and nothing else."""
    moment = datetime.now(timezone.utc)

    @classmethod
    def now(cls, tz=None):  # noqa: ANN001 - the signature of datetime.now
        return cls.moment


def set_day(days_ago: float, hour: int = 10) -> None:
    day = TODAY - timedelta(days=int(days_ago))
    Clock.moment = datetime(day.year, day.month, day.day, hour, rng.randrange(0, 60), tzinfo=timezone.utc)


def stamp() -> str:
    return Clock.moment.strftime("%Y-%m-%dT%H:%M:%S.000Z")


counter = Counter()


def stable_id(prefix: str) -> str:
    counter[prefix.split("_")[0]] += 1
    return f"{prefix}j{counter[prefix.split('_')[0]]:03d}"


for module in (assessments, demands, evidence, plans, reminders, stored, user_skills):
    if hasattr(module, "now_iso"):
        module.now_iso = stamp
    if hasattr(module, "now_date"):
        module.now_date = lambda: Clock.moment.date().isoformat()
    if hasattr(module, "random_id"):
        module.random_id = stable_id
for module in (talent, learning):
    module.datetime = Clock


# --------------------------------------------------------------------------- #
# One person's journey, through the services
# --------------------------------------------------------------------------- #

def answer_assessment(person: dict[str, Any], demand: dict[str, Any]) -> None:
    """Take and finish the Level-1 assessment. How likely an answer is right follows the
    level the person holds in that question's skill; the scoring is the application's."""
    made = skillgap.start(person, {"assessmentMode": "project_hiring", "demandId": demand["id"]})
    content = stored.get(made["id"])["content"]
    names = {r["id"]: r["name"] for r in query_all("SELECT id, name FROM skills")}
    level = {names[s["skillId"]]: s["currentLevel"] for s in user_skills.get_user_skills(person["id"])}
    chance = {0: 0.3, 1: 0.35, 2: 0.55, 3: 0.8, 4: 0.9, 5: 0.96}
    for q in content["mcqs"]:
        right = rng.random() < chance[level.get(q["skillArea"], 0)]
        wrong = [i for i in range(len(q["options"])) if i != q["correctIndex"]]
        skillgap.answer_mcq(person, made["id"], q["id"], q["correctIndex"] if right else rng.choice(wrong))
    skillgap.finish(person, made["id"], None)


def study(person_id: str, share: float, days_from: float, days_to: float) -> None:
    """Work through the track's steps in order, up to `share` of them."""
    steps = plans.get_learning_plan(person_id)
    # Short of the whole, at least one step is left to do.
    todo = steps[: len(steps) if share >= 1 else min(len(steps) - 1, round(len(steps) * share))]
    for n, step in enumerate(todo):
        set_day(days_from - (days_from - days_to) * (n + 1) / max(1, len(todo)), 17)
        quiz = learning.quiz_for(step["id"])["questions"]
        if quiz:
            bank = {q["id"]: q for skill in {x["skill"] for x in quiz} for q in questions.for_skill(skill)}
            answers = {q["id"]: bank[q["id"]]["correct"] for q in quiz}
            if len(quiz) >= 3 and rng.random() < 0.45:         # one wrong, still a pass
                slip = rng.choice(quiz)
                answers[slip["id"]] = next(o for o in slip["options"] if o != answers[slip["id"]])
            learning.submit_quiz(step["id"], answers, rng.randint(40, 110))
        else:
            learning.update_step(step["id"], "completed", rng.randint(40, 120))


def prove(person: dict[str, Any], demand: dict[str, Any], missing: list[str], days_from: float, review: bool, limit: int = 9) -> None:
    """Submit real work for the missing skills, and have the manager review it."""
    by_name = {r["name"]: r["id"] for r in query_all("SELECT id, name FROM skills")}
    sent = 0
    for skill in missing:
        for n in range(max(1, 3 - user_skills.get_current_level(person["id"], by_name[skill]))):
            if sent >= limit:
                return
            title, impact, text = WORK[n % len(WORK)]
            set_day(days_from, 11)
            e = capability.submit_evidence(
                person["id"], by_name[skill], title.format(s=skill), impact,
                text.format(s=skill, p=demand["projectName"]), None)
            if review:
                set_day(max(1, days_from - 1), 15)
                capability.review_evidence(e["id"], person["managerId"], "approved", rng.choice(VERDICTS))
            sent += 1


def travel(person: dict[str, Any], demand: dict[str, Any], stage: str, ago: int) -> None:
    """Take one person from the handoff to the end of `stage`."""
    reached = ORDER.index(stage)
    manager = users.get_user_by_id(person["managerId"])
    set_day(ago, 9)
    missing = talent.handoff(person["id"], demand["id"], [], None)["missingSkills"]
    if reached < ORDER.index("assessed"):
        return
    set_day(ago - 2, 14)
    answer_assessment(person, demand)
    if reached < ORDER.index("training"):
        return
    set_day(ago - 3, 10)
    track = learning.suggest_track(person["id"], demand["id"], "balanced")
    learning.assign_track(person["id"], track["suggestedDeadline"], "client_interview", track["steps"], demand["id"], manager)
    end = {"training": 1, "trained": 3, "awaiting_signoff": 5, "not_ready": 6, "cleared": 7}[stage]
    if stage == "training":
        # Some have just begun, some are nearly there; a few have proof waiting. The one the
        # presenter shows has a skill's knowledge check and practice left.
        total = len(plans.get_learning_plan(person["id"]))
        share = (total - 2) / total if person["managerId"] == SHOWCASE_MANAGER else rng.choice([0.25, 0.4, 0.6, 0.75])
        study(person["id"], share, ago - 4, 2)
        if person["managerId"] == SHOWCASE_MANAGER or rng.random() < 0.4:
            prove(person, demand, missing[:1], 1, review=False, limit=1)
        return
    study(person["id"], 1, ago - 4, end + 4)
    grown = missing[:1] if stage == "not_ready" else missing
    prove(person, demand, grown, end + 3, review=True, limit=2 if stage == "not_ready" else 9)
    if stage == "trained":
        return
    set_day(end, 10)
    check = copilot.post_assessment(person["id"], demand["id"], person["managerId"])["assessment"]
    if stage in ("cleared", "not_ready"):
        set_day(max(1, end - 2), 16)
        copilot.sign_off_assessment(check["id"], person["managerId"], stage)


# --------------------------------------------------------------------------- #
# Who travels
# --------------------------------------------------------------------------- #

def candidates() -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Demo people and an open project each comes close to, best fit first."""
    found = []
    for demand in demands.get_project_demands():
        if not demand["id"].startswith("OPP-2"):
            continue
        for m in talent.match_candidates(demand)["matches"]:
            if (m["employeeId"].startswith("E2") and 1 <= len(m["missingSkills"]) <= 3
                    and m["technicalMatchPct"] >= 55 and 62 <= m["overallMatchPct"] <= 86):
                found.append((m["overallMatchPct"], demand, users.get_user_by_id(m["employeeId"])))
    found.sort(key=lambda x: (-x[0], x[1]["id"], x[2]["id"]))
    return [(person, demand) for _, demand, person in found]


def choose() -> list[tuple[dict[str, Any], dict[str, Any], str]]:
    pool = candidates()
    taken: set[str] = set()
    per_demand, per_manager = Counter(), Counter()
    chosen = []

    def take(stage: str, wanted: int, only_manager: str | None = None) -> None:
        for limit in (1, 2, 3):                      # spread over projects first
            for person, demand in pool:
                if wanted <= 0:
                    return
                if person["id"] in taken or per_demand[demand["id"]] >= limit:
                    continue
                if only_manager and person["managerId"] != only_manager:
                    continue
                if not only_manager and (person["managerId"] == SHOWCASE_MANAGER or per_manager[person["managerId"]] >= 3):
                    continue
                taken.add(person["id"])
                per_demand[demand["id"]] += 1
                per_manager[person["managerId"]] += 1
                chosen.append((person, demand, stage))
                wanted -= 1

    for stage in reversed(SHOWCASE):                 # the best fit of the team goes furthest
        take(stage, 1, SHOWCASE_MANAGER)
    if len(chosen) != len(SHOWCASE):
        sys.exit(f"build_demo_journeys: the showcase team has people for only {len(chosen)} of {len(SHOWCASE)} stages")
    for stage in reversed(ORDER):
        take(stage, STAGES[stage][0] - (stage in SHOWCASE))
    return chosen


# --------------------------------------------------------------------------- #
# What is written
# --------------------------------------------------------------------------- #

DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
EXACT = re.compile(r"^(\d{4}-\d{2}-\d{2})(T[\d:.]+Z)?$")
SPOKEN = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")


def relative(value: Any) -> Any:
    """Dates become days from today, in a column or inside a text."""
    if not isinstance(value, str):
        return value
    days = lambda d: (d - TODAY).days
    whole = EXACT.match(value)
    if whole:
        return f"@{days(date.fromisoformat(whole.group(1))):+d}d{whole.group(2) or ''}"
    value = SPOKEN.sub(lambda m: "{{%+dd|d/m/yyyy}}" % days(date(int(m[3]), int(m[2]), int(m[1]))), value)
    return DAY.sub(lambda m: "{{%+dd}}" % days(date.fromisoformat(m[0])), value)


def export(chosen: list[tuple[dict[str, Any], dict[str, Any], str]]) -> dict[str, Any]:
    tables = {
        "skill_baselines": "userId", "skillgap_assessments": "userId", "post_assessments": "employeeId",
        "reminders": "userId", "learning_plans": "userId", "user_skills": "userId", "evidences": "userId",
    }
    seeded = {r["id"] for r in json.loads((ROOT / "backend/seed/demo_seed.json").read_text(encoding="utf-8"))["evidences"]}
    people = {}
    for person, demand, stage in chosen:
        rows = {}
        for table, column in tables.items():
            got = [dict(r) for r in query_all(f"SELECT * FROM {table} WHERE {column} = ? ORDER BY rowid", (person["id"],))]
            if table == "evidences":
                got = [r for r in got if r["id"] not in seeded]
            rows[table] = [{c: relative(v) for c, v in r.items()} for r in got]
        people[person["id"]] = {"stage": stage, "demandId": demand["id"], "rows": rows}
    return people


NOTES = {
    "handed_off": "Just handed off to {p}. Takes the Level-1 assessment.",
    "training": "In training for {p}. One knowledge check left to take, and proof waiting for the manager.",
    "trained": "Finished training for {p}. Ready for the manager's post-training check.",
    "cleared": "Cleared for {p}. The client resume can be generated.",
}


def main() -> int:
    query_one("SELECT 1")                             # builds and seeds the throwaway database
    chosen = choose()
    missing = {s: STAGES[s][0] - sum(c[2] == s for c in chosen) for s in STAGES}
    if any(missing.values()):
        sys.exit(f"build_demo_journeys: not enough people for {missing}")
    for person, demand, stage in chosen:
        low, high = STAGES[stage][1]
        travel(person, demand, stage, rng.randint(low, high))

    cast = [{"userId": uid, "label": label, "note": note} for (uid, label), note in zip(STAFF, (
        "Opens Readiness: the index, the pipeline and supply against demand.",
        "Opens L&D insights: gaps by department, campaigns and tracks.",
        "Opens Team board and Demand to deploy: matching, proof to review, the check and the resume.",
    ))]
    team = {stage: (p, d) for p, d, stage in chosen if p["managerId"] == SHOWCASE_MANAGER}
    for stage in SHOWCASE:
        person, demand = team[stage]
        cast.append({"userId": person["id"], "label": "Employee", "note": NOTES[stage].format(p=demand["projectName"])})
    OUT.write_text(
        json.dumps({"cast": cast, "people": export(chosen)}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8", newline="\n")

    from backend.app.services import analytics
    print(len(chosen), "journeys", dict(Counter(c[2] for c in chosen)))
    print("pipeline", analytics.deployment_pipeline())
    for c in cast:
        print(" ", c["userId"], users.get_user_by_id(c["userId"])["name"], "|", c["note"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        shutil.rmtree(TEMP, ignore_errors=True)
