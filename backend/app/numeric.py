"""JavaScript-compatible arithmetic.

Python's built-in round() uses banker's rounding (round-half-to-even), so
round(62.5) == 62. JavaScript's Math.round() rounds half toward +Infinity, so
Math.round(62.5) === 63.

Every percentage in the scoring engines is a Math.round() in server.ts, and
values landing exactly on .5 are common (5 of 8 competencies = 62.5%). Using
Python's round() silently produced scores one point below the Node backend on
those candidates - identical ranking, different numbers. Use js_round() for any
figure that has to agree with the Node implementation.
"""
from __future__ import annotations

import math


def js_round(value: float) -> int:
    """Match JavaScript's Math.round(): halves go toward +Infinity.

    >>> js_round(62.5), js_round(-2.5), js_round(2.4)
    (63, -2, 2)
    """
    return math.floor(value + 0.5)
