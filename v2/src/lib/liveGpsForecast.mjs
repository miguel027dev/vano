/** Bounded, visual-only motion between verified browser GPS fixes.
 * Never updates GPS telemetry, rerouting, speed, or maneuver state.
 * Predict along the already confirmed straight segment only; stop before bends.
 */
import {bearingBetween,clamp,shortestAngle,validPoint} from './navigationMotion.js';

export function anticipateRoadProgress({
  timeline,meters,sourceAt,now=Date.now(),speed,accuracy,heading
}={}){
  if(!Number.isFinite(meters)||!Number.isFinite(sourceAt)||sourceAt<=0||
      !Number.isFinite(now)||!Number.isFinite(speed)||speed<2||speed>45||
      !Number.isFinite(accuracy)||accuracy>30||accuracy<0||
      !Number.isFinite(heading)||heading<0||heading>360||
      !Array.isArray(timeline?.points)||!Array.isArray(timeline?.cumulative)||
      timeline.points.length<2||timeline.cumulative.length!==timeline.points.length||
      !Number.isFinite(timeline.total)||timeline.total<=0)return meters;
  const age=now-sourceAt;
  if(age<80)return meters;
  // Cap the display offset to a fraction of a second and 10 metres.
  // A GPS outage must never turn into an indefinitely moving pointer.
  const advance=Math.min(10,speed*clamp((age-80)/1000,0,.8));
  if(advance<=0)return meters;
  const cumulative=timeline.cumulative,points=timeline.points;
  let segment=1;
  while(segment<cumulative.length-1&&cumulative[segment]<meters)segment++;
  if(!validPoint(points[segment-1])||!validPoint(points[segment]))return meters;
  const segmentHeading=bearingBetween(points[segment-1],points[segment]);
  if(Math.abs(shortestAngle(segmentHeading,heading))>30)return meters;
  let limit=timeline.total;
  for(let i=segment;i<points.length-1&&cumulative[i]<=meters+advance+4;i++){
    if(!validPoint(points[i+1]))break;
    const outgoing=bearingBetween(points[i],points[i+1]);
    if(Math.abs(shortestAngle(bearingBetween(points[i-1],points[i]),outgoing))>25){
      limit=Math.max(meters,cumulative[i]-3);
      break;
    }
  }
  return clamp(Math.min(meters+advance,limit),meters,timeline.total);
}
