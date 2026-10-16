/** Safety-first comparison of *existing legal provider routes* using verified
 * recent road hazards. No demographic, community or neighborhood risk proxies.
 * GeoSampa flood-history grids are staging/display-only until formally approved.
 */
const clamp=(n,a=0,b=100)=>Math.min(b,Math.max(a,n));
const fin=n=>typeof n==='number'&&Number.isFinite(n);
const AGE_MS=14*86400000;
const TYPE_WEIGHT=Object.freeze({risco:1,acidente:.9,obra:.55});
function meters(point,a,b){
 const mx=111320*Math.cos(point[1]*Math.PI/180),my=110540;
 const ax=(a[0]-point[0])*mx,ay=(a[1]-point[1])*my;
 const dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my;
 const t=clamp(-(ax*dx+ay*dy)/Math.max(dx*dx+dy*dy,1e-9),0,1);
 return Math.hypot(ax+t*dx,ay+t*dy);
}
function geom(route){
 const c=route?.geometry?.coordinates;
 return route?.geometry?.type==='LineString'&&Array.isArray(c)&&c.length>=2&&c.length<=30000&&
  c.every(p=>Array.isArray(p)&&p.length===2&&fin(p[0])&&fin(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)?c:null;
}
function minDistance(point,coordinates){
 let closest=Infinity,step=Math.max(1,Math.ceil((coordinates.length-1)/2400));
 for(let i=0;i<coordinates.length-1;i+=step){
  const end=Math.min(coordinates.length-1,i+step);
  closest=Math.min(closest,meters(point,coordinates[i],coordinates[end]));
 }
 return closest;
}
export function nearbyVerifiedHazards(reports,routeRows,now=Date.now()){
 const coords=(routeRows||[]).map(geom).filter(Boolean).flat();
 if(!coords.length)return [];
 const bb=[Math.min(...coords.map(x=>x[0]))-.006,Math.min(...coords.map(x=>x[1]))-.006,
           Math.max(...coords.map(x=>x[0]))+.006,Math.max(...coords.map(x=>x[1]))+.006];
 return (Array.isArray(reports)?reports:[]).filter(r=>{
  const age=now-Date.parse(r?.createdAt||'');
  return r?.status==='verificado'&&Object.hasOwn(TYPE_WEIGHT,r?.type)&&
   age>=0&&age<=AGE_MS&&Array.isArray(r.coords)&&r.coords.length===2&&
   fin(r.coords[0])&&fin(r.coords[1])&&r.coords[0]>=bb[0]&&r.coords[0]<=bb[2]&&r.coords[1]>=bb[1]&&r.coords[1]<=bb[3];
 }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,70);
}
export function safeEvidenceScore(route,events,now=Date.now()){
 const coordinates=geom(route);
 if(!coordinates)return null;
 const impacts=[];
 for(const e of events){
  const d=minDistance(e.coords,coordinates);
  if(d>350)continue;
  const age=clamp((now-Date.parse(e.createdAt))/AGE_MS,0,1);
  const s=TYPE_WEIGHT[e.type]*(1-age*.65)*Math.pow(Math.max(0,1-d/350),1.5);
  if(s>.005)impacts.push(s);
 }
 const max=impacts.length?Math.max(...impacts):0,exposure=clamp(impacts.reduce((a,b)=>a+b,0)*24,0,100);
 const hotspot=clamp(max*100,0,100);
 // Neutral low-confidence prior: no observed reports NEVER means 'safe'.
 const conservative=clamp(58-.32*hotspot-.32*exposure,1,100);
 const confidence=clamp(30+Math.min(28,events.length*4),30,58);
 const score=.70*conservative+.15*(100-hotspot)+.10*(100-exposure)+.05*confidence;
 return {score:+score.toFixed(2),conservative:+conservative.toFixed(1),
  hotspot:+hotspot.toFixed(1),exposure:+exposure.toFixed(1),confidence,
  nearbyEvents:impacts.length};
}
export function applySafeVerifiedReportRanking(result,reports,{reroute=false,now=Date.now()}={}){
 const routes=result?.routes||[];
 // Never include internal provider candidate geometries in any API response.
 if(!result||!Array.isArray(routes))return result;
 const {safeCandidatePool:_internalCandidates,...publicResult}=result;
 const extra=Array.isArray(_internalCandidates)?_internalCandidates.slice(0,10):[];
 if(routes.length<2||result?.source==='demonstracao'||result?.degraded===true)return publicResult;
 const target=routes.find(r=>r?.id==='safe');
 const valid=[...routes,...extra].filter(r=>r&&geom(r)&&fin(r.duration)&&r.duration>0);
 if(!target||valid.length<2)return publicResult;
 // The original Python Safety Engine already has richer risk metrics and rules.
 if(result.source==='vano-original-python')return publicResult;
 const evidence=nearbyVerifiedHazards(reports,valid,now);
 if(evidence.length<2)return {...publicResult,safeDataStatus:'insufficient-verified-events'};
 const scores=valid.map(route=>({route,metrics:safeEvidenceScore(route,evidence,now)}))
  .filter(x=>x.metrics).sort((a,b)=>b.metrics.score-a.metrics.score);
 const chosen=scores[0],current=scores.find(x=>x.route===target);
 if(!chosen||!current)return publicResult;
 // Reroute hysteresis resists GPS jitter; no new calls or extra provider cost.
 const gain=chosen.metrics.score-current.metrics.score;
 const minGain=reroute?5:2;
 const switchRoute=gain>=minGain&&chosen.metrics.exposure<current.metrics.exposure;
 const picked=switchRoute?chosen:current;
 const nextRoutes=routes.map(r=>r.id!=='safe'?r:{
  ...picked.route,id:'safe',label:'Mais segura',
  verifiedSafety:false,safetyScore:null,
  safeEvidence:{...picked.metrics,comparedAlternatives:scores.length,verifiedReports:evidence.length,
   changeApplied:switchRoute,confidenceLabel:'limitada',source:'VANO relatos recentes verificados',
   algorithm:'risk-priority-v1',floodHistory:'staging-display-only'},
 });
 return {...publicResult,routes:nextRoutes,safeDataStatus:'limited-verified-incidents',
  safetyMessage:'Alternativa avaliada com relatos recentes verificados. Não garante segurança nem ausência de alagamento. Base histórica do GeoSampa ainda não aprovada para influenciar a navegação.'};
}
