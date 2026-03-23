import asyncio
import json
import logging
from typing import AsyncIterator

import websockets
import websockets.exceptions
from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.auth import require_session
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()

_KEEPALIVE_INTERVAL = 30  # seconds
_RECONNECT_BASE = 1
_RECONNECT_MAX = 30


@router.get("/stream")
async def stream(
    request: Request,
    session: dict = Depends(require_session),
) -> EventSourceResponse:
    return EventSourceResponse(
        _event_generator(request, session["traccar_email"], session["traccar_password"])
    )


async def _event_generator(
    request: Request, email: str, password: str
) -> AsyncIterator[dict]:
    backoff = _RECONNECT_BASE

    while True:
        if await request.is_disconnected():
            logger.debug("SSE client disconnected")
            return

        ws = None
        try:
            ws = await traccar.connect_websocket(email, password)
            backoff = _RECONNECT_BASE  # reset on successful connect

            async for raw in _ws_with_keepalive(ws, request):
                yield raw
                if await request.is_disconnected():
                    return

        except (TraccarError, websockets.exceptions.WebSocketException, OSError) as exc:
            logger.warning("Traccar WS disconnected: %s — reconnecting in %ds", exc, backoff)
            yield {"data": json.dumps({"type": "reconnecting"})}
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, _RECONNECT_MAX)
        finally:
            if ws is not None:
                try:
                    await ws.close()
                except Exception:
                    pass


async def _ws_with_keepalive(
    ws, request: Request
) -> AsyncIterator[dict]:
    """Yield SSE events from a Traccar websocket, interspersed with keepalives."""
    keepalive_task = asyncio.ensure_future(_keepalive_ticker())
    try:
        while True:
            recv_task = asyncio.ensure_future(ws.recv())
            done, _ = await asyncio.wait(
                {recv_task, keepalive_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if keepalive_task in done:
                yield {"comment": "keepalive"}
                keepalive_task = asyncio.ensure_future(_keepalive_ticker())

            if recv_task in done:
                raw_msg = recv_task.result()
                event = _parse_traccar_message(raw_msg)
                if event is not None:
                    yield {"data": json.dumps(event)}

            if await request.is_disconnected():
                recv_task.cancel()
                keepalive_task.cancel()
                return
    finally:
        keepalive_task.cancel()


async def _keepalive_ticker() -> None:
    await asyncio.sleep(_KEEPALIVE_INTERVAL)


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
