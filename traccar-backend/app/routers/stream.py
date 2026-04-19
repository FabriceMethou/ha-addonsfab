import asyncio
import json
import logging
from typing import AsyncIterator

import websockets
import websockets.exceptions
from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.auth import require_session
from app.broadcast import bus
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()

_KEEPALIVE_INTERVAL = 30  # seconds


async def ws_reader_loop() -> None:
    """Single background task: maintains admin WS, publishes events to bus."""
    backoff = 1
    while True:
        ws = None
        try:
            ws = await traccar.connect_admin_websocket()
            backoff = 1
            logger.info("Admin WebSocket connected")
            async for raw in ws:
                event = _parse_traccar_message(raw)
                if event:
                    await bus.publish(json.dumps(event))
        except (TraccarError, websockets.exceptions.WebSocketException, OSError) as exc:
            logger.warning("Admin WS error: %s — reconnecting in %ds", exc, backoff)
            await bus.publish(json.dumps({"type": "reconnecting"}))
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
        finally:
            if ws is not None:
                try:
                    await ws.close()
                except Exception:
                    pass


@router.post("/request-status", status_code=204)
async def request_status(session: dict = Depends(require_session)) -> None:
    """Broadcasts a status_request to all SSE-connected devices.
    Called when a device opens the app so every other device immediately
    reports its current position and battery level."""
    await bus.publish(json.dumps({"type": "status_request"}))


@router.get("/stream")
async def stream(
    request: Request,
    session: dict = Depends(require_session),
) -> EventSourceResponse:
    return EventSourceResponse(
        _client_generator(request),
        headers={"X-Accel-Buffering": "no"},
    )


async def _client_generator(request: Request) -> AsyncIterator[dict]:
    q = await bus.subscribe()
    try:
        while True:
            if await request.is_disconnected():
                return
            try:
                data = await asyncio.wait_for(q.get(), timeout=_KEEPALIVE_INTERVAL)
                yield {"data": data}
            except asyncio.TimeoutError:
                yield {"comment": "keepalive"}
    finally:
        await bus.unsubscribe(q)


def _parse_traccar_message(raw: str) -> dict | None:
    try:
        msg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None

    positions = msg.get("positions", [])
    devices = msg.get("devices", [])
    events = msg.get("events", [])

    # Return the first meaningful payload (multiple can arrive in one frame)
    if positions:
        pos = positions[0]
        attrs = pos.get("attributes") or {}
        return {
            "type": "position",
            "device_id": pos.get("deviceId"),
            "latitude": pos.get("latitude"),
            "longitude": pos.get("longitude"),
            "speed_kmh": round(pos.get("speed", 0) * 1.852, 2),
            "battery_level": attrs.get("batteryLevel"),
        }
    if devices:
        dev = devices[0]
        return {"type": "device", "device_id": dev.get("id"), "status": dev.get("status")}
    if events:
        ev = events[0]
        return {
            "type": "event",
            "device_id": ev.get("deviceId"),
            "event_type": ev.get("type"),
            "geofence_name": ev.get("geofenceName"),
        }
    return None
