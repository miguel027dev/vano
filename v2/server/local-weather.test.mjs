import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherPoint,normalizeWeather,createLocalWeather} from './local-weather.mjs';
const now=Date.parse('2026-11-15T01:00:00Z');
const body=code=>({current:{time:now/1000,weather_code:code}});
test('weather request accepts only valid bounded coordinates and rounds location',()=>{
 for(const q of ['', 'lng=&lat=', 'lng=x&lat=0','lng=181&lat=0','lng=0&lat=86'])assert.equal(weatherPoint(new URLSearchParams(q)),null);
 assert.deepEqual(weatherPoint(new URLSearchParams('lng=-46.7211&lat=-23.6111')),[-46.72,-23.61]);
});
test('current weather distinguishes rain, snow and dry conditions; stale/unknown data cannot animate',()=>{
 for(const code of [51,61,65,80,95])assert.equal(normalizeWeather(body(code),now).effect,'rain');
 for(const code of [71,73,75,77,85,86])assert.equal(normalizeWeather(body(code),now).effect,'snow');
 for(const code of [0,1,2,3,45,48])assert.equal(normalizeWeather(body(code),now).effect,'none');
 assert.equal(normalizeWeather(body(999),now),null);
 assert.equal(normalizeWeather(body(65),now+31*60_000),null);
 assert.equal(normalizeWeather(body(65),now-6*60_000),null);
 assert.equal(normalizeWeather({},now),null);
});
test('same-cell concurrent requests share a provider call, cache expires and outages return no effect',async()=>{
 let time=now,calls=0,fail=false;
 const query=createLocalWeather({clock:()=>time,fetcher:async url=>{calls++;assert.equal(url.hostname,'api.open-meteo.com');if(fail)throw Error('offline');return {ok:true,text:async()=>JSON.stringify(body(65))};}});
 const [a,b]=await Promise.all([query([-46.72,-23.61]),query([-46.72,-23.61])]);
 assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.effect,'rain');
 await query([-46.72,-23.61]);assert.equal(calls,1);
 time+=11*60_000;fail=true;
 assert.equal(await query([-46.72,-23.61]),null);assert.equal(calls,2);
 assert.equal(await query([-40,-20]),null);assert.equal(calls,2);
});
