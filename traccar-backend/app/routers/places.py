import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import require_session
from app.traccar import TraccarError, traccar

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/places")
async def get_places(session: dict = Depends(require_session)) -> list[dict[str, Any]]:
    try:
        client = await traccar.user_session(session["traccar_email"], session["traccar_password"])
        try:
            geofences = await traccar.get_geofences(client)
        finally:
            await client.aclose()
    except TraccarError as exc:
        _http_error_from_traccar(exc)

    return [{"id": g["id"], "name": g.get("name"), "area": g.get("area")} for g in geofences]


def _http_error_from_traccar(exc: TraccarError) -> None:
    msg = str(exc)
    if "client error" in msg:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg)
