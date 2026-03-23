"""Tests for Bearer token authentication dependency."""
import pytest
import respx
import httpx

from app.tests.conftest import seed_session, TRACCAR

pytestmark = pytest.mark.asyncio


@respx.mock
async def test_valid_token_passes(client):
    token = await seed_session()

    # Mock user session + devices + positions
    respx.post(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(200, json={"id": 42})
    )
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[]))
    respx.get(f"{TRACCAR}/api/positions").mock(return_value=httpx.Response(200, json=[]))

    resp = await client.get("/family", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


async def test_missing_token_returns_403(client):
    resp = await client.get("/family")
    # HTTPBearer returns 403 when the header is absent entirely
    assert resp.status_code == 403


async def test_unknown_token_returns_401(client):
    resp = await client.get("/family", headers={"Authorization": "Bearer notavalidtoken"})
    assert resp.status_code == 401
