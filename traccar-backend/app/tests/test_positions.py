"""Phones post positions, status, SOS and check-ins to the backend."""
import json
import time

import httpx
import pytest
import respx

from app.broadcast import bus
from app.database import add_device_to_group, create_group, get_device_state, set_place_group
from app.routers.stream import handle_traccar_frame
from app.tests.conftest import OSMAND, TRACCAR, auth, mock_admin_session, seed_session

pytestmark = pytest.mark.asyncio

NOW_MS = int(time.time()) * 1000


def fix(offset_s: int = 0, **extra) -> dict:
    return {"time": NOW_MS + offset_s * 1000, "latitude": 48.0, "longitude": 2.0,
            "speed": 0.0, "accuracy": 8.0, "battery": 80.0, **extra}


@pytest.fixture
async def tokens():
    alice = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1, display_name="Alice")
    bob = await seed_session(device_unique_id="ml360-bob", traccar_device_id=2, display_name="Bob")
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-alice")
    await add_device_to_group("ml360-bob", fam["id"])
    return {"alice": alice, "bob": bob, "family": fam}


def _drain(sub) -> list[dict]:
    out = []
    while not sub.queue.empty():
        out.append(json.loads(sub.queue.get_nowait()))
    return out


def _mock_no_places():
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/geofences").mock(return_value=httpx.Response(200, json=[]))


@respx.mock
async def test_positions_are_forwarded_to_traccar_on_the_lan_in_order(client, tokens):
    _mock_no_places()
    osmand = respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    resp = await client.post("/positions", headers=auth(tokens["alice"]), json={
        "positions": [fix(20, speed=10.0), fix(0, charging=True)],
    })
    assert resp.json() == {"accepted": 2}
    sent = [dict(c.request.url.params) for c in osmand.calls]
    assert [int(p["timestamp"]) for p in sent] == [NOW_MS // 1000, NOW_MS // 1000 + 20]
    assert sent[0]["id"] == "ml360-alice"
    assert sent[0]["charge"] == "true"
    assert float(sent[1]["speed"]) == pytest.approx(10.0 * 3.6 / 1.852, abs=0.01)


@respx.mock
async def test_batch_stops_at_the_first_refusal_so_the_phone_retries(client, tokens):
    _mock_no_places()
    respx.get(f"{OSMAND}/").mock(side_effect=[httpx.Response(200), httpx.Response(503),
                                              httpx.Response(200)])
    resp = await client.post("/positions", headers=auth(tokens["alice"]),
                             json={"positions": [fix(0), fix(10), fix(20)]})
    assert resp.json() == {"accepted": 1}


@respx.mock
async def test_a_resent_batch_is_acknowledged_without_storing_twice(client, tokens):
    _mock_no_places()
    osmand = respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    body = {"positions": [fix(0), fix(10)]}
    await client.post("/positions", headers=auth(tokens["alice"]), json=body)
    again = await client.post("/positions", headers=auth(tokens["alice"]), json=body)
    assert again.json() == {"accepted": 2}
    assert osmand.call_count == 2


@respx.mock
async def test_live_update_reaches_the_circle_with_every_field(client, tokens):
    _mock_no_places()
    respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    stranger = await bus.subscribe(device_id=9, visible={9})
    await client.post("/positions", headers=auth(tokens["alice"]),
                      json={"positions": [fix(0, course=90.0, charging=True)]})
    [update] = [m for m in _drain(bob) if m["type"] == "position"]
    assert update["device_id"] == 1
    assert update["accuracy"] == 8.0
    assert update["course"] == 90.0
    assert update["is_charging"] is True
    assert update["battery_level"] == 80.0
    assert update["fix_time"].startswith(time.strftime("%Y-", time.gmtime()))
    assert _drain(stranger) == []


@respx.mock
async def test_traccar_echo_of_a_posted_position_is_not_processed_twice(client, tokens):
    _mock_no_places()
    respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    await client.post("/positions", headers=auth(tokens["alice"]), json={"positions": [fix(0)]})
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    echo = {"positions": [{"deviceId": 1, "latitude": 48.0, "longitude": 2.0, "speed": 0,
                           "fixTime": time.strftime("%Y-%m-%dT%H:%M:%S.000+00:00",
                                                    time.gmtime(NOW_MS // 1000)),
                           "attributes": {}}]}
    await handle_traccar_frame(json.dumps(echo))
    assert _drain(bob) == []


@respx.mock
async def test_older_apps_positions_from_traccar_still_go_through_detection(client, tokens):
    _mock_no_places()
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    frame = {"positions": [
        {"deviceId": 1, "latitude": 48.0, "longitude": 2.0, "speed": 10.0, "accuracy": 5,
         "fixTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
         "attributes": {"batteryLevel": 55, "alarm": "sos"}},
        {"deviceId": 2, "latitude": 48.1, "longitude": 2.1, "speed": 0,
         "fixTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "attributes": {}},
    ]}
    await handle_traccar_frame(json.dumps(frame))
    messages = _drain(bob)
    assert {m["device_id"] for m in messages if m["type"] == "position"} == {1, 2}
    assert [m["kind"] for m in messages if m["type"] == "alert"] == ["sos"]
    speed = next(m for m in messages if m["type"] == "position" and m["device_id"] == 1)["speed_kmh"]
    assert speed == pytest.approx(18.52)


async def test_traccar_events_are_no_longer_forwarded(client, tokens):
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    await handle_traccar_frame(json.dumps({"events": [{"deviceId": 1, "type": "geofenceEnter"}]}))
    assert _drain(bob) == []


async def test_positions_require_a_token(client):
    resp = await client.post("/positions", json={"positions": []})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Status, SOS, check-in, alerts
# ---------------------------------------------------------------------------

async def test_status_is_stored_and_shown_to_the_circle(client, tokens):
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    resp = await client.post("/status", headers=auth(tokens["alice"]),
                             json={"tracking": "paused", "app_version": "1.2.0"})
    assert resp.json() == {"sharing": "paused"}
    messages = _drain(bob)
    assert {"type": "member_status", "device_id": 1, "sharing": "paused",
            "app_version": "1.2.0"} in messages
    assert [m["title"] for m in messages if m["type"] == "alert"] == ["Alice paused location sharing"]


@respx.mock
async def test_sos_tells_the_circle_and_says_how_many_were_told(client, tokens):
    _mock_no_places()
    osmand = respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    resp = await client.post("/sos", headers=auth(tokens["alice"]),
                             json={"latitude": 48.0, "longitude": 2.0, "accuracy": 12})
    assert resp.status_code == 201
    assert resp.json()["recipients"] == 1
    assert [m["kind"] for m in _drain(bob) if m["type"] == "alert"] == ["sos"]
    assert dict(osmand.calls[0].request.url.params)["alarm"] == "sos"


@respx.mock
async def test_second_sos_press_is_never_swallowed(client, tokens):
    _mock_no_places()
    respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    for _ in range(2):
        resp = await client.post("/sos", headers=auth(tokens["alice"]), json={"kind": "sos"})
        assert resp.status_code == 201
    alerts = (await client.get("/alerts", headers=auth(tokens["bob"]))).json()
    assert [a["kind"] for a in alerts] == ["sos", "sos"]


async def test_resolving_an_sos(client, tokens):
    resp = await client.post("/sos/resolve", headers=auth(tokens["alice"]))
    assert resp.status_code == 201
    alerts = (await client.get("/alerts", headers=auth(tokens["bob"]))).json()
    assert alerts[0]["title"] == "Alice is safe"


@respx.mock
async def test_on_my_way_names_the_destination(client, tokens):
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/geofences").mock(return_value=httpx.Response(200, json=[
        {"id": 100, "name": "Home", "area": "CIRCLE (48.0 2.0, 100)"},
    ]))
    await set_place_group(100, tokens["family"]["id"])
    resp = await client.post("/checkin", headers=auth(tokens["alice"]),
                             json={"kind": "on_my_way", "place_id": 100})
    assert resp.status_code == 201
    assert resp.json()["title"] == "Alice is on the way to Home"
    assert resp.json()["recipients"] == 1


@respx.mock
async def test_checkin_here_names_the_current_place(client, tokens):
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/geofences").mock(return_value=httpx.Response(200, json=[
        {"id": 100, "name": "Home", "area": "CIRCLE (48.0 2.0, 100)"},
    ]))
    respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    await client.post("/positions", headers=auth(tokens["alice"]), json={"positions": [fix(0)]})
    resp = await client.post("/checkin", headers=auth(tokens["alice"]), json={"kind": "here"})
    assert resp.json()["title"] == "Alice checked in at Home"


async def test_alerts_catch_up_from_an_id(client, tokens):
    for _ in range(3):
        await client.post("/sos/resolve", headers=auth(tokens["alice"]))
    all_alerts = (await client.get("/alerts", headers=auth(tokens["bob"]))).json()
    newest_first = [a["id"] for a in all_alerts]
    assert newest_first == sorted(newest_first, reverse=True)
    since = (await client.get(f"/alerts?since_id={newest_first[1]}",
                              headers=auth(tokens["bob"]))).json()
    assert [a["id"] for a in since] == [newest_first[0]]


async def test_request_status_only_reaches_my_circle(client, tokens):
    await seed_session(device_unique_id="ml360-carol", traccar_device_id=3)
    alice = await bus.subscribe(device_id=1, visible={1, 2})
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    carol = await bus.subscribe(device_id=3, visible={3})
    resp = await client.post("/request-status", headers=auth(tokens["alice"]))
    assert resp.status_code == 204
    assert _drain(bob) == [{"type": "status_request"}]
    assert _drain(alice) == []
    assert _drain(carol) == []


@respx.mock
async def test_state_remembers_last_position_for_checkins(client, tokens):
    _mock_no_places()
    respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    await client.post("/positions", headers=auth(tokens["alice"]), json={"positions": [fix(0)]})
    state = await get_device_state(1)
    assert (state["last_latitude"], state["last_longitude"]) == (48.0, 2.0)


@respx.mock
async def test_a_trip_saved_offline_goes_to_history_without_moving_the_map(client, tokens):
    """Back online after a flight: the family sees where she is now, and the
    flight appears in her history, but the map does not replay it."""
    _mock_no_places()
    osmand = respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    bob = await bus.subscribe(device_id=2, visible={1, 2})

    arrived = fix(0, latitude=41.3, longitude=2.08)          # current: landed
    await client.post("/positions", headers=auth(tokens["alice"]), json={"positions": [arrived]})
    first = [m for m in _drain(bob) if m["type"] == "position"]
    assert [(m["latitude"], m["longitude"]) for m in first] == [(41.3, 2.08)]

    flight = [fix(-7200 + i * 600, latitude=48.0 - i * 0.5, speed=230.0) for i in range(12)]
    resp = await client.post("/positions", headers=auth(tokens["alice"]), json={"positions": flight})
    assert resp.json() == {"accepted": 12}
    assert osmand.call_count == 13                       # all stored in the history
    messages = _drain(bob)
    assert [m["type"] for m in messages] == ["history_updated"]   # nobody's map moved
    assert messages[0]["device_id"] == 1


@respx.mock
async def test_only_the_newest_of_a_batch_moves_the_map(client, tokens):
    _mock_no_places()
    respx.get(f"{OSMAND}/").mock(return_value=httpx.Response(200))
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    batch = [fix(-300 + i * 60, latitude=48.0 + i * 0.01) for i in range(6)]
    await client.post("/positions", headers=auth(tokens["alice"]), json={"positions": batch})
    updates = [m for m in _drain(bob) if m["type"] == "position"]
    assert [m["latitude"] for m in updates] == [48.05]
