"""Places belong to a circle: created, seen, edited and deleted within it."""
import json

import httpx
import pytest
import respx

from app.database import add_device_to_group, create_group, get_place_groups, set_place_group
from app.tests.conftest import TRACCAR, auth, mock_admin_session, seed_session

pytestmark = pytest.mark.asyncio


def _geofence(id, name="Home", area="CIRCLE (50.1 8.4, 100.0)"):
    return {"id": id, "name": name, "area": area}


async def _alice_in_family() -> tuple[str, dict]:
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-alice")
    token = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    return token, fam


def _mock_geofences(*geofences) -> respx.Route:
    return respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=list(geofences))
    )


# ---------------------------------------------------------------------------
# GET /places
# ---------------------------------------------------------------------------

@respx.mock
async def test_places_of_my_circle_and_unassigned_ones_are_listed(client):
    token, fam = await _alice_in_family()
    others = await create_group("Others", "#000000")
    await set_place_group(1, fam["id"])
    await set_place_group(2, others["id"])
    mock_admin_session()
    _mock_geofences(_geofence(1, "Home"), _geofence(2, "Their home"), _geofence(3, "Old gym"))

    resp = await client.get("/places", headers=auth(token))
    assert resp.status_code == 200
    data = {p["name"]: p for p in resp.json()}
    assert set(data) == {"Home", "Old gym"}
    assert data["Home"]["group_id"] == fam["id"]
    assert data["Home"]["radius"] == 100.0
    assert data["Old gym"]["group_id"] is None


@respx.mock
async def test_get_places_requires_auth(client):
    resp = await client.get("/places")
    assert resp.status_code == 401


@respx.mock
async def test_places_traccar_5xx_returns_503(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(500, text="Server Error"))
    resp = await client.get("/places", headers=auth(token))
    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# POST /places
# ---------------------------------------------------------------------------

@respx.mock
async def test_create_place_in_my_circle(client):
    token, fam = await _alice_in_family()
    await seed_session(device_unique_id="ml360-bob", traccar_device_id=2)
    await add_device_to_group("ml360-bob", fam["id"])
    mock_admin_session()
    respx.post(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=_geofence(55, "Gym", "CIRCLE (50.2 8.3, 150.0)"))
    )
    perms = respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204))
    _mock_geofences(_geofence(55, "Gym", "CIRCLE (50.2 8.3, 150.0)"))

    resp = await client.post("/places", headers=auth(token), json={
        "name": "Gym", "latitude": 50.2, "longitude": 8.3, "radius": 150, "group_id": fam["id"],
    })
    assert resp.status_code == 201
    body = resp.json()
    assert (body["name"], body["group_id"], body["can_edit"]) == ("Gym", fam["id"], True)
    assert await get_place_groups() == {55: fam["id"]}
    linked = {json.loads(c.request.read())["deviceId"] for c in perms.calls}
    assert linked == {1, 2}


@respx.mock
async def test_cannot_create_a_place_in_someone_elses_circle(client):
    token = await seed_session(device_unique_id="ml360-mallory", traccar_device_id=9)
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-alice")
    resp = await client.post("/places", headers=auth(token), json={
        "name": "Spy", "latitude": 50.0, "longitude": 8.0, "radius": 100, "group_id": fam["id"],
    })
    assert resp.status_code == 404


@respx.mock
async def test_place_still_created_when_linking_is_refused(client):
    token, fam = await _alice_in_family()
    mock_admin_session()
    respx.post(f"{TRACCAR}/api/geofences").mock(return_value=httpx.Response(200, json=_geofence(55)))
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(409))
    _mock_geofences(_geofence(55))
    resp = await client.post("/places", headers=auth(token), json={
        "name": "Home", "latitude": 50.1, "longitude": 8.4, "radius": 100, "group_id": fam["id"],
    })
    assert resp.status_code == 201


@pytest.mark.parametrize("payload", [
    {"name": "Bad", "latitude": 50.0, "longitude": 8.0, "radius": -10, "group_id": 1},
    {"name": "", "latitude": 50.0, "longitude": 8.0, "radius": 100, "group_id": 1},
    {"name": "No circle", "latitude": 50.0, "longitude": 8.0, "radius": 100},
])
async def test_create_place_validation(client, payload):
    token = await seed_session()
    resp = await client.post("/places", headers=auth(token), json=payload)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PUT /places/{id}
# ---------------------------------------------------------------------------

@respx.mock
async def test_rename_and_resize_my_place(client):
    token, fam = await _alice_in_family()
    await set_place_group(1, fam["id"])
    mock_admin_session()
    _mock_geofences(_geofence(1, "Home", "CIRCLE (50.1 8.4, 100.0)"))
    put = respx.put(f"{TRACCAR}/api/geofences/1").mock(
        return_value=httpx.Response(200, json=_geofence(1, "House", "CIRCLE (50.1 8.4, 250.0)"))
    )

    resp = await client.put("/places/1", headers=auth(token), json={"name": "House", "radius": 250})
    assert resp.status_code == 200
    sent = json.loads(put.calls[0].request.read())
    assert sent["name"] == "House"
    assert sent["area"] == "CIRCLE (50.1 8.4, 250.0)"


@respx.mock
async def test_claim_an_unassigned_place_for_my_circle(client):
    token, fam = await _alice_in_family()
    mock_admin_session()
    _mock_geofences(_geofence(3, "Old gym"))
    respx.put(f"{TRACCAR}/api/geofences/3").mock(return_value=httpx.Response(200, json=_geofence(3, "Old gym")))

    resp = await client.put("/places/3", headers=auth(token), json={"group_id": fam["id"]})
    assert resp.status_code == 200
    assert await get_place_groups() == {3: fam["id"]}


@respx.mock
async def test_cannot_edit_another_circles_place(client):
    token, _ = await _alice_in_family()
    others = await create_group("Others", "#000000")
    await set_place_group(2, others["id"])
    mock_admin_session()
    _mock_geofences(_geofence(2, "Their home"))
    resp = await client.put("/places/2", headers=auth(token), json={"name": "Mine now"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /places/{id}
# ---------------------------------------------------------------------------

@respx.mock
async def test_delete_my_circles_place(client):
    token, fam = await _alice_in_family()
    await set_place_group(5, fam["id"])
    mock_admin_session()
    _mock_geofences(_geofence(5))
    respx.delete(f"{TRACCAR}/api/geofences/5").mock(return_value=httpx.Response(204))

    resp = await client.delete("/places/5", headers=auth(token))
    assert resp.status_code == 204
    assert await get_place_groups() == {}


@respx.mock
async def test_unassigned_places_cannot_be_deleted_from_a_phone(client):
    token, _ = await _alice_in_family()
    mock_admin_session()
    _mock_geofences(_geofence(5, "Set up in Traccar"))
    resp = await client.delete("/places/5", headers=auth(token))
    assert resp.status_code == 403
