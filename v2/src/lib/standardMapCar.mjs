/** Stable /mapa-only compact car placement.
 * The output coordinates are ONLY for the marker and the custom WebGL car.
 * Do not forward them to the camera, GPS, ETA, directions or rerouting.
 */
import {clamp,metersBetween,nearestOnRoute,nextRouteBearing,validPoint} from './navigationMotion.js';
import {visualRouteStartPoint} from './v2RoadEntry.mjs';

export function standardMapCarPose({previous=null,position,route,match,trackingPoint,
 trackingBearing,accuracy,speed,heading,sourceAt,now=Date.now(),navigation=false,
 vehicle='carro',simulation=false}={}){
 const empty={visible:false,point:null,bearing:null,entryHeld:false,entryPoint:null,
   lastRoadPoint:null,lastSourceAt:null,offRouteFixes:0};
 if(!navigation||simulation||vehicle!=='carro'||!validPoint(position)||
   !Array.isArray(route?.geometry?.coordinates)||route.geometry.coordinates.length<2)
   return empty;

 const old=previous||empty;
 const fresh=Number.isFinite(sourceAt)&&sourceAt<=now+1500&&now-sourceAt<=7500;
 const goodAccuracy=Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=36;
 const roadOffset=validPoint(match?.point)?metersBetween(position,match.point):Infinity;
 const roadConfirmed=Boolean(fresh&&goodAccuracy&&
   roadOffset<=clamp(accuracy*.85+5,9,30));
 // Acquire on the route start before the first movement; never substitute
 // a far-away origin, an expired GPS fix or an unrelated route leg.
 const start=!old.visible?visualRouteStartPoint({
   position,route,accuracy,speed,heading,sourceAt,now,navigation:true}):null;
 const visible=Boolean(old.visible||start||roadConfirmed);
 if(!visible)return {...empty,lastSourceAt:fresh?sourceAt:old.lastSourceAt};

 const entryPoint=validPoint(old.entryPoint)?old.entryPoint:start;
 let entryHeld=Boolean((old.entryHeld||start)&&validPoint(entryPoint));
 // Until an independent fresh, moving GPS fix locates the car beyond the
 // entrance along the route, the car must NOT drift back inside the house.
 const onRoadMoving=Boolean(fresh&&roadConfirmed&&Number.isFinite(speed)&&speed>=1.5&&
   validPoint(match?.point)&&metersBetween(match.point,entryPoint)>6);
 if(entryHeld&&onRoadMoving)entryHeld=false;
 // Never count animation frames as additional GPS fixes.
 const newFix=fresh&&sourceAt!==old.lastSourceAt;
 const offRoute=goodAccuracy&&accuracy<=20&&
   nearestOnRoute(position,route.geometry).distance>Math.max(32,accuracy*1.8);
 const offRouteFixes=newFix?(offRoute?(old.offRouteFixes||0)+1:0):(old.offRouteFixes||0);
 // Only an established driver who has left the entrance can be released to
 // the arrow after FOUR separate, accurate off-route measurements.
 if(!entryHeld&&offRouteFixes>=4)return {...empty,lastSourceAt:sourceAt,offRouteFixes};

 const lastRoadPoint=roadConfirmed&&validPoint(trackingPoint)?trackingPoint:
   validPoint(old.lastRoadPoint)?old.lastRoadPoint:
   validPoint(trackingPoint)?trackingPoint:match?.point;
 const point=entryHeld?entryPoint:lastRoadPoint;
 if(!validPoint(point))return {...old,lastSourceAt:sourceAt};
 const routeHeading=entryHeld?nextRouteBearing(entryPoint,route.geometry,26):null;
 const bearing=Number.isFinite(routeHeading)?routeHeading:
   Number.isFinite(trackingBearing)?trackingBearing:
   Number.isFinite(old.bearing)?old.bearing:
   Number.isFinite(match?.bearing)?match.bearing:0;
 return {visible:true,point,bearing,entryHeld,entryPoint,
   lastRoadPoint:validPoint(lastRoadPoint)?lastRoadPoint:null,
   lastSourceAt:fresh?sourceAt:old.lastSourceAt,offRouteFixes};
}
