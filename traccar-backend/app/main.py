import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI

from app.config import settings
from app import engine, forwarder
from app.database import init_db, prune_alerts, utcnow
from app.versions import require_supported_app
from app.routers import (
    admin, alerts, app_update, crash_report, devices, driving, family, groups, places, positions,
    provision, route, stream, wifi_mappings,
)
from app.routers.stream import ws_reader_loop

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initialising database at %s", settings.db_path)
    await init_db()
    logger.info("Database ready")
    tasks = [
        asyncio.create_task(ws_reader_loop()),
        asyncio.create_task(_housekeeping()),
        asyncio.create_task(forwarder.run()),
        asyncio.create_task(_watch_silent_phones()),
    ]
    logger.info("Admin WebSocket reader started")
    yield
    logger.info("Shutting down")
    for task in tasks:
        task.cancel()
    for task in tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass


ALERT_RETENTION = timedelta(days=30)


async def _watch_silent_phones() -> None:
    while True:
        await asyncio.sleep(300)
        try:
            await engine.check_silent_devices()
        except Exception:  # noqa: BLE001
            logger.exception("Checking for silent phones failed")


async def _housekeeping() -> None:
    """Alerts and driving events are working data; Traccar keeps the history."""
    while True:
        try:
            await prune_alerts(utcnow() - ALERT_RETENTION)
        except Exception:  # noqa: BLE001 — never let housekeeping kill the app
            logger.exception("Pruning old alerts failed")
        await asyncio.sleep(6 * 3600)


app = FastAPI(title="MyLife360 Backend", lifespan=lifespan)
app.middleware("http")(require_supported_app)

for module in (
    provision, family, places, route, stream, groups, wifi_mappings, crash_report,
    positions, alerts, driving, devices, app_update, admin,
):
    app.include_router(module.router)


@app.get("/health")
async def health() -> dict:
    """For monitoring: "degraded" when Traccar is not taking positions."""
    return await forwarder.health()
