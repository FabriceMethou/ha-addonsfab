"""Tests for GET /family endpoint."""
import pytest
import respx
import httpx

from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio


@respx.mock
async def test_family_merged_result(client):
    token = await seed_session(traccar_user_id=42, traccar_device_id=7)

    respx.post(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(200, json={"id": 42})
    )
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(
            200,
            json=[{"id": 7, "name": "Alice", "status": "online", "lastUpdate": "2024-01-15T10:30:00Z"}],
        )
    )
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "deviceId": 7,
                    "latitude": 50.123,
                    "longitude": 8.456,
                    "speed": 0.0,
                    "course": 0.0,
                    "accuracy": 5.0,
                    "address": "1a Dahlienweg",
                    "fixTime": "2024-01-15T10:29:45Z",
                    "attributes": {"batteryLevel": 85.0, "charge": False},
                }
            ],
        )
    )

    resp = await client.get("/family", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    entry = data[0]
    assert entry["device_id"] == 7
    assert entry["name"] == "Alice"
    assert entry["latitude"] == 50.123
    assert entry["longitude"] == 8.456
    assert entry["battery_level"] == 85.0
    assert entry["is_charging"] is False


@respx.mock
async def test_family_device_with_no_position(client):
    """Device without a position entry should have null position fields."""
    token = await seed_session(traccar_device_id=9)

    respx.post(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(200, json={"id": 42})
    )
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(
            200,
            json=[{"id": 9, "name": "Bob", "status": "offline", "lastUpdate": None}],
        )
    )
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=[])
    )

    resp = await client.get("/family", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    entry = resp.json()[0]
    assert entry["device_id"] == 9
    assert entry["latitude"] is None
    assert entry["longitude"] is None
    assert entry["battery_level"] is None
