"""Semaforo ETA: never double-count live Mapbox travel time.

The non-live adjustment is an explicitly bounded heuristic; no current light
phase is inferred from OpenStreetMap or Mapbox intersection metadata.
"""
import copy

from vano.services.signal_eta import apply_signal_eta, signal_eta_fields


def sample_route(profile="driving-traffic", duration=900):
    return {
        "duration": duration,
        "_profile_used": profile,
        "legs": [
            {"steps": [
                {"intersections": [
                    {"traffic_signal": True, "location": [-46.700001, -23.500001]},
                    {"traffic_signal": True, "location": [-46.700002, -23.500002]},
                    {"traffic_signal": False, "location": [-46.699, -23.501]},
                    {"traffic_signal": True, "location": [-46.69, -23.51]},
                ]},
            ]},
        ],
    }


def test_live_traffic_duration_not_changed_but_signals_counted(monkeypatch):
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    route = sample_route()
    apply_signal_eta(route)
    assert route["duration"] == 900
    assert signal_eta_fields(route)["signal_count"] == 2
    assert signal_eta_fields(route)["duration_provider_s"] == 900
    assert signal_eta_fields(route)["signal_eta_adjustment_s"] == 0
    assert signal_eta_fields(route)["signal_eta_method"] == "mapbox-traffic-included"
    assert signal_eta_fields(route)["signal_eta_uncertainty_s"] > 0


def test_nonlive_fallback_adds_only_bounded_residual(monkeypatch):
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    route = sample_route("driving")
    apply_signal_eta(route)
    assert route["duration"] == 908
    assert signal_eta_fields(route)["signal_eta_adjustment_s"] == 8
    assert signal_eta_fields(route)["signal_eta_method"] == "bounded-nonlive-heuristic"
    previous = copy.deepcopy(route)
    apply_signal_eta(route)
    assert route == previous


def test_fallback_correction_capped_by_duration_and_absolute_limit(monkeypatch):
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    short = sample_route("driving", duration=20)
    apply_signal_eta(short)
    assert short["duration"] == 21.2
    many = sample_route("driving", duration=5000)
    many["legs"][0]["steps"][0]["intersections"] = [
        {"traffic_signal": True, "location": [-46.7 + i * .00001, -23.5]}
        for i in range(100)
    ]
    apply_signal_eta(many)
    assert signal_eta_fields(many)["signal_eta_adjustment_s"] == 90
    assert many["duration"] == 5090


def test_disabled_signal_eta_preserves_provider_eta(monkeypatch):
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "0")
    route = sample_route("driving")
    apply_signal_eta(route)
    assert route["duration"] == 900
    assert signal_eta_fields(route)["signal_count"] == 2
    assert signal_eta_fields(route)["signal_eta_adjustment_s"] == 0


def test_nonmotorized_or_absent_signals_never_add_delay(monkeypatch):
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    walking = sample_route("walking")
    apply_signal_eta(walking)
    assert walking["duration"] == 900
    no_signals = {"duration": 500, "_profile_used": "driving", "legs": []}
    apply_signal_eta(no_signals)
    assert no_signals["duration"] == 500
    assert signal_eta_fields(no_signals)["signal_eta_confidence"] == "unavailable"


def test_invalid_intersections_ignored(monkeypatch):
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    route = sample_route("driving")
    route["legs"][0]["steps"][0]["intersections"].extend([
        {"traffic_signal": True, "location": ["nan", 0]},
        {"traffic_signal": True, "location": [190, 0]},
        {"traffic_signal": True, "location": []},
        {"traffic_signal": True, "location": [None, None]},
    ])
    apply_signal_eta(route)
    assert signal_eta_fields(route)["signal_count"] == 2


def test_mapbox_main_and_via_paths_apply_signal_eta(monkeypatch):
    from vano.services import routing
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    monkeypatch.setattr(routing, "_route_cache_get", lambda *_: None)
    monkeypatch.setattr(routing, "_route_cache_put", lambda *_: None)
    def response(url, params, timeout):
        route = sample_route("driving", duration=900)
        route["distance"] = 3000
        route["geometry"] = {"type": "LineString", "coordinates": [[-46.7,-23.5],[-46.69,-23.51]]}
        return {"code": "Ok", "routes": [route]}
    monkeypatch.setattr(routing, "_route_mapbox_get", response)
    result = routing.mapbox_routes(-46.7, -23.5, -46.69, -23.51, "driving")
    assert result[0]["duration"] == 900  # live traffic has already priced in signals
    assert signal_eta_fields(result[0])["signal_count"] == 2
    via = routing.mapbox_routes_via([[-46.7,-23.5],[-46.69,-23.51]])
    assert via["duration"] == 900
    assert signal_eta_fields(via)["signal_count"] == 2


def test_fallback_to_nonlive_provider_adjusts_eta(monkeypatch):
    from vano.services import routing
    monkeypatch.setenv("VANO_SIGNAL_ETA_ENABLED", "1")
    monkeypatch.setattr(routing, "_route_cache_get", lambda *_: None)
    monkeypatch.setattr(routing, "_route_cache_put", lambda *_: None)
    def response(url, params, timeout):
        if "/driving-traffic/" in url:
            raise RuntimeError("traffic API unavailable")
        route = sample_route("driving")
        route["geometry"] = {"type": "LineString", "coordinates": [[-46.7,-23.5],[-46.69,-23.51]]}
        return {"code": "Ok", "routes": [route]}
    monkeypatch.setattr(routing, "_route_mapbox_get", response)
    result = routing.mapbox_routes(-46.7, -23.5, -46.69, -23.51, "driving")
    assert result[0]["_profile_used"] == "driving"
    assert result[0]["duration"] == 908


def test_navigation_eta_band_reads_signal_uncertainty():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    frontend = (root / "static" / "vano-map.js").read_text(encoding="utf-8")
    compact = (root / "vano" / "services" / "route_cache.py").read_text(encoding="utf-8")
    assert "signal_eta_uncertainty_s" in frontend
    assert "signal_eta_uncertainty_s" in compact
