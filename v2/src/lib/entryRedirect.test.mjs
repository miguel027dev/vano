import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');

test('public root and former welcome URL redirect permanently to the real map',()=>{
  assert.match(server,/requestPath==='\\/'\\|\\|requestPath==='\\/inicio'/);
  assert.match(server,/requestPath==='\\/inicio\\/'/);
  assert.match(server,/res\\.writeHead\\(301,\\{\\.\\.\\.headers,'Location':`\\/mapa\\$\\{parsedRequestUrl\\.search\\}`/);
});

test('legacy client-side entry routes never show the welcome screen',()=>{
  assert.match(app,/function InitialRoute\\(\\)\\{return <Navigate to="\\/mapa" replace\\/>\\}/);
  assert.match(app,/<Route path="\\/inicio" element=\\{<Navigate to="\\/mapa" replace\\/>\\}\\/>/);
  assert.doesNotMatch(app,/<EntryPage\\s*\\/>/);
});
