import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planV2FocusCamera} from './v2FocusCamera.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const page=read('../pages/MapPage.jsx');
const map=read('../components/VanoMap.jsx');
const v1=read('./v1CloseChase.mjs');
const standard=read('./standardSimulationCamera.mjs');

test('the normal map and V2 Play keep the same single Mapbox chase/animation pipeline',()=>{
  assert.match(map,/const standardPlay=d\.v2Experience&&d\.simulationPreview/);
  assert.match(map,/const v1Close=d\.readableRouteStroke&&!d\.v2Experience/);
  assert.match(map,/if\(standardPlay&&base\)/);
  assert.match(map,/if\(v1Close&&base\)/);
  assert.match(v1,/planStandardSimulationCamera\(\{\.\.\.options,enabled:true\}\)/);
  assert.match(standard,/planV2RearChase\(/);
  assert.match(map,/map\.jumpTo\(\{\.\.\.pose,padding:smoothPadding\}\)/);
});

test('V2 focus never changes route, marker, direction, pitch, or camera padding',()=>{
  const base={zoom:18.1,pitch:65,bearing:220,center:[-46.68,-23.58],
    cameraPadding:{top:95,bottom:180,left:12,right:12},cameraFollowMarker:true,
    droneCamera:{halfLife:250}};
  assert.strictEqual(planV2FocusCamera({base,enabled:false}),base);
  assert.strictEqual(planV2FocusCamera({base,enabled:true,vehicle:'a-pe'}),base);
  const focused=planV2FocusCamera({base,enabled:true,vehicle:'carro',speed:9});
  assert.ok(focused.zoom>base.zoom);
  assert.strictEqual(focused.center,base.center);
  assert.strictEqual(focused.cameraPadding,base.cameraPadding);
  assert.strictEqual(focused.droneCamera,base.droneCamera);
  assert.equal(focused.pitch,base.pitch);
  assert.equal(focused.bearing,base.bearing);
  assert.equal(focused.cameraFollowMarker,true);
  assert.equal(base.zoom,18.1);
});

test('focus preserves long-range visibility on highways and near real turns',()=>{
  const base={zoom:18.7,pitch:66,bearing:30};
  const straight=planV2FocusCamera({enabled:true,base,vehicle:'carro',speed:8});
  const fast=planV2FocusCamera({enabled:true,base,vehicle:'carro',speed:30});
  const turn=planV2FocusCamera({enabled:true,base,vehicle:'carro',speed:8,maneuver:{distance:35}});
  assert.ok(straight.zoom>fast.zoom);
  assert.ok(fast.zoom>turn.zoom);
  assert.ok(turn.zoom>=base.zoom);
  assert.equal(turn.pitch,base.pitch);
  assert.ok(planV2FocusCamera({enabled:true,base:{zoom:19.2},vehicle:'moto',speed:9}).zoom<=19.25);
});

test('focus controls and camera wiring are isolated to private V2 active navigation',()=>{
  assert.match(page,/const immersiveV2=adminV2RoadSigns&&navMode&&v2FocusMode/);
  assert.match(page,/focusMode=\{immersiveV2\}/);
  assert.match(page,/adminV2RoadSigns&&navMode&&<button type="button" className=\{\x60circle-btn v94-focus-toggle/);
  assert.match(page,/aria-pressed=\{immersiveV2\}/);
  assert.match(page,/!immersiveV2&&!simActive/);
  assert.match(page,/aria-label="Encerrar navegação"/);
  assert.match(map,/enabled:d\.v2Experience&&d\.focusMode&&d\.navigation/);
  assert.match(map,/\[simulationPreview,droneSimulation,navigation,focusMode\]/);
  assert.match(page,/simActive&&<div className=\{\x60v76-sim-badge/);
  assert.match(page,/aria-label=\{simFrame\?\.finished\?'Reiniciar simulação'/);
});
