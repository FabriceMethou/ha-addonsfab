"""What the phone's crash check felt, kept for tuning (finding L-07).

The thresholds (6 g, from 40 km/h, stop within 10 s) are judgement calls.
Phones report near misses and every check they start, and the admin page
lists them, so the thresholds can be set from what really happens.
"""
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.auth import require_session
from app.database import insert_crash_event
from app.rate_limit import DeviceRateLimiter

router = APIRouter()

crash_events_limiter = DeviceRateLimiter(max_calls=30, window=3600)


class CrashEventIn(BaseModel):
    kind: Literal["near_miss", "check_started", "answered_ok", "no_answer"]
    peak_g: float | None = Field(None, ge=0, le=100)
    speed_kmh: float | None = Field(None, ge=0, le=1000)


@router.post("/crash-events", status_code=status.HTTP_204_NO_CONTENT)
async def post_crash_event(body: CrashEventIn, session: dict = Depends(require_session)) -> None:
    device_id = session["traccar_device_id"]
    crash_events_limiter.check(device_id)
    await insert_crash_event(device_id, body.kind, body.peak_g, body.speed_kmh)
