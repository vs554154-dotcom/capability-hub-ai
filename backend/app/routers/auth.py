"""Authentication routes.

Port of the /api/auth/* handlers in server.ts, including the "first sign-in claims
the password" behaviour and the DEMO_MODE escape hatch (off by default, because it
accepts a bare userId as proof of identity).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .. import db, security
from ..config import DEMO_MODE
from ..deps import NOT_AUTHENTICATED, get_session_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _resolve_target(body: dict[str, Any]) -> dict[str, Any] | None:
    """Same resolution order as server.ts: explicit userId, then email/identifier."""
    user_id = body.get("userId")
    if user_id:
        user = db.get_user_by_id(user_id)
        if user:
            return user
    identifier = body.get("email") or body.get("identifier") or ""
    return db.find_user_by_identifier(identifier)


@router.post("/login")
async def login(request: Request) -> dict[str, Any]:
    body = await request.json()
    supplied_secret = body.get("password") or body.get("pin")

    user = _resolve_target(body)
    if not user:
        raise HTTPException(
            status_code=404, detail="No resource account matched those credentials."
        )

    existing_hash = db.get_user_password_hash(user["id"])

    if existing_hash:
        if not supplied_secret:
            raise HTTPException(
                status_code=400, detail="A password is required for this account."
            )
        if not security.verify_password(supplied_secret, existing_hash):
            raise HTTPException(status_code=401, detail="Incorrect password.")
        request.session["userId"] = user["id"]
        return {"success": True, "message": f"Welcome back, {user['name']}!", "user": user}

    if supplied_secret:
        # First sign-in for this account claims the password, so 20+ seeded demo
        # accounts don't need pre-distributed credentials - but every later login
        # must match whatever was set here.
        if len(supplied_secret) < 4:
            raise HTTPException(
                status_code=400, detail="Password must be at least 4 characters."
            )
        db.set_user_password(user["id"], security.hash_password(supplied_secret))
        request.session["userId"] = user["id"]
        return {
            "success": True,
            "message": f"Password set for this account. Welcome, {user['name']}!",
            "user": user,
            "passwordJustSet": True,
        }

    if DEMO_MODE:
        request.session["userId"] = user["id"]
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
async def me(request: Request) -> dict[str, Any]:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return {"user": user}


@router.post("/logout")
async def logout(request: Request) -> dict[str, Any]:
    request.session.clear()
    return {"success": True}


@router.post("/change-password")
async def change_password(request: Request) -> dict[str, Any]:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED)

    body = await request.json()
    current_password = body.get("currentPassword")
    new_password = body.get("newPassword")

    if not new_password or len(new_password) < 4:
        raise HTTPException(
            status_code=400, detail="New password must be at least 4 characters."
        )

    existing_hash = db.get_user_password_hash(user["id"])
    if existing_hash:
        # Require the current password so a hijacked session cannot lock the owner out.
        if not current_password:
            raise HTTPException(
                status_code=400, detail="Current password is required to change it."
            )
        if not security.verify_password(current_password, existing_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    db.set_user_password(user["id"], security.hash_password(new_password))
    return {"success": True}
