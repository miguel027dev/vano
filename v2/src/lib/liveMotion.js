/** Visual smoothing only. Never turns route geometry or extrapolation into GPS telemetry. */
import {bearingBetween,blendPoint,metersBetween,shortestAngle,validPoint} from './navigationMotion.js';

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
  // Make the arrow catch up to genuine fresh fixes quickly. Hold slow/stopped
  // positions steady instead of chasing sub-meter GPS multipath.
  const halfLife=reducedMotion?60:moving?(speed>=8?185:235):260;
  const next=blendPoint(previous,incoming,elapsedMs,halfLife);
  return metersBetween(next,incoming)<.35?incoming:next;
}

/** Visual-only continuation between two trustworthy GPS observations.
 * It never modifies the GPS fix, route progress, navigation, or maneuver state.
 * Stop after 850ms instead of continuing across a gap in sensor updates.
 */
export function predictFreeGpsVisual(position,previousFix,{sourceAt,now=Date.now(),speed,accuracy,heading}={}){
  if(!validPoint(position)||!validPoint(previousFix?.position))return position;
  if(!Number.isFinite(sourceAt)||!Number.isFinite(previousFix.sourceAt)||
      !Number.isFinite(now)||!Number.isFinite(speed)||speed<1.2||speed>38||
      !Number.isFinite(accuracy)||accuracy<0||accuracy>25)return position;
  const sampleSeconds=(sourceAt-previousFix.sourceAt)/1000;
  const age=now-sourceAt;
  if(sampleSeconds<.35||sampleSeconds>3||age<80)return position;
  const travelled=metersBetween(previousFix.position,position);
  const measuredSpeed=travelled/sampleSeconds;
  if(travelled<1.5||measuredSpeed<.75||measuredSpeed>Math.min(45,speed*2+6))return position;
  const travelHeading=bearingBetween(previousFix.position,position);
  if(Number.isFinite(heading)&&heading>=0&&heading<=360&&
      Math.abs(shortestAngle(travelHeading,heading))>40)return position;
  const ahead=Math.min(7,speed*.85,measuredSpeed*.85,
    Math.min(.85,age/1000)*Math.min(speed,measuredSpeed));
  if(ahead<=.03)return position;
  const alpha=ahead/travelled;
  return [position[0]+(position[0]-previousFix.position[0])*alpha,
          position[1]+(position[1]-previousFix.position[1])*alpha];
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

/**
 * Frame-rate independent visual filtering for REAL GPS matched to an observed route.
 * Speeds and raw fixes never come from this interpolation.
 */
export function smoothLiveRoadProgress(previous,desired,elapsedMs,{speed=0,accuracy=10,reducedMotion=false}={}){
  if(!Number.isFinite(desired))return Number.isFinite(previous)?previous:null;
  if(!Number.isFinite(previous)||reducedMotion)return desired;
  const delta=desired-previous;
  if(Math.abs(delta)<.08)return previous;
  // A real relocation/new road must not crawl along hundreds of metres of route.
  if(Math.abs(delta)>170)return desired;
  const moving=Number.isFinite(speed)&&speed>=2;
  // Keep small backward multipath corrections from making the car jitter in reverse.
  if(moving&&delta<0&&delta> -2.5)return previous;
  if(!moving&&Math.abs(delta)<2.8)return previous;
  const dt=Math.max(0,Math.min(90,elapsedMs));
  if(dt===0)return previous;
  const halfLife=moving?(speed>=8?170:220):310;
  const eased=Math.abs(delta)*(1-Math.pow(.5,dt/halfLife));
  // Bound catch-up after a sensor batch: no single frame travels an arbitrary
  // number of street metres, but real driving remains responsive.
  const maxStep=moving?Math.max(.45,dt/1000*(Math.max(2,speed)*2.6+7)):
    Math.max(.16,dt/1000*6);
  const step=Math.min(Math.abs(delta),eased,maxStep);
  return previous+Math.sign(delta)*step;
}

export function smoothLiveBearing(previous,desired,elapsedMs,{speed=0,reducedMotion=false}={}){
  if(!Number.isFinite(desired))return Number.isFinite(previous)?previous:null;
  if(!Number.isFinite(previous)||reducedMotion)return (desired+360)%360;
  if(!Number.isFinite(speed)||speed<2)return previous;
  const delta=((desired-previous+540)%360)-180;
  const dt=Math.max(0,Math.min(90,elapsedMs));
  if(dt===0||Math.abs(delta)<.1)return previous;
  const eased=Math.abs(delta)*(1-Math.pow(.5,dt/210));
  // Do not whip the orientation across 90° on a noisy sensor sample.
  const maxTurn=150*dt/1000;
  return (previous+Math.sign(delta)*Math.min(eased,maxTurn)+360)%360;
}
