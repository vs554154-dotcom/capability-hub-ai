"""Demo tools for a presenter's own computer: switching between a few sample people, and
putting the demo back to its starting point.

They exist only where DEMO_TOOLS is on and the request comes from this computer - not
through a proxy, not from the network, not from another site's page - and only for someone
already signed in. Anywhere else these routes answer 404, as if they were not there.

A switch does not sign anyone in from a bare id: it needs a live session, and it goes only
to the people the sample journeys name.
"""
from __future__ import annotations

import ipaddress
import logging
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import config, seed_data, snapshot
from ..deps import json_body, require_auth, require_manager_or_above, start_session
from ..repositories import users

logger = logging.getLogger("cybridge.demo")
FORWARDED = ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip", "via")


def _this_computer(name: str | None) -> bool:
    if name == "localhost":
        return True
    try:
        return ipaddress.ip_address((name or "").strip("[]")).is_loopback
    except ValueError:
        return False


def demo_tools(request: Request) -> None:
    """404 unless the tools are on and the request is this computer's own."""
    origin = request.headers.get("origin")
    if not (
        config.DEMO_TOOLS
        and _this_computer(request.client.host if request.client else None)
        and not any(h in request.headers for h in FORWARDED)
        and _this_computer(request.url.hostname)                     # a rebound name is refused
        and (origin is None or _this_computer(urlsplit(origin).hostname))
    ):
        raise HTTPException(status_code=404, detail="Not found.")


router = APIRouter(prefix="/api/demo", tags=["demo"], dependencies=[Depends(demo_tools)])


def _cast() -> list[dict[str, Any]]:
    people = []
    for member in seed_data.cast():
        person = users.get_user_by_id(member["userId"])
        if person:
            people.append({**member, "name": person["name"], "title": person["title"],
                           "avatar": person["avatar"], "role": person["role"]})
    return people


@router.get("")
def status(_: dict = Depends(require_auth)) -> dict[str, Any]:
    start = snapshot.starting_point()
    return {
        "people": _cast(),
        "startingPointSavedAt": (
            datetime.fromtimestamp(start.stat().st_mtime).isoformat(timespec="minutes") if start.exists() else None
        ),
    }


@router.post("/switch")
def switch(
    request: Request, body: dict[str, Any] = Depends(json_body), actor: dict = Depends(require_auth)
) -> dict[str, Any]:
    wanted = next((p for p in _cast() if p["userId"] == body.get("userId")), None)
    if not wanted:
        raise HTTPException(status_code=403, detail="Only the people of the demo can be switched to.")
    logger.info("Demo: %s switches to %s.", actor["id"], wanted["userId"])
    start_session(request, wanted["userId"])
    return {"success": True, "user": users.get_user_by_id(wanted["userId"])}


@router.post("/reset")
def reset(body: dict[str, Any] = Depends(json_body), actor: dict = Depends(require_manager_or_above)) -> dict[str, Any]:
    if body.get("confirm") is not True:
        raise HTTPException(status_code=400, detail="Confirm the reset: it removes everything entered since.")
    backup = snapshot.reset_demo()
    logger.info("Demo: reset by %s; backup %s.", actor["id"], backup.name)
    return {"success": True, "backup": backup.name}


@router.post("/starting-point")
def save_starting_point(
    body: dict[str, Any] = Depends(json_body), actor: dict = Depends(require_manager_or_above)
) -> dict[str, Any]:
    if body.get("confirm") is not True:
        raise HTTPException(status_code=400, detail="Confirm: a reset will go back to the demo as it is now.")
    snapshot.save_starting_point()
    logger.info("Demo: starting point saved by %s.", actor["id"])
    return {"success": True}
