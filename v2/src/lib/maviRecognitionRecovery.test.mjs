import test from 'node:test';
import assert from 'node:assert/strict';
import {maviRecognitionRecovery,MAVI_IDLE_RESTART_LIMIT} from './maviRecognitionRecovery.mjs';
import {readFileSync} from 'node:fs';

test('empty Android Web Speech sessions never restart in a mic permission loop',()=>{
 assert.equal(MAVI_IDLE_RESTART_LIMIT,1);
 for(let i=0;i<15;i++){
   const recovery=maviRecognitionRecovery({idleEnds:i+1,hadSpeech:false});
   assert.equal(recovery.retry,false,'auto-opened a silent recognizer');
   assert.equal(recovery.paused,true);
   assert.equal(recovery.reason,'idle');
 }
 for(const code of ['no-speech','network','audio-capture','service-not-allowed','not-allowed']){
   const recovery=maviRecognitionRecovery({idleEnds:1,error:code});
   assert.equal(recovery.retry,false,code);
 }
});
test('speech end is handled only after an actual voice reply, not as an automatic empty retry',()=>{
 assert.deepEqual(maviRecognitionRecovery({idleEnds:0,hadSpeech:true}),
   {retry:false,paused:false,delay:0,reason:'answered'});
 assert.equal(maviRecognitionRecovery({idleEnds:0,error:'no-speech'}).reason,'no-speech');
});
test('Android recognizer is one-shot, has a watchdog, and shows errors with manual recovery',()=>{
 const src=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
 const security=readFileSync(new URL('../../server/security.mjs',import.meta.url),'utf8');
 assert.match(src,/recognition\.continuous=false/);
 assert.match(src,/recognitionWatchdogRef\.current=setTimeout/);
 assert.match(src,/if\(recognitionRef\.current!==recognition\)return/);
 assert.match(src,/setStatus\('typed'\)/);
 assert.match(src,/mavi-mic-recovery/);
 assert.match(src,/Ouvir novamente/);
 assert.match(src,/onClick=\{startRecording\}/);
 assert.match(src,/submitRef\.current\(message\)/);
 assert.match(css,/\.mavi-mic-recovery\{/);
 assert.match(security,/microphone=\(self\)/);
 const handler=src.split('recognition.onend=()=>{')[1]?.split('recognition.start()')[0]||'';
 assert.doesNotMatch(handler,/scheduleNextListen\(/,
  'an empty session must never re-arm speech input automatically');
});
