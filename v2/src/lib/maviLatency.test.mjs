import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMaviIntent,answerMaviInformation} from './maviAssistant.mjs';
const file=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('V2 status questions are deterministic and can be answered without a round trip',()=>{
 const context={navigationActive:true,hasRoute:true,gpsReady:true,remainingMinutes:7,
  remainingKm:2.2,localClock:'11:35',destination:'Trabalho'};
 for(const [phrase,expected] of [
  ['Mavi, quanto tempo falta?','remaining_time'],
  ['Mavi, que horas são?','clock'],
  ['Mavi, qual é meu destino?','destination']
 ]){
  const intent=classifyMaviIntent(phrase);
  assert.equal(intent,expected);
  assert.equal(answerMaviInformation(intent,context)?.mode,'information');
 }
 const map=file('../pages/MapPage.jsx');
 assert.match(map,/const localIntent=classifyMaviIntent\(text\)/);
 // The immediate answer now carries a non-awaited cloud voice promise.
 // Keep checking instant return without requiring the obsolete return shape.
 assert.match(map,/if\(instant\)\{/);
 assert.match(map,/return \{\.\.\.instant,voiceTicketPromise:muted\?null:api\('\/v2\/assistant\/local-voice-ticket'/);
 assert.match(map,/return api\('\/v2\/assistant'/);
});

test('Cloud voice uses authorized progressive chunks, with browser fallback',()=>{
 const player=file('./maviElevenPlayback.mjs');
 const api=file('./api.js');
 const server=file('../../server/index.mjs');
 assert.match(player,/fetchMaviAudioStream\(ticket,\{signal\}\)/);
 assert.match(player,/new MediaSource\(\)/);
 assert.match(player,/source\.addSourceBuffer\('audio\/mpeg'\)/);
 assert.match(player,/buffer\.appendBuffer\(queue\.shift\(\)\)/);
 assert.match(player,/Promise\.resolve\(audio\.play\(\)\)/);
 assert.match(player,/if\(progressive\)return playMaviStream/);
 assert.match(player,/const blob=await fetchMaviAudio\(ticket,\{signal\}\)/);
 assert.match(api,/export async function fetchMaviAudioStream/);
 assert.match(server,/for await\(const chunk of upstream\.body\)/);
 assert.match(server,/MAVI TTS firstByteMs/);
});
