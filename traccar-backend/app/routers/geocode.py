"""Addresses on request, for the day timeline.

Traccar keeps no address with each position (geocoding is on request only),
so the app asks for the few places a person stopped at in a day. Answers
are kept in memory by rounded coordinates: the same home or office is
looked up once.
"""
from collections import OrderedDict

from fastapi import APIRouter, Depends, Query

from app.auth import require_session
from app.rate_limit import DeviceRateLimiter
from app.traccar import TraccarError, traccar

router = APIRouter()

geocode_limiter = DeviceRateLimiter(max_calls=120, window=3600)

_CACHE_SIZE = 2000
_cache: OrderedDict[tuple[float, float], str | None] = OrderedDict()


def _key(latitude: float, longitude: float) -> tuple[float, float]:
    return round(latitude, 4), round(longitude, 4)  # about 10 m


def clear_cache() -> None:
    _cache.clear()


@router.get("/geocode")
async def geocode(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    session: dict = Depends(require_session),
) -> dict:
    key = _key(latitude, longitude)
    if key in _cache:
        _cache.move_to_end(key)
        return {"address": _cache[key]}
    geocode_limiter.check(session["traccar_device_id"])
    try:
        client = await traccar.admin_session()
        try:
            address = await traccar.geocode(client, *key)
        finally:
            await client.aclose()
    except TraccarError:
        return {"address": None}  # not cached: Traccar may be back soon
    _cache[key] = address
    if len(_cache) > _CACHE_SIZE:
        _cache.popitem(last=False)
    return {"address": address}
