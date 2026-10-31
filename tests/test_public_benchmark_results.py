"""Tests for the public benchmark publishing surface (all values synthetic)."""
from pathlib import Path
import pytest

from scripts.publish_public_benchmarks import normalize

ROOT = Path(__file__).resolve().parents[1]


def example_record():
    return {
        "run_id": "synthetic-test-1",
        "public_places_only": True,
        "recorded_at": "2026-10-31T12:00:00+00:00",
        "category": "centro",
        "origin_label": "Praça A (test fixture)",
        "destination_label": "Praça B (test fixture)",
        "profile": "driving",
        "baseline_source": "vano_fastest",
        "baseline_eta_min": 14.2,
        "baseline_distance_km": 8.2,
        "baseline_measured_at": "2026-10-31T12:00:00+00:00",
        "vano_mode": "safest",
        "vano_eta_min": 15.1,
        "vano_distance_km": 9.1,
        "vano_measured_at": "2026-10-31T12:02:00+00:00",
    }


def test_publishing_accepts_reviewed_internal_baseline():
    row = normalize(example_record())
    assert row["published"] == 1
    assert row["baseline_source"] == "vano_fastest"
    assert row["evidence_url"] == ""


def test_external_google_baseline_requires_evidence():
    record = example_record()
    record["baseline_source"] = "google_maps"
    with pytest.raises(ValueError, match="evidence_url"):
        normalize(record)


def test_rejects_non_public_location_and_nonfinite_data():
    record = example_record()
    record["public_places_only"] = False
    with pytest.raises(ValueError, match="public_places_only"):
        normalize(record)
    record["public_places_only"] = True
    record["vano_eta_min"] = float("nan")
    with pytest.raises(ValueError, match="outside accepted range"):
        normalize(record)


def test_rejects_non_contemporaneous_reference():
    record = example_record()
    record["baseline_measured_at"] = "2026-10-31T10:00:00+00:00"
    with pytest.raises(ValueError, match="15 minutes"):
        normalize(record)


def test_public_endpoints_do_not_read_private_trip_history():
    code = (ROOT / "vano" / "routes" / "benchmark_public_results.py").read_text()
    assert 'app.route("/benchmark-resultados")' in code
    assert 'app.route("/api/benchmark/v1/results")' in code
    assert "route_history" not in code
    assert "benchmark_publications" in code


def test_html_and_bot_metadata_are_present():
    template = (ROOT / "templates" / "benchmark_resultados.html").read_text()
    assert '"@type":"Dataset"' in template
    assert "data.records" in template
    assert "baseline_source" in template
    assert "Nenhum teste publicado" in template
    config = (ROOT / "vano" / "config.py").read_text()
    assert '"benchmark_public_results_page": "/benchmark-resultados"' in config
    assert "__PUBLIC_SITE_URL__/benchmark-resultados" in (ROOT / "sitemap.xml").read_text()
    robots = (ROOT / "robots.txt").read_text()
    assert robots.count("Allow: /api/benchmark/v1/results") == 2
