import asyncio
import json
import logging
from typing import AsyncIterator

import websockets
import websockets.exceptions
from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app import engine
from app.auth import require_session
from app.authz import visible_device_ids
from app.broadcast import bus
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()

_KEEPALIVE_INTERVAL = 30  # seconds
_KMH_PER_KNOT = 1.852


async def ws_reader_loop() -> None:
    """Single background task: follows Traccar's admin WebSocket.

    Positions posted to /positions have already been processed and are
    skipped here by fix time. This path matters for devices that still send
    to Traccar directly. Traccar's own events are not forwarded: arrivals,
    SOS and the rest are decided by the backend's engine.
    """
    backoff = 1
    while True:
        ws = None
        try:
            ws = await traccar.connect_admin_websocket()
            backoff = 1
            logger.info("Admin WebSocket connected")
            async for raw in ws:
                await handle_traccar_frame(raw)
        except (TraccarError, websockets.exceptions.WebSocketException, OSError) as exc:
            logger.warning("Admin WS error: %s — reconnecting in %ds", exc, backoff)
            await bus.publish_to({"type": "reconnecting"})
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
        finally:
            if ws is not None:
                try:
                    await ws.close()
                except Exception:
                    pass


async def handle_traccar_frame(raw: str) -> None:
    try:
        msg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(msg, dict):
        return

    for dev in msg.get("devices") or []:
        if isinstance(dev, dict) and isinstance(dev.get("id"), int):
            await bus.publish_update(
                {"type": "device", "device_id": dev["id"], "status": dev.get("status"),
                 "last_update": dev.get("lastUpdate")},
                dev["id"],
            )

    for pos in msg.get("positions") or []:
        normalised = normalise_traccar_position(pos)
        if normalised is not None:
            await engine.process(pos["deviceId"], normalised)


def normalise_traccar_position(pos: dict) -> dict | None:
    if not isinstance(pos, dict) or not isinstance(pos.get("deviceId"), int):
        return None
    fix_time = engine.parse_time(pos.get("fixTime"))
    if fix_time is None or pos.get("latitude") is None or pos.get("longitude") is None:
        return None
    attrs = pos.get("attributes") or {}
    battery = attrs.get("batteryLevel", attrs.get("battery"))
    return {
        "fix_time": fix_time,
        "latitude": pos["latitude"],
        "longitude": pos["longitude"],
        "speed_kmh": (pos.get("speed") or 0.0) * _KMH_PER_KNOT,
        "course": pos.get("course"),
        "altitude": pos.get("altitude"),
        "accuracy": pos.get("accuracy"),
        "address": pos.get("address"),
        "battery": battery if isinstance(battery, (int, float)) else None,
        "charging": bool(attrs.get("charge")),
        "alarm": attrs.get("alarm"),
    }


@router.post("/request-status", status_code=204)
async def request_status(session: dict = Depends(require_session)) -> None:
    """Ask every phone in the caller's circles to report its position now.

    Phones listen from their tracking service, so this reaches them even
    when the app is closed.
    """
    recipients = await visible_device_ids(session)
    recipients.discard(session["traccar_device_id"])
    await bus.publish_to({"type": "status_request"}, recipients)


@router.get("/stream")
async def stream(
    request: Request,
    session: dict = Depends(require_session),
) -> EventSourceResponse:
    sub = await bus.subscribe(
        device_id=session["traccar_device_id"],
        unique_id=session["device_unique_id"],
        visible=await visible_device_ids(session),
    )
    return EventSourceResponse(
        _client_generator(request, sub),
        headers={"X-Accel-Buffering": "no"},
    )


async def _client_generator(request: Request, sub) -> AsyncIterator[dict]:
    try:
        while True:
            if await request.is_disconnected():
                return
            try:
                data = await asyncio.wait_for(sub.queue.get(), timeout=_KEEPALIVE_INTERVAL)
                yield {"data": data}
            except asyncio.TimeoutError:
                yield {"comment": "keepalive"}
    finally:
        await bus.unsubscribe(sub)
