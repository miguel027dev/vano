import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');

test('white map keeps live puck above 3D map depth without changing black presentation',()=>{
  assert.match(src,/const stableLightGpsPuck=key==='current'&&data\.appearance==='light'/);
  assert.match(src,/pitchAlignment:type==='vehicle'&&!data\.droneSimulation&&!stableLightGpsPuck\?'map':'viewport'/);
  assert.match(src,/occludedOpacity:stableLightGpsPuck\|\|\(type==='vehicle'&&data\.droneSimulation\)\?1:\.2/);
  assert.match(src,/const desiredPitch=data\.droneSimulation\|\|stableLightGpsPuck\?'viewport':'map'/);
  assert.match(src,/const visibility=data\.droneSimulation\|\|stableLightGpsPuck\?1:\.2/);
});

test('white custom Mapbox style cannot change GPS map projection or terrain alignment',()=>{
  assert.match(src,/const stabilizeLightGpsSurface=\(\)=>/);
  assert.match(src,/latest\.current\.appearance!=='light'\|\|latest\.current\.layer==='satellite'/);
  assert.match(src,/map\.getProjection\?\.\(\)\?\.name!=='mercator'/);
  assert.match(src,/map\.setProjection\?\.\('mercator'\)/);
  assert.match(src,/if\(map\.getTerrain\?\.\(\)\)map\.setTerrain\?\.\(null\)/);
  assert.match(src,/stabilizeLightGpsSurface\(\);/);
  assert.match(src,/map\.on\('style\.load',update\)/);
  assert.match(src,/map\.setStyle\(style,\{diff:false\}\)/);
});
