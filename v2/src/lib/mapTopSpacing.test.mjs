import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');
const top=css.match(/\.map-page\{--v31-top-gap:(\d+)px\}/);
const mobile=css.match(/@media\(max-width:600px\)\{\s*\.map-page\{--v31-top-gap:(\d+)px\}/);
test('search top padding includes device safe-area and visible breathing room',()=>{
  assert.ok(top,'desktop spacing token must exist');
  assert.ok(mobile,'mobile spacing token must exist');
  assert.ok(Number(top[1])>=16,'desktop map search should not touch viewport top');
  assert.ok(Number(mobile[1])>=22,'phone map search should clear browser chrome');
  assert.match(css,/padding:calc\(env\(safe-area-inset-top,0px\) \+ var\(--v31-top-gap\)\)/);
});
test('search dropdown and GPS cards follow mobile top-spacing token without collisions',()=>{
  assert.match(css,/\.map-page \.search-results\{top:calc\(env\(safe-area-inset-top,0px\) \+ var\(--v31-top-gap\) \+ 65px\)/);
  assert.match(css,/\.map-page \.gps-banner:not\(\.gps-picking\),\.map-page \.gps-picking,\.map-page \.gps-manual-chip\{top:calc\(env\(safe-area-inset-top,0px\) \+ var\(--v31-top-gap\) \+ 128px\)/);
  // viewport top offsets are independent of notch height because it is included in each expression
  for(const safe of [0,24,44,59]){
    const gap=Number(mobile[1]), searchTop=safe+gap, searchBottom=searchTop+60;
    const dropdownTop=safe+gap+65,shortcutsBottom=searchBottom+9+38, gpsCardTop=safe+gap+128;
    assert.ok(dropdownTop-searchBottom>=5);
    assert.ok(gpsCardTop-shortcutsBottom>=18);
  }
});
