/** Audited street-corridor candidate exploration, no synthetic roads.
 * Mapbox driving-traffic supplies geometry, traffic ETA, turn/access rules.
 * A "lateral" corridor is a provider-returned ALTERNATIVE route, never
 * a hand-drawn offset that could cross a wall, wrong-way road or park.
 */
import {meters,overlap,uniqueCandidates} from './v1-candidates.mjs';
import {pointOK} from './routing.mjs';

// First cycle includes the start, central approach and final city blocks.
const PRIMARY_FRACTIONS=[.12,.20,.28,.36,.44,.52,.60,.68,.78,.87];
const BRANCH_FRACTIONS=[.19,.43,.67,.82,.29,.57,.76,.37,.61,.23,.49,.85];
const BUDGET=20;
const quant=p=>p.map(n=>n.toFixed(5)).join(',');
const signature=spec=>spec.points.map(quant).join('|');
const zone=portion=>portion<.34?'inicio':portion<.69?'meio':'fim';
function atDistance(geometry,fraction){
 const vertices=geometry?.coordinates;
 if(!Array.isArray(vertices)||vertices.length<3||vertices.length>100000||!vertices.every(pointOK))return null;
 const sums=[0];
 for(let i=1;i<vertices.length;i++)sums.push(sums[i-1]+meters(vertices[i-1],vertices[i]));
 const full=sums.at(-1);
 if(full<1350||full>100000)return null;
 const distance=full*fraction;
 if(distance<260||full-distance<260)return null;
 let i=1;
 while(i<sums.length-1&&sums[i]<distance)i++;
 const previous=vertices[i-1],next=vertices[i],span=sums[i]-sums[i-1];
 if(span<=0)return null;
 const t=Math.max(0,Math.min(1,(distance-sums[i-1])/span));
 return [previous[0]+t*(next[0]-previous[0]),previous[1]+t*(next[1]-previous[1])];
}
function makeSpec(route,portion,phase,routeNumber,second=null){
 const point=atDistance(route.geometry,portion);
 if(!point)return null;
 const pair=second===null?null:atDistance(route.geometry,second);
 if(second!==null&&(!pair||meters(point,pair)<180))return null;
 return {points:pair?[point,pair]:[point],kind:pair?'two-block-corridor':'urban-corridor-exclusion',
  phase,zone:zone(portion),portion,routeNumber};
}
/** At most 20 distinct probes in two cycles, not 20 guessed roads.
 * Phase one spreads across beginning/middle/end of the original provider
 * route. Phase two explores returned lateral provider routes plus paired
 * exclusions on the main corridor to reveal neighborhood-scale detours.
 */
export function blockExploreSpecs(routes,limit=10,{phase=1,seen=[]}={}){
 const all=uniqueCandidates(routes,24).filter(x=>x.distance>=1350&&x.distance<=100000&&x.duration>=270);
 const original=all.find(r=>r===routes?.[0])||all[0];
 const ranked=original?[original,...all.filter(r=>r!==original)]:[];
 if(!ranked.length)return [];
 const budget=Math.max(0,Math.min(BUDGET,Math.trunc(limit)||0));
 if(!budget)return [];
 const out=[],keys=new Set(seen.map(s=>typeof s==='string'?s:signature(s)));
 const accept=spec=>{
  if(!spec)return;
  const key=signature(spec);
  if(keys.has(key))return;
  // Do not ask the provider to exclude virtually identical blocks in the
  // same phase: that burns quota without exploring a new corridor.
  if(spec.points.length===1&&out.some(old=>old.points.length===1&&
      meters(old.points[0],spec.points[0])<145))return;
  keys.add(key);out.push(spec);
 };
 if(phase===1){
  for(const f of PRIMARY_FRACTIONS){
   if(out.length>=budget)break;
   accept(makeSpec(ranked[0],f,1,0));
  }
 }else{
  // Branch from observed provider variants (actual side streets), rather than
  // inventing perpendicular points that may not be navigable.
  const lateral=ranked.slice(1,7).filter(r=>overlap(r,ranked[0])<.985);
  for(let i=0;i<BRANCH_FRACTIONS.length&&out.length<budget&&lateral.length;i++){
   const route=lateral[i%lateral.length],idx=ranked.indexOf(route);
   accept(makeSpec(route,BRANCH_FRACTIONS[i],2,idx));
  }
  // Even when no lateral path exists, try adjacent/pairwise block exclusions
  // at the beginning, middle and end of the provider's baseline.
  for(const [a,b] of [[.17,.23],[.31,.39],[.45,.53],[.58,.65],[.73,.80],[.83,.88],
     [.12,.28],[.38,.60],[.62,.81],[.24,.72]]){
   if(out.length>=budget)break;
   accept(makeSpec(ranked[0],a,2,0,b));
  }
  for(const f of [...BRANCH_FRACTIONS,...PRIMARY_FRACTIONS]){
   if(out.length>=budget)break;
   accept(makeSpec(ranked[0],f,2,0));
  }
 }
 return out.slice(0,budget);
}
/** Provider warning that a route would violate an access/turn restriction.
 * An optional shortcut must never win on ETA while the provider itself says
 * it has a violation. Unknown warnings do not become invented closures.
 */
export function hasProviderRouteViolation(route){
 return (route?.legs||[]).some(leg=>(leg?.notifications||[]).some(n=>
  String(n?.type||'').toLowerCase()==='violation'));
}
export function validExploredVariant(candidate,baseline,existing){
 if(!candidate?.geometry||!Number.isFinite(candidate.duration)||candidate.duration<=0||
    !Number.isFinite(candidate.distance)||candidate.distance<=0||
    !baseline||candidate.duration>baseline.duration*1.45||
    candidate.distance>baseline.distance*1.8)return false;
 if(overlap(candidate,baseline)>=.92)return false;
 if((existing||[]).some(route=>overlap(candidate,route)>=.94))return false;
 if(hasProviderRouteViolation(candidate))return false;
 return true;
}
/** A fast route cannot be up to 30s slower purely to save distance.
 * Compare compliant provider paths using traffic-aware ETA; permit a
 * negligible 5-second technical tie only if 450m distance is saved.
 * Road-catalogue QA names have no measured speeds and must not set weights.
 */
export function chooseStableFastRoute(candidates){
 const pool=uniqueCandidates(candidates,24);
 // Provider restrictions are authoritative; do not promote a road whose
 // point exclusion or legal restriction was explicitly violated.
 const compliant=pool.filter(r=>!hasProviderRouteViolation(r));
 const fastest=compliant[0];
 if(!fastest)return null;
 let selected=fastest;
 for(const route of compliant){
  if(route.duration>fastest.duration+5)break;
  if(route.distance<=selected.distance-450&&route.duration<=selected.duration+5)
   selected=route;
 }
 return selected;
}
