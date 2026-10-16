import test from 'node:test';
import assert from 'node:assert/strict';
import { microphoneMessage,mediaCaptureError,recorderMime,isSpeechServiceFailure } from './jevMicSupport.mjs';
test('service-not-allowed does not imply microphone permission denied',()=>{
 assert.match(microphoneMessage('service-not-allowed'),/serviço de transcrição/);
 assert.match(microphoneMessage('not-allowed'),/não confirma/);
 assert.equal(isSpeechServiceFailure('service-not-allowed'),true);
 assert.equal(isSpeechServiceFailure('no-speech'),false);
});
test('microphone capture distinguishes hardware from permissions',()=>{
 assert.equal(mediaCaptureError({name:'NotReadableError'}).code,'busy');
 assert.equal(mediaCaptureError({name:'NotAllowedError'}).code,'permission');
 assert.equal(mediaCaptureError({name:'NotFoundError'}).code,'device');
});
test('MediaRecorder probes supported formats instead of assuming webm',()=>{
 assert.equal(recorderMime({isTypeSupported:m=>m==='audio/mp4'}),'audio/mp4');
 assert.equal(recorderMime({isTypeSupported:()=>false}),'');
 assert.equal(recorderMime(null),'');
});
