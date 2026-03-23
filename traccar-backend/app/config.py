import os


class Settings:
    traccar_url: str = os.environ.get("TRACCAR_URL", "http://localhost:8082").rstrip("/")
    traccar_admin_token: str = os.environ.get("TRACCAR_ADMIN_TOKEN", "")
    traccar_admin_user_id: int = int(os.environ.get("TRACCAR_ADMIN_USER_ID", "1"))
    db_path: str = os.environ.get("DB_PATH", "/data/mylife360.db")
    log_level: str = os.environ.get("LOG_LEVEL", "INFO").lower()


settings = Settings()
