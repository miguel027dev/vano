"""Guard the GPS startup and orientation fixes against regression."""
from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

import pytest

MAP = (Path(__file__).resolve().parents[1] / "static" / "vano-map.js").read_text(encoding="utf-8")


def test_start_gps_before_expensive_map_layers():
    loader = MAP[MAP.index("map.on('load',async()=>{"):]
    assert loader.index("bootstrapGps(!SHARED_TOKEN)") < loader.index("await installRuntimeLayers()")
    startup = MAP[MAP.index("function bootstrapGps("):MAP.index("function updateGpsQuality(")]
    assert "maximumAge:cachedFresh?12000:10000" in startup
    assert "setTimeout(finishStartup,3600)" in startup
    assert "startPassiveMapTracking()" in startup


def test_heading_missing_is_not_north_in_navigation_or_routing():
    heading = MAP[MAP.index("function validGpsHeading("):MAP.index("\nfunction routeBearingAt(", MAP.index("function validGpsHeading("))]
    assert "value===null||value===undefined||value===''" in heading
    assert "validGpsHeading(absoluteHeading)??validGpsHeading(lastMarkerHeading)" in MAP
    assert "gpsHeading=validGpsHeading(p.heading)" in MAP
    assert "heading:validGpsHeading(start.heading)" in MAP
    assert "validGpsHeading(start?.heading)!==null" in MAP
    assert "speed<.65&&Number.isFinite(lastRoutePuckBearing)" in MAP
    assert "Number.isFinite(+absoluteHeading)" not in MAP


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js not installed")
def test_heading_and_last_segment_bearing_in_node():
    helper = MAP[MAP.index("function validGpsHeading("):MAP.index("\nfunction routeBearingAt(", MAP.index("function validGpsHeading("))]
    segment = MAP[MAP.index("function routeBearingAtDistance("):MAP.index("\nfunction startupRouteBearing(")]
    script = (
        "const assert=require('node:assert/strict');\n"
        + helper + "\n"
        + "assert.equal(validGpsHeading(null),null);\n"
        + "assert.equal(validGpsHeading(undefined),null);\n"
        + "assert.equal(validGpsHeading(''),null);\n"
        + "assert.equal(validGpsHeading(NaN),null);\n"
        + "assert.equal(validGpsHeading(0),0);\n"
        + "assert.equal(validGpsHeading(360),0);\n"
        + "assert.equal(validGpsHeading(-90),270);\n"
        + "const selectedRoute={geometry:{coordinates:[[0,0],[0.001,0]]}};\n"
        + "const routeTotalGeometry=111;\n"
        + "function routePointAtDistance(d){return [Math.max(0,Math.min(111,d))/111000,0]}\n"
        + "function hav(a,b){return Math.abs(b[0]-a[0])*111000}\n"
        + "function bearingBetween(a,b){return b[0]>a[0]?90:0}\n"
        + segment + "\n"
        + "assert.equal(routeBearingAtDistance(110.99,34),90);\n"
    )
    completed = subprocess.run(["node", "-e", script], text=True, capture_output=True, check=False)
    assert completed.returncode == 0, completed.stderr
