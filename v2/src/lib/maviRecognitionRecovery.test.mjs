import test from 'node:test';
import assert from 'node:assert/strict';
import {maviRecognitionRecovery,MAVI_IDLE_RESTART_LIMIT} from './maviRecognitionRecovery.mjs';
import {readFileSync} from 'node:fs';

test('silent microphone ends cannot cause an infinite on/off loop',()=>{
 const sequence=Array.from({length:9},(_,i)=>maviRecognitionRecovery({idleEnds:i+1}));
 assert.deepEqual(sequence.slice(0,2).map(x=>x.delay),[2400,4800]);
 assert.equal(MAVI_IDLE_RESTART_LIMIT,3);
 assert.equal(sequence[2].retry,false);
 assert.ok(sequence.slice(2).every(x=>x.paused&&!x.retry));
});
test('a real utterance can resume the listening cycle, and errors never spam permissions',()=>{
 assert.deepEqual(maviRecognitionRecovery({idleEnds:0,hadSpeech:true}),{retry:true,paused:false,delay:950,reason:'answered'});
 for(const reason of ['network','not-allowed','service-not-allowed','audio-capture']){
  assert.equal(maviRecognitionRecovery({idleEnds:0,error:reason}).retry,false,reason);
 }
 assert.equal(maviRecognitionRecovery({idleEnds:1,error:'no-speech'}).retry,true);
});
test('live mic is continuous but controlled; stale completions and route audio cannot restart another engine',()=>{
 const src=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const security=readFileSync(new URL('../../server/security.mjs',import.meta.url),'utf8');
 assert.match(src,/recognition\.continuous=false/);
 assert.match(src,/filter\(row=>row\?\.isFinal!==false\)/);
 assert.match(src,/recognitionError\.current=recognitionError\.current\|\|'no-speech'/);
 assert.match(src,/recognitionRef\.current!==recognition/);
 assert.match(src,/if\(navigationAudioActive\(\)\|\|window\.speechSynthesis\?\.speaking\)/);
 assert.match(src,/if\(enabledRef\.current&&status==='typed'/);
 assert.match(src,/setTimeout\(fallbackTicket,1800\)/);
 assert.doesNotMatch(src,/scheduleNextListen\(recovery\.delay\)/);
 assert.doesNotMatch(src,/recognitionIdleEnds/);
 assert.doesNotMatch(src,/if\(muted\)\{finish\(\);return;\}/);
 assert.match(security,/microphone=\(self\)/);
});
