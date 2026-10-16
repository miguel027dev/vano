/** Safe Routing SP: pure evidence-based ranking; never guarantees street safety. */
const RAD=Math.PI/180, DAY_MS=86400000;
const finite=Number.isFinite;
const dateMs=v=>{const n=Date.parse(v);return finite(n)?n:null};
const clamp=(v,l,h)=>Math.min(h,Math.max(l,v));
export function solarPhase(instant,lat,lon){
 const t=dateMs(instant);
 if(t===null||!finite(lat)||!finite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
  return {phase:'unknown',altitudeDegrees:null};
 const d=(t-Date.UTC(2000,0,1,12))/DAY_MS;
 const m=(357.5291+.98560028*d)*RAD;
 const L=(280.46646+.98564736*d)*RAD+(1.9148*Math.sin(m)+.02*Math.sin(2*m))*RAD;
 const e=(23.4393-.00000036*d)*RAD;
 const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L));
 const dec=Math.asin(Math.sin(e)*Math.sin(L));
 const h=(280.46061837+360.98564736629*d+lon)*RAD-ra;
 const alt=Math.asin(clamp(Math.sin(lat*RAD)*Math.sin(dec)+Math.cos(lat*RAD)*Math.cos(dec)*Math.cos(h),-1,1))/RAD;
 const altitudeDegrees=+alt.toFixed(2);
 return {phase:alt<-6?'night':alt>0?'day':'twilight',altitudeDegrees};
}
/** Registered inventory is not proof that the light works; no_record is not proof of darkness. */
export function summarizeLighting(segments,{now=new Date().toISOString(),maxAgeDays=180,minAssociationConfidence=.75}={}){
 const timestamp=dateMs(now);
 const empty=(reason)=>({valid:false,reason,coveredMeters:0,registeredMeters:0,assessedMeters:0});
 if(!Array.isArray(segments)||timestamp===null||segments.length>30000)return empty('observations-invalid');
 let assessedMeters=0,coveredMeters=0,registeredMeters=0;
 for(const s of segments){
  if(!s||!finite(s.lengthMeters)||s.lengthMeters<=0||s.lengthMeters>100000)return empty('length-invalid');
  assessedMeters+=s.lengthMeters;
  const captured=dateMs(s.updatedAt),age=captured===null?Infinity:(timestamp-captured)/DAY_MS;
  const usable=typeof s.sourceId==='string'&&s.sourceId.length>0&&
    ['registered','no_record'].includes(s.lighting)&&s.inventoryComplete===true&&
    finite(s.associationConfidence)&&s.associationConfidence>=minAssociationConfidence&&
    age>=0&&age<=maxAgeDays;
  if(!usable)continue;
  coveredMeters+=s.lengthMeters;
  if(s.lighting==='registered')registeredMeters+=s.lengthMeters;
 }
 if(!finite(assessedMeters)||assessedMeters<=0)return empty('empty-route');
 return {valid:true,assessedMeters,coveredMeters,registeredMeters,
  coverageFraction:+(coveredMeters/assessedMeters).toFixed(4),
  inventoryFraction:+(registeredMeters/assessedMeters).toFixed(4),
  visibilityConfirmed:false,lampFunctionConfirmed:false};
}
/** Ranking only: preserves provider geometry, maneuvers and ETA. */
export function evaluateSafeCandidates(routes,{
 observationsByRoute={},at=new Date().toISOString(),latitude=-23.55,longitude=-46.63,
 minimumCoverage=.65,preference='balanced',maxDetourFraction=.25,
 maxDetourMinutes=8,maxAgeDays=180
}={}){
 if(!Array.isArray(routes)||!routes.length||routes.length>12)
  return {status:'invalid-routes',recommendedRouteId:null,routes:[],fallback:true};
 const candidates=routes.map((r,i)=>({...r,id:String(r?.id??i),verifiedSafety:false}));
 if(candidates.some(r=>!finite(r.duration)||r.duration<=0||r.duration>1440))
  return {status:'invalid-routes',recommendedRouteId:null,routes:candidates,fallback:true};
 const fastest=candidates.reduce((best,r)=>r.duration<best.duration?r:best,candidates[0]);
 const lightContext=solarPhase(at,latitude,longitude);
 const decorated=candidates.map(route=>({...route,
  lightingEvidence:summarizeLighting(observationsByRoute[route.id],{now:at,maxAgeDays}),
  safeRoutingDisclaimer:'Preferência por infraestrutura cadastrada, sem garantia de segurança ou funcionamento das luminárias.'
 }));
 const preserve=(status)=>({status,recommendedRouteId:fastest.id,routes:decorated,
  solarPhase:lightContext.phase,fallback:true,hasVerifiedSafety:false});
 if(!['balanced','lighting','fast'].includes(preference))return preserve('invalid-preference');
 if(preference==='fast'||lightContext.phase==='day')return preserve('provider-route-preserved');
 if(lightContext.phase==='unknown')return preserve('time-context-unknown');
 if(candidates.length<2)return preserve('no-alternatives');
 if(!finite(minimumCoverage)||minimumCoverage<.5||minimumCoverage>1||
  !finite(maxDetourFraction)||maxDetourFraction<0||maxDetourFraction>1||
  !finite(maxDetourMinutes)||maxDetourMinutes<0||maxDetourMinutes>30)
  return preserve('invalid-policy');
 if(!decorated.every(r=>r.lightingEvidence.valid&&r.lightingEvidence.coverageFraction>=minimumCoverage))
  return preserve('insufficient-comparable-evidence');
 const allowed=decorated.filter(r=>r.duration-fastest.duration<=maxDetourMinutes&&
  r.duration<=fastest.duration*(1+maxDetourFraction));
 const weight=preference==='lighting'?8:4;
 const cost=r=>r.duration+weight*(1-r.lightingEvidence.inventoryFraction);
 const preferred=allowed.reduce((best,r)=>cost(r)<cost(best)-.01?r:best,allowed[0]);
 return {status:'evaluated',recommendedRouteId:preferred.id,routes:decorated,
  solarPhase:lightContext.phase,fallback:preferred.id===fastest.id,hasVerifiedSafety:false,
  decision:{mode:'inventory-lighting-preference',scoreMinutesEquivalent:+cost(preferred).toFixed(2),
   providerDefaultId:fastest.id,evidenceVersion:'sp-light-v0.1'}};
}
