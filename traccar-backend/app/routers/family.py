import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends

from app import engine
from app.auth import require_session
from app.authz import visible_device_ids
from app.database import list_device_states, list_sessions, load_status
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

    allowed = await visible_device_ids(session)
    pos_by_device: dict[int, dict] = {p["deviceId"]: p for p in positions}
    states = await list_device_states()
    sessions = {s["traccar_device_id"]: s for s in await list_sessions()}

    result = []
    for device in devices:
        did = device["id"]
        if did not in allowed:
            continue
        state = states.get(did) or {}
        # Traccar receives positions through the outbox, a little later (or
        # much later while it is down); the backend's own latest is fresher.
        pos = _freshest(pos_by_device.get(did), state)
        entry: dict[str, Any] = {
            "device_id": did,
            "name": (sessions.get(did) or {}).get("display_name") or device.get("name"),
            "phone": (sessions.get(did) or {}).get("phone"),
            "mock_location": bool(state.get("last_mock")),
            "is_me": did == session["traccar_device_id"],
            "sharing": state.get("sharing", "active"),
            "app_version": load_status(state.get("status_json")).get("app_version"),
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
            "activity": _attr(pos, "activity") if pos else None,
        }
        result.append(entry)

    return result


async def _fetch_devices_and_positions(client):
    return await asyncio.gather(
        traccar.get_devices(client),
        traccar.get_positions(client),
    )


def _freshest(pos: dict | None, state: dict) -> dict | None:
    """Traccar's latest position, or the backend's when that one is newer."""
    mine = engine.parse_time(state.get("last_fix_time"))
    if mine is None or state.get("last_latitude") is None:
        return pos
    theirs = engine.parse_time(pos.get("fixTime")) if pos else None
    if theirs is not None and theirs >= mine:
        return pos
    attributes = {}
    if state.get("last_battery") is not None:
        attributes["batteryLevel"] = state["last_battery"]
    if state.get("last_charging") is not None:
        attributes["charge"] = bool(state["last_charging"])
    return {
        "latitude": state["last_latitude"],
        "longitude": state["last_longitude"],
        "speed": (state.get("last_speed_kmh") or 0.0) / 1.852,
        "fixTime": state["last_fix_time"],
        "attributes": attributes,
    }


def _attr(pos: dict, key: str) -> Any:
    attrs = pos.get("attributes") or {}
    return attrs.get(key)


