import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.rate_limit import crash_report_global_limiter, crash_report_limiter

logger = logging.getLogger(__name__)
router = APIRouter()


class CrashReport(BaseModel):
    # Sizes are capped: the endpoint accepts reports from phones that have
    # not enrolled yet, so it must not become a way to flood the log (S-07).
    device_unique_id: Optional[str] = Field(None, max_length=64)
    display_name: Optional[str] = Field(None, max_length=64)
    app_version: Optional[str] = Field(None, max_length=32)
    android_version: Optional[str] = Field(None, max_length=32)
    device_model: Optional[str] = Field(None, max_length=64)
    error_type: str = Field(..., max_length=200)
    error_message: str = Field(..., max_length=2000)
    stacktrace: Optional[str] = Field(None, max_length=20_000)
    logcat: Optional[str] = Field(None, max_length=20_000)
    screen: Optional[str] = Field(None, max_length=64)
    extra: Optional[dict] = None


@router.post("/crash-report", status_code=204,
             dependencies=[Depends(crash_report_limiter), Depends(crash_report_global_limiter)])
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
