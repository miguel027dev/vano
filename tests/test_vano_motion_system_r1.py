"""Contract and geometry checks for the VANO Motion System R1 rollout."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def source(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_motion_camera_limits_are_consistent_for_installed_android():
    js = source("static/vano-map.js")
    assert "zoomBase:installedAndroid?17.56:17.34" in js
    assert "zoomBase:installedAndroid?17.48:17.24" in js
    assert "const maxZoom=installedAndroid?(profile==='motorcycle'?17.72:17.60)" in js
    assert ":(profile==='motorcycle'?17.48:17.58)" in js
    assert "Math.min(maxZoom,zoom)" in js


def test_camera_padding_uses_measured_android_hud_and_no_per_frame_dom_reads():
    layout = source("static/vano-android-nav-layout.js")
    map_js = source("static/vano-map.js")
    assert "window.__VANO_NAV_SAFE_VIEWPORT={" in layout
    assert "window.__VANO_NAV_SAFE_VIEWPORT=null;" in layout
    assert "ResizeObserver" in layout
    assert "const safe=window.__VANO_NAV_SAFE_VIEWPORT;" in map_js
    assert "padding.top=Math.round(top);" in map_js
    assert "padding.bottom=Math.round(bottom);" in map_js
    frame = map_js.split("function cameraMotionTick(ts){", 1)[1].split("function stopCameraMotion(){", 1)[0]
    assert "getBoundingClientRect" not in frame
    assert "window.__VANO_NAV_SAFE_VIEWPORT" not in frame


def test_urban_building_queries_are_throttled_and_optional():
    js = source("static/vano-map.js")
    urban = js.split("function cameraUrbanContext(p,ts){", 1)[1].split("function cameraDynamicProgress(", 1)[0]
    assert "cameraUrbanSampleAt<gap" in urban
    assert "map.queryRenderedFeatures" in urban
    assert "screenDistanceToSegment" in urban
    assert "routePointAtDistance" in urban
    assert "performanceTier!=='eco'" in urban
    assert "vano-android-shell" in urban
    assert "cameraUrbanOccluded?" in urban
    assert "count>=48" in urban
    assert "props.height??props.render_height??props.building_height" in urban
    assert "cameraUrbanOcclusion" in urban


def test_building_avoidance_does_not_rewrite_mapbox_style_or_overclaim_height():
    js = source("static/vano-map.js")
    urban = js.split("function cameraUrbanContext(p,ts){", 1)[1].split("function cameraDynamicProgress(", 1)[0]
    assert "setPaintProperty" not in urban
    assert "setStyle(" not in urban
    assert "if(urban.occluded&&!calibrating&&!junction.large" in js
    assert "pitch=Math.max(34,pitch-strength*9)" in js


def test_reroutes_preserve_interpolated_camera_and_guard_launch_timeout():
    js = source("static/vano-map.js")
    assert "navCameraLaunchSequence=0" in js
    assert "launchSequence=++navCameraLaunchSequence" in js
    assert "launchSequence!==navCameraLaunchSequence" in js
    assert "function stopCameraMotion(){navCameraLaunchSequence++" in js
    alt = js.split("function adoptNavigationAlternative(", 1)[1].split("function maybeAdoptNavigationAlternative(", 1)[0]
    reroute = js.split("async function performNavReroute(", 1)[1].split("function rerouteFrom(", 1)[0]
    assert "cameraVisualState=null" not in alt
    assert "cameraVisualState=null" not in reroute
    assert "intent!=='reroute'" in js


def test_motion_hud_is_android_only_and_respects_reduced_motion():
    css = source("static/vano-foundation.css")
    assert "VANO MOTION SYSTEM R1" in css
    assert "vano-motion-sheet-r1" in css
    assert "vano-motion-enter-r1" in css
    assert "html.vano-android-shell body.vano-map-surface" in css
    assert "@media(prefers-reduced-motion:reduce)" in css


def test_screen_corridor_distance_math_with_node():
    """Execute the pure screen-space helper for on-line, behind-end and degenerate points."""
    js = source("static/vano-map.js")
    helper = js.split("function screenDistanceToSegment(", 1)[1].split("function cameraUrbanContext(", 1)[0]
    runtime = ("function screenDistanceToSegment(" + helper +
               """
const assert = require('node:assert/strict');
function close(a,b){assert.ok(Math.abs(a-b)<.001, String(a)+' vs '+String(b));}
close(screenDistanceToSegment(5,0,0,0,10,0),0);
close(screenDistanceToSegment(5,3,0,0,10,0),3);
close(screenDistanceToSegment(-3,4,0,0,10,0),5);
close(screenDistanceToSegment(14,3,0,0,10,0),5);
close(screenDistanceToSegment(2,2,0,0,0,0),Math.sqrt(8));
close(screenDistanceToSegment(1,1,0,0,10,10),0);
""")
    result = subprocess.run(["node", "-e", runtime], capture_output=True, text=True, timeout=10, check=False)
    assert result.returncode == 0, result.stdout + result.stderr
