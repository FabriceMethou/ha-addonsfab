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
    get_group,
    get_groups_for_device,
    get_session_by_device_id,
    get_traccar_ids_for_unique_ids,
)

logger = logging.getLogger(__name__)


async def visible_unique_ids(session: dict) -> set[str]:
    """Device unique ids the caller is allowed to see."""
    return await _circle_mates(session["device_unique_id"])


async def _circle_mates(unique_id: str) -> set[str]:
    visible = {unique_id}
    for group_id in await get_groups_for_device(unique_id):
        visible.update(await get_devices_in_group(group_id))
    return visible


async def visible_ids_for_unique_id(unique_id: str) -> set[int]:
    """Traccar device ids visible to the device with this unique id."""
    return set(await get_traccar_ids_for_unique_ids(sorted(await _circle_mates(unique_id))))


async def visible_device_ids(session: dict) -> set[int]:
    """Traccar device ids the caller is allowed to see."""
    ids = await visible_ids_for_unique_id(session["device_unique_id"])
    # The session row is authoritative for the caller's own device, which
    # matters before it has been added to any circle.
    ids.add(session["traccar_device_id"])
    return ids


async def audience_for_device(device_id: int, group_id: int | None = None) -> set[int]:
    """Devices that should hear about ``device_id``, excluding itself.

    Visibility is symmetric (sharing a circle), so this is the device's own
    visible set. A place owned by a circle narrows it to that circle.
    """
    session = await get_session_by_device_id(device_id)
    if session is None:
        return set()
    mates = await _circle_mates(session["device_unique_id"])
    if group_id is not None:
        mates &= set(await get_devices_in_group(group_id))
    ids = set(await get_traccar_ids_for_unique_ids(sorted(mates)))
    ids.discard(device_id)
    return ids


async def require_member(session: dict, group_id: int) -> dict:
    """The circle, if the caller belongs to it; 404 otherwise.

    404 rather than 403, so circle ids cannot be probed.
    """
    group = await get_group(group_id)
    if group is None or group_id not in await get_groups_for_device(session["device_unique_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Circle not found")
    return group


async def require_owner(session: dict, group_id: int) -> dict:
    group = await require_member(session, group_id)
    if group.get("owner_unique_id") not in (None, session["device_unique_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the circle's owner can do this",
        )
    return group


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
