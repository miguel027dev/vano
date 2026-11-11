import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {speakNavigationVoice,stopNavigationVoice} from './navigationVoice.js';
import {maviLocalSpeechText,maviLocalSpeechTimeoutMs} from './maviSpeechPolicy.mjs';

const navigationPage=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const assistant=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');

test('interrupted browser guidance releases the audio lease once, without an error banner',()=>{
 let utterance,ended=0,failed=0;
 class FakeUtterance{constructor(text){this.text=text;}}
 const scope={SpeechSynthesisUtterance:FakeUtterance,speechSynthesis:{
   cancel(){},speak(value){utterance=value;},getVoices(){return[];}
 }};
 assert.equal(speakNavigationVoice('Vire à direita','pt-BR',{scope,
   onEnd:()=>ended++,onFailure:()=>failed++}).ok,true);
 utterance.onerror?.({error:'interrupted'});
 utterance.onend?.();
 assert.equal(ended,1);
 assert.equal(failed,0);
});

test('navigational cancellation cannot mute unrelated assistant speech',()=>{
 let canceled=0;const messages=[];
 stopNavigationVoice({native:true,scope:{speechSynthesis:{cancel(){canceled++;}}},
  cancelWebSpeech:false,sendNative:msg=>{messages.push(msg);return true;}});
 assert.equal(canceled,0);
 assert.deepEqual(messages,[{action:'stopSpeech'}]);
 stopNavigationVoice({scope:{speechSynthesis:{cancel(){canceled++;}}},cancelWebSpeech:true});
 assert.equal(canceled,1);
 assert.match(navigationPage,/cancelWebSpeech:lease\?\.channel==='web'/);
});

test('imminent turns use local speech before slow cloud, with bounded cloud-ticket wait',()=>{
 assert.match(navigationPage,/speakManeuver\(cue\.text,cue\.key,\{urgent:cue\.stage==='now'\|\|cue\.distance<100\}\)/);
 assert.match(navigationPage,/if\(!urgent&&jevMode&&route\?\.proof/);
 assert.match(navigationPage,/ticketTimedOut=true;controller\.abort\(\);\},2800\)/);
 assert.match(navigationPage,/maneuverAudioRef\.current===controller&&\(!controller\.signal\.aborted\|\|ticketTimedOut\)/);
 assert.match(navigationPage,/outdated\.abort\(\)/);
});

test('native TTS silent-start recovers, and late canceled callbacks cannot suppress fallback',()=>{
 assert.match(navigationPage,/if\(attempt\?\.fallbackUsed\)return;/);
 assert.match(navigationPage,/clearTimeout\(deviceVoiceFocusRef\.current\.startupTimer\)/);
 assert.match(navigationPage,/lease\.startupTimer=setTimeout\(\(\)=>\{/);
 assert.match(navigationPage,/fallbackNativeGuidance\(utteranceId\)/);
 assert.match(navigationPage,/clearTimeout\(lease\.startupTimer\)/);
});

test('MAVI no longer clips normal replies at 400 characters or times them out too early',()=>{
 const message='M'.repeat(820);
 assert.equal(maviLocalSpeechText(message).length,820);
 assert.equal(maviLocalSpeechText('M'.repeat(2400)).length,1100);
 assert.ok(maviLocalSpeechTimeoutMs(message)>15000);
 assert.ok(maviLocalSpeechTimeoutMs(message)<=65000);
 assert.match(assistant,/new Utterance\(voiceText\)/);
 assert.match(assistant,/maviLocalSpeechTimeoutMs\(voiceText\)/);
 assert.match(assistant,/Áudio da MAVI falhou/);
});
