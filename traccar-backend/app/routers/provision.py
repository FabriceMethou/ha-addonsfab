import asyncio
import logging
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.database import upsert_session
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_RETRIES = 3


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
    admin: httpx.AsyncClient,
    display_name: str,
    device_unique_id: str,
) -> ProvisionResponse:
    email = f"{device_unique_id}@mylife360.local"
    device_name = f"{display_name}'s phone"
    old_unique_id: str | None = None

    # ------------------------------------------------------------------ #
    # 1. Resolve device
    # ------------------------------------------------------------------ #
    all_devices = await traccar.get_devices(admin)
    device: dict[str, Any] | None = _find_by_unique_id(all_devices, device_unique_id)

    if device is None:
        # Search by name — pick the most recently-updated one
        candidates = [d for d in all_devices if d.get("name") == device_name]
        if candidates:
            device = max(
                candidates,
                key=lambda d: d.get("lastUpdate") or "",
            )
            old_unique_id = device.get("uniqueId")
            device = await traccar.update_device(admin, device, device_unique_id)

    # ------------------------------------------------------------------ #
    # 2. Resolve user
    # ------------------------------------------------------------------ #
    all_users = await traccar.get_users(admin)
    user: dict[str, Any] | None = _find_by_email(all_users, email)

    if user is None and old_unique_id:
        hint_email = f"{old_unique_id}@mylife360.local"
        user = _find_by_email(all_users, hint_email)
        if user is not None:
            user = await traccar.update_user_email(admin, user, email)

    password = str(uuid.uuid4())
    if user is None:
        user = await traccar.create_user(admin, display_name, email, password)
    else:
        # Use the stored password — we don't have it here, so generate a new
        # one and update the user record to keep DB in sync.
        # (Simpler than storing passwords separately; provision is idempotent.)
        password = str(uuid.uuid4())
        updated = {**user, "password": password}
        resp = await admin.put(f"/api/users/{user['id']}", json=updated)
        if not resp.is_success:
            raise TraccarError(f"Update user password failed: {resp.status_code}")

    # ------------------------------------------------------------------ #
    # 3. Create device if still not found
    # ------------------------------------------------------------------ #
    if device is None:
        device = await traccar.create_device(admin, device_name, device_unique_id)

    new_user_id: int = user["id"]
    new_device_id: int = device["id"]

    # ------------------------------------------------------------------ #
    # 4. Link permissions with retries
    # ------------------------------------------------------------------ #
    other_users = [u for u in all_users if u["id"] != new_user_id and u["id"] != settings.traccar_admin_user_id]
    other_devices = [d for d in all_devices if d["id"] != new_device_id]

    link_tasks = [
        # new user → their device
        (new_user_id, new_device_id),
        # admin → new device
        (settings.traccar_admin_user_id, new_device_id),
        *[(u["id"], new_device_id) for u in other_users],   # existing users → new device
        *[(new_user_id, d["id"]) for d in other_devices],   # new user → existing devices
    ]

    await asyncio.gather(*[
        _link_with_retry(admin, uid, did) for uid, did in link_tasks
    ])

    # ------------------------------------------------------------------ #
    # 5. Persist session
    # ------------------------------------------------------------------ #
    token = str(uuid.uuid4())
    await upsert_session(
        token=token,
        traccar_user_id=new_user_id,
        traccar_device_id=new_device_id,
        traccar_email=email,
        traccar_password=password,
        display_name=display_name,
        device_unique_id=device_unique_id,
    )

    return ProvisionResponse(
        device_token=token,
        tracking_url=settings.traccar_url,
    )


async def _link_with_retry(
    admin: httpx.AsyncClient, user_id: int, device_id: int
) -> None:
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            await traccar.link_permission(admin, user_id, device_id)
            return
        except TraccarError as exc:
            last_exc = exc
            wait = 2 ** attempt
            logger.warning(
                "link_permission(%s, %s) attempt %d/%d failed, retrying in %ds: %s",
                user_id, device_id, attempt + 1, _MAX_RETRIES, wait, exc,
            )
            await asyncio.sleep(wait)
    raise last_exc  # type: ignore[misc]


def _find_by_unique_id(devices: list[dict], unique_id: str) -> dict | None:
    return next((d for d in devices if d.get("uniqueId") == unique_id), None)


def _find_by_email(users: list[dict], email: str) -> dict | None:
    return next((u for u in users if u.get("email") == email), None)


def _http_error_from_traccar(exc: TraccarError) -> None:
    msg = str(exc)
    if "client error" in msg:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg)
