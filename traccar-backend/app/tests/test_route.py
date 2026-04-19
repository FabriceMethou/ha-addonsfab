"""Tests for GET /route endpoint — including downsampling logic."""
import pytest
import respx
import httpx

from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio

ADMIN_SESSION = httpx.Response(200, json={"id": 1, "administrator": True})


def _position(lat, lon, speed=0.0, fix_time="2024-01-15T10:00:00Z"):
    return {
        "latitude": lat,
        "longitude": lon,
        "speed": speed,
        "altitude": 100.0,
        "course": 0.0,
        "fixTime": fix_time,
        "attributes": {"batteryLevel": 80.0},
    }


@respx.mock
async def test_route_returns_positions(client):
    token = await seed_session()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=[
            _position(50.1, 8.4, speed=5.0),
            _position(50.2, 8.5, speed=10.0),
        ])
    )

    resp = await client.get(
        "/route?device_id=7&from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["latitude"] == 50.1
    assert data[1]["speed_kmh"] == round(10.0 * 1.852, 2)


@respx.mock
async def test_route_downsamples_above_500(client):
    """When more than 500 points, should downsample to 500."""
    token = await seed_session()
    positions = [_position(50.0 + i * 0.001, 8.0) for i in range(600)]
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=positions)
    )

    resp = await client.get(
        "/route?device_id=7&from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 500
    # First and last points should be preserved
    assert data[0]["latitude"] == positions[0]["latitude"]
    assert data[-1]["latitude"] == positions[-1]["latitude"]


@respx.mock
async def test_route_no_downsample_under_500(client):
    """When <= 500 points, should return all."""
    token = await seed_session()
    positions = [_position(50.0 + i * 0.001, 8.0) for i in range(100)]
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/positions").mock(
        return_value=httpx.Response(200, json=positions)
    )

    resp = await client.get(
        "/route?device_id=7&from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 100


async def test_route_requires_auth(client):
    resp = await client.get("/route?device_id=7&from=a&to=b")
    assert resp.status_code == 403


async def test_route_requires_params(client):
    token = await seed_session()
    resp = await client.get("/route", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422
