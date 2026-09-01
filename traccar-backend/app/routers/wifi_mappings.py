import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth import require_session
from app.database import (
    delete_wifi_mapping_for_groups,
    get_groups_for_device,
    list_wifi_mappings_for_groups,
    upsert_wifi_mapping,
)
from app.broadcast import bus
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


class WifiMappingResponse(BaseModel):
    ssid: str
    place_id: int
    place_name: str


class CreateWifiMappingRequest(BaseModel):
    ssid: str
    place_id: int


@router.get("/wifi-mappings", response_model=list[WifiMappingResponse])
async def get_wifi_mappings(session: dict = Depends(require_session)) -> list[WifiMappingResponse]:
    my_groups = await get_groups_for_device(session["device_unique_id"])
    rows = await list_wifi_mappings_for_groups(my_groups)
    if not rows:
        return []

    # Fetch geofence names from Traccar to populate place_name
    place_names: dict[int, str] = {}
    try:
        client = await traccar.admin_session()
        try:
            geofences = await traccar.get_geofences(client)
            place_names = {g["id"]: g.get("name", "") for g in geofences}
        finally:
            await client.aclose()
    except TraccarError:
        pass  # Return mappings without place names if Traccar is unavailable

    return [
        WifiMappingResponse(
            ssid=row["ssid"],
            place_id=row["place_id"],
            place_name=place_names.get(row["place_id"], ""),
        )
        for row in rows
    ]


@router.post("/wifi-mappings", status_code=status.HTTP_201_CREATED, response_model=WifiMappingResponse)
async def create_wifi_mapping(
    body: CreateWifiMappingRequest,
    session: dict = Depends(require_session),
) -> WifiMappingResponse:
    # Write one row per circle the caller belongs to. A device in no circle
    # falls back to the legacy unscoped bucket, which only it can see.
    my_groups = await get_groups_for_device(session["device_unique_id"])
    for group_id in (my_groups or [0]):
        await upsert_wifi_mapping(body.ssid, body.place_id, group_id)
    logger.info(
        "WiFi mapping saved: ssid=%r → place_id=%d for circles %s",
        body.ssid, body.place_id, my_groups or ["unscoped"],
    )
    await bus.publish(json.dumps({"type": "wifi_mapping_changed"}))

    place_name = ""
    try:
        client = await traccar.admin_session()
        try:
            geofences = await traccar.get_geofences(client)
            place_names = {g["id"]: g.get("name", "") for g in geofences}
            place_name = place_names.get(body.place_id, "")
        finally:
            await client.aclose()
    except TraccarError:
        pass

    return WifiMappingResponse(ssid=body.ssid, place_id=body.place_id, place_name=place_name)


@router.delete("/wifi-mappings", status_code=status.HTTP_204_NO_CONTENT)
async def remove_wifi_mapping(
    ssid: str = Query(...),
    session: dict = Depends(require_session),
) -> None:
    my_groups = await get_groups_for_device(session["device_unique_id"])
    deleted = await delete_wifi_mapping_for_groups(ssid, my_groups)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WiFi mapping not found")
    logger.info("WiFi mapping deleted: ssid=%r", ssid)
    await bus.publish(json.dumps({"type": "wifi_mapping_changed"}))
