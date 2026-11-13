import test from 'node:test';
import assert from 'node:assert/strict';
import {traffic as legacyTraffic,denseSpecs as legacyDense,adaptiveSpecs as legacyAdaptive} from './v1-candidates.mjs';
import {traffic as nativeTraffic,denseSpecs as nativeDense,adaptiveSpecs as nativeAdaptive} from './route-candidates.mjs';
import {calculateMapboxV1Candidates} from './mapbox-v1-fallback.mjs';

function route(segments,{duration=1000,offset=0}={}){
  const coordinates=Array.from({length:segments.length+1},(_,i)=>[-46.700+i*.001,-23.600+offset]);
  const congestion=segments.map(x=>typeof x==='string'?x:'unknown');
  const congestion_numeric=segments.map(x=>typeof x==='number'?x:null);
  return {duration,distance:segments.length*120,
    geometry:{type:'LineString',coordinates},
    legs:[{annotation:{distance:segments.map(()=>120),congestion,congestion_numeric},steps:[]}]};
}
for(const [engine,traffic,dense,adaptive] of [
  ['fallback',legacyTraffic,legacyDense,legacyAdaptive],
  ['native',nativeTraffic,nativeDense,nativeAdaptive]
]){
  test(engine+': all-unknown never means traffic-free or verified',()=>{
    const r=route(Array(10).fill('unknown'));
    const result=traffic(r);
    assert.equal(result.hasTraffic,false);
    assert.equal(result.knownRatio,0);
    assert.equal(result.score,0);
    assert.equal(result.severe,0);
    assert.deepEqual(dense([r],8),[]);
    assert.deepEqual(adaptive([r],2),[]);
  });
  test(engine+': low traffic must remain valid known evidence',()=>{
    const result=traffic(route(Array(10).fill('low')));
    assert.equal(result.hasTraffic,true);
    assert.equal(result.knownRatio,1);
    assert.equal(result.score,15);
  });
  test(engine+': invalid numbers and absent labels stay unknown',()=>{
    const result=traffic(route([null,undefined,-10,150,'unknown','unknown','unknown','unknown','unknown','unknown']));
    assert.equal(result.hasTraffic,false);
    assert.equal(result.knownRatio,0);
    assert.equal(result.score,0);
  });
  test(engine+': insufficient coverage does not become verified congestion',()=>{
    const r=route(['heavy','heavy','heavy','heavy','heavy','heavy','heavy','unknown','unknown','unknown']);
    const result=traffic(r);
    assert.equal(result.knownRatio,.7);
    assert.equal(result.hasTraffic,false);
    assert.equal(result.score,76);
    assert.deepEqual(dense([r],8),[]);
    assert.deepEqual(adaptive([r],2),[]);
  });
  test(engine+': at least 80 percent observed congestion can guide probing',()=>{
    const result=traffic(route([94,94,94,94,94,94,94,94,'unknown','unknown']));
    assert.ok(Math.abs(result.knownRatio-.8)<1e-10);
    assert.equal(result.hasTraffic,true);
    assert.equal(result.score,94);
    assert.equal(result.severe,8);
  });
  test(engine+': numeric 0 is legitimate verified observation',()=>{
    const result=traffic(route(Array(10).fill(0)));
    assert.equal(result.knownRatio,1);
    assert.equal(result.hasTraffic,true);
    assert.equal(result.score,0);
  });
}
test('fallback still selects provider ETA rather than inventing time penalties for unknowns',async()=>{
  const origin=[-46.7,-23.6],destination=[-46.69,-23.6];
  const quickest=route(Array(10).fill('unknown'),{duration:1000,offset:0});
  const slower=route(Array(10).fill('low'),{duration:1080,offset:.002});
  const fetcher=async()=>({ok:true,json:async()=>({code:'Ok',routes:[slower,quickest]})});
  const data=await calculateMapboxV1Candidates(origin,destination,'carro',{},'pt-BR',
    {adaptive:false,skipCandidateProbes:true},'not-a-real-token',fetcher);
  assert.equal(data.routes.find(r=>r.id==='fast').durationSeconds,1000);
  assert.equal(data.candidateEngine.additionalRequests,0);
});
