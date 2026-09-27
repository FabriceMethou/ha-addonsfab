"""Fan-out bus for real-time delivery to connected phones.

Every message says who may receive it, explicitly:

* ``publish_update`` carries data about one device (a position, a status
  change). It reaches subscribers whose circles include that device.
* ``publish_to`` targets named devices (alerts, status requests), or everyone
  when ``recipients`` is None (control messages such as "reconnecting").

The previous bus inferred the audience from the payload's shape and treated
anything it did not recognise as a control frame. The stream published
flattened messages it did not recognise, so every phone received every
device's position regardless of circles.
"""
import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)

QUEUE_SIZE = 100


@dataclass(eq=False)
class Subscriber:
    device_id: int | None
    unique_id: str | None
    visible: set[int] | None
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=QUEUE_SIZE))


class BroadcastBus:
    def __init__(self) -> None:
        self._subs: list[Subscriber] = []
        self._lock = asyncio.Lock()

    async def subscribe(
        self,
        device_id: int | None = None,
        unique_id: str | None = None,
        visible: set[int] | None = None,
    ) -> Subscriber:
        """Attach a consumer. ``visible`` of None means it sees every device."""
        sub = Subscriber(device_id, unique_id, None if visible is None else set(visible))
        async with self._lock:
            self._subs.append(sub)
        return sub

    async def unsubscribe(self, sub: Subscriber) -> None:
        async with self._lock:
            self._subs = [s for s in self._subs if s is not sub]

    async def publish_update(self, message: dict, subject_device_id: int) -> None:
        payload = json.dumps(message)
        async with self._lock:
            for sub in self._subs:
                if sub.visible is None or subject_device_id in sub.visible:
                    _offer(sub.queue, payload)

    async def publish_to(self, message: dict, recipients: set[int] | None = None) -> None:
        payload = json.dumps(message)
        async with self._lock:
            for sub in self._subs:
                if recipients is None or sub.device_id in recipients:
                    _offer(sub.queue, payload)

    async def refresh_visibility(
        self, resolve: Callable[[str], Awaitable[set[int]]]
    ) -> None:
        """Recompute every subscriber's audience after circles change."""
        async with self._lock:
            subs = list(self._subs)
        for sub in subs:
            if sub.unique_id is None or sub.visible is None:
                continue
            visible = await resolve(sub.unique_id)
            if sub.device_id is not None:
                visible.add(sub.device_id)
            sub.visible = visible
            _offer(sub.queue, json.dumps({"type": "circles_changed"}))

    def subscriber_count(self) -> int:
        return len(self._subs)


def _offer(q: asyncio.Queue, payload: str) -> None:
    """Enqueue, making room by discarding the oldest message if needed.

    A subscriber that falls behind loses its oldest messages, never its
    subscription (finding D-06).
    """
    try:
        q.put_nowait(payload)
        return
    except asyncio.QueueFull:
        pass
    try:
        q.get_nowait()
    except asyncio.QueueEmpty:
        pass
    try:
        q.put_nowait(payload)
    except asyncio.QueueFull:  # pragma: no cover — another consumer raced us
        logger.warning("Dropping realtime update for a saturated subscriber")


bus = BroadcastBus()
