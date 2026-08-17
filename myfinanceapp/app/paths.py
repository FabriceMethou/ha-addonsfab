"""
Single source of truth for every runtime data path.

Historically each module defaulted to a relative path — "data/finance.db",
"data/backups", "data/categorizer_model.pkl" — which Python resolves against
the *process working directory*. The same application therefore wrote its
database, its backups and its trained model to a different place depending on
where it happened to be launched from, scattering personal financial data
across the source tree.

Every path exported here is absolute. Modules must never rebuild a path from a
relative string.

Resolution order, most specific first:
  1. the path's own environment variable (DATABASE_PATH, BACKUP_DIR, ...)
  2. DATA_DIR / <name>
  3. <this package>/data/<name>
"""

import os
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parent


def _env_dir(name: str) -> Path | None:
    """Read an environment variable as an absolute directory path, if set."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def _env_file(name: str, default: Path) -> Path:
    """Read an environment variable as an absolute file path, else use default."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    return Path(raw).expanduser().resolve()


#: Root of all runtime state. In the Home Assistant add-on, run.sh points this
#: at /app/data, itself a symlink into the add-on's persistent /data volume.
DATA_DIR: Path = _env_dir("DATA_DIR") or (_PACKAGE_ROOT / "data").resolve()

DB_PATH: Path = _env_file("DATABASE_PATH", DATA_DIR / "finance.db")
BACKUP_DIR: Path = _env_dir("BACKUP_DIR") or (DATA_DIR / "backups")
MODEL_PATH: Path = _env_file("CATEGORIZER_MODEL_PATH", DATA_DIR / "categorizer_model.pkl")
ALERTS_CONFIG: Path = DATA_DIR / "alerts_config.json"
CLOUD_CONFIG: Path = DATA_DIR / "cloud_config.json"


def ensure_data_dirs() -> None:
    """Create the data directories. Safe to call repeatedly."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def describe() -> str:
    """Human-readable summary of resolved paths, for startup logs and scripts."""
    return "\n".join(
        f"  {label:<14} {value}"
        for label, value in (
            ("DATA_DIR", DATA_DIR),
            ("database", DB_PATH),
            ("backups", BACKUP_DIR),
            ("model", MODEL_PATH),
            ("alerts", ALERTS_CONFIG),
            ("cloud", CLOUD_CONFIG),
        )
    )


if __name__ == "__main__":
    print("Resolved runtime paths:")
    print(describe())
