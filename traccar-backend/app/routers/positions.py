"""What phones send: positions, their own status, SOS and check-ins.

Positions arrive here with the device token instead of going straight to
Traccar's public OsmAnd port. The backend forwards each one to Traccar on the
LAN (Traccar stays the history store), then runs it through detection.
"""
import logging
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app import engine
from app.alerts import SEVERITY_INFO, display_name, public_alert, raise_alert
from app.auth import require_session
from app.broadcast import bus
from app.database import get_device_state, iso
from app.places import find_place
from app.traccar import traccar

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_BATCH = 500


class PositionIn(BaseModel):
    time: int = Field(..., description="Fix time, Unix milliseconds")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    speed: float = Field(0.0, description="metres per second")
    course: float = 0.0
    altitude: float = 0.0
    accuracy: float = 0.0
    battery: float | None = None
    charging: bool = False
    mock: bool = False
    alarm: str | None = None


class StatusIn(BaseModel):
    tracking: Literal["active", "paused"] = "active"
    location_permission: Literal["always", "while_in_use", "denied"] | None = None
    location_enabled: bool | None = None
    battery_optimized: bool | None = None
    app_version: str | None = None


class PositionsIn(BaseModel):
    positions: list[PositionIn] = Field(default_factory=list, max_length=MAX_BATCH)
    status: StatusIn | None = None


def _normalise(p: PositionIn) -> dict:
    seconds = p.time // 1000
    return {
        "timestamp": seconds,
        "fix_time": datetime.fromtimestamp(seconds, tz=timezone.utc),
        "latitude": p.latitude,
        "longitude": p.longitude,
        "speed_kmh": max(0.0, p.speed) * 3.6,
        "course": p.course,
        "altitude": p.altitude,
        "accuracy": p.accuracy,
        "battery": p.battery,
        "charging": p.charging,
        "alarm": p.alarm,
    }


# Fix times already forwarded, per device, so a batch re-sent after a lost
# response is not stored twice. Older positions are legitimate (a trip saved
# offline arrives after the current position), so "older than the last one"
# cannot be the test. Lost on restart, which at worst duplicates one batch.
_RECENT_LIMIT = 5000
_recent: dict[int, OrderedDict[int, None]] = {}


def _seen(device_id: int, timestamp: int) -> bool:
    return timestamp in _recent.get(device_id, ())


def _remember(device_id: int, timestamp: int) -> None:
    seen = _recent.setdefault(device_id, OrderedDict())
    seen[timestamp] = None
    while len(seen) > _RECENT_LIMIT:
        seen.popitem(last=False)


def forget_recent() -> None:
    _recent.clear()


@router.post("/positions")
async def post_positions(body: PositionsIn, session: dict = Depends(require_session)) -> dict:
    """Store a batch in Traccar's history; move the live map only for the newest.

    The phone sends its current position first, then anything saved while it
    had no data. Every position goes into the history, so the trip shows on
    the member's page, but only one newer than what the family already sees
    moves the marker; replaying a finished flight on the map would show the
    person travelling when they have already arrived.

    Stops at the first position Traccar refuses, so the phone keeps the rest
    and retries them later. Returns how many were stored.
    """
    device_id = session["traccar_device_id"]
    unique_id = session["device_unique_id"]
    batch = sorted((_normalise(p) for p in body.positions), key=lambda p: p["timestamp"])
    newest = batch[-1]["timestamp"] if batch else None
    state = await get_device_state(device_id) or {}
    live_up_to = engine.parse_time(state.get("last_fix_time"))
    backfilled_from = None
    accepted = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as http:
        for pos in batch:
            if not _seen(device_id, pos["timestamp"]):
                if not await traccar.forward_osmand(http, unique_id, pos):
                    break
                _remember(device_id, pos["timestamp"])
                if live_up_to is not None and pos["fix_time"] < live_up_to:
                    backfilled_from = min(backfilled_from or pos["fix_time"], pos["fix_time"])
                await engine.process(device_id, pos, publish=pos["timestamp"] == newest)
            accepted += 1
    if backfilled_from is not None:
        # Tell the circle this person's history grew in the past, so cached
        # trips are fetched again and the late trip appears.
        await bus.publish_update(
            {"type": "history_updated", "device_id": device_id, "since": iso(backfilled_from)},
            device_id,
        )
    if body.status is not None:
        await engine.process_status(device_id, body.status.model_dump(exclude_none=True))
    if batch and accepted < len(batch):
        logger.warning("Device %s: stored %d of %d positions", device_id, accepted, len(batch))
    return {"accepted": accepted}


@router.post("/status")
async def post_status(body: StatusIn, session: dict = Depends(require_session)) -> dict:
    sharing = await engine.process_status(
        session["traccar_device_id"], body.model_dump(exclude_none=True)
    )
    return {"sharing": sharing}


class SosIn(BaseModel):
    kind: Literal["sos", "crash"] = "sos"
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    accuracy: float = 0.0
    battery: float | None = None


@router.post("/sos", status_code=status.HTTP_201_CREATED)
async def post_sos(body: SosIn, session: dict = Depends(require_session)) -> dict:
    """Raise an SOS (or an unanswered crash check) and say who was told.

    Never de-duplicated: someone pressing SOS twice means it.
    """
    device_id = session["traccar_device_id"]
    lat, lon = body.latitude, body.longitude
    if lat is None or lon is None:
        state = await get_device_state(device_id) or {}
        lat, lon = state.get("last_latitude"), state.get("last_longitude")
    pos = {"latitude": lat, "longitude": lon}
    alert = await engine.raise_emergency(device_id, body.kind, pos, dedupe=False)

    if lat is not None and lon is not None:
        now = datetime.now(timezone.utc).replace(microsecond=0)
        full = {
            "timestamp": int(now.timestamp()), "fix_time": now, "latitude": lat,
            "longitude": lon, "speed_kmh": 0.0, "accuracy": body.accuracy,
            "battery": body.battery, "alarm": body.kind,
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as http:
            await traccar.forward_osmand(http, session["device_unique_id"], full)
        await engine.process(device_id, full, skip_alarm=True)

    return {"alert_id": alert["id"], "recipients": alert["recipient_count"]}


@router.post("/sos/resolve", status_code=status.HTTP_201_CREATED)
async def resolve_sos(session: dict = Depends(require_session)) -> dict:
    device_id = session["traccar_device_id"]
    name = await display_name(device_id)
    alert = await raise_alert("sos_resolved", SEVERITY_INFO, device_id, f"{name} is safe",
                              "The SOS is over.")
    return {"alert_id": alert["id"], "recipients": alert["recipient_count"]}


class CheckinIn(BaseModel):
    kind: Literal["here", "on_my_way"] = "here"
    place_id: int | None = None


@router.post("/checkin", status_code=status.HTTP_201_CREATED)
async def post_checkin(body: CheckinIn, session: dict = Depends(require_session)) -> dict:
    device_id = session["traccar_device_id"]
    name = await display_name(device_id)
    state = await get_device_state(device_id) or {}
    lat, lon = state.get("last_latitude"), state.get("last_longitude")

    if body.kind == "on_my_way":
        place = await find_place(body.place_id) if body.place_id is not None else None
        if place is None:
            raise HTTPException(status_code=422, detail="Choose where you are going")
        title, place_name, place_id = f"{name} is on the way to {place.name}", place.name, place.id
        group_id = place.group_id
    else:
        place_name = await engine.current_place_name(device_id)
        title = f"{name} checked in at {place_name}" if place_name else f"{name} checked in"
        place_id, group_id = None, None

    alert = await raise_alert("checkin", SEVERITY_INFO, device_id, title, "",
                              latitude=lat, longitude=lon, place_id=place_id,
                              place_name=place_name, group_id=group_id)
    return {**public_alert(alert), "recipients": alert["recipient_count"]}
