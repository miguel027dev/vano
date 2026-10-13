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
