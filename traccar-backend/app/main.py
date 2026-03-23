import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.database import init_db
from app.routers import events, family, places, provision, stream

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
    yield
    logger.info("Shutting down")


app = FastAPI(title="MyLife360 Backend", lifespan=lifespan)

app.include_router(provision.router)
app.include_router(family.router)
app.include_router(places.router)
app.include_router(events.router)
app.include_router(stream.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
