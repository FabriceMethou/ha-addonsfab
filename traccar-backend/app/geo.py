"""Geometry for places: Traccar WKT areas, distances in metres."""
import math
import re
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_000.0

_NUM = r"(-?\d+(?:\.\d+)?)"
_CIRCLE = re.compile(rf"^\s*CIRCLE\s*\(\s*{_NUM}\s+{_NUM}\s*,\s*{_NUM}\s*\)\s*$", re.I)
_POLYGON = re.compile(r"^\s*POLYGON\s*\(\((.*)\)\)\s*$", re.I | re.S)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, a)))


@dataclass(frozen=True)
class Area:
    """A place's shape. ``radius`` is set for circles, ``ring`` for polygons."""

    latitude: float
    longitude: float
    radius: float | None = None
    ring: tuple[tuple[float, float], ...] = ()

    def distance_outside_m(self, lat: float, lon: float) -> float:
        """Metres outside the area; zero or negative when inside."""
        if self.radius is not None:
            return haversine_m(self.latitude, self.longitude, lat, lon) - self.radius
        if _point_in_ring(lat, lon, self.ring):
            return 0.0
        return _distance_to_ring_m(lat, lon, self.ring)


def circle_wkt(latitude: float, longitude: float, radius: float) -> str:
    # Traccar's circle format: CIRCLE (lat lon, radiusMeters)
    return f"CIRCLE ({latitude} {longitude}, {radius})"


def parse_area(wkt: str | None) -> Area | None:
    if not wkt:
        return None
    m = _CIRCLE.match(wkt)
    if m:
        return Area(float(m.group(1)), float(m.group(2)), radius=float(m.group(3)))
    m = _POLYGON.match(wkt)
    if m:
        ring = []
        for pair in m.group(1).split(","):
            parts = pair.split()
            if len(parts) < 2:
                continue
            try:
                # Traccar stores polygon vertices as "lat lon".
                ring.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
        if len(ring) >= 3:
            lat = sum(p[0] for p in ring) / len(ring)
            lon = sum(p[1] for p in ring) / len(ring)
            return Area(lat, lon, ring=tuple(ring))
    return None


def _point_in_ring(lat: float, lon: float, ring: tuple[tuple[float, float], ...]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > lat) != (yj > lat):
            x_cross = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_cross:
                inside = not inside
        j = i
    return inside


def _distance_to_ring_m(lat: float, lon: float, ring: tuple[tuple[float, float], ...]) -> float:
    # Local equirectangular projection around the point: accurate to well
    # under a metre at place scale.
    k = math.cos(math.radians(lat))
    to_xy = lambda p: (math.radians(p[1] - lon) * k * EARTH_RADIUS_M,  # noqa: E731
                       math.radians(p[0] - lat) * EARTH_RADIUS_M)
    pts = [to_xy(p) for p in ring]
    best = math.inf
    for i in range(len(pts)):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % len(pts)]
        dx, dy = bx - ax, by - ay
        seg = dx * dx + dy * dy
        t = 0.0 if seg == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg))
        cx, cy = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(cx, cy))
    return best
