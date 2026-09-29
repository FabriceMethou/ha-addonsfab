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


class GlobalLimiter:
    """A ceiling for everyone together, which a forged address cannot dodge."""

    def __init__(self, max_calls: int, window: int) -> None:
        self._max_calls = max_calls
        self._window = window
        self._hits: list[float] = []

    async def __call__(self) -> None:
        now = time.monotonic()
        self._hits = [t for t in self._hits if now - t < self._window]
        if len(self._hits) >= self._max_calls:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail="Too many reports — try again later")
        self._hits.append(now)

    def reset(self) -> None:
        self._hits.clear()


crash_report_global_limiter = GlobalLimiter(max_calls=60, window=3600)


class DeviceRateLimiter:
    """Limit calls per enrolled phone, keyed by its device id (finding S-10).

    Keyed on the token's device rather than an IP address, which a caller
    can claim freely.
    """

    def __init__(self, max_calls: int, window: int) -> None:
        self._max_calls = max_calls
        self._window = window
        self._hits: dict[int, list[float]] = defaultdict(list)

    def check(self, device_id: int) -> None:
        now = time.monotonic()
        hits = [t for t in self._hits[device_id] if now - t < self._window]
        if len(hits) >= self._max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests from this phone — slow down",
            )
        hits.append(now)
        self._hits[device_id] = hits

    def reset(self) -> None:
        self._hits.clear()
