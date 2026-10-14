import test from 'node:test';
import assert from 'node:assert/strict';
import {transitRegions,transitCapabilities,findTransitRegion,validateTransitRequest,normalizeTransitResult,planTransitTrip,TransitError} from './transit-engine.mjs';

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
