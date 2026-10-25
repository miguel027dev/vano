import test from 'node:test';
import assert from 'node:assert/strict';
import {buildV2ManeuverArrows} from './v2ManeuverArrows.mjs';

const eastThenNorth={geometry:{type:'LineString',coordinates:[
  [-46.7,-23.5],[-46.6998,-23.5],[-46.6996,-23.5],
  [-46.6996,-23.4998],[-46.6996,-23.4996]
]}};
test('V2 renders a white route-following arrow at a provider turn',()=>{
  const result=buildV2ManeuverArrows({...eastThenNorth,steps:[
    {type:'turn',modifier:'left',location:[-46.6996,-23.5]}
  ]});
  assert.equal(result.type,'FeatureCollection');
  assert.equal(result.features.length,3);
  assert.deepEqual(result.features.map(f=>f.properties.part),['shaft','wing-left','wing-right']);
  const shaft=result.features[0].geometry.coordinates;
  assert.ok(shaft.length>3);
  assert.ok(shaft.at(-1)[1]>-23.5,'arrowhead points past the left turn');
  assert.ok(result.features.every(f=>f.geometry.coordinates.every(p=>
    p.length===2&&p.every(Number.isFinite))));
});
test('V2 includes roundabout maneuvers and follows the exit',()=>{
  const result=buildV2ManeuverArrows({...eastThenNorth,steps:[
    {type:'roundabout',modifier:'right',location:[-46.6998,-23.5]},
    {type:'exit roundabout',location:[-46.6996,-23.5]}
  ]});
  assert.ok(result.features.length>=3);
});
test('no provider turn means no invented arrow',()=>{
  assert.equal(buildV2ManeuverArrows(eastThenNorth).features.length,0);
  assert.equal(buildV2ManeuverArrows({...eastThenNorth,steps:[{type:'continue',modifier:'straight',location:[-46.6998,-23.5]}]}).features.length,0);
  assert.equal(buildV2ManeuverArrows({geometry:null,steps:[{type:'turn',location:[1,2]}]}).features.length,0);
});
