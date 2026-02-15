#!/usr/bin/env python3
"""
Smart HA-to-Dawarich location bridge.

Polls Home Assistant for person entities and their companion app sensors,
determines activity state (home/driving/cycling/walking/stationary), and
pushes location data to Dawarich at context-appropriate intervals.
"""

import json
import logging
import math
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

logging.basicConfig(
    level=logging.INFO,
    format="[HA Bridge] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("ha_bridge")

# ---------------------------------------------------------------------------
# Config helpers (read from bashio / environment)
# ---------------------------------------------------------------------------

def bashio_config(key):
    """Read a config value from bashio."""
    try:
        result = subprocess.run(
            ["bashio::config", key],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    # Fallback: try reading from /data/options.json directly
    try:
        with open("/data/options.json") as f:
            options = json.load(f)
        value = options.get(key)
        return value
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def load_config():
    """Load all bridge configuration."""
    try:
        with open("/data/options.json") as f:
            opts = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        log.error("Cannot read /data/options.json")
        sys.exit(1)

    # Build person → API key mapping from DAWARICH_USERS list
    # Accepts either "fabrice" or "person.fabrice" — normalizes to "person.fabrice"
    user_map = {}
    for entry in opts.get("DAWARICH_USERS", []):
        person_id = entry.get("ha_person", "").strip()
        key = entry.get("api_key", "").strip()
        if person_id and key:
            if not person_id.startswith("person."):
                person_id = f"person.{person_id}"
            user_map[person_id] = key

    return {
        "user_map": user_map,
        "home_wifi_names": [s.lower() for s in opts.get("HOME_WIFI_NAMES", [])],
        "car_bt_devices": [s.lower() for s in opts.get("CAR_BLUETOOTH_DEVICES", [])],
        "min_distance_m": opts.get("BRIDGE_MIN_DISTANCE_METERS", 50),
        "interval_driving": opts.get("BRIDGE_INTERVAL_DRIVING", 10),
        "interval_cycling": opts.get("BRIDGE_INTERVAL_CYCLING", 15),
        "interval_walking": opts.get("BRIDGE_INTERVAL_WALKING", 30),
        "interval_stationary": opts.get("BRIDGE_INTERVAL_STATIONARY", 300),
        "interval_home": opts.get("BRIDGE_INTERVAL_HOME", 0),
    }


# ---------------------------------------------------------------------------
# HA API helpers
# ---------------------------------------------------------------------------

HA_API = "http://supervisor/core/api"
SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")


def ha_get(path):
    """GET request to Home Assistant API."""
    url = f"{HA_API}{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {SUPERVISOR_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        log.warning("HA API error on %s: %s", path, e)
        return None


def ha_get_all_states():
    """Fetch all entity states from HA, indexed by entity_id."""
    states = ha_get("/states")
    if not states:
        return {}
    return {s["entity_id"]: s for s in states}


# ---------------------------------------------------------------------------
# Dawarich API
# ---------------------------------------------------------------------------

DAWARICH_URL = "http://localhost:3000"  # Always local — bridge runs in same container


def dawarich_healthy():
    """Check if Dawarich is up."""
    try:
        req = urllib.request.Request(f"{DAWARICH_URL}/api/v1/health")
        with urllib.request.urlopen(req, timeout=5):
            return True
    except (urllib.error.URLError, OSError):
        return False


def dawarich_push(api_key, payload):
    """Push an OwnTracks location point to Dawarich. Returns True on success."""
    url = f"{DAWARICH_URL}/api/v1/owntracks/points?api_key={api_key}"
    data = json.dumps(payload).encode()
    # Set Host header without port to pass Rails HostAuthorization
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Host": "localhost",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except (urllib.error.URLError, OSError) as e:
        log.warning("Dawarich push failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# Geo helpers
# ---------------------------------------------------------------------------

def haversine(lat1, lon1, lat2, lon2):
    """Distance in meters between two GPS points."""
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Sensor discovery and state detection
# ---------------------------------------------------------------------------

def device_name_from_person(person_state, all_states):
    """
    Extract the companion app device name from a person entity.
    person.fabrice → source: device_tracker.pixel_6 → device name: pixel_6
    """
    source = person_state.get("attributes", {}).get("source")
    if source and source.startswith("device_tracker."):
        return source.replace("device_tracker.", "")
    # Fallback: try the person entity_id suffix
    return person_state["entity_id"].replace("person.", "")


def get_sensor_value(all_states, device_name, sensor_suffix):
    """Get a sensor state for a device. Returns (state, attributes) or (None, {})."""
    entity_id = f"sensor.{device_name}_{sensor_suffix}"
    entity = all_states.get(entity_id)
    if entity and entity.get("state") not in (None, "unknown", "unavailable"):
        return entity["state"], entity.get("attributes", {})
    return None, {}


def detect_activity_state(all_states, device_name, config):
    """
    Determine the current activity state for a device.
    Returns one of: "home", "driving", "cycling", "walking", "stationary"
    """
    # 1. Check WiFi name for home detection (from person's phone sensor)
    wifi_state, wifi_attrs = get_sensor_value(all_states, device_name, "wifi_connection")
    current_wifi = None
    if wifi_state is not None:
        # WiFi name can be in attributes (ssid/SSID) or in the sensor state itself
        current_wifi = (wifi_attrs.get("current_wifi")
                        or wifi_attrs.get("ssid")
                        or wifi_attrs.get("SSID"))
        if current_wifi is None and wifi_state not in ("0", "disconnected", "off", "<not connected>"):
            current_wifi = wifi_state

    if current_wifi and current_wifi.lower() in config["home_wifi_names"]:
        return "home", current_wifi

    # 2. Check activity sensor
    activity, _ = get_sensor_value(all_states, device_name, "detected_activity")

    # 3. Check Bluetooth for car detection
    _, bt_attrs = get_sensor_value(all_states, device_name, "bluetooth_connection")
    connected_bt = bt_attrs.get("connected_paired_devices", [])
    car_connected = False
    if connected_bt and config["car_bt_devices"]:
        for bt_device in connected_bt:
            bt_name = bt_device.lower()
            for car_name in config["car_bt_devices"]:
                if car_name in bt_name:
                    car_connected = True
                    break
            if car_connected:
                break

    # 4. Check Android Auto
    aa_entity = all_states.get(f"binary_sensor.{device_name}_android_auto")
    android_auto = aa_entity and aa_entity.get("state") == "on"

    # 5. Determine state
    if activity == "in_vehicle" or car_connected or android_auto:
        return "driving", current_wifi
    elif activity == "on_bicycle":
        return "cycling", current_wifi
    elif activity in ("walking", "running", "on_foot"):
        return "walking", current_wifi
    elif activity == "still":
        return "stationary", current_wifi
    else:
        # Unknown activity — default to stationary
        return "stationary", current_wifi


def get_interval_for_state(state, config):
    """Get the push interval in seconds for a given activity state."""
    return {
        "home": config["interval_home"],
        "driving": config["interval_driving"],
        "cycling": config["interval_cycling"],
        "walking": config["interval_walking"],
        "stationary": config["interval_stationary"],
    }.get(state, config["interval_stationary"])


# ---------------------------------------------------------------------------
# Build OwnTracks payload
# ---------------------------------------------------------------------------

def build_payload(person_entity, all_states, device_name, current_wifi):
    """Build an OwnTracks-compatible location payload."""
    attrs = person_entity.get("attributes", {})
    lat = attrs.get("latitude")
    lon = attrs.get("longitude")

    if lat is None or lon is None:
        return None

    # Get battery info
    batt_state, _ = get_sensor_value(all_states, device_name, "battery_level")
    batt_charging, _ = get_sensor_value(all_states, device_name, "battery_state")

    # Battery status mapping: 0=unknown, 1=unplugged, 2=charging, 3=full
    bs = 0
    if batt_charging == "charging":
        bs = 2
    elif batt_charging == "full":
        bs = 3
    elif batt_charging in ("not_charging", "discharging"):
        bs = 1

    # Speed: HA reports in m/s typically
    speed = attrs.get("speed")
    vel = int(float(speed)) if speed is not None else 0

    # Connection type
    conn = "w" if current_wifi else "m"

    payload = {
        "_type": "location",
        "tid": person_entity["entity_id"].replace("person.", "")[:2].upper(),
        "lat": float(lat),
        "lon": float(lon),
        "tst": int(time.time()),
        "acc": int(attrs.get("gps_accuracy", 0)),
        "alt": int(float(attrs.get("altitude", 0))) if attrs.get("altitude") is not None else 0,
        "vac": int(float(attrs.get("vertical_accuracy", 0))) if attrs.get("vertical_accuracy") is not None else 0,
        "vel": vel,
        "conn": conn,
        "m": 1 if vel > 0 else 0,
    }

    if batt_state is not None:
        try:
            payload["batt"] = int(float(batt_state))
        except (ValueError, TypeError):
            pass

    if bs > 0:
        payload["bs"] = bs

    if current_wifi:
        payload["SSID"] = current_wifi

    return payload


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

# Per-person state tracking
person_tracker = {}


def should_push(person_id, lat, lon, activity_state, config):
    """Decide whether to push a location update for this person."""
    now = time.time()
    interval = get_interval_for_state(activity_state, config)

    # interval == 0 means "don't send" (home mode)
    if interval == 0:
        return False, "home mode (disabled)"

    state = person_tracker.get(person_id, {})
    last_time = state.get("last_push_time", 0)
    last_lat = state.get("last_lat")
    last_lon = state.get("last_lon")

    # Check time interval
    elapsed = now - last_time
    if elapsed < interval:
        return False, f"too soon ({int(elapsed)}s < {interval}s)"

    # Check distance (skip for driving — always push on interval)
    if last_lat is not None and last_lon is not None and activity_state != "driving":
        dist = haversine(last_lat, last_lon, lat, lon)
        if dist < config["min_distance_m"]:
            # Still push if enough time has passed (2x interval) even if not moved
            if elapsed < interval * 2:
                return False, f"too close ({int(dist)}m < {config['min_distance_m']}m)"

    return True, "ok"


def update_tracker(person_id, lat, lon):
    """Record that we pushed a point for this person."""
    person_tracker[person_id] = {
        "last_push_time": time.time(),
        "last_lat": lat,
        "last_lon": lon,
    }


def main():
    config = load_config()
    user_map = config["user_map"]

    # Validate user mapping
    if not user_map:
        log.error("No DAWARICH_USERS configured.")
        log.error("For each person you want to track:")
        log.error("1. Create a user account in Dawarich web UI")
        log.error("2. Go to Settings > Account > copy their API Key")
        log.error("3. Add an entry in DAWARICH_USERS with ha_person and api_key")
        log.error("4. Restart the addon")
        while True:
            time.sleep(3600)

    # Wait for Dawarich to be ready
    log.info("Waiting for Dawarich to be ready...")
    while not dawarich_healthy():
        time.sleep(5)
    log.info("Dawarich is ready.")

    log.info("Tracking %d person(s): %s",
             len(user_map), ", ".join(user_map.keys()))
    log.info("Bridge config: home_wifi=%s, car_bt=%s, min_dist=%dm",
             config["home_wifi_names"], config["car_bt_devices"],
             config["min_distance_m"])
    log.info("Intervals: driving=%ds, cycling=%ds, walking=%ds, stationary=%ds, home=%s",
             config["interval_driving"], config["interval_cycling"],
             config["interval_walking"], config["interval_stationary"],
             f"{config['interval_home']}s" if config["interval_home"] > 0 else "disabled")

    # Log device resolution for each person on first successful fetch
    initial_states = None
    while not initial_states:
        initial_states = ha_get_all_states()
        if not initial_states:
            time.sleep(5)
    for person_id in user_map:
        person_entity = initial_states.get(person_id)
        if person_entity:
            device = device_name_from_person(person_entity, initial_states)
            source = person_entity.get("attributes", {}).get("source", "unknown")
            friendly = person_entity.get("attributes", {}).get("friendly_name", person_id)
            log.info("  %s (%s) -> %s -> sensors: %s_*",
                     person_id, friendly, source, device)
        else:
            log.warning("  %s: NOT FOUND in HA — check the name in DAWARICH_USERS",
                        person_id)

    # Fast base poll loop (5 seconds)
    BASE_POLL = 5

    while True:
        all_states = ha_get_all_states()
        if not all_states:
            log.warning("Could not fetch HA states, retrying...")
            time.sleep(BASE_POLL)
            continue

        # Process only configured persons
        for person_id, api_key in user_map.items():
            person_entity = all_states.get(person_id)
            if not person_entity:
                log.debug("%s: not found in HA states", person_id)
                continue

            attrs = person_entity.get("attributes", {})
            lat = attrs.get("latitude")
            lon = attrs.get("longitude")

            if lat is None or lon is None:
                continue

            lat, lon = float(lat), float(lon)
            device_name = device_name_from_person(person_entity, all_states)
            activity_state, current_wifi = detect_activity_state(
                all_states, device_name, config)

            push, reason = should_push(
                person_id, lat, lon, activity_state, config)

            if not push:
                log.debug("%s: state=%s, skip (%s)", person_id,
                          activity_state, reason)
                continue

            payload = build_payload(
                person_entity, all_states, device_name, current_wifi)
            if payload is None:
                continue

            success = dawarich_push(api_key, payload)
            if success:
                update_tracker(person_id, lat, lon)
                friendly = attrs.get("friendly_name", person_id)
                log.info("%s: state=%s, pushed (lat=%.4f, lon=%.4f, vel=%d)",
                         friendly, activity_state, lat, lon,
                         payload.get("vel", 0))
            else:
                log.warning("%s: state=%s, push FAILED", person_id,
                            activity_state)

        time.sleep(BASE_POLL)


if __name__ == "__main__":
    main()
