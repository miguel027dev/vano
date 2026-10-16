import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consumeMaviTranscript,maviConfirmation} from './maviVoiceLogic.mjs';

const component=()=>readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');

test('restore the exact known working browser SpeechRecognition lifecycle',()=>{
 const src=component();
 const required=[
  /const Recognizer=typeof window!=='undefined'\?\(window\.SpeechRecognition\|\|window\.webkitSpeechRecognition\):null/,
  /recognition\.lang='pt-BR';recognition\.continuous=false;recognition\.interimResults=false;recognition\.maxAlternatives=1/,
  /const phrase=Array\.from\(event\.results\|\|\[\]\)\.map\(row=>row\?\.\[0\]\?\.transcript\|\|''\)\.join\(' '\)\.trim\(\)/,
  /recognition\.start\(\)/,
  /listenRef\.current\('remote'\)/,
  /onClick=\{toggle\}/
 ];
 for(const pattern of required)assert.match(src,pattern);
 assert.doesNotMatch(src,/new MaviVoiceController/);
});

test('MAVI /v2 voice-only interface has no typed fallback, modal or controls',()=>{
 const src=component();
 const css=readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
 assert.doesNotMatch(src,/<section\b|<form\b|<input\b|<textarea\b|<select\b|jev-panel|setTyped|setHeard/);
 assert.doesNotMatch(css,/\.jev-panel|\.jev-text|\.jev-voice-options/);
 assert.match(src,/consumeMaviTranscript\(phrase,/);
 assert.match(src,/maviConfirmation\(simplified\)/);
 assert.match(src,/data-mavi-status=\{status\}/);
 assert.match(src,/role="status"/);
});

test('route request is not blocked by assistant speech completion',()=>{
 const src=component();
 const call=src.indexOf('const response=await handlersRef.current.onCommand(text,controller.signal)');
 const speak=src.indexOf("setReply(message);speak(message);",call);
 assert.ok(call>0&&speak>call,'request must precede spoken response');
 assert.doesNotMatch(src.slice(src.indexOf('async function submit('),call),/await speak/);
});

test('wake phrase and explicit spoken acceptance never auto-swap route',()=>{
 const wake=consumeMaviTranscript('Mavi recalcula a rota',{now:1000});
 assert.deepEqual(wake,{kind:'command',command:'recalcula a rota',wakeUntil:0});
 assert.equal(maviConfirmation(wake.command),null);
 assert.equal(maviConfirmation('pode'), 'accept');
 assert.equal(maviConfirmation('Mavi, pode ser essa'),null,'caller must strip wake word before verifying consent');
 assert.equal(maviConfirmation('troca a rota'),null,'new route request is not acceptance');
 assert.equal(maviConfirmation('não gostei, outra rota'),null);
});

test('browser errors are differentiated and cannot leave green listening state on hard failure',()=>{
 const src=component();
 for(const code of ['not-allowed','service-not-allowed','audio-capture','language-not-supported'])assert.ok(src.includes("'"+code+"'"));
 assert.match(src,/recognitionError\.current=code;cancelEverything\(\);setEnabled\(false\);setStatus\('off'\)/);
 assert.match(src,/data-mavi-error=\{/);
});
