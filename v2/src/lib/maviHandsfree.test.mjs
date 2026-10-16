import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const mic=()=>readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
const map=()=>readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=()=>readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');

test('MAVI retains proven direct browser microphone activation and route request',()=>{
 const s=mic();
 assert.match(s,/const Recognizer=typeof window!=='undefined'\?\(window\.SpeechRecognition\|\|window\.webkitSpeechRecognition\):null/);
 assert.match(s,/recognition\.lang='pt-BR';recognition\.continuous=false;recognition\.interimResults=false;recognition\.maxAlternatives=1/);
 assert.match(s,/const phrase=Array\.from\(event\.results\|\|\[\]\)\.map\(row=>row\?\.\[0\]\?\.transcript\|\|''\)\.join\(' '\)\.trim\(\)/);
 assert.match(s,/recognition\.start\(\)/);
 assert.match(s,/listenRef\.current\('remote'\)/);
 assert.match(s,/async function submit\(phrase\)/);
 assert.match(s,/handlersRef\.current\.onCommand\(text,controller\.signal,\{firstTurn\}\)/);
 assert.match(s,/firstMaviTurnRef\.current=true/);
 assert.match(s,/onClick=\{toggle\}/);
 assert.doesNotMatch(s,/MaviVoiceController/);
});

test('only MAVI V2 shows compact route proposal under guidance or preview',()=>{
 const s=map(),m=mic();
 assert.match(s,/jevMode&&<div id="mavi-offer-host" className="mavi-offer-host"\/>/);
 assert.equal((s.match(/id="mavi-offer-host"/g)||[]).length,2,'one host per exclusive navigation state');
 assert.match(s,/jevMode&&<JevVoiceButton/);
 assert.match(m,/createPortal\(/);
 assert.match(m,/offerTarget&&createPortal\(/);
 assert.match(m,/className="mavi-offer-card"/);
 assert.match(m,/className="mavi-offer-reject"/);
 assert.match(m,/className="mavi-offer-confirm"/);
 assert.doesNotMatch(m,/<section className="jev-panel"/);
 assert.doesNotMatch(m,/<form className="jev-text"/);
 assert.match(css(),/\.map-page \.mavi-offer-host/);
 assert.match(css(),/top:calc\(100% \+ 11px\)/);
});

test('card remains hidden until voice narration settles; accept/reject are explicit',()=>{
 const s=mic(),p=s.indexOf('setReply(message);speak(message,()=>{');
 assert.ok(p>0);
 assert.ok(s.indexOf('setOfferReady(true)',p)>p);
 assert.match(s,/speech\.onend=finish;speech\.onerror=finish/);
 assert.match(s,/speechTimerRef\.current=setTimeout\(finish,15000\)/);
 assert.match(s,/enabled&&offerReady&&proposal&&offerTarget&&createPortal/);
 assert.match(s,/function chooseProposal\(decision\)/);
 assert.match(s,/handlersRef\.current\.onAccept\(selection\)/);
 assert.match(s,/onClick=\{reject\}/);
 assert.match(s,/onClick=\{accept\}/);
 assert.match(s,/proposalRef\.current=null;setOfferReady\(false\)/);
});

test('MAVI cloud voices are feature gated, route-signed and preserve existing microphone',()=>{
 const jsx=mic(),api=readFileSync(new URL('./api.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
 const player=readFileSync(new URL('./maviElevenPlayback.mjs',import.meta.url),'utf8');
 assert.match(jsx,/playMaviVoice\(voiceTicket,\{signal:controller\.signal\}\)/);
 assert.match(jsx,/response\?\.voiceTicket/);
 assert.match(jsx,/if\(controller\.signal\.aborted\|\|finished\|\|!enabledRef\.current\)return;/);
 assert.match(jsx,/elevenAbortRef\.current\?\.abort\(\)/);
 assert.match(jsx,/listenRef\.current\('remote'\)/);
 assert.match(api,/export async function fetchMaviAudio/);
 assert.match(api,/X-VANO-CSRF/);
 assert.match(server,/pathname==='\/api\/v2\/assistant\/speech'/);
 assert.match(server,/if\(!protectedWrite\(req,res\)\)return/);
 assert.match(server,/if\(!limits\(req,res,'mavi-voice-v2',12,60000\)\)return/);
 assert.match(server,/claim\.user!==identity/);
 assert.match(server,/usedMaviVoiceTickets\.has\(claimHash\)/);
 assert.match(server,/ticketType=cartesia\.enabled\?'mavi-cartesia-tts':eleven\.enabled\?'mavi-eleven-tts'/);
 assert.match(player,/revokeObjectURL/);
 assert.match(player,/audio\.addEventListener\('ended',complete/);
});
