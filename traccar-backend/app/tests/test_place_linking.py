"""A place must be linked to the devices it should fire for (finding D-04).

Traccar only raises geofenceEnter/geofenceExit for a geofence that is linked
to the device. create_geofence never established that link, and the helper
that would — link_permission — was called by nothing but its own tests.
"""
import httpx
import pytest
import respx

from app.database import add_device_to_group, create_group
from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _mock_create() -> respx.Route:
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 1}))
    respx.post(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json={"id": 55, "name": "Home", "area": "CIRCLE(48.85 2.35, 150.0)"})
    )
    return respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204))


@respx.mock
async def test_new_place_is_linked_to_every_device_in_the_circle(client):
    fam = await create_group("Family", "#4CAF50")
    alice = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    await seed_session(device_unique_id="ml360-bob", traccar_device_id=2)
    await add_device_to_group("ml360-alice", fam["id"])
    await add_device_to_group("ml360-bob", fam["id"])
    perms = _mock_create()

    resp = await client.post("/places", headers=_auth(alice),
                             json={"name": "Home", "latitude": 48.85, "longitude": 2.35, "radius": 150})
    assert resp.status_code == 201

    linked = sorted(
        c.request.read().decode() for c in perms.calls
    )
    assert any('"deviceId": 1' in b and '"geofenceId": 55' in b for b in linked)
    assert any('"deviceId": 2' in b and '"geofenceId": 55' in b for b in linked)


@respx.mock
async def test_place_is_not_linked_to_devices_outside_the_circle(client):
    fam = await create_group("Family", "#4CAF50")
    others = await create_group("Others", "#2196F3")
    alice = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    await seed_session(device_unique_id="ml360-zoe", traccar_device_id=9)
    await add_device_to_group("ml360-alice", fam["id"])
    await add_device_to_group("ml360-zoe", others["id"])
    perms = _mock_create()

    await client.post("/places", headers=_auth(alice),
                      json={"name": "Home", "latitude": 48.85, "longitude": 2.35, "radius": 150})

    bodies = [c.request.read().decode() for c in perms.calls]
    assert not any('"deviceId": 9' in b for b in bodies)


@respx.mock
async def test_place_still_created_when_linking_fails(client):
    """A already-linked 409 must not turn into a failed place creation."""
    alice = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 1}))
    respx.post(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json={"id": 55, "name": "Home", "area": "CIRCLE(48.85 2.35, 150.0)"})
    )
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(409))

    resp = await client.post("/places", headers=_auth(alice),
                             json={"name": "Home", "latitude": 48.85, "longitude": 2.35, "radius": 150})
    assert resp.status_code == 201
