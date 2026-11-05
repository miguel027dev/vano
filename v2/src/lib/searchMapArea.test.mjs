import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSearchMapArea} from './searchMapArea.js';
function setup(leaflet=false){
 const handlers=new Map(),native=new Map(),areas=[],state={navigation:false};
 const map={on:(event,fn)=>handlers.set(event,fn),off:event=>handlers.delete(event),getCenter:()=>({lng:-9.14,lat:38.72})};
 const root={addEventListener:(event,fn)=>native.set(event,fn),removeEventListener:event=>native.delete(event)};
 const detach=attachSearchMapArea(map,root,{leaflet,getState:()=>state,onArea:point=>areas.push(point)});
 return {emit:(event,data)=>handlers.get(event)?.(data),wheel:()=>native.get('wheel')?.(),areas,state,detach,handlers,native};
}
test('GPS/camera movements do not impersonate a selected map region',()=>{
 const s=setup();s.emit('moveend');s.emit('zoomstart');s.emit('moveend');assert.equal(s.areas.length,0);
 s.emit('dragstart',{originalEvent:{}});s.emit('moveend');assert.deepEqual(s.areas,[[-9.14,38.72]]);
 s.state.navigation=true;s.emit('dragstart',{originalEvent:{}});s.emit('moveend',{originalEvent:{}});assert.equal(s.areas.length,1);
 s.detach();assert.equal(s.handlers.size,0);assert.equal(s.native.size,0);
});
test('Leaflet deliberate drag or wheel chooses an area but automatic movement does not',()=>{
 const s=setup(true);s.emit('moveend');assert.equal(s.areas.length,0);
 s.emit('dragstart');s.emit('moveend');s.wheel();s.emit('moveend');assert.equal(s.areas.length,2);
 s.state.simulationPreview=true;s.emit('dragstart');s.emit('moveend');assert.equal(s.areas.length,2);
});
