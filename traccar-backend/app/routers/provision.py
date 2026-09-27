import logging
import secrets
import time
import uuid
from collections import deque
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.config import settings
from app.database import (
    consume_transfer_code,
    delete_session_for_unique_id,
    rename_device_in_groups,
    upsert_session,
)
from app.errors import http_error_from_traccar
from app.rate_limit import provision_limiter
from app.routers.groups import normalise_code
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()

# The per-IP limiter trusts X-Forwarded-For, which a caller can forge. This
# second, global brake bounds how fast anyone can guess the enrolment code.
_FAILURE_WINDOW_S = 600
_MAX_FAILURES = 10
_failures: deque[float] = deque()


def _note_failure() -> None:
    _failures.append(time.monotonic())


def _check_failure_brake() -> None:
    cutoff = time.monotonic() - _FAILURE_WINDOW_S
    while _failures and _failures[0] < cutoff:
        _failures.popleft()
    if len(_failures) >= _MAX_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many wrong codes — try again in a few minutes",
        )


def reset_failure_brake() -> None:
    _failures.clear()


class ProvisionRequest(BaseModel):
    display_name: str
    device_unique_id: str
    enrolment_code: str = ""
    # From "Move to a new phone" on the old phone. Replaces the enrolment code.
    transfer_code: str = ""


def _check_enrolment_code(supplied: str) -> None:
    """Refuse enrolment unless the caller knows the configured code.

    Fails closed: an unconfigured backend enrols nobody, because an open
    /provision hands out a token that can read every family's location.
    """
    expected = settings.enrolment_code
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Enrolment is not configured on this server",
        )
    if not secrets.compare_digest(supplied, expected):
        _note_failure()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid enrolment code",
        )


class ProvisionResponse(BaseModel):
    device_token: str
    tracking_url: str
    device_id: int


@router.post("/provision", response_model=ProvisionResponse, status_code=201, dependencies=[Depends(provision_limiter)])
async def provision(req: ProvisionRequest, request: Request) -> ProvisionResponse:
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    _check_failure_brake()
    transfer = None
    if req.transfer_code:
        transfer = await consume_transfer_code(normalise_code(req.transfer_code))
        if transfer is None:
            _note_failure()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This transfer code is not valid or has expired",
            )
    else:
        _check_enrolment_code(req.enrolment_code)
    logger.info(
        "PROVISION REQUEST — name=%r  device_id=%r  ip=%s  transfer=%s",
        req.display_name, req.device_unique_id, client_ip, transfer is not None,
    )
    try:
        response = await _provision(req.display_name, req.device_unique_id, transfer)
        logger.info(
            "PROVISION OK — name=%r  device_id=%r  ip=%s  token=%s…",
            req.display_name, req.device_unique_id, client_ip, response.device_token[:6],
        )
        return response
    except TraccarError as exc:
        logger.warning(
            "PROVISION FAILED — name=%r  device_id=%r  ip=%s  error=%s",
            req.display_name, req.device_unique_id, client_ip, exc,
        )
        http_error_from_traccar(exc)


async def _provision(display_name: str, device_unique_id: str, transfer: dict | None) -> ProvisionResponse:
    admin = await traccar.admin_session()
    try:
        return await _run_provision(admin, display_name, device_unique_id, transfer)
    finally:
        await admin.aclose()


async def _run_provision(
    admin: Any,
    display_name: str,
    device_unique_id: str,
    transfer: dict | None,
) -> ProvisionResponse:
    all_devices = await traccar.get_devices(admin)

    if transfer is not None:
        # Take over the old phone's device: same history, same circles.
        device = next((d for d in all_devices if d["id"] == transfer["traccar_device_id"]), None)
        if device is None:
            raise TraccarError("Traccar client error 404: transferred device no longer exists")
        clash = _find_by_unique_id(all_devices, device_unique_id)
        if clash is not None and clash["id"] != device["id"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This phone is already enrolled as someone else",
            )
        if device.get("uniqueId") != device_unique_id:
            device = await traccar.update_device(admin, device, device_unique_id)
        old_uid = transfer["device_unique_id"]
        if old_uid != device_unique_id:
            await rename_device_in_groups(old_uid, device_unique_id)
            await delete_session_for_unique_id(old_uid)
    else:
        # A reinstall on the same phone keeps its identifier and finds its
        # device here. There is deliberately no fallback by name.
        device = _find_by_unique_id(all_devices, device_unique_id)
        if device is None:
            device = await traccar.create_device(admin, f"{display_name}'s phone", device_unique_id)

    token = str(uuid.uuid4())
    await upsert_session(
        token=token,
        traccar_device_id=device["id"],
        display_name=display_name,
        device_unique_id=device_unique_id,
    )

    tracking_url = settings.traccar_osmand_url or settings.traccar_url
    return ProvisionResponse(device_token=token, tracking_url=tracking_url, device_id=device["id"])


def _find_by_unique_id(devices: list[dict], unique_id: str) -> dict | None:
    return next((d for d in devices if d.get("uniqueId") == unique_id), None)
