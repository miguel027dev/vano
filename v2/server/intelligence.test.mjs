import test from 'node:test';
import assert from 'node:assert/strict';
import {
 recordRouteDecision,recordNavigationOutcome,intelligenceSnapshot,
 intelligenceForAI,askIntelligence,INTELLIGENCE_SYSTEM_PROMPT,
} from './intelligence.mjs';

const time=Date.parse('2026-10-23T19:00:00.000Z');
const store=()=>({intelligence:[],intelligenceNavigation:[],reports:[],history:[]});

test('route diagnostics exclude coordinates, geometry, account and destination',()=>{
 const db=store();
 const route={
  source:'mapbox',selectedId:'b',
  origin:[-46.7,-23.5],destination:[-46.6,-23.6],
  routes:[{id:'a',kind:'fast',duration:13,distance:6,geometry:{coordinates:[[-46.7,-23.5]]}},
   {id:'b',kind:'safe',duration:20,distance:8,destination:'private address',accountId:'secret'}]
 };
 assert.equal(recordRouteDecision(db,route,{vehicle:'carro',now:time}),true);
 assert.equal(db.intelligence.length,1);
 assert.equal(db.intelligence[0].etaMinutes,20);
 assert.equal(db.intelligence[0].minCandidateEta,13);
 const text=JSON.stringify(db.intelligence);
 for(const forbidden of ['-46.7','-23.5','private address','accountId','coordinates','geometry','origin','destination'])assert.equal(text.includes(forbidden),false);
});

test('dashboard aggregates sanitized operational and report data',()=>{
 const db=store();
 recordRouteDecision(db,{source:'provider',routes:[{id:1,duration:20,kind:'fast'}]}, {now:time});
 db.reports.push({type:'traffic',status:'nao_verificado',createdAt:new Date(time).toISOString(),coords:[-23,-46],owner:'secret'});
 db.history.push({createdAt:new Date(time).toISOString(),destination:{name:'HOME ADDRESS'},duration:21,routeType:'fast'});
 const snapshot=intelligenceSnapshot(db,{routeRequests:1,routeErrors:0,routeLatencyMs:90},{now:time+1000,days:7});
 assert.equal(snapshot.route_decisions.successful,1);
 assert.equal(snapshot.incidents.count,1);
 assert.equal(snapshot.history.savedRoutes,1);
 const str=JSON.stringify(snapshot);
 for(const forbidden of ['-46','HOME ADDRESS','secret','coords','owner'])assert.equal(str.includes(forbidden),false);
 assert.equal(snapshot.navigation.pairedEtaReports,0);
 assert.equal(snapshot.findings[0].code,'eta_observed_insufficient');
});

test('navigation outcomes require consent and correctly measure ETA error',()=>{
 const db=store();
 assert.equal(recordNavigationOutcome(db,{status:'completed',durationMinutes:30,predictedMinutes:20},{now:time}),false);
 assert.equal(recordNavigationOutcome(db,{consent:true,status:'completed',durationMinutes:30,predictedMinutes:20,lat:-23.5},{now:time}),true);
 const snapshot=intelligenceSnapshot(db,{}, {now:time+1000,days:1});
 assert.equal(snapshot.navigation.meanAbsoluteEtaErrorMinutes,10);
 assert.equal(snapshot.navigation.meanSignedEtaErrorMinutes,10);
 assert.ok(!JSON.stringify(db.intelligenceNavigation).includes('lat'));
});

test('model only receives explicitly approved aggregates',async()=>{
 const db=store();const snapshot=intelligenceSnapshot(db,{}, {now:time+1000});
 let outbound;
 const fetcher=async(url,opts)=>{
  outbound={url,opts};
  return {ok:true,json:async()=>({choices:[{message:{content:'Amostra insuficiente.'}}]})};
 };
 const response=await askIntelligence('O que falta para medir ETA?',snapshot,{
  env:{VANO_INTELLIGENCE_API_KEY:'FAKE_SECRET_TEST_123456'},
  tools:['navigation','findings'],fetcher
 });
 assert.equal(response.answer,'Amostra insuficiente.');
 assert.deepEqual(response.sources,['navigation','findings']);
 assert.deepEqual(Object.keys(intelligenceForAI(snapshot,['navigation']).sources),['navigation']);
 const body=JSON.parse(outbound.opts.body);
 assert.equal(body.model,'openai/gpt-oss-120b');
 assert.ok(body.messages[0].content.includes('Não invente')||body.messages[0].content.includes('Nunca invente'));
 assert.equal(JSON.stringify(body).includes('FAKE_SECRET_TEST_123456'),false);
 assert.equal(outbound.opts.headers.Authorization,'Bearer FAKE_SECRET_TEST_123456');
 assert.match(INTELLIGENCE_SYSTEM_PROMPT,/não.*ETA|ETA previsto/i);
});
test('admin analyst refuses missing NVIDIA secret',async()=>{
 await assert.rejects(
  ()=>askIntelligence('Avalie os gargalos',intelligenceSnapshot(store(),{}),{env:{}}),
  error=>error.status===503
 );
});
