"""Request dependencies: the JSON body, and the authorization guards.

Authority always comes from the session cookie - never from a user id in the URL or
the body. An id in the request names the *target* of an action; the guards decide
whether the signed-in user may act on that target.

The ownership rule (`may_access`) is the same everywhere:
    * anyone may act on themselves;
    * L&D and Leadership may act on anyone;
    * a manager may act on their own direct reports, and no one else.

Every guard is a plain `def`, so FastAPI runs it in the threadpool rather than on
the event loop. Only `json_body` is async, because reading the request body is.
"""
from __future__ import annotations

from typing import Any, Callable

from fastapi import Depends, HTTPException, Request

from .repositories import learning, users

EMPLOYEE = "employee"
MANAGER = "manager"
LD = "ld"
LEADERSHIP = "leadership"

NOT_AUTHENTICATED = "Not authenticated. Please log in."
NO_PERMISSION = "You don't have permission to perform this action."
NOT_OWN_DATA = "You can only access your own data or your direct reports' data."
NOT_OWN_ACTION = "You can only act on your own data or your direct reports' data."


async def json_body(request: Request) -> dict[str, Any]:
    """The parsed JSON object body, or {} if the body is empty, malformed or not an
    object. Read here, on the event loop, so handlers can stay synchronous. The
    result is cached on the request, so guards that also need it parse it once."""
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


def get_session_user(request: Request) -> dict[str, Any] | None:
    """The signed-in user, from the session cookie, or None."""
    user_id = request.session.get("userId")
    return users.get_user_by_id(user_id) if user_id else None


def may_access(actor: dict[str, Any], target_id: str | None) -> bool:
    """May `actor` act on the user `target_id`? An absent target means the actor
    themselves."""
    if not target_id or actor["id"] == target_id:
        return True
    if actor["role"] in (LD, LEADERSHIP):
        return True
    if actor["role"] == MANAGER:
        target = users.get_user_by_id(target_id)
        return bool(target and target.get("managerId") == actor["id"])
    return False


def ensure_may_access(actor: dict[str, Any], target_id: str | None, message: str = NOT_OWN_ACTION) -> None:
    """Raise 403 unless `actor` may act on the user `target_id`. For handlers whose
    target is only known after reading the body or loading a record."""
    if not may_access(actor, target_id):
        raise HTTPException(status_code=403, detail=message)


def visible_user_ids(actor: dict[str, Any]) -> set[str] | None:
    """Whose records `actor` may see in a list: themselves, plus their direct reports
    for a manager. None means everyone (L&D and Leadership). The list form of
    `may_access`, so a list endpoint can never show more than the single-record
    endpoints would."""
    if actor["role"] in (LD, LEADERSHIP):
        return None
    ids = {actor["id"]}
    if actor["role"] == MANAGER:
        ids |= {u["id"] for u in users.get_direct_reports(actor["id"])}
    return ids


def require_auth(request: Request) -> dict[str, Any]:
    """Any signed-in user. No role or ownership check."""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
    return user


def require_role(*roles: str) -> Callable[[Request], dict[str, Any]]:
    """The signed-in user's role must be one of `roles`."""
    def dependency(request: Request) -> dict[str, Any]:
        user = get_session_user(request)
        if not user:
            raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail=NO_PERMISSION)
        return user
    return dependency


def require_self_manager_or_elevated(param_name: str) -> Callable[..., dict[str, Any]]:
    """The target user id is the path parameter `param_name`."""
    def dependency(request: Request) -> dict[str, Any]:
        user = get_session_user(request)
        if not user:
            raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
        if may_access(user, request.path_params.get(param_name)):
            return user
        raise HTTPException(status_code=403, detail=NOT_OWN_DATA)
    return dependency


def require_self_or_elevated_body(
    request: Request, body: dict[str, Any] = Depends(json_body)
) -> dict[str, Any]:
    """The target user id is `userId` in the JSON body. An absent id means the
    signed-in user themselves."""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
    if may_access(user, body.get("userId")):
        return user
    raise HTTPException(status_code=403, detail=NOT_OWN_ACTION)


def require_learning_step_owner(
    request: Request, body: dict[str, Any] = Depends(json_body)
) -> dict[str, Any]:
    """The target is the owner of the learning step `stepId`, looked up from the
    database. An unknown step falls through to the handler, which rejects it."""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
    step_id = body.get("stepId")
    if may_access(user, learning.get_step_owner_id(step_id) if step_id else None):
        return user
    raise HTTPException(status_code=403, detail=NOT_OWN_ACTION)


require_manager_or_above = require_role(MANAGER, LD, LEADERSHIP)
require_leadership = require_role(LEADERSHIP)
