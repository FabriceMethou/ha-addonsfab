"""Tests for POST /provision endpoint."""
import pytest
import respx
import httpx

from app.tests.conftest import TRACCAR

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ADMIN_SESSION_MOCK = httpx.Response(200, json={"id": 1, "administrator": True})


def _device(id, name, unique_id, last_update="2024-01-15T10:00:00Z"):
    return {
        "id": id,
        "name": name,
        "uniqueId": unique_id,
        "lastUpdate": last_update,
        "status": "online",
    }


def _user(id, email, name="User"):
    return {"id": id, "name": name, "email": email}


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

@respx.mock
async def test_provision_new_device_and_user(client):
    """Brand-new device and user — everything is created fresh."""
    unique_id = "ml360-newdev001"
    email = f"{unique_id}@mylife360.local"

    respx.post(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION_MOCK)
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[]))
    respx.get(f"{TRACCAR}/api/users").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{TRACCAR}/api/users").mock(
        return_value=httpx.Response(201, json=_user(10, email, "Alice"))
    )
    respx.post(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(201, json=_device(5, "Alice's phone", unique_id))
    )
    # Admin → new device, new user → new device (no existing users/devices)
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204, json={}))

    resp = await client.post(
        "/provision",
        json={"display_name": "Alice", "device_unique_id": unique_id},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "device_token" in body
    assert body["tracking_url"] == "http://traccar.test"


@respx.mock
async def test_provision_existing_device_same_uuid(client):
    """Device already registered with same UUID — reuse it, skip creation."""
    unique_id = "ml360-existing"
    email = f"{unique_id}@mylife360.local"

    respx.post(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION_MOCK)
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(3, "Bob's phone", unique_id)])
    )
    respx.get(f"{TRACCAR}/api/users").mock(
        return_value=httpx.Response(200, json=[_user(20, email, "Bob")])
    )
    # Password update for existing user
    respx.put(f"{TRACCAR}/api/users/20").mock(return_value=httpx.Response(200, json=_user(20, email)))
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204, json={}))

    resp = await client.post(
        "/provision",
        json={"display_name": "Bob", "device_unique_id": unique_id},
    )
    assert resp.status_code == 201
    assert "device_token" in resp.json()


@respx.mock
async def test_provision_reinstall_device_found_by_name(client):
    """App reinstalled with new UUID — device found by name, uniqueId updated."""
    old_uid = "ml360-old"
    new_uid = "ml360-new"
    email = f"{new_uid}@mylife360.local"
    device_name = "Carol's phone"

    respx.post(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION_MOCK)
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(7, device_name, old_uid)])
    )
    respx.put(f"{TRACCAR}/api/devices/7").mock(
        return_value=httpx.Response(200, json=_device(7, device_name, new_uid))
    )
    respx.get(f"{TRACCAR}/api/users").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{TRACCAR}/api/users").mock(
        return_value=httpx.Response(201, json=_user(30, email, "Carol"))
    )
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204, json={}))

    resp = await client.post(
        "/provision",
        json={"display_name": "Carol", "device_unique_id": new_uid},
    )
    assert resp.status_code == 201


@respx.mock
async def test_provision_reinstall_user_found_by_old_email(client):
    """Reinstall — device found by name, user found via old-UUID email hint."""
    old_uid = "ml360-old2"
    new_uid = "ml360-new2"
    old_email = f"{old_uid}@mylife360.local"
    new_email = f"{new_uid}@mylife360.local"
    device_name = "Dave's phone"

    respx.post(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION_MOCK)
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(8, device_name, old_uid)])
    )
    respx.put(f"{TRACCAR}/api/devices/8").mock(
        return_value=httpx.Response(200, json=_device(8, device_name, new_uid))
    )
    respx.get(f"{TRACCAR}/api/users").mock(
        return_value=httpx.Response(200, json=[_user(40, old_email, "Dave")])
    )
    # Email update
    respx.put(f"{TRACCAR}/api/users/40").mock(
        return_value=httpx.Response(200, json=_user(40, new_email, "Dave"))
    )
    # Password update (second put on same user — both are PUT /api/users/40)
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204, json={}))

    resp = await client.post(
        "/provision",
        json={"display_name": "Dave", "device_unique_id": new_uid},
    )
    assert resp.status_code == 201


@respx.mock
async def test_provision_multiple_devices_same_name_picks_most_recent(client):
    """When multiple devices share the display name, pick the most recently updated."""
    new_uid = "ml360-newest"
    device_name = "Eve's phone"

    devices = [
        _device(10, device_name, "old-uid-a", last_update="2024-01-01T00:00:00Z"),
        _device(11, device_name, "old-uid-b", last_update="2024-06-01T00:00:00Z"),  # most recent
        _device(12, device_name, "old-uid-c", last_update="2023-12-01T00:00:00Z"),
    ]

    respx.post(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION_MOCK)
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=devices))
    # Should update device 11 (most recent)
    respx.put(f"{TRACCAR}/api/devices/11").mock(
        return_value=httpx.Response(200, json=_device(11, device_name, new_uid))
    )
    respx.get(f"{TRACCAR}/api/users").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{TRACCAR}/api/users").mock(
        return_value=httpx.Response(201, json=_user(50, f"{new_uid}@mylife360.local", "Eve"))
    )
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204, json={}))

    resp = await client.post(
        "/provision",
        json={"display_name": "Eve", "device_unique_id": new_uid},
    )
    assert resp.status_code == 201
    # Verify the PUT on device 11 was called (not 10 or 12)
    assert respx.calls.call_count > 0


@respx.mock
async def test_provision_traccar_5xx_returns_503(client):
    """If Traccar admin session fails with 5xx, return 503."""
    respx.post(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(500, text="Internal Server Error")
    )

    resp = await client.post(
        "/provision",
        json={"display_name": "Frank", "device_unique_id": "ml360-fail"},
    )
    assert resp.status_code == 503
