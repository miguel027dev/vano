import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
test('Mapbox logo is configured lower-left; address card remains lower-left',()=>{
 assert.match(map,/attributionControl:true,logoPosition:'bottom-left'/);
 assert.match(css,/left:calc\(env\(safe-area-inset-left,0px\) \+ 12px\)/);
 assert.match(css,/bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 11px\)/);
 assert.match(css,/bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 10px\)/);
 assert.match(css,/width:min\(325px,calc\(100vw - env\(safe-area-inset-left,0px\) - env\(safe-area-inset-right,0px\) - 125px\)\)/);
 for(const width of [320,360,393,412,430,768]){
   const card=Math.min(325,width-125);
   assert.ok(card>0 && card+12 <= width-100, 'logo must have clear space at '+width+'px');
 }
});
test('first real GPS can center after map style loads, without competing listeners',()=>{
 assert.match(map,/function centerOnFirstGpsFix\(\)/);
 assert.match(map,/if\(backend.current==='mapbox'&&!isLoaded\(map\)\)return/);
 assert.match(map,/paintMapbox\(map,latest\.current,lastSelection\);centerOnFirstGpsFix\(\)/);
 assert.match(page,/startGpsSession\(navigator\.geolocation/);
 assert.doesNotMatch(page,/useEffect\(\(\)=>\{requestGPS\(false\);\},\[\]\)/);
});
