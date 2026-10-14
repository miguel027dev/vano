/** Local, expiring last-known GPS point for fast map paint after refresh.
 * This is a visual placeholder ONLY. It must not be used for route origins,
 * live speed, turn guidance, or proof of current location.
 */
import {validPoint} from './navigationMotion.js';
export const WARM_GPS_KEY='vano-last-verified-gps-v1';
export const WARM_GPS_TTL_MS=90*60*1000;
export function readWarmGps(storage,now=Date.now()){
 try{
  if(!storage)return null;
  const saved=JSON.parse(storage.getItem(WARM_GPS_KEY)||'null');
  if(!saved||!validPoint(saved.coords)||!Number.isFinite(saved.at)||
      saved.at>now||now-saved.at>WARM_GPS_TTL_MS||
      !Number.isFinite(saved.accuracy)||saved.accuracy<0||saved.accuracy>150){
    if(saved)storage.removeItem(WARM_GPS_KEY);
    return null;
  }
  return {coords:saved.coords.slice(0,2),at:saved.at,accuracy:saved.accuracy};
 }catch{return null;}
}
export function saveWarmGps(storage,fix,now=Date.now()){
 try{
  if(!storage||!validPoint(fix?.coords)||!Number.isFinite(fix?.sourceAt)||
      fix.sourceAt>now+1000||now-fix.sourceAt>20000||
      !Number.isFinite(fix?.accuracy)||fix.accuracy<0||fix.accuracy>150)return false;
  storage.setItem(WARM_GPS_KEY,JSON.stringify({
    coords:fix.coords.slice(0,2).map(v=>Math.round(v*1e5)/1e5),
    at:fix.sourceAt,accuracy:fix.accuracy
  }));
  return true;
 }catch{return false;}
}
