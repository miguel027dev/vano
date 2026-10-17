import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMaviRoadReport} from './maviTrafficReport.mjs';
import {maviIncidentOffer,maviIncidentFollowupDecision} from './maviIncidentFollowup.mjs';
const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const mic=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
test('MAVI does not reinterpret read-only questions as community reports',()=>{
 const requests=[
  'Como está o trânsito agora?',
  'Tem trânsito na minha rota?',
  'Você sabe se tem alagamento aqui?',
  'Tem obstáculo nessa rua?',
  'Qual o problema dessa rua fechada?',
  'Mavi mostra o trânsito no mapa'
 ];
 for(const request of requests)assert.equal(classifyMaviRoadReport(request),null,request);
});
test('incident GPS report is separate from proposal acceptance and navigation',()=>{
 assert.match(map,/const incidentType=navMode\?classifyMaviRoadReport\(text\):null/);
 assert.match(map,/const gps=quickReportPosition\(fix\)/);
 assert.match(map,/Date\.now\(\)-Number\(fix\?\.sourceAt\)>12000/);
 assert.match(map,/metersApart\(guard\.lastCoords,gps\.coords\)<150/);
 assert.match(map,/await report\(\{type:incidentType,coords:gps\.coords,description:''\}\)/);
 assert.match(map,/incidentRerouteOffer:\{type:incidentType\}/);
 assert.match(map,/const incidentOffer=maviIncidentOffer\(incidentType\)/);
 assert.match(mic,/incidentOfferRef\.current=nextIncident\?/);
 assert.match(mic,/const answer=maviIncidentFollowupDecision\(text\)/);
 assert.match(mic,/routedText=maviIncidentOffer\(pendingIncident\.type\)\?\.command\|\|text/);
 assert.match(mic,/onCommand\(routedText,controller\.signal,\{firstTurn\}\)/);
 assert.match(mic,/if\(response\?\.mode==='proposal'&&response\.routeData\?\.routes\?\.length\)/);
 assert.match(mic,/handlersRef\.current\.onAccept\(selection\)/);
 assert.doesNotMatch(map.slice(map.indexOf('const incidentType=navMode?'),map.indexOf('// Informational commands work even before planning a route')),/setRouteData|setChoice|applyJev/);
});
test('signed voice only speaks closed catalog of confirmation questions',()=>{
 for(const type of ['transito','alagamento','obstaculo','via_fechada']){
  assert.ok(server.includes(maviIncidentOffer(type).question));
  assert.equal(maviIncidentFollowupDecision('sim'),'accept');
  assert.equal(maviIncidentFollowupDecision('nao'),'reject');
 }
 assert.match(server,/confirmations\.has\(body\.text\)/);
 assert.match(map,/intent:'confirmation',text:incidentOffer\.question/);
});
