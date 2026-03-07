/**
 * Flight/landing detection state machine.
 *
 * Per-device states: ground → airborne → ground
 * Takeoff: 2 consecutive updates > 200 km/h
 * Landing: speed < 50 km/h after being airborne
 *
 * Returns { event: 'takeoff'|'landing', deviceId, position } or null.
 */

const AIRBORNE_SPEED = 200; // km/h threshold
const LANDING_SPEED = 50; // km/h threshold
const MIN_AIRBORNE_UPDATES = 2; // consecutive updates > AIRBORNE_SPEED

// Per-device state: { state: 'ground'|'airborne', highCount: number }
const deviceState = {};

/**
 * Feed a new position update. Returns flight event or null.
 * @param {number} deviceId
 * @param {number} speedKmh
 * @param {object} position - full position object
 * @returns {{ event: 'takeoff'|'landing', deviceId: number, position: object } | null}
 */
export function detectFlight(deviceId, speedKmh, position) {
  if (!deviceState[deviceId]) {
    deviceState[deviceId] = { state: "ground", highCount: 0 };
  }

  const ds = deviceState[deviceId];

  if (ds.state === "ground") {
    if (speedKmh > AIRBORNE_SPEED) {
      ds.highCount++;
      if (ds.highCount >= MIN_AIRBORNE_UPDATES) {
        ds.state = "airborne";
        ds.highCount = 0;
        return { event: "takeoff", deviceId, position };
      }
    } else {
      ds.highCount = 0;
    }
  } else if (ds.state === "airborne") {
    if (speedKmh < LANDING_SPEED) {
      ds.state = "ground";
      ds.highCount = 0;
      return { event: "landing", deviceId, position };
    }
  }

  return null;
}

/**
 * Get current flight state for a device.
 * @param {number} deviceId
 * @returns {'ground'|'airborne'}
 */
export function getFlightState(deviceId) {
  return deviceState[deviceId]?.state ?? "ground";
}

/**
 * Reset flight detection state for a device.
 */
export function resetFlightState(deviceId) {
  delete deviceState[deviceId];
}
