import unittest
import vano_radars as vr


class RadarHelpersTest(unittest.TestCase):
    def test_decimal_comma_and_normalization(self):
        item = vr._radar("test", "abc", "-23,5501", "-46,6339", radar_type="Radar Fixo", speed_limit="60 km/h")
        self.assertIsNotNone(item)
        self.assertEqual(item["radar_type"], "fixed_speed")
        self.assertEqual(item["speed_limit"], 60)
        self.assertAlmostEqual(item["lat"], -23.5501, places=4)

    def test_region_gating_brazil(self):
        names = [x["name"] for x in vr._eligible_sources(-23.55, -46.63)]
        self.assertIn("openstreetmap", names)
        self.assertIn("antt", names)
        self.assertNotIn("singapore_spf", names)
        self.assertNotIn("dc_ddot", names)

    def test_region_gating_dc(self):
        names = [x["name"] for x in vr._eligible_sources(38.90, -77.03)]
        self.assertEqual(names, ["openstreetmap", "dc_ddot"])

    def test_near_filter(self):
        center = vr._radar("test", "1", -23.55, -46.63)
        far = vr._radar("test", "2", -22.90, -43.20)
        rows = vr._filter_near([center, far], -23.55, -46.63, 1000)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_id"], "1")


if __name__ == "__main__":
    unittest.main()
