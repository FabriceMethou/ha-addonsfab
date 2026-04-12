import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class CrashReport(BaseModel):
    device_unique_id: Optional[str] = None
    display_name: Optional[str] = None
    app_version: Optional[str] = None
    android_version: Optional[str] = None
    device_model: Optional[str] = None
    error_type: str
    error_message: str
    stacktrace: Optional[str] = None
    logcat: Optional[str] = None
    screen: Optional[str] = None
    extra: Optional[dict] = None


@router.post("/crash-report", status_code=204)
async def crash_report(report: CrashReport, request: Request) -> None:
    client_ip = request.headers.get(
        "x-forwarded-for", request.client.host if request.client else "unknown"
    )
    logger.error(
        "APP CRASH REPORT — user=%s  device=%s  ip=%s  app=%s  android=%s  model=%s  "
        "screen=%s  error=%s: %s",
        report.display_name,
        report.device_unique_id,
        client_ip,
        report.app_version,
        report.android_version,
        report.device_model,
        report.screen,
        report.error_type,
        report.error_message,
    )
    if report.stacktrace:
        logger.error("STACKTRACE:\n%s", report.stacktrace)
    if report.logcat:
        logger.error("LOGCAT:\n%s", report.logcat)
    if report.extra:
        logger.error("EXTRA: %s", report.extra)
