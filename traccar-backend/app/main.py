import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.database import init_db
from app.routers import crash_report, events, family, places, provision, route, stream, groups, wifi_mappings
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
    task = asyncio.create_task(ws_reader_loop())
    logger.info("Admin WebSocket reader started")
    yield
    logger.info("Shutting down")
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="MyLife360 Backend", lifespan=lifespan)

app.include_router(provision.router)
app.include_router(family.router)
app.include_router(places.router)
app.include_router(events.router)
app.include_router(route.router)
app.include_router(stream.router)
app.include_router(groups.router)
app.include_router(wifi_mappings.router)
app.include_router(crash_report.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
