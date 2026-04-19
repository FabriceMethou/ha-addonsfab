import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.auth import require_session
from app.errors import http_error_from_traccar
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/family")
async def get_family(session: dict = Depends(require_session)) -> list[dict[str, Any]]:
    try:
        client = await traccar.admin_session()
        try:
            devices, positions = await _fetch_devices_and_positions(client)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)

    pos_by_device: dict[int, dict] = {p["deviceId"]: p for p in positions}

    result = []
    for device in devices:
        did = device["id"]
        pos = pos_by_device.get(did)
        entry: dict[str, Any] = {
            "device_id": did,
            "name": device.get("name"),
            "status": device.get("status"),
            "last_update": device.get("lastUpdate"),
            "latitude": pos["latitude"] if pos else None,
            "longitude": pos["longitude"] if pos else None,
            "speed_kmh": round(pos["speed"] * 1.852, 2) if pos else None,
            "course": pos.get("course") if pos else None,
            "accuracy": pos.get("accuracy") if pos else None,
            "address": pos.get("address") if pos else None,
            "battery_level": _attr(pos, "batteryLevel") if pos else None,
            "is_charging": _attr(pos, "charge") if pos else None,
            "fix_time": pos.get("fixTime") if pos else None,
        }
        result.append(entry)

    return result


async def _fetch_devices_and_positions(client):
    return await asyncio.gather(
        traccar.get_devices(client),
        traccar.get_positions(client),
    )


def _attr(pos: dict, key: str) -> Any:
    attrs = pos.get("attributes") or {}
    return attrs.get(key)


