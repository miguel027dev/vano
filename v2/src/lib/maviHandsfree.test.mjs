import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('MAVI V2 restores the known functional click -> SpeechRecognition.start direct path',()=>{
 const src=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const originalBehavior=[
  /const Recognizer=typeof window!=='undefined'\?\(window\.SpeechRecognition\|\|window\.webkitSpeechRecognition\):null/,
  /recognition\.lang='pt-BR';recognition\.continuous=false/,
  /recognition\.interimResults=false;recognition\.maxAlternatives=1/,
  /const phrase=Array\.from\(event\.results\|\|\[\]\)\.map\(row=>row\?\.\[0\]\?\.transcript\|\|''\)\.join\(' '\)\.trim\(\)/,
  /recognition\.start\(\)/,
  /listenRef\.current\(\)/,
  /onClick=\{toggle\}/
 ];
 for(const pattern of originalBehavior)assert.match(src,pattern);
 assert.doesNotMatch(src,/new MaviVoiceController|await speakVoice|document\.visibilityState==='hidden'\)\s*return/);
});

test('only one button; no text input or route acceptance via UI',()=>{
 const src=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
 assert.doesNotMatch(src,/<section\b|<form\b|<input\b|<textarea\b|<select\b|jev-panel/);
 assert.doesNotMatch(css,/\.jev-panel|\.jev-text|\.jev-voice-options/);
 assert.match(src,/consumeMaviTranscript\(phrase/);
 assert.match(src,/maviConfirmation\(command\)/);
 assert.match(src,/pendingDeadlineRef\.current=Date\.now\(\)\+60000/);
 assert.match(src,/const response=await handlersRef\.current\.onCommand\(command,controller\.signal\)/);
 assert.match(src,/data-mavi-status=\{status\}/);
 assert.match(src,/role="status"/);
});

test('route calculations are not stalled by voice playback',()=>{
 const src=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const call=src.indexOf('const response=await handlersRef.current.onCommand(command,controller.signal)');
 const response=src.indexOf("speak(response?.text||");
 assert.ok(call>0&&response>call);
 assert.doesNotMatch(src.slice(src.indexOf('async function submit('),call),/await speak/);
});
