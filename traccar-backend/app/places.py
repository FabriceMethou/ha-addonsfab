"""Places (Traccar geofences) with their shapes and owning circle, cached.

The detection engine looks at every place for every position, so the list is
kept in memory for a minute and dropped whenever a place changes.
"""
import asyncio
import logging
import time
from dataclasses import dataclass

from app.database import get_groups_for_device, get_place_groups
from app.geo import Area, parse_area
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)

_TTL_SECONDS = 60.0


@dataclass(frozen=True)
class Place:
    id: int
    name: str
    area_wkt: str
    area: Area | None
    group_id: int | None  # None: predates circles, visible to everyone


_cache: list[Place] | None = None
_cached_at = 0.0
_lock = asyncio.Lock()


def invalidate() -> None:
    global _cache
    _cache = None


async def all_places(strict: bool = False) -> list[Place]:
    """All places. ``strict`` raises when Traccar is unreachable and nothing
    is cached, instead of answering with an empty list."""
    global _cache, _cached_at
    async with _lock:
        if _cache is not None and time.monotonic() - _cached_at < _TTL_SECONDS:
            return _cache
        try:
            client = await traccar.admin_session()
            try:
                geofences = await traccar.get_geofences(client)
            finally:
                await client.aclose()
        except TraccarError as exc:
            logger.warning("Could not load places: %s", exc)
            if strict and _cache is None:
                raise
            return _cache or []
        owners = await get_place_groups()
        _cache = [
            Place(
                id=g["id"],
                name=g.get("name") or "",
                area_wkt=g.get("area") or "",
                area=parse_area(g.get("area")),
                group_id=owners.get(g["id"]),
            )
            for g in geofences
        ]
        _cached_at = time.monotonic()
        return _cache


async def places_for_device(device_unique_id: str, strict: bool = False) -> list[Place]:
    """Places a device may see: its circles' places, plus unassigned ones."""
    groups = set(await get_groups_for_device(device_unique_id))
    return [p for p in await all_places(strict)
            if p.group_id is None or p.group_id in groups]


async def find_place(place_id: int) -> Place | None:
    return next((p for p in await all_places() if p.id == place_id), None)
