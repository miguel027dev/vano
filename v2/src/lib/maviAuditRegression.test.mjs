import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('MAVI pre-trip button remains present without enabling route mutations',()=>{
 const page=src('../pages/MapPage.jsx');
 assert.match(page,/jevMode&&\(navMode\|\|Boolean\(dest\)\)&&<JevVoiceButton/);
 assert.match(page,/onAccept=\{applyJev\}/);
 assert.match(page,/onPreview=\{showMaviPreview\}/);
});
test('MAVI recovery UI requires a deliberate tap before starting uploadable recording',()=>{
 const voice=src('../components/JevVoiceButton.jsx');
 assert.match(voice,/recognition.interimResults=true/);
 assert.match(voice,/maviSpeechTranscripts\(event.results\)/);
 assert.match(voice,/void submitRef.current\(interim\)/);
 assert.match(voice,/onClick=\{\(\)=>void startRecording\(\)\}/);
 assert.match(voice,/status==='recording'\?<button/);
 assert.match(voice,/onClick=\{stopRecording\}/);
 assert.match(voice,/onSubmit=\{e=>\{e.preventDefault\(\);void submitRef.current\(typed\);\}\}/);
});
