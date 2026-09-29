"""Writes queued positions into Traccar's history, in order, retrying.

Detection does not wait for this: a position is processed as soon as it
arrives, so arrivals, departures and battery alerts keep working while
Traccar is down or restarting. Only the history is delayed.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.broadcast import bus
from app.database import (
    iso,
    outbox_count,
    outbox_mark_forwarded,
    outbox_pending,
    outbox_prune,
    utcnow,
)
from app.traccar import traccar

logger = logging.getLogger(__name__)

BATCH = 100
MAX_BACKOFF_S = 60
KEEP_FORWARDED = timedelta(days=7)


class ForwarderState:
    def __init__(self) -> None:
        self.last_success: datetime | None = None
        self.last_error: str | None = None
        self.failing_since: datetime | None = None

    @property
    def healthy(self) -> bool:
        return self.failing_since is None


state = ForwarderState()
_wake = asyncio.Event()


def kick() -> None:
    """New positions are queued: forward them now rather than at the next tick."""
    _wake.set()


async def forward_once() -> tuple[int, bool]:
    """Forward what is pending. Returns (forwarded, finished_without_error)."""
    rows = await outbox_pending(BATCH)
    if not rows:
        return 0, True
    done: list[int] = []
    backfilled: dict[int, int] = {}
    ok = True
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as http:
        for row in rows:
            pos = json.loads(row["payload"])
            if not await traccar.forward_osmand(http, row["unique_id"], pos):
                ok = False
                break
            done.append(row["id"])
            if row["backfill"]:
                device = row["device_id"]
                backfilled[device] = min(backfilled.get(device, row["timestamp"]), row["timestamp"])
    await outbox_mark_forwarded(done)
    now = utcnow()
    if ok:
        state.last_success, state.last_error, state.failing_since = now, None, None
    else:
        state.last_error = "Traccar refused or did not answer"
        state.failing_since = state.failing_since or now
    for device_id, since in backfilled.items():
        # A trip saved offline is now in Traccar: the circle refetches it.
        await bus.publish_update(
            {"type": "history_updated", "device_id": device_id,
             "since": iso(datetime.fromtimestamp(since, tz=timezone.utc))},
            device_id,
        )
    return len(done), ok


async def run() -> None:
    backoff = 1
    ticks = 0
    while True:
        try:
            forwarded, ok = await forward_once()
            if not ok:
                logger.warning("Traccar did not take positions; retrying in %ds", backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_S)
                continue
            backoff = 1
            if forwarded == BATCH:
                continue  # more waiting
            ticks += 1
            if ticks % 720 == 0:  # about every hour
                await outbox_prune(utcnow() - KEEP_FORWARDED)
        except Exception:  # noqa: BLE001 — the forwarder must keep running
            logger.exception("Forwarding to Traccar failed")
        _wake.clear()
        try:
            await asyncio.wait_for(_wake.wait(), timeout=5)
        except asyncio.TimeoutError:
            pass


async def health() -> dict:
    pending = await outbox_count()
    return {
        "status": "ok" if state.healthy else "degraded",
        "traccar_reachable": state.healthy,
        "pending_positions": pending,
        "last_forward": iso(state.last_success) if state.last_success else None,
        "traccar_error": state.last_error,
    }
