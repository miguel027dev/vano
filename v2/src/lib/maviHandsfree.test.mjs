import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('MAVI /v2 has only microphone button and no typing or route action panel',()=>{
 const component=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
 assert.match(component,/aria-label=\{active\?'Desativar Mavi/);
 assert.match(component,/new MaviVoiceController/);
 assert.match(component,/controller\.start\(\)/);
 assert.match(component,/role="status"/);
 assert.doesNotMatch(component,/<section\b|<form\b|<input\b|<textarea\b|<select\b|jev-panel/);
 assert.doesNotMatch(css,/\.jev-panel|\.jev-text|\.jev-voice-options/);
 const controller=readFileSync(new URL('./maviVoiceController.mjs',import.meta.url),'utf8');
 assert.match(controller,/consumeMaviTranscript/);
 assert.match(controller,/recognition\.continuous=false/);
 assert.match(controller,/recognition\.interimResults=true/);
 assert.match(controller,/this\.d\.onCommand\(command,controller\.signal\)/);
});
