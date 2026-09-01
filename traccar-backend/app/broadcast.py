"""Fan-out broadcast bus for real-time event distribution."""
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

# Keys in a Traccar websocket frame, mapped to the field naming the device.
_DEVICE_KEYS = {"positions": "deviceId", "events": "deviceId", "devices": "id"}


class BroadcastBus:
    """Fan-out bus: one producer feeds many consumer queues.

    Two rules beyond plain fan-out:

    * A subscriber receives only the devices it is allowed to see. Without
      this the realtime channel leaks every family's positions even once the
      REST routes are scoped (finding C-01).
    * A subscriber that falls behind loses its oldest messages, never its
      subscription. Detaching it left the SSE connection open and the map
      frozen with no error anywhere (finding D-06).
    """

    def __init__(self) -> None:
        self._queues: list[tuple[asyncio.Queue, set[int] | None]] = []
        self._lock = asyncio.Lock()

    async def subscribe(self, visible_ids: set[int] | None = None) -> asyncio.Queue:
        """Attach a consumer. ``visible_ids`` of None means unfiltered."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._queues.append((q, visible_ids))
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            self._queues = [(qq, f) for qq, f in self._queues if qq is not q]

    async def publish(self, data: str) -> None:
        parsed = _parse(data)
        async with self._lock:
            for q, visible in self._queues:
                payload = _scoped_payload(parsed, data, visible)
                if payload is None:
                    continue
                _offer(q, payload)


def _parse(data: str) -> dict | None:
    try:
        parsed = json.loads(data)
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _scoped_payload(parsed: dict | None, raw: str, visible: set[int] | None) -> str | None:
    """Return what this subscriber should receive, or None to withhold."""
    if visible is None or parsed is None:
        return raw

    present = [k for k in _DEVICE_KEYS if isinstance(parsed.get(k), list)]
    if not present:
        # Control frames (keepalive, reconnecting) carry no device data.
        return raw

    scoped = dict(parsed)
    kept = 0
    for key in present:
        id_field = _DEVICE_KEYS[key]
        rows = [r for r in parsed[key]
                if isinstance(r, dict) and r.get(id_field) in visible]
        scoped[key] = rows
        kept += len(rows)

    return json.dumps(scoped) if kept else None


def _offer(q: asyncio.Queue, payload: str) -> None:
    """Enqueue, making room by discarding the oldest message if needed."""
    try:
        q.put_nowait(payload)
        return
    except asyncio.QueueFull:
        pass
    try:
        q.get_nowait()  # drop the stalest update — it is worthless anyway
    except asyncio.QueueEmpty:
        pass
    try:
        q.put_nowait(payload)
    except asyncio.QueueFull:  # pragma: no cover — another consumer raced us
        logger.warning("Dropping realtime update for a saturated subscriber")


bus = BroadcastBus()
