"""Driving reports and app updates."""
import httpx
import pytest
import respx

from app.config import settings
from app.database import add_device_to_group, create_group, insert_driving_event
from app.routers.app_update import latest_apk
from app.tests.conftest import TRACCAR, auth, mock_admin_session, seed_session


def _trip(start, end, metres, max_knots=70.0):
    return {"startTime": start, "endTime": end, "distance": metres, "duration": 1_800_000,
            "maxSpeed": max_knots, "averageSpeed": 30.0, "startAddress": None, "endAddress": None,
            "startLat": 48.0, "startLon": 2.0, "endLat": 48.1, "endLon": 2.1}


@respx.mock
async def test_driving_report_counts_events_per_trip(client):
    token = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    await seed_session(device_unique_id="ml360-bob", traccar_device_id=2)
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-alice")
    await add_device_to_group("ml360-bob", fam["id"])
    mock_admin_session()
    trips = respx.get(f"{TRACCAR}/api/reports/trips").mock(return_value=httpx.Response(200, json=[
        _trip("2099-01-01T08:00:00+00:00", "2099-01-01T08:30:00+00:00", 25_000),
        _trip("2099-01-01T12:00:00+00:00", "2099-01-01T12:02:00+00:00", 200),  # too short
    ]))
    for kind, t in [("speeding", "2099-01-01T08:10:00+00:00"),
                    ("hard_brake", "2099-01-01T08:20:00+00:00"),
                    ("hard_brake", "2099-01-01T15:00:00+00:00")]:
        await insert_driving_event({"device_id": 2, "kind": kind, "event_time": t, "value": 1.0})

    resp = await client.get("/driving?device_id=2&days=7", headers=auth(token))
    assert resp.status_code == 200
    report = resp.json()
    assert report["speeding_limit_kmh"] == settings.speeding_limit_kmh
    assert len(report["trips"]) == 1
    trip = report["trips"][0]
    assert (trip["distance_km"], trip["duration_min"], trip["max_speed_kmh"]) == (25.0, 30, 130)
    assert (trip["speeding"], trip["hard_brakes"]) == (1, 1)
    assert report["totals"]["hard_brakes"] == 2
    assert trips.calls[0].request.url.params["deviceId"] == "2"


async def test_driving_report_outside_my_circles_is_refused(client):
    token = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    resp = await client.get("/driving?device_id=99", headers=auth(token))
    assert resp.status_code == 403


def test_latest_apk_picks_the_highest_prod_version(tmp_path):
    for name in ["mylife360-1.2.0-3-prod-release.apk", "mylife360-1.3.0-4-prod-release.apk",
                 "mylife360-1.4.0-5-beta-release.apk", "notes.txt", "other.apk"]:
        (tmp_path / name).write_bytes(b"x" * 10)
    apk = latest_apk(str(tmp_path))
    assert (apk["version_code"], apk["version_name"], apk["size"]) == (4, "1.3.0", 10)


def test_no_apk_folder_means_no_update(tmp_path):
    assert latest_apk(str(tmp_path / "missing")) is None


async def test_app_update_endpoints(client, tmp_path, monkeypatch):
    token = await seed_session()
    monkeypatch.setattr(settings, "apk_dir", str(tmp_path))
    assert (await client.get("/app/latest", headers=auth(token))).status_code == 404

    (tmp_path / "mylife360-1.2.0-3-prod-release.apk").write_bytes(b"APK!")
    latest = await client.get("/app/latest", headers=auth(token))
    assert latest.json() == {"version_code": 3, "version_name": "1.2.0", "size": 4}
    download = await client.get("/app/apk", headers=auth(token))
    assert download.content == b"APK!"
    assert download.headers["content-type"] == "application/vnd.android.package-archive"
    assert (await client.get("/app/apk")).status_code == 401


@respx.mock
@pytest.mark.parametrize("failure", [
    httpx.ReadTimeout("Traccar took too long"),
    httpx.Response(200, text="<html>not json</html>"),
])
async def test_driving_report_survives_a_slow_or_odd_traccar(client, failure):
    """Regression: a slow trip report escaped as a 500 and hid the whole card."""
    token = await seed_session(device_unique_id="ml360-alice", traccar_device_id=1)
    mock_admin_session()
    route = respx.get(f"{TRACCAR}/api/reports/trips")
    if isinstance(failure, Exception):
        route.mock(side_effect=failure)
    else:
        route.mock(return_value=failure)
    await insert_driving_event({"device_id": 1, "kind": "hard_brake",
                                "event_time": "2099-01-01T08:20:00+00:00", "value": 4.0})

    resp = await client.get("/driving?device_id=1", headers=auth(token))
    assert resp.status_code == 200
    report = resp.json()
    assert report["trips"] == []
    assert report["trips_error"]
    assert report["totals"]["hard_brakes"] == 1
