import test from 'node:test';
import assert from 'node:assert/strict';
import {traffic,denseSpecs,adaptiveSpecs,uniqueCandidates,signature,overlap} from './v1-candidates.mjs';

const coords=Array.from({length:12},(_,i)=>[-46.68+i*.001,-23.58]);
function r(seconds,levels=[80],shift=0){
  const points=coords.map(([lon,lat],i)=>[lon,lat+(i>0&&i<11?shift:0)]);
  return {duration:seconds,distance:1300,geometry:{type:'LineString',coordinates:points},
    legs:[{steps:[],annotation:{distance:Array(11).fill(118),congestion_numeric:Array.from({length:11},(_,i)=>levels[i%levels.length])}}]};
}
test('V1 traffic weighted scoring and hotspot sampling use provider annotations',()=>{
  const route=r(700,[90,10]);const m=traffic(route);
  assert.ok(m.score>45&&m.score<55);
  assert.ok(m.severe>0);
  assert.ok(m.clusters.length>0);
  assert.ok(m.clusters.every(x=>x.point.length===2));
});
test('V1 dynamic micro budgets are 0 in free flow and bounded in congestion',()=>{
  assert.equal(denseSpecs([r(800,[12])]).length,0);
  assert.equal(denseSpecs([r(200,[90])]).length,0);
  const dense=denseSpecs([r(800,[90])],8);
  assert.ok(dense.length>=1&&dense.length<=6);
  assert.ok(dense.every(spec=>spec.points.length>=1&&spec.points.length<=4));
});
test('V1 adaptive corridor probes run only with sparse alternatives and congestion',()=>{
  assert.equal(adaptiveSpecs([r(700,[12])]).length,0);
  const adaptive=adaptiveSpecs([r(700,[78])],2);
  assert.equal(adaptive.length,2);
  assert.ok(adaptive.every(x=>x.kind==='adaptive'));
});
test('ETA selection keeps true shortest route and eliminates only exact signatures',()=>{
  const regular=r(760,[40]);
  const same={...regular,duration:900}; // same geometry: discard slower duplicate
  const faster=r(590,[40],.002);
  const ranked=uniqueCandidates([same,faster,regular]);
  assert.equal(ranked.length,2);
  assert.equal(ranked[0].duration,590);
  assert.equal(ranked[1].duration,760);
  assert.equal(signature(regular),signature(same));
  assert.ok(overlap(regular,faster)<.985);
});
