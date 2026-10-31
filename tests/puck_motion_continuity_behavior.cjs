const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const main=fs.readFileSync('static/vano-map.js','utf8');
const fallback=fs.readFileSync('static/vano-map-fallback.js','utf8');
const hav=(a,b)=>{
  const r=6371000,p1=a[1]*Math.PI/180,p2=b[1]*Math.PI/180;
  const dp=(b[1]-a[1])*Math.PI/180,dl=(b[0]-a[0])*Math.PI/180;
  return 2*r*Math.asin(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2));
};
const first={lat:-23.55,lon:-46.63,accuracy:6,speed:9};
const second={lat:-23.55,lon:-46.6299,accuracy:6,speed:9};
function verifyHelpers(source,start,end,update,predict){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,'motion functions exist and preserve testable boundaries');
  const ctx={hav,document:{visibilityState:'visible'},activeNav:null,selectedRoute:null,routeTotalGeometry:1,routePointAtDistance:()=>null};
  vm.createContext(ctx);
  vm.runInContext(`
    let puckFreeVelocity=null,puckTargetUpdatedAt=0,puckTargetPos=null;
    ${source.slice(a,b)}
    globalThis.testMotion={
      update:(a,b,dt)=>${update}(a,b,dt),
      target:(p,ms)=>{
        puckTargetUpdatedAt=0;
        ${predict==='predictedFallbackPuckTarget'?"puckTargetPos=p;":""}
        return ${predict}(${predict==='predictedFallbackPuckTarget'?'ms':'p,ms'});
      },
      velocity:()=>puckFreeVelocity
    };`,ctx);
  const t=ctx.testMotion;
  t.update(first,second,1000);
  assert.ok(t.velocity()?.lon>0,'good moving fix gives forward velocity');
  const a1=t.target(second,600),a2=t.target(second,2400);
  assert.ok(a1.lon>second.lon,'marker moves between GPS fixes');
  assert.ok(a2.lon>a1.lon&&a2.lon-second.lon<.0001,'extrapolation stops at 0.8 seconds');
  t.update(second,{...second,lat:second.lat-.000002,speed:0},1000);
  assert.equal(t.velocity(),null,'stopped car does not drift on prediction');
  t.update(second,{...second,lon:second.lon+.0001,accuracy:95,speed:9},1000);
  assert.equal(t.velocity(),null,'weak GPS does not extrapolate');
  t.update(second,{...second,lon:second.lon+.005,accuracy:5,speed:9},1000);
  assert.equal(t.velocity(),null,'implausible GPS jump is not extrapolated');
}
verifyHelpers(main,'function updatePuckFreeVelocity(','function predictedPuckTarget(', 'updatePuckFreeVelocity','predictedFreePuckTarget');
verifyHelpers(fallback,'function updateFallbackPuckVelocity(','function stopPuckAnimation(', 'updateFallbackPuckVelocity','predictedFallbackPuckTarget');
assert.match(main,/if\(!navOn\)\{if\(next\?\._routeSnapped===false\)resetPuckMotionModel\(\);return false\}/,'an off-route fix releases the route animation');
assert.match(main,/puckRouteTargetSpeed>\.65\)puckFrame=requestAnimationFrame\(puckAnimationTick\)/,'first valid route fix starts animation');
assert.match(main,/puckFreeVelocity\?\(performanceTier===/,'free-map marker uses elapsed-time smoothing');
assert.match(fallback,/puckMotionLastTs\?Math\.max/,'fallback uses elapsed-time smoothing');
console.log('PASS: main and fallback GPS puck continuity, stationary, accuracy, and route release.');
