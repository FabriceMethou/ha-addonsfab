import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import require_session
from app.errors import http_error_from_traccar
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


class CreatePlaceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    latitude: float
    longitude: float
    radius: float = Field(..., gt=0, le=50_000)  # meters, max 50 km


@router.get("/places")
async def get_places(session: dict = Depends(require_session)) -> list[dict[str, Any]]:
    try:
        client = await traccar.admin_session()
        try:
            geofences = await traccar.get_geofences(client)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)

    return [{"id": g["id"], "name": g.get("name"), "area": g.get("area")} for g in geofences]


@router.post("/places", status_code=201)
async def create_place(
    body: CreatePlaceRequest,
    session: dict = Depends(require_session),
) -> dict[str, Any]:
    # Traccar circle format: CIRCLE(lat lon, radiusMeters)
    area = f"CIRCLE({body.latitude} {body.longitude}, {body.radius})"
    try:
        client = await traccar.admin_session()
        try:
            geofence = await traccar.create_geofence(client, body.name, area)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)

    return {"id": geofence["id"], "name": geofence.get("name"), "area": geofence.get("area")}


@router.delete("/places/{place_id}", status_code=204)
async def delete_place(
    place_id: int,
    session: dict = Depends(require_session),
) -> None:
    try:
        client = await traccar.admin_session()
        try:
            await traccar.delete_geofence(client, place_id)
        finally:
            await client.aclose()
    except TraccarError as exc:
        http_error_from_traccar(exc)
