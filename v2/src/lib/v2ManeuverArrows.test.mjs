import test from 'node:test';
import assert from 'node:assert/strict';
import {buildV2ManeuverArrows} from './v2ManeuverArrows.mjs';

const eastThenNorth={geometry:{type:'LineString',coordinates:[
  [-46.7,-23.5],[-46.6998,-23.5],[-46.6996,-23.5],
  [-46.6996,-23.4998],[-46.6996,-23.4996]
]}};
const cue=step=>buildV2ManeuverArrows({...eastThenNorth,steps:[{
  location:[-46.6996,-23.5],...step
}]});
test('V2 arrow follows the provider turn instead of pointing down the original road',()=>{
  const result=cue({type:'turn',modifier:'left'});
  assert.equal(result.features.length,3);
  assert.deepEqual(result.features.map(f=>f.properties.part),['shaft','wing-left','wing-right']);
  assert.ok(result.features[0].geometry.coordinates.length>3);
  assert.ok(result.features[0].geometry.coordinates.at(-1)[1]>-23.5);
  assert.ok(result.features.every(f=>f.geometry.coordinates.every(p=>
    p.length===2&&p.every(Number.isFinite))));
});
test('V2 arrow marks a right/left road split, on-ramp and bridge-access instruction',()=>{
  for(const maneuver of [
    {type:'fork',modifier:'slight right'},
    {type:'on ramp',modifier:'slight left'},
    {type:'continue',instruction:'Pegue a alça para subir a ponte'},
    {type:'continue',instruction:'Mantenha-se à direita no acesso ao viaduto'},
    {type:'exit',modifier:'slight right'}
  ])assert.equal(cue(maneuver).features.length,3,JSON.stringify(maneuver));
});
test('V2 draws the roundabout, without duplicating its provider exit',()=>{
  const result=buildV2ManeuverArrows({...eastThenNorth,steps:[
    {type:'roundabout',modifier:'right',location:[-46.6998,-23.5]},
    {type:'exit roundabout',location:[-46.6996,-23.5]}
  ]});
  assert.equal(result.features.length,3);
  const shaft=result.features[0].geometry.coordinates;
  assert.ok(shaft.at(-1)[1]>-23.5);
});
test('V2 never invents a turn merely from a bend or a bridge street name',()=>{
  assert.equal(buildV2ManeuverArrows(eastThenNorth).features.length,0);
  assert.equal(cue({type:'continue',modifier:'straight'}).features.length,0);
  assert.equal(cue({type:'continue',instruction:'Siga em frente pela Ponte Estaiada'}).features.length,0);
  assert.equal(buildV2ManeuverArrows({geometry:null,steps:[{type:'turn',location:[1,2]}]}).features.length,0);
});
