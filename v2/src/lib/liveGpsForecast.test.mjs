import test from 'node:test';
import assert from 'node:assert/strict';
import {anticipateRoadProgress} from './liveGpsForecast.mjs';
import {buildRouteTimeline} from './routeAnimation.js';

const east=(m)=>m/(111320*Math.cos(-23.58*Math.PI/180));
const north=m=>m/111320;
const start=[-46.7,-23.58];
const corner=[start[0]+east(100),start[1]];
const finish=[corner[0],corner[1]+north(90)];
const timeline=buildRouteTimeline({type:'LineString',coordinates:[start,corner,finish]});
const sample={timeline,sourceAt:100000,now:100680,speed:12,accuracy:8,heading:90};

test('moving live pointer advances smoothly but never beyond ten metres',()=>{
  const future=anticipateRoadProgress({...sample,meters:40});
  assert.ok(future>40&&future<49);
  assert.ok(anticipateRoadProgress({...sample,meters:40,now:103000})<=53);
});
test('visual motion cannot anticipate a turning intersection',()=>{
  const near=anticipateRoadProgress({...sample,meters:97});
  assert.ok(near>=97&&near<100);
});
test('lost accuracy, bad bearing, stationary driving and missing sensor time cannot predict',()=>{
  for(const patch of [{speed:0},{accuracy:75},{heading:0},{sourceAt:null},
      {now:99999},{speed:80}]){
    assert.equal(anticipateRoadProgress({...sample,meters:40,...patch}),40);
  }
});
test('visual prediction never supplies route progress when no route geometry exists',()=>{
  assert.equal(anticipateRoadProgress({...sample,meters:40,timeline:null}),40);
});

test('sensor cadence near one hertz no longer freezes car before next real callback',()=>{
 const progresses=[100180,100480,100780,101080].map(now=>
   anticipateRoadProgress({...sample,meters:40,now}));
 assert.ok(progresses.every((x,i)=>i===0||x>progresses[i-1]),
   'the displayed pointer should progress at 180/480/780/1080 ms');
 assert.ok(progresses.at(-1)>50,'progress should continue past former .8 second cutoff');
 const capped=anticipateRoadProgress({...sample,meters:40,now:102000});
 assert.ok(capped<=53&&capped>=52);
 assert.equal(anticipateRoadProgress({...sample,meters:40,now:109000}),capped,
   'signal outage must hold at a strict cap rather than roaming without GPS');
});
