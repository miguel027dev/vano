import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationSummary,arrivalClock} from './navigationSummary.js';

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
