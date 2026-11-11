import unittest
from vano.services.safe_priority import rank_safe_routes, SAFE_PRIORITY_WEIGHTS

class RankingTests(unittest.TestCase):
    def test_longer_option_can_win(self):
        a = dict(id="short", duration=600, safety_conservative_score=55, hotspot_risk=45, risk_exposure_pct=35, data_confidence=70)
        b = dict(id="long", duration=2400, safety_conservative_score=90, hotspot_risk=5, risk_exposure_pct=5, data_confidence=80)
        self.assertEqual(rank_safe_routes([a,b])[0]["id"], "long")

    def test_time_breaks_equal_options(self):
        a = dict(id="a", duration=400, safety_conservative_score=70, hotspot_risk=5, risk_exposure_pct=5, data_confidence=70)
        b = dict(id="b", duration=300, safety_conservative_score=70, hotspot_risk=5, risk_exposure_pct=5, data_confidence=70)
        self.assertEqual(rank_safe_routes([a,b])[0]["id"], "b")

    def test_no_measurement_does_not_beat_measurement(self):
        self.assertEqual(rank_safe_routes([{"id":"unknown","duration":50},{"id":"measured","duration":80,"safety_score":50}])[0]["id"],"measured")

    def test_weight_total(self):
        self.assertAlmostEqual(sum(SAFE_PRIORITY_WEIGHTS.values()), 1.0)

if __name__ == "__main__":
    unittest.main()
