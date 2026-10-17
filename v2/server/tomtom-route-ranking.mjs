/** TomTom-informed selection among REAL, already-calculated provider routes.
 * Never generates roads, replaces ETA, removes a legal route, or asserts that a
 * point incident proves a road closure. Original Python safety scoring remains
 * authoritative; only the Mapbox V1 fallback's safe candidate may change.
 */
const weights={roadclosed:12,laneclosed:6,accident:6,roadworks:4,brokenDownvehicle:3,
 dangerousconditions:5,flooding:6,ice:5,jam:3,fog:2,rain:2,wind:2,unknown:1};
const valid=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&
 Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const routeGeometry=r=>r?.geometry?.type==='LineString'&&Array.isArray(r.geometry.coordinates)&&
 r.geometry.coordinates.length>=2&&r.geometry.coordinates.length<=30000&&r.geometry.coordinates.every(valid)?
 r.geometry.coordinates:null;
function distanceMeters(p,a,b){
 const x=111320*Math.cos(p[1]*Math.PI/180),y=110540;
 const dx=(b[0]-a[0])*x,dy=(b[1]-a[1])*y;
 const length=dx*dx+dy*dy;
 const t=length>0?Math.max(0,Math.min(1,-((a[0]-p[0])*x*dx+(a[1]-p[1])*y*dy)/length)):0;
 return Math.hypot((a[0]-p[0])*x+t*dx,(a[1]-p[1])*y+t*dy);
}
function minMeters(p,route){
 let best=Infinity;
 const step=Math.max(1,Math.ceil(route.length/2400));
 for(let i=0;i<route.length-1;i+=step)
  best=Math.min(best,distanceMeters(p,route[i],route[Math.min(i+step,route.length-1)]));
 return best;
}
function routeExposure(route,incidents){
 const geometry=routeGeometry(route);
 if(!geometry)return null;
 let risk=0,affected=0,closures=0;
 for(const e of incidents.slice(0,110)){
  if(!valid(e.coords))continue;
  const road=e.roadGeometry?.type==='LineString'&&Array.isArray(e.roadGeometry.coordinates)?
   e.roadGeometry.coordinates.filter(valid).slice(0,350):[];
  // True line geometry gives strong evidence. A nearby point does not prove
  // that this particular route is affected: merely a weak proximity signal.
  const pts=road.length>=2?road:[e.coords],threshold=road.length>=2?35:22;
  let d=Infinity;
  for(const p of pts)d=Math.min(d,minMeters(p,geometry));
  if(d>threshold)continue;
  const key=String(e.incidentCategory||'').replace(/[-_\s]/g,'').toLowerCase();
  const raw=weights[key]||1,confidence=road.length>=2?1:.20;
  const influence=Math.max(0,1-d/threshold)*raw*confidence;
  if(influence<.04)continue;
  risk+=influence;affected++;
  if(key==='roadclosed'&&road.length>=2)closures++;
 }
 return {risk:+risk.toFixed(2),affected,closures};
}
export function rankTomTomSafeAlternative(result,incidents,{reroute=false}={}){
 if(!result||!Array.isArray(result.routes)||result.routes.length<2||
  result.source!=='mapbox-v1-candidates'||!Array.isArray(incidents)||!incidents.length)return result;
 const safe=result.routes.find(r=>r?.id==='safe');
 if(!safe)return result;
 const extras=Array.isArray(result.safeCandidatePool)?result.safeCandidatePool.slice(0,10):[];
 const candidates=[safe,...result.routes.filter(r=>r.id==='fast'),...extras];
 const valid=candidates.map(r=>({route:r,impact:routeExposure(r,incidents)})).filter(x=>x.impact&&
  Number.isFinite(x.route.duration)&&x.route.duration>0);
 if(valid.length<2)return result;
 const current=valid.find(x=>x.route===safe);
 const best=[...valid].sort((a,b)=>a.impact.risk-b.impact.risk||
  a.route.duration-b.route.duration)[0];
 if(!current||!best)return result;
 // Hysteresis avoids route flicker; never swap for a single distant incident.
 const gain=current.impact.risk-best.impact.risk;
 const shouldSwitch=best.route!==safe&&gain>=(reroute?3:1.8)&&
  (current.impact.closures>best.impact.closures||best.impact.risk<=current.impact.risk*.55);
 const chosen=shouldSwitch?best:current;
 return {...result,routes:result.routes.map(r=>r.id==='safe'?{
  ...chosen.route,id:'safe',label:'Mais segura',verifiedSafety:false,safetyScore:null,
  tomtomTrafficEvidence:{affected:chosen.impact.affected,closureSegments:chosen.impact.closures,
   alternativeCompared:valid.length,changed:shouldSwitch,
   caveat:'Eventos de trânsito externos não garantem ausência de riscos; rota depende do motor de navegação.'}
 }:r),tomtomTrafficUsed:true};
}
export function routeCorridorPoints(result){
 const routes=Array.isArray(result?.routes)?result.routes:[];
 const points=[];
 for(const r of routes)for(const p of (routeGeometry(r)||[]))if(points.length<25000)points.push(p);
 return points;
}
