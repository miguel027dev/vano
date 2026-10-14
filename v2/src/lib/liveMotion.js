/** Visual smoothing only. Never turns route geometry or extrapolation into GPS telemetry. */
import {blendPoint,metersBetween,validPoint} from './navigationMotion.js';

export function easeGpsPoint(previous,incoming,elapsedMs,{accuracy=10,speed=0,reducedMotion=false}={}){
  if(!validPoint(incoming))return validPoint(previous)?previous:null;
  if(!validPoint(previous))return incoming;
  const distance=metersBetween(previous,incoming);
  const uncertainty=Number.isFinite(accuracy)?Math.max(0,accuracy):10;
  // Large relocations must snap rather than animate through unrelated streets.
  // A rejected sensor spike must not still become a visible snap when it lands
  // close to the validation boundary. City-scale relocation still snaps rather
  // than drawing a vehicle through unrelated streets.
  if(distance>Math.max(220,uncertainty*5))return incoming;
  // Sub-meter GPS noise is not visible movement.
  if(distance<.35)return previous;
  const moving=Number.isFinite(speed)&&speed>1.5;
  const halfLife=reducedMotion?75:moving?175:290;
  const next=blendPoint(previous,incoming,elapsedMs,halfLife);
  return metersBetween(next,incoming)<.35?incoming:next;
}
export function routeTrace(timeline,meters){
  if(!timeline?.points?.length||!Number.isFinite(timeline.total)||timeline.total<1)return [];
  const distance=Math.max(0,Math.min(timeline.total,meters));
  const {points,cumulative}=timeline;
  let i=1;
  while(i<cumulative.length&&cumulative[i]<distance)i++;
  if(i>=points.length)return points.slice();
  const start=points[i-1],end=points[i],length=cumulative[i]-cumulative[i-1];
  const t=length>0?(distance-cumulative[i-1])/length:1;
  return [...points.slice(0,i),[start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t]];
}
