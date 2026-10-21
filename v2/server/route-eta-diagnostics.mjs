/** Admin-only ETA provenance. Never manufacture traffic speeds or delays from
 * a congestion score. These functions only inspect provider facts already
 * returned with the route; no user history, tokens or route coordinates.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const round=(n,decimals=1)=>finite(n)?Number(n.toFixed(decimals)):null;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const levels=new Set(['low','moderate','heavy','severe']);
function roadLevel(raw,numeric){
 const label=String(raw||'').toLowerCase();
 if(levels.has(label))return label;
 if(!finite(numeric))return 'unknown';
 return numeric>=85?'severe':numeric>=65?'heavy':numeric>=35?'moderate':'low';
}
export function mapboxEtaEvidence(raw){
 const distance=raw?.distance,seconds=raw?.duration;
 if(!finite(distance)||distance<=0||!finite(seconds)||seconds<=0)return null;
 let allMeters=0,congestionMeters=0,heavyMeters=0,annotationTime=0,timeMeters=0;
 let totalParts=0,knownParts=0,slowSegments=[],cursor=0;
 const levelMeters={low:0,moderate:0,heavy:0,severe:0,unknown:0};
 for(const leg of Array.isArray(raw?.legs)?raw.legs.slice(0,8):[]){
  const ann=leg?.annotation||{};
  const d=Array.isArray(ann.distance)?ann.distance:[];
  const t=Array.isArray(ann.duration)?ann.duration:[];
  const nums=Array.isArray(ann.congestion_numeric)?ann.congestion_numeric:[];
  const labels=Array.isArray(ann.congestion)?ann.congestion:[];
  // Underlying Mapbox annotations describe consecutive geometry edges.
  for(let i=0;i<Math.min(d.length,20000);i++){
   const meters=d[i];
   if(!finite(meters)||meters<0||meters>150000)continue;
   const duration=finite(t[i])&&t[i]>=0&&t[i]<86400?t[i]:null;
   const numeric=finite(nums[i])&&nums[i]>=0&&nums[i]<=100?nums[i]:null;
   const rawLabel=String(labels[i]||'').toLowerCase();
   const known=numeric!==null||levels.has(rawLabel);
   const level=known?roadLevel(rawLabel,numeric):'unknown';
   totalParts++;if(known)knownParts++;
   allMeters+=meters;levelMeters[level]+=meters;
   if(known)congestionMeters+=meters;
   if(known&&['heavy','severe'].includes(level))heavyMeters+=meters;
   if(duration!==null){annotationTime+=duration;timeMeters+=meters;}
   if(known&&['heavy','severe'].includes(level)&&meters>=1){
    slowSegments.push({section:totalParts,startKm:round(cursor/1000,2),
     lengthKm:round(meters/1000,3),seconds:duration===null?null:round(duration,1),
     speedKmh:duration>0?round(meters/duration*3.6):null,
     congestion:level,congestionScore:numeric});
   }
   cursor+=meters;
  }
 }
 const trafficCoverage=allMeters>0?clamp(congestionMeters/distance*100,0,100):0;
 const typical=finite(raw.duration_typical)&&raw.duration_typical>0?raw.duration_typical:null;
 return {
  source:'mapbox-directions-annotations',
  segmentCount:totalParts,knownSegmentCount:knownParts,
  annotationCoveragePct:round(clamp(allMeters/distance*100,0,100)),
  congestionCoveragePct:round(trafficCoverage),
  durationCoveragePct:round(clamp(timeMeters/distance*100,0,100)),
  heavyDistanceKm:round(heavyMeters/1000,2),
  unknownDistanceKm:round(levelMeters.unknown/1000,2),
  segmentsKm:Object.fromEntries(Object.entries(levelMeters).map(([key,value])=>[key,round(value/1000,2)])),
  timeFromAnnotationsSeconds:timeMeters>0?round(annotationTime,1):null,
  timeVsRoutePct:timeMeters>0?round(annotationTime/seconds*100):null,
  durationTypicalSeconds:typical,
  // Only a provider-supplied baseline can justify computing traffic delay.
  trafficDelaySeconds:typical===null?null:round(seconds-typical),
  congestionHotspots:slowSegments.sort((a,b)=>
   (b.lengthKm||0)*(b.congestionScore??(b.congestion==='severe'?95:75))-
   (a.lengthKm||0)*(a.congestionScore??(a.congestion==='severe'?95:75))).slice(0,12)
 };
}
export function summarizeEtaRoute(route,{source='unknown',candidateEngine=null}={}){
 const exact=finite(route?.durationSeconds)&&route.durationSeconds>0?route.durationSeconds:
  finite(route?.duration)&&route.duration>0?route.duration*60:null;
 const km=finite(route?.distance)?route.distance:null;
 const profile=String(route?.routingProfile||route?.engineMetadata?.routingProfile||'unknown');
 const trafficDataStatus=route?.trafficDataStatus||'unverified';
 const evidence=route?.etaEvidence||null;
 const steps=(Array.isArray(route?.steps)?route.steps:[]).filter(s=>s&&
   finite(s.distance)&&s.distance>0).slice(0,300);
 const stepsMeters=steps.reduce((n,s)=>n+s.distance,0);
 const stepsSeconds=steps.reduce((n,s)=>n+(finite(s.duration)&&s.duration>=0?s.duration:0),0);
 const timedMeters=steps.reduce((n,s)=>n+(finite(s.duration)&&s.duration>=0?s.distance:0),0);
 const stepDistanceCoverage=km>0?round(clamp(stepsMeters/(km*1000)*100,0,100)):null;
 const timedStepCoverage=km>0?round(clamp(timedMeters/(km*1000)*100,0,100)):null;
 const warnings=[];
 if(trafficDataStatus!=='traffic-aware')warnings.push(trafficDataStatus==='degraded'
  ?'ETA veio de um perfil sem trânsito ao vivo confirmado.':'A origem do trânsito desta rota não foi comprovada.');
 if(!evidence)warnings.push('Não há anotações detalhadas de congestionamento disponíveis neste motor.');
 else{
  if(evidence.congestionCoveragePct<70)warnings.push('Cobertura de congestionamento inferior a 70% do percurso.');
  if(evidence.durationCoveragePct>85&&finite(evidence.timeVsRoutePct)&&
    Math.abs(evidence.timeVsRoutePct-100)>20)warnings.push('Soma das durações por segmento difere mais de 20% do ETA total.');
 }
 if(timedStepCoverage!==null&&timedStepCoverage<80)
  warnings.push('Cobertura de durações por manobra insuficiente para ETA restante por trechos.');
 const worstSteps=steps.filter(s=>finite(s.duration)&&s.duration>0)
  .map(s=>({street:String(s.street||s.name||s.instruction||'Trecho sem nome').slice(0,110),
   distanceKm:round(s.distance/1000,2),durationMin:round(s.duration/60,1),
   avgKmh:round(s.distance/s.duration*3.6)}))
  .sort((a,b)=>b.durationMin-a.durationMin).slice(0,15);
 return {
  id:String(route?.id||'unknown'),label:String(route?.label||'Rota'),
  etaMinutes:exact===null?null:round(exact/60,2),
  etaSeconds:exact,distanceKm:km,
  impliedSpeedKmh:exact>0&&km>0?round(km/exact*3600):null,
  source,provider:String(route?.routingProvider||route?.engineMetadata?.provider||candidateEngine?.provider||'unknown'),
  profile,trafficDataStatus,trafficScore:finite(route?.trafficScore)?route.trafficScore:null,
  sourceTime:finite(route?.etaUpdatedAt)?new Date(route.etaUpdatedAt).toISOString():null,
  microRoute:route?.microRoute===true,
  etaGainSeconds:finite(route?.etaGainSeconds)?route.etaGainSeconds:null,
  stepCount:steps.length,stepDistanceCoveragePct:stepDistanceCoverage,
  stepDurationCoveragePct:timedStepCoverage,stepSeconds:timedMeters>0?round(stepsSeconds):null,
  evidence,warnings,worstSteps
 };
}
export function etaConsoleReport(result,{elapsedMs=0,calculatedAt=new Date().toISOString()}={}){
 const routes=Array.isArray(result?.routes)?result.routes:[];
 const engine=result?.candidateEngine||{};
 return {ok:true,protocol:'vano-eta-console',version:1,calculatedAt,
  runtimeMs:round(elapsedMs,0),source:String(result?.source||'unknown'),
  engine:{profile:String(engine.provider||'unknown'),candidateCount:Number.isInteger(engine.candidateCount)?engine.candidateCount:routes.length,
   initialCandidates:Number.isInteger(engine.initialCandidates)?engine.initialCandidates:null,
   additionalRequests:Number.isInteger(engine.additionalRequests)?engine.additionalRequests:null,
   acceptedProbes:Number.isInteger(engine.acceptedProbes)?engine.acceptedProbes:null,
   urbanProbes:Number.isInteger(engine.urbanProbes)?engine.urbanProbes:null,
   urbanAccepted:Number.isInteger(engine.urbanAccepted)?engine.urbanAccepted:null,
   microRoutingActive:result?.microRoutingActive===true,distributedUsed:result?.distributedRoutingUsed===true,
   degraded:result?.degraded===true},
  routes:routes.map(route=>summarizeEtaRoute(route,{source:result?.source,candidateEngine:engine})),
  limitations:[
   'Congestionamento e velocidade média não comprovam o horário de chegada.',
   'Atraso devido ao trânsito só é exibido quando existe duração típica informada pelo provedor.',
   'Este teste não lê nem armazena GPS ou histórico de outros usuários.'
  ]};
}
