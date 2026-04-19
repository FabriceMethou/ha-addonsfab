import logging
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.auth import require_session
from app.errors import http_error_from_traccar
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/route")
async def get_route(
    device_id: int = Query(...),
    from_dt: str = Query(..., alias="from"),
    to_dt: str = Query(..., alias="to"),
    session: dict = Depends(require_session),
) -> list[dict[str, Any]]:
    try:
        client = await traccar.admin_session()
        try:
            positions = await traccar.get_positions_history(client, device_id, from_dt, to_dt)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)

    _MAX_POINTS = 500

    raw = []
    for pos in positions:
        attrs = pos.get("attributes") or {}
        raw.append({
            "latitude": pos.get("latitude"),
            "longitude": pos.get("longitude"),
            "speed_kmh": round(pos.get("speed", 0) * 1.852, 2),
            "altitude": pos.get("altitude", 0.0),
            "course": pos.get("course", 0.0),
            "fix_time": pos.get("fixTime"),
            "battery_level": attrs.get("batteryLevel"),
        })

    # Downsample evenly if the trip has more points than the display limit.
    # Always keep the first and last point so the route start/end are exact.
    if len(raw) > _MAX_POINTS:
        step = len(raw) / _MAX_POINTS
        result = [raw[int(i * step)] for i in range(_MAX_POINTS - 1)]
        result.append(raw[-1])
    else:
        result = raw

    logger.info(
        "Route for device %d: %d raw positions → %d returned",
        device_id, len(raw), len(result),
    )
    return result
