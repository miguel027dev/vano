/** Public search-location hint: a soft provider ranking signal, never a
 * country or geographic filter. Rounding avoids restarting searches for each
 * tiny GPS update while typing. Does not store or transmit an exact fix.
 */
export function searchGeoBias(coords,{gpsGranted=false,manual=false}={}){
 if(!gpsGranted||manual||!Array.isArray(coords)||coords.length!==2)return '';
 const [lon,lat]=coords;
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return '';
 return '&lng='+encodeURIComponent((Math.round(lon*100)/100).toFixed(2))+
  '&lat='+encodeURIComponent((Math.round(lat*100)/100).toFixed(2));
}
