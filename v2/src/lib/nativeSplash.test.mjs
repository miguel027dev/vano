import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const reactSplash=readFileSync(new URL('../components/BrandSplash.jsx',import.meta.url),'utf8');
const detector=html.match(/<script id="vano-native-splash-preflight">([\s\S]*?)<\/script>/)?.[1];

function preflightClasses(userAgent){
  assert.ok(detector,'Native-shell detector runs before rendering the HTML splash');
  const classes=new Set();
  vm.runInNewContext(detector,{
    navigator:{userAgent},
    document:{documentElement:{classList:{add(name){classes.add(name);}}}},
  });
  return classes;
}

test('installed Android WebView suppresses the HTML and React splash layers',()=>{
  assert.ok(preflightClasses('Mozilla/5.0 Android VANOAndroid/3.1.5').has('vano-native-shell'));
  assert.match(html,/html\.vano-native-shell \.v42-preboot\{display:none\}/);
  assert.match(reactSplash,/isNativeShell\(\)/);
  assert.match(reactSplash,/if\(isNativeShell\(\)\)return null;/);
});

test('mobile browser and desktop website keep the web splash',()=>{
  assert.equal(preflightClasses('Mozilla/5.0 (Linux; Android 16) Chrome/155').has('vano-native-shell'),false);
  assert.equal(preflightClasses('Mozilla/5.0 (X11; Linux x86_64) Chrome/155').has('vano-native-shell'),false);
  assert.match(html,/<main class="v42-preboot"/);
  assert.match(reactSplash,/className="vano-splash"/);
});
