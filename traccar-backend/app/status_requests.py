""""Where are you?" requests a phone may have missed.

A phone whose live connection dropped (a tunnel, a change of network)
never hears a status request sent meanwhile. The request is remembered for
a short while and repeated when that phone's connection comes back, unless
it has sent a position since.
"""
from datetime import datetime, timedelta

from app.database import utcnow

REPLAY_WITHIN = timedelta(minutes=2)

_pending: dict[int, datetime] = {}


def requested(device_ids: set[int]) -> None:
    now = utcnow()
    for device_id in device_ids:
        _pending[device_id] = now


def answered(device_id: int) -> None:
    _pending.pop(device_id, None)


def take(device_id: int) -> bool:
    """True if [device_id] was asked recently and has not answered yet."""
    at = _pending.pop(device_id, None)
    return at is not None and utcnow() - at <= REPLAY_WITHIN


def clear() -> None:
    _pending.clear()
