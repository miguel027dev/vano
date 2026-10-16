import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerMaviInformation} from './maviAssistant.mjs';
const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');

test('full MAVI introduction is only for the first greeting',()=>{
 const first=answerMaviInformation('greeting',{firstMaviGreeting:true,replyVariant:0});
 assert.match(first.text,/sou a MAVI/);
 assert.match(first.text,/VANO Maps/);
 const others=[0,1,2].map(replyVariant=>
  answerMaviInformation('greeting',{firstMaviGreeting:false,replyVariant}).text);
 assert.equal(new Set(others).size,3);
 assert.ok(others.every(s=>s.length<50));
 assert.ok(others.every(s=>!s.includes('VANO Maps')));
});
test('short local readouts vary while keeping verified estimates unchanged',()=>{
 const data={hasRoute:true,navigationActive:true,gpsReady:true,remainingMinutes:8};
 const replies=[0,1,2].map(replyVariant=>answerMaviInformation('remaining_time',{...data,replyVariant}).text);
 assert.equal(new Set(replies).size,3);
 assert.ok(replies.every(s=>s.includes('8 minutos')));
 assert.equal(answerMaviInformation('greeting',{replyVariant:5}).mode,'information');
});
test('MAVI v2 uses signed local cloud tickets and Cartesia route-proof cues, leaves V1 browser voice',()=>{
 const page=read('../pages/MapPage.jsx'),server=read('../../server/index.mjs'),mic=read('../components/JevVoiceButton.jsx');
 assert.match(page,/vano-mavi-introduced/);
 assert.match(page,/voiceTicketPromise:/);
 assert.match(page,/if\(jevMode\)\{/);
 assert.match(page,/api\('\/v2\/navigation\/voice-ticket'/);
 assert.match(page,/await playMaviVoice\(result.voiceTicket,\{signal:controller.signal\}\)/);
 assert.match(page,/const result=speakNavigationVoice\(text,language,/);
 assert.match(server,/pathname==='\/api\/v2\/navigation\/voice-ticket'/);
 assert.match(server,/mayUseNavigationVoiceProof\(proof,id\)/);
 assert.match(server,/refreshedProof/);
 assert.match(server,/type:'mavi-cartesia-tts',purpose:'maneuver'/);
 assert.match(server,/const ticketType=eleven\.enabled\?'mavi-eleven-tts':cartesia\.enabled/);
 assert.match(server,/pathname==='\/api\/v2\/assistant\/local-voice-ticket'/);
 assert.match(server,/confirmations\.has\(body\.text\)/);
 assert.match(mic,/response\?\.voiceTicket\|\|response\?\.voiceTicketPromise/);
});

test('real 150-meter maneuver is permitted by the server; arbitrary speech is rejected',()=>{
 const server=read('../../server/index.mjs');
 const expression=server.split('\n').find(line=>line.includes('Daqui a')&&line.includes('.test(txt)'));
 assert.ok(expression,'maneuver authorization pattern is defined');
 const parsed=expression.match(/if\(!\/(.+)\/i\.test\(txt\)\)/);
 assert.ok(parsed,'server uses a static bounded speech grammar');
 const rule=new RegExp(parsed[1],'i');
 assert.equal(rule.test('Em 150 metros, vire à direita.'),true);
 assert.equal(rule.test('Siga em frente.'),true);
 assert.equal(rule.test('Navegação iniciada.'),true);
 assert.equal(rule.test('Peça uma pizza grande e envie o cartão de crédito.'),false);
});
