"""Tests for enrolment-code protection on POST /provision.

Without this gate anyone able to reach the backend can enrol a device and
then read every family's live location (finding C-02).
"""
import logging

import httpx
import pytest
import respx

from app.config import settings
from app.tests.conftest import TRACCAR, PROVISION_CODE

pytestmark = pytest.mark.asyncio

ADMIN_SESSION_MOCK = httpx.Response(200, json={"id": 1, "administrator": True})


def _mock_traccar(unique_id: str) -> None:
    """Traccar answers happily — so any refusal comes from our own gate."""
    respx.get(f"{TRACCAR}/api/session").mock(return_value=ADMIN_SESSION_MOCK)
    respx.get(f"{TRACCAR}/api/devices").mock(return_value=httpx.Response(200, json=[]))
    respx.post(f"{TRACCAR}/api/devices").mock(
        return_value=httpx.Response(
            201, json={"id": 5, "name": "Alice's phone", "uniqueId": unique_id}
        )
    )
    respx.post(f"{TRACCAR}/api/permissions").mock(return_value=httpx.Response(204, json={}))


def _body(unique_id: str, code: str | None = None) -> dict:
    body = {"display_name": "Alice", "device_unique_id": unique_id}
    if code is not None:
        body["enrolment_code"] = code
    return body


@respx.mock
async def test_provision_without_code_is_refused(client):
    _mock_traccar("ml360-nocode")
    resp = await client.post("/provision", json=_body("ml360-nocode"))
    assert resp.status_code == 403


@respx.mock
async def test_provision_with_wrong_code_is_refused(client):
    _mock_traccar("ml360-wrong")
    resp = await client.post("/provision", json=_body("ml360-wrong", "not-the-code"))
    assert resp.status_code == 403


@respx.mock
async def test_provision_with_correct_code_succeeds(client):
    _mock_traccar("ml360-right")
    resp = await client.post("/provision", json=_body("ml360-right", PROVISION_CODE))
    assert resp.status_code == 201
    assert "device_token" in resp.json()


async def test_wrong_code_never_reaches_traccar(client):
    """No respx mock here: any outbound call would raise. A refusal must be local."""
    resp = await client.post("/provision", json=_body("ml360-early", "wrong"))
    assert resp.status_code == 403


@respx.mock
async def test_provision_refused_when_no_code_configured(client, monkeypatch):
    """Fail closed: an unconfigured backend must not enrol anyone."""
    monkeypatch.setattr(settings, "enrolment_code", "")
    _mock_traccar("ml360-unset")
    resp = await client.post("/provision", json=_body("ml360-unset", "anything"))
    assert resp.status_code == 503


@respx.mock
async def test_device_token_is_not_written_to_logs_in_full(client, caplog):
    """The add-on Log tab is shared in screenshots and diagnostics (finding C-03)."""
    _mock_traccar("ml360-logged")
    with caplog.at_level(logging.INFO):
        resp = await client.post("/provision", json=_body("ml360-logged", PROVISION_CODE))
    assert resp.status_code == 201
    token = resp.json()["device_token"]
    assert token not in caplog.text
