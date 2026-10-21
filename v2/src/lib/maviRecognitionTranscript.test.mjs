import test from 'node:test';
import assert from 'node:assert/strict';
import {maviSpeechTranscripts} from './maviRecognitionTranscript.mjs';
const row=(transcript,isFinal)=>Object.assign([{transcript}],{isFinal});
test('MAVI preserves Android interim words if recognizer ends without final',()=>{
  assert.deepEqual(maviSpeechTranscripts([row('procure farmacia',false)]),{final:'',interim:'procure farmacia'});
  assert.deepEqual(maviSpeechTranscripts([row('procure farmacia',true)]),{final:'procure farmacia',interim:''});
  assert.deepEqual(maviSpeechTranscripts([row('mavi',true),row('posto no caminho',false)]),{final:'mavi',interim:'posto no caminho'});
  assert.deepEqual(maviSpeechTranscripts([]),{final:'',interim:''});
});
