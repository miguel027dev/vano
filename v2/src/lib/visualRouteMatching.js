/** Visual-only map matching for live navigation.
 * No correction is used as GPS telemetry, reroute evidence or maneuver proof.
 * Each segment and cumulative offset comes from the provider's actual route.
 */
import {bearingBetween,clamp,metersBetween,shortestAngle,validPoint} from './navigationMotion.js';

const cached=new WeakMap();
function routeSegments(geometry){
 if(!geometry||typeof geometry!=='object')return null;
 const coords=geometry.coordinates;
 if(!Array.isArray(coords)||coords.length<2)return null;
 const existing=cached.get(geometry);
 if(existing&&existing.coords===coords)return existing;
 const segments=[];let cumulative=0;
 for(let i=0;i<coords.length-1;i++){
  const a=coords[i],b=coords[i+1];
  if(!validPoint(a)||!validPoint(b))continue;
  const length=metersBetween(a,b);
  if(!Number.isFinite(length)||length<.15)continue;
  segments.push({index:i,a,b,length,at:cumulative,bearing:bearingBetween(a,b)});
  cumulative+=length;
 }
 const info={coords,segments,total:cumulative};
 cached.set(geometry,info);
 return info;
}
function project(p,segment){
 const {a,b}=segment;
 const scale=Math.max(.15,Math.cos(p[1]*Math.PI/180));
 const dx=(b[0]-a[0])*scale,dy=b[1]-a[1];
 const t=clamp(((p[0]-a[0])*scale*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy),0,1);
 const point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
 return {point,meters:segment.at+t*segment.length,lateral:metersBetween(p,point),segmentIndex:segment.index,bearing:segment.bearing};
}
export function pointAlongRoute(geometry,meters){
 const info=routeSegments(geometry);
 if(!info?.segments.length)return null;
 const progress=clamp(Number.isFinite(meters)?meters:0,0,info.total);
 let lo=0,hi=info.segments.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(info.segments[mid].at+info.segments[mid].length<progress)lo=mid+1;else hi=mid;}
 const seg=info.segments[lo],t=clamp((progress-seg.at)/seg.length,0,1);
 return {point:[seg.a[0]+(seg.b[0]-seg.a[0])*t,seg.a[1]+(seg.b[1]-seg.a[1])*t],bearing:seg.bearing,meters:progress,segmentIndex:seg.index};
}
export function matchVisualFix(position,geometry,{accuracy=15,heading=null,speed=0,previous=null,sourceAt=0}={}){
 const fallback={point:position,matched:false,routeMeters:null,bearing:null,geometry,sourceAt};
 if(!validPoint(position)||!geometry||!Number.isFinite(accuracy)||accuracy<0||accuracy>45)return fallback;
 const info=routeSegments(geometry);
 if(!info?.segments.length)return fallback;
 const radius=clamp(accuracy*1.55+4,12,43);
 const prior=previous?.matched&&previous.geometry===geometry?previous:null;
 const deltaT=prior&&Number.isFinite(sourceAt)&&Number.isFinite(prior.sourceAt)&&sourceAt>prior.sourceAt
   ?Math.min(30,(sourceAt-prior.sourceAt)/1000):0;
 const forwardLimit=prior?Math.max(22,Math.max(0,speed)*Math.max(1,deltaT)*2.3+accuracy+12):Infinity;
 const backwardsLimit=prior?Math.max(12,accuracy+Math.max(0,speed)*Math.max(1,deltaT)*.6):Infinity;
 const moving=Number.isFinite(heading)&&heading>=0&&Number.isFinite(speed)&&speed>=2&&accuracy<=30;
 let best=null,bestScore=Infinity;
 for(const segment of info.segments){
  const candidate=project(position,segment);
  if(candidate.lateral>radius)continue;
  let score=candidate.lateral;
  if(moving){
   const angle=Math.abs(shortestAngle(heading,segment.bearing));
   if(angle>55)score+=Math.min(20,(angle-55)*.2);
  }
  if(prior){
   const forward=candidate.meters-prior.routeMeters;
   if(forward>forwardLimit)score+=Math.min(150,(forward-forwardLimit)*1.1);
   if(forward< -backwardsLimit)score+=Math.min(150,(-forward-backwardsLimit)*1.1);
   if(candidate.segmentIndex!==prior.segmentIndex)score+=2;
  }
  if(score<bestScore){bestScore=score;best=candidate;}
 }
 if(!best)return fallback;
 // Never snap a GPS fix beyond its plausible error envelope merely because
 // the route engine returned a nearby road.
 if(best.lateral>radius||bestScore>radius+25)return fallback;
 return {...fallback,point:best.point,matched:true,routeMeters:best.meters,bearing:best.bearing,
  lateral:best.lateral,segmentIndex:best.segmentIndex};
}
/** Following a real polyline prevents camera centers cutting diagonally
 * across corners. The tangent stays on the current street until the turn.
 */
export function roadCameraPose(position,geometry,{accuracy=15,heading=null,speed=0,lookAheadMeters=0,previous=null,sourceAt=0}={}){
 const matched=matchVisualFix(position,geometry,{accuracy,heading,speed,previous,sourceAt});
 if(!matched.matched)return {matched:false,point:position,center:null,bearing:null};
 const sample=pointAlongRoute(geometry,matched.routeMeters+Math.max(0,lookAheadMeters));
 return {matched:true,point:matched.point,center:sample?.point||matched.point,bearing:matched.bearing,routeMeters:matched.routeMeters};
}
