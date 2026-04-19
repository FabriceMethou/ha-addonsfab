"""Tests for /wifi-mappings endpoints."""
import pytest
import respx
import httpx

from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio

ADMIN_SESSION = httpx.Response(200, json={"id": 1, "administrator": True})


@respx.mock
async def test_get_wifi_mappings_empty(client):
    token = await seed_session()
    resp = await client.get(
        "/wifi-mappings", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == []


@respx.mock
async def test_create_wifi_mapping(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[{"id": 1, "name": "Home"}])
    )

    resp = await client.post(
        "/wifi-mappings",
        json={"ssid": "MyWifi", "place_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["ssid"] == "MyWifi"
    assert data["place_id"] == 1
    assert data["place_name"] == "Home"


@respx.mock
async def test_create_and_list_wifi_mappings(client):
    token = await seed_session()
    headers = {"Authorization": f"Bearer {token}"}
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[
            {"id": 1, "name": "Home"},
            {"id": 2, "name": "Work"},
        ])
    )

    await client.post(
        "/wifi-mappings",
        json={"ssid": "HomeWifi", "place_id": 1},
        headers=headers,
    )
    await client.post(
        "/wifi-mappings",
        json={"ssid": "WorkWifi", "place_id": 2},
        headers=headers,
    )

    resp = await client.get("/wifi-mappings", headers=headers)
    assert resp.status_code == 200
    ssids = [m["ssid"] for m in resp.json()]
    assert "HomeWifi" in ssids
    assert "WorkWifi" in ssids


@respx.mock
async def test_delete_wifi_mapping(client):
    token = await seed_session()
    headers = {"Authorization": f"Bearer {token}"}
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[{"id": 1, "name": "Home"}])
    )

    await client.post(
        "/wifi-mappings",
        json={"ssid": "ToDelete", "place_id": 1},
        headers=headers,
    )

    resp = await client.delete("/wifi-mappings?ssid=ToDelete", headers=headers)
    assert resp.status_code == 204


async def test_delete_nonexistent_wifi_mapping(client):
    token = await seed_session()
    resp = await client.delete(
        "/wifi-mappings?ssid=NoSuch",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_wifi_mappings_require_auth(client):
    resp = await client.get("/wifi-mappings")
    assert resp.status_code == 403
