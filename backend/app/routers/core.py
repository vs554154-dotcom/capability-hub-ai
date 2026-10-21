"""Directory, catalogue, team and organisation-metrics routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..config import PRIVATE_DIR
from ..deps import (
    LEADERSHIP,
    MANAGER,
    require_auth,
    require_manager_or_above,
    require_role,
    require_self_manager_or_elevated,
)
from ..repositories import catalog, users
from ..services import analytics, capability

router = APIRouter(prefix="/api", tags=["core"])


# The signed-out landing page shows a profile count. Public, but only a number - no
# names, emails or roles leave the server before a session exists.
@router.get("/directory/summary")
def directory_summary() -> dict[str, Any]:
    return {"totalProfiles": len(users.get_users())}


@router.get("/users")
def get_users(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return users.get_users()


@router.get("/analytics/workforce")
def workforce_metrics(_: dict = Depends(require_manager_or_above)) -> dict[str, Any]:
    return analytics.workforce_metrics()


@router.get("/skills")
def get_skills(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return catalog.get_skills()


@router.get("/roles")
def get_roles(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return catalog.get_target_roles()


@router.get("/courses")
def get_courses(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return catalog.get_courses()


@router.get("/users/{id}")
def get_user(id: str, _: dict = Depends(require_self_manager_or_elevated("id"))) -> dict[str, Any]:
    user = users.get_user_by_id(id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/manager/{id}/team")
def get_team(id: str, session_user: dict = Depends(require_manager_or_above)) -> list[dict[str, Any]]:
    """Direct reports with their Skill / Will / Engagement roll-up. The role guard
    blocks employees; the check below also stops one manager reading another's team."""
    if session_user["role"] == MANAGER and session_user["id"] != id:
        raise HTTPException(status_code=403, detail="Managers can only view their own team.")
    return capability.team_rollup(id)


@router.get("/download-app-zip")
def download_app_zip(_: dict = Depends(require_role(LEADERSHIP))):
    """Leadership-only source archive. It lives in PRIVATE_DIR, outside the web root,
    so this gated route is the only way to reach it."""
    zip_path = PRIVATE_DIR / "capability_hub_ai_source.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Zip archive not found. Please refresh and try again.")
    return FileResponse(zip_path, media_type="application/zip", filename="capability-hub-ai-source.zip")
