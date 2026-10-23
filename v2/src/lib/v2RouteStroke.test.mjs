import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V2_ROUTE_CORE_STOPS,V2_ROUTE_CASING_STOPS,V2_ROUTE_CASING_COLOR,
  v2RouteStrokePaint,v2RouteStrokePixels} from './v2RouteStroke.mjs';

test('V2 reference widths are exact and casing keeps a 2px margin per side',()=>{
 const main=v2RouteStrokePaint(true);
 assert.equal(main.halo['line-color'],V2_ROUTE_CASING_COLOR);
 assert.equal(main.halo['line-opacity'],.91);
 assert.equal(main.line['line-width'][0],'interpolate');
 assert.deepEqual(main.line['line-width'][2],['zoom']);
 for(const [zoom,core] of V2_ROUTE_CORE_STOPS){
  const width=v2RouteStrokePixels(zoom,true);
  assert.equal(width.core,core);
  assert.equal(width.halo,core+4);
 }
 assert.deepEqual(V2_ROUTE_CASING_STOPS.map(x=>x[0]),V2_ROUTE_CORE_STOPS.map(x=>x[0]));
 assert.deepEqual(v2RouteStrokePixels(17,true),{core:10,halo:14});
 assert.deepEqual(v2RouteStrokePixels(18,true),{core:12,halo:16});
});

test('V1 styling is byte-for-byte equivalent to previous fixed paints',()=>{
 assert.deepEqual(v2RouteStrokePaint(false),{
  halo:{'line-color':'#ffffff','line-opacity':.94,'line-width':13},
  line:{'line-width':8}
 });
 assert.deepEqual(v2RouteStrokePixels(17,false),{core:8,halo:13});
 assert.deepEqual(v2RouteStrokePixels(20,false),{core:8,halo:13});
});

test('fractional zoom interpolates continuously and clamps outside bounds',()=>{
 assert.deepEqual(v2RouteStrokePixels(16.5,true),{core:9,halo:13});
 assert.deepEqual(v2RouteStrokePixels(17.5,true),{core:11,halo:15});
 assert.deepEqual(v2RouteStrokePixels(13,true),{core:5,halo:9});
 assert.deepEqual(v2RouteStrokePixels(21,true),{core:13,halo:17});
 assert.deepEqual(v2RouteStrokePixels(NaN,true),{core:10,halo:14});
 const before=v2RouteStrokePixels(16.999,true);
 const after=v2RouteStrokePixels(17.001,true);
 assert.ok(after.core-before.core<.01,'no zoom threshold jump');
});

test('route source, Mapbox casing, orange core and traffic gradient retain original contracts',()=>{
 const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(src,/const strokeV2=Boolean\(data\.v2Experience\)/);
 assert.match(src,/const stroke=v2RouteStrokePaint\(strokeV2\)/);
 assert.match(src,/source:'vano-v2-selected'.*paint:stroke\.halo/);
 assert.match(src,/source:'vano-v2-selected'.*paint:\{'line-color':'#ff7900',\.\.\.stroke\.line/);
 assert.match(src,/if\(map\._vanoRouteStrokeV2!==strokeV2\)/);
 assert.match(src,/map\.setPaintProperty\('vano-v2-halo','line-width',stroke\.halo\['line-width'\]\)/);
 assert.match(src,/map\.setPaintProperty\('vano-v2-line','line-width',stroke\.line\['line-width'\]\)/);
 assert.match(src,/map\.setPaintProperty\('vano-v2-line','line-gradient',traffic\.gradient\)/);
 assert.match(src,/map\.setPaintProperty\('vano-v2-line','line-color',TRAFFIC_COLORS\.unknown\)/);
 assert.match(src,/map\.setPaintProperty\('vano-v2-line','line-gradient',null\)/);
 assert.match(src,/map\.setPaintProperty\('vano-v2-line','line-color','#ff7900'\)/);
});

test('alternatives and traveled section retain subordinate emphasis',()=>{
 const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(src,/id:'vano-v2-other'.*'line-width':5,'line-opacity':\.66/);
 assert.match(src,/id:'vano-v2-progress'.*'line-width':7,'line-opacity':\.85/);
 assert.match(src,/id:'vano-v2-flow'.*'line-width':2\.1,'line-opacity':\.62/);
 assert.match(src,/STATIC_ROUTE_DASH_PATTERN/);
 assert.match(src,/if\(map\._vanoRouteStrokeV2!==strokeV2\)/);
 // Do not add new per-frame line paint writes or new animation clocks.
 const helper=readFileSync(new URL('./v2RouteStroke.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/requestAnimationFrame|setInterval|setTimeout|easeTo|jumpTo/);
 const animation=readFileSync(new URL('./v2RouteFlow.mjs',import.meta.url),'utf8');
 assert.match(animation,/v2RouteDashPattern\(time\)/);
 assert.match(animation,/time-\(map\._v81FlowPaintAt\|\|0\)<40/);
});

test('Leaflet fallback matches widths and reuses route progress/geometry',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const traffic=readFileSync(new URL('./routeTrafficMarkers.jsx',import.meta.url),'utf8');
 assert.match(map,/map\._vanoLeafletStrokeV2!==strokeV2/);
 assert.match(map,/map\._vanoV2SelectedHalo=L\.polyline\(points/);
 assert.match(map,/map\._vanoV2SelectedLine=L\.polyline\(points/);
 assert.match(map,/map\.on\('zoomend',map\._vanoV2StrokeZoomHook\)/);
 assert.match(traffic,/const trafficStrokeWidth=v2RouteStrokePixels\(map\.getZoom\(\),true\)\.core/);
 assert.match(traffic,/weight:trafficStrokeWidth,opacity:1/);
 assert.match(traffic,/map\.on\('zoomend',map\._vanoLeafletTrafficZoomHook\)/);
 assert.match(traffic,/trafficColorAt\(stops,\(a\+b\)\/2\)/);
});
