"""R2 navigation motion: deterministic frame/transition checks."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "static/vano-map.js").read_text(encoding="utf-8")


def _node(script):
    p = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                       timeout=15, check=False)
    assert p.returncode == 0, p.stdout + p.stderr


def _extract(begin, end):
    assert begin in JS and end in JS
    return JS.split(begin, 1)[1].split(end, 1)[0]


def test_bound_bearing_prevents_abrupt_yaw_and_uses_short_arc():
    fn = "function boundCameraBearing(" + _extract(
        "function boundCameraBearing(", "function setNavCameraState(")
    # The helper ends before setNavCameraState in the source, but it also
    # contains a preceding comment; no extra top-level browser code is needed.
    _node("""
const profile='driving';
""" + fn + """
const assert=require('node:assert/strict');
let prev=10;
for(let i=0;i<20;i++){
  const next=boundCameraBearing(prev,190,16,12,{decision:true});
  const diff=((next-prev+540)%360)-180;
  assert.ok(Math.abs(diff)<=4.1, 'excess yaw step '+diff);
  prev=next;
}
assert.ok(prev>45&&prev<100);
const wrap=boundCameraBearing(359,1,16,6,{decision:false});
assert.ok(wrap>359||wrap<2,'must turn through north');
assert.equal(boundCameraBearing(NaN,40,16,0,null),40);
assert.ok(Number.isFinite(boundCameraBearing(40,NaN,16,0,null))===false);
""")


def test_junction_focus_has_short_hysteresis_not_stuck_on_next_route():
    # Extract only the function until screen-corridor helpers.
    fn="function cameraJunctionContext(" + _extract(
        "function cameraJunctionContext(", "// Screen-distance heuristic:")
    _node("""
let cameraMotionRouteEpoch=3;
let cameraJunctionMemory={epoch:3,decision:false,large:false,roundabout:false,until:0};
let now=1000;
const performance={now:()=>now};
const cameraVehicleTuning=()=>({decisionDistance:225,largeAngle:38});
""" + fn + """
const assert=require('node:assert/strict');
let a=cameraJunctionContext({}, {remainingInStep:120,type:'turn'}, {angle:48});
assert.equal(a.decision,true);assert.equal(a.large,true);
now=1200;
a=cameraJunctionContext({}, {remainingInStep:130,type:'turn'}, {angle:0});
assert.equal(a.decision,true,'momentary GPS noise must not blink camera');
now=1700;
a=cameraJunctionContext({}, {remainingInStep:130,type:'turn'}, {angle:0});
assert.equal(a.decision,false,'hysteresis must expire');
now=1750;
a=cameraJunctionContext({}, {remainingInStep:100,type:'roundabout'}, {angle:0});
assert.equal(a.roundabout,true);
cameraMotionRouteEpoch++;
a=cameraJunctionContext({}, {remainingInStep:100,type:'turn'}, {angle:0});
assert.equal(a.decision,false,'old route must not leak maneuver memory');
""")


def test_single_writer_live_launch_and_recenter():
    launch=_extract("function primeNavigationCamera(p,m){", "function blendNumber(")
    recenter=_extract("async function calibrateNavigation(){", "function syncSoundButton(")
    assert "scheduleCamera(p,false,m)" in launch
    assert "scheduleCamera(pos,false,m)" in recenter
    assert "map.easeTo(" not in launch
    assert "map?.easeTo?.({center:target.center" not in recenter
    assert "navLaunchAnimationUntil=0" in launch
    assert "launchSequence!==navCameraLaunchSequence" in launch


def test_per_frame_yaw_limits_are_applied():
    frame=_extract("function cameraMotionTick(ts){", "function stopCameraMotion(){")
    assert "cameraVisualState.bearing=boundCameraBearing(" in frame
    assert "map.jumpTo(" in frame
    assert "map.easeTo(" not in frame


def test_async_reroute_completion_cannot_restart_finished_trip():
    reroute=_extract("async function performNavReroute(", "function rerouteFrom(")
    active=_extract("async function activateNavigationAt(", "function ensureAdminSimulationControl(")
    end=_extract("async function finishTrip(", "async function copyText(")
    assert "const rerouteSession=navMotionSessionEpoch" in reroute
    assert "rerouteSession!==navMotionSessionEpoch" in reroute
    assert "navMotionSessionEpoch++" in active
    assert "navMotionSessionEpoch++" in end


def test_route_geometry_invalidation_and_clean_teardown():
    alternative=_extract("function adoptNavigationAlternative(", "function maybeAdoptNavigationAlternative(")
    reroute=_extract("async function performNavReroute(", "function rerouteFrom(")
    assert "buildMetrics();invalidateCameraManeuverContext();" in alternative
    assert "buildMetrics();invalidateCameraManeuverContext();" in reroute
    assert "invalidateCameraManeuverContext();resetMapMatchHysteresis();" in JS
