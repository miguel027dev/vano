import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('MAVI presents only a button, never a typing or confirmation panel',()=>{
 const component=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../jev-voice.css',import.meta.url),'utf8');
 assert.match(component,/aria-label=\{enabled\?'Desativar Mavi/);
 assert.doesNotMatch(component,/<section\b|<form\b|<input\b|<textarea\b|<select\b|jev-panel/);
 assert.doesNotMatch(css,/\.jev-panel|\.jev-text|\.jev-voice-options/);
 assert.match(component,/extractMaviCommand\(phrase\)/);
 assert.match(component,/maviConfirmation\(command\)/);
 assert.match(component,/recognition\.continuous=true/);
 assert.match(component,/maviRearmDelay/);
 assert.match(component,/document\.visibilityState==='hidden'/);
});
