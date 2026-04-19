"""Tests for GET /events endpoint."""
import pytest
import respx
import httpx

from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio

ADMIN_SESSION = httpx.Response(200, json={"id": 1, "administrator": True})


@respx.mock
async def test_get_events_returns_mapped_results(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[
            {"id": 7, "name": "Alice"},
        ])
    )
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[
            {"id": 1, "name": "Home"},
        ])
    )
    respx.get(f"{TRACCAR}/api/reports/events").mock(
        return_value=httpx.Response(200, json=[
            {
                "id": 100,
                "deviceId": 7,
                "type": "geofenceEnter",
                "geofenceId": 1,
                "eventTime": "2024-01-15T10:00:00Z",
            },
        ])
    )

    resp = await client.get("/events", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    ev = data[0]
    assert ev["device_name"] == "Alice"
    assert ev["geofence_name"] == "Home"
    assert ev["type"] == "geofenceEnter"


@respx.mock
async def test_get_events_custom_hours(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(f"{TRACCAR}/api/reports/events").mock(
        return_value=httpx.Response(200, json=[])
    )

    resp = await client.get(
        "/events?hours=48", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_events_invalid_hours(client):
    token = await seed_session()
    resp = await client.get(
        "/events?hours=0", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 422


async def test_get_events_requires_auth(client):
    resp = await client.get("/events")
    assert resp.status_code == 403
