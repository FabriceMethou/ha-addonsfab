"""Tests for rate limiting on public endpoints."""
import pytest
import respx
import httpx

from app.tests.conftest import TRACCAR

pytestmark = pytest.mark.asyncio

ADMIN_SESSION = httpx.Response(200, json={"id": 1, "administrator": True})


@respx.mock
async def test_provision_rate_limit_enforced(client):
    """Provision allows 5 per minute, 6th should be rejected."""
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION)
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(201, json={"id": 99, "name": "Test", "uniqueId": "x"})
    )

    for i in range(5):
        resp = await client.post(
            "/provision",
            json={"display_name": f"User{i}", "device_unique_id": f"ml360-rl-{i}"},
        )
        assert resp.status_code == 201, f"Request {i+1} should succeed"

    # 6th request should be rate limited
    resp = await client.post(
        "/provision",
        json={"display_name": "Blocked", "device_unique_id": "ml360-rl-blocked"},
    )
    assert resp.status_code == 429


async def test_crash_report_rate_limit_enforced(client):
    """Crash report allows 20 per minute."""
    payload = {"error_type": "Test", "error_message": "rate limit test"}

    for i in range(20):
        resp = await client.post("/crash-report", json=payload)
        assert resp.status_code == 204, f"Request {i+1} should succeed"

    resp = await client.post("/crash-report", json=payload)
    assert resp.status_code == 429
