"""How a skill named in text relates to the skills a person holds.

Demands, job descriptions and learning steps name skills in words, while people's
levels are stored against catalogue skills. These rules connect the two, and every
agent uses them, so "missing" means the same thing from matching to the resume gate.

A skill has one catalogue name and may have other names ("K8s" for Kubernetes), kept in
seed/skill_aliases.json. Some other names only count as a whole skill name: "Go" is
Go (Golang) in a list of skills, but not in "go to market". Others are found in a text
only with their capitals: "SAFe" is Scaled Agile, "safe" is a word.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from ..config import SKILL_ALIASES_PATH

# The skill level the matching engine treats as verified competency in a requirement.
VERIFIED_LEVEL = 3

# Skills found in almost any IT profile. They count half in a match: counted in full, a
# Ruby engineer who knows Git and REST looked like two thirds of a Salesforce developer.
GENERAL_SKILLS = frozenset({
    "Agile", "Git & Version Control", "HTML & CSS", "Jira", "Microsoft Excel", "REST APIs", "SQL",
    "Stakeholder Management",
})


def weight(skill_name: str, opening: str = "") -> float:
    """What a required skill counts in a match: half for a general one, unless the
    opening is named after it ("SQL Developer")."""
    return 0.5 if skill_name in GENERAL_SKILLS and not names_word(skill_name, opening) else 1.0


@lru_cache(maxsize=8192)
def _phrase(text: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![a-z0-9+#]){re.escape(text.strip().lower())}(?![a-z0-9+#])")


@lru_cache(maxsize=8192)
def _in_text(phrase: str, cased: bool) -> re.Pattern[str]:
    return re.compile(
        rf"(?<![A-Za-z0-9+#]){re.escape(phrase)}(?![A-Za-z0-9+#])", 0 if cased else re.IGNORECASE
    )


def names_word(needle: str, haystack: str) -> bool:
    """Does `haystack` contain `needle` as a whole word or phrase, ignoring case?
    Plain substring matching made a Java developer match a JavaScript requirement."""
    return bool(needle.strip()) and _phrase(needle).search(haystack.lower()) is not None


@lru_cache(maxsize=1)
def _aliases() -> dict[str, dict[str, list[str]]]:
    if not SKILL_ALIASES_PATH.exists():
        return {}
    return json.loads(SKILL_ALIASES_PATH.read_text(encoding="utf-8"))


class _Index:
    """The names of one catalogue, looked up once and remembered: ranking a few hundred
    people asks the same questions about the same names over and over."""

    def __init__(self, skills: list[dict[str, Any]]) -> None:
        self.skills = skills
        self.exact: dict[str, dict[str, Any]] = {}
        self.phrases: list[tuple[str, bool, dict[str, Any]]] = []     # name, case matters, skill
        for s in skills:
            self.exact.setdefault(s["name"].lower(), s)
            self.phrases.append((s["name"], False, s))
        for s in skills:
            group = _aliases().get(s["name"], {})
            for kind in ("names", "cased"):
                for n in group.get(kind, []):
                    self.exact.setdefault(n.lower(), s)
                    self.phrases.append((n, kind == "cased", s))
            for n in group.get("exact", []):
                self.exact.setdefault(n.lower(), s)
        self.phrases.sort(key=lambda p: -len(p[0]))
        self._found: dict[str, dict[str, Any] | None] = {}

    def find(self, name: str) -> dict[str, Any] | None:
        wanted = name.strip()
        if not wanted:
            return None
        if wanted not in self._found:
            self._found[wanted] = self.inside(wanted) or next(
                (s for s in self.skills if names_word(wanted, s["name"])), None)
        return self._found[wanted]

    def inside(self, name: str) -> dict[str, Any] | None:
        """The skill this names, also in the plural, or the longest one named inside it."""
        lower = name.strip().lower()
        return (
            self.exact.get(lower)
            or (self.exact.get(lower[:-1]) if lower.endswith("s") else None)
            or next((s for phrase, cased, s in self.phrases if _in_text(phrase, cased).search(name)), None)
        )


@lru_cache(maxsize=4)
def _index_of(key: tuple[tuple[str, str], ...]) -> _Index:
    return _Index([{"id": i, "name": n} for i, n in key])


def _index(skills: list[dict[str, Any]]) -> _Index:
    return _index_of(tuple((s["id"], s["name"]) for s in skills))


def find_skill(name: str, skills: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The catalogue skill a demand's skill name refers to, ignoring case: the skill of
    exactly that name or other name; else the one whose longest name is inside it, as
    whole words ("Azure Kubernetes Service" is Kubernetes before Azure); else the first
    whose name contains it. Exact first, or "Java" would resolve to "Java Core & OOP
    Principles"."""
    found = _index(skills).find(name)
    return next((s for s in skills if s["id"] == found["id"]), None) if found else None


def named_exactly(name: str, skills: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The catalogue skill whose name, or other name, is exactly this."""
    return _index(skills).exact.get(name.strip().lower())


def catalogue_names(names: list[str], skills: list[dict[str, Any]]) -> list[str]:
    """`names` with each one that is, or holds, a catalogue skill given that skill's name,
    once. Pinecone, pgvector and "vector stores" are one requirement, not three; a name
    the catalogue does not know stays as it is."""
    index = _index(skills)
    return list(dict.fromkeys((index.inside(n) or {"name": n})["name"] for n in names if n.strip()))


def mentioned_skills(text: str, skills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Catalogue skills whose name, or other name, appears in `text` as a whole phrase.
    A skill named only inside a longer one that also appears ("CI/CD" inside "CI/CD &
    Cloud Infrastructure") is left out, so one phrase counts once."""
    remaining = text
    kept: set[str] = set()
    for phrase, cased, skill in _index(skills).phrases:
        pattern = _in_text(phrase, cased)
        if pattern.search(remaining):
            kept.add(skill["id"])
            remaining = pattern.sub(" ", remaining)
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
    index = _index(skills)
    primary = [(ps, index.exact.get(ps.strip().lower())) for ps in person.get("primarySkills") or []]
    status = []
    for name in required:
        skill = index.find(name)
        level = levels.get(skill["id"]) if skill else None

        def listed(ps: str, held: dict[str, Any] | None) -> bool:
            # Two catalogue skills are the same one or they are not: knowing SQL is not
            # knowing SQL Server. Names the catalogue lacks are compared as words.
            if skill and held:
                return skill["id"] == held["id"]
            return names_word(name, ps) or names_word(ps, name)

        met = (
            (level is not None and level >= VERIFIED_LEVEL)
            or any(listed(ps, held) for ps, held in primary)
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
