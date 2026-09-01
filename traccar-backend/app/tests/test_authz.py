"""Tests for circle-scoped authorisation (findings C-01 and C-04).

require_session authenticates. These tests pin down what an authenticated
device is actually allowed to see: itself, plus everyone sharing a circle.
"""
import httpx
import pytest
import respx

from app.authz import visible_device_ids
from app.database import add_device_to_group, create_group, get_session
from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio


async def _device(unique_id: str, traccar_id: int, name: str) -> tuple[str, dict]:
    token = await seed_session(
        device_unique_id=unique_id, display_name=name, traccar_device_id=traccar_id
    )
    return token, await get_session(token)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# The rule itself
# ---------------------------------------------------------------------------

async def test_device_in_no_circle_sees_only_itself():
    _, alice = await _device("ml360-alice", 1, "Alice")
    await _device("ml360-bob", 2, "Bob")
    assert await visible_device_ids(alice) == {1}


async def test_devices_sharing_a_circle_see_each_other():
    _, alice = await _device("ml360-alice", 1, "Alice")
    _, bob = await _device("ml360-bob", 2, "Bob")
    family = await create_group("Family", "#4CAF50")
    await add_device_to_group("ml360-alice", family["id"])
    await add_device_to_group("ml360-bob", family["id"])

    assert await visible_device_ids(alice) == {1, 2}
    assert await visible_device_ids(bob) == {1, 2}


async def test_devices_in_different_circles_stay_hidden():
    _, alice = await _device("ml360-alice", 1, "Alice")
    _, carol = await _device("ml360-carol", 3, "Carol")
    fam = await create_group("Family", "#4CAF50")
    friends = await create_group("Friends", "#2196F3")
    await add_device_to_group("ml360-alice", fam["id"])
    await add_device_to_group("ml360-carol", friends["id"])

    assert await visible_device_ids(alice) == {1}
    assert await visible_device_ids(carol) == {3}


async def test_overlapping_circles_union_correctly():
    """Alice is in both circles, so she sees everyone; the others only see Alice."""
    _, alice = await _device("ml360-alice", 1, "Alice")
    _, bob = await _device("ml360-bob", 2, "Bob")
    _, carol = await _device("ml360-carol", 3, "Carol")
    fam = await create_group("Family", "#4CAF50")
    friends = await create_group("Friends", "#2196F3")
    for gid in (fam["id"], friends["id"]):
        await add_device_to_group("ml360-alice", gid)
    await add_device_to_group("ml360-bob", fam["id"])
    await add_device_to_group("ml360-carol", friends["id"])

    assert await visible_device_ids(alice) == {1, 2, 3}
    assert await visible_device_ids(bob) == {1, 2}
    assert await visible_device_ids(carol) == {1, 3}


# ---------------------------------------------------------------------------
# The rule, enforced on the routes that leak location
# ---------------------------------------------------------------------------

def _mock_two_devices() -> None:
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 42}))
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[
            {"id": 1, "name": "Alice", "status": "online", "lastUpdate": "2026-08-01T10:00:00Z"},
            {"id": 2, "name": "Bob", "status": "online", "lastUpdate": "2026-08-01T10:00:00Z"},
        ])
    )
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=[
            {"deviceId": 1, "latitude": 48.85, "longitude": 2.35, "speed": 0.0, "attributes": {}},
            {"deviceId": 2, "latitude": 55.67, "longitude": 12.56, "speed": 0.0, "attributes": {}},
        ])
    )


@respx.mock
async def test_family_hides_devices_outside_the_circle(client):
    token, _ = await _device("ml360-alice", 1, "Alice")
    await _device("ml360-bob", 2, "Bob")
    _mock_two_devices()

    resp = await client.get("/family", headers=_auth(token))
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()]
    assert names == ["Alice"]


@respx.mock
async def test_family_shows_devices_inside_the_circle(client):
    token, _ = await _device("ml360-alice", 1, "Alice")
    await _device("ml360-bob", 2, "Bob")
    fam = await create_group("Family", "#4CAF50")
    await add_device_to_group("ml360-alice", fam["id"])
    await add_device_to_group("ml360-bob", fam["id"])
    _mock_two_devices()

    resp = await client.get("/family", headers=_auth(token))
    assert sorted(d["name"] for d in resp.json()) == ["Alice", "Bob"]


@respx.mock
async def test_route_of_a_device_outside_the_circle_is_refused(client):
    token, _ = await _device("ml360-alice", 1, "Alice")
    await _device("ml360-bob", 2, "Bob")
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 42}))
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=[{"deviceId": 2, "latitude": 55.67, "longitude": 12.56}])
    )

    resp = await client.get("/route", headers=_auth(token), params={
        "device_id": 2, "from": "2026-08-01T00:00:00Z", "to": "2026-08-02T00:00:00Z"})
    assert resp.status_code == 403


@respx.mock
async def test_route_of_own_device_is_allowed(client):
    token, _ = await _device("ml360-alice", 1, "Alice")
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 42}))
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=[
            {"deviceId": 1, "latitude": 48.85, "longitude": 2.35, "speed": 0.0,
             "fixTime": "2026-08-01T09:00:00Z"},
        ])
    )

    resp = await client.get("/route", headers=_auth(token), params={
        "device_id": 1, "from": "2026-08-01T00:00:00Z", "to": "2026-08-02T00:00:00Z"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@respx.mock
async def test_events_only_cover_visible_devices(client):
    token, _ = await _device("ml360-alice", 1, "Alice")
    await _device("ml360-bob", 2, "Bob")
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 42}))
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[
            {"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"},
        ])
    )
    respx.get(f"{TRACCAR}/api/geofences").mock(return_value=httpx.Response(200, json=[]))
    events_route = respx.get(f"{TRACCAR}/api/reports/events").mock(
        return_value=httpx.Response(200, json=[])
    )

    resp = await client.get("/events", headers=_auth(token))
    assert resp.status_code == 200
    # Bob's id must never even be asked for.
    asked = events_route.calls[0].request.url
    assert "deviceId=2" not in str(asked)
    assert "deviceId=1" in str(asked)
