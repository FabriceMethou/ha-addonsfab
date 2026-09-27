"""Circles: anyone creates one, the creator owns it, others join by invitation.

Membership used to be editable by any enrolled phone, which let anyone add
themselves to any circle and read its members' positions (finding E-07).
Now the only way in is an invitation code from someone already inside.
"""
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import require_session
from app.authz import require_member, require_owner, visible_ids_for_unique_id
from app.broadcast import bus
from app import database as db

router = APIRouter(prefix="/groups", tags=["groups"])

INVITE_HOURS = 48
# No 0/O, 1/I/L: codes are read aloud and typed by hand.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_code(length: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def normalise_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


class GroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: str = Field("#4CAF50", pattern=r"^#[0-9A-Fa-f]{6}$")


class JoinRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=20)


def _view(group: dict, me: str, member_count: int | None = None) -> dict:
    return {
        "id": group["id"],
        "name": group["name"],
        "color": group["color"],
        "role": "owner" if group.get("owner_unique_id") in (None, me) else "member",
        "member_count": member_count if member_count is not None else group.get("member_count", 1),
    }


async def _circles_changed() -> None:
    await bus.refresh_visibility(visible_ids_for_unique_id)


@router.get("")
async def list_my_groups(session: dict = Depends(require_session)) -> list[dict]:
    me = session["device_unique_id"]
    return [_view(g, me) for g in await db.list_groups_for_device(me)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_group(req: GroupRequest, session: dict = Depends(require_session)) -> dict:
    me = session["device_unique_id"]
    group = await db.create_group(req.name.strip(), req.color, owner_unique_id=me)
    await _circles_changed()
    return _view(group, me, member_count=1)


@router.put("/{group_id}")
async def update_group(group_id: int, req: GroupRequest,
                       session: dict = Depends(require_session)) -> dict:
    await require_owner(session, group_id)
    group = await db.update_group(group_id, req.name.strip(), req.color)
    members = await db.get_devices_in_group(group_id)
    return _view(group, session["device_unique_id"], member_count=len(members))


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: int, session: dict = Depends(require_session)) -> None:
    await require_owner(session, group_id)
    await db.delete_group(group_id)
    await _circles_changed()


@router.get("/{group_id}/members")
async def list_members(group_id: int, session: dict = Depends(require_session)) -> dict:
    group = await require_member(session, group_id)
    me = session["device_unique_id"]
    sessions = {s["device_unique_id"]: s for s in await db.list_sessions()}
    members = []
    for uid in await db.get_devices_in_group(group_id):
        s = sessions.get(uid)
        if s is None:
            continue
        members.append({
            "device_id": s["traccar_device_id"],
            "name": s["display_name"],
            "role": "owner" if group.get("owner_unique_id") == uid else "member",
            "is_me": uid == me,
        })
    return {"members": members}


@router.post("/{group_id}/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(group_id: int, session: dict = Depends(require_session)) -> dict:
    await require_member(session, group_id)
    code = new_code()
    expires = db.utcnow() + timedelta(hours=INVITE_HOURS)
    await db.create_invite(code, group_id, session["device_unique_id"], expires)
    return {"code": code, "expires_at": db.iso(expires)}


@router.post("/join")
async def join_group(req: JoinRequest, session: dict = Depends(require_session)) -> dict:
    invite = await db.get_valid_invite(normalise_code(req.code))
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="This invitation code is not valid or has expired")
    group = await db.get_group(invite["group_id"])
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Circle not found")
    me = session["device_unique_id"]
    await db.add_device_to_group(me, group["id"])
    await _circles_changed()
    members = await db.get_devices_in_group(group["id"])
    return _view(group, me, member_count=len(members))


@router.delete("/{group_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group(group_id: int, session: dict = Depends(require_session)) -> None:
    group = await require_member(session, group_id)
    me = session["device_unique_id"]
    await db.remove_device_from_group(me, group_id)
    remaining = await db.get_devices_in_group(group_id)
    if not remaining:
        await db.delete_group(group_id)
    elif group.get("owner_unique_id") == me:
        # The longest-standing member inherits the circle.
        await db.set_group_owner(group_id, remaining[0])
    await _circles_changed()


@router.delete("/{group_id}/members/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(group_id: int, device_id: int,
                        session: dict = Depends(require_session)) -> None:
    await require_owner(session, group_id)
    target = await db.get_session_by_device_id(device_id)
    if target is None or target["device_unique_id"] not in await db.get_devices_in_group(group_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a member")
    if target["device_unique_id"] == session["device_unique_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Use leave to remove yourself")
    await db.remove_device_from_group(target["device_unique_id"], group_id)
    await _circles_changed()
