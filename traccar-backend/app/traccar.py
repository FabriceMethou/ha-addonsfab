import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
import websockets
import websockets.exceptions
from websockets.legacy.client import WebSocketClientProtocol

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0)


class TraccarError(Exception):
    """Raised when Traccar returns an unexpected error response."""


class TraccarClient:
    def __init__(self) -> None:
        self._base = settings.traccar_url
        self._admin_token = settings.traccar_admin_token

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------

    async def admin_session(self) -> httpx.AsyncClient:
        """Return an httpx client authenticated as the Traccar admin."""
        client = httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT)
        resp = await client.get("/api/session", params={"token": self._admin_token})
        if resp.status_code not in (200, 201):
            await client.aclose()
            raise TraccarError(f"Admin session failed: {resp.status_code} {resp.text}")
        client.headers.update({"Authorization": f"Bearer {self._admin_token}"})
        return client

    async def user_session(self, email: str, password: str) -> httpx.AsyncClient:
        """Return an httpx client authenticated as the given Traccar user."""
        client = httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT)
        resp = await client.post(
            "/api/session",
            data={"email": email, "password": password},
        )
        if resp.status_code not in (200, 201):
            await client.aclose()
            raise TraccarError(
                f"User session failed for {email}: {resp.status_code} {resp.text}"
            )
        return client

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def get_devices(self, client: httpx.AsyncClient) -> list[dict]:
        resp = await client.get("/api/devices")
        _raise_for_traccar(resp)
        return resp.json()

    async def get_positions(self, client: httpx.AsyncClient) -> list[dict]:
        resp = await client.get("/api/positions")
        _raise_for_traccar(resp)
        return resp.json()

    async def get_geofences(self, client: httpx.AsyncClient) -> list[dict]:
        resp = await client.get("/api/geofences")
        _raise_for_traccar(resp)
        return resp.json()

    async def get_events(
        self, client: httpx.AsyncClient, device_ids: list[int], hours: int
    ) -> list[dict]:
        now = datetime.now(timezone.utc)
        from_dt = (now - timedelta(hours=hours)).isoformat()
        to_dt = now.isoformat()
        params: dict[str, Any] = {"from": from_dt, "to": to_dt, "type": "allEvents"}
        for did in device_ids:
            params.setdefault("deviceId", [])
            if isinstance(params["deviceId"], list):
                params["deviceId"].append(did)
        resp = await client.get("/api/reports/events", params=params)
        _raise_for_traccar(resp)
        return resp.json()

    async def get_positions_history(
        self,
        client: httpx.AsyncClient,
        device_id: int,
        from_dt: str,
        to_dt: str,
    ) -> list[dict]:
        resp = await client.get(
            "/api/positions",
            params={"deviceId": device_id, "from": from_dt, "to": to_dt},
        )
        _raise_for_traccar(resp)
        return resp.json()

    async def get_users(self, client: httpx.AsyncClient) -> list[dict]:
        resp = await client.get("/api/users")
        _raise_for_traccar(resp)
        return resp.json()

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    async def create_user(
        self,
        client: httpx.AsyncClient,
        name: str,
        email: str,
        password: str,
    ) -> dict:
        resp = await client.post(
            "/api/users",
            json={
                "name": name,
                "email": email,
                "password": password,
                "readonly": True,
            },
        )
        _raise_for_traccar(resp)
        return resp.json()

    async def update_user_email(
        self,
        client: httpx.AsyncClient,
        user: dict,
        new_email: str,
    ) -> dict:
        updated = {**user, "email": new_email}
        resp = await client.put(f"/api/users/{user['id']}", json=updated)
        _raise_for_traccar(resp)
        return resp.json()

    async def create_device(
        self,
        client: httpx.AsyncClient,
        name: str,
        unique_id: str,
    ) -> dict:
        resp = await client.post(
            "/api/devices",
            json={"name": name, "uniqueId": unique_id, "category": "person"},
        )
        _raise_for_traccar(resp)
        return resp.json()

    async def update_device(
        self,
        client: httpx.AsyncClient,
        device: dict,
        unique_id: str,
    ) -> dict:
        updated = {**device, "uniqueId": unique_id}
        resp = await client.put(f"/api/devices/{device['id']}", json=updated)
        _raise_for_traccar(resp)
        return resp.json()

    async def link_permission(
        self,
        client: httpx.AsyncClient,
        user_id: int,
        device_id: int,
    ) -> None:
        """Link user to device. 400/409 are silently ignored (already linked).
        Any other error is raised so callers can retry."""
        resp = await client.post(
            "/api/permissions",
            json={"userId": user_id, "deviceId": device_id},
        )
        if resp.status_code in (400, 409):
            return  # already linked — fine
        _raise_for_traccar(resp)

    # ------------------------------------------------------------------
    # WebSocket
    # ------------------------------------------------------------------

    async def connect_websocket(
        self, email: str, password: str
    ) -> WebSocketClientProtocol:
        """Open a Traccar websocket authenticated as the given user."""
        # First obtain a session cookie via HTTP
        async with httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT) as http:
            resp = await http.post(
                "/api/session",
                data={"email": email, "password": password},
            )
            if resp.status_code not in (200, 201):
                raise TraccarError(
                    f"WS session auth failed for {email}: {resp.status_code}"
                )
            cookie_header = "; ".join(
                f"{k}={v}" for k, v in http.cookies.items()
            )

        ws_url = self._base.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/api/socket"
        extra_headers = {"Cookie": cookie_header} if cookie_header else {}
        return await websockets.connect(ws_url, extra_headers=extra_headers)

    async def connect_admin_websocket(self) -> WebSocketClientProtocol:
        """Open a Traccar websocket authenticated as the admin via token."""
        async with httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT) as http:
            resp = await http.get("/api/session", params={"token": self._admin_token})
            if resp.status_code not in (200, 201):
                raise TraccarError(f"Admin WS session failed: {resp.status_code}")
            cookie_header = "; ".join(f"{k}={v}" for k, v in http.cookies.items())
        ws_url = self._base.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/api/socket"
        extra_headers = {"Cookie": cookie_header} if cookie_header else {}
        return await websockets.connect(ws_url, extra_headers=extra_headers)


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

def _raise_for_traccar(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    if 400 <= resp.status_code < 500:
        logger.warning("Traccar 4xx: %s %s", resp.status_code, resp.text[:200])
        raise TraccarError(f"Traccar client error {resp.status_code}")
    logger.error("Traccar 5xx: %s %s", resp.status_code, resp.text[:200])
    raise TraccarError(f"Traccar server error {resp.status_code}")


traccar = TraccarClient()
