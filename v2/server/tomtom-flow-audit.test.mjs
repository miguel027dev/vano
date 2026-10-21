import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFlowSamplePoints,normalizeFlowReading,tomTomFlowAudit} from './tomtom-flow-audit.mjs';
const coords=Array.from({length:13},(_,i)=>[-46.75+i*.004,-23.58]);
const shape={type:'LineString',coordinates:coords};
const sample={point:coords[5],bearing:90,distanceFromStartKm:2.2};
const createBody=(order='forward')=>({flowSegmentData:{
 currentSpeed:18,freeFlowSpeed:60,confidence:.94,roadClosure:false,
 coordinates:{coordinate:(order==='forward'?coords.slice(4,7):coords.slice(4,7).reverse()).map(([longitude,latitude])=>({longitude,latitude}))}
}});
test('TomTom uses correct lat,lon and keeps key only on server; geometry sampling is bounded',async()=>{
 const points=selectFlowSamplePoints(shape,3);
 assert.equal(points.length,3);
 let calls=0;
 const result=await tomTomFlowAudit({geometry:shape},'test-flow-secret',{maxSamples:3,now:()=>1800000000000,
  fetcher:async raw=>{
   const u=new URL(raw);calls++;
   assert.equal(u.hostname,'api.tomtom.com');
   assert.equal(u.searchParams.get('key'),'test-flow-secret');
   const [lat,lon]=u.searchParams.get('point').split(',').map(Number);
   assert.equal(Math.sign(lat),-1);assert.equal(Math.sign(lon),-1);
   return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(createBody())};
  }});
 assert.equal(calls,3);
 assert.equal(result.attempted,3);
 assert.equal(result.matched>=1,true);
 assert.equal(result.canAdjustEta,false);
 assert.ok(!JSON.stringify(result).includes('test-flow-secret'));
});
test('TomTom rejects nearby opposite carriageway and low confidence',()=>{
 assert.equal(normalizeFlowReading(createBody('reverse'),sample).reason,'direction-not-verified');
 const weak=createBody();weak.flowSegmentData.confidence=.1;
 assert.equal(normalizeFlowReading(weak,sample).reason,'insufficient-provider-evidence');
 const far=createBody();far.flowSegmentData.coordinates.coordinate.forEach(x=>x.latitude+=.03);
 assert.equal(normalizeFlowReading(far,sample).reason,'unmatched-road');
});
test('TomTom zero samples or missing credential never invents ETA',async()=>{
 const result=await tomTomFlowAudit({geometry:shape},'',{now:()=>1800000000000});
 assert.equal(result.status,'not-configured');
 assert.equal(result.canAdjustEta,false);
 const match=normalizeFlowReading(createBody(),sample);
 assert.equal(match.status,'matched');
 assert.equal(match.currentKmh,18);
 assert.equal(match.freeFlowKmh,60);
 assert.equal(match.speedRatio,.3);
});
