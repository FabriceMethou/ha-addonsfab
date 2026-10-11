"""Tests for POST /provision and moving to a new phone."""
import json

import httpx
import pytest
import respx

from app.authz import visible_device_ids
from app.database import add_device_to_group, create_group, get_groups_for_device, get_session
from app.tests.conftest import PROVISION_CODE, TRACCAR, auth, mock_admin_session, seed_session

pytestmark = pytest.mark.asyncio


def _device(id, name, unique_id, last_update="2024-01-15T10:00:00Z"):
    return {"id": id, "name": name, "uniqueId": unique_id, "lastUpdate": last_update,
            "status": "online"}


def _enrol(name: str, unique_id: str, **extra) -> dict:
    return {"display_name": name, "device_unique_id": unique_id, **extra}


@respx.mock
async def test_provision_new_device(client):
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[]))
    create = respx.post(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(201, json=_device(5, "Alice's phone", "ml360-new"))
    )

    resp = await client.post("/provision", json=_enrol("Alice", "ml360-new",
                                                        enrolment_code=PROVISION_CODE))
    assert resp.status_code == 201
    body = resp.json()
    assert body["device_id"] == 5
    assert body["tracking_url"] == ""
    assert json.loads(create.calls[0].request.read())["name"] == "Alice's phone"
    assert (await get_session(body["device_token"]))["traccar_device_id"] == 5


@respx.mock
async def test_reinstall_on_the_same_phone_reuses_its_device(client):
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(3, "Bob's phone", "ml360-bob")])
    )
    create = respx.post(f"{TRACCAR}/api/devices")

    resp = await client.post("/provision", json=_enrol("Bob", "ml360-bob",
                                                        enrolment_code=PROVISION_CODE))
    assert resp.status_code == 201
    assert resp.json()["device_id"] == 3
    assert not create.called


@respx.mock
async def test_enrolling_with_an_existing_name_does_not_take_over_that_device(client):
    """Regression for E-08: the name fallback rebound other people's devices."""
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(7, "Carol's phone", "ml360-carol")])
    )
    takeover = respx.put(f"{TRACCAR}/api/devices/7")
    respx.post(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(201, json=_device(8, "Carol's phone", "ml360-impostor"))
    )

    resp = await client.post("/provision", json=_enrol("Carol", "ml360-impostor",
                                                        enrolment_code=PROVISION_CODE))
    assert resp.status_code == 201
    assert resp.json()["device_id"] == 8
    assert not takeover.called


@respx.mock
async def test_moving_to_a_new_phone_keeps_device_and_circles(client):
    old_token = await seed_session(device_unique_id="ml360-old", traccar_device_id=11,
                                   display_name="Dave")
    await seed_session(device_unique_id="ml360-eve", traccar_device_id=12, display_name="Eve")
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-old")
    await add_device_to_group("ml360-eve", fam["id"])

    code = (await client.post("/devices/me/transfer-code", headers=auth(old_token))).json()["code"]

    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(11, "Dave's phone", "ml360-old")])
    )
    moved = respx.put(f"{TRACCAR}/api/devices/11").mock(
        return_value=httpx.Response(200, json=_device(11, "Dave's phone", "ml360-newphone"))
    )

    resp = await client.post("/provision", json=_enrol("Dave", "ml360-newphone",
                                                        transfer_code=code.lower()))
    assert resp.status_code == 201
    assert resp.json()["device_id"] == 11
    assert json.loads(moved.calls[0].request.read())["uniqueId"] == "ml360-newphone"

    new_session = await get_session(resp.json()["device_token"])
    assert await get_groups_for_device("ml360-newphone") == [fam["id"]]
    assert await visible_device_ids(new_session) == {11, 12}
    # The old phone's token no longer works.
    assert (await client.get("/groups", headers=auth(old_token))).status_code == 401


@respx.mock
async def test_transfer_code_works_once(client):
    old_token = await seed_session(device_unique_id="ml360-old", traccar_device_id=11)
    code = (await client.post("/devices/me/transfer-code", headers=auth(old_token))).json()["code"]
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(200, json=[_device(11, "X's phone", "ml360-old")])
    )
    respx.put(f"{TRACCAR}/api/devices/11").mock(
        return_value=httpx.Response(200, json=_device(11, "X's phone", "ml360-a"))
    )
    first = await client.post("/provision", json=_enrol("X", "ml360-a", transfer_code=code))
    second = await client.post("/provision", json=_enrol("X", "ml360-b", transfer_code=code))
    assert first.status_code == 201
    assert second.status_code == 403


async def test_unknown_transfer_code_is_refused(client):
    resp = await client.post("/provision", json=_enrol("X", "ml360-x", transfer_code="ZZZZZZZZ"))
    assert resp.status_code == 403


async def test_repeated_wrong_codes_trip_the_global_brake(client):
    """X-Forwarded-For can be forged, so the per-IP limit alone is not enough."""
    statuses = []
    for i in range(12):
        resp = await client.post(
            "/provision",
            json=_enrol("X", f"ml360-{i}", enrolment_code="wrong"),
            headers={"X-Forwarded-For": f"10.0.0.{i}"},
        )
        statuses.append(resp.status_code)
    assert statuses[:10] == [403] * 10
    assert statuses[10:] == [429, 429]


@respx.mock
async def test_provision_traccar_5xx_returns_503(client):
    respx.get(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(500, text="Internal Server Error")
    )
    resp = await client.post("/provision", json=_enrol("Frank", "ml360-fail",
                                                        enrolment_code=PROVISION_CODE))
    assert resp.status_code == 503


@respx.mock
async def test_moving_into_an_app_already_joined_on_this_phone(client):
    """The new app was joined with the family code first, then given the old
    app's transfer code: it used to fail with "already enrolled as someone else"."""
    old_token = await seed_session(device_unique_id="ml360-old", traccar_device_id=11, display_name="Fab")
    fam = await create_group("Family", "#4CAF50", owner_unique_id="ml360-old")
    await seed_session(device_unique_id="ml360-newapp", traccar_device_id=12, display_name="Fab")
    code = (await client.post("/devices/me/transfer-code", headers=auth(old_token))).json()["code"]

    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[
        _device(11, "Fab's phone", "ml360-old"), _device(12, "Fab's phone", "ml360-newapp")]))
    retired = respx.put(f"{TRACCAR}/api/devices/12").mock(
        return_value=httpx.Response(200, json=_device(12, "Fab's phone (replaced)", "x")))
    moved = respx.put(f"{TRACCAR}/api/devices/11").mock(
        return_value=httpx.Response(200, json=_device(11, "Fab's phone", "ml360-newapp")))

    resp = await client.post("/provision", json=_enrol("Fab", "ml360-newapp", transfer_code=code))
    assert resp.status_code == 201
    assert resp.json()["device_id"] == 11                       # history kept
    assert json.loads(retired.calls[0].request.read())["uniqueId"] == "ml360-newapp-replaced-12"
    assert json.loads(moved.calls[0].request.read())["uniqueId"] == "ml360-newapp"
    assert await get_groups_for_device("ml360-newapp") == [fam["id"]]
    assert (await get_session(resp.json()["device_token"]))["traccar_device_id"] == 11


@respx.mock
async def test_moving_phones_keeps_the_name(client):
    old_token = await seed_session(device_unique_id="ml360-old", traccar_device_id=11, display_name="Fab")
    code = (await client.post("/devices/me/transfer-code", headers=auth(old_token))).json()["code"]
    mock_admin_session()
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[
        _device(11, "Fab's phone", "ml360-old")]))
    respx.put(f"{TRACCAR}/api/devices/11").mock(
        return_value=httpx.Response(200, json=_device(11, "Fab's phone", "ml360-new")))
    resp = await client.post("/provision", json={"device_unique_id": "ml360-new", "transfer_code": code})
    assert resp.status_code == 201
    assert resp.json()["display_name"] == "Fab"
    assert (await get_session(resp.json()["device_token"]))["display_name"] == "Fab"


async def test_joining_with_the_family_code_needs_a_name(client):
    resp = await client.post("/provision", json={"device_unique_id": "ml360-x", "display_name": " ",
                                                 "enrolment_code": PROVISION_CODE})
    assert resp.status_code == 422
