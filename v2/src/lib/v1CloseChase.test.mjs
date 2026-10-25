import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planStandardSimulationCamera} from './standardSimulationCamera.mjs';
import {planV1CloseChase} from './v1CloseChase.mjs';

const position=[-46.69,-23.58];
const base={center:[-46.689,-23.579],zoom:16.6,pitch:42,bearing:80};
const viewport={padding:{top:145,bottom:175,left:20,right:20},
  visibleHeight:440,markerRadius:42,compact:false};
const options={enabled:true,base,position,vehicle:'carro',speed:12,
  heading:80,markerBearing:80,accuracy:9,viewport,
  route:{geometry:{type:'LineString',coordinates:[position,[-46.689,-23.58]]},
    steps:[{type:'on ramp',modifier:'slight right'}]}};

test('public V1 uses V2 follow camera with a closer zoom and identical pitch/animation',()=>{
  const regular=planStandardSimulationCamera(options);
  const close=planV1CloseChase(options);
  assert.ok(close.zoom>regular.zoom+.4);
  assert.ok(close.zoom<=18.9);
  assert.equal(close.pitch,regular.pitch);
  assert.deepEqual(close.center,position);
  assert.equal(close.bearing,regular.bearing);
  assert.deepEqual(close.cameraPadding,regular.cameraPadding);
  assert.deepEqual(close.droneCamera,regular.droneCamera);
  assert.equal(close.cameraFollowMarker,true);
  assert.deepEqual(base,{center:[-46.689,-23.579],zoom:16.6,pitch:42,bearing:80});
});

test('close follow never fabricates a GPS location or fights unreliable telemetry',()=>{
  assert.strictEqual(planV1CloseChase({...options,accuracy:120}),base);
  assert.strictEqual(planV1CloseChase({...options,accuracy:null}),base);
  assert.strictEqual(planV1CloseChase({...options,enabled:false}),base);
  assert.strictEqual(planV1CloseChase({...options,vehicle:'a-pe'}),base);
  assert.strictEqual(planV1CloseChase({...options,reducedMotion:true}),base);
  const highway=planV1CloseChase({...options,speed:30});
  const regularHighway=planStandardSimulationCamera({...options,speed:30});
  assert.ok(highway.zoom>regularHighway.zoom);
  assert.ok(highway.zoom-regularHighway.zoom<.35);
});

test('both route screens display stronger, provider-only direction arrows',()=>{
  const source=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(source,/const arrowsEnabled=Boolean\(data\.v2Experience\|\|data\.readableRouteStroke\)/);
  assert.match(source,/const showArrows=Boolean\(data\.readableRouteStroke\|\|data\.v2Experience\)/);
  assert.match(source,/planV1CloseChase\(\{/);
  assert.match(source,/v1Close&&base/);
  assert.match(source,/minzoom:14\.2/);
  assert.match(source,/17,7\.1,18,8\.3,19,9\.3/);
  assert.match(source,/map\._vanoArrowLineGroup\?\.eachLayer/);
  assert.match(source,/const smoothChaseYaw=t\.cameraFollowMarker\?82\*dt\/1000:maxYawStep/);
});
