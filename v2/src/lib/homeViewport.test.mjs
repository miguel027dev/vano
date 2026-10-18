import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('welcome keeps all navigation actions and scopes full-height shell to /inicio',()=>{
 const app=read('../App.jsx');
 const entry=read('../pages/EntryPage.jsx');
 assert.match(app,/shell-home/);
 for (const target of ['/cadastro','/entrar','/mapa','/privacidade','/termos']) {
   assert.ok(entry.includes(target),'missing entry destination '+target);
 }
});
test('welcome fits short mobile viewports and retains an available map area',()=>{
 const css=read('../home-motion.css');
 assert.match(css,/\.app-shell\.shell-home\{height:100svh;height:100dvh/);
 assert.match(css,/\.vhome-wrap\{[^}]*grid-template-rows:minmax\(0,1fr\) auto/);
 assert.match(css,/\.vhome-hero\{[^}]*grid-template-rows:auto minmax\(0,1fr\)/);
 assert.match(css,/\.vhome-city\{[^}]*min-height:0;height:100%/);
 assert.match(css,/@media\(max-width:819px\) and \(max-height:540px\)/);
 assert.match(css, /orientation:landscape/);
 assert.match(css,/safe-area-inset-bottom/);
});
