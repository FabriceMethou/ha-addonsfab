"""Tests for the BroadcastBus."""
import asyncio
import json

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




async def test_unsubscribe_nonexistent_is_safe():
    bus = BroadcastBus()
    q: asyncio.Queue = asyncio.Queue()
    await bus.unsubscribe(q)  # Should not raise


# ---------------------------------------------------------------------------
# A saturated subscriber must not be silently unsubscribed (finding D-06)
# ---------------------------------------------------------------------------

async def test_slow_subscriber_keeps_receiving_after_saturation():
    """Dropping the oldest position is fine. Dropping the client is not:
    its SSE connection stays open, so the app shows a live map frozen forever.
    """
    bus = BroadcastBus()
    q = await bus.subscribe()
    for i in range(150):  # more than maxsize
        await bus.publish(f"msg-{i}")

    assert len(bus._queues) == 1, "subscriber must still be attached"
    await bus.publish("fresh")
    drained = []
    while not q.empty():
        drained.append(q.get_nowait())
    assert "fresh" in drained, "newest message must reach a slow subscriber"


# ---------------------------------------------------------------------------
# Fan-out is scoped to the subscriber's circles (finding C-01, realtime channel)
# ---------------------------------------------------------------------------

POSITIONS = '{"positions": [{"deviceId": 1, "latitude": 48.85}, {"deviceId": 2, "latitude": 55.67}]}'


async def test_subscriber_only_receives_positions_it_may_see():
    bus = BroadcastBus()
    q = await bus.subscribe(visible_ids={1})
    await bus.publish(POSITIONS)
    payload = json.loads(await q.get())
    assert [p["deviceId"] for p in payload["positions"]] == [1]


async def test_message_is_withheld_when_nothing_is_visible():
    bus = BroadcastBus()
    q = await bus.subscribe(visible_ids={9})
    await bus.publish(POSITIONS)
    assert q.empty()


async def test_devices_and_events_are_filtered_too():
    bus = BroadcastBus()
    q = await bus.subscribe(visible_ids={2})
    await bus.publish('{"devices": [{"id": 1}, {"id": 2}], "events": ['
                      '{"deviceId": 1, "type": "geofenceEnter"},'
                      '{"deviceId": 2, "type": "geofenceExit"}]}')
    payload = json.loads(await q.get())
    assert [d["id"] for d in payload["devices"]] == [2]
    assert [e["deviceId"] for e in payload["events"]] == [2]


async def test_control_messages_reach_everyone():
    """Keepalives and reconnection notices carry no device data."""
    bus = BroadcastBus()
    q = await bus.subscribe(visible_ids={99})
    await bus.publish('{"type": "reconnecting"}')
    assert json.loads(await q.get()) == {"type": "reconnecting"}


async def test_unfiltered_subscriber_still_gets_everything():
    bus = BroadcastBus()
    q = await bus.subscribe()
    await bus.publish(POSITIONS)
    payload = json.loads(await q.get())
    assert len(payload["positions"]) == 2
