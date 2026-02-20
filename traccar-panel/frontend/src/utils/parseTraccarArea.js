/**
 * Parse Traccar geofence `area` strings into Leaflet-friendly objects.
 *
 * Traccar uses two formats:
 *   CIRCLE (lat lon radius)   — custom format, already lat/lon order
 *   POLYGON ((lon lat, ...))  — standard WKT, lon/lat order → must swap for Leaflet
 *
 * Returns:
 *   { type: 'circle', lat, lon, radius }
 *   { type: 'polygon', coords: [[lat, lon], ...] }
 *   null on parse failure
 */
export function parseTraccarArea(area) {
  if (!area) return null

  // CIRCLE (lat lon radius)
  const circleMatch = area.match(
    /^CIRCLE\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*,?\s*(\d+\.?\d*)\s*\)/i
  )
  if (circleMatch) {
    return {
      type: 'circle',
      lat: parseFloat(circleMatch[1]),
      lon: parseFloat(circleMatch[2]),
      radius: parseFloat(circleMatch[3]),
    }
  }

  // POLYGON ((lon lat, lon lat, ...))
  const polygonMatch = area.match(/^POLYGON\s*\(\s*\(\s*(.+?)\s*\)\s*\)/i)
  if (polygonMatch) {
    const coords = polygonMatch[1].split(',').map((pair) => {
      const parts = pair.trim().split(/\s+/)
      const lon = parseFloat(parts[0])
      const lat = parseFloat(parts[1])
      return [lat, lon] // swap: WKT is lon,lat but Leaflet expects [lat, lon]
    })
    return { type: 'polygon', coords }
  }

  return null
}
