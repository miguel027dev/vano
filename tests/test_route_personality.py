"""Contract tests for the new preference interpretation.

These intentionally don't require a live Mapbox request or database.
"""
from pathlib import Path
from vano.services.personality import interpret_preference_text


def test_tolls_and_unpaved_are_understood_without_llm():
    p = interpret_preference_text("Quero evitar pedágios e estradas de terra.")
    assert p["avoid_tolls"] is True
    assert p["avoid_unpaved"] is True
    assert p["avoid_ferries"] is False
    assert p["needs_review"] is False


def test_route_mode_changes_when_user_prefers_time():
    p = interpret_preference_text("Quero chegar mais rápido, com o menor tempo.")
    assert p["route_preference"] == "fast_first"


def test_caution_changes_route_weight():
    p = interpret_preference_text("Prefiro caminhos mais seguros.")
    assert p["route_preference"] == "safety_first"


def test_negated_avoidance_not_interpreted_as_avoidance():
    p = interpret_preference_text("Não quero evitar pedágios.")
    assert p["avoid_tolls"] is False


def test_unavailable_road_preference_is_not_pretended_supported():
    p = interpret_preference_text("Gosto de avenidas principais movimentadas.")
    assert p["needs_review"] is True
    assert p["requires_more_data"]


def test_payload_has_length_limit():
    try:
        interpret_preference_text("a" * 501)
    except ValueError:
        pass
    else:
        assert False, "Overlong text must be rejected"


def test_frontend_listens_only_for_confirmed_arrival():
    root = Path(__file__).resolve().parents[1]
    script = (root / "static" / "vano-map.js").read_text(encoding="utf-8")
    assert "vano:trip-completed" in script
    assert "if(!simulated&&LOGGED_IN&&origin&&destination)" in script
    assert "showArrivalExperience(m);" in script


def test_optin_history_is_separate_from_route_history():
    root = Path(__file__).resolve().parents[1]
    code = (root / "vano" / "routes" / "personalization.py").read_text(encoding="utf-8")
    assert "completed_optin_trips" in code
    assert "history_enabled" in code
    assert "DELETE FROM completed_optin_trips WHERE user_id=?" in code


def test_mapbox_stop_is_a_real_directions_waypoint(monkeypatch):
    from vano.services import routing
    seen = []
    monkeypatch.setattr(routing, "_route_cache_get", lambda *_: None)
    monkeypatch.setattr(routing, "_route_cache_put", lambda *_: None)
    def directions(url, params, timeout):
        seen.append((url, params))
        return {"code": "Ok", "routes": [{"duration": 300, "distance": 1800, "geometry": {"type":"LineString", "coordinates":[[-46.7,-23.5],[-46.69,-23.5],[-46.68,-23.5]]}, "legs": []}]}
    monkeypatch.setattr(routing, "_route_mapbox_get", directions)
    routes = routing.mapbox_routes(-46.7,-23.5,-46.68,-23.5,"driving",
                                  alternatives=True, via=(-46.69,-23.5))
    assert routes and seen
    assert "/-46.7,-23.5;-46.69,-23.5;-46.68,-23.5" in seen[0][0]
    assert seen[0][1]["alternatives"] == "false"


def test_requested_stop_never_falls_back_to_direct_route(monkeypatch):
    import pytest
    from vano.services import routing
    monkeypatch.setattr(routing, "_route_cache_get", lambda *_: None)
    monkeypatch.setattr(routing, "_route_cache_put", lambda *_: None)
    monkeypatch.setattr(routing, "_route_mapbox_get", lambda *_, **__: (_ for _ in ()).throw(RuntimeError("offline")))
    monkeypatch.setattr(routing, "fallback_routes", lambda *_, **__: (_ for _ in ()).throw(AssertionError("must not be called")))
    with pytest.raises(RuntimeError, match="parada"):
        routing.mapbox_routes(-46.7,-23.5,-46.68,-23.5,"driving",via=(-46.69,-23.5))


def test_optional_preferences_and_confirmed_stop_frontend_contract():
    root = Path(__file__).resolve().parents[1]
    html = (root / "templates/onboarding.html").read_text(encoding="utf-8")
    onboarding = (root / "static/vano-personality-onboarding.js").read_text(encoding="utf-8")
    server = (root / "vano/routes/auth.py").read_text(encoding="utf-8")
    mapjs = (root / "static/vano-map.js").read_text(encoding="utf-8")
    smartjs = (root / "static/vano-personal-routes.js").read_text(encoding="utf-8")
    assert 'id="routeStyleSkip"' in html
    assert 'name="route_style_skipped"' in html
    assert "skipped.value='1'" in onboarding
    assert 'style_skipped = request.form.get("route_style_skipped") == "1"' in server
    assert "p.set('via_lat'" in mapjs and "p.set('via_lon'" in mapjs
    assert "via_stop:x.stops?.[0]||null" in smartjs
