"""Tests for the BroadcastBus."""
import asyncio

import pytest

from app.broadcast import BroadcastBus

pytestmark = pytest.mark.asyncio


async def test_publish_to_subscriber():
    bus = BroadcastBus()
    q = await bus.subscribe()
    await bus.publish("hello")
    assert await q.get() == "hello"
    await bus.unsubscribe(q)


async def test_publish_to_multiple_subscribers():
    bus = BroadcastBus()
    q1 = await bus.subscribe()
    q2 = await bus.subscribe()
    await bus.publish("msg")
    assert await q1.get() == "msg"
    assert await q2.get() == "msg"
    await bus.unsubscribe(q1)
    await bus.unsubscribe(q2)


async def test_unsubscribe_stops_delivery():
    bus = BroadcastBus()
    q = await bus.subscribe()
    await bus.unsubscribe(q)
    await bus.publish("should not arrive")
    assert q.empty()


async def test_full_queue_dropped():
    bus = BroadcastBus()
    q = await bus.subscribe()
    # Fill the queue (maxsize=100)
    for i in range(100):
        await bus.publish(f"msg-{i}")
    # Next publish should drop the full queue
    await bus.publish("overflow")
    # Queue should have been removed
    assert len(bus._queues) == 0


async def test_unsubscribe_nonexistent_is_safe():
    bus = BroadcastBus()
    q: asyncio.Queue = asyncio.Queue()
    await bus.unsubscribe(q)  # Should not raise
