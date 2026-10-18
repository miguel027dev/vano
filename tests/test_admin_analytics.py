"""Read-only regression tests for the isolated VANO admin analytics queries."""
import json
import sqlite3
import unittest
from datetime import datetime, timedelta, timezone

from vano.services.admin_analytics import (
    build_admin_analytics,
    load_recent_events,
)


class AdminAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);
            CREATE TABLE request_activity_logs(
                id INTEGER PRIMARY KEY,user_id INTEGER,event_type TEXT,
                method TEXT,path TEXT,status_code INTEGER,ip_address TEXT,
                user_agent TEXT,metadata TEXT,duration_ms INTEGER,created_at TEXT
            );
            CREATE TABLE route_history(
                id INTEGER PRIMARY KEY,user_id INTEGER,origin_label TEXT,
                destination_label TEXT,mode TEXT,distance_m REAL,
                duration_s REAL,created_at TEXT
            );
        """)
        self.now = datetime(2026, 10, 17, 18, 0, tzinfo=timezone.utc)
        self.db.execute("INSERT INTO users VALUES(1,'Conta de teste')")
        events = [
            (1, 1, "request", "GET", "/mapa", 200, "192.0.2.1",
             "Mozilla/5.0 (Android)", "{}", 12, -1),
            (2, 1, "request", "GET", "/api/route", 200, "192.0.2.1",
             "Mozilla/5.0 (Android)", "{}", 87, -1),
            (3, 1, "route", "POST", "/mapa", None, "192.0.2.1",
             "Mozilla/5.0 (Android)", '{"label":"navigation-start"}', 0, -1),
            (4, None, "request", "GET", "/mapa", 404, "192.0.2.2",
             "Mozilla/5.0 (Windows)", "{}", 250, -8),
            (5, None, "click", "POST", "/mapa", None, "192.0.2.2",
             "Mozilla/5.0 (Windows)", '{"label":"search-button"}', 0, -8),
            (6, 1, "request", "GET", "/admin", 200, "192.0.2.3",
             "Mozilla/5.0 (Macintosh)", "{}", 5, -1),
            (7, 1, "request", "GET", "/api/benchmark/v1/route", 200,
             "192.0.2.1", "Mozilla/5.0 (Android)", "{}", 2, -1),
        ]
        for id_, uid, et, method, path, status, ip, ua, metadata, duration, mins in events:
            self.db.execute(
                "INSERT INTO request_activity_logs VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (id_, uid, et, method, path, status, ip, ua,
                 metadata, duration, (self.now + timedelta(minutes=mins)).isoformat())
            )
        self.db.execute(
            "INSERT INTO route_history VALUES(?,?,?,?,?,?,?,?)",
            (1, 1, "Origem salva", "Destino salvo", "safest", 4200, 620,
             (self.now - timedelta(minutes=20)).isoformat()),
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_overview_counts_only_product_events(self):
        result = build_admin_analytics(self.db, "overview", 7, now=self.now)
        self.assertEqual(result["summary"]["events"], 6)
        self.assertEqual(result["summary"]["unique_ips"], 2)
        self.assertEqual(result["summary"]["known_users"], 1)
        self.assertEqual(result["summary"]["http_errors"], 1)
        self.assertEqual(result["route_calls"]["successes"], 1)
        self.assertEqual(result["route_calls"]["failures"], 0)
        self.assertEqual(result["active"]["signed_in_users"], 1)

    def test_audience_excludes_raw_identifiers(self):
        result = build_admin_analytics(self.db, "audience", 7, now=self.now)
        self.assertEqual(result["summary"]["browser_signatures"], 2)
        self.assertEqual({row["platform"] for row in result["platforms"]}, {"Android", "Windows"})
        for row in result["recent_clients"]:
            self.assertNotIn("user_agent", row)
            self.assertNotIn("ip_address", row)

    def test_routes_show_existing_labels_only(self):
        result = build_admin_analytics(self.db, "routes", 7, now=self.now)
        self.assertEqual(result["api_calls"]["total"], 1)
        self.assertEqual(result["history_stats"]["saved"], 1)
        self.assertEqual(result["journey_counts"]["navigation-start"], 1)
        self.assertEqual(result["recent_routes"][0]["origin_label"], "Origem salva")
        self.assertEqual(result["recent_routes"][0]["destination_label"], "Destino salvo")

    def test_recent_events_filtered_and_sanitized(self):
        result = load_recent_events(self.db, 7, "route", now=self.now)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["label"], "navigation-start")
        self.assertNotIn("metadata", result[0])
        self.assertNotIn("ip_address", result[0])
        self.assertEqual(load_recent_events(self.db, 7, "request", now=self.now), [
            item for item in load_recent_events(self.db, 7, "all", now=self.now)
            if item["event_type"] == "request"
        ])

    def test_health_lag_and_errors(self):
        result = build_admin_analytics(self.db, "health", 7, now=self.now)
        self.assertEqual(result["summary"]["http_errors"], 1)
        self.assertEqual(result["latencies"]["sample"], 4)
        self.assertGreaterEqual(result["latencies"]["p95"], 12)

    def test_rejects_unbounded_intervals_and_unexpected_categories(self):
        with self.assertRaises(ValueError):
            build_admin_analytics(self.db, "outside", 7, now=self.now)
        with self.assertRaises(ValueError):
            build_admin_analytics(self.db, "overview", 36500, now=self.now)


if __name__ == "__main__":
    unittest.main()
