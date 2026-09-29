"""Moving to a new phone.

The old phone asks for a transfer code; the new phone enrols with it and
takes over the same Traccar device, history and circles. This replaces the
name-based match that let anyone enrolling with an existing member's name
take over that member's device (finding E-08).
"""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

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


class PhoneNumberIn(BaseModel):
    phone_number: str | None = Field(None, max_length=32)


@router.put("/devices/me/phone")
async def set_my_phone_number(body: PhoneNumberIn, session: dict = Depends(require_session)) -> dict:
    """So the family can call from the member's page (finding L-13). Optional."""
    number = "".join(ch for ch in (body.phone_number or "") if ch.isdigit() or ch == "+") or None
    await db.set_phone_number(session["device_unique_id"], number)
    return {"phone_number": number}
