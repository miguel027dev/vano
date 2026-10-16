/** MAVI /v2 only: a route candidate is a visual preview, never an applied route. */
import {jevRouteFingerprint} from './jevShared.mjs';
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export function selectMaviPreview(proposal,currentRoute,destination){
 if(proposal?.mode!=='proposal'||!['poi_stop',undefined].includes(proposal.kind))return null;
 const sourceKey=jevRouteFingerprint(currentRoute);
 if(!sourceKey||proposal.sourceKey!==sourceKey)return null;
 const target=proposal.kind==='poi_stop'?proposal.poi?.coords:proposal.destination;
 if(!point(target))return null;
 if(proposal.kind!=='poi_stop'&&(!point(destination?.coords)||target.some((n,i)=>Math.abs(n-destination.coords[i])>0.00001)))return null;
 if(proposal.kind==='poi_stop'&&(!point(proposal.originalDestination)||!point(destination?.coords)||
   proposal.originalDestination.some((n,i)=>Math.abs(n-destination.coords[i])>0.00001)))return null;
 const route=proposal.routeData?.routes?.find(r=>r.id===proposal.routeId);
 const points=route?.geometry?.coordinates;
 if(!route?.proof||!Array.isArray(points)||points.length<2||points.length>100000||!points.every(point))return null;
 if(jevRouteFingerprint(route)===sourceKey)return null;
 const end=points.at(-1);
 if(end.some((n,i)=>Math.abs(n-target[i])>0.005))return null;
 return {route,sourceKey,routeId:route.id};
}
/** Restrict cinematic map movements to previews before departure or while stopped. */
export function canFocusMaviPreview({navigation=false,hasLiveGPS=false,speedKmh=null}={}){
 return !navigation||(hasLiveGPS&&Number.isFinite(speedKmh)&&speedKmh<=2);
}
