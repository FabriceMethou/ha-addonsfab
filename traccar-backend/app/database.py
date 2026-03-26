import aiosqlite
from app.config import settings

_DB_PATH = settings.db_path

CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS device_sessions (
    token             TEXT PRIMARY KEY,
    traccar_device_id INTEGER NOT NULL,
    display_name      TEXT NOT NULL,
    device_unique_id  TEXT NOT NULL UNIQUE,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

CREATE_GROUPS = """
CREATE TABLE IF NOT EXISTS groups (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#4CAF50'
);
"""

CREATE_DEVICE_GROUPS = """
CREATE TABLE IF NOT EXISTS device_groups (
    device_unique_id TEXT NOT NULL,
    group_id         INTEGER NOT NULL,
    PRIMARY KEY (device_unique_id, group_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
"""

CREATE_WIFI_MAPPINGS = """
CREATE TABLE IF NOT EXISTS wifi_mappings (
    ssid     TEXT PRIMARY KEY,
    place_id INTEGER NOT NULL
);
"""


async def init_db() -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")

        # ------------------------------------------------------------------ #
        # Migration: detect old schema (has traccar_user_id, traccar_email,  #
        # traccar_password columns) and migrate to new slimmer schema.        #
        # ------------------------------------------------------------------ #
        async with db.execute("PRAGMA table_info(device_sessions)") as cur:
            columns = {row[1] async for row in cur}

        if "traccar_user_id" in columns or "traccar_email" in columns:
            # Create replacement table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS device_sessions_new (
                    token             TEXT PRIMARY KEY,
                    traccar_device_id INTEGER NOT NULL,
                    display_name      TEXT NOT NULL,
                    device_unique_id  TEXT NOT NULL UNIQUE,
                    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            # Copy rows that have the columns we still need
            await db.execute("""
                INSERT OR IGNORE INTO device_sessions_new
                    (token, traccar_device_id, display_name, device_unique_id, created_at)
                SELECT token, traccar_device_id, display_name, device_unique_id, created_at
                FROM device_sessions
            """)
            await db.execute("DROP TABLE device_sessions")
            await db.execute("ALTER TABLE device_sessions_new RENAME TO device_sessions")
        else:
            # Table doesn't exist yet — create it fresh
            await db.execute(CREATE_SESSIONS)

        await db.execute(CREATE_GROUPS)
        await db.execute(CREATE_DEVICE_GROUPS)
        await db.execute(CREATE_WIFI_MAPPINGS)
        await db.commit()


# ------------------------------------------------------------------
# Session helpers
# ------------------------------------------------------------------

async def upsert_session(
    token: str,
    traccar_device_id: int,
    display_name: str,
    device_unique_id: str,
) -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO device_sessions
                (token, traccar_device_id, display_name, device_unique_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(device_unique_id) DO UPDATE SET
                token             = excluded.token,
                traccar_device_id = excluded.traccar_device_id,
                display_name      = excluded.display_name
            """,
            (token, traccar_device_id, display_name, device_unique_id),
        )
        await db.commit()


async def get_session(token: str) -> dict | None:
    async with aiosqlite.connect(_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM device_sessions WHERE token = ?", (token,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


# ------------------------------------------------------------------
# Group helpers
# ------------------------------------------------------------------

async def list_groups() -> list[dict]:
    async with aiosqlite.connect(_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM groups ORDER BY name") as cur:
            return [dict(row) async for row in cur]


async def get_group(group_id: int) -> dict | None:
    async with aiosqlite.connect(_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def create_group(name: str, color: str) -> dict:
    async with aiosqlite.connect(_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO groups (name, color) VALUES (?, ?)", (name, color)
        )
        await db.commit()
        async with db.execute(
            "SELECT * FROM groups WHERE id = ?", (cur.lastrowid,)
        ) as sel:
            row = await sel.fetchone()
            return dict(row)


async def update_group(group_id: int, name: str, color: str) -> dict | None:
    async with aiosqlite.connect(_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            "UPDATE groups SET name = ?, color = ? WHERE id = ?",
            (name, color, group_id),
        )
        await db.commit()
        async with db.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def delete_group(group_id: int) -> bool:
    async with aiosqlite.connect(_DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM groups WHERE id = ?", (group_id,)
        )
        await db.commit()
        return cur.rowcount > 0


async def add_device_to_group(device_unique_id: str, group_id: int) -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            """
            INSERT OR IGNORE INTO device_groups (device_unique_id, group_id)
            VALUES (?, ?)
            """,
            (device_unique_id, group_id),
        )
        await db.commit()


async def remove_device_from_group(device_unique_id: str, group_id: int) -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute(
            "DELETE FROM device_groups WHERE device_unique_id = ? AND group_id = ?",
            (device_unique_id, group_id),
        )
        await db.commit()


async def get_groups_for_device(device_unique_id: str) -> list[int]:
    async with aiosqlite.connect(_DB_PATH) as db:
        async with db.execute(
            "SELECT group_id FROM device_groups WHERE device_unique_id = ?",
            (device_unique_id,),
        ) as cur:
            return [row[0] async for row in cur]


async def get_devices_in_group(group_id: int) -> list[str]:
    async with aiosqlite.connect(_DB_PATH) as db:
        async with db.execute(
            "SELECT device_unique_id FROM device_groups WHERE group_id = ?",
            (group_id,),
        ) as cur:
            return [row[0] async for row in cur]


async def get_traccar_ids_for_unique_ids(unique_ids: list[str]) -> list[int]:
    """Resolves device_unique_ids → traccar_device_id via the device_sessions table."""
    if not unique_ids:
        return []
    async with aiosqlite.connect(_DB_PATH) as db:
        placeholders = ",".join("?" for _ in unique_ids)
        async with db.execute(
            f"SELECT device_unique_id, traccar_device_id FROM device_sessions"
            f" WHERE device_unique_id IN ({placeholders})",
            unique_ids,
        ) as cur:
            id_map = {row[0]: row[1] async for row in cur}
    return [id_map[uid] for uid in unique_ids if uid in id_map]


# ------------------------------------------------------------------
# WiFi-to-place mapping helpers
# ------------------------------------------------------------------

async def list_wifi_mappings() -> list[dict]:
    async with aiosqlite.connect(_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT ssid, place_id FROM wifi_mappings") as cur:
            return [dict(row) async for row in cur]


async def upsert_wifi_mapping(ssid: str, place_id: int) -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO wifi_mappings (ssid, place_id) VALUES (?, ?)
            ON CONFLICT(ssid) DO UPDATE SET place_id = excluded.place_id
            """,
            (ssid, place_id),
        )
        await db.commit()


async def delete_wifi_mapping(ssid: str) -> bool:
    async with aiosqlite.connect(_DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM wifi_mappings WHERE ssid = ?", (ssid,)
        )
        await db.commit()
        return cur.rowcount > 0
