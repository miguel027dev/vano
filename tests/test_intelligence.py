import os
import sqlite3
import unittest
from unittest.mock import Mock, patch

from flask import Flask, abort

from vano.services.intelligence import (
    ALLOWED_WINDOWS, SYSTEM_PROMPT, TOOL_DESCRIPTIONS, _capture_route,
    _days, _nvidia_query, _safe_float, _safe_tool, register_intelligence,
)


class IntelligenceTests(unittest.TestCase):
    def test_windows_and_tool_whitelist(self):
        self.assertEqual(_days("7"), 7)
        self.assertEqual(_days("999999"), 7)
        self.assertEqual(_days("abc"), 7)
        self.assertEqual(ALLOWED_WINDOWS, (1, 7, 30))
        self.assertIn("http_errors", TOOL_DESCRIPTIONS)
        with self.assertRaises(ValueError):
            _safe_tool(None, "raw_sql", 7)

    def test_numeric_values_are_bounded(self):
        self.assertEqual(_safe_float(-4), 0)
        self.assertEqual(_safe_float("nan"), 0)
        self.assertEqual(_safe_float("inf"), 0)
        self.assertEqual(_safe_float(123.457), 123.46)

    def test_capture_excludes_personal_coordinates(self):
        db = sqlite3.connect(":memory:")
        db.execute("""
            CREATE TABLE intelligence_route_decisions(
              created_at TEXT, route_mode TEXT,profile TEXT,engine TEXT,
              provider TEXT,candidate_count INTEGER,selected_duration_s REAL,
              selected_distance_m REAL,alternative_min_eta_s REAL,degraded INTEGER)
        """)
        response = Mock()
        response.get_json.return_value = {
            "mode": "fastest", "profile": "driving",
            "engine": "test-engine", "provider": "test-provider",
            "selected_id": "a",
            "start_lat": -23.6, "end_lon": -46.7,
            "routes": [
                {"id": "a", "duration": 500, "distance": 10000,
                 "geometry": {"coordinates": [[-46.7, -23.6]]}},
                {"id": "b", "duration": 480, "distance": 10200}
            ]
        }
        _capture_route(db, response)
        row = db.execute("SELECT * FROM intelligence_route_decisions").fetchone()
        self.assertEqual(row[5], 2)
        self.assertEqual(row[6], 500)
        self.assertEqual(row[8], 480)
        self.assertNotIn("start_lat", str(row))
        self.assertNotIn("geometry", str(row))
        db.close()

    def test_prompt_requires_evidence_and_read_only(self):
        self.assertIn("READ-ONLY", SYSTEM_PROMPT)
        self.assertIn("ETA previsto", SYSTEM_PROMPT)
        self.assertIn("Nunca invente", SYSTEM_PROMPT)

    def test_nvidia_request_does_not_get_raw_user_data(self):
        mock_result = Mock()
        mock_result.json.return_value = {"choices": [{"message": {"content": "Amostra insuficiente."}}]}
        with patch("vano.services.intelligence.requests.post", return_value=mock_result) as post:
            with patch.dict(os.environ, {}, clear=True):
                text = _nvidia_query("O que mudou?", {"days": 7, "sources": {"overview": {}}}, "FAKEKEY")
        self.assertEqual(text, "Amostra insuficiente.")
        request_json = post.call_args.kwargs["json"]
        self.assertEqual(request_json["model"], "openai/gpt-oss-120b")
        self.assertEqual(request_json["temperature"], 0.2)
        self.assertNotIn("FAKEKEY", str(request_json))

    def test_admin_routes_reject_unauthorized_clients(self):
        app = Flask(__name__)
        app.secret_key = "test-only"
        def admin_required(view):
            def inner(*args, **kwargs):
                abort(403)
            inner.__name__ = view.__name__
            return inner
        register_intelligence(
            app, get_db=lambda: None, admin_required=admin_required,
            validate_csrf=lambda: False, rate_limit=lambda *a, **k: True,
        )
        with app.test_client() as client:
            self.assertEqual(client.get("/admin/intelligence").status_code, 403)
            self.assertEqual(client.get("/api/admin/intelligence/overview").status_code, 403)
            self.assertEqual(client.post("/api/admin/intelligence/ask").status_code, 403)

    def test_unconsented_navigation_diagnostics_are_off_by_default(self):
        app = Flask(__name__)
        app.secret_key = "test-only"
        register_intelligence(
            app, get_db=lambda: None, admin_required=lambda f: f,
            validate_csrf=lambda: True, rate_limit=lambda *a, **k: True,
        )
        with patch.dict(os.environ, {"VANO_INTELLIGENCE_CLIENT_EVENTS": "0"}):
            with app.test_client() as client:
                self.assertEqual(client.post("/api/intelligence/navigation-event").status_code, 404)


if __name__ == "__main__":
    unittest.main()
