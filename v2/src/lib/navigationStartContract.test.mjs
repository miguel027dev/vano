import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
test('one click starts navigation independent of offline tile status',()=>{
 const begin=map.slice(map.indexOf('async function begin(){'),map.indexOf('function reset(){'));
 assert.ok(begin.includes('setNavMode(true)'));
 assert.ok(!/preparingStart|offlineMap\\.status/.test(begin));
 assert.ok(!/Preparando para seguir sem internet|setPreparingStart/.test(map));
 assert.ok(map.includes("setTimeout(prepareAhead,1600)"));
 assert.ok(map.includes('setInterval(prepareAhead,14000)'));
});
