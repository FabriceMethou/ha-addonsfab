"""Refuse app versions too old to work with this backend (finding I-05).

The app sends its version in every request. Phones older than
MIN_APP_VERSION get 426 with a message asking them to update, instead of
failing in ways nobody can explain. Requests without the header (the app
before 1.2.4, the admin page, monitoring) are let through.
"""
from fastapi import Request
from fastapi.responses import JSONResponse

MIN_APP_VERSION = "1.2.0"
HEADER = "x-mylife360-version"


def parse_version(value: str) -> tuple[int, ...]:
    parts = []
    for piece in value.split("-")[0].split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def is_supported(version: str, minimum: str = MIN_APP_VERSION) -> bool:
    return parse_version(version) >= parse_version(minimum)


# An app too old for everything else must still be able to fetch its update.
EXEMPT_PREFIXES = ("/app/", "/health", "/crash-report")


async def require_supported_app(request: Request, call_next):
    version = request.headers.get(HEADER)
    if version and not is_supported(version) and not request.url.path.startswith(EXEMPT_PREFIXES):
        return JSONResponse(
            status_code=426,
            content={"detail": "This version of MyLife360 is too old. Please update the app."},
        )
    return await call_next(request)
