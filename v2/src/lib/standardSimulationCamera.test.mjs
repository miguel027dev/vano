import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planStandardSimulationCamera} from './standardSimulationCamera.mjs';
import {planV2RearChase} from './v2DroneCamera.mjs';
import {V2_SIM_REFERENCE,v2SimulationChasePadding} from './v2SimulationChase.mjs';
import {cameraTarget} from './navigationMotion.js';
import {planManeuverCamera} from './navigationCameraPlanner.js';

const puck=[-46.689,-23.585];
const center=[-46.688,-23.5846];
const base={center,zoom:16.45,pitch:22,bearing:85,state:'FOLLOWING'};
const viewport={padding:{top:148,bottom:180,left:20,right:20},
  visibleHeight:420,markerRadius:48,compact:false};
const route={steps:[
  {type:'on ramp',modifier:'slight right'},
  {type:'turn',modifier:'left'},
  {type:'roundabout',modifier:'right'}
]};
function plan(maneuver,more={}){
  return planStandardSimulationCamera({
    enabled:true,base,position:puck,vehicle:'carro',route,viewport,
    speed:12,accuracy:8,heading:85,maneuver,...more
  });
}

test('Play uses the same rear-chase visual reference as V2 SIM',()=>{
  const view=plan(null);
  const v2=planV2RearChase({enabled:true,vehicle:'carro',speed:12,
    maneuver:null,route,accuracy:8});
  assert.equal(view.pitch,v2.pitch);
  assert.equal(view.zoom,v2.zoom);
  assert.ok(Math.abs(view.pitch-V2_SIM_REFERENCE.pitch)<1);
  assert.ok(Math.abs(view.zoom-V2_SIM_REFERENCE.zoom)<.2);
  assert.deepEqual(view.center,puck,'never invent forward position');
  assert.deepEqual(view.cameraPadding,v2SimulationChasePadding(viewport));
  assert.equal(view.bearing,85);
  assert.equal(view.cameraFollowMarker,true);
  assert.deepEqual(puck,[-46.689,-23.585]);
  assert.deepEqual(base,{center,zoom:16.45,pitch:22,bearing:85,state:'FOLLOWING'});
});

test('Play progressively closes toward confirmed ramps with no zoom-out',()=>{
  const far=plan({stepIndex:0,kind:'on ramp',distance:700});
  const near=plan({stepIndex:0,kind:'on ramp',distance:110});
  const close=plan({stepIndex:0,kind:'on ramp',distance:15});
  assert.ok(near.zoom>far.zoom);
  assert.ok(close.zoom>near.zoom);
  assert.ok(close.zoom-far.zoom<=.35);
  assert.ok(close.pitch>=far.pitch);
  assert.deepEqual(far.center,puck);
  assert.deepEqual(close.center,puck);
});

test('Play matches V2 SIM on long straights, rotations, bifurcations, roundabouts',()=>{
  const common={enabled:true,vehicle:'carro',speed:12,
    straightAheadMeters:640,route,accuracy:8};
  const situations=[
    {kind:'continue',distance:950},
    {kind:'turn',modifier:'left',distance:20},
    {kind:'fork',distance:60},
    {kind:'roundabout',distance:60},
    {kind:'uturn',distance:40},
    {kind:'arrival',distance:35}
  ];
  for(const maneuver of situations){
    const play=plan(maneuver,{straightAheadMeters:640});
    const v2=planV2RearChase({...common,maneuver});
    assert.ok(Math.abs(play.zoom-v2.zoom)<1e-10,maneuver.kind+' zoom');
    assert.ok(Math.abs(play.pitch-v2.pitch)<1e-10,maneuver.kind+' pitch');
  }
  const roundabout=plan({kind:'roundabout',distance:60});
  const turn=plan({kind:'turn',modifier:'left',distance:60});
  assert.ok(roundabout.zoom<turn.zoom);
  assert.ok(roundabout.pitch<turn.pitch);
});

test('scene occlusion and compact viewport share the same V2 safety bounds',()=>{
  const dense=plan({kind:'continue',distance:800},{urbanDensity:1,obstruction:1});
  const open=plan({kind:'continue',distance:800});
  assert.ok(dense.pitch<open.pitch);
  const mobile=plan({kind:'on ramp',stepIndex:0,distance:20},{
    compactViewport:true,viewport:{...viewport,compact:true}});
  assert.ok(mobile.zoom>=16.90&&mobile.zoom<=17.65);
  assert.ok(mobile.pitch>=30&&mobile.pitch<=61);
  assert.ok(dense.zoom>=16.90&&dense.zoom<=17.65);
});

test('poor GPS, unknown provider, rewind and accessibility are conservative',()=>{
  const idle=plan(null);
  const poor=plan({kind:'on ramp',stepIndex:0,distance:12},{accuracy:120});
  const empty=plan({stepIndex:0,distance:12},{route:{steps:[]}});
  const invalid=plan({kind:'on ramp',stepIndex:0,distance:-8});
  assert.equal(poor.zoom,idle.zoom);
  assert.equal(empty.zoom,idle.zoom);
  assert.equal(invalid.zoom,idle.zoom);
  assert.strictEqual(plan({kind:'on ramp',stepIndex:0,distance:30},{reducedMotion:true}),base);
  assert.strictEqual(plan({kind:'on ramp',stepIndex:0,distance:30},{enabled:false}),base);
  assert.strictEqual(plan({kind:'on ramp',stepIndex:0,distance:30},{vehicle:'a-pe'}),base);
});

test('physical marker heading only: camera does not anticipate upcoming turn',()=>{
  const raw=[0,0,0,18,48,85,90];
  const sequence=raw.map(markerBearing=>
    plan({kind:'on ramp',stepIndex:0,distance:20},{
      markerBearing,base:{...base,bearing:90}
    }));
  assert.deepEqual(sequence.map(x=>x.bearing),raw);
  assert.ok(sequence.every(x=>JSON.stringify(x.center)===JSON.stringify(puck)));
  assert.ok(sequence.every(x=>x.zoom===sequence[0].zoom));
  assert.ok(sequence.every(x=>x.pitch===sequence[0].pitch));
  const unavailable=plan(null,{heading:null,markerBearing:null});
  assert.equal(unavailable.bearing,null,'unknown heading must not steer from road bearing');
});

test('Play and V2 buttons stay independent; only admin Play gets new chase',()=>{
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
  const planner=readFileSync(new URL('./standardSimulationCamera.mjs',import.meta.url),'utf8');
  assert.match(map,/const standardPlay=d\.v2Experience&&d\.simulationPreview&&!d\.droneSimulation/);
  assert.match(map,/if\(standardPlay&&base\)\{/);
  assert.match(map,/const scene=sampleStandardPlayScene\(d,route,now\)/);
  assert.match(map,/urbanDensity:scene\.density,obstruction:scene\.obstruction/);
  assert.match(map,/if\(!d\.droneSimulation\|\|!base\)return realCameraDistance/);
  assert.match(map,/const scene=sampleDroneScene\(d,route,now\)/);
  assert.match(page,/droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
  assert.match(page,/simCameraMode==='drone'\?V2_DRONE_PLAYBACK_RATE:undefined/);
  assert.match(page,/onClick=\{simActive\?stopRouteSimulation:startRouteSimulation\}/);
  assert.match(page,/onClick=\{startV2DroneSimulation\}/);
  assert.match(planner,/planV2RearChase\(\{/);
});

test('live navigation camera retains its original provider turn zoom-out',()=>{
  const road={geometry:{type:'LineString',coordinates:[puck,[-46.688,-23.585]]},
    steps:[{type:'on ramp',modifier:'right'}]};
  const telemetry={speed:12,heading:90,accuracy:8};
  const focus=planManeuverCamera({navigation:true,route:road,maneuver:
    {stepIndex:0,kind:'on ramp',distance:30},speed:12});
  const original=cameraTarget({navigation:true,position:puck,route:road,telemetry,maneuverPlan:focus});
  const regular=cameraTarget({navigation:true,position:puck,route:road,telemetry});
  assert.ok(original.zoom<regular.zoom);
  const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(src,/const framedManeuver=standardPlay\?/);
  assert.match(src,/if\(!d\.droneSimulation\|\|!base\)return realCameraDistance/);
});

test('single motion writer eases safe camera padding and yaw across mode changes',()=>{
  const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(src,/const targetPadding=t\.cameraPadding\|\|defaultPadding/);
  assert.match(src,/chasePaddingTop=damp\(chasePaddingTop,chasePaddingGoal,dt/);
  assert.match(src,/const nextBearing=t\.cameraFollowMarker&&!reduced\?/);
  assert.match(src,/const maxYawStep=\(latest\.current\.droneSimulation\|\|latest\.current\.v2Experience&&latest\.current\.simulationPreview\?82:72\)\*dt\/1000/);
  assert.match(src,/playSceneRoute=null;lastPlaySceneSample=0/);
  assert.match(src,/if\(d\.v2Experience&&!standardPlay\)/);
  assert.match(src,/if\(!simulationPreview&&!droneSimulation\)/);
  assert.match(src,/\[v2Experience,simulationPreview,droneSimulation,appearance,layer\]/);
  assert.match(src,/if\(navigation&&backend\.current==='mapbox'\)motion\.current\?\.start\(\)/);
});
