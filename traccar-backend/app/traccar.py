import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from websockets.asyncio.client import ClientConnection, connect

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0)
# Reports are computed from raw history on request; a week of positions can
# take Traccar well past the ordinary timeout. Kept under the app's own
# 30-second limit, so the phone always gets an answer.
_REPORT_TIMEOUT = httpx.Timeout(25.0)
# Traccar computes reports from positions only up to a day; see get_max_speed.
_SLOW_REPORT_SPAN = timedelta(hours=24)


def _iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
_KNOTS_PER_KMH = 1 / 1.852


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
        """Return an httpx client authenticated with the configured token."""
        client = httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT)
        resp = await client.get("/api/session", params={"token": self._admin_token})
        if resp.status_code not in (200, 201):
            await client.aclose()
            raise TraccarError(f"Admin session failed: {resp.status_code} {resp.text}")
        client.headers.update({"Authorization": f"Bearer {self._admin_token}"})
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
        params: dict[str, Any] = {
            "from": (now - timedelta(hours=hours)).isoformat(),
            "to": now.isoformat(),
            "type": "allEvents",
            "deviceId": list(device_ids),
        }
        resp = await client.get("/api/reports/events", params=params)
        _raise_for_traccar(resp)
        return resp.json()

    async def geocode(self, client: httpx.AsyncClient, latitude: float, longitude: float) -> str | None:
        """Traccar's address for a point, if its geocoder is on. None otherwise."""
        resp = await client.get(
            "/api/server/geocode", params={"latitude": latitude, "longitude": longitude},
        )
        if not resp.is_success:
            return None
        text = resp.text.strip().strip('"')
        return text or None

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

    async def get_trips(
        self,
        client: httpx.AsyncClient,
        device_id: int,
        from_dt: str,
        to_dt: str,
    ) -> list[dict]:
        """Traccar's own trip segmentation, which it computes from its history."""
        resp = await client.get(
            "/api/reports/trips",
            params={"deviceId": device_id, "from": from_dt, "to": to_dt},
            headers={"Accept": "application/json"},
            timeout=_REPORT_TIMEOUT,
        )
        _raise_for_traccar(resp)
        try:
            trips = resp.json()
        except ValueError as exc:
            raise TraccarError(f"Traccar trip report was not JSON: {exc}") from exc
        if not isinstance(trips, list):
            raise TraccarError("Traccar trip report was not a list")
        return trips

    async def get_max_speed(
        self, client: httpx.AsyncClient, device_id: int, start: datetime, end: datetime,
    ) -> float | None:
        """Top speed between two times, in knots; None if Traccar cannot say.

        Traccar leaves the top speed at 0 in reports longer than its
        `report.fastThreshold` (a day by default): it then works from motion
        events instead of positions. Asked a day or less at a time, it reads
        the positions and the top speed is real.
        """
        top: float | None = None
        piece = start
        while piece < end:
            piece_end = min(piece + _SLOW_REPORT_SPAN, end)
            resp = await client.get(
                "/api/reports/summary",
                params={"deviceId": device_id, "from": _iso_z(piece), "to": _iso_z(piece_end)},
                headers={"Accept": "application/json"},
                timeout=_REPORT_TIMEOUT,
            )
            _raise_for_traccar(resp)
            try:
                rows = resp.json()
            except ValueError as exc:
                raise TraccarError(f"Traccar summary was not JSON: {exc}") from exc
            for row in rows if isinstance(rows, list) else []:
                speed = row.get("maxSpeed") if isinstance(row, dict) else None
                if isinstance(speed, (int, float)):
                    top = max(top or 0.0, float(speed))
            piece = piece_end
        return top

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

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

    async def create_geofence(
        self,
        client: httpx.AsyncClient,
        name: str,
        area: str,
    ) -> dict:
        """Create a geofence on Traccar. area should be a WKT string, e.g. CIRCLE(lat lon, radius)."""
        resp = await client.post("/api/geofences", json={"name": name, "area": area})
        _raise_for_traccar(resp)
        return resp.json()

    async def update_geofence(
        self,
        client: httpx.AsyncClient,
        geofence: dict,
        name: str,
        area: str,
    ) -> dict:
        updated = {**geofence, "name": name, "area": area}
        resp = await client.put(f"/api/geofences/{geofence['id']}", json=updated)
        _raise_for_traccar(resp)
        return resp.json()

    async def delete_geofence(
        self,
        client: httpx.AsyncClient,
        geofence_id: int,
    ) -> None:
        resp = await client.delete(f"/api/geofences/{geofence_id}")
        _raise_for_traccar(resp)

    async def link_geofence_to_device(
        self,
        client: httpx.AsyncClient,
        device_id: int,
        geofence_id: int,
    ) -> None:
        """Link geofence to device so Traccar's own reports know about it.

        400/409 are ignored (already linked); anything else raises.
        """
        resp = await client.post(
            "/api/permissions", json={"deviceId": device_id, "geofenceId": geofence_id}
        )
        if resp.status_code in (400, 409):
            return
        _raise_for_traccar(resp)

    # ------------------------------------------------------------------
    # Position forwarding
    # ------------------------------------------------------------------

    async def forward_osmand(
        self, http: httpx.AsyncClient, unique_id: str, pos: dict
    ) -> bool:
        """Hand one position to Traccar's OsmAnd listener on the LAN.

        Traccar stays the long-term history, as before; the phone just no
        longer talks to it over the internet.
        """
        params: dict[str, Any] = {
            "id": unique_id,
            "timestamp": int(pos["timestamp"]),
            "lat": pos["latitude"],
            "lon": pos["longitude"],
            "speed": round((pos.get("speed_kmh") or 0.0) * _KNOTS_PER_KMH, 3),
            "bearing": pos.get("course") or 0.0,
            "altitude": pos.get("altitude") or 0.0,
            "accuracy": pos.get("accuracy") or 0.0,
        }
        if pos.get("battery") is not None:
            params["batt"] = pos["battery"]
        if pos.get("charging"):
            params["charge"] = "true"
        if pos.get("alarm"):
            params["alarm"] = pos["alarm"]
        if pos.get("activity"):
            params["activity"] = pos["activity"]  # kept by Traccar as an attribute
        try:
            resp = await http.get(f"{settings.traccar_osmand_lan_url}/", params=params)
        except httpx.HTTPError as exc:
            logger.warning("OsmAnd forward failed: %s", exc)
            return False
        if not resp.is_success:
            logger.warning("OsmAnd forward rejected: %s", resp.status_code)
        return resp.is_success

    # ------------------------------------------------------------------
    # WebSocket
    # ------------------------------------------------------------------

    async def connect_admin_websocket(self) -> ClientConnection:
        """Open a Traccar websocket authenticated via the admin token."""
        async with httpx.AsyncClient(base_url=self._base, timeout=_TIMEOUT) as http:
            resp = await http.get("/api/session", params={"token": self._admin_token})
            if resp.status_code not in (200, 201):
                raise TraccarError(f"Admin WS session failed: {resp.status_code}")
            cookie_header = "; ".join(f"{k}={v}" for k, v in http.cookies.items())
        ws_url = self._base.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/api/socket"
        extra_headers = {"Cookie": cookie_header} if cookie_header else {}
        return await connect(ws_url, additional_headers=extra_headers)


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
