"""App updates served from Home Assistant's share folder.

Drop a release APK into /share/mylife360/ (its name must keep the version,
as Android Studio's release build names it: mylife360-<name>-<code>-...apk)
and every phone offers the update on its next start.
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


def latest_apk(directory: str | None = None) -> dict | None:
    folder = Path(directory or settings.apk_dir)
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
