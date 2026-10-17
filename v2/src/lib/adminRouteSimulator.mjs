/** Administrator-only route playback. Never pass these samples to browser GPS,
 * trip history, incident submissions, cached real location or provider APIs. */
import {buildRouteTimeline,sampleRoute,nextManeuver} from './routeAnimation.js';

export const SIMULATION_PLAYBACK_RATE=6;
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
    guidance:{...maneuver,progress:frame.fraction,routeMeters:frame.progress,
      preview:true,simulated:true,finished:frame.remaining<=1},
    finished:frame.remaining<=1,
  };
}
