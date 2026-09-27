"""Alerts: stored once, delivered to everyone who should hear about them.

Phones receive alerts over their live connection, which the tracking service
keeps open, and catch up on anything missed through GET /alerts.
"""
import logging
from datetime import timedelta

from app.authz import audience_for_device
from app.broadcast import bus
from app.database import (
    get_session_by_device_id,
    insert_alert,
    iso,
    recent_alert_exists,
    utcnow,
)

logger = logging.getLogger(__name__)

SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_CRITICAL = "critical"


async def display_name(device_id: int) -> str:
    session = await get_session_by_device_id(device_id)
    return session["display_name"] if session else f"Device {device_id}"


async def raise_alert(
    kind: str,
    severity: str,
    device_id: int,
    title: str,
    body: str,
    *,
    latitude: float | None = None,
    longitude: float | None = None,
    place_id: int | None = None,
    place_name: str | None = None,
    group_id: int | None = None,
    dedupe_minutes: int | None = None,
) -> dict | None:
    """Store an alert and push it to its audience. None when de-duplicated."""
    now = utcnow()
    if dedupe_minutes and await recent_alert_exists(
        device_id, kind, place_id, now - timedelta(minutes=dedupe_minutes)
    ):
        logger.info("Alert %s for device %s suppressed as a duplicate", kind, device_id)
        return None
    alert = await insert_alert({
        "created_at": iso(now),
        "kind": kind,
        "severity": severity,
        "device_id": device_id,
        "group_id": group_id,
        "place_id": place_id,
        "place_name": place_name,
        "title": title,
        "body": body,
        "latitude": latitude,
        "longitude": longitude,
    })
    recipients = await audience_for_device(device_id, group_id)
    alert["recipient_count"] = len(recipients)
    await bus.publish_to({"type": "alert", **public_alert(alert)}, recipients)
    logger.info("ALERT %s (%s) for device %s → %d recipients", kind, severity, device_id, len(recipients))
    return alert


def public_alert(alert: dict) -> dict:
    return {
        "id": alert["id"],
        "created_at": alert["created_at"],
        "kind": alert["kind"],
        "severity": alert["severity"],
        "device_id": alert["device_id"],
        "place_id": alert.get("place_id"),
        "place_name": alert.get("place_name"),
        "title": alert["title"],
        "body": alert["body"],
        "latitude": alert.get("latitude"),
        "longitude": alert.get("longitude"),
    }
