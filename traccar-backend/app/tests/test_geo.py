import pytest

from app.geo import circle_wkt, haversine_m, parse_area


def test_haversine_one_degree_of_latitude():
    assert haversine_m(48.0, 2.0, 49.0, 2.0) == pytest.approx(111_195, rel=1e-3)


def test_circle_round_trips_through_wkt():
    area = parse_area(circle_wkt(48.85, 2.35, 150.0))
    assert (area.latitude, area.longitude, area.radius) == (48.85, 2.35, 150.0)


@pytest.mark.parametrize("wkt", ["CIRCLE (48.85 2.35, 150)", "circle(48.85 2.35,150.0)"])
def test_circle_formats_traccar_writes(wkt):
    assert parse_area(wkt).radius == 150.0


def test_circle_distance_outside():
    area = parse_area("CIRCLE (48.0 2.0, 100)")
    assert area.distance_outside_m(48.0, 2.0) == pytest.approx(-100)
    # ~222 m north of the centre: ~122 m outside a 100 m circle.
    assert area.distance_outside_m(48.002, 2.0) == pytest.approx(122, abs=2)


def test_polygon_inside_and_distance():
    # Traccar writes polygon vertices as "lat lon".
    area = parse_area("POLYGON ((48.0 2.0, 48.0 2.01, 48.01 2.01, 48.01 2.0, 48.0 2.0))")
    assert area.radius is None
    assert area.distance_outside_m(48.005, 2.005) == 0.0
    assert area.distance_outside_m(47.999, 2.005) == pytest.approx(111, abs=2)


@pytest.mark.parametrize("wkt", [None, "", "LINESTRING (1 2, 3 4)", "POLYGON ((1 2))"])
def test_unparseable_areas(wkt):
    assert parse_area(wkt) is None
