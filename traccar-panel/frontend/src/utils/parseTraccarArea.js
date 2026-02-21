/**
 * Parse Traccar geofence `area` strings into Leaflet-friendly objects.
 *
 * Traccar stores ALL geometry types with latitude first, longitude second —
 * this applies to both CIRCLE and POLYGON (Traccar does NOT follow WKT standard
 * coordinate order). No coordinate swap is needed.
 *
 *   CIRCLE (lat lon, radius_metres)
 *   POLYGON ((lat lon, lat lon, ...))
 *   LINESTRING (lat lon, lat lon, ...)
 *
 * Returns:
 *   { type: 'circle',     lat, lon, radius }
 *   { type: 'polygon',    coords: [[lat, lon], ...] }
 *   { type: 'linestring', coords: [[lat, lon], ...] }
 *   null on parse failure
 */
export function parseTraccarArea(area) {
  if (!area || typeof area !== 'string') return null
  const s = area.trim()

  // ── CIRCLE ────────────────────────────────────────────────────────────────
  // Format: CIRCLE (lat lon, radius)
  const cm = s.match(
    /^CIRCLE\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*\)/i
  )
  if (cm) {
    return {
      type: 'circle',
      lat: parseFloat(cm[1]),
      lon: parseFloat(cm[2]),
      radius: parseFloat(cm[3]),
    }
  }

  // ── POLYGON ───────────────────────────────────────────────────────────────
  // Format: POLYGON ((lat lon, lat lon, ...))
  // Traccar uses lat-first order (not WKT standard), so no swap needed.
  const pm = s.match(/^POLYGON\s*\(\s*\(\s*([\s\S]+?)\s*\)\s*\)/i)
  if (pm) {
    const coords = parsePairs(pm[1])
    if (coords.length >= 3) return { type: 'polygon', coords }
  }

  // ── LINESTRING ────────────────────────────────────────────────────────────
  // Format: LINESTRING (lat lon, lat lon, ...)
  const lm = s.match(/^LINESTRING\s*\(\s*([\s\S]+?)\s*\)/i)
  if (lm) {
    const coords = parsePairs(lm[1])
    if (coords.length >= 2) return { type: 'linestring', coords }
  }

  console.warn('[parseTraccarArea] Unrecognised area format:', s)
  return null
}

function parsePairs(str) {
  const coords = []
  for (const pair of str.split(',')) {
    const parts = pair.trim().split(/\s+/)
    if (parts.length < 2) continue
    const lat = parseFloat(parts[0])
    const lon = parseFloat(parts[1])
    if (isNaN(lat) || isNaN(lon)) continue
    coords.push([lat, lon])
  }
  return coords
}

/**
 * Compute the geographic center of a parsed area object.
 * Returns [lat, lon] or null.
 */
export function areaCenter(parsed) {
  if (!parsed) return null
  if (parsed.type === 'circle') return [parsed.lat, parsed.lon]
  if (parsed.type === 'polygon' || parsed.type === 'linestring') {
    if (!parsed.coords.length) return null
    const lat = parsed.coords.reduce((s, c) => s + c[0], 0) / parsed.coords.length
    const lon = parsed.coords.reduce((s, c) => s + c[1], 0) / parsed.coords.length
    return [lat, lon]
  }
  return null
}
