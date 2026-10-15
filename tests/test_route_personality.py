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
