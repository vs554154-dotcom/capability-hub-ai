"""Domain errors.

Services raise these instead of HTTP exceptions, so business logic carries no
knowledge of HTTP. `main.py` maps every DomainError to the same `{"error": message}`
JSON body the frontend already reads for HTTP errors.
"""
from __future__ import annotations


class DomainError(Exception):
    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class Invalid(DomainError):
    """The request is well-formed but asks for something the rules do not allow."""
    status_code = 400


class NotFound(DomainError):
    status_code = 404
