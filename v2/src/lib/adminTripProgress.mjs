import {metersBetween,validPoint} from './navigationMotion.js';

// Consume fixes already used by navigation. This module does not request GPS,
// perform I/O, or retain points from previous trips.
export function createAdminTripProgress({thresholdMeters=20,maxAccuracyMeters=30,maxSpeedMps=70}={}){
  let anchor=null,meters=0;
  return {
    add({coords,accuracy,timestamp}){
      if(!validPoint(coords)||!Number.isFinite(accuracy)||accuracy<0||accuracy>maxAccuracyMeters||!Number.isFinite(timestamp))return null;
      const fix={coords:[...coords],accuracy,timestamp};
      if(!anchor){anchor=fix;return null;}
      if(timestamp<=anchor.timestamp)return null;
      const distance=metersBetween(anchor.coords,fix.coords);
      const elapsed=(timestamp-anchor.timestamp)/1000;
      // Ignore implausible jumps and small changes within GPS uncertainty.
      if(distance/elapsed>maxSpeedMps)return null;
      if(distance<Math.max(5,Math.min(15,(accuracy+anchor.accuracy)/2)))return meters>=thresholdMeters?{eligible:true,meters,coords:fix.coords,accuracy,timestamp}:null;
      meters+=distance;anchor=fix;
      return {eligible:meters>=thresholdMeters,meters,coords:fix.coords,accuracy,timestamp};
    },
    reset(){anchor=null;meters=0;}
  };
}
