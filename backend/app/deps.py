"""Authorization dependencies.

Direct ports of the four middlewares in server.ts. The status codes and error
strings are reproduced exactly, because the React client branches on 401 to show
"session expired" and the port is meant to be a drop-in for the same frontend.

Authority always comes from the session cookie - never from a userId in the URL
or request body. That is the property that stops an employee opening a manager's
cockpit, so it is asserted by the probes in scripts/verify_auth.py.
"""
from __future__ import annotations

from typing import Any, Callable

from fastapi import Depends, HTTPException, Request

from . import db

EMPLOYEE = "employee"
MANAGER = "manager"
LD = "ld"
LEADERSHIP = "leadership"

NOT_AUTHENTICATED = "Not authenticated. Please log in."
NO_PERMISSION = "You don't have permission to perform this action."
NOT_OWN_DATA = "You can only access your own data or your direct reports' data."
NOT_OWN_ACTION = "You can only act on your own data or your direct reports' data."


def get_session_user(request: Request) -> dict[str, Any] | None:
    """Resolve the signed-in user from the session cookie, or None."""
    user_id = request.session.get("userId")
    if not user_id:
        return None
    return db.get_user_by_id(user_id)


def require_auth(request: Request) -> dict[str, Any]:
    """Any authenticated session. No role or ownership check."""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
    return user


def require_role(*roles: str) -> Callable[[Request], dict[str, Any]]:
    """Session user's role must be one of `roles`."""
    def dependency(request: Request) -> dict[str, Any]:
        user = get_session_user(request)
        if not user:
            raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail=NO_PERMISSION)
        return user
    return dependency


def _may_access(actor: dict[str, Any], target_id: str | None) -> bool:
    """Shared rule: self, or an org-wide viewer, or the target's direct manager."""
    if not target_id or actor["id"] == target_id:
        return True
    if actor["role"] in (LD, LEADERSHIP):
        return True
    if actor["role"] == MANAGER:
        target = db.get_user_by_id(target_id)
        if target and target.get("managerId") == actor["id"]:
            return True
    return False


def require_self_manager_or_elevated(param_name: str) -> Callable[..., dict[str, Any]]:
    """Target id comes from a path parameter."""
    def dependency(request: Request) -> dict[str, Any]:
        user = get_session_user(request)
        if not user:
            raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
        target_id = request.path_params.get(param_name)
        if _may_access(user, target_id):
            return user
        raise HTTPException(status_code=403, detail=NOT_OWN_DATA)
    return dependency


async def require_self_or_elevated_body(
    request: Request, field: str = "userId"
) -> dict[str, Any]:
    """Target id comes from the JSON body (POST/PUT).

    Note: unlike the path-param variant, an *absent* target id is permitted - it
    falls through to the session user, exactly as server.ts does.
    """
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
    try:
        body = await request.json()
    except Exception:
        body = {}
    target_id = body.get(field) if isinstance(body, dict) else None
    if _may_access(user, target_id):
        return user
    raise HTTPException(status_code=403, detail=NOT_OWN_ACTION)


async def require_learning_step_owner(request: Request) -> dict[str, Any]:
    """Target is a learning step, whose owner has to be looked up before it can be
    authorized. The handler previously checked only that the caller was logged in, so
    any authenticated employee could write any step by id. An unknown stepId falls
    through to the handler, which rejects it - no data is exposed either way.
    """
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)
    try:
        body = await request.json()
    except Exception:
        body = {}
    step_id = body.get("stepId") if isinstance(body, dict) else None
    owner_id = db.get_learning_step_owner_id(step_id) if step_id else None
    if _may_access(user, owner_id):
        return user
    raise HTTPException(status_code=403, detail=NOT_OWN_ACTION)


# Convenience aliases mirroring the role sets used across server.ts routes.
require_manager_or_above = require_role(MANAGER, LD, LEADERSHIP)
require_leadership = require_role(LEADERSHIP)

CurrentUser = Depends(require_auth)
