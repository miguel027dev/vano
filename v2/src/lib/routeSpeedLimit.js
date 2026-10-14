/** Only reveal the Mapbox-reported limit for the current GPS-matched segment.
 * No speed estimates from road class, navigation ETA, or known radar limits.
 */
import {nearestOnRoute,validPoint} from './navigationMotion.js';
export function speedLimitAtGpsPosition(route,coords,{accuracy=Infinity,fresh=false,simulated=false}={}){
 if(!fresh||simulated||!validPoint(coords)||!Number.isFinite(accuracy)||accuracy<0||accuracy>45)return null;
 const limits=route?.speedLimits,geometry=route?.geometry;
 if(!Array.isArray(limits)||!Array.isArray(geometry?.coordinates)||
   geometry.coordinates.length<2||limits.length!==geometry.coordinates.length-1)return null;
 const nearest=nearestOnRoute(coords,geometry);
 if(!Number.isFinite(nearest.distance)||nearest.distance>32)return null;
 const limit=limits[nearest.index];
 return Number.isInteger(limit)&&limit>=10&&limit<=160?limit:null;
}
