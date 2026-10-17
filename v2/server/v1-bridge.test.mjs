import test from 'node:test';import assert from 'node:assert/strict';
import {buildV1Url,normalizeV1Route} from './v1-bridge.mjs';
const a=[-46.7,-23.6],b=[-46.69,-23.59];
test('V1 URL preserves mode and maps motorcycle',()=>{const u=buildV1Url('http://localhost:5000',a,b,'fastest','moto',{bearing:55,speed:4});assert.equal(u.searchParams.get('profile'),'motorcycle');assert.equal(u.searchParams.get('start_speed'),'4');assert.equal(u.searchParams.get('mode'),'fastest');});
test('V1 units normalize seconds and meters',()=>{const o=normalizeV1Route({selected_id:8,routes:[{id:8,duration:780,distance:4800,geometry:{type:'LineString',coordinates:[a,b]},steps:[{instruction:'Vire à direita'}],micro_route:true,eta_gain_s:45}]},'fastest');assert.equal(o.duration,13);assert.equal(o.distance,4.8);assert.equal(o.microRoute,true);assert.equal(o.etaGainSeconds,45);assert.equal(o.verifiedSafety,false);});
test('Invalid geometry from V1 is rejected',()=>{assert.throws(()=>normalizeV1Route({routes:[{duration:500,distance:2000,geometry:{type:'LineString',coordinates:[a]}}]},'safest'));});
