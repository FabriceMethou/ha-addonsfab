import hashlib
import json
from datetime import datetime, timedelta, timezone

import aiosqlite
from app.config import settings

_DB_PATH = settings.db_path
_DB_URI = _DB_PATH.startswith("file:") or "?" in _DB_PATH


def _connect() -> aiosqlite.Connection:
    return aiosqlite.connect(_DB_PATH, uri=_DB_URI)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def hash_token(token: str) -> str:
    """Tokens are stored hashed, so a copy of the database (or of a Home
    Assistant backup) cannot be used to act as a family phone."""
    return hashlib.sha256(token.encode()).hexdigest()


CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS device_sessions (
    token             TEXT PRIMARY KEY,
    traccar_device_id INTEGER NOT NULL,
    display_name      TEXT NOT NULL,
    device_unique_id  TEXT NOT NULL UNIQUE,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

# Circle names are not unique: every member may create circles, and two
# families both calling theirs "Family" must not collide.
CREATE_GROUPS = """
CREATE TABLE IF NOT EXISTS groups (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '#4CAF50',
    owner_unique_id TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE_GROUP_INVITES = """
CREATE TABLE IF NOT EXISTS group_invites (
    code       TEXT PRIMARY KEY,
    group_id   INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
"""

# A place (Traccar geofence) belongs to at most one circle. Geofences with no
# row here predate circles and stay visible to everyone.
CREATE_PLACE_GROUPS = """
CREATE TABLE IF NOT EXISTS place_groups (
    place_id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL
);
"""

CREATE_TRANSFER_CODES = """
CREATE TABLE IF NOT EXISTS transfer_codes (
    code              TEXT PRIMARY KEY,
    traccar_device_id INTEGER NOT NULL,
    device_unique_id  TEXT NOT NULL,
    expires_at        TEXT NOT NULL
);
"""

# group_id 0 means "legacy, unscoped": rows that predate circle scoping.
# They stay visible to everyone rather than vanishing on upgrade.
CREATE_WIFI_MAPPINGS = """
CREATE TABLE IF NOT EXISTS wifi_mappings (
    ssid     TEXT NOT NULL,
    group_id INTEGER NOT NULL DEFAULT 0,
    place_id INTEGER NOT NULL,
    PRIMARY KEY (ssid, group_id)
);
"""

CREATE_DEVICE_STATE = """
CREATE TABLE IF NOT EXISTS device_state (
    device_id         INTEGER PRIMARY KEY,
    last_fix_time     TEXT,
    last_latitude     REAL,
    last_longitude    REAL,
    last_speed_kmh    REAL,
    last_battery      REAL,
    last_charging     INTEGER,
    low_battery_armed INTEGER NOT NULL DEFAULT 1,
    flight_state      TEXT NOT NULL DEFAULT 'ground',
    flight_count      INTEGER NOT NULL DEFAULT 0,
    sharing           TEXT NOT NULL DEFAULT 'active',
    status_json       TEXT,
    status_at         TEXT
);
"""

CREATE_PLACE_PRESENCE = """
CREATE TABLE IF NOT EXISTS place_presence (
    device_id INTEGER NOT NULL,
    place_id  INTEGER NOT NULL,
    inside    INTEGER NOT NULL,
    since     TEXT NOT NULL,
    PRIMARY KEY (device_id, place_id)
);
"""

CREATE_ALERTS = """
CREATE TABLE IF NOT EXISTS alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    kind       TEXT NOT NULL,
    severity   TEXT NOT NULL,
    device_id  INTEGER NOT NULL,
    group_id   INTEGER,
    place_id   INTEGER,
    place_name TEXT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    latitude   REAL,
    longitude  REAL
);
"""

# Positions waiting to be written to Traccar's history. Detection runs as
# soon as a position arrives; Traccar being down only delays the history.
# Rows are kept a week after forwarding so a re-sent batch is recognised.
CREATE_TRACCAR_OUTBOX = """
CREATE TABLE IF NOT EXISTS traccar_outbox (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER NOT NULL,
    unique_id    TEXT NOT NULL,
    timestamp    INTEGER NOT NULL,
    latitude     REAL NOT NULL,
    longitude    REAL NOT NULL,
    payload      TEXT NOT NULL,
    backfill     INTEGER NOT NULL DEFAULT 0,
    forwarded_at TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE (unique_id, timestamp, latitude, longitude)
);
"""

CREATE_DRIVING_EVENTS = """
CREATE TABLE IF NOT EXISTS driving_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  INTEGER NOT NULL,
    kind       TEXT NOT NULL,
    event_time TEXT NOT NULL,
    speed_kmh  REAL,
    latitude   REAL,
    longitude  REAL,
    value      REAL
);
"""


async def _columns(db: aiosqlite.Connection, table: str) -> set[str]:
    async with db.execute(f"PRAGMA table_info({table})") as cur:
        return {row[1] async for row in cur}


async def init_db() -> None:
    async with _connect() as db:
        # Rebuilding a parent table must not cascade-delete its children.
        await db.execute("PRAGMA foreign_keys = OFF")

        # Migration: old session schema carried Traccar user credentials.
        columns = await _columns(db, "device_sessions")
        if "traccar_user_id" in columns or "traccar_email" in columns:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS device_sessions_new (
                    token             TEXT PRIMARY KEY,
                    traccar_device_id INTEGER NOT NULL,
                    display_name      TEXT NOT NULL,
                    device_unique_id  TEXT NOT NULL UNIQUE,
                    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            await db.execute("""
                INSERT OR IGNORE INTO device_sessions_new
                    (token, traccar_device_id, display_name, device_unique_id, created_at)
                SELECT token, traccar_device_id, display_name, device_unique_id, created_at
                FROM device_sessions
            """)
            await db.execute("DROP TABLE device_sessions")
            await db.execute("ALTER TABLE device_sessions_new RENAME TO device_sessions")
        else:
            await db.execute(CREATE_SESSIONS)

        # Migration: circles gained an owner and lost their unique name.
        group_columns = await _columns(db, "groups")
        if group_columns and "owner_unique_id" not in group_columns:
            await db.execute("""
                CREATE TABLE groups_new (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    name            TEXT NOT NULL,
                    color           TEXT NOT NULL DEFAULT '#4CAF50',
                    owner_unique_id TEXT,
                    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            await db.execute(
                "INSERT INTO groups_new (id, name, color) SELECT id, name, color FROM groups"
            )
            await db.execute("DROP TABLE groups")
            await db.execute("ALTER TABLE groups_new RENAME TO groups")
        else:
            await db.execute(CREATE_GROUPS)

        await db.execute(CREATE_DEVICE_GROUPS)
        # Circles that predate ownership: their first member becomes owner.
        await db.execute("""
            UPDATE groups SET owner_unique_id = (
                SELECT device_unique_id FROM device_groups dg
                WHERE dg.group_id = groups.id ORDER BY dg.rowid LIMIT 1
            ) WHERE owner_unique_id IS NULL
        """)

        await db.execute(CREATE_WIFI_MAPPINGS)
        # Migration: wifi_mappings gained a group_id (finding C-08).
        wifi_columns = await _columns(db, "wifi_mappings")
        if wifi_columns and "group_id" not in wifi_columns:
            await db.execute("""
                CREATE TABLE wifi_mappings_new (
                    ssid     TEXT NOT NULL,
                    group_id INTEGER NOT NULL DEFAULT 0,
                    place_id INTEGER NOT NULL,
                    PRIMARY KEY (ssid, group_id)
                )
            """)
            await db.execute(
                "INSERT OR IGNORE INTO wifi_mappings_new (ssid, group_id, place_id)"
                " SELECT ssid, 0, place_id FROM wifi_mappings"
            )
            await db.execute("DROP TABLE wifi_mappings")
            await db.execute("ALTER TABLE wifi_mappings_new RENAME TO wifi_mappings")

        for ddl in (
            CREATE_GROUP_INVITES,
            CREATE_PLACE_GROUPS,
            CREATE_TRANSFER_CODES,
            CREATE_DEVICE_STATE,
            CREATE_PLACE_PRESENCE,
            CREATE_ALERTS,
            CREATE_DRIVING_EVENTS,
            CREATE_TRACCAR_OUTBOX,
        ):
            await db.execute(ddl)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_outbox_pending ON traccar_outbox(forwarded_at, id)"
        )

        # Columns added after 1.2.0.
        if "phone" not in await _columns(db, "device_sessions"):
            await db.execute("ALTER TABLE device_sessions ADD COLUMN phone TEXT")
        if "last_mock" not in await _columns(db, "device_state"):
            await db.execute("ALTER TABLE device_state ADD COLUMN last_mock INTEGER NOT NULL DEFAULT 0")
        if "last_seen_at" not in await _columns(db, "device_state"):
            await db.execute("ALTER TABLE device_state ADD COLUMN last_seen_at TEXT")

        # Tokens stored before 1.2.4 are in clear (UUIDs, 36 characters):
        # replace each with its hash. Phones keep working unchanged.
        async with db.execute(
            "SELECT token FROM device_sessions WHERE length(token) != 64"
        ) as cur:
            clear_tokens = [row[0] async for row in cur]
        for token in clear_tokens:
            await db.execute(
                "UPDATE device_sessions SET token = ? WHERE token = ?", (hash_token(token), token)
            )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_driving_device ON driving_events(device_id, event_time)"
        )

        await db.commit()
        await db.execute("PRAGMA foreign_keys = ON")


# ------------------------------------------------------------------
# Session helpers
# ------------------------------------------------------------------

async def upsert_session(
    token: str,
    traccar_device_id: int,
    display_name: str,
    device_unique_id: str,
) -> None:
    async with _connect() as db:
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
            (hash_token(token), traccar_device_id, display_name, device_unique_id),
        )
        await db.commit()


async def get_session(token: str) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM device_sessions WHERE token = ?", (hash_token(token),)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_session_by_device_id(traccar_device_id: int) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM device_sessions WHERE traccar_device_id = ?"
            " ORDER BY created_at DESC LIMIT 1",
            (traccar_device_id,),
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def list_sessions() -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM device_sessions") as cur:
            return [dict(row) async for row in cur]


async def set_phone_number(device_unique_id: str, phone: str | None) -> None:
    async with _connect() as db:
        await db.execute(
            "UPDATE device_sessions SET phone = ? WHERE device_unique_id = ?", (phone, device_unique_id)
        )
        await db.commit()


async def revoke_device(traccar_device_id: int) -> int:
    """Cut a phone off: its token, circle memberships and transfer codes go.

    Returns how many enrolments were removed (a device enrolled once, normally).
    """
    async with _connect() as db:
        async with db.execute(
            "SELECT device_unique_id FROM device_sessions WHERE traccar_device_id = ?",
            (traccar_device_id,),
        ) as cur:
            unique_ids = [row[0] async for row in cur]
        for uid in unique_ids:
            await db.execute("DELETE FROM device_groups WHERE device_unique_id = ?", (uid,))
            await db.execute("UPDATE groups SET owner_unique_id = NULL WHERE owner_unique_id = ?", (uid,))
        await db.execute("DELETE FROM transfer_codes WHERE traccar_device_id = ?", (traccar_device_id,))
        await db.execute("DELETE FROM device_sessions WHERE traccar_device_id = ?", (traccar_device_id,))
        await db.commit()
        return len(unique_ids)


async def delete_session_for_unique_id(device_unique_id: str) -> None:
    async with _connect() as db:
        await db.execute(
            "DELETE FROM device_sessions WHERE device_unique_id = ?", (device_unique_id,)
        )
        await db.commit()


# ------------------------------------------------------------------
# Circle helpers
# ------------------------------------------------------------------

async def list_groups() -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM groups ORDER BY name") as cur:
            return [dict(row) async for row in cur]


async def list_groups_for_device(device_unique_id: str) -> list[dict]:
    """Circles the device belongs to, with its role and the member count."""
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT g.*, (SELECT COUNT(*) FROM device_groups c WHERE c.group_id = g.id)
                   AS member_count
            FROM groups g JOIN device_groups dg ON dg.group_id = g.id
            WHERE dg.device_unique_id = ?
            ORDER BY g.name
            """,
            (device_unique_id,),
        ) as cur:
            return [dict(row) async for row in cur]


async def get_group(group_id: int) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def create_group(name: str, color: str, owner_unique_id: str | None = None) -> dict:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO groups (name, color, owner_unique_id) VALUES (?, ?, ?)",
            (name, color, owner_unique_id),
        )
        if owner_unique_id:
            await db.execute(
                "INSERT OR IGNORE INTO device_groups (device_unique_id, group_id)"
                " VALUES (?, ?)",
                (owner_unique_id, cur.lastrowid),
            )
        await db.commit()
        async with db.execute(
            "SELECT * FROM groups WHERE id = ?", (cur.lastrowid,)
        ) as sel:
            row = await sel.fetchone()
            return dict(row)


async def update_group(group_id: int, name: str, color: str) -> dict | None:
    async with _connect() as db:
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


async def set_group_owner(group_id: int, owner_unique_id: str | None) -> None:
    async with _connect() as db:
        await db.execute(
            "UPDATE groups SET owner_unique_id = ? WHERE id = ?", (owner_unique_id, group_id)
        )
        await db.commit()


async def delete_group(group_id: int) -> bool:
    """Delete a circle and everything scoped to it.

    Dependent rows are removed explicitly: foreign keys are off on ordinary
    connections, so ON DELETE CASCADE alone would leave orphans behind.
    """
    async with _connect() as db:
        for table in ("device_groups", "group_invites", "place_groups", "wifi_mappings"):
            await db.execute(f"DELETE FROM {table} WHERE group_id = ?", (group_id,))
        cur = await db.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        await db.commit()
        return cur.rowcount > 0


async def add_device_to_group(device_unique_id: str, group_id: int) -> None:
    async with _connect() as db:
        await db.execute(
            """
            INSERT OR IGNORE INTO device_groups (device_unique_id, group_id)
            VALUES (?, ?)
            """,
            (device_unique_id, group_id),
        )
        await db.commit()


async def remove_device_from_group(device_unique_id: str, group_id: int) -> None:
    async with _connect() as db:
        await db.execute(
            "DELETE FROM device_groups WHERE device_unique_id = ? AND group_id = ?",
            (device_unique_id, group_id),
        )
        await db.commit()


async def get_groups_for_device(device_unique_id: str) -> list[int]:
    async with _connect() as db:
        async with db.execute(
            "SELECT group_id FROM device_groups WHERE device_unique_id = ?",
            (device_unique_id,),
        ) as cur:
            return [row[0] async for row in cur]


async def get_devices_in_group(group_id: int) -> list[str]:
    async with _connect() as db:
        async with db.execute(
            "SELECT device_unique_id FROM device_groups WHERE group_id = ? ORDER BY rowid",
            (group_id,),
        ) as cur:
            return [row[0] async for row in cur]


async def rename_device_in_groups(old_unique_id: str, new_unique_id: str) -> None:
    async with _connect() as db:
        await db.execute(
            "UPDATE OR IGNORE device_groups SET device_unique_id = ? WHERE device_unique_id = ?",
            (new_unique_id, old_unique_id),
        )
        await db.execute(
            "DELETE FROM device_groups WHERE device_unique_id = ?", (old_unique_id,)
        )
        await db.execute(
            "UPDATE groups SET owner_unique_id = ? WHERE owner_unique_id = ?",
            (new_unique_id, old_unique_id),
        )
        await db.commit()


async def get_traccar_ids_for_unique_ids(unique_ids: list[str]) -> list[int]:
    """Resolves device_unique_ids → traccar_device_id via the device_sessions table."""
    if not unique_ids:
        return []
    async with _connect() as db:
        placeholders = ",".join("?" for _ in unique_ids)
        async with db.execute(
            f"SELECT device_unique_id, traccar_device_id FROM device_sessions"
            f" WHERE device_unique_id IN ({placeholders})",
            unique_ids,
        ) as cur:
            id_map = {row[0]: row[1] async for row in cur}
    return [id_map[uid] for uid in unique_ids if uid in id_map]


# ------------------------------------------------------------------
# Invitations and transfer codes
# ------------------------------------------------------------------

async def create_invite(code: str, group_id: int, created_by: str, expires_at: datetime) -> None:
    async with _connect() as db:
        await db.execute(
            "INSERT INTO group_invites (code, group_id, created_by, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (code, group_id, created_by, iso(expires_at)),
        )
        await db.commit()


async def get_valid_invite(code: str) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        await db.execute("DELETE FROM group_invites WHERE expires_at < ?", (iso(utcnow()),))
        await db.commit()
        async with db.execute("SELECT * FROM group_invites WHERE code = ?", (code,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def create_transfer_code(
    code: str, traccar_device_id: int, device_unique_id: str, expires_at: datetime
) -> None:
    async with _connect() as db:
        await db.execute(
            "DELETE FROM transfer_codes WHERE traccar_device_id = ?", (traccar_device_id,)
        )
        await db.execute(
            "INSERT INTO transfer_codes (code, traccar_device_id, device_unique_id, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (code, traccar_device_id, device_unique_id, iso(expires_at)),
        )
        await db.commit()


async def consume_transfer_code(code: str) -> dict | None:
    """Return and delete a live transfer code; single use."""
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        await db.execute("DELETE FROM transfer_codes WHERE expires_at < ?", (iso(utcnow()),))
        async with db.execute("SELECT * FROM transfer_codes WHERE code = ?", (code,)) as cur:
            row = await cur.fetchone()
        if row is not None:
            await db.execute("DELETE FROM transfer_codes WHERE code = ?", (code,))
        await db.commit()
        return dict(row) if row else None


# ------------------------------------------------------------------
# Places
# ------------------------------------------------------------------

async def get_place_groups() -> dict[int, int]:
    async with _connect() as db:
        async with db.execute("SELECT place_id, group_id FROM place_groups") as cur:
            return {row[0]: row[1] async for row in cur}


async def set_place_group(place_id: int, group_id: int) -> None:
    async with _connect() as db:
        await db.execute(
            "INSERT INTO place_groups (place_id, group_id) VALUES (?, ?)"
            " ON CONFLICT(place_id) DO UPDATE SET group_id = excluded.group_id",
            (place_id, group_id),
        )
        await db.commit()


async def delete_place_rows(place_id: int) -> None:
    async with _connect() as db:
        for table in ("place_groups", "place_presence", "wifi_mappings"):
            await db.execute(f"DELETE FROM {table} WHERE place_id = ?", (place_id,))
        await db.commit()


# ------------------------------------------------------------------
# WiFi-to-place mapping helpers
# ------------------------------------------------------------------

async def list_wifi_mappings_for_groups(group_ids: list[int]) -> list[dict]:
    """Mappings the caller may see: their circles', plus legacy unscoped ones."""
    scopes = [0, *group_ids]
    placeholders = ",".join("?" for _ in scopes)
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"SELECT ssid, group_id, place_id FROM wifi_mappings"
            f" WHERE group_id IN ({placeholders}) ORDER BY ssid",
            scopes,
        ) as cur:
            return [dict(row) async for row in cur]


async def upsert_wifi_mapping(ssid: str, place_id: int, group_id: int = 0) -> None:
    async with _connect() as db:
        await db.execute(
            """
            INSERT INTO wifi_mappings (ssid, group_id, place_id) VALUES (?, ?, ?)
            ON CONFLICT(ssid, group_id) DO UPDATE SET place_id = excluded.place_id
            """,
            (ssid, group_id, place_id),
        )
        await db.commit()


async def delete_wifi_mapping_for_groups(ssid: str, group_ids: list[int]) -> bool:
    """Delete only within the caller's reach — never across circles."""
    scopes = [0, *group_ids]
    placeholders = ",".join("?" for _ in scopes)
    async with _connect() as db:
        cur = await db.execute(
            f"DELETE FROM wifi_mappings WHERE ssid = ? AND group_id IN ({placeholders})",
            (ssid, *scopes),
        )
        await db.commit()
        return cur.rowcount > 0


# ------------------------------------------------------------------
# Detection state
# ------------------------------------------------------------------

async def get_device_state(device_id: int) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM device_state WHERE device_id = ?", (device_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_device_states() -> dict[int, dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM device_state") as cur:
            return {row["device_id"]: dict(row) async for row in cur}


async def save_device_state(state: dict) -> None:
    fields = [k for k in state if k != "device_id"]
    placeholders = ",".join("?" for _ in fields)
    updates = ",".join(f"{k} = excluded.{k}" for k in fields)
    async with _connect() as db:
        await db.execute(
            f"INSERT INTO device_state (device_id, {','.join(fields)})"
            f" VALUES (?, {placeholders})"
            f" ON CONFLICT(device_id) DO UPDATE SET {updates}",
            (state["device_id"], *[state[k] for k in fields]),
        )
        await db.commit()


async def get_presence(device_id: int) -> dict[int, dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM place_presence WHERE device_id = ?", (device_id,)
        ) as cur:
            return {row["place_id"]: dict(row) async for row in cur}


async def set_presence(device_id: int, place_id: int, inside: bool, since: str) -> None:
    async with _connect() as db:
        await db.execute(
            "INSERT INTO place_presence (device_id, place_id, inside, since) VALUES (?, ?, ?, ?)"
            " ON CONFLICT(device_id, place_id) DO UPDATE SET"
            " inside = excluded.inside, since = excluded.since",
            (device_id, place_id, int(inside), since),
        )
        await db.commit()


# ------------------------------------------------------------------
# Alerts and driving events
# ------------------------------------------------------------------

async def insert_alert(alert: dict) -> dict:
    fields = [
        "created_at", "kind", "severity", "device_id", "group_id", "place_id",
        "place_name", "title", "body", "latitude", "longitude",
    ]
    async with _connect() as db:
        cur = await db.execute(
            f"INSERT INTO alerts ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})",
            tuple(alert.get(f) for f in fields),
        )
        await db.commit()
        return {**{f: alert.get(f) for f in fields}, "id": cur.lastrowid}


async def recent_alert_exists(device_id: int, kind: str, place_id: int | None, since: datetime) -> bool:
    async with _connect() as db:
        async with db.execute(
            "SELECT 1 FROM alerts WHERE device_id = ? AND kind = ?"
            " AND IFNULL(place_id, -1) = IFNULL(?, -1) AND created_at >= ? LIMIT 1",
            (device_id, kind, place_id, iso(since)),
        ) as cur:
            return await cur.fetchone() is not None


async def list_alerts(device_ids: set[int], group_ids: set[int], since_id: int, limit: int) -> list[dict]:
    if not device_ids:
        return []
    ids = sorted(device_ids)
    groups = sorted(group_ids) or [-1]
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"SELECT * FROM alerts WHERE id > ?"
            f" AND device_id IN ({','.join('?' for _ in ids)})"
            f" AND (group_id IS NULL OR group_id IN ({','.join('?' for _ in groups)}))"
            f" ORDER BY id DESC LIMIT ?",
            (since_id, *ids, *groups, limit),
        ) as cur:
            return [dict(row) async for row in cur]


async def prune_alerts(older_than: datetime) -> None:
    async with _connect() as db:
        await db.execute("DELETE FROM alerts WHERE created_at < ?", (iso(older_than),))
        await db.execute("DELETE FROM driving_events WHERE event_time < ?", (iso(older_than),))
        await db.commit()


async def insert_driving_event(event: dict) -> None:
    fields = ["device_id", "kind", "event_time", "speed_kmh", "latitude", "longitude", "value"]
    async with _connect() as db:
        await db.execute(
            f"INSERT INTO driving_events ({','.join(fields)})"
            f" VALUES ({','.join('?' for _ in fields)})",
            tuple(event.get(f) for f in fields),
        )
        await db.commit()


async def last_driving_event(device_id: int, kind: str) -> dict | None:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM driving_events WHERE device_id = ? AND kind = ?"
            " ORDER BY event_time DESC LIMIT 1",
            (device_id, kind),
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_driving_events(device_id: int, since: datetime) -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM driving_events WHERE device_id = ? AND event_time >= ?"
            " ORDER BY event_time",
            (device_id, iso(since)),
        ) as cur:
            return [dict(row) async for row in cur]


def dump_status(status: dict | None) -> str | None:
    return json.dumps(status) if status is not None else None


def load_status(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def expiry(minutes: int) -> datetime:
    return utcnow() + timedelta(minutes=minutes)


# ------------------------------------------------------------------
# Traccar outbox
# ------------------------------------------------------------------

async def outbox_add(device_id: int, unique_id: str, pos: dict, backfill: bool) -> bool:
    """Queue a position for Traccar. False if this exact fix was queued before."""
    payload = json.dumps({k: v for k, v in pos.items() if k != "fix_time"})
    async with _connect() as db:
        cur = await db.execute(
            "INSERT OR IGNORE INTO traccar_outbox"
            " (device_id, unique_id, timestamp, latitude, longitude, payload, backfill, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (device_id, unique_id, int(pos["timestamp"]), pos["latitude"], pos["longitude"],
             payload, int(backfill), iso(utcnow())),
        )
        await db.commit()
        return cur.rowcount > 0


async def outbox_pending(limit: int) -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM traccar_outbox WHERE forwarded_at IS NULL ORDER BY id LIMIT ?", (limit,)
        ) as cur:
            return [dict(row) async for row in cur]


async def outbox_mark_forwarded(ids: list[int]) -> None:
    if not ids:
        return
    async with _connect() as db:
        await db.execute(
            f"UPDATE traccar_outbox SET forwarded_at = ? WHERE id IN ({','.join('?' for _ in ids)})",
            (iso(utcnow()), *ids),
        )
        await db.commit()


async def outbox_count() -> int:
    async with _connect() as db:
        async with db.execute("SELECT COUNT(*) FROM traccar_outbox WHERE forwarded_at IS NULL") as cur:
            return (await cur.fetchone())[0]


async def outbox_prune(older_than: datetime) -> None:
    async with _connect() as db:
        await db.execute(
            "DELETE FROM traccar_outbox WHERE forwarded_at IS NOT NULL AND forwarded_at < ?",
            (iso(older_than),),
        )
        await db.commit()


async def list_memberships() -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT device_unique_id, group_id FROM device_groups") as cur:
            return [dict(row) async for row in cur]


async def recent_alerts(limit: int) -> list[dict]:
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,)) as cur:
            return [dict(row) async for row in cur]
