import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {speakNavigationVoice,stopNavigationVoice} from './navigationVoice.js';

class TestUtterance{
 constructor(text){this.text=text;this.onstart=null;this.onerror=null;}
}
const browser=()=>{
 const sent=[],synth={
  canceled:0,spoken:[],
  cancel(){this.canceled++},
  speak(utterance){this.spoken.push(utterance);utterance.onstart?.()},
  getVoices(){return [{lang:'pt-BR',name:'Português'},{lang:'fr-FR',name:'French'}]}
 };
 return {sent,synth,scope:{speechSynthesis:synth,SpeechSynthesisUtterance:TestUtterance}};
};
test('web PC voices actually speak maneuvers instead of sending silently to absent Android bridge',()=>{
 const {synth,scope}=browser();let started=0;
 const out=speakNavigationVoice('Vire à direita.', 'pt-BR',{scope,onStart:()=>started++});
 assert.deepEqual({ok:out.ok,channel:out.channel},{ok:true,channel:'web'});
 assert.equal(started,1);
 assert.equal(synth.spoken.length,1);
 assert.equal(synth.spoken[0].text,'Vire à direita.');
 assert.equal(synth.spoken[0].lang,'pt-BR');
 assert.equal(synth.spoken[0].voice.name,'Português');
});
test('native bridge is primary; broken Android bridge falls back to browser audio',()=>{
 const {synth,scope}=browser();const commands=[];
 const native=speakNavigationVoice('À droite.','fr-FR',{native:true,
  sendNative:message=>{commands.push(message);return true;},scope});
 assert.equal(native.channel,'native');
 assert.equal(synth.spoken.length,0,'avoid double audio on native device');
 assert.deepEqual(commands[0],{action:'speak',text:'À droite.',lang:'fr-FR',language:'fr-FR'});
 const fallback=speakNavigationVoice('Turn left.','en-US',{
  native:true,sendNative:()=>false,scope});
 assert.equal(fallback.channel,'web');
 assert.equal(synth.spoken.at(-1).lang,'en-US');
});
test('unsupported speech never claims a maneuver was audible; synthesis errors can be retried',()=>{
 const failures=[];
 assert.deepEqual(speakNavigationVoice('Turn left','en-US',{scope:{},onFailure:error=>failures.push(error)}),
  {ok:false,reason:'unsupported'});
 assert.deepEqual(failures,['unsupported']);
 const {synth,scope}=browser();
 speakNavigationVoice('Vire à esquerda.','pt-BR',{scope,onFailure:error=>failures.push(error)});
 synth.spoken[0].onerror?.({error:'voice-unavailable'});
 assert.ok(failures.includes('voice-unavailable'));
 synth.spoken[0].onerror?.({error:'interrupted'});
 assert.equal(failures.length,2,'new instruction cancellation is not a broken TTS voice');
});
test('stopping navigation cancels browser queued audio as well as native audio',()=>{
 const {synth,scope}=browser();const actions=[];
 speakNavigationVoice('Siga em frente.','pt-BR',{scope});
 stopNavigationVoice({scope,native:true,sendNative:x=>{actions.push(x);return true;}});
 assert.equal(synth.canceled,2);
 assert.deepEqual(actions,[{action:'stopSpeech'}]);
});
test('application integrates speech on real maneuver, navigation start, unmute and end',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(page,/import \{speakNavigationVoice,stopNavigationVoice\}/);
 assert.match(page,/const result=speakNavigationVoice\(text,language,/);
 assert.match(page,/if\(result.ok&&key\)/);
 assert.match(page,/if\(cue&&!spoken.current.has\(cue.key\)\)speakManeuver\(cue.text,cue.key\)/);
 assert.match(page,/Navegação iniciada/);
 assert.match(page,/function toggleVoice\(\)/);
 assert.match(page,/onClick=\{toggleVoice\}/);
 assert.match(page,/Testar voz/);
 assert.match(page,/stopNavigationVoice\(\{native:isNativeShell\(\),sendNative:notifyNative\}\)/);
 assert.doesNotMatch(page,/spoken\.current\.add\(cue\.key\);setSpokenRevision\(v=>v\+1\);notifyNative/);
});
