import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
test('provider badges move bottom-right; the left location card stays separate',()=>{
 assert.match(map,/attributionControl:true,logoPosition:'bottom-right'/);
 assert.match(css,/left:calc\(env\(safe-area-inset-left,0px\) \+ 12px\)/);
 assert.match(css,/bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 11px\)/);
 assert.match(css,/bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 10px\)/);
 assert.match(css,/width:min\(357px,calc\(100vw - env\(safe-area-inset-left,0px\) - env\(safe-area-inset-right,0px\) - 105px\)\)/);
 for(const width of [320,360,393,412,430,768]){
   const card=Math.min(357,width-105);
   assert.ok(card>0 && card+12 <= width-85, 'provider marks must have clear space at '+width+'px');
 }
});
test('first real GPS centers immediately without relying on loading all map tiles',()=>{
 assert.match(map,/function centerOnFirstGpsFix\(\)/);
 assert.doesNotMatch(map,/if\(backend.current==='mapbox'&&!isLoaded\(map\)\)return/);
 assert.match(map,/map\.jumpTo\(\{center:d\.gpsCoords/);
 assert.doesNotMatch(map,/maskInitialMap/);
 assert.match(map,/paintMapbox\(map,latest\.current,lastSelection\);centerOnFirstGpsFix\(\)/);
 assert.match(page,/startGpsSession\(navigator\.geolocation/);
 assert.doesNotMatch(page,/useEffect\(\(\)=>\{requestGPS\(false\);\},\[\]\)/);
});
