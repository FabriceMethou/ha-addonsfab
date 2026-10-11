"""App updates for the phones.

Two places are looked at, and the newest version in either wins:
- the APK shipped inside the add-on (app/apk/ in the repository, put there
  by MyLife360/release.sh): updating the add-on delivers the new app;
- Home Assistant's share folder, /share/mylife360/, for a release dropped
  in by hand.
The file name must keep the version, as the release build names it:
mylife360-<name>-<code>-...apk. Every phone offers the update on its next
start.
"""
import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.auth import require_session
from app.config import settings

router = APIRouter()

_APK = re.compile(r"mylife360[-_](?P<name>\d+(?:\.\d+)*)[-_](?P<code>\d+).*\.apk$", re.I)


def latest_apk(*directories: str) -> dict | None:
    """The newest release APK in [directories] (default: share and bundled)."""
    best = None
    for directory in directories or (settings.apk_dir, settings.bundled_apk_dir):
        found = _latest_in(Path(directory))
        if found and (best is None or found["version_code"] > best["version_code"]):
            best = found
    return best


def _latest_in(folder: Path) -> dict | None:
    if not folder.is_dir():
        return None
    best = None
    for entry in folder.iterdir():
        m = _APK.match(entry.name)
        if not m or not entry.is_file() or "beta" in entry.name.lower():
            continue
        candidate = {
            "version_code": int(m.group("code")),
            "version_name": m.group("name"),
            "size": entry.stat().st_size,
            "path": str(entry),
        }
        if best is None or candidate["version_code"] > best["version_code"]:
            best = candidate
    return best


@router.get("/app/latest")
async def app_latest(session: dict = Depends(require_session)) -> dict:
    apk = latest_apk()
    if apk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No app release published")
    return {k: v for k, v in apk.items() if k != "path"}


@router.get("/app/apk")
async def app_apk(session: dict = Depends(require_session)) -> FileResponse:
    apk = latest_apk()
    if apk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No app release published")
    return FileResponse(
        apk["path"],
        media_type="application/vnd.android.package-archive",
        filename=os.path.basename(apk["path"]),
    )
