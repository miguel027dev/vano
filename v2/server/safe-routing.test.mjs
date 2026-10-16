import test from 'node:test';
import assert from 'node:assert/strict';
import {daylightPeriod,evaluateSafeRouting,solarElevation} from './safe-routing.mjs';

const location=[-46.67,-23.56];
const segments=(lightingCoverage,surfaceCondition=0.85,sourceUpdatedAt='2026-09-01T00:00:00Z')=>
  Array.from({length:5},()=>({meters:200,lightingCoverage,surfaceCondition,sourceUpdatedAt}));
const routes=()=>[
 {id:'fast',duration:12,distance:4.0,segments:segments(.25)},
 {id:'alternative',duration:15,distance:4.8,segments:segments(.95)}
];
test('São Paulo: local noon is daylight; night is dark',()=>{
 assert.equal(daylightPeriod('2026-10-15T12:00:00-03:00',location),'day');
 assert.equal(daylightPeriod('2026-10-15T22:00:00-03:00',location),'night');
 assert.ok(solarElevation('2026-10-15T12:00:00-03:00',location)>30);
});
test('night: recommends lit candidate within explicit delay budget',()=>{
 const result=evaluateSafeRouting({routes:routes(),departureAt:'2026-10-15T22:00:00-03:00',location});
 assert.equal(result.status,'ranked');assert.equal(result.recommendedRouteId,'alternative');
 assert.equal(result.assessments[0].verifiedSafety,false);
 assert.equal(result.safetyVerified,false);
});
test('daylight: does not invent illumination benefit',()=>{
 const result=evaluateSafeRouting({routes:routes(),departureAt:'2026-10-15T12:00:00-03:00',location});
 assert.equal(result.recommendedRouteId,'fast');assert.equal(result.period,'day');
});
test('missing lighting evidence returns fastest without misleading classification',()=>{
 const input=routes();
 input[0].segments=[];input[1].segments=[];
 const result=evaluateSafeRouting({routes:input,departureAt:'2026-10-15T22:00:00-03:00',location});
 assert.equal(result.status,'fallback');assert.equal(result.recommendedRouteId,'fast');
 assert.equal(result.reason,'insufficient_comparable_evidence');
});
test('no valid reliable evidence comparison: no recommendation change',()=>{
 const input=routes();input[0].segments.slice(0,3).forEach(s=>{s.lightingCoverage=undefined;});
 const result=evaluateSafeRouting({routes:input,departureAt:'2026-10-15T22:00:00-03:00',location});
 assert.equal(result.recommendedRouteId,'fast');
});
test('long detours are excluded even with better registered lighting',()=>{
 const input=routes();input[1].duration=26;
 const result=evaluateSafeRouting({routes:input,departureAt:'2026-10-15T22:00:00-03:00',location});
 assert.equal(result.recommendedRouteId,'fast');
});
test('ignores neighborhood, census and demographic labels supplied by any source',()=>{
 const input=routes();
 input[0].segments[0].favela=true;
 input[0].segments[0].medianIncome=100;
 input[0].segments[0].residentAge=20;
 const clean=evaluateSafeRouting({routes:routes(),departureAt:'2026-10-15T22:00:00-03:00',location});
 const mutated=evaluateSafeRouting({routes:input,departureAt:'2026-10-15T22:00:00-03:00',location});
 assert.deepEqual(mutated,clean);
});
test('rejects invalid timezone and coordinates',()=>{
 assert.throws(()=>evaluateSafeRouting({routes:routes(),departureAt:'2026-10-15T22:00:00',location}),/timezone/);
 assert.throws(()=>evaluateSafeRouting({routes:routes(),departureAt:'2026-10-15T22:00:00-03:00',location:[0,0]}),/São Paulo/);
});
