"""Shared fixtures for MyLife360 backend tests."""
import os
import uuid

# Use a shared in-memory SQLite database so all connections see the same tables
os.environ.setdefault("DB_PATH", "file:testdb?mode=memory&cache=shared")
os.environ.setdefault("TRACCAR_URL", "http://traccar.test")
os.environ.setdefault("TRACCAR_ADMIN_TOKEN", "admintoken")
os.environ.setdefault("TRACCAR_ADMIN_USER_ID", "1")

import aiosqlite
import pytest
import pytest_asyncio
import respx
import httpx
from httpx import AsyncClient

from app.main import app
from app.database import init_db, upsert_session, _DB_PATH
from app.rate_limit import provision_limiter, crash_report_limiter


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
    await hold.execute("DELETE FROM wifi_mappings")
    await hold.execute("DELETE FROM device_groups")
    await hold.execute("DELETE FROM groups")
    await hold.execute("DELETE FROM device_sessions")
    await hold.commit()
    await hold.close()
    # Reset rate limiter state between tests
    provision_limiter._hits.clear()
    crash_report_limiter._hits.clear()


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(app=app, base_url="http://test") as ac:
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
