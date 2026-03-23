import aiosqlite
from app.config import settings

_DB_PATH = settings.db_path

CREATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS device_sessions (
    token             TEXT PRIMARY KEY,
    traccar_user_id   INTEGER NOT NULL,
    traccar_device_id INTEGER NOT NULL,
    traccar_email     TEXT NOT NULL,
    traccar_password  TEXT NOT NULL,
    display_name      TEXT NOT NULL,
    device_unique_id  TEXT NOT NULL UNIQUE,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def init_db() -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute(CREATE_SCHEMA)
        await db.commit()


async def upsert_session(
    token: str,
    traccar_user_id: int,
    traccar_device_id: int,
    traccar_email: str,
    traccar_password: str,
    display_name: str,
    device_unique_id: str,
) -> None:
    async with aiosqlite.connect(_DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO device_sessions
                (token, traccar_user_id, traccar_device_id, traccar_email,
                 traccar_password, display_name, device_unique_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_unique_id) DO UPDATE SET
                token             = excluded.token,
                traccar_user_id   = excluded.traccar_user_id,
                traccar_device_id = excluded.traccar_device_id,
                traccar_email     = excluded.traccar_email,
                traccar_password  = excluded.traccar_password,
                display_name      = excluded.display_name
            """,
            (token, traccar_user_id, traccar_device_id, traccar_email,
             traccar_password, display_name, device_unique_id),
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
