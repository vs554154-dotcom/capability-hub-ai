"""JavaScript-compatible arithmetic.

Python's built-in round() uses banker's rounding (round-half-to-even), so
round(62.5) == 62. JavaScript's Math.round() rounds half toward +Infinity, so
Math.round(62.5) === 63.

The scoring engines were first written in JavaScript, where every percentage is a
Math.round(), and values landing exactly on .5 are common (5 of 8 competencies =
62.5%). Python's round() would score those candidates one point lower than the
numbers the product has always shown. Use js_round() for every displayed score.
"""
from __future__ import annotations

import math


def js_round(value: float) -> int:
    """Match JavaScript's Math.round(): halves go toward +Infinity.

    >>> js_round(62.5), js_round(-2.5), js_round(2.4)
    (63, -2, 2)
    """
    return math.floor(value + 0.5)
