/** V2 visual-only road entry. Never replaces raw GPS for navigation decisions. */
import {bearingBetween,clamp,metersBetween,shortestAngle,validPoint} from './navigationMotion.js';

/** The route starts on the road. For a nearby origin, place the VISUAL puck
 * at that first street point on the first navigation frame, even while stopped.
 * Never jump an arbitrary distance or use an old GPS fix to fake a location.
 */
export function visualRouteStartPoint({position,route,accuracy,speed,heading,
 navigation,simulation=false,sourceAt,now=Date.now()}={}){
  const points=route?.geometry?.coordinates||[],start=points[0];
  if(!navigation||simulation||!validPoint(position)||!validPoint(start)||
      !Number.isFinite(accuracy)||accuracy<0||accuracy>55||
      (Number.isFinite(speed)&&speed>6.5))return null;
  if(Number.isFinite(sourceAt)&&(sourceAt>now+1500||now-sourceAt>7500))return null;
  const radius=clamp(accuracy*.55+52,56,72);
  if(metersBetween(position,start)>radius)return null;
  // Prevent a fast-moving fix on the opposite street/direction from being
  // teleported backwards onto the route's first leg.
  if(Number.isFinite(speed)&&speed>2.5&&validPoint(points[1])){
    const firstBearing=bearingBetween(start,points[1]);
    if(Number.isFinite(heading)&&heading>=0&&heading<=360&&
      Math.abs(shortestAngle(firstBearing,heading))>75)return null;
    if(!Number.isFinite(heading)&&metersBetween(position,start)>36)return null;
  }
  return start;
}

/** Additional, independent confirmation once the car starts moving along
 * the route. Repeated React frames are NOT new GPS readings.
 */
export function assessV2CarOnStreet({previous=null,position,match,accuracy,speed,heading,
 sourceAt,now=Date.now()}={}){
  const old=previous||{};
  const sourceFresh=!Number.isFinite(sourceAt)||
    (sourceAt<=now+1200&&now-sourceAt<=5000);
  const offset=validPoint(position)&&validPoint(match?.point)?
    metersBetween(position,match.point):Infinity;
  const moving=Number.isFinite(speed)&&speed>=1.7;
  const aligned=!moving||(Number.isFinite(heading)&&heading>=0&&heading<=360&&
    Number.isFinite(match?.bearing)&&
    Math.abs(shortestAngle(match.bearing,heading))<=48);
  const accuracyGood=Number.isFinite(accuracy)&&accuracy>=0&&
    accuracy<=(moving?26:12);
  const close=offset<=(
    moving?clamp(accuracy*.55+2.5,5,11):clamp(accuracy*.26+1.5,2.5,4.5));
  const confident=Boolean(sourceFresh&&accuracyGood&&close&&aligned);
  const newFix=!Number.isFinite(sourceAt)||!Number.isFinite(old.lastSourceAt)||
    sourceAt>old.lastSourceAt;
  const hits=confident?(old.hits||0)+(newFix?1:0):0;
  // An already acquired car remains at a traffic light under mild jitter.
  // An out-of-route or stale fix immediately restores the fallback arrow.
  const onRoadHold=Boolean(old.visible&&sourceFresh&&aligned&&
    Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=32&&offset<=8);
  const visible=confident?(Boolean(old.visible)||hits>=(moving?2:3)):onRoadHold;
  return {visible,hits,everConfirmed:Boolean(old.everConfirmed||visible),
    lastFixAt:now,lastSourceAt:Number.isFinite(sourceAt)?sourceAt:old.lastSourceAt,offset};
}
