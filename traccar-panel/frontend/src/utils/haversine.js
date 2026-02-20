const R = 6371000 // Earth radius in metres

/**
 * Haversine distance between two points in metres.
 */
export function haversineMetres(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Total route distance in kilometres.
 * @param {Array<{latitude, longitude}>} points
 */
export function routeDistanceKm(points) {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMetres(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    )
  }
  return total / 1000
}
