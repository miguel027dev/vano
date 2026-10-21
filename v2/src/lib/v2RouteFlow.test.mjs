import test from 'node:test';
import assert from 'node:assert/strict';
import {v2RouteDashPattern,updateV2RouteFlow} from './v2RouteFlow.mjs';
import {TRAFFIC_COLORS,routeTrafficStops,trafficRouteIndex} from './routeTraffic.mjs';
test('orange remains the default without evidence and for non-heavy traffic',()=>{
 for(const state of ['unknown','flowing','slow'])assert.equal(TRAFFIC_COLORS[state],'#ff7900');
 const index=trafficRouteIndex({type:'LineString',coordinates:[[0,0],[.01,0]]});
 assert.ok(routeTrafficStops(index).every(([,color])=>color==='#ff7900'));
 assert.notEqual(TRAFFIC_COLORS.heavy,TRAFFIC_COLORS.unknown);
});
test('moving dashes preserve length, spacing and continuous wrap',()=>{
 for(let t=0;t<9600;t+=13){const pattern=v2RouteDashPattern(t);
  assert.ok(pattern.every(n=>Number.isFinite(n)&&n>=0));
  assert.ok(Math.abs(pattern.reduce((a,b)=>a+b,0)-14)<1e-8);
  assert.ok(Math.abs(pattern[0]+pattern[2]-4)<1e-8);
 }
 assert.deepEqual(v2RouteDashPattern(0),v2RouteDashPattern(4800));
});
test('V2 highlights are throttled, respect reduced motion, and reset on public map',()=>{
 const calls=[],map={getLayer:()=>true,setPaintProperty:(...args)=>calls.push(args)};
 const data={active:true,v2Experience:true,vehicle:'carro',selectedRoute:'safe',routes:[{id:'safe',geometry:{coordinates:[[0,0],[.01,0]]}}]};
 updateV2RouteFlow(map,'mapbox',data,100);assert.equal(calls.length,1);
 updateV2RouteFlow(map,'mapbox',data,120);assert.equal(calls.length,1);
 updateV2RouteFlow(map,'mapbox',data,145);assert.equal(calls.length,2);
 updateV2RouteFlow(map,'mapbox',data,200,true);assert.deepEqual(calls.at(-1)[2],[4,10]);
 const length=calls.length;updateV2RouteFlow(map,'mapbox',data,300,true);assert.equal(calls.length,length);
 updateV2RouteFlow(map,'mapbox',{...data,v2Experience:false},400);assert.deepEqual(calls.at(-1)[2],[4,10]);
 const last=calls.length;updateV2RouteFlow(map,'mapbox',{...data,v2Experience:false},500);assert.equal(calls.length,last);
 updateV2RouteFlow(map,'mapbox',{...data,active:false},600);assert.equal(calls.length,last);
});
