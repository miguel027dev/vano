"""Contract tests for optional international context (no network required)."""
import threading
import time
import unittest
from unittest import mock

from vano.services import global_data_gateway as gateway


class GlobalContextTests(unittest.TestCase):
    def setUp(self):
        self.orig_cache = {
            key: dict(value) for key, value in gateway._CACHE.items()
        }
        with gateway._LOCK:
            for value in gateway._CACHE.values():
                value.update(events=(), success_at=0.0, attempt_at=0.0, pending=False)

    def tearDown(self):
        with gateway._LOCK:
            for key, value in self.orig_cache.items():
                gateway._CACHE[key] = value

    def test_invalid_coordinates_and_radius(self):
        for args in [(float("nan"), 0, 10), (0, 181, 10), (0, 0, 251), (0, 0, -3)]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                gateway.get_global_context(*args)

    def test_geodesic_distance(self):
        self.assertLess(gateway._distance_km(-23.55, -46.63, -23.55, -46.63), .01)
        self.assertGreater(gateway._distance_km(-23.55, -46.63, 48.85, 2.35), 9000)

    def test_normalizes_eonet_only_real_points(self):
        values = gateway._parse_eonet({"events": [
            {"id": "A", "title": "Incêndio", "closed": None,
             "categories": [{"id": "wildfires"}],
             "geometry": [{"type": "Polygon", "coordinates": [[[1, 2], [3, 4]]]},
                          {"type": "Point", "coordinates": [-46.6, -23.5], "date": "2026-10-16"}]},
            {"id": "B", "title": "Região", "geometry": [{"type": "Polygon", "coordinates": []}]},
            {"id": "C", "title": "Inválido", "geometry": [{"type": "Point", "coordinates": [300, 25]}]},
        ]})
        self.assertEqual(len(values), 1)
        self.assertEqual(values[0]["source"], "nasa-eonet")
        self.assertEqual(values[0]["route_effect"], "advisory_only")

    def test_normalizes_usgs(self):
        items = gateway._parse_usgs({"features": [
            {"id": "e1", "geometry": {"type": "Point", "coordinates": [-46, -23, 15]},
             "properties": {"title": "M4.9", "time": 1792170000000, "mag": 4.9}}
        ]})
        self.assertEqual(items[0]["kind"], "earthquake")
        self.assertEqual(items[0]["magnitude"], 4.9)

    def test_cached_context_is_fast_and_local(self):
        now = time.monotonic()
        with gateway._LOCK:
            gateway._CACHE["nasa-eonet"].update(
                success_at=now, attempt_at=now,
                events=({"id": "one", "source": "nasa-eonet", "lat": -23.55, "lon": -46.63},)
            )
            gateway._CACHE["usgs-earthquakes"].update(success_at=now, attempt_at=now, events=())
        with mock.patch.object(gateway, "_fetch", side_effect=AssertionError("No network expected")):
            started = time.monotonic()
            data = gateway.get_global_context(-23.55, -46.63, 20)
        self.assertLess(time.monotonic() - started, .05)
        self.assertEqual(len(data["events"]), 1)
        self.assertEqual(data["routing_effect"], "none")

    def test_refresh_is_singleflight_and_nonblocking(self):
        gate = threading.Event()
        started = threading.Event()
        def slow_fetch(provider):
            started.set()
            gate.wait(1)
            return []
        try:
            with mock.patch.object(gateway, "_fetch", side_effect=slow_fetch):
                first = time.monotonic()
                gateway.get_global_context(0, 0, 20)
                self.assertLess(time.monotonic() - first, .2)
                self.assertTrue(started.wait(.5))
                for _ in range(5):
                    result = gateway.get_global_context(0, 0, 20)
                    self.assertEqual(len(result["sources"]), 2)
                    self.assertEqual(result["routing_effect"], "none")
        finally:
            gate.set()
            # Allow worker updates to settle before restoring the fixture.
            time.sleep(.04)


if __name__ == "__main__":
    unittest.main()
