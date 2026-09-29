"""Fixes from the 2026-09 design, logic, security and infrastructure review."""
import json
from datetime import timedelta

import aiosqlite
import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient

from app import database, engine
from app.broadcast import bus
from app.database import (
    add_device_to_group, create_group, get_device_state, get_session, hash_token, init_db,
    recent_alerts, save_device_state, utcnow,
)
from app.main import app
from app.routers.stream import MAX_STREAMS_PER_PHONE, _open_streams, handle_traccar_frame
from app.tests.conftest import TRACCAR, auth, seed_session
from app.versions import is_supported

pytestmark = pytest.mark.asyncio


async def _family():
    alice = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1, display_name="Alice")
    bob = await seed_session(device_unique_id="ml360-bob", traccar_device_id=2, display_name="Bob")
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-alice")
    await add_device_to_group("ml360-bob", fam["id"])
    return alice, bob, fam


def _drain(sub) -> list[dict]:
    out = []
    while not sub.queue.empty():
        out.append(json.loads(sub.queue.get_nowait()))
    return out


# --- S-05: tokens are stored hashed -----------------------------------------

async def test_tokens_are_stored_hashed_and_still_work(client):
    token = await seed_session(device_unique_id="ml360-a", traccar_device_id=1)
    async with aiosqlite.connect(database._DB_PATH, uri=True) as db:
        async with db.execute("SELECT token FROM device_sessions") as cur:
            stored = [row[0] async for row in cur]
    assert stored == [hash_token(token)]
    assert (await client.get("/groups", headers=auth(token))).status_code == 200


async def test_clear_tokens_from_an_older_version_are_hashed_on_start(tmp_path, monkeypatch):
    path = str(tmp_path / "old.db")
    monkeypatch.setattr(database, "_DB_PATH", path)
    monkeypatch.setattr(database, "_DB_URI", False)
    await init_db()
    old = "0b9c6a8e-1d2f-4c3b-9a8e-7f6d5c4b3a21"
    async with aiosqlite.connect(path) as db:
        await db.execute(
            "INSERT INTO device_sessions (token, traccar_device_id, display_name, device_unique_id)"
            " VALUES (?, 1, 'Alice', 'ml360-alice')", (old,))
        await db.commit()
    await init_db()
    await init_db()  # idempotent: a hash is never hashed again
    assert (await get_session(old))["device_unique_id"] == "ml360-alice"


# --- L-05: phones that go silent --------------------------------------------

async def test_a_silent_phone_is_flagged_once_and_welcomed_back(client):
    await _family()
    state = engine._default_state(1)
    state["last_seen_at"] = database.iso(utcnow() - timedelta(minutes=90))
    await save_device_state(state)
    bob = await bus.subscribe(device_id=2, visible={1, 2})

    assert await engine.check_silent_devices() == [1]
    assert await engine.check_silent_devices() == []           # no repeat
    assert (await get_device_state(1))["sharing"] == "no_signal"

    await engine.process_status(1, {"tracking": "active"})
    titles = [m["title"] for m in _drain(bob) if m["type"] == "alert"]
    assert titles == ["Alice has not been heard from for an hour", "Alice is back online"]


async def test_a_paused_phone_is_not_reported_as_silent(client):
    await _family()
    state = engine._default_state(1)
    state["sharing"] = "paused"
    state["last_seen_at"] = database.iso(utcnow() - timedelta(hours=5))
    await save_device_state(state)
    assert await engine.check_silent_devices() == []


# --- L-09: devices that never enrolled --------------------------------------

async def test_positions_of_unenrolled_devices_raise_nothing(client):
    await _family()
    frame = {"positions": [{
        "deviceId": 55, "latitude": 48.0, "longitude": 2.0, "speed": 0,
        "fixTime": database.iso(utcnow()), "attributes": {"alarm": "sos"},
    }]}
    await handle_traccar_frame(json.dumps(frame))
    assert await get_device_state(55) is None
    assert await recent_alerts(10) == []


# --- S-10: live connections per phone ---------------------------------------

async def test_a_phone_cannot_open_endless_live_connections(client):
    alice, _, _ = await _family()
    _open_streams[1] = MAX_STREAMS_PER_PHONE
    resp = await client.get("/stream", headers=auth(alice))
    assert resp.status_code == 429


# --- S-07: crash reports are bounded ----------------------------------------

async def test_oversized_crash_reports_are_refused(client):
    resp = await client.post("/crash-report", json={
        "error_type": "X", "error_message": "m", "stacktrace": "x" * 100_000,
    })
    assert resp.status_code == 422


# --- I-05: too-old apps are told to update ----------------------------------

async def test_an_app_too_old_is_asked_to_update(client):
    alice, _, _ = await _family()
    old = await client.get("/groups", headers={**auth(alice), "X-MyLife360-Version": "1.1.0"})
    assert old.status_code == 426
    assert "update" in old.json()["detail"]
    current = await client.get("/groups", headers={**auth(alice), "X-MyLife360-Version": "1.2.4"})
    assert current.status_code == 200
    assert (await client.get("/groups", headers=auth(alice))).status_code == 200


async def test_an_app_too_old_can_still_fetch_its_update(client):
    alice, _, _ = await _family()
    resp = await client.get("/app/latest", headers={**auth(alice), "X-MyLife360-Version": "1.0.0"})
    assert resp.status_code != 426


async def test_versions_compare_as_numbers():
    assert is_supported("1.10.0", "1.2.0")
    assert is_supported("1.2.0-debug", "1.2.0")
    assert not is_supported("1.1.9", "1.2.0")


# --- L-13: phone number for the Call button ---------------------------------

@respx.mock
async def test_a_phone_number_is_shared_with_the_circle(client):
    alice, bob, _ = await _family()
    resp = await client.put("/devices/me/phone", headers=auth(alice),
                            json={"phone_number": "+33 6 12 34 56 78"})
    assert resp.json() == {"phone_number": "+33612345678"}

    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 1}))
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[
        {"id": 1, "name": "Alice's phone"}, {"id": 2, "name": "Bob's phone"}]))
    respx.get(f"{TRACCAR}/api/positions").mock(return_value=httpx.Response(200, json=[]))
    family = (await client.get("/family", headers=auth(bob))).json()
    assert {m["name"]: m["phone"] for m in family} == {"Alice": "+33612345678", "Bob": None}

    cleared = await client.put("/devices/me/phone", headers=auth(alice), json={"phone_number": ""})
    assert cleared.json() == {"phone_number": None}


# --- S-04 / I-06: the admin page --------------------------------------------

async def test_the_admin_page_is_only_reachable_through_home_assistant(client):
    await _family()
    assert (await client.get("/")).status_code == 404
    assert (await client.post("/admin/revoke/1")).status_code == 404

    ingress = ASGITransport(app=app, client=("172.30.32.2", 40000))
    async with AsyncClient(transport=ingress, base_url="http://test") as ha:
        page = await ha.get("/")
        assert page.status_code == 200
        assert "Alice" in page.text and "Bob" in page.text


async def test_a_crafted_name_cannot_run_script_in_the_admin_page(client):
    await seed_session(device_unique_id="ml360-x", traccar_device_id=3,
                       display_name="x');alert(1);//<b>")
    ingress = ASGITransport(app=app, client=("172.30.32.2", 40000))
    async with AsyncClient(transport=ingress, base_url="http://test") as ha:
        page = (await ha.get("/")).text
    assert "onsubmit" not in page
    assert "<b>" not in page
    assert 'data-name="x&#x27;);alert(1);//&lt;b&gt;"' in page


async def test_revoking_a_lost_phone_cuts_it_off(client):
    alice, bob, fam = await _family()
    ingress = ASGITransport(app=app, client=("172.30.32.2", 40000))
    async with AsyncClient(transport=ingress, base_url="http://test") as ha:
        resp = await ha.post("/admin/revoke/2")
        assert resp.status_code == 303
    assert (await client.get("/groups", headers=auth(bob))).status_code == 401
    members = await client.get(f"/groups/{fam['id']}/members", headers=auth(alice))
    assert members.status_code == 200
    assert "Bob" not in members.text


# --- wifi mappings only for places the caller can see ------------------------

@respx.mock
async def test_a_wifi_mapping_needs_a_place_the_caller_can_see(client):
    alice, _, _ = await _family()
    respx.get(f"{TRACCAR}/api/session").mock(return_value=httpx.Response(200, json={"id": 1}))
    respx.get(f"{TRACCAR}/api/geofences").mock(
        return_value=httpx.Response(200, json=[{"id": 10, "name": "Home"}]))
    resp = await client.post("/wifi-mappings", headers=auth(alice),
                             json={"ssid": "Livebox-1234", "place_id": 99})
    assert resp.status_code == 404
