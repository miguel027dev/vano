import test from 'node:test';
import assert from 'node:assert/strict';
import {computeSafeViewport,markerIntersectsOverlay} from './safeViewport.js';

test('responsive safe viewport centers the GPS arrow between live search and address cards',()=>{
 for(const [width,height] of [[320,568],[360,640],[393,852],[430,932],[768,1024],[844,390]]){
  const overlays=[{edge:'top',top:22,bottom:height<500?92:154},
    {edge:'bottom',top:height-(height<500?62:90),bottom:height-12}];
  const v=computeSafeViewport({width,height,overlays,navigation:false});
  assert.ok(v.padding.top>=0&&v.padding.bottom>=0);
  assert.ok(v.padding.top+v.padding.bottom<height,'must leave usable map content '+width+'x'+height);
  assert.ok(v.centerY>v.padding.top&&v.centerY<height-v.padding.bottom);
  assert.ok(v.padding.left+v.padding.right<width);
  if(height>=568)assert.ok(v.centerY>154+24&&v.centerY<height-90-24,'arrow not under overlays');
 }
});
test('navigation dock grows dynamically without pinning marker behind the street capsule',()=>{
 const tall=computeSafeViewport({width:390,height:840,navigation:true,overlays:[
  {edge:'top',top:20,bottom:138},
  {edge:'bottom',top:545,bottom:605},
  {edge:'bottom',top:626,bottom:840},
 ]});
 assert.ok(tall.centerY<545-42);
 const noWarnings=computeSafeViewport({width:390,height:840,navigation:true,overlays:[
  {edge:'top',top:20,bottom:138},{edge:'bottom',top:695,bottom:754},
  {edge:'bottom',top:774,bottom:840},
 ]});
 assert.ok(tall.padding.bottom>noWarnings.padding.bottom);
});
test('extreme small landscape never produces invalid or negative camera padding',()=>{
 for(const height of [220,280,320,390]){
  const v=computeSafeViewport({width:568,height,navigation:true,overlays:[
   {edge:'top',top:0,bottom:height*.47},{edge:'bottom',top:height*.53,bottom:height}
  ]});
  assert.ok(Object.values(v.padding).every(p=>Number.isInteger(p)&&p>=0));
  assert.ok(v.padding.top+v.padding.bottom<height);
  assert.ok(v.centerY>0&&v.centerY<height);
  assert.equal(v.compact,true);
 }
});
test('collision detector accounts for rendered arrow footprint, not only GPS point',()=>{
 const banner={left:0,top:0,right:360,bottom:130};
 assert.equal(markerIntersectsOverlay([180,165],banner,82,10),true);
 assert.equal(markerIntersectsOverlay([180,230],banner,82,10),false);
 assert.equal(markerIntersectsOverlay([NaN,130],banner),false);
 assert.equal(markerIntersectsOverlay([180,120],null),false);
});

test('live camera clearance remains bounded on 320px handsets and landscape',()=>{
 for(const [w,h] of [[320,568],[360,640],[390,844],[568,280],[844,390],[1024,768]]){
  const v=computeSafeViewport({width:w,height:h,overlays:[
   {edge:'top',top:0,bottom:h<500?125:160},
   {edge:'bottom',top:h-(h<500?135:180),bottom:h}
  ],navigation:true});
  assert.ok(v.maxBehindPx>=0&&v.maxBehindPx<=v.visibleHeight/2);
  assert.equal(v.visibleHeight,Math.max(0,h-v.padding.top-v.padding.bottom));
 }
});
