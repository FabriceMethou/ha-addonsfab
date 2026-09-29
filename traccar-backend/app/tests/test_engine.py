"""The backend decides: arrivals, SOS, battery, flights, driving, sharing."""
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from app import engine
from app.broadcast import bus
from app.database import (
    add_device_to_group, create_group, list_alerts, list_driving_events, set_place_group,
)
from app.tests.conftest import TRACCAR, mock_admin_session, seed_session

pytestmark = pytest.mark.asyncio

HOME = {"id": 100, "name": "Home", "area": "CIRCLE (48.0 2.0, 100.0)"}
SCHOOL = {"id": 101, "name": "School", "area": "CIRCLE (48.1 2.0, 150.0)"}
T0 = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=5)


def pos(seconds: int = 0, lat: float = 48.0, lon: float = 2.0, **extra) -> dict:
    return {"fix_time": T0 + timedelta(seconds=seconds), "latitude": lat, "longitude": lon,
            "speed_kmh": 0.0, "accuracy": 10.0, **extra}


@pytest.fixture
async def family():
    """Alice (1) and Bob (2) share a circle; Carol (3) is elsewhere."""
    await seed_session(device_unique_id="ml360-alice", traccar_device_id=1, display_name="Alice")
    await seed_session(device_unique_id="ml360-bob", traccar_device_id=2, display_name="Bob")
    await seed_session(device_unique_id="ml360-carol", traccar_device_id=3, display_name="Carol")
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-alice")
    await add_device_to_group("ml360-bob", fam["id"])
    return fam


def _mock_places(*geofences):
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/geofences").mock(return_value=httpx.Response(200, json=list(geofences)))


async def _alerts(kind: str | None = None) -> list[dict]:
    rows = await list_alerts({1, 2, 3}, set(), 0, 100)
    return [r for r in reversed(rows) if kind is None or r["kind"] == kind]


def _drain(sub) -> list[dict]:
    out = []
    while not sub.queue.empty():
        out.append(json.loads(sub.queue.get_nowait()))
    return out


# ---------------------------------------------------------------------------
# Places
# ---------------------------------------------------------------------------

@respx.mock
async def test_departure_and_arrival_are_announced_after_first_sighting(family):
    _mock_places(HOME)
    assert await engine.process(1, pos(0)) is True            # first sighting: silent
    await engine.process(1, pos(60, lat=48.01))               # ~1.1 km away
    await engine.process(1, pos(900, lat=48.0))               # back home
    assert [(a["kind"], a["title"]) for a in await _alerts()] == [
        ("departure", "Alice left Home"),
        ("arrival", "Alice arrived at Home"),
    ]


@respx.mock
async def test_the_edge_of_a_place_does_not_flap(family):
    _mock_places(HOME)
    await engine.process(1, pos(0))
    # 30 m outside the edge: inside the exit margin, so no departure.
    await engine.process(1, pos(60, lat=48.0 + 130 / 111_195))
    await engine.process(1, pos(120))
    assert await _alerts() == []


@respx.mock
async def test_imprecise_fix_inside_does_not_count_as_arrival(family):
    _mock_places(HOME)
    await engine.process(1, pos(0, lat=48.01))
    await engine.process(1, pos(60, accuracy=900.0))
    assert await _alerts("arrival") == []


@respx.mock
async def test_arrivals_reach_the_circle_but_not_the_traveller_or_strangers(family):
    _mock_places(HOME)
    alice = await bus.subscribe(device_id=1, visible={1, 2})
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    carol = await bus.subscribe(device_id=3, visible={3})
    await engine.process(1, pos(0, lat=48.01))
    await engine.process(1, pos(60))
    kinds = lambda sub: [m.get("kind") for m in _drain(sub) if m["type"] == "alert"]  # noqa: E731
    assert kinds(bob) == ["arrival"]
    assert kinds(alice) == []
    assert kinds(carol) == []


@respx.mock
async def test_a_circles_place_only_alerts_that_circle(family):
    others = await create_group("Others", "#000000", owner_unique_id="ml360-carol")
    await add_device_to_group("ml360-alice", others["id"])
    await set_place_group(SCHOOL["id"], others["id"])
    _mock_places(SCHOOL)
    bob = await bus.subscribe(device_id=2, visible={1, 2})
    carol = await bus.subscribe(device_id=3, visible={1, 3})
    await engine.process(1, pos(0))
    await engine.process(1, pos(60, lat=48.1))
    assert [m["kind"] for m in _drain(carol) if m["type"] == "alert"] == ["arrival"]
    assert [m for m in _drain(bob) if m["type"] == "alert"] == []


@respx.mock
async def test_late_positions_update_presence_without_alerting(family):
    _mock_places(HOME)
    old = T0 - timedelta(hours=2)
    await engine.process(1, {**pos(), "fix_time": old})
    await engine.process(1, {**pos(lat=48.01), "fix_time": old + timedelta(minutes=5)})
    assert await _alerts() == []


@respx.mock
async def test_same_position_twice_is_processed_once(family):
    _mock_places()
    assert await engine.process(1, pos(0)) is True
    assert await engine.process(1, pos(0)) is False
    assert await engine.process(1, pos(-10)) is False


# ---------------------------------------------------------------------------
# Emergencies, battery, flights
# ---------------------------------------------------------------------------

@respx.mock
async def test_sos_alarm_raises_a_critical_alert_once(family):
    _mock_places()
    await engine.process(1, pos(0, alarm="sos"))
    await engine.process(1, pos(30, alarm="sos"))
    sos = await _alerts("sos")
    assert len(sos) == 1
    assert sos[0]["severity"] == "critical"


@respx.mock
async def test_low_battery_alerts_once_until_charged(family):
    _mock_places()
    await engine.process(1, pos(0, battery=40.0))
    await engine.process(1, pos(60, battery=14.0))
    await engine.process(1, pos(120, battery=12.0))
    await engine.process(1, pos(180, battery=13.0, charging=True))
    await engine.process(1, pos(240, battery=11.0))
    assert [a["body"] for a in await _alerts("low_battery")] == ["14% left", "11% left"]


@respx.mock
async def test_autobahn_or_tgv_speeds_are_not_a_flight(family):
    _mock_places()
    for i, s in enumerate([230, 245, 250, 320, 318, 120]):
        await engine.process(1, pos(i * 60, speed_kmh=float(s)))
    assert await _alerts("flight") == []


@respx.mock
async def test_flight_takeoff_and_landing(family):
    _mock_places()
    speeds = [30, 250, 800, 820, 40, 10]
    for i, s in enumerate(speeds):
        await engine.process(1, pos(i * 60, speed_kmh=float(s)))
    assert [a["title"] for a in await _alerts("flight")] == ["Alice took off", "Alice landed"]


# ---------------------------------------------------------------------------
# Driving
# ---------------------------------------------------------------------------

@respx.mock
async def test_hard_braking_is_recorded(family):
    _mock_places()
    await engine.process(1, pos(0, speed_kmh=80.0))
    await engine.process(1, pos(5, speed_kmh=10.0))    # 3.9 m/s² over 5 s
    events = await list_driving_events(1, T0 - timedelta(hours=1))
    assert [e["kind"] for e in events] == ["hard_brake"]
    assert events[0]["value"] == pytest.approx(3.89, abs=0.01)


@respx.mock
async def test_gentle_stop_is_not_hard_braking(family):
    _mock_places()
    await engine.process(1, pos(0, speed_kmh=50.0))
    await engine.process(1, pos(10, speed_kmh=30.0))
    assert await list_driving_events(1, T0 - timedelta(hours=1)) == []


@respx.mock
async def test_speeding_needs_two_fixes_and_is_not_repeated_within_minutes(family):
    _mock_places()
    for i, s in enumerate([120, 140, 145, 150]):
        await engine.process(1, pos(i * 10, speed_kmh=float(s)))
    events = await list_driving_events(1, T0 - timedelta(hours=1))
    # 120→140: the first fix over the limit is not enough. 140→145 records
    # the event; 145→150 is within five minutes of it.
    assert [(e["kind"], e["value"]) for e in events] == [("speeding", 145.0)]


# ---------------------------------------------------------------------------
# Sharing status
# ---------------------------------------------------------------------------

@respx.mock
async def test_pausing_and_resuming_sharing_is_announced(family):
    assert await engine.process_status(1, {"tracking": "active", "app_version": "1.2.0"}) == "active"
    assert await engine.process_status(1, {"tracking": "paused"}) == "paused"
    assert await engine.process_status(1, {"tracking": "active", "location_enabled": False}) == "location_off"
    assert await engine.process_status(1, {"tracking": "active", "location_enabled": True}) == "active"
    assert [a["title"] for a in await _alerts()] == [
        "Alice paused location sharing",
        "Alice turned location off",
        "Alice is sharing location again",
    ]
