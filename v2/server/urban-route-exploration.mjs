/** Route-corridor exploration: bounded block-level alternatives even when traffic
 * annotations label the main corridor "low". This DOES NOT construct road
 * geometry: exclusion seeds only, with Mapbox driving-traffic finding paths
 * subject to its own road/turn/access restrictions. No illegal shortcuts.
 */
import {meters,overlap,uniqueCandidates} from './v1-candidates.mjs';
import {pointOK} from './routing.mjs';
const fractions=[.27,.44,.62,.78,.35,.70,.53];
function atDistance(geometry,fraction){
 const vertices=geometry?.coordinates;
 if(!Array.isArray(vertices)||vertices.length<3||vertices.length>100000||!vertices.every(pointOK))return null;
 const sums=[0];
 for(let i=1;i<vertices.length;i++)sums.push(sums[i-1]+meters(vertices[i-1],vertices[i]));
 const full=sums.at(-1);
 if(full<1350||full>100000)return null;
 const distance=full*fraction;
 if(distance<380||full-distance<380)return null;
 let i=1;
 while(i<sums.length-1&&sums[i]<distance)i++;
 const previous=vertices[i-1],next=vertices[i],span=sums[i]-sums[i-1];
 if(span<=0)return null;
 const t=Math.max(0,Math.min(1,(distance-sums[i-1])/span));
 return [previous[0]+t*(next[0]-previous[0]),previous[1]+t*(next[1]-previous[1])];
}
export function blockExploreSpecs(routes,limit=3){
 const ranked=uniqueCandidates(routes).slice(0,2).filter(x=>x.distance>=1350&&x.distance<=100000&&x.duration>=270);
 if(!ranked.length)return [];
 const budget=Math.max(0,Math.min(6,Math.trunc(limit)||0));
 if(!budget)return [];
 const used=[],result=[];
 for(let i=0;i<fractions.length&&result.length<budget;i++){
  const route=ranked[i%ranked.length];
  const p=atDistance(route.geometry,fractions[i]);
  if(!p||used.some(q=>meters(p,q)<220))continue;
  used.push(p);
  result.push({points:[p],kind:'urban-corridor-exclusion',origin:'provider-route',
   routeNumber:i%ranked.length,portion:fractions[i]});
 }
 return result;
}
export function validExploredVariant(candidate,baseline,existing){
 if(!candidate?.geometry||!Number.isFinite(candidate.duration)||candidate.duration<=0||
    !Number.isFinite(candidate.distance)||candidate.distance<=0||
    !baseline||candidate.duration>baseline.duration*1.45||
    candidate.distance>baseline.distance*1.8)return false;
 // Exclusion is best-effort; a provider can return the same road, so require
 // a spatially distinct route before claiming that it is a new possibility.
 if(overlap(candidate,baseline)>=.92)return false;
 if((existing||[]).some(route=>overlap(candidate,route)>=.94))return false;
 // A Mapbox "violation" says one of its requested exclusions was not
 // honoured. Do not label this a validated corridor bypass.
 for(const leg of candidate.legs||[]){
  if((leg.notifications||[]).some(n=>n?.type==='violation'))return false;
 }
 return true;
}
