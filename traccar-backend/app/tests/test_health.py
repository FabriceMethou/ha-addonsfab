"""Tests for GET /health endpoint."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_health_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["traccar_reachable"] is True
    assert body["pending_positions"] == 0
