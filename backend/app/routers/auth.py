"""Sign-in, session and password routes.

The first sign-in to an account sets its password, so seeded demo accounts need no
pre-distributed credentials; every later sign-in must match it. DEMO_MODE (off by
default) is the one path that accepts a bare user id - it is an authentication
bypass for trusted demos only.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import security
from ..config import DEMO_MODE
from ..deps import (
    NOT_AUTHENTICATED,
    current_session_id,
    end_session,
    get_session_user,
    json_body,
    start_session,
)
from ..ratelimit import enforce_auth_rate_limit
from ..repositories import sessions, users

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _resolve_target(body: dict[str, Any]) -> dict[str, Any] | None:
    """Explicit userId first, then an email / id / name identifier."""
    user_id = body.get("userId")
    if user_id:
        user = users.get_user_by_id(user_id)
        if user:
            return user
    return users.find_user_by_identifier(body.get("email") or body.get("identifier") or "")


@router.post("/login")
def login(request: Request, body: dict[str, Any] = Depends(json_body)) -> dict[str, Any]:
    # Throttle before any credential is examined, so a brute-forcer is refused even
    # on the request where they would finally guess right.
    enforce_auth_rate_limit(request)

    supplied_secret = body.get("password") or body.get("pin")
    user = _resolve_target(body)
    if not user:
        raise HTTPException(status_code=404, detail="No resource account matched those credentials.")

    existing_hash = users.get_user_password_hash(user["id"])

    if existing_hash:
        if not supplied_secret:
            raise HTTPException(status_code=400, detail="A password is required for this account.")
        if not security.verify_password(supplied_secret, existing_hash):
            raise HTTPException(status_code=401, detail="Incorrect password.")
        start_session(request, user["id"])
        return {"success": True, "message": f"Welcome back, {user['name']}!", "user": user}

    if supplied_secret:
        if len(supplied_secret) < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")
        users.set_user_password(user["id"], security.hash_password(supplied_secret))
        start_session(request, user["id"])
        return {
            "success": True,
            "message": f"Password set for this account. Welcome, {user['name']}!",
            "user": user,
            "passwordJustSet": True,
        }

    if DEMO_MODE:
        start_session(request, user["id"])
        return {
            "success": True,
            "message": "Resource authenticated successfully (demo mode - no password check)",
            "user": user,
        }

    raise HTTPException(
        status_code=400,
        detail="This account has no password set yet. Provide a password to set one.",
    )


@router.get("/me")
def me(request: Request) -> dict[str, Any]:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return {"user": user}


@router.post("/logout")
def logout(request: Request) -> dict[str, Any]:
    end_session(request)
    return {"success": True}


@router.post("/change-password")
def change_password(request: Request, body: dict[str, Any] = Depends(json_body)) -> dict[str, Any]:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)

    current_password = body.get("currentPassword")
    new_password = body.get("newPassword")
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters.")

    existing_hash = users.get_user_password_hash(user["id"])
    if existing_hash:
        # Require the current password so a hijacked session cannot lock the owner out.
        if not current_password:
            raise HTTPException(status_code=400, detail="Current password is required to change it.")
        if not security.verify_password(current_password, existing_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    users.set_user_password(user["id"], security.hash_password(new_password))
    # Anyone else signed in as this user - another device, or a copied cookie -
    # is signed out. The session making the change stays signed in.
    sessions.end_all_for_user(user["id"], keep=current_session_id(request))
    return {"success": True}
