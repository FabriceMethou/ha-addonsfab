/**
 * Smooth position interpolation for live device markers.
 *
 * Uses a single requestAnimationFrame loop to animate all active devices.
 * Ease-out cubic: 1 - (1 - t)^3 for natural deceleration.
 * Duration: ~2 seconds per position update.
 * If a new update arrives mid-animation, starts from the current interpolated position.
 */

const DURATION_MS = 2000;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Singleton manager for all device position animations. */
const animations = new Map(); // deviceId -> { from, to, startTime, current }
let rafId = null;

function tick() {
  const now = performance.now();
  let anyActive = false;

  for (const [deviceId, anim] of animations) {
    const elapsed = now - anim.startTime;
    const t = Math.min(elapsed / DURATION_MS, 1);
    const eased = easeOutCubic(t);

    anim.current = {
      lat: anim.from.lat + (anim.to.lat - anim.from.lat) * eased,
      lng: anim.from.lng + (anim.to.lng - anim.from.lng) * eased,
    };

    if (anim.callback) {
      anim.callback(anim.current);
    }

    if (t < 1) {
      anyActive = true;
    }
  }

  if (anyActive) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
  }
}

function ensureRunning() {
  if (rafId === null) {
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Start or update interpolation for a device.
 * @param {number|string} deviceId
 * @param {number} lat - target latitude
 * @param {number} lng - target longitude
 * @param {function} callback - called each frame with { lat, lng }
 */
export function interpolatePosition(deviceId, lat, lng, callback) {
  const existing = animations.get(deviceId);

  if (existing) {
    // Start from current interpolated position (or wherever we are)
    const from = existing.current ?? {
      lat: existing.to.lat,
      lng: existing.to.lng,
    };

    // Always update the callback in case the component re-mounted
    existing.callback = callback;

    // Skip animation if target hasn't meaningfully changed (< ~1 meter)
    if (
      Math.abs(from.lat - lat) < 0.00001 &&
      Math.abs(from.lng - lng) < 0.00001
    ) {
      return;
    }

    existing.from = { ...from };
    existing.to = { lat, lng };
    existing.startTime = performance.now();
    existing.callback = callback;
  } else {
    // First position — snap immediately, no animation
    const pos = { lat, lng };
    animations.set(deviceId, {
      from: pos,
      to: pos,
      startTime: performance.now() - DURATION_MS, // already "done"
      current: pos,
      callback,
    });
    if (callback) callback(pos);
    return;
  }

  ensureRunning();
}

/**
 * Remove a device from the interpolation system.
 * @param {number|string} deviceId
 */
export function removeInterpolation(deviceId) {
  animations.delete(deviceId);
}

/**
 * Get the current interpolated position for a device (or null).
 * @param {number|string} deviceId
 * @returns {{ lat: number, lng: number } | null}
 */
export function getInterpolatedPosition(deviceId) {
  return animations.get(deviceId)?.current ?? null;
}

/**
 * Reset all interpolation state. Used for testing.
 */
export function resetAll() {
  animations.clear();
  rafId = null;
}
