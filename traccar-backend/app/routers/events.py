import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import require_session
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/events")
async def get_events(
    hours: int = Query(24, ge=1, le=720),
    session: dict = Depends(require_session),
) -> list[dict[str, Any]]:
    try:
        client = await traccar.admin_session()
        try:
            devices = await traccar.get_devices(client)
            device_ids = [d["id"] for d in devices]
            device_name_map = {d["id"]: d.get("name") for d in devices}

            geofences = await traccar.get_geofences(client)
            geofence_map = {g["id"]: g.get("name") for g in geofences}

            raw_events = await traccar.get_events(client, device_ids, hours)
        finally:
            await client.aclose()
    except TraccarError as exc:
        _http_error_from_traccar(exc)

    result = []
    for ev in raw_events:
        geofence_id = ev.get("geofenceId")
        result.append({
            "id": ev.get("id"),
            "device_id": ev.get("deviceId"),
            "device_name": device_name_map.get(ev.get("deviceId")),
            "type": ev.get("type"),
            "geofence_name": geofence_map.get(geofence_id) if geofence_id else None,
            "event_time": ev.get("eventTime"),
        })

    return result


def _http_error_from_traccar(exc: TraccarError) -> None:
    msg = str(exc)
    if "client error" in msg:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg)
