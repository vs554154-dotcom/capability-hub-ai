"""The question bank: three multiple-choice questions for every catalogue skill.

It gives the SkillGap assessment and the learning-plan knowledge checks real
questions whether or not a model is reachable, and lets the server score them: the
answer to a question is only sent once that question has been answered.
"""
from __future__ import annotations

import json
import random
from functools import lru_cache
from typing import Any

from ..config import QUESTION_BANK_PATH


@lru_cache(maxsize=1)
def _bank() -> dict[str, list[dict[str, Any]]]:
    """Every question by skill name. In the file the correct option comes first."""
    if not QUESTION_BANK_PATH.exists():
        return {}
    raw = json.loads(QUESTION_BANK_PATH.read_text(encoding="utf-8"))
    return {
        skill: [
            {
                "id": f"{skill}#{i}", "question": question, "options": options,
                "correct": options[0], "explanation": explanation, "skill": skill,
            }
            for i, (question, options, explanation) in enumerate(items, start=1)
        ]
        for skill, items in raw.items()
    }


def for_skill(skill_name: str) -> list[dict[str, Any]]:
    return _bank().get(skill_name, [])


def shuffled_options(question: dict[str, Any], seed: str = "") -> list[str]:
    """The options in an order that depends only on the question and `seed`, so a
    question reads the same each time it is shown to one person."""
    options = list(question["options"])
    random.Random(f"{seed}|{question['id']}").shuffle(options)
    return options


def pick(skill_names: list[str], limit: int) -> list[dict[str, Any]]:
    """Up to `limit` questions, one per skill in turn, in the order the skills are
    given - so the skills named first are always covered."""
    queues = [list(for_skill(name)) for name in dict.fromkeys(skill_names)]
    chosen: list[dict[str, Any]] = []
    while len(chosen) < limit and any(queues):
        for queue in queues:
            if queue and len(chosen) < limit:
                chosen.append(queue.pop(0))
    return chosen
