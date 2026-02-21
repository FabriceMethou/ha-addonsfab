"""
Traccar Panel — Python BFF (Backend For Frontend)
aiohttp server: session management, REST proxy, WebSocket relay, geocoding
Binds to 127.0.0.1:3001 only (unreachable outside the container).
"""
import asyncio
import json
import logging
import os
import time
from collections import OrderedDict

import aiohttp
from aiohttp import web, WSMsgType

logging.basicConfig(level=logging.INFO, format="%(asctime)s [bff] %(levelname)s %(message)s")
log = logging.getLogger("bff")

TRACCAR_URL = os.environ["TRACCAR_URL"].rstrip("/")
TRACCAR_USERNAME = os.environ["TRACCAR_USERNAME"]
TRACCAR_PASSWORD = os.environ["TRACCAR_PASSWORD"]

# ─── Session state ───────────────────────────────────────────────────────────

session_lock = asyncio.Lock()
jsessionid: str | None = None  # current valid cookie value

# ─── Geocoding cache ─────────────────────────────────────────────────────────

# LRU-style cache, keyed by rounded (lat, lon)
geo_cache: "OrderedDict[tuple, str]" = OrderedDict()
GEO_CACHE_MAX = 2000
geo_queue: asyncio.Queue = asyncio.Queue()  # items: (lat, lon, Future)
# rate limiter: 1 request per 1.1 seconds
_last_nominatim = 0.0

# ─── WebSocket clients ───────────────────────────────────────────────────────

ws_clients: set[web.WebSocketResponse] = set()

# ─── Session helpers ─────────────────────────────────────────────────────────


async def _do_auth(http: aiohttp.ClientSession) -> str | None:
    """POST to Traccar /api/session and return the JSESSIONID value, or None."""
    try:
        resp = await http.post(
            f"{TRACCAR_URL}/api/session",
            data={"email": TRACCAR_USERNAME, "password": TRACCAR_PASSWORD},
            allow_redirects=False,
        )
        if resp.status in (200, 201):
            for cookie in resp.cookies.values():
                if cookie.key == "JSESSIONID":
                    log.info("Traccar session established")
                    return cookie.value
            # Some versions put it in Set-Cookie header directly
            raw = resp.headers.get("Set-Cookie", "")
            for part in raw.split(";"):
                if part.strip().startswith("JSESSIONID="):
                    return part.strip().split("=", 1)[1]
            log.warning("Auth succeeded but no JSESSIONID cookie found")
        else:
            log.error("Auth failed: HTTP %s", resp.status)
    except Exception as exc:
        log.error("Auth error: %s", exc)
    return None


async def ensure_session(http: aiohttp.ClientSession) -> str | None:
    global jsessionid
    async with session_lock:
        if jsessionid:
            return jsessionid
        jsessionid = await _do_auth(http)
        return jsessionid


async def invalidate_session():
    global jsessionid
    async with session_lock:
        jsessionid = None
        log.info("Session invalidated — will re-auth on next request")


async def session_renewal_task(http: aiohttp.ClientSession):
    """Renew Traccar session every 25 minutes to avoid 30-min idle timeout."""
    while True:
        await asyncio.sleep(25 * 60)
        log.info("Renewing Traccar session...")
        async with session_lock:
            cookie = await _do_auth(http)
            if cookie:
                jsessionid = cookie
            else:
                jsessionid = None
                log.warning("Session renewal failed")


# ─── REST proxy ──────────────────────────────────────────────────────────────


async def proxy_api(request: web.Request) -> web.Response:
    http: aiohttp.ClientSession = request.app["http"]
    cookie = await ensure_session(http)
    if not cookie:
        return web.Response(status=503, text="Cannot authenticate with Traccar")

    # Strip the leading /api from the path so we can forward correctly
    path = request.match_info["path"]
    url = f"{TRACCAR_URL}/api/{path}"
    params = dict(request.rel_url.query)

    headers = {"Cookie": f"JSESSIONID={cookie}"}

    try:
        body = await request.read()
        resp = await http.request(
            method=request.method,
            url=url,
            params=params,
            headers=headers,
            data=body if body else None,
            allow_redirects=False,
        )

        if resp.status in (401, 403):
            await invalidate_session()
            return web.Response(status=401, text="Session expired — please reload")

        content_type = resp.headers.get("Content-Type", "application/json")
        data = await resp.read()
        return web.Response(status=resp.status, body=data, content_type=content_type.split(";")[0])

    except aiohttp.ClientError as exc:
        log.error("Proxy error for %s: %s", url, exc)
        return web.Response(status=502, text=f"Traccar proxy error: {exc}")


# ─── WebSocket relay ─────────────────────────────────────────────────────────


async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=30)  # built-in TCP keepalive
    await ws.prepare(request)
    ws_clients.add(ws)
    log.info("Frontend WS connected (total: %d)", len(ws_clients))
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data.get("type") == "ping":
                        await ws.send_str(json.dumps({"type": "pong"}))
                except Exception:
                    pass
            elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                break
    finally:
        ws_clients.discard(ws)
        log.info("Frontend WS disconnected (total: %d)", len(ws_clients))
    return ws


async def traccar_ws_task(app: web.Application):
    """Maintain a single persistent WS connection to Traccar and fan-out to clients."""
    http: aiohttp.ClientSession = app["http"]
    while True:
        cookie = await ensure_session(http)
        if not cookie:
            log.warning("WS relay: no session, retrying in 10s")
            await asyncio.sleep(10)
            continue

        ws_url = TRACCAR_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/socket"
        log.info("Connecting to Traccar WS: %s", ws_url)
        try:
            async with http.ws_connect(
                ws_url,
                headers={"Cookie": f"JSESSIONID={cookie}"},
                heartbeat=30,
            ) as traccar_ws:
                log.info("Traccar WS connected")
                async for msg in traccar_ws:
                    if msg.type == WSMsgType.TEXT:
                        dead = set()
                        for client in ws_clients:
                            try:
                                await client.send_str(msg.data)
                            except Exception:
                                dead.add(client)
                        ws_clients.difference_update(dead)
                    elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                        log.warning("Traccar WS closed: %s", msg)
                        break
        except aiohttp.ClientResponseError as exc:
            if exc.status in (401, 403):
                log.warning("Traccar WS auth error, invalidating session")
                await invalidate_session()
        except Exception as exc:
            log.error("Traccar WS error: %s", exc)

        log.info("Traccar WS disconnected — reconnecting in 5s")
        await asyncio.sleep(5)


# ─── Geocoding ───────────────────────────────────────────────────────────────


def _geo_cache_key(lat: float, lon: float) -> tuple:
    return (round(lat, 3), round(lon, 3))


async def geocode_handler(request: web.Request) -> web.Response:
    try:
        lat = float(request.rel_url.query["lat"])
        lon = float(request.rel_url.query["lon"])
    except (KeyError, ValueError):
        return web.json_response({"error": "lat and lon required"}, status=400)

    key = _geo_cache_key(lat, lon)
    if key in geo_cache:
        geo_cache.move_to_end(key)
        return web.json_response({"address": geo_cache[key]})

    fut: asyncio.Future = asyncio.get_event_loop().create_future()
    await geo_queue.put((lat, lon, fut))
    try:
        address = await asyncio.wait_for(fut, timeout=15)
        return web.json_response({"address": address})
    except asyncio.TimeoutError:
        return web.json_response({"address": f"{lat:.4f}, {lon:.4f}"})


async def geocode_worker(app: web.Application):
    """Consume geocode requests at ≤1 req/1.1s (Nominatim rate limit)."""
    global _last_nominatim
    http: aiohttp.ClientSession = app["http"]

    while True:
        lat, lon, fut = await geo_queue.get()
        key = _geo_cache_key(lat, lon)

        # Re-check cache (might have been filled while queued)
        if key in geo_cache:
            geo_cache.move_to_end(key)
            if not fut.done():
                fut.set_result(geo_cache[key])
            continue

        # Rate limit
        now = time.monotonic()
        wait = 1.1 - (now - _last_nominatim)
        if wait > 0:
            await asyncio.sleep(wait)

        address = f"{lat:.4f}, {lon:.4f}"  # fallback
        try:
            resp = await http.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "jsonv2"},
                headers={"User-Agent": "traccar-panel-ha-addon/1.0"},
                timeout=aiohttp.ClientTimeout(total=8),
            )
            if resp.status == 200:
                data = await resp.json()
                address = data.get("display_name", address)
        except Exception as exc:
            log.warning("Nominatim error for (%s,%s): %s", lat, lon, exc)

        _last_nominatim = time.monotonic()

        # Store in cache with LRU eviction
        geo_cache[key] = address
        geo_cache.move_to_end(key)
        if len(geo_cache) > GEO_CACHE_MAX:
            geo_cache.popitem(last=False)

        if not fut.done():
            fut.set_result(address)


# ─── App lifecycle ────────────────────────────────────────────────────────────


async def on_startup(app: web.Application):
    connector = aiohttp.TCPConnector(ssl=False)
    http = aiohttp.ClientSession(connector=connector)
    app["http"] = http

    # Authenticate immediately
    cookie = await ensure_session(http)
    if not cookie:
        log.warning("Initial Traccar auth failed — will retry on first request")

    # Background tasks
    asyncio.create_task(session_renewal_task(http))
    asyncio.create_task(traccar_ws_task(app))
    asyncio.create_task(geocode_worker(app))


async def on_cleanup(app: web.Application):
    await app["http"].close()


def make_app() -> web.Application:
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    app.router.add_route("GET", "/ws", ws_handler)
    app.router.add_route("GET", "/geocode", geocode_handler)
    # Proxy all /api/* methods
    for method in ("GET", "POST", "PUT", "DELETE"):
        app.router.add_route(method, "/api/{path:.*}", proxy_api)

    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="127.0.0.1", port=3001, access_log=None)
