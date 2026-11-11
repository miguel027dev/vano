"""White/Black Mapbox style manifest and integration regression tests (no network)."""

import ast
import json
import re
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



def test_all_existing_map_icons_are_present_and_reloaded_in_both_themes():
    js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    match = re.search(r"const VANO_MAP_ICONS=\{(.*?)\};", js, re.DOTALL)
    assert match, "VANO icon catalog not found"
    icons = dict(re.findall(r"([A-Za-z]\w*):'([^']+)'", match.group(1)))
    assert len(icons) >= 40, "VANO marker/POI catalog unexpectedly reduced"
    for key in ("radar", "signal", "pharmacy", "parking", "school", "trainStation", "alertAccident", "alertTraffic", "alertFlood"):
        assert key in icons, f"missing existing VANO icon: {key}"
    for key, url in icons.items():
        path = ROOT / (url.removeprefix("/") if url.startswith("/") else "static/icons/vano/" + url)
        assert path.is_file(), f"missing icon asset for {key}: {path}"
    assert "async function registerSparkMapIcons()" in js
    assert "await registerSparkMapIcons();" in js
    assert "map.on('style.load',async()=>{" in js
    assert "await installRuntimeLayers();" in js
    assert "mapbox://mapbox.mapbox-streets-v8" in js
    for layer in ("vano-secondary-pois-icons", "vano-secondary-transit-icons", "vano-secondary-airport-icons", "road-controls-secondary-icons", "alerts-marker-symbol"):
        assert f"id:'{layer}'" in js, f"missing existing symbol layer: {layer}"


def test_map_poi_choices_keep_essential_layers_independent():
    """Optional categories are persisted but banks, parks and road symbols remain visible."""
    js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    assert "VANO_POI_ALWAYS=['bank','park']" in js
    assert "Array.isArray(BOOT.poiVisible)" in js
    assert "VANO_POI_SELECTED.has('train_station')" in js
    assert "VANO_POI_SELECTED.has('airport')" in js
    assert "filter:vanoPoiFilterExpr()" in js
    for name in ("pharmacy", "parking", "fuel", "hospital", "school", "police",
                 "cafe", "fitness", "supermarket", "shopping", "toll", "restaurant"):
        assert name in js
    assert "road-controls-secondary-icons" in js
    assert "await registerSparkMapIcons();" in js
    assert "map.on('style.load',async()=>{" in js
    assert "bank" in MANIFEST["designRules"]["labelsAndPoi"]["alwaysKeepCategories"]
