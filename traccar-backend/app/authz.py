"""Circle-scoped authorisation.

``require_session`` answers "who is calling?". This module answers "what may
they see?" — the question that had no answer anywhere in the codebase, which
is why every read returned every family's data (finding C-01).

The rule: a device sees itself, plus every device sharing at least one circle
with it. A device in no circle sees only itself, so the safe case is also the
default case.
"""
import logging

from fastapi import HTTPException, status

from app.database import (
    get_devices_in_group,
    get_groups_for_device,
    get_traccar_ids_for_unique_ids,
)

logger = logging.getLogger(__name__)


async def visible_unique_ids(session: dict) -> set[str]:
    """Device unique ids the caller is allowed to see."""
    me = session["device_unique_id"]
    visible = {me}
    for group_id in await get_groups_for_device(me):
        visible.update(await get_devices_in_group(group_id))
    return visible


async def visible_device_ids(session: dict) -> set[int]:
    """Traccar device ids the caller is allowed to see."""
    unique_ids = await visible_unique_ids(session)
    ids = set(await get_traccar_ids_for_unique_ids(sorted(unique_ids)))
    # The session row is authoritative for the caller's own device, which
    # matters before it has been added to any circle.
    ids.add(session["traccar_device_id"])
    return ids


async def require_visible_device(session: dict, device_id: int) -> None:
    """Refuse a request that names a device outside the caller's circles."""
    if device_id not in await visible_device_ids(session):
        logger.warning(
            "DENIED — device %r asked for device_id=%s outside its circles",
            session.get("device_unique_id"),
            device_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device not visible to this account",
        )
