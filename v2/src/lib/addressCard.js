/** Rate-limited reverse-geocoding decision: no GPS calls or private persistence. */
export function movedDistanceMeters(a,b) {
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2)return Infinity;
 const rad=Math.PI/180,lat=(a[1]+b[1])/2*rad;
 return Math.hypot((a[1]-b[1])*111195,(a[0]-b[0])*111195*Math.cos(lat));
}
export function shouldRefreshAddress(previous,point,now=Date.now(),moving=false) {
 if(!point||point.length!==2||!point.every(Number.isFinite))return false;
 if(!previous)return true;
 const age=now-previous.at;
 if(age<0)return false;
 const minimum=moving?38000:30000;
 if(age<minimum)return false;
 return movedDistanceMeters(previous.point,point)>= (moving?130:65) || age>=180000;
}

/** The navigation badge only reports the most recently reverse-geocoded GPS road.
 * Never substitute the upcoming maneuver street or destination for current location.
 */
export function navigationStreetLabel(address,hasRecentFix){
 if(!hasRecentFix)return 'Aguardando localização…';
 const street=typeof address?.street==='string'?address.street.trim():'';
 if(!street||street==='Endereço não encontrado'||street==='Localização identificada')
   return 'Identificando rua…';
 return street.slice(0,110);
}
