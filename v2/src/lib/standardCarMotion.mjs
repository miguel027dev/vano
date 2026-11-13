/** Frame-rate-independent visual motion of the /mapa 3D car.
 * Never writes to GPS, navigation progress, camera pose, ETA or route state.
 * Follows route arclength, so the mesh never cuts diagonally across a turn.
 */
import {clamp,metersBetween,shortestAngle,validPoint} from './navigationMotion.js';
import {distanceOnRoute,sampleRoute} from './routeAnimation.js';
import {bearingAtDrivenProgress} from './liveRoadPuck.mjs';

export function smoothStandardCarDrive({
 previous=null,point,timeline,speed=0,dtMs=16,sourceAt,now=Date.now(),
 entryHeld=false,reducedMotion=false,bearing=0
}={}){
 if(!validPoint(point)||!Number.isFinite(timeline?.total)||timeline.total<=0)return null;
 const destination=distanceOnRoute(timeline,point);
 if(!Number.isFinite(destination))return null;
 const targetHeading=Number.isFinite(bearing)?((bearing%360)+360)%360:0;
 // First frame, route replacement, and deliberate street entry acquire in
 // place. Every subsequent frame has one continuous progression state.
 if(!previous||!Number.isFinite(previous.meters)||!validPoint(previous.point)||
     previous.timeline!==timeline.points){
  return {point,meters:destination,bearing:targetHeading,timeline:timeline.points};
 }
 const dt=clamp(Number.isFinite(dtMs)?dtMs:16,0,100);
 if(dt===0)return previous;
 if(reducedMotion)return {point,meters:destination,bearing:targetHeading,timeline:timeline.points};
 const velocity=Number.isFinite(speed)?clamp(speed,0,45):0;
 const age=Number.isFinite(sourceAt)?now-sourceAt:Infinity;
 const fixFresh=age>=-1500&&age<=1900;
 const forward=destination-previous.meters;
 // Real GPS re-localizations/new route geometry should not drag the car
 // through multiple unrelated blocks at visible animation speed.
 if(Math.abs(forward)>145)return {point,meters:destination,bearing:targetHeading,timeline:timeline.points};
 let meters=previous.meters;
 if(entryHeld){
  // Keep the car locked to the actual first street point while indoors.
  meters=destination;
 }else if(velocity<1.2||!fixFresh){
  // At a traffic light or on loss of signal do not creep forward or drift
  // backwards due to multipath. Genuine repositioning is handled above.
  if(Math.abs(forward)>3.5&&fixFresh&&velocity<1.2)
    meters+=Math.sign(forward)*Math.min(Math.abs(forward),dt/1000*1.3);
 }else if(forward>0.13){
  // Smooth speed-aware catch-up: at 50 km/h (~13.9 m/s) displacement is
  // around 0.23 m per 60 Hz frame. The extra headroom absorbs 1 Hz fixes.
  const vmax=Math.max(3,velocity*1.38+1.8);
  const spring=1-Math.pow(.5,dt/(velocity>=8?165:220));
  const step=Math.min(forward,Math.max(velocity*.63*dt/1000,forward*spring),
    vmax*dt/1000);
  meters+=step;
 }else if(forward< -2.8){
  // A substantial verified correction is eased in reverse, not snapped.
  meters-=Math.min(-forward,Math.max(1.1,velocity*.35)*dt/1000);
 }
 meters=clamp(meters,0,timeline.total);
 const sample=sampleRoute(timeline,meters);
 const visualPoint=sample?.point||point;
 const roadHeading=bearingAtDrivenProgress(timeline,meters);
 const desiredHeading=Number.isFinite(roadHeading)&&!entryHeld?roadHeading:targetHeading;
 const difference=shortestAngle(previous.bearing??desiredHeading,desiredHeading);
 const turnLimit=(velocity>=2?170:90)*dt/1000;
 const turned=Math.sign(difference)*Math.min(Math.abs(difference),turnLimit);
 const nextBearing=(((previous.bearing??desiredHeading)+turned)%360+360)%360;
 return {point:visualPoint,meters,bearing:nextBearing,timeline:timeline.points};
}
