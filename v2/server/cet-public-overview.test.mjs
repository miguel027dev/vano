import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCetOverview,cetPublicOverview,CET_SP_SOURCE} from './cet-public-overview.mjs';
const fixture=`<html><head><style>body {display:block}</style></head><body><h1>Trânsito Agora</h1>
<h3>Norte</h3><span>Lentidão: 42 km(11%)</span>
<h3>Oeste</h3><span>Lentidão: 106 km(28%)</span>
<h3>Centro</h3><span>Lentidão: 52 km(14%)</span>
<h3>Leste</h3><span>Lentidão: 82 km(22%)</span>
<h3>Sul</h3><span>Lentidão: 90 km(24%)</span></body></html>`;
test('CET regional published numbers are parsed as broad aggregates, never road-level measurements',()=>{
 const d=parseCetOverview(fixture);
 assert.equal(d.length,5);assert.equal(d[0].congestionKm,42);
 assert.equal(d[1].reportedPercent,28);
 assert.equal(CET_SP_SOURCE.affectsEta,false);
 assert.equal(CET_SP_SOURCE.granularity.includes('não por rua'),true);
});
test('CET incomplete pages, suspicious ranges and script-supplied numbers fail closed',()=>{
 assert.equal(parseCetOverview(fixture.replace('Norte','Fora')),null);
 assert.equal(parseCetOverview(fixture.replace('42 km','9999 km')),null);
 assert.equal(parseCetOverview(fixture.replace('42 km','42 metros')),null);
 assert.equal(parseCetOverview('<script>'+fixture+'</script>'),null);
});
test('CET is fetched on demand and carries no exact road ETA claim',async()=>{
 let calls=0;
 const result=await cetPublicOverview({now:()=>1800000000000,fetcher:async url=>{
  calls++;assert.equal(new URL(url).hostname,'www.cetsp.com.br');
  return {ok:true,headers:{get:()=>String(fixture.length)},text:async()=>fixture};
 }});
 assert.equal(result.status,'available');
 assert.equal(result.affectsEta,false);assert.equal(result.regions.length,5);
 const again=await cetPublicOverview({now:()=>1800000000001,fetcher:()=>{throw Error('should not request again');}});
 assert.equal(again.cached,true);assert.equal(calls,1);
});
