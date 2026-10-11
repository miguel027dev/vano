'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const map=fs.readFileSync('static/vano-map.js','utf8');
const start=map.indexOf('function cameraVehicleTuning(){');
const end=map.indexOf('function resetCameraKinematics(){',start);
assert.ok(start>=0&&end>start,'Camera tuning function must exist');
const functionCode=map.slice(start,end);
function config(profile,android){
 const c={profile,document:{documentElement:{classList:{contains:x=>x==='vano-android-shell'&&android}}}};
 vm.createContext(c);vm.runInContext(functionCode,c);
 return c.cameraVehicleTuning();
}
for(const profile of ['motorcycle','driving']){
 for(const android of [true,false]){
  const tune=config(profile,android);
  const hardMax=profile==='motorcycle'?17.48:17.58;
  assert.ok(tune.zoomMax<=hardMax,`${profile} on ${android?'Android':'Web'} advertises zoom above hard clamp`);
  assert.ok(tune.zoomMin<tune.zoomMax);
 }
}
const base=fs.readFileSync('templates/base.html','utf8');
const html=fs.readFileSync('templates/index.html','utf8');
const sw=fs.readFileSync('static/vano-sw.js','utf8');
assert.ok(!fs.existsSync('static/vano-voice-companion.js'));
for(const token of ['vano-voice-companion.js','id="voiceSearchBtn"','id="soundBtn"','id="navVoicePopover"']){
  assert.ok(!html.includes(token) && !base.includes(token),token+' should not be rendered');
}
assert.ok(!sw.includes('vano-voice-companion.js'),'do not precache deleted assistant');
assert.ok(!sw.includes('/static/voices/vano/'),'do not precache unused speech audio');
console.log('PASS: camera clamps agree with per-vehicle tuning, removed voice UI and offline asset cache');
