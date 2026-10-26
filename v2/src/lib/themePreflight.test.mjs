import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const preflight=readFileSync(new URL('../../public/theme-preflight.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');

function initialTheme(saved,systemDark=false){
  const document={documentElement:{dataset:{}}};
  const window={localStorage:{getItem:()=>saved},matchMedia:()=>({matches:systemDark})};
  runInNewContext(preflight,{document,window});
  return document.documentElement.dataset.theme;
}

test('preflight restores saved light/dark and follows system theme without React',()=>{
  assert.equal(initialTheme('dark'),'dark');
  assert.equal(initialTheme('light'),'light');
  assert.equal(initialTheme('system',true),'dark');
  assert.equal(initialTheme('system',false),'light');
});

test('invalid settings and blocked local storage do not crash boot',()=>{
  assert.equal(initialTheme('untrusted'),undefined);
  assert.equal(initialTheme(null),undefined);
  const document={documentElement:{dataset:{}}};
  assert.doesNotThrow(()=>runInNewContext(preflight,{document,window:{localStorage:{getItem(){throw Error('storage denied');}}}}));
  assert.equal(document.documentElement.dataset.theme,undefined);
});

test('CSP-safe script runs before critical loading styles and module hydration',()=>{
  const script=html.indexOf('<script src="/theme-preflight.js"></script>');
  assert.ok(script>=0 && script<html.indexOf('<style>'));
  assert.ok(script<html.indexOf('type="module"'));
  assert.match(html,/\.v42-preboot\{position:fixed/);
  assert.match(app,/if\(loading\)return;const theme=preferences\?\.theme/);
  assert.match(app,/localStorage\.setItem\('vano-boot-theme',theme\)/);
  assert.match(app,/document\.documentElement\.dataset\.theme=theme/);
});
