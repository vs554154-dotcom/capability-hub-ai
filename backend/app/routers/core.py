"""Reference-data and user routes.

Directory, catalogue and team endpoints. Capability scoring, evidence, learning
plans and reminders live in routers/capability.py.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .. import db
from ..config import REPO_ROOT
from ..deps import (
    LEADERSHIP,
    MANAGER,
    require_auth,
    require_manager_or_above,
    require_role,
    require_self_manager_or_elevated,
)
from ..numeric import js_round

router = APIRouter(prefix="/api", tags=["core"])


# Intentionally public, matching server.ts: the login screen lists accounts before
# any session exists. Directory fields only - passwordHash is never mapped.
@router.get("/users")
async def get_users() -> list[dict[str, Any]]:
    return db.get_users()


@router.get("/skills")
async def get_skills(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return db.get_skills()


@router.get("/roles")
async def get_roles(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return db.get_target_roles()


@router.get("/courses")
async def get_courses(_: dict = Depends(require_auth)) -> list[dict[str, Any]]:
    return db.get_courses()


@router.get("/users/{id}")
async def get_user(
    id: str, _: dict = Depends(require_self_manager_or_elevated("id"))
) -> dict[str, Any]:
    user = db.get_user_by_id(id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/manager/{id}/team")
async def get_team(
    id: str, session_user: dict = Depends(require_manager_or_above)
) -> list[dict[str, Any]]:
    """Direct reports with their capability roll-up.

    require_manager_or_above blocks employees outright; the check below additionally
    stops one manager reading another manager's team, which the role check alone
    would allow. The 403 message matches server.ts exactly.
    """
    if session_user["role"] == MANAGER and session_user["id"] != id:
        raise HTTPException(
            status_code=403, detail="Managers can only view their own team."
        )

    # `user_2` also absorbs the legacy `mgr_1` reporting line, as in server.ts.
    team = [
        u for u in db.get_users()
        if u["role"] == "employee" and (
            u.get("managerId") == id
            or (id == "user_2" and u.get("managerId") in ("user_2", "mgr_1"))
        )
    ]

    target_roles = db.get_target_roles()
    all_evidences = db.get_evidences()
    result: list[dict[str, Any]] = []

    for member in team:
        skills = db.get_user_skills(member["id"])
        evidences = [e for e in all_evidences if e["userId"] == member["id"]]
        pending_count = len([e for e in evidences if e["status"] == "pending"])
        role = next(
            (r for r in target_roles if r["id"] == member.get("targetRoleId")), None
        )

        total_levels = sum(s["currentLevel"] for s in skills)
        avg_level = (total_levels / (len(skills) * 5)) * 100 if skills else 0
        verified_bonus = len([e for e in evidences if e["status"] == "approved"]) * 5

        gap_count = len([s for s in skills if s["currentLevel"] < s["targetLevel"]])
        risk_status = "High" if gap_count >= 4 else "Medium" if gap_count >= 2 else "Low"

        # Numeric seed from the user id produces stable, spread-out scores for
        # employees with no skill rows, so the 2x2 matrix is populated.
        digits = "".join(c for c in member["id"] if c.isdigit())
        numeric_id = int(digits) if digits else 1

        skill_score = min(100, js_round(avg_level + verified_bonus))
        if not skills:
            skill_score = 25 + ((numeric_id * 37) % 68)

        if member["id"] == "E1000":
            will_score = 88
        elif member["id"] == "E1005":
            will_score = 92
        else:
            will_score = 22 + ((numeric_id * 53) % 73)

        engagement_score = min(100, js_round((avg_level * 0.8) + (verified_bonus * 2)))
        if not skills:
            engagement_score = 30 + ((numeric_id * 29) % 65)

        result.append({
            "userId": member["id"],
            "userName": member["name"],
            "title": member["title"],
            "targetRoleTitle": role["title"] if role else "Automation Tester",
            "avatar": member["avatar"],
            "overallScore": skill_score,
            "skillScore": skill_score,
            "willScore": will_score,
            "engagementScore": engagement_score,
            "learningProgressPercent": engagement_score,
            "gapCount": gap_count,
            "pendingValidationCount": pending_count,
            "riskStatus": risk_status,
        })

    return result


@router.get("/download-app-zip")
async def download_app_zip(_: dict = Depends(require_role(LEADERSHIP))):
    """Source archive download.

    Leadership-only. This previously served the whole application source to any
    anonymous visitor who found the URL; the role gate is the fix and is
    reproduced here rather than relaxed.
    """
    zip_path = REPO_ROOT / "public" / "capability_hub_ai_source.zip"
    if not zip_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Zip archive not found. Please refresh and try again.",
        )
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="capability-hub-ai-source.zip",
    )
