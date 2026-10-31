import test from 'node:test';
import assert from 'node:assert/strict';
import {easeGpsPoint,predictFreeGpsVisual,routeTrace,smoothLiveRoadProgress,smoothLiveBearing} from './liveMotion.js';
import {buildRouteTimeline, distanceOnRoute} from './routeAnimation.js';
import {metersBetween} from './navigationMotion.js';
import {readFileSync} from 'node:fs';
const a=[-46.67,-23.58],b=[-46.669,-23.58],c=[-46.668,-23.58];
test('GPS marker eases real updates, never extrapolates while stationary',()=>{
  const mid=easeGpsPoint(a,b,16,{accuracy:6,speed:6});
  assert.ok(mid[0]>a[0]&&mid[0]<b[0]);
  assert.deepEqual(easeGpsPoint(mid,mid,16,{accuracy:8,speed:0}),mid);
  assert.deepEqual(easeGpsPoint(null,a,16),a);
  assert.deepEqual(easeGpsPoint(a,null,16),a);
});
test('long GPS relocations snap instead of crossing city blocks',()=>{
  assert.deepEqual(easeGpsPoint(a,[-46.65,-23.59],16,{accuracy:8}),[-46.65,-23.59]);
});
test('borderline GPS displacement eases instead of visibly jumping the vehicle',()=>{
  const nearby=[-46.66855,-23.58]; // about 150 m from a
  const eased=easeGpsPoint(a,nearby,16,{accuracy:12,speed:8});
  assert.ok(eased[0]>a[0]&&eased[0]<nearby[0]);
});
test('traveled line ends at actual progress along route geometry',()=>{
  const timeline=buildRouteTimeline({type:'LineString',coordinates:[a,b,c]});
  const meters=distanceOnRoute(timeline,b);
  const line=routeTrace(timeline,meters);
  assert.deepEqual(line[0],a);
  assert.ok(Math.abs(line.at(-1)[0]-b[0])<.000001);
  assert.equal(routeTrace(timeline,0).length,2);
});

test('real GPS progress eases sequential sensor updates without a frame-sized leap',()=>{
 let current=30;
 const target=47;
 const frames=[];
 for(let i=0;i<30;i++){
   const next=smoothLiveRoadProgress(current,target,16,{speed:10,accuracy:8});
   assert.ok(next>=current&&next<=target);
   frames.push(next-current);
   current=next;
 }
 assert.ok(frames[0]<1.5,'first frame must not jump to the new GPS reading');
 assert.ok(current>41,'marker must catch up without several seconds of lag');
 assert.ok(frames.every(x=>x<=1.6));
});

test('matched street interpolation remains independent of variable frame rate',()=>{
 const opts={speed:9,accuracy:9};
 let a=10,b=10;
 for(let i=0;i<60;i++)a=smoothLiveRoadProgress(a,29,16,opts);
 for(let i=0;i<30;i++)b=smoothLiveRoadProgress(b,29,32,opts);
 assert.ok(Math.abs(a-b)<1.1,'30fps and 60fps should produce similar travel');
});

test('stopped vehicle does not jitter backwards from small location changes',()=>{
 assert.equal(smoothLiveRoadProgress(40,38,16,{speed:0}),40);
 assert.equal(smoothLiveRoadProgress(40,38.3,16,{speed:1.4}),40);
 const resumed=smoothLiveRoadProgress(40,47,16,{speed:8});
 assert.ok(resumed>40&&resumed<41);
 assert.equal(smoothLiveRoadProgress(40,47,16,{speed:8,reducedMotion:true}),47);
 assert.equal(smoothLiveRoadProgress(null,47,16,{speed:8}),47);
 assert.equal(smoothLiveRoadProgress(40,NaN,16,{speed:8}),40);
});

test('live orientation turns smoothly through north without a sudden 360-degree spin',()=>{
 let heading=350;
 for(let i=0;i<15;i++){
   const next=smoothLiveBearing(heading,20,16,{speed:8});
   const angle=Math.abs(((next-heading+540)%360)-180);
   assert.ok(angle<=2.41);
   heading=next;
 }
 assert.ok(heading>350||heading<20,'heading should move through north');
 assert.equal(smoothLiveBearing(90,180,16,{speed:0}),90,'stop must preserve vehicle yaw');
 assert.equal(smoothLiveBearing(null,270,16,{speed:8}),270);
 assert.equal(smoothLiveBearing(90,180,16,{speed:8,reducedMotion:true}),180);
});

test('GPS camera and marker have one smoothed real-time path, without touching simulator',()=>{
 const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(src,/smoothLiveRoadProgress\(state\.roadMeters,desired,dt/);
 assert.match(src,/smoothLiveBearing\(state\.bearing,heading,dt/);
 assert.match(src,/roadMatch:visual\.current\.roadMatch\?\?null/);
 assert.match(src,/liveFollow\?\(motorcycle\?210:190\)/);
 assert.match(src,/point=sampleRoute\(timeline,state\.roadMeters\)\?\.point/);
});

test('free GPS puck continues visually for under a second while verified vehicle moves',()=>{
 const previous={position:[-46.67,-23.58],sourceAt:100000};
 const position=[-46.66990,-23.58];
 const options={sourceAt:101000,speed:10,accuracy:7,heading:90};
 const first=predictFreeGpsVisual(position,previous,{...options,now:101200});
 const next=predictFreeGpsVisual(position,previous,{...options,now:101600});
 const capped=predictFreeGpsVisual(position,previous,{...options,now:102600});
 assert.ok(first[0]>position[0]&&next[0]>first[0], 'marker moves between sensor callbacks');
 const longer=predictFreeGpsVisual(position,previous,{...options,now:109000});
 assert.deepEqual(longer,capped,'GPS outage must freeze the visual pointer at the capped position');
 assert.ok(metersBetween(position,next)<=7,'prediction is bounded to seven meters');
});
test('free GPS prediction refuses stationary, noisy, stale and contradictory fixes',()=>{
 const previous={position:[-46.67,-23.58],sourceAt:100000};
 const position=[-46.6699,-23.58];
 const opts={sourceAt:101000,now:101500,speed:10,accuracy:7,heading:90};
 for(const patch of [{speed:0},{accuracy:90},{heading:270},{sourceAt:null},
   {sourceAt:100000},{speed:65}]){
   assert.deepEqual(predictFreeGpsVisual(position,previous,{...opts,...patch}),position);
 }
});
test('live map writes the animated vehicle with sub-decimeter continuity',()=>{
 const source=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(source,/predictFreeGpsVisual\(target,state\.previousRawFix/);
 assert.match(source,/metersBetween\(state\.lastMarkerPoint,point\)>\.035/);
});
