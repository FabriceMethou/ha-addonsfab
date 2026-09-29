"""Driving reports: Traccar's trips, annotated with our driving events."""
import logging
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, Query

from app.auth import require_session
from app.authz import require_visible_device
from app.config import settings
from app.database import iso, list_driving_events, utcnow
from app.engine import parse_time
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()

_KMH_PER_KNOT = 1.852
# Anything shorter is a car being moved, not a drive worth reporting.
MIN_TRIP_METRES = 500


@router.get("/driving")
async def get_driving(
    device_id: int = Query(...),
    days: int = Query(7, ge=1, le=31),
    session: dict = Depends(require_session),
) -> dict:
    await require_visible_device(session, device_id)
    now = utcnow()
    since = now - timedelta(days=days)
    # Without Traccar's trips the week's speeding and braking counts are
    # still worth showing, so a failure degrades the report instead of
    # failing it.
    trips_error = None
    try:
        client = await traccar.admin_session()
        try:
            raw_trips = await traccar.get_trips(client, device_id, iso(since), iso(now))
        finally:
            await client.aclose()
    except (TraccarError, httpx.HTTPError) as exc:
        logger.warning("Trip report for device %s unavailable: %r", device_id, exc)
        raw_trips = []
        trips_error = ("Traccar took too long to compute the trips"
                       if isinstance(exc, httpx.TimeoutException)
                       else "Traccar could not compute the trips right now")

    events = await list_driving_events(device_id, since)
    trips = []
    for t in raw_trips:
        if (t.get("distance") or 0) < MIN_TRIP_METRES:
            continue
        start, end = parse_time(t.get("startTime")), parse_time(t.get("endTime"))
        inside = [e for e in events
                  if start and end and start <= parse_time(e["event_time"]) <= end]
        trips.append({
            "start_time": t.get("startTime"),
            "end_time": t.get("endTime"),
            "distance_km": round((t.get("distance") or 0) / 1000, 2),
            "duration_min": round((t.get("duration") or 0) / 60000),
            "max_speed_kmh": round((t.get("maxSpeed") or 0) * _KMH_PER_KNOT),
            "average_speed_kmh": round((t.get("averageSpeed") or 0) * _KMH_PER_KNOT),
            "start_address": t.get("startAddress"),
            "end_address": t.get("endAddress"),
            "start_latitude": t.get("startLat"),
            "start_longitude": t.get("startLon"),
            "end_latitude": t.get("endLat"),
            "end_longitude": t.get("endLon"),
            "speeding": sum(1 for e in inside if e["kind"] == "speeding"),
            "hard_brakes": sum(1 for e in inside if e["kind"] == "hard_brake"),
        })
    trips.sort(key=lambda t: t["start_time"] or "", reverse=True)

    return {
        "days": days,
        "speeding_limit_kmh": settings.speeding_limit_kmh,
        "trips_error": trips_error,
        "totals": {
            "trips": len(trips),
            "distance_km": round(sum(t["distance_km"] for t in trips), 1),
            "duration_min": sum(t["duration_min"] for t in trips),
            "max_speed_kmh": max((t["max_speed_kmh"] for t in trips), default=0),
            "speeding": sum(1 for e in events if e["kind"] == "speeding"),
            "hard_brakes": sum(1 for e in events if e["kind"] == "hard_brake"),
        },
        "trips": trips,
    }
