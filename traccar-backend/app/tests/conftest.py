"""Shared fixtures for MyLife360 backend tests."""
import os
import uuid

# Use a shared in-memory SQLite database so all connections see the same tables
os.environ.setdefault("DB_PATH", "file:testdb?mode=memory&cache=shared")
os.environ.setdefault("TRACCAR_URL", "http://traccar.test")
os.environ.setdefault("TRACCAR_ADMIN_TOKEN", "admintoken")
os.environ.setdefault("ENROLMENT_CODE", "test-enrolment-code")

import aiosqlite
import pytest
import pytest_asyncio
import respx
import httpx
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db, upsert_session, _DB_PATH
from app.rate_limit import provision_limiter, crash_report_limiter, crash_report_global_limiter
from app.routers import stream as stream_router
from app.routers.provision import reset_failure_brake
from app import places as place_cache
from app.broadcast import bus
from app.routers.positions import positions_limiter
from app import forwarder


# ---------------------------------------------------------------------------
# App-level fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(autouse=True)
async def _fresh_db():
    """Re-create the SQLite schema before every test.

    A 'hold' connection is kept open for the duration of the test so
    the shared in-memory database is not destroyed when individual
    operations close their connections.
    """
    hold = await aiosqlite.connect(_DB_PATH, uri=True)
    await init_db()
    yield
    # Clean tables between tests
    for table in (
        "wifi_mappings", "device_groups", "groups", "device_sessions", "group_invites",
        "place_groups", "transfer_codes", "device_state", "place_presence", "alerts",
        "driving_events", "traccar_outbox",
    ):
        await hold.execute(f"DELETE FROM {table}")
    await hold.commit()
    await hold.close()
    # Reset in-memory state between tests
    provision_limiter._hits.clear()
    crash_report_limiter._hits.clear()
    crash_report_global_limiter.reset()
    stream_router._open_streams.clear()
    reset_failure_brake()
    place_cache.invalidate()
    bus._subs.clear()
    positions_limiter.reset()
    forwarder.state.__init__()


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

async def seed_session(
    device_unique_id: str = "ml360-test",
    display_name: str = "TestUser",
    traccar_device_id: int = 7,
) -> str:
    token = str(uuid.uuid4())
    await upsert_session(
        token=token,
        traccar_device_id=traccar_device_id,
        display_name=display_name,
        device_unique_id=device_unique_id,
    )
    return token


TRACCAR = "http://traccar.test"
OSMAND = "http://traccar.test:5055"
PROVISION_CODE = "test-enrolment-code"


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def mock_admin_session() -> None:
    """Traccar accepts the admin token (call inside an active respx mock)."""
    import respx as _respx
    _respx.get(f"{TRACCAR}/api/session").mock(
        return_value=httpx.Response(200, json={"id": 1, "name": "admin"})
    )
