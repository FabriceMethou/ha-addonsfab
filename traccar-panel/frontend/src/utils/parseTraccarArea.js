/**
 * Parse Traccar geofence `area` strings into Leaflet-friendly objects.
 *
 * Traccar formats:
 *   CIRCLE (lat lon, radius)   — custom, already lat/lon order, radius in metres
 *   POLYGON ((lon lat, ...))   — WKT standard, lon/lat order → swapped for Leaflet
 *
 * Returns:
 *   { type: 'circle', lat, lon, radius }
 *   { type: 'polygon', coords: [[lat, lon], ...] }
 *   null on parse failure
 */
export function parseTraccarArea(area) {
  if (!area || typeof area !== 'string') return null
  const s = area.trim()

  // ── CIRCLE ────────────────────────────────────────────────────────────────
  // Traccar stores: CIRCLE (lat lon, radius)
  // Tolerant of extra spaces, optional comma, decimal radii.
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
  // WKT standard: POLYGON ((lon lat, lon lat, ...))
  // Traccar follows standard WKT where x=longitude, y=latitude.
  // Leaflet expects [[lat, lon], ...] so we swap.
  const pm = s.match(/^POLYGON\s*\(\s*\(\s*([\s\S]+?)\s*\)\s*\)/i)
  if (pm) {
    const pairs = pm[1].split(',')
    const coords = []
    for (const pair of pairs) {
      const parts = pair.trim().split(/\s+/)
      if (parts.length < 2) continue
      const x = parseFloat(parts[0]) // WKT x = longitude
      const y = parseFloat(parts[1]) // WKT y = latitude
      if (isNaN(x) || isNaN(y)) continue
      coords.push([y, x]) // Leaflet [lat, lon]
    }
    if (coords.length >= 3) return { type: 'polygon', coords }
  }

  // ── LINESTRING (track geofences, rare) ────────────────────────────────────
  const lm = s.match(/^LINESTRING\s*\(\s*([\s\S]+?)\s*\)/i)
  if (lm) {
    const pairs = lm[1].split(',')
    const coords = []
    for (const pair of pairs) {
      const parts = pair.trim().split(/\s+/)
      if (parts.length < 2) continue
      const x = parseFloat(parts[0])
      const y = parseFloat(parts[1])
      if (isNaN(x) || isNaN(y)) continue
      coords.push([y, x])
    }
    if (coords.length >= 2) return { type: 'linestring', coords }
  }

  console.warn('[parseTraccarArea] Unrecognised area format:', s)
  return null
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
