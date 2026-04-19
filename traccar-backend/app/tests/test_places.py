"""Tests for /places endpoints."""
import pytest
import respx
import httpx

from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio

ADMIN_SESSION = httpx.Response(200, json={"id": 1, "administrator": True})


def _geofence(id, name="Home", area="CIRCLE(50.1 8.4, 100)"):
    return {"id": id, "name": name, "area": area}


# ---------------------------------------------------------------------------
# GET /places
# ---------------------------------------------------------------------------

@respx.mock
async def test_get_places_returns_list(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[
            _geofence(1, "Home", "CIRCLE(50.1 8.4, 100)"),
            _geofence(2, "Work", "CIRCLE(50.5 8.5, 200)"),
        ])
    )

    resp = await client.get("/places", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Home"
    assert data[1]["name"] == "Work"


@respx.mock
async def test_get_places_requires_auth(client):
    resp = await client.get("/places")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /places
# ---------------------------------------------------------------------------

@respx.mock
async def test_create_place(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.post(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(201, json=_geofence(3, "Gym", "CIRCLE(50.2 8.3, 150)"))
    )

    resp = await client.post(
        "/places",
        json={"name": "Gym", "latitude": 50.2, "longitude": 8.3, "radius": 150},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Gym"


@respx.mock
async def test_create_place_invalid_radius(client):
    token = await seed_session()
    resp = await client.post(
        "/places",
        json={"name": "Bad", "latitude": 50.0, "longitude": 8.0, "radius": -10},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


@respx.mock
async def test_create_place_empty_name(client):
    token = await seed_session()
    resp = await client.post(
        "/places",
        json={"name": "", "latitude": 50.0, "longitude": 8.0, "radius": 100},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /places/{id}
# ---------------------------------------------------------------------------

@respx.mock
async def test_delete_place(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.delete(f"{TRACCAR}/api/geofences/5").mock(
        return_value=httpx.Response(204)
    )

    resp = await client.delete("/places/5", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 204


@respx.mock
async def test_places_traccar_5xx_returns_503(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(500, text="Server Error")
    )

    resp = await client.get("/places", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 503
