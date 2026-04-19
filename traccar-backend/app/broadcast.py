"""Fan-out broadcast bus for real-time event distribution."""
import asyncio


class BroadcastBus:
    """Fan-out bus: one producer feeds many consumer queues.

    Used by the admin WebSocket reader to distribute position/device/event
    updates to all connected SSE clients.
    """

    def __init__(self) -> None:
        self._queues: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._queues.append(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            try:
                self._queues.remove(q)
            except ValueError:
                pass

    async def publish(self, data: str) -> None:
        async with self._lock:
            dead: list[asyncio.Queue] = []
            for q in self._queues:
                try:
                    q.put_nowait(data)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._queues.remove(q)


bus = BroadcastBus()
