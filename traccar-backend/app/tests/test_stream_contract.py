"""The live messages match the contract the app is tested against.

The 1.1.0 stream sent positions without their fix time, and the app's crash
check quietly stopped working. The fixture below is copied verbatim into the
app's test resources, where the app parses it.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.alerts import public_alert
from app.engine import live_message

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "stream_messages.json").read_text())


def test_position_message_has_exactly_the_contract_fields():
    message = live_message(7, {
        "fix_time": datetime(2026, 9, 27, 18, tzinfo=timezone.utc),
        "latitude": 48.8566, "longitude": 2.3522, "speed_kmh": 42.5, "course": 90.0,
        "altitude": 35.0, "accuracy": 8.0, "address": "1 Rue de Rivoli", "battery": 64.0,
        "charging": True, "alarm": "sos", "activity": "in_vehicle",
    })
    assert message == FIXTURE["position"]


def test_alert_message_has_exactly_the_contract_fields():
    alert = {k: v for k, v in FIXTURE["alert"].items() if k != "type"}
    assert {"type": "alert", **public_alert(alert)} == FIXTURE["alert"]


@pytest.mark.parametrize("kind", ["member_status", "device", "history_updated"])
def test_other_messages_are_documented(kind):
    assert FIXTURE[kind]["type"] == kind
    assert "device_id" in FIXTURE[kind]
