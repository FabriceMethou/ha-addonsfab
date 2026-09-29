"""Server-side detection: the backend decides, whether or not an app is open.

Every new position passes through ``process`` once, whichever road it took:
posted by the app to /positions, or (for older apps) seen on Traccar's
WebSocket. The fix time is the de-duplication key.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app import alerts as alerts_mod
from app.alerts import SEVERITY_CRITICAL, SEVERITY_INFO, SEVERITY_WARNING, display_name
from app.broadcast import bus
from app.config import settings
from app.database import (
    dump_status,
    get_device_state,
    get_presence,
    get_session_by_device_id,
    insert_driving_event,
    list_device_states,
    iso,
    last_driving_event,
    load_status,
    save_device_state,
    set_presence,
    utcnow,
)
from app.places import places_for_device

logger = logging.getLogger(__name__)

# A position older than this updates state silently: an arrival an hour
# late, replayed from an offline buffer, is history rather than news.
LATE_AFTER = timedelta(minutes=30)
# Inside only on a fix precise enough to believe; outside only once clearly
# beyond the edge, so a place's boundary does not flap.
ENTER_MAX_ACCURACY_M = 250.0
EXIT_MARGIN_M = 50.0
PLACE_DEDUPE_MINUTES = 10
SOS_DEDUPE_MINUTES = 2
# Above any car (the autobahn has no limit in places; cars top out near 250)
# and any high-speed train (320), below any cruising aircraft.
TAKEOFF_KMH = 350.0
LANDED_KMH = 50.0
FLIGHT_CONFIRMATIONS = 2
HARD_BRAKE_MIN_KMH = 30.0
HARD_BRAKE_MPS2 = 3.5
HARD_BRAKE_MAX_GAP_S = 10.0
SPEEDING_MAX_GAP_S = 60.0
SPEEDING_REPEAT = timedelta(minutes=5)

ALARM_KINDS = {"sos": "sos", "panic": "sos", "crash": "crash", "accident": "crash"}

_lock = asyncio.Lock()


def parse_time(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def live_message(device_id: int, pos: dict) -> dict:
    return {
        "type": "position",
        "device_id": device_id,
        "latitude": pos["latitude"],
        "longitude": pos["longitude"],
        "speed_kmh": round(pos.get("speed_kmh") or 0.0, 2),
        "course": pos.get("course"),
        "altitude": pos.get("altitude"),
        "accuracy": pos.get("accuracy"),
        "address": pos.get("address"),
        "battery_level": pos.get("battery"),
        "is_charging": bool(pos.get("charging")),
        "alarm": pos.get("alarm"),
        "fix_time": iso(pos["fix_time"]),
    }


def _default_state(device_id: int) -> dict:
    return {
        "device_id": device_id,
        "last_fix_time": None,
        "last_latitude": None,
        "last_longitude": None,
        "last_speed_kmh": None,
        "last_battery": None,
        "last_charging": None,
        "low_battery_armed": 1,
        "flight_state": "ground",
        "flight_count": 0,
        "sharing": "active",
        "status_json": None,
        "status_at": None,
        "last_mock": 0,
        "last_seen_at": None,
    }


async def process(device_id: int, pos: dict, *, skip_alarm: bool = False,
                  publish: bool = True) -> bool:
    """Run one position through detection. False if it was already seen.

    ``pos`` holds fix_time (datetime), latitude, longitude, speed_kmh and
    optionally course, altitude, accuracy, battery, charging, alarm, address.

    Only a position newer than the last one counts as live: an older one is
    history uploaded late (a trip saved while offline) and must not move
    anyone on the map. ``publish=False`` also keeps a newer one off the map,
    for all but the last of a batch.
    """
    async with _lock:
        state = await get_device_state(device_id) or _default_state(device_id)
        fix_time = pos["fix_time"]
        last = parse_time(state["last_fix_time"])
        if last is not None and fix_time <= last:
            return False

        if publish:
            await bus.publish_update(live_message(device_id, pos), device_id)

        late = utcnow() - fix_time > LATE_AFTER
        name = await display_name(device_id)

        alarm = ALARM_KINDS.get(str(pos.get("alarm") or "").lower())
        if alarm and not skip_alarm:
            await raise_emergency(device_id, alarm, pos, name)

        await _places(device_id, pos, name, late)
        if not late:
            await _battery(device_id, pos, state, name)
            await _flight(pos, state, name, device_id)
        await _driving(device_id, pos, state)

        back_from_silence = state["sharing"] == "no_signal"
        state.update({
            "last_fix_time": iso(fix_time),
            "last_latitude": pos["latitude"],
            "last_longitude": pos["longitude"],
            "last_speed_kmh": pos.get("speed_kmh") or 0.0,
            "last_battery": pos.get("battery"),
            "last_charging": int(bool(pos.get("charging"))),
            "last_mock": int(bool(pos.get("mock"))),
            "last_seen_at": iso(utcnow()),
        })
        if back_from_silence:
            state["sharing"] = "active"
        await save_device_state(state)
    if back_from_silence:
        await _announce_sharing(device_id, "active", state, previous="no_signal")
    return True


async def raise_emergency(device_id: int, kind: str, pos: dict, name: str | None = None,
                          dedupe: bool = True) -> dict | None:
    name = name or await display_name(device_id)
    if kind == "crash":
        title, body = f"Possible crash — {name}", f"{name} did not answer the crash check."
    else:
        title, body = f"SOS — {name}", f"{name} needs help."
    return await alerts_mod.raise_alert(
        kind, SEVERITY_CRITICAL, device_id, title, body,
        latitude=pos.get("latitude"), longitude=pos.get("longitude"),
        dedupe_minutes=SOS_DEDUPE_MINUTES if dedupe else None,
    )


async def _places(device_id: int, pos: dict, name: str, late: bool) -> None:
    session = await get_session_by_device_id(device_id)
    if session is None:
        return
    presence = await get_presence(device_id)
    accuracy = pos.get("accuracy") or 0.0
    for place in await places_for_device(session["device_unique_id"]):
        if place.area is None:
            continue
        outside_by = place.area.distance_outside_m(pos["latitude"], pos["longitude"])
        if outside_by <= 0 and accuracy <= ENTER_MAX_ACCURACY_M:
            inside = True
        elif outside_by > max(EXIT_MARGIN_M, accuracy):
            inside = False
        else:
            continue  # ambiguous: keep whatever we believed before

        previous = presence.get(place.id)
        if previous is not None and bool(previous["inside"]) == inside:
            continue
        await set_presence(device_id, place.id, inside, iso(pos["fix_time"]))
        if previous is None or late:
            continue  # first sighting, or history: record without alerting

        kind = "arrival" if inside else "departure"
        title = f"{name} arrived at {place.name}" if inside else f"{name} left {place.name}"
        await alerts_mod.raise_alert(
            kind, SEVERITY_INFO, device_id, title,
            "Arrived" if inside else "Left",
            latitude=pos["latitude"], longitude=pos["longitude"],
            place_id=place.id, place_name=place.name, group_id=place.group_id,
            dedupe_minutes=PLACE_DEDUPE_MINUTES,
        )


async def current_place_name(device_id: int) -> str | None:
    """Name of a place the device is inside, if any."""
    session = await get_session_by_device_id(device_id)
    if session is None:
        return None
    presence = await get_presence(device_id)
    for place in await places_for_device(session["device_unique_id"]):
        row = presence.get(place.id)
        if row and row["inside"]:
            return place.name
    return None


async def _battery(device_id: int, pos: dict, state: dict, name: str) -> None:
    level = pos.get("battery")
    if level is None:
        return
    limit = settings.low_battery_percent
    charging = bool(pos.get("charging"))
    if charging or level >= limit + 10:
        state["low_battery_armed"] = 1
    elif level <= limit and state["low_battery_armed"]:
        state["low_battery_armed"] = 0
        await alerts_mod.raise_alert(
            "low_battery", SEVERITY_WARNING, device_id,
            f"{name}'s battery is low", f"{round(level)}% left",
            latitude=pos["latitude"], longitude=pos["longitude"],
        )


async def _flight(pos: dict, state: dict, name: str, device_id: int) -> None:
    speed = pos.get("speed_kmh") or 0.0
    if state["flight_state"] == "ground":
        state["flight_count"] = state["flight_count"] + 1 if speed >= TAKEOFF_KMH else 0
        if state["flight_count"] >= FLIGHT_CONFIRMATIONS:
            state.update(flight_state="air", flight_count=0)
            await alerts_mod.raise_alert(
                "flight", SEVERITY_INFO, device_id, f"{name} took off", "Flight detected",
                latitude=pos["latitude"], longitude=pos["longitude"],
            )
    else:
        state["flight_count"] = state["flight_count"] + 1 if speed < LANDED_KMH else 0
        if state["flight_count"] >= FLIGHT_CONFIRMATIONS:
            state.update(flight_state="ground", flight_count=0)
            await alerts_mod.raise_alert(
                "flight", SEVERITY_INFO, device_id, f"{name} landed", "Back on the ground",
                latitude=pos["latitude"], longitude=pos["longitude"],
            )


async def _driving(device_id: int, pos: dict, state: dict) -> None:
    prev_speed = state["last_speed_kmh"]
    prev_time = parse_time(state["last_fix_time"])
    if prev_speed is None or prev_time is None:
        return
    gap = (pos["fix_time"] - prev_time).total_seconds()
    if gap <= 0:
        return
    speed = pos.get("speed_kmh") or 0.0
    common = {
        "device_id": device_id,
        "event_time": iso(pos["fix_time"]),
        "speed_kmh": speed,
        "latitude": pos["latitude"],
        "longitude": pos["longitude"],
    }

    limit = settings.speeding_limit_kmh
    if speed > limit and prev_speed > limit and gap <= SPEEDING_MAX_GAP_S:
        last = await last_driving_event(device_id, "speeding")
        last_time = parse_time(last["event_time"]) if last else None
        if last_time is None or pos["fix_time"] - last_time > SPEEDING_REPEAT:
            await insert_driving_event({**common, "kind": "speeding", "value": max(speed, prev_speed)})

    if prev_speed >= HARD_BRAKE_MIN_KMH and gap <= HARD_BRAKE_MAX_GAP_S:
        decel = (prev_speed - speed) / 3.6 / gap
        if decel >= HARD_BRAKE_MPS2:
            await insert_driving_event({**common, "kind": "hard_brake", "value": round(decel, 2)})


def sharing_from_status(status: dict) -> str:
    if str(status.get("tracking", "active")) == "paused":
        return "paused"
    if status.get("location_permission") == "denied":
        return "no_permission"
    if status.get("location_enabled") is False:
        return "location_off"
    return "active"


_SHARING_ALERTS = {
    "no_signal": ("has not been heard from for an hour", SEVERITY_WARNING),
    "paused": ("paused location sharing", SEVERITY_WARNING),
    "location_off": ("turned location off", SEVERITY_WARNING),
    "no_permission": ("stopped sharing location (permission removed)", SEVERITY_WARNING),
    "active": ("is sharing location again", SEVERITY_INFO),
}


async def process_status(device_id: int, status: dict) -> str:
    """Record what a phone says about itself; alert when sharing changes."""
    async with _lock:
        state = await get_device_state(device_id) or _default_state(device_id)
        before = state["sharing"]
        after = sharing_from_status(status)
        state["status_json"] = dump_status({**load_status(state["status_json"]), **status})
        state["status_at"] = iso(utcnow())
        state["last_seen_at"] = state["status_at"]
        state["sharing"] = after
        await save_device_state(state)
    if after != before:
        await _announce_sharing(device_id, after, state, status.get("app_version"), previous=before)
    else:
        await bus.publish_update(
            {"type": "member_status", "device_id": device_id, "sharing": after,
             "app_version": status.get("app_version")},
            device_id,
        )
    return after


async def _announce_sharing(device_id: int, sharing: str, state: dict,
                            app_version: str | None = None, previous: str | None = None) -> None:
    await bus.publish_update(
        {"type": "member_status", "device_id": device_id, "sharing": sharing,
         "app_version": app_version or load_status(state.get("status_json")).get("app_version")},
        device_id,
    )
    name = await display_name(device_id)
    text, severity = _SHARING_ALERTS[sharing]
    if sharing == "active" and previous == "no_signal":
        text = "is back online"
    await alerts_mod.raise_alert(
        f"sharing_{sharing}", severity, device_id, f"{name} {text}", "",
        latitude=state.get("last_latitude"), longitude=state.get("last_longitude"),
    )


# A phone that stops reporting while supposedly sharing: switched off,
# out of battery, killed, or out of coverage (finding L-05). Phones report
# at least every few minutes and send their status every half hour.
NO_SIGNAL_AFTER = timedelta(minutes=60)


async def check_silent_devices(now: datetime | None = None) -> list[int]:
    """Mark phones not heard from for an hour; returns their device ids."""
    now = now or utcnow()
    flagged: list[int] = []
    for device_id, state in (await list_device_states()).items():
        if state["sharing"] != "active":
            continue
        seen = parse_time(state.get("last_seen_at") or state.get("status_at") or state.get("last_fix_time"))
        if seen is None or now - seen < NO_SIGNAL_AFTER:
            continue
        if await get_session_by_device_id(device_id) is None:
            continue
        async with _lock:
            state["sharing"] = "no_signal"
            await save_device_state(state)
        await _announce_sharing(device_id, "no_signal", state)
        flagged.append(device_id)
    return flagged


# A flight is found in positions sent after landing, when the phone gets data
# back. Recent enough to be news, it becomes one alert (finding L-06).
FLIGHT_SUMMARY_WITHIN = timedelta(hours=12)


async def summarise_backlog(device_id: int, backlog: list[dict]) -> None:
    fast = [p for p in backlog if (p.get("speed_kmh") or 0.0) >= TAKEOFF_KMH]
    if len(fast) < FLIGHT_CONFIRMATIONS:
        return
    if utcnow() - max(p["fix_time"] for p in fast) > FLIGHT_SUMMARY_WITHIN:
        return
    name = await display_name(device_id)
    place = await current_place_name(device_id)
    state = await get_device_state(device_id) or {}
    await alerts_mod.raise_alert(
        "flight", SEVERITY_INFO, device_id, f"{name} landed",
        f"Now at {place}" if place else "Flight found once the phone was back online",
        latitude=state.get("last_latitude"), longitude=state.get("last_longitude"),
        dedupe_minutes=int(FLIGHT_SUMMARY_WITHIN.total_seconds() // 60),
    )
