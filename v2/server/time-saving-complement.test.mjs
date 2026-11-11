import test from 'node:test';
import assert from 'node:assert/strict';
import {signature,denseSpecs} from './v1-candidates.mjs';
import {fullRouteSignature,exactRoutePool,delayTargets,complementarySpecs,assessTimeSaving,exploreTimeSavings} from './time-saving-complement.mjs';
import {createMapboxTimeSavingProbe} from './time-saving-mapbox.mjs';
const coords=Array.from({length:120},(_,i)=>[-46.70+i*.0002,-23.58]);
const make=(duration=1800,distance=12000,shift=0)=>({duration,distance,
 geometry:{type:'LineString',coordinates:coords.map((p,i)=>[p[0],p[1]+(i===61?shift:0)])},
 legs:[{annotation:{distance:Array(119).fill(100),duration:Array.from({length:119},(_,i)=>i===20||i===65||i===90?240:5),congestion_numeric:Array.from({length:119},(_,i)=>i===20||i===65||i===90?90:10)},steps:[]}]});
const context=()=>({vehicle:'carro',provider:'mapbox',profile:'driving-traffic',departureKey:'now',restrictionsKey:'no-tolls',capturedAt:Date.now(),origin:coords[0],destination:coords.at(-1)});

test('full geometry identity retains a micro detour lost by the current sampled signature',()=>{
 const a=make(),b=make(1600,12500,.00008);
 assert.equal(signature(a),signature(b));
 assert.notEqual(fullRouteSignature(a),fullRouteSignature(b));
 assert.equal(exactRoutePool([a,b]).length,2);
 assert.equal(exactRoutePool([a,{...a,duration:1700}]).length,1);
});
test('search budget includes multi bottleneck strategies rather than only single blocks',()=>{
 const base=make(),old=denseSpecs([base],2),next=complementarySpecs([base],{maxProbes:3,origin:coords[0],destination:coords.at(-1)});
 assert.ok(old.every(s=>s.kind==='block'));
 assert.deepEqual(next.map(s=>s.kind),['time-priority-pair','time-priority-block','time-priority-separated']);
 const skipped=complementarySpecs([base],{maxProbes:3,existingSpecs:[next[0]],origin:coords[0],destination:coords.at(-1)});
 assert.ok(!skipped.some(s=>JSON.stringify(s.points)===JSON.stringify(next[0].points)));
});
test('search prioritises seconds exposed, not distance or unknown traffic',()=>{
 const route=make();route.legs[0].annotation.duration[20]=600;
 const targets=delayTargets(route);assert.ok(targets[0].start<3000);
 assert.equal(targets[0].evidence,'congestion-time-exposure');
 route.legs[0].annotation.congestion_numeric=Array(119).fill(null);
 assert.deepEqual(delayTargets(route),[]);
 route.legs[0].steps=[{duration:200,duration_typical:60,maneuver:{location:coords[65]}}];
 assert.deepEqual(delayTargets(route),[{point:coords[65],prioritySeconds:140,evidence:'excess-over-typical'}]);
});
test('accepts longer route only when provider ETA improves by relevant minutes',()=>{
 const a=make(),b=make(1620,13200,.0001),c=context();
 assert.deepEqual(assessTimeSaving(a,b,c,c,{now:c.capturedAt}),{accepted:true,reason:'provider-eta-gain',gainSeconds:180,extraDistanceM:1200,secondsSavedPerExtraKm:150});
 assert.equal(assessTimeSaving(a,make(1760,12000,.0001),c).reason,'gain-too-small');
 assert.equal(assessTimeSaving(a,make(1400,20000,.0001),c).reason,'detour-too-long');
});
test('does not compare incompatible profiles, stale snapshots, wrong endpoints or known closures',()=>{
 const a=make(),b=make(1600,12500,.0001),c=context();
 for(const change of [{vehicle:'moto'},{departureKey:'tomorrow'},{restrictionsKey:'allow-tolls'},{provider:'other'}])assert.equal(assessTimeSaving(a,b,c,{...c,...change}).reason,'incomparable-context');
 assert.equal(assessTimeSaving(a,b,c,{...c,capturedAt:c.capturedAt-130000}).reason,'stale-or-unsupported-context');
 const wrong=structuredClone(b);wrong.geometry.coordinates[0]=[-45,0];assert.equal(assessTimeSaving(a,wrong,c).reason,'endpoint-drift');
 const closed=structuredClone(b);closed.legs[0].annotation.closure=[{geometry_index:3}];assert.equal(assessTimeSaving(a,closed,c).reason,'known-closure');
});
test('reroute requires reliable GPS, sufficient maneuver clearance and cooldown',()=>{
 const a=make(),b=make(1600,12500,.0001),c=context(),state={reroute:true,gpsReliable:true,maneuverDistanceM:500,now:c.capturedAt};
 assert.equal(assessTimeSaving(a,b,c,c,state).accepted,true);
 assert.equal(assessTimeSaving(a,b,c,c,{...state,gpsReliable:false}).reason,'gps-unreliable');
 assert.equal(assessTimeSaving(a,b,c,c,{...state,maneuverDistanceM:100}).reason,'near-or-unknown-maneuver');
 assert.equal(assessTimeSaving(a,b,c,c,{...state,lastSwitchAt:c.capturedAt-5000}).reason,'cooldown');
});
test('bounded exploration accepts a beneficial corridor and preserves provider ETA',async()=>{
 const base=make(),c=context();let concurrent=0,peak=0;
 const result=await exploreTimeSavings({routes:[base],context:c,policy:{maxProbes:3},fetchCandidate:async spec=>{
  concurrent++;peak=Math.max(peak,concurrent);await new Promise(r=>setTimeout(r,5));concurrent--;
  return [{route:make(spec.kind==='time-priority-pair'?1500:1780,13200,spec.kind==='time-priority-pair'?.0001:.0002),context:c}];
 }});
 assert.equal(result.additionalRequests,3);assert.ok(peak<=2);
 assert.equal(result.recommended.duration,1500);assert.equal(result.baseline.duration,1800);
});
test('failed or hanging probes respect deadline and keep the original route',async()=>{
 const base=make(),c=context();
 const result=await exploreTimeSavings({routes:[base],context:c,policy:{deadlineMs:30},fetchCandidate:()=>new Promise(()=>{})});
 assert.equal(result.recommended,base);assert.ok(result.elapsedMs<300);
 assert.ok(result.probes.every(p=>p.status==='deadline'));assert.ok(result.additionalRequests<=2);
 const failed=await exploreTimeSavings({routes:[base],context:c,fetchCandidate:async()=>{throw Error('outage');}});
 assert.equal(failed.recommended,base);
});
test('unknown request context and pedestrian trips cannot enter recommendations',async()=>{
 const base=make(),c=context();
 const result=await exploreTimeSavings({routes:[base],context:c,fetchCandidate:async()=>[{route:make(1500,12000,.0001)}]});
 assert.equal(result.recommended,base);assert.ok(result.decisions.every(d=>d.reason==='missing-request-context'));
 let called=false;const walk=await exploreTimeSavings({routes:[base],context:{...c,vehicle:'a-pe'},fetchCandidate:async()=>{called=true;return [];}});
 assert.equal(called,false);assert.equal(walk.skipped,'unsupported-or-stale');
});
test('Mapbox adapter preserves origin, restrictions, departure and abort signal',async()=>{
 let actualUrl,actualSignal;const controller=new AbortController();
 const adapter=createMapboxTimeSavingProbe({origin:coords[0],destination:coords.at(-1),vehicle:'moto',token:'test-token',
  options:{avoidTolls:true,departAt:'2030-01-01T10:00:00Z'},fetcher:async(url,options)=>{
   actualUrl=url;actualSignal=options.signal;return {ok:true,json:async()=>({code:'Ok',routes:[make()]})};
  }});
 const found=await adapter.fetchCandidate({points:[coords[65]]},{signal:controller.signal});
 assert.equal(actualSignal,controller.signal);assert.match(actualUrl.pathname,/driving-traffic/);
 assert.equal(actualUrl.searchParams.get('depart_at'),'2030-01-01T10:00:00Z');
 assert.match(actualUrl.searchParams.get('exclude'),/toll,unpaved,point/);
 assert.equal(found[0].context.vehicle,'moto');assert.equal(found[0].context.departureKey,'2030-01-01T10:00:00Z');
});
test('declared restriction violations cannot win through a lower provider ETA',()=>{
 const base=make(),candidate=make(1500,12000,.0001),c=context();
 candidate.legs[0].notifications=[{type:'violation',subtype:'toll'}];
 assert.equal(assessTimeSaving(base,candidate,c).reason,'restriction-violation');
});
test('compares provider road anchors instead of rejecting a POI far from its entrance',()=>{
 const base=make(),candidate=make(1500,12000,.0001),c=context();
 c.destination=[c.destination[0],c.destination[1]+.004];
 assert.equal(assessTimeSaving(base,candidate,c).accepted,true);
});
