/** Private 6x V2 Play marker movement. Unlike live GPS smoothing, the
 * simulated marker follows exact route arc length, so it cannot cut corners.
 * Read-only presentation: never feeds routing, user location or journey logs.
 */
import {sampleRoute} from './routeAnimation.js';
import {simulationPointerBearing} from './adminRouteSimulator.mjs';
import {maneuverCategory} from './navigationCameraPlanner.js';
import {clamp,damp} from './navigationMotion.js';

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
  const entrance=['ramp','junction','turn','uturn'].includes(category)&&
    distance>=0&&distance<=140;
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
