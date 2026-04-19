"""Tests for TraccarClient — session handling and retry behaviour."""
import pytest
import respx
import httpx

from app.traccar import TraccarClient, TraccarError

pytestmark = pytest.mark.asyncio

TRACCAR = "http://traccar.test"


def _client() -> TraccarClient:
    import app.config as cfg

    cfg.settings.traccar_url = TRACCAR
    cfg.settings.traccar_admin_token = "admintoken"
    return TraccarClient()


# ---------------------------------------------------------------------------
# Admin session
# ---------------------------------------------------------------------------

@respx.mock
async def test_admin_session_sets_cookie_and_bearer():
    tc = _client()
    respx.get(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(200, json={"id": 1}, headers={"Set-Cookie": "JSESSIONID=abc"})
    )

    session = await tc.admin_session()
    assert session.headers.get("Authorization") == "Bearer admintoken"
    await session.aclose()


@respx.mock
async def test_admin_session_raises_on_failure():
    tc = _client()
    respx.get(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(401, text="Unauthorized")
    )

    with pytest.raises(TraccarError, match="Admin session failed"):
        await tc.admin_session()


# ---------------------------------------------------------------------------
# User session
# ---------------------------------------------------------------------------

@respx.mock
async def test_user_session_success():
    tc = _client()
    respx.post(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(200, json={"id": 5})
    )

    session = await tc.user_session("user@test.com", "pass")
    assert session is not None
    await session.aclose()


@respx.mock
async def test_user_session_wrong_credentials():
    tc = _client()
    respx.post(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(401, text="Unauthorized")
    )

    with pytest.raises(TraccarError, match="User session failed"):
        await tc.user_session("bad@test.com", "wrong")


# ---------------------------------------------------------------------------
# link_permission — 400/409 silently ignored, 5xx raises
# ---------------------------------------------------------------------------

@respx.mock
async def test_link_permission_already_linked_409_is_ignored():
    tc = _client()
    async with httpx.AsyncClient(base_url=TRACCAR) as http:
        respx.post(f"{TRACCAR}/api/permissions").mock(
            return_value=httpx.Response(409, text="Conflict")
        )
        # Should not raise
        await tc.link_permission(http, user_id=1, device_id=2)


@respx.mock
async def test_link_permission_400_is_ignored():
    tc = _client()
    async with httpx.AsyncClient(base_url=TRACCAR) as http:
        respx.post(f"{TRACCAR}/api/permissions").mock(
            return_value=httpx.Response(400, text="Bad Request")
        )
        await tc.link_permission(http, user_id=1, device_id=2)


@respx.mock
async def test_link_permission_5xx_raises():
    tc = _client()
    async with httpx.AsyncClient(base_url=TRACCAR) as http:
        respx.post(f"{TRACCAR}/api/permissions").mock(
            return_value=httpx.Response(500, text="Server Error")
        )
        with pytest.raises(TraccarError, match="server error"):
            await tc.link_permission(http, user_id=1, device_id=2)


# ---------------------------------------------------------------------------
# get_devices — 5xx raises TraccarError
# ---------------------------------------------------------------------------

@respx.mock
async def test_get_devices_5xx_raises():
    tc = _client()
    async with httpx.AsyncClient(base_url=TRACCAR) as http:
        respx.get(f"{TRACCAR}/api/devices").mock(
            return_value=httpx.Response(503, text="Service Unavailable")
        )
        with pytest.raises(TraccarError):
            await tc.get_devices(http)


@respx.mock
async def test_get_devices_returns_list():
    tc = _client()
    async with httpx.AsyncClient(base_url=TRACCAR) as http:
        respx.get(f"{TRACCAR}/api/devices").mock(
            return_value=httpx.Response(200, json=[{"id": 1, "name": "Phone"}])
        )
        devices = await tc.get_devices(http)
        assert devices == [{"id": 1, "name": "Phone"}]
