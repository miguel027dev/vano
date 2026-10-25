import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldHighlightSelectedRoute,v2RouteStrokePaint,v2RouteStrokePixels} from './v2RouteStroke.mjs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');

test('public /mapa enables the exact V2 route stroke for every user, without admin access',()=>{
  assert.match(page,/v2Experience=\{location\.pathname==='\/v2'\}\s+readableRouteStroke=\{location\.pathname==='\/mapa'\|\|location\.pathname==='\/v2'\}/);
  assert.ok(shouldHighlightSelectedRoute({readableRouteStroke:true,v2Experience:false}));
  assert.ok(shouldHighlightSelectedRoute({readableRouteStroke:false,v2Experience:true}));
  assert.ok(!shouldHighlightSelectedRoute({readableRouteStroke:false,v2Experience:false}));
  assert.ok(!shouldHighlightSelectedRoute(null));
  assert.deepEqual(v2RouteStrokePaint(true).line,v2RouteStrokePaint(shouldHighlightSelectedRoute({readableRouteStroke:true})).line);
  assert.deepEqual(v2RouteStrokePixels(17,true),{core:10,halo:14});
  assert.deepEqual(v2RouteStrokePixels(18,true),{core:12,halo:16});
  assert.deepEqual(v2RouteStrokePixels(17,false),{core:8,halo:13});
});

test('Mapbox preserves /mapa route paint and widens only private /v2 route, alternatives unchanged',()=>{
  assert.equal((map.match(/const strokeV2=shouldHighlightSelectedRoute\(data\);/g)||[]).length,2);
  assert.match(map,/const stroke=v2RouteStrokePaint\(strokeV2\)/);
  assert.match(map,/source:'vano-v2-selected'.*paint:\{\.\.\.stroke\.halo,'line-width':privateHaloWidth\}/);
  assert.match(map,/source:'vano-v2-selected'.*paint:\{'line-color':'#ff7900',\.\.\.stroke\.line,'line-width':privateLineWidth/);
  assert.match(map,/id:'vano-v2-other'.*'line-width':5,'line-opacity':\.66/);
  assert.match(map,/source:'vano-v2-traveled'.*'line-width':7,'line-opacity':\.85/);
  assert.match(map,/if\(map\._vanoRouteStrokeV2!==strokeV2\|\|map\._vanoPrivateV2Stroke!==privateV2\)/);
});

test('Leaflet fallback uses identical outline, unmodified route geometry and no extra redraw per GPS fix',()=>{
  assert.match(map,/map\._vanoLeafletStrokeV2!==strokeV2/);
  assert.match(map,/map\._vanoV2SelectedHalo=L\.polyline\(points/);
  assert.match(map,/map\._vanoV2SelectedLine=L\.polyline\(points/);
  assert.match(map,/map\.on\('zoomend',map\._vanoV2StrokeZoomHook\)/);
  assert.match(map,/!sameRouteShapeReferences\(map\._vanoLeafletGeometries,geometries\)/);
  assert.match(map,/source\.setData\(body\);routeShapes\[id\]=shapes/);
});

test('real GPS, camera and private V2 traffic remain isolated from new public stroke',()=>{
  assert.match(map,/export default function VanoMap\(\{active=true,simulationPreview=false,droneSimulation=false,v2Experience=false,readableRouteStroke=false/);
  assert.match(map,/latest\.current=\{active,simulationPreview,droneSimulation,v2Experience,readableRouteStroke,userCoords/);
  // Traffic gradients continue to depend on V2 mode and existing verified evidence.
  assert.match(map,/const traffic=data\.v2Experience&&data\.vehicle!=='a-pe'\?data\.routeTraffic:null/);
  assert.match(map,/map\.setPaintProperty\('vano-v2-line','line-gradient',traffic\.gradient\)/);
  assert.match(map,/map\.setPaintProperty\('vano-v2-line','line-color','#ff7900'\)/);
  assert.match(page,/const adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
  assert.match(page,/routeTraffic=\{adminV2RoadSigns&&routeVehicle!=='a-pe'\?routeTraffic:null\}/);
  const helper=readFileSync(new URL('./v2RouteStroke.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/jumpTo|easeTo|flyTo|requestAnimationFrame|setInterval|setTimeout/);
  assert.match(map,/const maxYawStep=\(latest\.current\.droneSimulation\|\|latest\.current\.v2Experience&&latest\.current\.simulationPreview\?82:72\)\*dt\/1000/);
});
