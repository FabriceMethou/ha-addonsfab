"""Simple in-memory rate limiter for public endpoints."""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Token-bucket rate limiter keyed by client IP.

    Args:
        max_calls: Maximum number of calls allowed within ``window`` seconds.
        window: Time window in seconds.
    """

    def __init__(self, max_calls: int = 10, window: int = 60) -> None:
        self._max_calls = max_calls
        self._window = window
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def __call__(self, request: Request) -> None:
        ip = self._client_ip(request)
        now = time.monotonic()
        # Remove expired entries
        hits = [t for t in self._hits[ip] if now - t < self._window]
        if len(hits) >= self._max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests — please try again later",
            )
        hits.append(now)
        self._hits[ip] = hits


# Shared instances for public endpoints
provision_limiter = RateLimiter(max_calls=5, window=60)
crash_report_limiter = RateLimiter(max_calls=20, window=60)
