"""Tests for the BroadcastBus: every message reaches exactly its audience."""
import asyncio
import json

import pytest

from app.broadcast import QUEUE_SIZE, BroadcastBus

pytestmark = pytest.mark.asyncio


def _drain(sub) -> list[dict]:
    out = []
    while not sub.queue.empty():
        out.append(json.loads(sub.queue.get_nowait()))
    return out


async def test_update_reaches_subscribers_who_can_see_the_device():
    bus = BroadcastBus()
    alice = await bus.subscribe(device_id=1, visible={1, 2})
    carol = await bus.subscribe(device_id=3, visible={3})
    await bus.publish_update({"type": "position", "device_id": 2}, subject_device_id=2)
    assert _drain(alice) == [{"type": "position", "device_id": 2}]
    assert _drain(carol) == []


async def test_flat_position_messages_are_scoped():
    """Regression: the old bus let flattened messages through to everyone."""
    bus = BroadcastBus()
    outsider = await bus.subscribe(device_id=9, visible={9})
    await bus.publish_update(
        {"type": "position", "device_id": 1, "latitude": 1.0, "longitude": 2.0}, 1
    )
    assert _drain(outsider) == []


async def test_publish_to_targets_named_devices_only():
    bus = BroadcastBus()
    a = await bus.subscribe(device_id=1, visible={1})
    b = await bus.subscribe(device_id=2, visible={2})
    await bus.publish_to({"type": "alert", "id": 5}, recipients={2})
    assert _drain(a) == []
    assert _drain(b) == [{"type": "alert", "id": 5}]


async def test_control_messages_without_recipients_reach_everyone():
    bus = BroadcastBus()
    a = await bus.subscribe(device_id=1, visible={1})
    b = await bus.subscribe(device_id=2, visible={2})
    await bus.publish_to({"type": "reconnecting"})
    assert _drain(a) == [{"type": "reconnecting"}]
    assert _drain(b) == [{"type": "reconnecting"}]


async def test_unfiltered_subscriber_sees_every_update():
    bus = BroadcastBus()
    admin = await bus.subscribe()
    await bus.publish_update({"type": "position", "device_id": 4}, 4)
    assert len(_drain(admin)) == 1


async def test_unsubscribe_stops_delivery():
    bus = BroadcastBus()
    sub = await bus.subscribe(device_id=1, visible={1})
    await bus.unsubscribe(sub)
    await bus.publish_update({"type": "position", "device_id": 1}, 1)
    assert sub.queue.empty()
    assert bus.subscriber_count() == 0


async def test_slow_subscriber_keeps_receiving_after_saturation():
    """A full queue drops its oldest message, never the subscription (D-06)."""
    bus = BroadcastBus()
    sub = await bus.subscribe(device_id=1, visible={1})
    for i in range(QUEUE_SIZE + 5):
        await bus.publish_update({"n": i}, 1)
    await bus.publish_update({"n": "fresh"}, 1)
    received = _drain(sub)
    assert len(received) == QUEUE_SIZE
    assert received[-1] == {"n": "fresh"}
    assert bus.subscriber_count() == 1


async def test_refresh_visibility_applies_new_circles():
    bus = BroadcastBus()
    sub = await bus.subscribe(device_id=1, unique_id="ml360-alice", visible={1})

    async def resolve(unique_id: str) -> set[int]:
        assert unique_id == "ml360-alice"
        return {1, 2}

    await bus.refresh_visibility(resolve)
    assert _drain(sub) == [{"type": "circles_changed"}]
    await bus.publish_update({"type": "position", "device_id": 2}, 2)
    assert _drain(sub) == [{"type": "position", "device_id": 2}]


async def test_many_subscribers_do_not_block_each_other():
    bus = BroadcastBus()
    subs = [await bus.subscribe(device_id=i, visible={0, i}) for i in range(1, 20)]
    await asyncio.gather(*(bus.publish_update({"device_id": 0}, 0) for _ in range(3)))
    assert all(len(_drain(s)) == 3 for s in subs)
