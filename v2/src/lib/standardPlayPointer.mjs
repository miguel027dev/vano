/** Private 6x V2 Play marker movement. Unlike live GPS smoothing, the
 * simulated marker follows exact route arc length, so it cannot cut corners.
 * Read-only presentation: never feeds routing, user location or journey logs.
 */
import {sampleRoute} from './routeAnimation.js';
import {simulationPointerBearing} from './adminRouteSimulator.mjs';
import {maneuverCategory} from './navigationCameraPlanner.js';
import {bearingBetween,clamp,damp,shortestAngle} from './navigationMotion.js';

/** Closest true route bend, not an arbitrary map point or a guessed turn.
 * Only vertices with a meaningful bearing change qualify.
 */
function isNearPhysicalCorner(timeline,meters){
  const c=timeline?.cumulative,p=timeline?.points;
  if(!Array.isArray(c)||!Array.isArray(p)||p.length<3)return false;
  let lo=1,hi=c.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(c[mid]<meters)lo=mid+1;else hi=mid;}
  for(const vertex of [lo-1,lo]){
    if(vertex<=0||vertex>=p.length-1||meters<c[vertex]-22||meters>c[vertex]+28)continue;
    const incoming=bearingBetween(p[vertex-1],p[vertex]);
    const outgoing=bearingBetween(p[vertex],p[vertex+1]);
    if(Math.abs(shortestAngle(incoming,outgoing))>=28)return true;
  }
  return false;
}
export function planStandardPlayPointer({
  timeline=null,targetMeters=null,previousMeters=null,dtMs=16,
  maneuver=null,route=null,reducedMotion=false
}={}){
  const total=timeline?.total;
  if(!Number.isFinite(total)||total<=0||!Number.isFinite(targetMeters))return null;
  const target=clamp(targetMeters,0,total);
  const step=Number.isInteger(maneuver?.stepIndex)?route?.steps?.[maneuver.stepIndex]:null;
  const category=maneuverCategory({
    ...step,kind:maneuver?.kind||step?.type,modifier:maneuver?.modifier||step?.modifier
  });
  const distance=Number.isFinite(maneuver?.distance)?maneuver.distance:Infinity;
  const entrance=(['ramp','junction','turn','uturn'].includes(category)&&
    distance>=0&&distance<=140)||isNearPhysicalCorner(timeline,target);
  // The marker must catch up rapidly at an intersection, without jumping ahead
  // of the sampled route progress. Reverse/rewind is an intentional reset.
  const reset=!Number.isFinite(previousMeters)||previousMeters<0||
    previousMeters>total||target+2<previousMeters;
  const halfLife=entrance?32:65;
  const progress=reset||reducedMotion?target:
    Math.min(target,damp(previousMeters,target,clamp(dtMs,0,100),halfLife));
  const frame=sampleRoute(timeline,progress);
  if(!frame)return null;
  const heading=simulationPointerBearing(timeline,progress);
  return {
    progress,point:frame.point,bearing:heading,entrance,
    bearingHalfLifeMs:entrance?65:120
  };
}
