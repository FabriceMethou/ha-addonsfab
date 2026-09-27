"""Upgrading a 1.1.0 database keeps every circle and membership."""
import aiosqlite
import pytest

from app import database
from app.database import get_devices_in_group, get_group, init_db

pytestmark = pytest.mark.asyncio


async def test_old_groups_table_gains_owners_without_losing_members(tmp_path, monkeypatch):
    path = str(tmp_path / "old.db")
    async with aiosqlite.connect(path) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.executescript("""
            CREATE TABLE groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#4CAF50'
            );
            CREATE TABLE device_groups (
                device_unique_id TEXT NOT NULL,
                group_id INTEGER NOT NULL,
                PRIMARY KEY (device_unique_id, group_id),
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );
            INSERT INTO groups (id, name) VALUES (1, 'Family');
            INSERT INTO device_groups VALUES ('ml360-first', 1);
            INSERT INTO device_groups VALUES ('ml360-second', 1);
        """)
        await db.commit()

    monkeypatch.setattr(database, "_DB_PATH", path)
    monkeypatch.setattr(database, "_DB_URI", False)
    await init_db()
    await init_db()  # idempotent

    group = await get_group(1)
    assert group["owner_unique_id"] == "ml360-first"
    assert await get_devices_in_group(1) == ["ml360-first", "ml360-second"]
    # Names are no longer unique.
    await database.create_group("Family", "#000000", owner_unique_id="ml360-other")
