/** Private V2-only visual route rehearsal. Never produce sensor data or persist a journey.
 * A closed, deterministic timeline drives the existing map camera and maneuver UI.
 */
import {buildRouteTimeline,sampleRoute,distanceOnRoute,previewMetersPerSecond} from './routeAnimation.js';
import {clamp,validPoint} from './navigationMotion.js';

export function createRouteSimulation(route,vehicle='carro'){
 const timeline=buildRouteTimeline(route?.geometry);
 if(timeline.points.length<2||!Number.isFinite(timeline.total)||timeline.total<2)return null;
 const perSecond=previewMetersPerSecond(timeline.total,route?.duration);
 if(!Number.isFinite(perSecond)||perSecond<=0)return null;
 const totalMs=1000*timeline.total/perSecond;
 const speedKmh=vehicle==='a-pe'?5:vehicle==='moto'?48:42;
 const metersPerSecond=speedKmh/3.6;
 // Pre-index maneuver geometry once, not on each simulated camera frame.
 const steps=Array.isArray(route?.steps)?route.steps:[];
 const indexed=steps.map((step,index)=>step&&validPoint(step.location)
  ? {...step,at:distanceOnRoute(timeline,step.location),originalIndex:index}:null)
  .filter(Boolean).sort((a,b)=>a.at-b.at);
 const fallback=steps.find(step=>typeof step?.instruction==='string'&&step.instruction.trim());
 return {
  durationMs:totalMs,totalMeters:timeline.total,speedKmh,
  sample(elapsedMs){
   const elapsed=clamp(Number.isFinite(elapsedMs)?elapsedMs:0,0,totalMs);
   const motion=sampleRoute(timeline,elapsed/1000*perSecond);
   if(!motion)return null;
   let step=indexed.find(s=>s.at>=motion.progress+10);
   if(!step)step=indexed.at(-1);
   const guidance=step?{
    instruction:step.instruction||'Continue pela rota',
    distance:Math.max(0,step.at-motion.progress),
    modifier:step.modifier||'straight',
    lanes:Array.isArray(step.lanes)?step.lanes.slice(0,8):[],
    street:step.street||'',kind:step.type||'',stepIndex:step.originalIndex
   }:{
    instruction:fallback?.instruction||'Continue pela rota',
    distance:null,modifier:'straight',kind:'continue',street:'',lanes:[],stepIndex:0
   };
   return {
    point:motion.point,
    telemetry:{speed:metersPerSecond,heading:motion.bearing,accuracy:5},
    speedKmh,
    guidance:{...guidance,progress:motion.fraction,routeMeters:motion.progress,
      preview:true,finished:motion.fraction>=1},
    done:motion.fraction>=1
   };
  }
 };
}
