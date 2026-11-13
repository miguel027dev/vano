/** V2 experimental visual road entry. Raw GPS is never modified or used as a street position. */
import {clamp,metersBetween,shortestAngle,validPoint} from './navigationMotion.js';

export function visualRouteStartPoint({position,route,accuracy,speed,navigation,simulation=false}={}){
  const start=route?.geometry?.coordinates?.[0];
  if(!navigation||simulation||!validPoint(position)||!validPoint(start)||
      !Number.isFinite(accuracy)||accuracy<0||accuracy>50||
      (Number.isFinite(speed)&&speed>1.5))return null;
  // Only a nearby start, not the nearest arbitrary street several blocks away.
  const radius=clamp(accuracy*.7+10,12,32);
  return metersBetween(position,start)<=radius?start:null;
}

/** Two confident moving fixes or three very precise stopped fixes acquire the car.
 * Loss of road evidence restores the arrow; a small uncertainty band prevents flicker.
 * This is a visual confidence estimate, not proof of being inside/outside a building.
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
  const hits=confident?(old.hits||0)+1:0;
  // An already acquired car stays at a traffic light with mild GPS uncertainty,
  // but never persists after an obvious departure, bad fix, or stale GPS.
  const onRoadHold=Boolean(old.visible&&sourceFresh&&aligned&&
    Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=32&&offset<=8);
  const visible=confident?(Boolean(old.visible)||hits>=(moving?2:3)):onRoadHold;
  return {visible,hits,everConfirmed:Boolean(old.everConfirmed||visible),
    lastFixAt:now,offset};
}
