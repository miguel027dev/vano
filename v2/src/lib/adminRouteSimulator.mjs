/** Administrator-only route playback. Never pass these samples to browser GPS,
 * trip history, incident submissions, cached real location or provider APIs. */
import {buildRouteTimeline,sampleRoute,nextManeuver} from './routeAnimation.js';
import {bearingBetween,shortestAngle,clamp} from './navigationMotion.js';

/** Heading of the ACTUAL route segment under the simulated user pointer.
 * Unlike sampleRoute's forward-looking guidance bearing, this never anticipates
 * a corner. After crossing a vertex, it blends the new direction over a small
 * physical distance, keeping sharp entrances smooth without rotating early.
 * V2 simulation pointers share this physical heading; never turn before the vertex. */
export function simulationPointerBearing(timeline,distance){
  const points=timeline?.points,cumulative=timeline?.cumulative;
  if(!Array.isArray(points)||points.length<2||
    !Array.isArray(cumulative)||cumulative.length!==points.length)return null;
  const total=Number.isFinite(timeline.total)?timeline.total:0;
  const at=clamp(Number.isFinite(distance)?distance:0,0,total);
  let lo=1,hi=points.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(cumulative[mid]<at)lo=mid+1;
    else hi=mid;
  }
  const end=lo,start=end-1;
  const current=bearingBetween(points[start],points[end]);
  if(start===0)return current;
  const incoming=bearingBetween(points[start-1],points[start]);
  const span=cumulative[end]-cumulative[start];
  const sinceCorner=Math.max(0,at-cumulative[start]);
  if(span<.1)return incoming;
  // Faster transitions for narrow/diagonal branches. No steering before the
  // marker crosses the vertex; never let this heading alter GPS coordinates.
  const blendDistance=Math.min(9,Math.max(2,span*.65));
  const t=clamp(sinceCorner/blendDistance,0,1);
  const eased=t*t*(3-2*t);
  return (incoming+shortestAngle(incoming,current)*eased+360)%360;
}

// Keep Play review readable through turns; V2 SIM drone keeps its independent 2.5x rate.
export const SIMULATION_PLAYBACK_RATE=4;
export function simulationSpeedKmh(vehicle='carro'){
  return vehicle==='a-pe'?5:vehicle==='moto'?34:42;
}
export function simulationDistanceStep(distance,elapsedSeconds,total,vehicle='carro',rate=SIMULATION_PLAYBACK_RATE){
  const start=Number.isFinite(distance)?distance:0;
  const length=Number.isFinite(total)?Math.max(0,total):0;
  const seconds=Number.isFinite(elapsedSeconds)?Math.min(.5,Math.max(0,elapsedSeconds)):0;
  const playback=Number.isFinite(rate)?Math.min(12,Math.max(1,rate)):SIMULATION_PLAYBACK_RATE;
  return Math.min(length,Math.max(0,start)+simulationSpeedKmh(vehicle)/3.6*seconds*playback);
}
export function simulationFrame(route,distance){
  const timeline=buildRouteTimeline(route?.geometry);
  if(timeline.points.length<2||timeline.total<5)return null;
  const frame=sampleRoute(timeline,distance);
  if(!frame)return null;
  const maneuver=nextManeuver(route,timeline,frame.progress);
  return {
    ...frame,
    pointerBearing:simulationPointerBearing(timeline,frame.progress),
    guidance:{...maneuver,progress:frame.fraction,routeMeters:frame.progress,
      preview:true,simulated:true,finished:frame.remaining<=1},
    finished:frame.remaining<=1,
  };
}
