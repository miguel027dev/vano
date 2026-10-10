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
const voice=fs.readFileSync('static/vano-voice-companion.js','utf8');
assert.ok(voice.includes('const navigationObserver=new MutationObserver('));
assert.ok(voice.includes("document.body.classList.contains('body-nav')"));
assert.ok(voice.includes("toggle(false,false)"));
assert.ok(voice.includes('speechController?.abort()'));
assert.ok(voice.includes('if(controller.signal.aborted||panel.hidden||speechController!==controller)return'));
const sw=fs.readFileSync('static/vano-sw.js','utf8');
assert.ok(sw.includes("'/static/vano-voice-companion.js'"));
assert.ok(sw.includes('vano-voice-companion\\.js'), 'Voice script needs a version-aware offline cache strategy');
console.log('PASS: camera clamps agree with per-vehicle tuning, voice lifecycle and offline asset cache');
