/** GPS speed display, in km/h. Only sensor-supplied meters per second.
 * Null, stale, negative, implausible or demo values MUST NOT become 0.
 * No speed calculated from routes or map animation.
 */
export function gpsSpeedKmh(speedMetersPerSecond,{fresh=false,accuracy=Infinity,simulated=false}={}){
 if(!fresh||simulated||typeof speedMetersPerSecond!=='number'
   ||!Number.isFinite(speedMetersPerSecond)||speedMetersPerSecond<0
   ||speedMetersPerSecond>85||!Number.isFinite(accuracy)||accuracy>100||accuracy<0)return null;
 return Math.round(speedMetersPerSecond*3.6);
}

/** A measured speed sequence, smoothed only BETWEEN accepted GPS fixes.
 * No extrapolation from position, route, clock, or animation. One noisy sample
 * cannot cause a full visual jump; a genuine sensor zero is shown immediately.
 * Returning null invalidates the readout rather than retaining stale speed.
 */
export function smoothGpsSpeedSample(previous,speedMetersPerSecond,{sourceAt,accuracy,now=Date.now(),simulated=false}={}){
 const fresh=Number.isFinite(sourceAt)&&sourceAt>0&&sourceAt<=now+2000&&now-sourceAt<18000;
 const measured=gpsSpeedKmh(speedMetersPerSecond,{fresh,accuracy,simulated});
 if(measured===null)return null;
 if(!previous||!Number.isFinite(previous.kmh)||!Number.isFinite(previous.sourceAt)
    ||sourceAt-previous.sourceAt>6000||sourceAt<previous.sourceAt)
   return {kmh:measured,sourceAt};
 if(sourceAt===previous.sourceAt)return previous;
 if(measured===0)return {kmh:0,sourceAt};
 const seconds=(sourceAt-previous.sourceAt)/1000;
 const fraction=Math.max(.38,Math.min(.85,seconds/2.25));
 const kmh=Math.max(0,Math.round(previous.kmh+(measured-previous.kmh)*fraction));
 return {kmh,sourceAt};
}
