/**
 * Scheduled VANO-only public route measurements.
 * Compare the fastest reference with the safe alternative from ONE actual
 * route-provider response. No customer trips, Google content or fake samples.
 */
import {summarizeBenchmark} from './benchmark.mjs';

export const SCHEDULED_PUBLIC_ROUTES = Object.freeze([
  {id:'marginal-pinheiros',category:'congestionamento',origin:{label:'Shopping Morumbi',coords:[-46.69926,-23.62229]},destination:{label:'Shopping Eldorado',coords:[-46.69502,-23.57296]}},
  {id:'marginal-tiete',category:'congestionamento',origin:{label:'Terminal Rodoviário Tietê',coords:[-46.6232,-23.51667]},destination:{label:'Shopping Tietê Plaza',coords:[-46.7175,-23.5081]}},
  {id:'vinte-e-tres-de-maio',category:'avenidas',origin:{label:'Aeroporto de Congonhas',coords:[-46.6566,-23.6263]},destination:{label:'Praça da Bandeira',coords:[-46.6383,-23.5487]}},
  {id:'radial-leste',category:'congestionamento',origin:{label:'Neo Química Arena',coords:[-46.4745,-23.54535]},destination:{label:'Praça da Sé',coords:[-46.6341,-23.5504]}}
]);
export const BENCHMARK_HOURS=new Set([8,9,10,16,17,18]);
export const BENCHMARK_TIMEZONE='America/Sao_Paulo';
const slotFormat=new Intl.DateTimeFormat('en-US',{timeZone:BENCHMARK_TIMEZONE,hour12:false,
  hourCycle:'h23',hour:'2-digit',minute:'2-digit',year:'numeric',month:'2-digit',day:'2-digit'});

export function scheduledBenchmarkSlot(date=new Date()){
  const p=Object.fromEntries(slotFormat.formatToParts(date).map(x=>[x.type,x.value]));
  return {hour:Number(p.hour),minute:Number(p.minute),key:p.year+p.month+p.day+'T'+p.hour};
}
export function scheduledBenchmarkId(slot,routeId){
  return 'auto-'+slot+'-'+routeId;
}
export function scheduledBenchmarkRecord({scenario,result,slot,measuredAt,latencyMs}){
  if(!scenario||!result||result.source==='demonstracao')return null;
  const base={
    origin:scenario.origin.coords,destination:scenario.destination.coords,
    profile:'driving',variantBudget:2,adaptive:false,include_geometry:false,directDistanceKm:1
  };
  const opts={elapsedMs:latencyMs,generatedAt:measuredAt};
  const reference=summarizeBenchmark(result,{...base,mode:'fastest',routeId:'fast'},opts);
  const alternative=summarizeBenchmark(result,{...base,mode:'safest',routeId:'safe'},opts);
  if(reference.error||alternative.error||reference.metrics.degraded||alternative.metrics.degraded)return null;
  const ref=reference.metrics,other=alternative.metrics;
  if(ref.provider==='unknown'||other.provider==='unknown')return null;
  return {
    id:scheduledBenchmarkId(slot,scenario.id),published:true,publicPlacesOnly:true,
    measuredAt,origin:scenario.origin.label,destination:scenario.destination.label,
    category:scenario.category,profile:'driving',
    reference:{source:'vano_fastest',measuredAt,etaMin:ref.etaMin,distanceKm:ref.distanceKm,
      routeId:ref.selectedRouteId},
    vano:{mode:'safest',measuredAt,etaMin:other.etaMin,distanceKm:other.distanceKm,
      routeId:other.selectedRouteId,provider:other.provider,latencyMs:other.serverLatencyMs,
      trafficScore:other.trafficScore,safetyScore:other.safetyScore}
  };
}
/** Runs on the ONE persistent web instance; idempotent across restarts via IDs. */
export function startScheduledPublicBenchmarks({db,persist,directions,logger=console,now=()=>new Date(),
  pollMs=30000,enabled=true}){
  if(!enabled||!Array.isArray(db?.benchmarkResults))return {stop(){}};
  let busy=false,lastAttempt=null;
  async function tick(){
    const date=now(),slot=scheduledBenchmarkSlot(date);
    if(!BENCHMARK_HOURS.has(slot.hour)||slot.minute>9||busy||lastAttempt===slot.key)return;
    // A run is deliberately one-shot per local wall-clock slot. Never overlap.
    busy=true;lastAttempt=slot.key;
    try{
      for(const scenario of SCHEDULED_PUBLIC_ROUTES){
        const id=scheduledBenchmarkId(slot.key,scenario.id);
        if(db.benchmarkResults.some(x=>x.id===id))continue;
        try{
          const started=performance.now();
          const result=await directions(scenario.origin.coords,scenario.destination.coords,'carro',{},'pt-BR',
            {adaptive:false,variantBudget:2,skipCandidateProbes:true,safeComparison:false,includeAdvanced:false});
          const at=now().toISOString();
          const record=scheduledBenchmarkRecord({scenario,result,slot:slot.key,measuredAt:at,
            latencyMs:performance.now()-started});
          if(!record){
            logger.warn('[VANO benchmark] real fast/safe pair unavailable:',scenario.id);
            continue;
          }
          const prior=db.benchmarkResults;
          // Keep 75 days or fewer, under the public validator's 2,000-row limit.
          db.benchmarkResults=[...prior.filter(x=>x.id!==id),record].slice(-1800);
          try{
            await persist({backup:false});
            logger.info('[VANO benchmark] published:',id);
          }catch(e){
            db.benchmarkResults=prior;
            logger.warn('[VANO benchmark] storage unavailable:',scenario.id);
          }
        }catch(e){logger.warn('[VANO benchmark] calculation failed:',scenario.id);}
      }
    }finally{busy=false;}
  }
  // Startup recovery only inside the first ten minutes of a configured slot.
  const ready=tick().catch(()=>logger.warn('[VANO benchmark] scheduler tick failed.'));
  const timer=setInterval(()=>{void tick().catch(()=>logger.warn('[VANO benchmark] scheduler tick failed.'));},pollMs);
  timer.unref?.();
  return {stop(){clearInterval(timer);},runCheck:tick,ready};
}
