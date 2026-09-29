"""What phones send: positions, their own status, SOS and check-ins.

Positions arrive here with the device token instead of going straight to
Traccar's public OsmAnd port. The backend runs each one through detection and
queues it for Traccar on the LAN (Traccar stays the history store; see
forwarder.py).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app import engine, forwarder
from app.alerts import SEVERITY_INFO, display_name, public_alert, raise_alert
from app.auth import require_session
from app.database import get_device_state, outbox_add
from app.places import places_for_device
from app.rate_limit import DeviceRateLimiter

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


# A phone clock can be wrong. A fix dated in the future would become the
# "latest" and make every real position after it look like history,
# freezing the person on the map (finding S-01).
MAX_CLOCK_SKEW = timedelta(minutes=5)


def _normalise(p: PositionIn, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    fix_time = datetime.fromtimestamp(p.time // 1000, tz=timezone.utc)
    if fix_time > now + MAX_CLOCK_SKEW:
        logger.warning("Fix dated %s is in the future; using the server's time", fix_time)
        fix_time = now.replace(microsecond=0)
    return {
        "timestamp": int(fix_time.timestamp()),
        "fix_time": fix_time,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "speed_kmh": max(0.0, p.speed) * 3.6,
        "course": p.course,
        "altitude": p.altitude,
        "accuracy": p.accuracy,
        "battery": p.battery,
        "charging": p.charging,
        "mock": p.mock,
        "alarm": p.alarm,
    }


# Uploads per phone per minute. Batching keeps a phone far below this.
positions_limiter = DeviceRateLimiter(max_calls=60, window=60)


@router.post("/positions")
async def post_positions(body: PositionsIn, session: dict = Depends(require_session)) -> dict:
    """Record a batch; move the live map only for the newest.

    The phone sends its current position first, then anything saved while it
    had no data. Every position is recorded and goes into Traccar's history,
    so the trip shows on the member's page, but only one newer than what the
    family already sees moves the marker. Detection runs straight away;
    Traccar receives the positions from the outbox, so its being down only
    delays the history.
    """
    device_id = session["traccar_device_id"]
    positions_limiter.check(device_id)
    unique_id = session["device_unique_id"]
    batch = sorted((_normalise(p) for p in body.positions), key=lambda p: p["timestamp"])
    newest = batch[-1]["timestamp"] if batch else None
    state = await get_device_state(device_id) or {}
    live_up_to = engine.parse_time(state.get("last_fix_time"))
    backlog: list[dict] = []
    for pos in batch:
        backfill = live_up_to is not None and pos["fix_time"] < live_up_to
        if not await outbox_add(device_id, unique_id, pos, backfill):
            continue  # a re-sent batch: recorded already
        if backfill:
            backlog.append(pos)
        await engine.process(device_id, pos, publish=pos["timestamp"] == newest)
    if batch:
        forwarder.kick()
    if backlog:
        await engine.summarise_backlog(device_id, backlog)
    if body.status is not None:
        await engine.process_status(device_id, body.status.model_dump(exclude_none=True))
    return {"accepted": len(batch)}


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
        await outbox_add(device_id, session["device_unique_id"], full, backfill=False)
        forwarder.kick()
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
        mine = await places_for_device(session["device_unique_id"])
        place = next((p for p in mine if p.id == body.place_id), None)
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
