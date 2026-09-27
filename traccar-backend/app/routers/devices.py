"""Moving to a new phone.

The old phone asks for a transfer code; the new phone enrols with it and
takes over the same Traccar device, history and circles. This replaces the
name-based match that let anyone enrolling with an existing member's name
take over that member's device (finding E-08).
"""
from fastapi import APIRouter, Depends, status

from app.auth import require_session
from app import database as db
from app.routers.groups import new_code

router = APIRouter()

TRANSFER_MINUTES = 15


@router.post("/devices/me/transfer-code", status_code=status.HTTP_201_CREATED)
async def create_transfer_code(session: dict = Depends(require_session)) -> dict:
    code = new_code()
    expires = db.expiry(TRANSFER_MINUTES)
    await db.create_transfer_code(
        code, session["traccar_device_id"], session["device_unique_id"], expires
    )
    return {"code": code, "expires_at": db.iso(expires)}
