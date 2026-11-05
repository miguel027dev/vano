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


def test_map_only_hides_requested_poi_categories_and_keeps_banks():
    """Hide noisy marker classes without deleting icon files or search support."""
    js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    match = re.search(r"const VANO_POI_MAKI=(\[[^;]+\]);", js)
    assert match, "visible custom POI whitelist not found"
    import ast as py_ast
    visible = set(py_ast.literal_eval(match.group(1)))
    assert {"bank", "parking", "charging-station", "restaurant", "fast-food", "park", "post"} <= visible
    assert not ({"pharmacy", "lodging", "grocery", "convenience", "cafe", "school"} & visible)
    special = js.split("const VANO_POI_SPECIAL=[", 1)[1].split("];", 1)[0]
    for hidden in ("pet shop", "pet store", "petshop", "supermarket", "hypermarket"):
        assert hidden not in special
    for kept in ("car wash", "shopping mall", "charging point"):
        assert kept in special
    # Image files remain registered for any existing search/route components.
    icon_catalog = js.split("const VANO_MAP_ICONS={", 1)[1].split("};", 1)[0]
    for icon in ("bank:", "pharmacy:", "market:", "hotel:", "petShop:", "cafe:"):
        assert icon in icon_catalog
    assert "filter:vanoPoiFilterExpr()" in js
    assert "await registerSparkMapIcons();" in js
    assert "map.on('style.load',async()=>{" in js
    labels = MANIFEST["designRules"]["labelsAndPoi"]
    assert {"pharmacy", "hotel", "market", "supermarket", "school", "pet-shop"} <= set(labels["hiddenCategories"])
    assert "bank" in labels["alwaysKeepCategories"]


def test_white_and_black_have_identical_gps_terrain_and_projection():
    """Visual themes must not change the camera's geographic projection or elevation."""
    light = MANIFEST["themes"]["light"]["style"]
    black = MANIFEST["themes"]["black"]["style"]
    for key in ("projection", "sources", "terrain"):
        assert light[key] == black[key], f"map themes diverge on geographic {key}"

    js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    assert "applyVanoLightBasemapConfig" not in js, (
        "The light map must not mutate its imported basemap after initial loading"
    )
    assert "map.on('load',async()=>{" in js
    assert "bootstrapGps(!SHARED_TOKEN);" in js
