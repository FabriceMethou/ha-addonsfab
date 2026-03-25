import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import require_session
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
        msg = str(exc)
        if "client error" in msg:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg)

    result = []
    for pos in positions:
        attrs = pos.get("attributes") or {}
        result.append({
            "latitude": pos.get("latitude"),
            "longitude": pos.get("longitude"),
            "speed_kmh": round(pos.get("speed", 0) * 1.852, 2),
            "altitude": pos.get("altitude", 0.0),
            "course": pos.get("course", 0.0),
            "fix_time": pos.get("fixTime"),
            "battery_level": attrs.get("batteryLevel"),
        })

    logger.info("Route for device %d: %d positions", device_id, len(result))
    return result
