/** Conservative visual-only road matching for live driving.
 * The match is NOT a new GPS fix and must never drive routing, ETA or maneuvers.
 * Keep the previous verified route leg at junctions and at traffic lights.
 */
import {bearingBetween,clamp,metersBetween,shortestAngle,validPoint} from './navigationMotion.js';

function roadCandidates(position,points,timeline){
  const candidates=[];
  const scale=Math.max(.01,Math.cos(position[1]*Math.PI/180));
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    if(!validPoint(a)||!validPoint(b))continue;
    const length=metersBetween(a,b);
    if(!Number.isFinite(length)||length<.65)continue;
    const dx=(b[0]-a[0])*scale,dy=b[1]-a[1],den=dx*dx+dy*dy;
    const t=den?clamp(((position[0]-a[0])*scale*dx+(position[1]-a[1])*dy)/den,0,1):0;
    const point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    const distance=metersBetween(position,point);
    candidates.push({point,distance,segment:i,
      meters:clamp((timeline.cumulative[i]||0)+length*t,0,timeline.total),
      bearing:bearingBetween(a,b)});
  }
  return candidates;
}

export function matchLiveRoadPosition({position,route,accuracy,speed,heading,previous=null,
 vehicle='carro',navigation=false,simulation=false,timeline=null}={}){
  if(!navigation||simulation||!['carro','moto'].includes(vehicle)||!validPoint(position)||
      !Array.isArray(route?.geometry?.coordinates)||!Array.isArray(timeline?.cumulative)||
      !Number.isFinite(timeline?.total)||timeline.total<=0||
      !Number.isFinite(accuracy)||accuracy<0||accuracy>75)return null;
  const points=route.geometry.coordinates;
  if(points.length<2||timeline.cumulative.length!==points.length)return null;
  const stopped=speed==null||(Number.isFinite(speed)&&speed>=0&&speed<2);
  const anchor=previous?.anchorRaw||previous?.raw;
  // Maintain a fixed anchor during a stop, rather than replacing it with every
  // noisy sample (which would let the marker slowly walk into a side street).
  if(stopped&&previous&&validPoint(previous.point)&&validPoint(anchor)&&
      Number.isFinite(previous.meters)&&
      metersBetween(position,anchor)<=clamp(accuracy*1.7+10,18,42)&&
      metersBetween(position,previous.point)<=clamp(accuracy*2+12,20,55)){
    return previous;
  }
  // Acquired accuracy too poor for a NEW road lock. The previous stopped lock
  // above may survive a degraded fix, but a poor fix cannot choose a new road.
  if(accuracy>40)return null;
  const candidates=roadCandidates(position,points,timeline);
  const limit=clamp(accuracy*1.15+7,11,38);
  const reliableHeading=Number.isFinite(speed)&&speed>=2.2&&
    Number.isFinite(heading)&&heading>=0&&heading<=360;
  const rawTravel=validPoint(previous?.raw)?metersBetween(previous.raw,position):Infinity;
  let best=null,score=Infinity;
  for(const c of candidates){
    if(c.distance>limit)continue;
    const angle=reliableHeading?Math.abs(shortestAngle(c.bearing,heading)):0;
    if(angle>75)continue;
    const delta=Number.isFinite(previous?.meters)?Math.abs(c.meters-previous.meters):0;
    // A GPS point near a side road, fork or loop must not steal the pointer
    // from a nearby route leg merely because it is one metre closer.
    if(previous&&delta>Math.max(38,rawTravel*2+20+accuracy*1.6))continue;
    const continuity=previous?Math.min(delta,140)*.38:0;
    const headingCost=reliableHeading?angle*.06:0;
    const candidateScore=c.distance+continuity+headingCost;
    if(candidateScore<score){best=c;score=candidateScore;}
  }
  if(!best)return null;
  if(stopped&&previous&&Number.isFinite(previous.meters)&&
      best.meters<previous.meters&&previous.meters-best.meters<8)
    best={...best,meters:previous.meters,point:previous.point,bearing:previous.bearing,segment:previous.segment};
  return {point:best.point,meters:best.meters,bearing:best.bearing,segment:best.segment,raw:position,anchorRaw:position};
}

/** Direction of the road segment actually reached; never pre-rotate at a turn. */
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

/** Briefly hold a confirmed road leg when one browser GPS sample is noisy.
 * Visual-only. Never use it as a new GPS fix, to trigger turns or rerouting.
 * Do not hold if a vehicle is clearly turning onto a different road.
 */
export function shouldHoldVisualRoadLock({previous,position,accuracy,speed,heading,
  lastMatchedAt,now=Date.now()}={}){
  if(!previous||!validPoint(previous.point)||!validPoint(previous.raw)||
      !validPoint(position)||!Number.isFinite(lastMatchedAt)||
      now<lastMatchedAt||now-lastMatchedAt>1500||
      !Number.isFinite(accuracy)||accuracy<0||accuracy>45)return false;
  if(Number.isFinite(speed)&&speed>5&&Number.isFinite(heading)&&
      Number.isFinite(previous.bearing)&&
      Math.abs(shortestAngle(previous.bearing,heading))>65)return false;
  const rawMove=metersBetween(position,previous.raw);
  const roadOffset=metersBetween(position,previous.point);
  return rawMove<=Math.min(23,Math.max(9,accuracy*1.3+4))&&
    roadOffset<=Math.min(30,Math.max(12,accuracy*1.5+5));
}
