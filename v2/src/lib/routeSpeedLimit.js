/** Only reveal the Mapbox-reported limit for the current GPS-matched segment.
 * No speed estimates from road class, navigation ETA, or known radar limits.
 */
import {nearestOnRoute,validPoint,metersBetween} from './navigationMotion.js';
/** The original VANO routing engine sometimes supplies an explicit limit
 * sign per maneuver step. Treat it as provider metadata only on that step's
 * matched portion of the same route, never as a neighborhood default.
 */
export function speedLimitFromStepSign(step){
 const sign=typeof step?.speedLimitSign==='string'?step.speedLimitSign.trim():'';
 const parsed=sign.match(/^(\d{2,3})(?:\s*(km\/h|kph|mph))?$/i);
 if(!parsed)return null;
 const unit=String(parsed[2]||step.speedLimitUnit||'').toLowerCase().replace(/\s/g,'');
 if(!['km/h','kmh','kph','mph'].includes(unit))return null;
 const speed=Number(parsed[1]);
 const kmh=unit==='mph'?speed*1.609344:speed;
 return kmh>=10&&kmh<=160?Math.round(kmh):null;
}
const matchedStepCache=new WeakMap();
function stepSpeedLimitAtIndex(route,currentIndex){
 const steps=route?.steps,geometry=route?.geometry;
 if(!Array.isArray(steps)||!Array.isArray(geometry?.coordinates)||steps.length>700||
    geometry.coordinates.length>16000)return null;
 let matched=matchedStepCache.get(route);
 if(!matched){
  matched=[];
  for(const step of steps){
   if(!validPoint(step?.location))continue;
   const at=nearestOnRoute(step.location,geometry);
   if(!Number.isFinite(at.distance)||at.distance>25)continue;
   // The snapped maneuver vertex belongs to the NEXT segment, not the
   // preceding one. Otherwise a new street limit leaks backwards at a turn.
   const nextIndex=at.index+1;
   const segmentIndex=nextIndex<geometry.coordinates.length-1&&
     metersBetween(step.location,geometry.coordinates[nextIndex])<=2?nextIndex:at.index;
   matched.push({index:segmentIndex,limit:speedLimitFromStepSign(step)});
  }
  matched.sort((a,b)=>a.index-b.index);
  matchedStepCache.set(route,matched);
 }
 let limit=null;
 for(const step of matched){
  if(step.index>currentIndex)break;
  limit=step.limit;
 }
 return limit;
}

export function speedLimitAtGpsPosition(route,coords,{accuracy=Infinity,fresh=false,simulated=false}={}){
 if(!fresh||simulated||!validPoint(coords)||!Number.isFinite(accuracy)||accuracy<0||accuracy>45)return null;
 const limits=route?.speedLimits,geometry=route?.geometry;
 if(!Array.isArray(geometry?.coordinates)||geometry.coordinates.length<2)return null;
 const nearest=nearestOnRoute(coords,geometry);
 if(!Number.isFinite(nearest.distance)||nearest.distance>32)return null;
 if(Array.isArray(limits)&&limits.length===geometry.coordinates.length-1){
  const limit=limits[nearest.index];
  return Number.isInteger(limit)&&limit>=10&&limit<=160?limit:null;
 }
 if(Array.isArray(limits))return null; // malformed annotation must not become a guessed step value
 return stepSpeedLimitAtIndex(route,nearest.index);
}
