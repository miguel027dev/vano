/** Visual road matching for verified, live motor navigation only.
 * Never exports a new sensor fix and never modifies routing or maneuver telemetry.
 * If an intersection, parallel road or weak GPS makes the centerline ambiguous,
 * keep the real observed coordinate instead of inventing a street position.
 */
import {bearingBetween,clamp,metersBetween,nearestOnRoute,shortestAngle,validPoint} from './navigationMotion.js';

export function matchLiveRoadPosition({position,route,accuracy,speed,heading,previous=null,vehicle='carro',navigation=false,simulation=false,timeline=null}={}){
  if(!navigation||simulation||!['carro','moto'].includes(vehicle)||!validPoint(position)||
      !route?.geometry?.coordinates?.length||!Array.isArray(timeline?.cumulative)||
      !Number.isFinite(accuracy)||accuracy<0||accuracy>32)return null;
  const points=route.geometry.coordinates;
  if(points.length<2)return null;
  const nearest=nearestOnRoute(position,route.geometry);
  const limit=clamp(accuracy*.8+4,7,18);
  if(!validPoint(nearest.point)||!Number.isFinite(nearest.distance)||nearest.distance>limit)return null;
  const segment=nearest.index,a=points[segment],b=points[segment+1];
  if(!validPoint(a)||!validPoint(b)||metersBetween(a,b)<.65)return null;
  const bearing=bearingBetween(a,b);
  const moving=Number.isFinite(speed)&&speed>=2;
  if(moving&&Number.isFinite(heading)&&heading>=0&&heading<=360&&
      Math.abs(shortestAngle(bearing,heading))>68)return null;
  const meters=clamp((timeline.cumulative[segment]||0)+metersBetween(a,nearest.point),0,timeline.total);
  if(previous&&Number.isFinite(previous.meters)&&validPoint(previous.raw)){
    const rawMove=metersBetween(previous.raw,position);
    // If the nearest segment jumped to another pass of a loop, do not
    // teleport the pointer along an unrelated street or past a junction.
    if(Math.abs(meters-previous.meters)>Math.max(35,rawMove*2+20+accuracy*2))return null;
    // Do not creep several meters forward/back at traffic lights.
    if((!Number.isFinite(speed)||speed<.8)&&
      rawMove<=Math.max(2,Math.min(7,accuracy*.45)))
      return previous;
  }
  return {point:nearest.point,meters,bearing,segment,raw:position};
}

/** Local road direction at the ALREADY reached segment, never an upcoming turn. */
export function bearingAtDrivenProgress(timeline,meters){
  const points=timeline?.points,cumulative=timeline?.cumulative;
  if(!Array.isArray(points)||points.length<2||!Number.isFinite(meters))return null;
  let lo=1,hi=cumulative.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<meters)lo=mid+1;else hi=mid;}
  for(let i=Math.max(1,lo);i<points.length;i++){
    if(metersBetween(points[i-1],points[i])>.65)return bearingBetween(points[i-1],points[i]);
  }
  return null;
}
