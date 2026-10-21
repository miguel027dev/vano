import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCetOverview,createCetGateway,CET_SP_SOURCE} from './cet-public-overview.mjs';
const fixture=`<html><head><style>body {display:block}</style></head><body><h1>Trânsito Agora</h1>
<h3>Norte</h3><span>Lentidão: 42 km(11%)</span>
<h3>Oeste</h3><span>Lentidão: 106 km(28%)</span>
<h3>Centro</h3><span>Lentidão: 52 km(14%)</span>
<h3>Leste</h3><span>Lentidão: 82 km(22%)</span>
<h3>Sul</h3><span>Lentidão: 90 km(24%)</span></body></html>`;
const homepage=`<html><body><h2>Trânsito Agora</h2>
São Paulo, 20 de outubro de 2026
<h3>Norte</h3><strong>88 km</strong> de lentidão (16%)
<h3>Oeste</h3><strong>151 km</strong> de lentidão (28%)
<h3>Centro</h3><strong>55 km</strong> de lentidão (10%)
<h3>Leste</h3><strong>122 km</strong> de lentidão (23%)
<h3>Sul</h3><strong>121 km</strong> de lentidão (23%)</body></html>`;
const response=html=>({ok:true,headers:{get:()=>null},text:async()=>html});
test('CET parses first official Trânsito nas Principais Vias template',()=>{
 const d=parseCetOverview(fixture);
 assert.equal(d.length,5);
 assert.equal(d[0].congestionKm,42);
 assert.equal(d[1].reportedPercent,28);
 assert.equal(CET_SP_SOURCE.affectsEta,false);
 assert.equal(CET_SP_SOURCE.granularity.includes('não por rua'),true);
});
test('CET parses second official homepage template with de lentidão after kilometres',()=>{
 const d=parseCetOverview(homepage);
 assert.equal(d.length,5);
 assert.equal(d[0].congestionKm,88);
 assert.equal(d[4].congestionKm,121);
 assert.equal(d[4].reportedPercent,23);
});
test('incomplete, suspicious and script-supplied data are rejected',()=>{
 assert.equal(parseCetOverview(fixture.replace('Norte','Fora')),null);
 assert.equal(parseCetOverview(fixture.replace('42 km','9999 km')),null);
 assert.equal(parseCetOverview(fixture.replace('42 km','42 metros')),null);
 assert.equal(parseCetOverview('<script>'+fixture+'</script>'),null);
 assert.equal(parseCetOverview(fixture.replace('11%', '111%')),null);
});
test('CET authentic data are cached briefly, source observation time stays unknown',async()=>{
 let calls=0,clock=1800000000000;
 const gateway=createCetGateway({now:()=>clock,fetcher:async url=>{
  calls++;assert.equal(new URL(url).hostname,'ssl.cetsp.com.br');
  return response(fixture);
 }});
 const data=await gateway();
 assert.equal(data.status,'available');
 assert.equal(data.observedAt,null);
 assert.equal(data.regions.length,5);
 assert.equal(data.affectsEta,false);
 const cached=await gateway();assert.equal(cached.cached,true);assert.equal(calls,1);
 clock+=120001;
 const updated=await gateway();assert.equal(updated.cached,undefined);assert.equal(calls,2);
});
test('CET retries an independent official HTTPS host when the primary fails',async()=>{
 const visited=[];
 const gateway=createCetGateway({now:()=>1800000000000,fetcher:async url=>{
  visited.push(new URL(url).hostname);
  if(visited.length===1)throw Error('network');
  return response(fixture);
 }});
 const data=await gateway();
 assert.equal(data.status,'available');
 assert.equal(visited[0],'ssl.cetsp.com.br');
 assert.equal(visited[1],'www.cetsp.com.br');
 assert.equal(data.attemptedSources,2);
});
test('CET can fall back to official homepage when a subpage uses an unknown format',async()=>{
 const visited=[];
 const gateway=createCetGateway({now:()=>1800000000000,fetcher:async url=>{
  visited.push(new URL(url).pathname);
  return response(visited.length<3?'<html>Site fora do ar</html>':homepage);
 }});
 const data=await gateway();
 assert.equal(data.status,'available');
 assert.equal(data.regions[0].congestionKm,88);
 assert.equal(data.attemptedSources,3);
});
test('failures are explicit and retried after cooldown, not cached as traffic data',async()=>{
 let clock=1800000000000,calls=0;
 const gateway=createCetGateway({now:()=>clock,fetcher:async()=>{calls++;return {ok:false,status:503};}});
 const fail=await gateway();
 assert.equal(fail.status,'unavailable');assert.equal(fail.attemptedSources,4);
 assert.equal(fail.failureReason,'http-rejected');assert.equal(calls,4);
 const cooldown=await gateway();
 assert.equal(cooldown.failureReason,'cooldown-after-failure');assert.equal(calls,4);
 clock+=46000;
 await gateway();assert.equal(calls,8);
});
