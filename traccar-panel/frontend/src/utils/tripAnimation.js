/**
 * Trip replay animation engine.
 *
 * GPS points are at irregular time intervals, so we interpolate lat/lon
 * by wall-clock time scaled by a speed multiplier. Uses binary search +
 * linear interpolation for smooth playback, driven by requestAnimationFrame.
 *
 * Usage:
 *   const anim = createAnimation(points, onUpdate)
 *   anim.play(speedMultiplier)   // 1, 5, 10, 30
 *   anim.pause()
 *   anim.seek(fraction)          // 0..1
 *   anim.stop()
 *   anim.destroy()
 */
export function createAnimation(rawPoints, onUpdate) {
  if (!rawPoints || rawPoints.length === 0) return null

  // Normalise points to ms timestamps
  const points = rawPoints.map((p) => ({
    lat: p.latitude,
    lon: p.longitude,
    speed: p.speed ?? 0,
    ts: new Date(p.fixTime ?? p.deviceTime).getTime(),
  }))

  const totalDuration = points[points.length - 1].ts - points[0].ts // ms

  let rafId = null
  let speedMultiplier = 1
  let startRouteTime = points[0].ts     // the route-time we "started" at
  let startWallTime = null              // performance.now() when play began
  let pausedRouteTime = points[0].ts

  // Binary search: find index of the last point with ts <= routeTime
  function findIndex(routeTime) {
    let lo = 0
    let hi = points.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (points[mid].ts <= routeTime) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  function evaluate(routeTime) {
    const clamped = Math.max(points[0].ts, Math.min(points[points.length - 1].ts, routeTime))
    const i = findIndex(clamped)

    if (i >= points.length - 1) {
      // End of route
      onUpdate({
        lat: points[points.length - 1].lat,
        lon: points[points.length - 1].lon,
        speed: points[points.length - 1].speed,
        progress: 1,
        pointIndex: points.length - 1,
      })
      return true // done
    }

    const a = points[i]
    const b = points[i + 1]
    const t = (clamped - a.ts) / (b.ts - a.ts)
    const lat = a.lat + (b.lat - a.lat) * t
    const lon = a.lon + (b.lon - a.lon) * t
    const speed = a.speed + (b.speed - a.speed) * t
    const progress = (clamped - points[0].ts) / totalDuration

    onUpdate({ lat, lon, speed, progress, pointIndex: i })
    return false
  }

  function frame() {
    if (startWallTime === null) return
    const elapsed = performance.now() - startWallTime
    const routeTime = startRouteTime + elapsed * speedMultiplier
    const done = evaluate(routeTime)
    if (done) {
      rafId = null
      startWallTime = null
    } else {
      rafId = requestAnimationFrame(frame)
    }
  }

  return {
    play(multiplier = 1) {
      if (rafId) cancelAnimationFrame(rafId)
      speedMultiplier = multiplier
      startRouteTime = pausedRouteTime
      startWallTime = performance.now()
      rafId = requestAnimationFrame(frame)
    },

    pause() {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (startWallTime !== null) {
        const elapsed = performance.now() - startWallTime
        pausedRouteTime = Math.min(
          points[points.length - 1].ts,
          startRouteTime + elapsed * speedMultiplier
        )
        startWallTime = null
      }
    },

    seek(fraction) {
      const clampedFraction = Math.max(0, Math.min(1, fraction))
      pausedRouteTime = points[0].ts + clampedFraction * totalDuration
      const wasPlaying = startWallTime !== null
      if (wasPlaying) {
        this.pause()
        this.play(speedMultiplier)
      } else {
        evaluate(pausedRouteTime)
      }
    },

    stop() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
      startWallTime = null
      pausedRouteTime = points[0].ts
      evaluate(points[0].ts)
    },

    destroy() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
    },

    get totalDurationMs() { return totalDuration },
    get pointCount() { return points.length },
  }
}
