import test from 'node:test';
import assert from 'node:assert/strict';
import {transitRegions,transitCapabilities,findTransitRegion,validateTransitRequest,normalizeTransitResult,planTransitTrip,TransitError,verifiedItineraryFare,orderTransitItineraries} from './transit-engine.mjs';

const env={VANO_TRANSIT_REGIONS_JSON:JSON.stringify([
 {id:'sp',name:'São Paulo',bbox:[-47.5,-24.4,-45.7,-22.8],timezone:'America/Sao_Paulo',otpUrl:'https://transit.example.org/otp/gtfs/v1'}
])};
const regions=transitRegions(env);
const origin=[-46.68,-23.58],destination=[-46.64,-23.56];
const now=Date.parse('2026-10-14T17:00:00Z');
const leg=(transit,mode,start,end,extra={})=>({
 mode,transitLeg:transit,duration:(Date.parse(end)-Date.parse(start))/1000,distance:transit?3200:400,
 from:{name:'Origem',lon:origin[0],lat:origin[1]},
 to:{name:'Destino',lon:destination[0],lat:destination[1]},
 start:{scheduledTime:start},end:{scheduledTime:end},
 route:transit?{shortName:'875A',color:'FF6600',textColor:'FFFFFF'}:null,...extra
});
const firstTime='2026-10-14T17:04:00Z',lastTime='2026-10-14T17:25:00Z';
const otp={data:{planConnection:{routingErrors:[],edges:[{node:{
 start:firstTime,end:lastTime,numberOfTransfers:0,walkDistance:400,
 legs:[leg(false,'WALK',firstTime,'2026-10-14T17:10:00Z'),
       leg(true,'BUS','2026-10-14T17:10:00Z',lastTime,{start:{scheduledTime:'2026-10-14T17:10:00Z',estimated:{time:'2026-10-14T17:12:00Z'}}})]
}}]}}};
test('regions must be explicit, valid and allowlisted by server',()=>{
 assert.equal(regions.length,1);
 assert.equal(transitCapabilities(regions).coverage[0].name,'São Paulo');
 assert.equal(transitCapabilities([]).enabled,false);
 assert.equal(transitRegions({VANO_TRANSIT_REGIONS_JSON:JSON.stringify([
  {...JSON.parse(env.VANO_TRANSIT_REGIONS_JSON)[0],otpUrl:'http://169.254.169.254/otp/gtfs/v1'}
 ])}).length,0);
 assert.ok(findTransitRegion(origin,destination,regions));
 assert.equal(findTransitRegion(origin,[2,48],regions),null);
});
test('input validation never fabricates a departure timestamp or allows invalid coordinates',()=>{
 assert.throws(()=>validateTransitRequest({origin,destination:[999,30]},now),{code:'invalid_coordinates'});
 assert.throws(()=>validateTransitRequest({origin,destination:origin},now),{code:'invalid_coordinates'});
 assert.throws(()=>validateTransitRequest({origin,destination,departAt:'yesterday'},now),{code:'invalid_datetime'});
 const query=validateTransitRequest({origin,destination},now);
 assert.equal(query.departAt,new Date(now).toISOString());
 assert.equal(query.sort,'balanced');
});
test('provider response normalizes legs and distinguishes scheduled vs realtime',()=>{
 const result=normalizeTransitResult(otp,regions[0]);
 assert.equal(result.itineraries.length,1);
 assert.equal(result.itineraries[0].transfers,0);
 assert.equal(result.itineraries[0].legs[1].line,'875A');
 assert.equal(result.itineraries[0].legs[1].lineColor,'#FF6600');
 assert.equal(result.itineraries[0].realtime,true);
 assert.equal(result.itineraries[0].fare,null);
 assert.equal(result.itineraries[0].durationMinutes,21);
 assert.deepEqual(normalizeTransitResult({data:{planConnection:{edges:[]}}},regions[0]).itineraries,[]);
 assert.deepEqual(normalizeTransitResult({data:{planConnection:{edges:[{node:{legs:[leg(false,'WALK',firstTime,lastTime)]}}]}}},regions[0]).itineraries,[]);
 assert.throws(()=>normalizeTransitResult({errors:[{message:'boom'}]},regions[0]),{code:'provider_schema'});
});
test('routing uses server-selected OTP endpoint, never the caller URL',async()=>{
 let seen;
 const fakeFetch=async(url,init)=>{seen={url,init};return {ok:true,json:async()=>otp};};
 const result=await planTransitTrip({origin,destination,departAt:firstTime,otpUrl:'https://attacker.example.org/'},{
  regions,fetcher:fakeFetch,now
 });
 assert.equal(seen.url,'https://transit.example.org/otp/gtfs/v1');
 const payload=JSON.parse(seen.init.body);
 assert.equal(payload.operationName,'VanoTransitPlan');
 assert.equal(payload.variables.origin.location.coordinate.longitude,origin[0]);
 assert.equal(result.itineraries.length,1);
 await assert.rejects(planTransitTrip({origin,destination:[12,50]},{regions,fetcher:fakeFetch,now}),{code:'not_covered'});
});
test('provider failures stay explicit and do not pretend to offer global coverage',async()=>{
 await assert.rejects(planTransitTrip({origin,destination,departAt:firstTime},{regions,now,fetcher:async()=>{throw Error('offline');}}),{code:'provider_unavailable'});
 const error=new TransitError('not_covered','Sem cobertura.',404);
 assert.equal(error.status,404);
});

test('economy compares verified fare totals instead of assuming each boarding is charged',()=>{
 const p=(id,amount)=>({id,product:{__typename:'DefaultFareProduct',id:'fare-'+amount,price:{amount,currency:{code:'BRL'}}}});
 const legs=[{transitLeg:true,fareProducts:[p('integrated-ticket',5)]},
             {transitLeg:true,fareProducts:[p('integrated-ticket',5)]}];
 assert.deepEqual(verifiedItineraryFare(legs),{amount:5,currency:'BRL',source:'gtfs-fare-products',verified:true});
 const singles=[{transitLeg:true,fareProducts:[p('trip1',5)]},{transitLeg:true,fareProducts:[p('trip2',5)]}];
 assert.equal(verifiedItineraryFare(singles).amount,10);
 assert.equal(verifiedItineraryFare([{transitLeg:true,fareProducts:[]}]),null);
 assert.equal(verifiedItineraryFare([{transitLeg:true,fareProducts:[p('A',5),p('B',8)]}]),null,'alternative tickets must not be added together');
 assert.equal(verifiedItineraryFare([{transitLeg:true,fareProducts:[{id:'A',product:{__typename:'DependentFareProduct',price:{amount:3,currency:{code:'BRL'}}}}]}]),null,'dependent discounts require a complete fare contract');
});
test('economy uses verified comparable currencies or explicitly falls back to fewest boardings',()=>{
 const cheap={durationMinutes:51,boardings:2,transfers:1,walkMeters:200,fare:{amount:5,currency:'BRL',verified:true}};
 const quick={durationMinutes:29,boardings:3,transfers:2,walkMeters:200,fare:{amount:8,currency:'BRL',verified:true}};
 const priced=orderTransitItineraries([quick,cheap],'economy');
 assert.equal(priced.comparison,'verified_fares');
 assert.equal(priced.itineraries[0],cheap);
 const unknown=orderTransitItineraries([{...quick,fare:null},cheap],'economy');
 assert.equal(unknown.comparison,'fewer_boardings_proxy');
 assert.equal(unknown.itineraries[0],cheap);
 assert.equal(orderTransitItineraries([quick,cheap],'fastest').itineraries[0],quick);
 assert.equal(validateTransitRequest({origin,destination,sort:'economy'},now).sort,'economy');
});
test('estimates show delays but do not claim a fresh GPS/live timestamp',()=>{
 const updated=structuredClone(otp);
 const b=updated.data.planConnection.edges[0].node.legs[1];
 b.start.estimated.time='2026-10-14T17:12:00Z';
 const r=normalizeTransitResult(updated,regions[0],'economy');
 assert.equal(r.itineraries[0].legs[1].departure.delayMinutes,2);
 assert.equal(r.itineraries[0].realtime,true);
 assert.equal(r.itineraries[0].realtimeFreshness,'unknown');
 assert.equal(r.comparison,'fewer_boardings_proxy');
 assert.equal(r.itineraries[0].boardings,1);
});
