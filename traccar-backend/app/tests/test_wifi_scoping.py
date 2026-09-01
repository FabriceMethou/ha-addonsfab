"""WiFi mappings must not be global (finding C-08).

A mapping says "this SSID means you are at this place". That belongs to a
circle: two households on the same street both have a "Livebox-1234", and a
delete must not reach across families.
"""
import httpx
import pytest
import respx

from app.database import add_device_to_group, create_group
from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _member(unique_id: str, traccar_id: int, group_id: int) -> str:
    token = await seed_session(device_unique_id=unique_id, traccar_device_id=traccar_id)
    await add_device_to_group(unique_id, group_id)
    return token


def _mock_geofences() -> None:
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 1}))
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[{"id": 10, "name": "Home"}])
    )


@respx.mock
async def test_mapping_is_invisible_to_another_circle(client):
    fam = await create_group("Family", "#4CAF50")
    others = await create_group("Others", "#2196F3")
    alice = await _member("ml360-alice", 1, fam["id"])
    zoe = await _member("ml360-zoe", 9, others["id"])
    _mock_geofences()

    created = await client.post("/wifi-mappings", headers=_auth(alice),
                                json={"ssid": "Livebox-1234", "place_id": 10})
    assert created.status_code == 201

    assert [m["ssid"] for m in (await client.get("/wifi-mappings", headers=_auth(alice))).json()] \
        == ["Livebox-1234"]
    assert (await client.get("/wifi-mappings", headers=_auth(zoe))).json() == []


@respx.mock
async def test_mapping_is_shared_inside_a_circle(client):
    fam = await create_group("Family", "#4CAF50")
    alice = await _member("ml360-alice", 1, fam["id"])
    bob = await _member("ml360-bob", 2, fam["id"])
    _mock_geofences()

    await client.post("/wifi-mappings", headers=_auth(alice),
                      json={"ssid": "Livebox-1234", "place_id": 10})
    seen = (await client.get("/wifi-mappings", headers=_auth(bob))).json()
    assert [m["ssid"] for m in seen] == ["Livebox-1234"]


@respx.mock
async def test_delete_does_not_reach_another_circle(client):
    fam = await create_group("Family", "#4CAF50")
    others = await create_group("Others", "#2196F3")
    alice = await _member("ml360-alice", 1, fam["id"])
    zoe = await _member("ml360-zoe", 9, others["id"])
    _mock_geofences()

    await client.post("/wifi-mappings", headers=_auth(alice),
                      json={"ssid": "Livebox-1234", "place_id": 10})

    gone = await client.delete("/wifi-mappings", headers=_auth(zoe),
                               params={"ssid": "Livebox-1234"})
    assert gone.status_code == 404, "another circle must not be able to delete it"
    still = (await client.get("/wifi-mappings", headers=_auth(alice))).json()
    assert [m["ssid"] for m in still] == ["Livebox-1234"]


@respx.mock
async def test_same_ssid_can_mean_different_places_in_different_circles(client):
    fam = await create_group("Family", "#4CAF50")
    others = await create_group("Others", "#2196F3")
    alice = await _member("ml360-alice", 1, fam["id"])
    zoe = await _member("ml360-zoe", 9, others["id"])
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 1}))
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[{"id": 10, "name": "Home"}, {"id": 20, "name": "Cabin"}])
    )

    await client.post("/wifi-mappings", headers=_auth(alice),
                      json={"ssid": "Livebox-1234", "place_id": 10})
    await client.post("/wifi-mappings", headers=_auth(zoe),
                      json={"ssid": "Livebox-1234", "place_id": 20})

    assert (await client.get("/wifi-mappings", headers=_auth(alice))).json()[0]["place_id"] == 10
    assert (await client.get("/wifi-mappings", headers=_auth(zoe))).json()[0]["place_id"] == 20
