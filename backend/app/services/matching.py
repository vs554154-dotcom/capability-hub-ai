"""How a skill named in text relates to the skills a person holds.

Demands, job descriptions and learning steps name skills in words, while people's
levels are stored against catalogue skills. These rules connect the two, and every
agent uses them, so "missing" means the same thing from matching to the resume gate.
"""
from __future__ import annotations

import re
from typing import Any

# The skill level the matching engine treats as verified competency in a requirement.
VERIFIED_LEVEL = 3


def _phrase(text: str) -> str:
    return rf"(?<![a-z0-9+#]){re.escape(text.strip().lower())}(?![a-z0-9+#])"


def names_word(needle: str, haystack: str) -> bool:
    """Does `haystack` contain `needle` as a whole word or phrase, ignoring case?
    Plain substring matching made a Java developer match a JavaScript requirement."""
    return bool(needle.strip()) and re.search(_phrase(needle), haystack.lower()) is not None


def find_skill(name: str, skills: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The catalogue skill a demand's skill name refers to, ignoring case: the skill
    with exactly that name, else the first whose name contains it, or is contained in
    it, as whole words. Exact first, or "Java" would resolve to "Java Core & OOP
    Principles"."""
    wanted = name.strip().lower()
    exact = next((s for s in skills if s["name"].lower() == wanted), None)
    if exact:
        return exact
    return next(
        (s for s in skills if names_word(wanted, s["name"]) or names_word(s["name"], wanted)),
        None,
    )


def mentioned_skills(text: str, skills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Catalogue skills whose name appears in `text` as a whole phrase. A skill named
    only inside a longer one that also appears ("CI/CD" inside "CI/CD & Cloud
    Infrastructure") is left out, so one phrase counts once."""
    remaining = text.lower()
    kept: set[str] = set()
    for skill in sorted(skills, key=lambda s: -len(s["name"])):
        if names_word(skill["name"], remaining):
            kept.add(skill["id"])
            remaining = re.sub(_phrase(skill["name"]), " ", remaining)
    return [s for s in skills if s["id"] in kept]


def requirement_status(
    person: dict[str, Any],
    levels: dict[str, int],
    required: list[str],
    skills: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Each required skill, and whether `person` meets it: held at the verified level
    (`levels` is skill id -> level), listed as a primary skill, or named by their
    title or role. `skillId` is None for a requirement the catalogue does not hold."""
    status = []
    for name in required:
        skill = find_skill(name, skills)
        level = levels.get(skill["id"]) if skill else None
        met = (
            (level is not None and level >= VERIFIED_LEVEL)
            or any(
                names_word(name, ps) or names_word(ps, name)
                for ps in person.get("primarySkills") or []
            )
            or names_word(name, person.get("title") or "")
            or names_word(name, person.get("primaryRole") or "")
        )
        status.append({
            "name": name,
            "skillId": skill["id"] if skill else None,
            "skillName": skill["name"] if skill else name,
            "level": level,
            "met": met,
        })
    return status


def courses_for(
    skill_id: str | None,
    skill_name: str,
    courses: list[dict[str, Any]],
    skills: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Catalogue courses that teach a skill: those filed under it, else those filed
    under a related skill, else those naming it in their title. Empty when there is
    none - never an unrelated course."""
    names = {s["id"]: s["name"] for s in skills}
    # "REST APIs" should find "REST API Testing".
    wanted = {skill_name}
    if skill_name.endswith("s") and not skill_name.endswith("ss"):
        wanted.add(skill_name[:-1])
    return (
        [c for c in courses if c["skillId"] == skill_id]
        or [c for c in courses if any(names_word(n, names.get(c["skillId"], "")) for n in wanted)]
        or [c for c in courses if any(names_word(n, c["title"]) for n in wanted)]
    )
