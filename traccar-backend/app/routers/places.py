"""Places: Traccar geofences owned by a circle.

A place created from the app belongs to one circle, and only that circle's
members see it, edit it and hear about arrivals there. Geofences made in
Traccar's own interface belong to no circle: everyone sees them, and a member
claims one for a circle by editing it.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app import places as place_cache
from app.auth import require_session
from app.authz import audience_for_device, require_member, visible_device_ids
from app.broadcast import bus
from app.database import delete_place_rows, get_groups_for_device, set_place_group
from app.errors import http_error_from_traccar
from app.geo import circle_wkt
from app.places import Place
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


class CreatePlaceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius: float = Field(..., gt=0, le=50_000)  # metres, max 50 km
    group_id: int


class UpdatePlaceRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    radius: float | None = Field(None, gt=0, le=50_000)
    group_id: int | None = None


def _view(place: Place, my_groups: set[int]) -> dict[str, Any]:
    area = place.area
    return {
        "id": place.id,
        "name": place.name,
        "area": place.area_wkt,
        "latitude": area.latitude if area else None,
        "longitude": area.longitude if area else None,
        "radius": area.radius if area else None,
        "group_id": place.group_id,
        "can_edit": place.group_id is None or place.group_id in my_groups,
    }


async def _notify_members(session: dict) -> None:
    recipients = await visible_device_ids(session)
    await bus.publish_to({"type": "places_changed"}, recipients)


@router.get("/places")
async def get_places(session: dict = Depends(require_session)) -> list[dict[str, Any]]:
    my_groups = set(await get_groups_for_device(session["device_unique_id"]))
    try:
        visible = await place_cache.places_for_device(session["device_unique_id"], strict=True)
    except TraccarError as exc:
        http_error_from_traccar(exc)
    return [_view(p, my_groups) for p in visible]


@router.post("/places", status_code=status.HTTP_201_CREATED)
async def create_place(body: CreatePlaceRequest,
                       session: dict = Depends(require_session)) -> dict[str, Any]:
    await require_member(session, body.group_id)
    area = circle_wkt(body.latitude, body.longitude, body.radius)
    try:
        client = await traccar.admin_session()
        try:
            geofence = await traccar.create_geofence(client, body.name.strip(), area)
            # Keeps Traccar's own reports aware of the place. Arrivals no
            # longer depend on it: the backend computes them itself.
            members = await audience_for_device(session["traccar_device_id"], body.group_id)
            for device_id in sorted(members | {session["traccar_device_id"]}):
                await traccar.link_geofence_to_device(client, device_id, geofence["id"])
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)

    await set_place_group(geofence["id"], body.group_id)
    place_cache.invalidate()
    await _notify_members(session)
    place = await place_cache.find_place(geofence["id"])
    return _view(place, {body.group_id}) if place else {
        "id": geofence["id"], "name": geofence.get("name"), "area": geofence.get("area"),
        "latitude": body.latitude, "longitude": body.longitude, "radius": body.radius,
        "group_id": body.group_id, "can_edit": True,
    }


async def _editable_place(session: dict, place_id: int) -> tuple[Place, set[int]]:
    my_groups = set(await get_groups_for_device(session["device_unique_id"]))
    place = next((p for p in await place_cache.places_for_device(session["device_unique_id"])
                  if p.id == place_id), None)
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Place not found")
    return place, my_groups


@router.put("/places/{place_id}")
async def update_place(place_id: int, body: UpdatePlaceRequest,
                       session: dict = Depends(require_session)) -> dict[str, Any]:
    place, my_groups = await _editable_place(session, place_id)
    if place.group_id is not None and place.group_id not in my_groups:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your circle's place")
    if body.group_id is not None and body.group_id not in my_groups:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your circle")

    area = place.area
    if area is None and None in (body.latitude, body.longitude, body.radius):
        raise HTTPException(status_code=422, detail="This place's shape cannot be edited here")
    latitude = body.latitude if body.latitude is not None else area.latitude
    longitude = body.longitude if body.longitude is not None else area.longitude
    geometry_changed = any(v is not None for v in (body.latitude, body.longitude, body.radius))
    if geometry_changed or area.radius is not None:
        radius = body.radius if body.radius is not None else (area.radius or 100.0)
        wkt = circle_wkt(latitude, longitude, radius)
    else:
        wkt = place.area_wkt  # a polygon renamed or re-assigned keeps its shape
    name = (body.name or place.name).strip()

    try:
        client = await traccar.admin_session()
        try:
            geofences = await traccar.get_geofences(client)
            geofence = next((g for g in geofences if g["id"] == place_id), None)
            if geofence is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Place not found")
            await traccar.update_geofence(client, geofence, name, wkt)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)

    if body.group_id is not None:
        await set_place_group(place_id, body.group_id)
    place_cache.invalidate()
    await _notify_members(session)
    updated = await place_cache.find_place(place_id)
    return _view(updated or place, my_groups)


@router.delete("/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_place(place_id: int, session: dict = Depends(require_session)) -> None:
    place, my_groups = await _editable_place(session, place_id)
    if place.group_id is None or place.group_id not in my_groups:
        # Unassigned places may predate the app; deleting one from a phone
        # could remove something set up by hand in Traccar.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only places that belong to your circle can be deleted")
    try:
        client = await traccar.admin_session()
        try:
            await traccar.delete_geofence(client, place_id)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)
    await delete_place_rows(place_id)
    place_cache.invalidate()
    await _notify_members(session)
