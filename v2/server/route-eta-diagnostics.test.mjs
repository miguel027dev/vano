import test from 'node:test';
import assert from 'node:assert/strict';
import {mapboxEtaEvidence,summarizeEtaRoute,etaConsoleReport} from './route-eta-diagnostics.mjs';

const example={duration:1200,distance:3000,duration_typical:900,
 legs:[{annotation:{
  distance:[1000,1000,1000],duration:[200,700,300],
  congestion_numeric:[12,92,null],congestion:['low','severe','unknown']
 }}]};
test('annotated congestion cannot silently treat unknown roads as free flow',()=>{
 const s=mapboxEtaEvidence(example);
 assert.equal(s.segmentCount,3);
 assert.equal(s.knownSegmentCount,2);
 assert.equal(s.congestionCoveragePct,66.7);
 assert.equal(s.unknownDistanceKm,1);
 assert.equal(s.heavyDistanceKm,1);
 assert.equal(s.durationCoveragePct,100);
 assert.equal(s.timeFromAnnotationsSeconds,1200);
 assert.equal(s.trafficDelaySeconds,300);
 assert.equal(s.congestionHotspots[0].speedKmh,5.1);
});
test('missing provider typical duration never becomes a guessed delay',()=>{
 const e=mapboxEtaEvidence({...example,duration_typical:undefined});
 assert.equal(e.trafficDelaySeconds,null);
 assert.equal(e.durationTypicalSeconds,null);
});
test('missing or incomplete traffic returns coverage warning without invented metrics',()=>{
 const e=mapboxEtaEvidence({duration:850,distance:1000,legs:[{annotation:{distance:[300,300]}}]});
 assert.equal(e.congestionCoveragePct,0);
 assert.equal(e.durationCoveragePct,0);
 const x=summarizeEtaRoute({id:'fast',label:'Mais rápida',durationSeconds:850,duration:14,
  distance:1,trafficDataStatus:'degraded',routingProfile:'driving',etaEvidence:e,steps:[]});
 assert.ok(x.warnings.some(w=>/sem trânsito ao vivo/.test(w)));
 assert.ok(x.warnings.some(w=>/Cobertura de congestionamento/.test(w)));
 assert.equal(x.etaMinutes,14.17);
});
test('mapbox step seconds, exact route seconds and alternative route remain distinct',()=>{
 const route={id:'fast',label:'Mais rápida',duration:20,durationSeconds:1175,distance:3,
  routingProfile:'driving-traffic',trafficDataStatus:'traffic-aware',routingProvider:'mapbox',
  etaEvidence:mapboxEtaEvidence(example),
  steps:[{street:'Rua Um',distance:1000,duration:200},{street:'Marginal',distance:2000,duration:975}]};
 const other={...route,id:'safe',label:'Alternativa',durationSeconds:1500,duration:25};
 const d=etaConsoleReport({source:'mapbox-v1-candidates',routes:[route,other],
  candidateEngine:{provider:'driving-traffic',candidateCount:5,additionalRequests:2}},
  {elapsedMs:432});
 assert.equal(d.routes.length,2);
 assert.equal(d.routes[0].etaSeconds,1175);
 assert.equal(d.routes[1].etaSeconds,1500);
 assert.equal(d.routes[0].stepDurationCoveragePct,100);
 assert.equal(d.engine.additionalRequests,2);
 assert.ok(!JSON.stringify(d).includes('access_token'));
 assert.ok(!JSON.stringify(d).includes('geometry'));
});
