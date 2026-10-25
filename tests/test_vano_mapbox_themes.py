"""White/Black Mapbox style manifest and integration regression tests (no network)."""

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPBOX = ROOT / "static" / "mapbox"
MANIFEST = json.loads((MAPBOX / "vano-map-config.json").read_text(encoding="utf-8"))


def test_manifest_is_single_source_of_truth_for_base_styles():
    assert MANIFEST["format"] == "vano.mapbox.appearance-manifest/v1"
    for mode, filename, preset, palette in (
        ("light", "vano-light-3d.json", "day", "faded"),
        ("black", "vano-dark-3d.json", "night", "monochrome"),
    ):
        theme = MANIFEST["themes"][mode]
        style = theme["style"]
        assert style == json.loads((MAPBOX / filename).read_text(encoding="utf-8"))
        assert theme["styleUrl"] == f"/mapbox/vano-style/{mode}.json"
        assert style["version"] == 8
        assert style["imports"][0]["url"] == "mapbox://styles/mapbox/standard"
        assert style["imports"][0]["config"]["lightPreset"] == preset
        assert style["imports"][0]["config"]["theme"] == palette
        assert style["imports"][0]["config"]["showRoadLabels"] is True
        assert style["imports"][0]["config"]["showPointOfInterestLabels"] is False
        assert style["imports"][0]["config"]["show3dBuildings"] is True
        assert style["sources"]["vano-terrain"]["type"] == "raster-dem"


def test_stored_theme_has_priority_and_preserves_navigation_rules():
    tc = MANIFEST["themeController"]
    assert tc["storageKey"] == "vano.theme.mode.v200"
    assert tc["overrideByTime"] is False
    assert tc["overrideByWeather"] is False
    assert tc["rehydrateRuntimeLayersAfterStyleLoad"] is True
    route = MANIFEST["designRules"]["route"]
    assert route["primaryColor"] == "#F59A62"
    assert route["redOnlyForConfirmedCongestion"] is True
    assert route["preserveExistingAnimation"] is True
    assert MANIFEST["designRules"]["routing"]["unchangedByThisManifest"] is True
    for name in ("selectedRouteWidthByZoom", "navigationRouteWidthByZoom", "navigationCasingWidthByZoom"):
        exp = route[name]
        assert exp[:3] == ["interpolate", ["linear"], ["zoom"]]
        assert len(exp) == 15
        assert all(isinstance(x, (int, float)) for x in exp[3:])


def test_mapbox_routes_and_js_theme_wiring():
    core = (ROOT / "vano" / "routes" / "core.py").read_text(encoding="utf-8")
    ast.parse(core)
    assert '@app.get("/mapbox/vano-style/<mode>.json")' in core
    assert 'style = _vano_map_appearance_manifest()["themes"][mode]["style"]' in core
    assert 'white_style = url_for("vano_mapbox_style", mode="light")' in core
    assert 'black_style = url_for("vano_mapbox_style", mode="black")' in core
    boot = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    assert "mapVisualRules:{{ map_visual_rules|tojson }}" in boot
    js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    assert "STYLE_SET?.black||STYLE_SET?.night" in js
    assert "MAP_ROUTE_RULES=MAP_VISUAL_RULES.route||{}" in js
    for rule in ("selectedRouteWidthByZoom", "navigationRouteWidthByZoom", "navigationCasingWidthByZoom"):
        assert f"vanoRouteWidth('{rule}'" in js
    assert "map.on('style.load',async()=>{" in js
    assert "restoreRuntimeMapState();" in js
    assert "window.addEventListener('vano:themechange'" in js
    api = (ROOT / "vano" / "routes" / "api.py").read_text(encoding="utf-8")
    assert api.count('mapbox_style=url_for("vano_mapbox_style", mode="light")') == 2

