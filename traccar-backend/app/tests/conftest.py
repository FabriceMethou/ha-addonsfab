"""Shared fixtures for MyLife360 backend tests."""
import os
import uuid

# Use an in-memory SQLite database for all tests
os.environ.setdefault("DB_PATH", ":memory:")
os.environ.setdefault("TRACCAR_URL", "http://traccar.test")
os.environ.setdefault("TRACCAR_ADMIN_TOKEN", "admintoken")
os.environ.setdefault("TRACCAR_ADMIN_USER_ID", "1")

import pytest
import pytest_asyncio
import respx
import httpx
from httpx import AsyncClient

from app.main import app
from app.database import init_db, upsert_session


# ---------------------------------------------------------------------------
# App-level fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(autouse=True)
async def _fresh_db():
    """Re-create the SQLite schema before every test."""
    # Patch the db path to :memory: — each connection is isolated,
    # so we just call init_db to ensure the table exists.
    await init_db()
    yield


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
    traccar_user_id: int = 42,
    traccar_device_id: int = 7,
    traccar_email: str | None = None,
    traccar_password: str = "secret",
) -> str:
    token = str(uuid.uuid4())
    email = traccar_email or f"{device_unique_id}@mylife360.local"
    await upsert_session(
        token=token,
        traccar_user_id=traccar_user_id,
        traccar_device_id=traccar_device_id,
        traccar_email=email,
        traccar_password=traccar_password,
        display_name=display_name,
        device_unique_id=device_unique_id,
    )
    return token


TRACCAR = "http://traccar.test"
