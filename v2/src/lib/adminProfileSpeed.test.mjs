import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {smoothGpsSpeedSample,gpsSpeedKmh} from './mapSpeed.js';
import {isAdminAccount} from '../../server/admin.mjs';

const profile=readFileSync(new URL('../pages/ProfilePage.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');
const mk=(kmh,sourceAt)=>({kmh,sourceAt});
const at=200000;
const gps=(sourceAt,speed,prev=null,accuracy=9)=>
  smoothGpsSpeedSample(prev,speed,{sourceAt,accuracy,now:sourceAt+25});

test('profile entry requires server-authorized verified admin, not local email text',()=>{
 assert.match(profile,/user\?\.isAdmin===true&&<Action icon=\{LockKeyhole\} title="Admin" subtitle="Painel de administração" to="\/admin"\/>/);
 assert.doesNotMatch(profile,/user\?\.email\s*===\s*['"]miguelpinxs@gmail.com/);
 assert.match(server,/isAdmin:isAdminAccount\(u\)/);
 assert.match(server,/if\(!isAdminAccount\(session\.user\)\)return err\(res,403/);
 assert.equal(isAdminAccount({email:'miguelpinxs@gmail.com',verificationMethod:'google',verifiedAt:at}),true);
 assert.equal(isAdminAccount({email:'miguelpinxs@gmail.com',verificationMethod:'google',verifiedAt:null}),false);
 assert.equal(isAdminAccount({email:'other@example.com',verificationMethod:'google',verifiedAt:at}),false);
});

test('speed display renders only with navigation, never in location browsing',()=>{
 assert.match(page,/<div className="map-controls">/);
 assert.doesNotMatch(page,/<div className="map-controls">\{!navMode&&speedometer\}/);
 const row=page.indexOf('{navMode&&<div className="v36-nav-road-row"');
 assert.ok(row>0);
 assert.ok(page.slice(row,row+280).includes('{speedometer}'));
 assert.match(page,/const speedKmh=navMode&&hasLiveGPS&&speedSample/);
 assert.match(page,/Date\.now\(\)-speedSample\.sourceAt<18000/);
 assert.match(page,/speedKmh===null\?'—':speedKmh/);
});

test('smoothing only uses accepted GPS speed samples and never invents speed from location',()=>{
 const first=gps(at,10);
 assert.deepEqual(first,mk(36,at));
 const second=gps(at+1000,12,first);
 assert.ok(second.kmh>36&&second.kmh<43,'a one-second read changes progressively');
 assert.equal(second.sourceAt,at+1000);
 assert.deepEqual(gps(at+1500,0,second),mk(0,at+1500),'sensor-reported zero is immediate');
 assert.deepEqual(gps(at+8000,20,second),mk(72,at+8000),'a long gap resets to fresh reading');
 assert.deepEqual(gps(at+1000,60,second),second,'duplicate timestamp cannot rewrite the speed');
 const unavailable=gps(at+2100,null,second);
 assert.equal(unavailable,null,'a missing speed invalidates the display');
 assert.equal(gps(at+2200,NaN,second),null);
 assert.equal(gps(at+2500,10,second,150),null);
 assert.equal(smoothGpsSpeedSample(second,10,{sourceAt:at+2600,accuracy:9,now:at+25000}),null,'stale samples cannot survive');
 assert.equal(gpsSpeedKmh(null,{fresh:true,accuracy:9}),null);
});

test('GPS expiration runs once per sensor update and cancels on trip stop',()=>{
 assert.match(page,/speedExpiryTimer\.current=setTimeout\(\(\)=>\{/);
 assert.match(page,/18000-\(Date\.now\(\)-next\.sourceAt\)/);
 assert.match(page,/if\(!navMode\)\{speedSampleRef\.current=null;setSpeedSample\(null\);\}/);
 assert.match(page,/clearTimeout\(speedExpiryTimer\.current\)/);
 assert.doesNotMatch(page,/setInterval\(\(\)=>setSpeedSample/);
});

test('original current-location card and its positioning remain untouched',()=>{
 assert.match(page,/className="v31-location-card"/);
 assert.match(css,/\.map-page \.v31-location-card\{/);
 assert.match(css,/bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 11px\)/);
});
