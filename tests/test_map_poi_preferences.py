"""Pure POI preference contract tests: no network or database required."""
from vano.services.map_poi_preferences import (
    POI_CHOICES, PERMANENT_POIS, normalize_poi_choices, saved_poi_choices
)


def test_defaults_are_all_selectable_and_infrastructure_is_permanent():
    assert {"pharmacy", "fitness", "parking", "fuel", "airport", "ev_charging",
            "train_station", "toll"} <= set(POI_CHOICES)
    assert {"bank", "park"} <= set(PERMANENT_POIS)
    assert not (set(PERMANENT_POIS) & set(POI_CHOICES))
    assert not ({"fast_food", "carwash", "pet_shop", "bus_terminal",
                 "hotel", "railway_crossing", "traffic_signal"} & set(POI_CHOICES))


def test_saved_preferences_preserve_explicit_clear_and_legacy_default():
    assert saved_poi_choices({"poi_visibility_json": None}) == list(POI_CHOICES)
    assert saved_poi_choices({"poi_visibility_json": "[]"}) == []
    assert saved_poi_choices({"poi_visibility_json": '["pharmacy","fitness"]'}) == ["pharmacy", "fitness"]
    assert saved_poi_choices({"poi_visibility_json": "broken"}) == list(POI_CHOICES)


def test_submitted_categories_are_allowlisted_deduplicated_and_ordered():
    assert normalize_poi_choices(["pharmacy", "pharmacy", "bank", "fitness", "hotel"]) == ["pharmacy", "fitness"]
    assert normalize_poi_choices([]) == []


def test_template_and_bootstrap_use_account_preferences():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    template = (root / "templates/onboarding.html").read_text(encoding="utf-8")
    boot = (root / "templates/index.html").read_text(encoding="utf-8")
    backend = (root / "vano/routes/auth.py").read_text(encoding="utf-8")
    assert 'data-poi-action="all"' in template
    assert 'data-poi-action="clear"' in template
    assert 'name="poi_visible"' in template
    assert "poiVisible:{{ poi_visible|tojson }}" in boot
    assert 'poi_visibility_json=?' in backend
