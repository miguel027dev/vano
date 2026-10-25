"""SVG map icons and Mapbox Streets v8 source regression guards."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "static/vano-map.js").read_text(encoding="utf-8")
ICON_DIR = ROOT / "static/icons/vano"
NAMES = ("market","supermarket","mall","evCharge","evStation","carwash","hotel","school","fitness","park","petShop","post","pharmacy","restaurant","fastFood","cafe","busTerminal","trainStation","railwayStation","airport",)

def test_svg_assets_are_valid_and_match_original_secondary_geometry():
    for key in NAMES:
        filename = "poi-" + re.sub(r"([A-Z])", lambda m: "-" + m.group(1).lower(), key) + ".svg"
        root = ET.parse(ICON_DIR / filename).getroot()
        assert root.attrib["viewBox"] == "0 0 64 64"
        assert root.attrib["width"] == "64"
        assert root.attrib["height"] == "64"
        assert f"{key}:'{filename}'" in JS
        rectangles = [x for x in root.iter() if x.tag.endswith("rect")]
        assert rectangles and rectangles[0].attrib.get("rx") == "15"

def test_layers_use_mapbox_streets_and_preference_whitelist():
    assert "mapbox://mapbox.mapbox-streets-v8" in JS
    for layer in ("vano-secondary-pois-icons", "vano-secondary-transit-icons", "vano-secondary-airport-icons"):
        assert layer in JS
    for old in ("poi-bank.svg", "poi-parking.svg", "poi-pedestrian-crossing.svg", "poi-railway-crossing.svg"):
        assert old in JS
    import ast
    whitelist = re.search(r"const VANO_POI_MAKI=(\[[^;]+\]);", JS)
    assert whitelist
    supported = set(ast.literal_eval(whitelist.group(1)))
    assert {"bank", "park", "parking", "charging-station", "restaurant", "fitness-centre", "school", "pharmacy", "cafe", "grocery"} <= supported
    assert not ({"fast-food", "lodging", "convenience", "bus"} & supported)
    assert "VANO_POI_SELECTED" in JS
    assert "'icon-allow-overlap':false" in JS
    assert "'icon-pitch-alignment':'viewport'" in JS


def test_transit_stations_are_filtered_not_all_stops():
    assert "VANO_POI_SELECTED.has('train_station')" in JS
    assert "['rail','rail-light','rail-metro']" in JS
    assert "transit_stop_label" in JS and "airport_label" in JS
