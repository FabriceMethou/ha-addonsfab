/**
 * Speed-based crash detection heuristic.
 *
 * Trigger: speed drops from >60 km/h (for at least 2 consecutive updates)
 * to <5 km/h within 30 seconds.
 *
 * GPS signal loss (no position) is NOT treated as deceleration.
 * Returns { crashed: true, deviceId, position } or { crashed: false }.
 */

const SPEED_HISTORY_SIZE = 5;
const HIGH_SPEED_THRESHOLD = 60; // km/h
const LOW_SPEED_THRESHOLD = 5; // km/h
const TIME_WINDOW_MS = 30_000; // 30 seconds
const MIN_HIGH_SPEED_COUNT = 2; // must have >=2 consecutive high-speed updates

// Per-device sliding window: { [deviceId]: [{ speedKmh, ts }] }
const history = {};

/**
 * Feed a new position update. Returns crash event or null.
 * @param {number} deviceId
 * @param {number} speedKmh - current speed in km/h
 * @param {object} position - full position object for context
 * @returns {{ crashed: true, deviceId: number, position: object } | null}
 */
export function detectCrash(deviceId, speedKmh, position) {
  if (!history[deviceId]) {
    history[deviceId] = [];
  }

  const window = history[deviceId];
  window.push({ speedKmh, ts: Date.now() });

  // Keep only the last N entries
  if (window.length > SPEED_HISTORY_SIZE) {
    window.shift();
  }

  // Need at least 3 entries (2 high + 1 low) to detect a crash
  if (window.length < 3) return null;

  const current = window[window.length - 1];

  // Current speed must be low
  if (current.speedKmh >= LOW_SPEED_THRESHOLD) return null;

  // Look back for consecutive high-speed entries within the time window
  let consecutiveHigh = 0;
  let earliestHighTs = null;

  for (let i = window.length - 2; i >= 0; i--) {
    const entry = window[i];
    if (entry.speedKmh >= HIGH_SPEED_THRESHOLD) {
      consecutiveHigh++;
      earliestHighTs = entry.ts; // keeps getting overwritten to the oldest one
    } else {
      break; // must be consecutive
    }
  }

  if (consecutiveHigh < MIN_HIGH_SPEED_COUNT) return null;

  // Check time window: the entire deceleration must happen within TIME_WINDOW_MS
  if (current.ts - earliestHighTs > TIME_WINDOW_MS) return null;

  // Crash detected — clear history to prevent re-triggering
  history[deviceId] = [];

  return { crashed: true, deviceId, position };
}

/**
 * Reset crash detection state for a device.
 */
export function resetCrashHistory(deviceId) {
  delete history[deviceId];
}
