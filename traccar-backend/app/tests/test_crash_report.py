"""Tests for POST /crash-report endpoint."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_crash_report_accepted(client):
    resp = await client.post(
        "/crash-report",
        json={
            "error_type": "NullPointerException",
            "error_message": "Null reference in onLocationChanged",
            "device_unique_id": "ml360-test",
            "display_name": "Alice",
            "app_version": "1.0.2",
            "android_version": "14",
            "device_model": "Pixel 8",
            "stacktrace": "java.lang.NullPointerException\n  at com.mylife360...",
            "logcat": "E/MyLife360: crash happened",
            "screen": "MapFragment",
        },
    )
    assert resp.status_code == 204


async def test_crash_report_minimal_fields(client):
    """Only error_type and error_message are required."""
    resp = await client.post(
        "/crash-report",
        json={
            "error_type": "RuntimeException",
            "error_message": "Something went wrong",
        },
    )
    assert resp.status_code == 204


async def test_crash_report_missing_required_fields(client):
    resp = await client.post("/crash-report", json={"error_type": "X"})
    assert resp.status_code == 422
