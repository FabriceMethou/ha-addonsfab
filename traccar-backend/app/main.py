import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI

from app.config import settings
from app.database import init_db, prune_alerts, utcnow
from app.routers import (
    alerts, app_update, crash_report, devices, driving, family, groups, places, positions,
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
    tasks = [asyncio.create_task(ws_reader_loop()), asyncio.create_task(_housekeeping())]
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


async def _housekeeping() -> None:
    """Alerts and driving events are working data; Traccar keeps the history."""
    while True:
        try:
            await prune_alerts(utcnow() - ALERT_RETENTION)
        except Exception:  # noqa: BLE001 — never let housekeeping kill the app
            logger.exception("Pruning old alerts failed")
        await asyncio.sleep(6 * 3600)


app = FastAPI(title="MyLife360 Backend", lifespan=lifespan)

for module in (
    provision, family, places, route, stream, groups, wifi_mappings, crash_report,
    positions, alerts, driving, devices, app_update,
):
    app.include_router(module.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
