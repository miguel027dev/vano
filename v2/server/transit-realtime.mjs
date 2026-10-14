/**
 * VANO Transit realtime trust policy.
 * Future GTFS-RT / SIRI adapters must verify source timestamp BEFORE updating ETA.
 * This module never fakes vehicle locations, delays or on-time promises.
 */
export const TRANSIT_FRESHNESS=Object.freeze({
  vehiclePosition:90000,
  tripUpdate:90000,
  serviceAlert:600000
});
const ISO_OR_UNIX=value=>{
  if(typeof value==='number'&&Number.isFinite(value)){
    const ms=value>1e11?value:value*1000;
    return ms>=0?ms:null;
  }
  if(typeof value!=='string'||!value.trim())return null;
  const d=Date.parse(value);
  return Number.isFinite(d)?d:null;
};
/**
 * A provider's realtime snapshot is only "fresh" when there is an actual
 * source observation timestamp: response-fetch time is not sufficient.
 * SDKs must NOT turn missing GTFS-RT vehicle.timestamp into Date.now().
 */
export function assessTransitFreshness({type,observedAt,now=Date.now()}={}){
 const limit=TRANSIT_FRESHNESS[type];
 const stamp=ISO_OR_UNIX(observedAt);
 if(!limit)return {status:'unknown',verified:false,ageMs:null};
 if(stamp===null)return {status:'unknown',verified:false,ageMs:null};
 if(stamp>now+10000)return {status:'invalid_future',verified:false,ageMs:null};
 const ageMs=Math.max(0,now-stamp);
 return {status:ageMs<=limit?'fresh':'stale',verified:ageMs<=limit,ageMs,limitMs:limit};
}
export function evaluateTransitPrediction({scheduledTime,estimatedTime,sourceObservedAt,type='tripUpdate',now=Date.now()}={}){
 const scheduled=ISO_OR_UNIX(scheduledTime),estimated=ISO_OR_UNIX(estimatedTime);
 const freshness=assessTransitFreshness({type,observedAt:sourceObservedAt,now});
 const delayMinutes=scheduled!==null&&estimated!==null?Math.round((estimated-scheduled)/60000):null;
 // We can retain the scheduled time when the feed is stale, but never show a
 // stale prediction as a currently live arrival estimate.
 const trustedEstimate=freshness.verified&&estimated!==null;
 return {
   scheduled:scheduled!==null?new Date(scheduled).toISOString():null,
   estimated:trustedEstimate?new Date(estimated).toISOString():null,
   delayMinutes:trustedEstimate?delayMinutes:null,
   freshness:freshness.status,
   observedAt:freshness.verified?new Date(ISO_OR_UNIX(sourceObservedAt)).toISOString():null
 };
}
export function shouldPollTransit({visible=true,hasCoverage=false,activeJourney=false,now=Date.now(),lastCheckAt=null,minIntervalMs=30000}={}){
 if(!visible||!hasCoverage||!activeJourney)return false;
 return !Number.isFinite(lastCheckAt)||now-lastCheckAt>=Math.max(30000,minIntervalMs);
}
