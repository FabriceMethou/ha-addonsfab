from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import require_session
from app import database as db

router = APIRouter(prefix="/groups", tags=["groups"])


class GroupRequest(BaseModel):
    name: str
    color: str = "#4CAF50"


class MemberRequest(BaseModel):
    device_unique_id: str


@router.get("")
async def list_groups(session: dict = Depends(require_session)):
    return await db.list_groups()


@router.post("", status_code=201)
async def create_group(req: GroupRequest, session: dict = Depends(require_session)):
    return await db.create_group(req.name, req.color)


@router.put("/{group_id}")
async def update_group(
    group_id: int, req: GroupRequest, session: dict = Depends(require_session)
):
    result = await db.update_group(group_id, req.name, req.color)
    if result is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return result


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, session: dict = Depends(require_session)):
    deleted = await db.delete_group(group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")


@router.get("/{group_id}/members")
async def list_members(group_id: int, session: dict = Depends(require_session)):
    return {"device_unique_ids": await db.get_devices_in_group(group_id)}


@router.post("/{group_id}/members", status_code=204)
async def add_member(
    group_id: int, req: MemberRequest, session: dict = Depends(require_session)
):
    group = await db.get_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.add_device_to_group(req.device_unique_id, group_id)


@router.delete("/{group_id}/members/{device_unique_id}", status_code=204)
async def remove_member(
    group_id: int,
    device_unique_id: str,
    session: dict = Depends(require_session),
):
    await db.remove_device_from_group(device_unique_id, group_id)
