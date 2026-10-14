/**
 * Explicit external fallback while VANO's own GTFS/OTP service is not active.
 * Coordinates never leave the browser until the user clicks the external link.
 */
const safeCoords=value=>Array.isArray(value)&&value.length===2
  &&value.every(x=>typeof x==='number'&&Number.isFinite(x))
  &&Math.abs(value[0])<=180&&Math.abs(value[1])<=90;
export function externalTransitUrl(origin,destination){
 if(!safeCoords(origin)||!safeCoords(destination))return null;
 if(origin.every((n,i)=>Math.abs(n-destination[i])<0.000001))return null;
 const url=new URL('https://www.google.com/maps/dir/');
 url.searchParams.set('api','1');
 url.searchParams.set('origin',origin[1]+','+origin[0]);
 url.searchParams.set('destination',destination[1]+','+destination[0]);
 url.searchParams.set('travelmode','transit');
 return url.href;
}
