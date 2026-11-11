#!/usr/bin/env python3
"""Publish operator-reviewed benchmark measurements from a JSON file.

Usage:
  python scripts/publish_public_benchmarks.py measurements.json --dry-run
  python scripts/publish_public_benchmarks.py measurements.json

The file is never exposed publicly; only explicitly selected, non-personal
metrics are inserted. Each run_id is immutable (ON CONFLICT DO NOTHING).
Requires DATABASE_URL and a database with the new migration applied.
"""
import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from db_backend import connect_db

CATEGORIES = {"centro", "residencial", "avenidas", "travessias", "congestionamento"}
SOURCES = {"vano_fastest", "google_maps"}
PROFILES = {"driving", "motorcycle"}
MODES = {"fastest", "smart", "safest", "quietest"}
COLUMNS = (
    "run_id", "published", "recorded_at", "category", "origin_label",
    "destination_label", "profile", "baseline_source", "baseline_eta_min",
    "baseline_distance_km", "baseline_route_id", "baseline_measured_at",
    "vano_mode", "vano_eta_min", "vano_distance_km", "vano_route_id",
    "vano_measured_at", "vano_provider", "latency_ms", "traffic_score",
    "safety_score", "vano_score", "evidence_url",
)


def _date(value, name):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{name}: invalid ISO-8601 timestamp") from exc
    if dt.tzinfo is None:
        raise ValueError(f"{name}: timezone required")
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _text(value, name, limit=120, required=False):
    data = str(value or "").strip()
    if len(data) > limit or (required and not data):
        raise ValueError(f"{name}: missing or too long")
    if any(ord(c) < 32 for c in data):
        raise ValueError(f"{name}: control character")
    return data


def _number(value, name, high):
    if value is None:
        return None
    try:
        n = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{name}: not numeric") from exc
    if not math.isfinite(n) or not 0 <= n <= high:
        raise ValueError(f"{name}: outside accepted range")
    return n


def normalize(row):
    if not isinstance(row, dict):
        raise ValueError("each record must be an object")
    run_id = _text(row.get("run_id"), "run_id", 90, True)
    if not re.fullmatch(r"[A-Za-z0-9_.:-]+", run_id):
        raise ValueError("run_id: invalid identifier")
    if row.get("public_places_only") is not True:
        raise ValueError("public_places_only: operator must confirm no personal locations")
    category = _text(row.get("category"), "category", 32, True)
    source = _text(row.get("baseline_source"), "baseline_source", 32, True)
    profile = _text(row.get("profile", "driving"), "profile", 32, True)
    mode = _text(row.get("vano_mode"), "vano_mode", 32, True)
    if category not in CATEGORIES or source not in SOURCES or profile not in PROFILES or mode not in MODES:
        raise ValueError("unsupported category, source, profile, or mode")
    recorded = _date(row.get("recorded_at"), "recorded_at")
    baseline_time = _date(row.get("baseline_measured_at"), "baseline_measured_at")
    vano_time = _date(row.get("vano_measured_at"), "vano_measured_at")
    delta = abs((datetime.fromisoformat(baseline_time) - datetime.fromisoformat(vano_time)).total_seconds())
    if delta > 900:
        raise ValueError("measurements are more than 15 minutes apart")
    evidence = _text(row.get("evidence_url"), "evidence_url", 700)
    if evidence:
        url = urlparse(evidence)
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError("evidence_url must be a public HTTPS URL without credentials")
    if source == "google_maps" and not evidence:
        raise ValueError("Google reference requires an evidence_url")
    baseline_eta = _number(row.get("baseline_eta_min"), "baseline_eta_min", 720)
    vano_eta = _number(row.get("vano_eta_min"), "vano_eta_min", 720)
    baseline_dist = _number(row.get("baseline_distance_km"), "baseline_distance_km", 300)
    vano_dist = _number(row.get("vano_distance_km"), "vano_distance_km", 300)
    if baseline_eta is None and baseline_dist is None:
        raise ValueError("reference measurement missing")
    if vano_eta is None and vano_dist is None:
        raise ValueError("VANO measurement missing")
    return {
        "run_id": run_id, "published": 1, "recorded_at": recorded,
        "category": category,
        "origin_label": _text(row.get("origin_label"), "origin_label", 120, True),
        "destination_label": _text(row.get("destination_label"), "destination_label", 120, True),
        "profile": profile, "baseline_source": source,
        "baseline_eta_min": baseline_eta, "baseline_distance_km": baseline_dist,
        "baseline_route_id": _text(row.get("baseline_route_id"), "baseline_route_id", 100),
        "baseline_measured_at": baseline_time,
        "vano_mode": mode, "vano_eta_min": vano_eta, "vano_distance_km": vano_dist,
        "vano_route_id": _text(row.get("vano_route_id"), "vano_route_id", 100),
        "vano_measured_at": vano_time,
        "vano_provider": _text(row.get("vano_provider"), "vano_provider", 100),
        "latency_ms": _number(row.get("latency_ms"), "latency_ms", 600000),
        "traffic_score": _number(row.get("traffic_score"), "traffic_score", 1000),
        "safety_score": _number(row.get("safety_score"), "safety_score", 1000),
        "vano_score": _number(row.get("vano_score"), "vano_score", 1000),
        "evidence_url": evidence,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    data = json.loads(args.file.read_text(encoding="utf-8"))
    data = data.get("records", []) if isinstance(data, dict) else data
    if not isinstance(data, list) or len(data) > 1000:
        parser.error("expected a list of at most 1000 records")
    rows = [normalize(item) for item in data]  # all-or-nothing validation
    print(f"Validated {len(rows)} public benchmark records")
    if args.dry_run:
        return
    db = connect_db()
    try:
        sql = (
            "INSERT INTO benchmark_publications (" + ",".join(COLUMNS) + ") VALUES ("
            + ",".join("?" for _ in COLUMNS) + ") ON CONFLICT (run_id) DO NOTHING"
        )
        inserted = 0
        for row in rows:
            cursor = db.execute(sql, [row[k] for k in COLUMNS])
            inserted += max(0, cursor.rowcount)
        db.commit()
        print(f"Published {inserted} new records ({len(rows) - inserted} duplicates)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
