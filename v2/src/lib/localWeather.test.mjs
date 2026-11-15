import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherEffect,applyMapWeather,attachLocalWeather} from './localWeather.mjs';
const now=Date.parse('2026-11-15T01:00:00Z');
const weather=effect=>({effect,strength:.35,observedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()});
function fixture(){
 const listeners={},calls=[];
 return {listeners,calls,isStyleLoaded:()=>true,on:(k,v)=>listeners[k]=v,off:k=>delete listeners[k],setRain:v=>calls.push(['rain',v]),setSnow:v=>calls.push(['snow',v])};
}
test('precipitation is mutually exclusive and removed for dry, expired, or reduced-motion conditions',()=>{
 const map=fixture();
 applyMapWeather(map,weather('rain'),{now});assert.ok(map.calls.at(-2)[1]);assert.equal(map.calls.at(-1)[1],null);
 applyMapWeather(map,weather('snow'),{now});assert.equal(map.calls.at(-2)[1],null);assert.ok(map.calls.at(-1)[1]);
 for(const [w,opts] of [[weather('none'),{now}],[weather('rain'),{now:now+600001}],[weather('rain'),{now,reduced:true}]]){
  applyMapWeather(map,w,opts);assert.equal(map.calls.at(-2)[1],null);assert.equal(map.calls.at(-1)[1],null);
 }
 assert.equal(weatherEffect({effect:'rain'},now),'none');
 assert.doesNotThrow(()=>applyMapWeather({isStyleLoaded:()=>true},weather('rain'),{now}));
});
test('GPS weather is cached across frames, restored on style changes, cleared on movement and cleaned up',async()=>{
 const map=fixture();let point=[-46.721,-23.611],time=now,tick,calls=0,cancelled=false;
 const stop=attachLocalWeather(map,{getPoint:()=>point,clock:()=>time,documentRef:{hidden:false},media:{matches:false},
  schedule:fn=>(tick=fn,1),cancel:()=>cancelled=true,
  fetcher:async url=>{calls++;assert.ok(url.includes('lng=-46.72&lat=-23.61'));return {ok:true,json:async()=>({weather:weather('rain')})};}});
 await new Promise(setImmediate);assert.equal(calls,1);assert.ok(map.calls.at(-2)[1]);
 for(let i=0;i<30;i++)tick();assert.equal(calls,1);
 const count=map.calls.length;map.listeners['style.load']();assert.ok(map.calls.length>count);
 point=[-47,-24];tick();assert.equal(map.calls.at(-2)[1],null);assert.equal(calls,1);
 stop();assert.equal(cancelled,true);assert.equal(map.listeners['style.load'],undefined);
});
test('no coordinates means no provider request, and failed provider clears existing precipitation',async()=>{
 const map=fixture();let point=null,tick,calls=0;
 const stop=attachLocalWeather(map,{getPoint:()=>point,clock:()=>now,documentRef:{},schedule:fn=>(tick=fn,1),cancel:()=>{},
 fetcher:async()=>{calls++;throw Error('offline');}});
 await new Promise(setImmediate);assert.equal(calls,0);
 point=[0,0];tick();await new Promise(setImmediate);assert.equal(calls,1);assert.equal(map.calls.at(-2)[1],null);stop();
});
