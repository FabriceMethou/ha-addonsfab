import os
from urllib.parse import urlsplit


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw or raw == "null":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _osmand_lan_url(traccar_url: str) -> str:
    """Traccar's OsmAnd listener on the same host as its API, port 5055.

    The backend forwards every position there over the LAN, so the public
    OsmAnd address can be closed. Overridable when Traccar listens elsewhere.
    """
    explicit = os.environ.get("TRACCAR_OSMAND_LAN_URL", "").strip()
    if explicit and explicit != "null":
        return explicit.rstrip("/")
    host = urlsplit(traccar_url).hostname or "localhost"
    return f"http://{host}:5055"


class Settings:
    traccar_url: str = os.environ.get("TRACCAR_URL", "http://localhost:8082").rstrip("/")
    traccar_osmand_lan_url: str = _osmand_lan_url(traccar_url)
    traccar_admin_token: str = os.environ.get("TRACCAR_ADMIN_TOKEN", "")
    db_path: str = os.environ.get("DB_PATH", "/data/mylife360.db")
    # Shared secret a device must present to enrol. Empty means "not configured",
    # and enrolment is refused outright rather than left open.
    enrolment_code: str = os.environ.get("ENROLMENT_CODE", "")
    log_level: str = os.environ.get("LOG_LEVEL", "INFO").lower()
    speeding_limit_kmh: int = _env_int("SPEEDING_LIMIT_KMH", 130)
    low_battery_percent: int = _env_int("LOW_BATTERY_PERCENT", 15)
    # Where the add-on reads app updates from (the HA "share" folder).
    apk_dir: str = os.environ.get("APK_DIR", "/share/mylife360")


settings = Settings()
