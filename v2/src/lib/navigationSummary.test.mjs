import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationSummary,navigationSummaryWithRefresh,arrivalClock} from './navigationSummary.js';

test('total ETA and distance are shown until GPS reports travel progress',()=>{
 const now=Date.UTC(2026,9,12,22,0,0);
 const r=navigationSummary({duration:24,distance:9.8},null,now);
 assert.equal(r.remainingMinutes,24);
 assert.equal(r.remainingKm,9.8);
 assert.equal(r.arrivalAt.getTime(),now+24*60000);
});
test('only real route progress reduces remaining minutes and km',()=>{
 const now=Date.UTC(2026,9,12,22,0,0);
 const r=navigationSummary({duration:24,distance:9.8},{progress:.25},now);
 assert.equal(r.remainingMinutes,18);
 assert.equal(r.remainingKm,9.8*.75);
 assert.equal(r.arrivalAt.getTime(),now+18*60000);
});
test('GPS progress is clamped; no negative minutes or kilometers',()=>{
 const a=navigationSummary({duration:18,distance:10},{progress:2},100000);
 assert.equal(a.remainingMinutes,0);
 assert.equal(a.remainingKm,0);
 const b=navigationSummary({duration:18,distance:10},{progress:-3},100000);
 assert.equal(b.remainingMinutes,18);
 assert.equal(b.remainingKm,10);
});
test('invalid source ETA produces no fabricated arrival',()=>{
 assert.equal(navigationSummary({},null,1000),null);
 assert.equal(navigationSummary({duration:-1,distance:2},null,1000),null);
 assert.equal(navigationSummary({duration:5,distance:NaN},null,1000),null);
});
test('arrival time is presented as local clock, without fixed timezone',()=>{
 const date=new Date(Date.UTC(2026,9,12,22,30));
 const expected=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
 assert.equal(arrivalClock(date,'pt-BR'),expected);
 assert.equal(arrivalClock(new Date('invalid')),'--:--');
 assert.equal(arrivalClock(date,'not-a-language-tag-!'),expected);
});

test('congested first half and fast second half use provider seconds instead of half the ETA',()=>{
 const now=Date.UTC(2026,9,20,20,0,0);
 const route={duration:28,durationSeconds:1680,distance:14,steps:[
   {distance:7000,duration:1200},{distance:7000,duration:480}
 ]};
 const result=navigationSummary(route,{progress:.5},now);
 assert.equal(result.etaMethod,'provider-steps');
 assert.equal(result.remainingMinutes,8);
 assert.equal(result.arrivalAt.getTime(),now+480000);
 assert.equal(navigationSummary(route,null,now).remainingMinutes,28);
});
test('broken or truncated step durations are never treated as reliable ETA',()=>{
 const route={duration:28,durationSeconds:1680,distance:14,steps:[{distance:7000,duration:480}]};
 const result=navigationSummary(route,{progress:.5},0);
 assert.equal(result.etaMethod,'proportional-fallback');
 assert.equal(result.remainingMinutes,14);
});
test('subminute precision survives the source duration and final ETA clock',()=>{
 const route={duration:28,durationSeconds:1670,distance:5.6};
 const result=navigationSummary(route,{progress:0},0);
 assert.equal(result.remainingSeconds,1670);
 assert.equal(result.arrivalAt.getTime(),1670000);
});
test('traffic refresh rescales only subsequent progress without claiming new geometry',()=>{
 const now=100000;
 const route={duration:20,durationSeconds:1200,distance:8};
 const base=navigationSummary(route,{progress:.5},now);
 const refresh={baseSeconds:600,freshSeconds:960,progress:.5,checkedAt:now};
 const reviewed=navigationSummaryWithRefresh(base,refresh,now);
 assert.equal(reviewed.remainingMinutes,16);
 assert.equal(reviewed.etaMethod,'proportional-fallback+verified-corridor-refresh');
 const progressed=navigationSummaryWithRefresh(navigationSummary(route,{progress:.75},now),refresh,now);
 assert.equal(progressed.remainingMinutes,8);
 assert.equal(navigationSummaryWithRefresh(base,{...refresh,progress:.9},now),base);
});
