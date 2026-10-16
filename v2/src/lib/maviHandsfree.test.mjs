import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('V2 voice is rolled back to the functional original recognition flow',()=>{
 const jsx=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
 // The original October 15 implementation started recognition directly from
 // the user's button click and accepted the full browser transcript.
 assert.match(jsx,/const Recognizer=typeof window!=='undefined'\?\(window\.SpeechRecognition\|\|window\.webkitSpeechRecognition\):null/);
 assert.match(jsx,/recognition\.lang='pt-BR';recognition\.continuous=false;recognition\.interimResults=false;recognition\.maxAlternatives=1/);
 assert.match(jsx,/const phrase=Array\.from\(event\.results\|\|\[\]\)\.map\(row=>row\?\.\[0\]\?\.transcript\|\|''\)\.join\(' '\)\.trim\(\)/);
 assert.match(jsx,/recognition\.start\(\)/);
 assert.match(jsx,/listenRef\.current\('remote'\)/);
 assert.match(jsx,/onClick=\{toggle\}/);
 assert.match(jsx,/async function submit\(phrase\)/);
 assert.match(jsx,/handlersRef\.current\.onCommand\(text,controller\.signal\)/);
 assert.match(jsx,/handlersRef\.current\.onAccept\(selection\)/);
 // Complete restoration includes the working diagnostic UI and its styles.
 assert.match(jsx,/<section className="jev-panel"/);
 assert.match(css,/\.jev-panel/);
 assert.doesNotMatch(jsx,/MaviVoiceController|consumeMaviTranscript/);
});
