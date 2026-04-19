from fastapi import HTTPException, status

from app.traccar import TraccarError


def http_error_from_traccar(exc: TraccarError) -> None:
    """Convert a TraccarError to an appropriate HTTP exception.

    4xx (client errors from Traccar) → 502 Bad Gateway
    Everything else (5xx)            → 503 Service Unavailable
    """
    msg = str(exc)
    if "client error" in msg:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=msg)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg)
