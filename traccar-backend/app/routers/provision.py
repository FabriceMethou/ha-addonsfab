import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.database import upsert_session
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


class ProvisionRequest(BaseModel):
    display_name: str
    device_unique_id: str


class ProvisionResponse(BaseModel):
    device_token: str
    tracking_url: str


@router.post("/provision", response_model=ProvisionResponse, status_code=201)
async def provision(req: ProvisionRequest) -> ProvisionResponse:
    try:
        return await _provision(req.display_name, req.device_unique_id)
    except TraccarError as exc:
        _http_error_from_traccar(exc)


async def _provision(display_name: str, device_unique_id: str) -> ProvisionResponse:
    admin = await traccar.admin_session()
    try:
        return await _run_provision(admin, display_name, device_unique_id)
    finally:
        await admin.aclose()


async def _run_provision(
    admin: Any,
    display_name: str,
    device_unique_id: str,
) -> ProvisionResponse:
    device_name = f"{display_name}'s phone"
    all_devices = await traccar.get_devices(admin)

    # 1. Try to find by unique ID first
    device = _find_by_unique_id(all_devices, device_unique_id)

    if device is None:
        # 2. Fall back to name match (re-provision case)
        candidates = [d for d in all_devices if d.get("name") == device_name]
        if candidates:
            device = max(candidates, key=lambda d: d.get("lastUpdate") or "")
            device = await traccar.update_device(admin, device, device_unique_id)

    # 3. Still not found — create a new device
    if device is None:
        device = await traccar.create_device(admin, device_name, device_unique_id)

    # 4. Persist session
    token = str(uuid.uuid4())
    await upsert_session(
        token=token,
        traccar_device_id=device["id"],
        display_name=display_name,
        device_unique_id=device_unique_id,
    )

    return ProvisionResponse(device_token=token, tracking_url=settings.traccar_url)


def _find_by_unique_id(devices: list[dict], unique_id: str) -> dict | None:
    return next((d for d in devices if d.get("uniqueId") == unique_id), None)


def _http_error_from_traccar(exc: TraccarError) -> None:
    msg = str(exc)
    if "client error" in msg:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg)
