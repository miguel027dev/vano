import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planStandardSimulationCamera} from './standardSimulationCamera.mjs';
import {cameraTarget} from './navigationMotion.js';
import {planManeuverCamera} from './navigationCameraPlanner.js';

const puck=[-46.689,-23.585];
const center=[-46.688,-23.5846];
const base={center,zoom:16.45,pitch:22,bearing:85,state:'FOLLOWING'};
const route={steps:[
  {type:'on ramp',modifier:'slight right'},
  {type:'turn',modifier:'left'},
  {type:'roundabout',modifier:'right'}
]};
function plan(maneuver,more={}){
  return planStandardSimulationCamera({
    enabled:true,base,position:puck,vehicle:'carro',route,
    speed:12,accuracy:8,maneuver,...more
  });
}

test('Play camera has a rear-tilted chase view with the animated pointer visible',()=>{
  const view=plan(null);
  assert.equal(view.pitch,48);
  assert.ok(view.zoom>=16.82&&view.zoom<=17.45);
  assert.equal(view.bearing,base.bearing);
  assert.ok(view.center[0]>puck[0]&&view.center[0]<base.center[0]);
  assert.ok(view.center[1]>puck[1]&&view.center[1]<base.center[1]);
  assert.deepEqual(puck,[-46.689,-23.585]);
  assert.deepEqual(base,{center,zoom:16.45,pitch:22,bearing:85,state:'FOLLOWING'});
});

test('Play approaches confirmed entrance with gentle monotonic zoom, no snap or zoom-out',()=>{
  const far=plan({stepIndex:0,kind:'on ramp',distance:700});
  const approach=plan({stepIndex:0,kind:'on ramp',distance:175});
  const close=plan({stepIndex:0,kind:'on ramp',distance:55});
  assert.equal(far.zoom,16.82);
  assert.ok(approach.zoom>far.zoom);
  assert.ok(close.zoom>approach.zoom);
  assert.ok(close.zoom-far.zoom<.28);
  assert.ok(close.pitch>=44&&close.pitch<=48);
  assert.ok(close.center[0]<far.center[0],'near maneuver camera anchors closer to the puck');
});

test('realistic turns get small zoom; roundabouts keep more exits in frame',()=>{
  const turn=plan({stepIndex:1,kind:'turn',modifier:'left',distance:20});
  const circle=plan({stepIndex:2,kind:'roundabout',distance:20});
  const neutral=plan(null);
  assert.ok(turn.zoom>neutral.zoom);
  assert.ok(turn.zoom-neutral.zoom<.22);
  assert.ok(circle.zoom<neutral.zoom);
  assert.ok(circle.pitch<neutral.pitch);
  assert.equal(circle.bearing,base.bearing,'do not rotate camera to invented road heading');
});

test('compact screen keeps enough perspective, bounded zoom and pointer placement',()=>{
  const view=plan({stepIndex:0,kind:'on ramp',distance:0},{
    compactViewport:true,
    base:{...base,zoom:16.5,pitch:22}
  });
  assert.ok(view.pitch>=38&&view.pitch<=44);
  assert.ok(view.zoom<=17.05);
  assert.ok(view.center[0]>puck[0]&&view.center[0]<base.center[0]);
});

test('bad GPS, missing provider maneuvers and reduced motion cannot trigger closeup',()=>{
  const safe=plan({stepIndex:0,kind:'on ramp',distance:30},{accuracy:120});
  const noStep=plan({stepIndex:0,distance:30},{route:{steps:[]}});
  const negative=plan({stepIndex:0,kind:'on ramp',distance:-12});
  const idle=plan(null);
  assert.equal(safe.zoom,idle.zoom);
  assert.equal(noStep.zoom,idle.zoom);
  assert.equal(negative.zoom,idle.zoom);
  assert.equal(plan({stepIndex:0,kind:'on ramp',distance:30},{reducedMotion:true}),base);
  assert.equal(plan({stepIndex:0,kind:'on ramp',distance:30},{enabled:false}),base);
  assert.equal(plan({stepIndex:0,kind:'on ramp',distance:30},{vehicle:'a-pe'}),base);
});

test('original camera remains unchanged and new framing is only for V2 regular Play',()=>{
  const road={geometry:{type:'LineString',coordinates:[puck,[-46.688,-23.585]]},
    steps:[{type:'on ramp',modifier:'right'}]};
  const telemetry={speed:12,heading:90,accuracy:8};
  const focus=planManeuverCamera({navigation:true,route:road,maneuver:{stepIndex:0,kind:'on ramp',distance:30},speed:12});
  const actual=cameraTarget({navigation:true,position:puck,route:road,telemetry,maneuverPlan:focus});
  const standard=cameraTarget({navigation:true,position:puck,route:road,telemetry});
  assert.ok(actual.zoom<standard.zoom,'real navigation retains the existing exit zoom-out');
  const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(src,/d\.v2Experience&&d\.simulationPreview&&!d\.droneSimulation/);
  assert.match(src,/const framedManeuver=standardPlay\?/);
  assert.match(src,/if\(standardPlay&&base\)\{/);
  assert.match(src,/if\(!d\.droneSimulation\|\|!base\)return realCameraDistance\(d,route,base,now\)/);
  assert.match(src,/planStandardSimulationCamera\(\{/);
  const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
  assert.match(page,/simulationPreview=\{simActive\} droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
});
