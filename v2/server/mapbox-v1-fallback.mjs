/** V1 candidate-generation order for V2 when its original Python service is absent.
 * Provider ETA wins. This deliberately does NOT port or imitate V1 safety evidence.
 */
import {pointOK} from './routing.mjs';
import {adaptiveSpecs,denseSpecs,overlap,traffic,uniqueCandidates,signature} from './v1-candidates.mjs';
import {mapboxEtaEvidence} from './route-eta-diagnostics.mjs';
import {blockExploreSpecs,validExploredVariant,chooseStableFastRoute,hasProviderRouteViolation} from './urban-route-exploration.mjs';
import {bottleneckDetourSpecs,candidateUsesForbiddenCorridor,trafficCorridors,hasTrafficEvidence} from './congestion-bottlenecks.mjs';

const cache=new Map(), CACHE_TTL=15000,MAX_CACHE=48;
// Per-instance budget is intentionally below Mapbox's provider-wide ceiling.
// Under load, optional exploration is skipped; baseline traffic route survives.
const EXTRA_PROVIDER_CALLS_PER_MINUTE=120;
let extraCallsWindow=0,extraCallsCount=0;
function acquireExtraCall(){
 const t=Date.now();
 if(t-extraCallsWindow>=60000){extraCallsWindow=t;extraCallsCount=0;}
 if(extraCallsCount>=EXTRA_PROVIDER_CALLS_PER_MINUTE)return false;
 extraCallsCount++;return true;
}
const clone=x=>structuredClone(x);
const numeric=x=>Number.isFinite(x)&&x>0;
const vehicleKind=x=>x==='moto'?'moto':'carro';
export function mapboxDirectionsUrl(origin,destination,access,language,vehicle,telemetry={},opts={},spec={},profile='driving-traffic'){
  if(!pointOK(origin)||!pointOK(destination)||!access)throw Error('Origem, destino ou token de rota inválidos.');
  const u=new URL('https://api.mapbox.com/directions/v5/mapbox/'+profile+'/'+origin.join(',')+';'+destination.join(','));
  for(const [key,value] of Object.entries({
    alternatives:spec.alternatives===false?'false':'true',
    geometries:'geojson',overview:'full',steps:'true',
    banner_instructions:'true',voice_instructions:'true',voice_units:'metric',
    language,annotations:profile==='driving-traffic'
      ?'distance,duration,speed,congestion,congestion_numeric,maxspeed,closure'
      :'distance,duration,speed,maxspeed',
    access_token:access
  }))u.searchParams.set(key,String(value));
  if(profile==='driving-traffic'){
    u.searchParams.set('notifications','all');
    if(opts.departAt&&opts.departAt!=='now'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/.test(opts.departAt))u.searchParams.set('depart_at',opts.departAt.slice(0,28));
    if(numeric(telemetry.speed)&&telemetry.speed>=1.2&&Number.isFinite(telemetry.bearing)&&telemetry.bearing>=0&&telemetry.bearing<360){
      u.searchParams.set('bearings',Math.round(telemetry.bearing)+',70;');
      u.searchParams.set('continue_straight','true');
      // Mapbox rejects avoid_maneuver_radius with future depart_at.
      if(opts.reroute===true&&(!opts.departAt||opts.departAt==='now'))
        u.searchParams.set('avoid_maneuver_radius',String(Math.round(Math.max(45,Math.min(160,45+telemetry.speed*7)))));
    }
  }
  const excluded=[];
  if(opts.avoidTolls)excluded.push('toll');
  if(opts.avoidFerries)excluded.push('ferry');
  if(opts.avoidUnpaved||vehicleKind(vehicle)==='moto')excluded.push('unpaved');
  for(const p of (spec.points||[]).slice(0,18))if(pointOK(p))excluded.push('point('+p[0].toFixed(6)+' '+p[1].toFixed(6)+')');
  // Named-street exclusions are supplied only by the server from the current
  // provider route geometry. Mapbox point exclusions are best-effort, so the
  // assistant must independently verify road names before claiming success.
  for(const p of (opts.excludeRoadPoints||[]).slice(0,5))if(pointOK(p))excluded.push('point('+p[0].toFixed(6)+' '+p[1].toFixed(6)+')');
  if(excluded.length)u.searchParams.set('exclude',excluded.join(','));
  return u;
}
function stepsOf(route){
  return (route.legs||[]).flatMap(l=>(l.steps||[]).map(s=>({
    instruction:s.maneuver?.instruction||s.name||'Siga em frente',distance:s.distance,
    duration:Number.isFinite(s.duration)&&s.duration>=0?s.duration:null,
    location:s.maneuver?.location,modifier:s.maneuver?.modifier||'straight',
    type:s.maneuver?.type||'',street:s.name||'',
    lanes:(s.intersections||[]).find(i=>Array.isArray(i.lanes))?.lanes?.slice(0,8).map(x=>({valid:x.valid===true,indications:Array.isArray(x.indications)?x.indications.slice(0,4):[]}))||[]
  }))).slice(0,700);
}
/** Mapbox maxspeed annotations are aligned to each pair of route geometry
 * coordinates. Unknown/advisory-free segments remain null, never estimated. */
export function routePostedSpeedLimits(route){
 const coords=route?.geometry?.coordinates,legs=route?.legs;
 if(!Array.isArray(coords)||coords.length<2||coords.length>16000||
    !Array.isArray(legs)||legs.length!==1)return null;
 const entries=legs[0]?.annotation?.maxspeed;
 if(!Array.isArray(entries)||entries.length!==coords.length-1)return null;
 const values=entries.map(entry=>{
   if(!entry||entry.unknown===true||entry.none===true)return null;
   const speed=entry.speed,unit=entry.unit;
   if(typeof speed!=='number'||!Number.isFinite(speed)||speed<5||speed>160)return null;
   const kmh=unit==='km/h'?speed:unit==='mph'?speed*1.609344:null;
   return kmh!==null&&kmh>=10&&kmh<=160?Math.round(kmh):null;
 });
 return values.some(value=>value!==null)?values:null;
}

function present(route,id,diagnostics=false){
  return {id,label:id==='fast'?'Mais rápida':'Mais segura',
    duration:Math.max(1,Math.round(route.duration/60)),
    durationSeconds:route.duration,
    distance:Math.round(route.distance/100)/10,
    geometry:route.geometry,steps:stepsOf(route),speedLimits:routePostedSpeedLimits(route),verifiedSafety:false,
    microRoute:route._microRoute===true,microStrategy:route._microStrategy||'',
    etaGainSeconds:route._etaGainSeconds||0,
    trafficScore:Math.round(traffic(route).score*10)/10,
    // Both values are Mapbox provider ETAs; typical is NOT a measurement from the CEM street inventory.
    ...(Number.isFinite(route.duration_typical)&&route.duration_typical>0&&route.duration_typical<86400
      ?{durationTypicalSeconds:route.duration_typical,trafficVsTypicalSeconds:Math.round(route.duration-route.duration_typical)}:{}),
    routingProvider:route._provider||'mapbox',
    ...(diagnostics?{etaEvidence:mapboxEtaEvidence(route)}:{})};
}
async function request(url,fetcher,timeoutMs){
  const r=await fetcher(url,{signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Mapbox HTTP '+r.status);
  const body=await r.json();
  if(body.code&&body.code!=='Ok')throw Error('Mapbox '+body.code);
  const routes=uniqueCandidates(body.routes);
  if(!routes.length)throw Error('Mapbox não retornou rotas válidas.');
  return routes;
}
async function probeGroup(origin,destination,access,language,vehicle,telemetry,options,specs,fetcher,baseline,kind,existingRoutes=[],audit=null){
  const results=[],concurrency=4;
  for(let i=0;i<specs.length;i+=concurrency){
    const batch=specs.slice(i,i+concurrency);
    const found=await Promise.all(batch.map(async spec=>{
      try{
        if(!acquireExtraCall()){if(audit)audit.throttled++;return null;}
        if(audit){audit.sent++;if(kind==='urban')audit.urbanSent++;}
        const url=mapboxDirectionsUrl(origin,destination,access,language,vehicle,telemetry,options,{...spec,alternatives:false});
        const r=(await request(url,fetcher,kind==='urban'?3500:9500))[0];
        if(!r||r.duration>baseline.duration*(kind==='adaptive'?1.70:1.48)||
           hasProviderRouteViolation(r))return null;
        if(kind==='bottleneck'){
          // Provider point exclusions are best effort. Independently reject
          // any route that still intersects the full guarded 500m corridor.
          if(!spec.forbiddenCorridor||candidateUsesForbiddenCorridor(r,spec.forbiddenCorridor))return null;
          // Unknown traffic readings cannot be described as traffic-free.
          if(!hasTrafficEvidence(r)||trafficCorridors(r,{marginMeters:0}).length)return null;
          const gain=baseline.duration-r.duration;
          if(gain<Math.max(20,baseline.duration*.015)||overlap(r,baseline)>=.985||
             [...existingRoutes,...results].some(existing=>signature(existing)===signature(r)))return null;
          r._bottleneckVariant=true;r._microRoute=true;
          r._microStrategy='bottleneck-corridor-500m';r._etaGainSeconds=Math.round(gain*10)/10;
          return r;
        }
        if(kind==='seed'){
          if(overlap(r,baseline)>=.985||[...existingRoutes,...results].some(x=>overlap(x,r)>=.96))return null;
          r._seedVariant=true;
          return r;
        }
        if(kind==='urban'){
          if(!validExploredVariant(r,baseline,[...existingRoutes,...results]))return null;
          r._urbanVariant=true;
          r._microStrategy='urban-corridor-exclusion';
          const gain=baseline.duration-r.duration;
          if(gain>=12){
            r._microRoute=true;
            r._etaGainSeconds=Math.round(gain*10)/10;
          }
          return r;
        }
        if(kind==='adaptive'){
          if(overlap(r,baseline)>=.91)return null;
          r._adaptiveVariant=true;return r;
        }
        const minGain=baseline.duration>=1200?30:baseline.duration>=600?20:12;
        const gain=baseline.duration-r.duration;
        if(gain<minGain)return null;
        r._microRoute=true;r._microStrategy=spec.kind;r._etaGainSeconds=Math.round(gain*10)/10;
        return r;
      }catch{return null;} // Probe failure must never remove a valid base route.
    }));
    results.push(...found.filter(Boolean));
  }
  return results;
}
export async function calculateMapboxV1Candidates(origin,destination,vehicle,telemetry,language,options,token,fetcher=fetch){
  const key=JSON.stringify({origin:origin.map(x=>+x.toFixed(5)),destination:destination.map(x=>+x.toFixed(5)),
    vehicle,telemetry:telemetry?.speed>=1.2?{bearing:Math.round(telemetry.bearing||0),speed:Math.round(telemetry.speed)}:{},
    language,options,tokenHash:token.length+':'+token.slice(-5)});
  const existing=cache.get(key);
  if(existing&&existing.expires>Date.now())return clone(await existing.work);
  async function compute(){
    const primaryUrl=mapboxDirectionsUrl(origin,destination,token,language,vehicle,telemetry,options);
    let initial,usedProfile='driving-traffic';
    try{initial=await request(primaryUrl,fetcher,options.reroute===true?5500:12500);}
    catch(error){
      // V1 also falls back from driving-traffic to ordinary driving; no traffic claim.
      usedProfile='driving';
      const fallback=mapboxDirectionsUrl(origin,destination,token,language,vehicle,telemetry,options,{},usedProfile);
      initial=await request(fallback,fetcher,options.reroute===true?5500:12500);
    }
    let pool=uniqueCandidates(initial,24),probeCount=0,probeSuccess=0,urbanProbes=0,urbanAccepted=0;
    let bottleneckProbes=0,bottleneckAccepted=0,bottleneckImproved=false,seedRequests=0;
    const probeAudit={sent:0,urbanSent:0,throttled:0};
    const originalBest=chooseStableFastRoute(initial,initial[0]);
    const baseline=pool[0];
    if(usedProfile==='driving-traffic'&&options.skipCandidateProbes!==true&&options.reroute!==true){
      // A maximum of 20 provider route queries, never 20 hand-drawn roads.
      // Short trips explore fewer streets to prevent latency and quota bursts.
      const explorationBudget=baseline.distance>=5000?20:baseline.distance>=2800?10:baseline.distance>=1350?5:0;
      const maxQueries=options.adaptive===false?Math.min(4,explorationBudget):
        (explorationBudget||((traffic(baseline).score>=34||traffic(baseline).severe>0)?
          Math.min(4,options.variantBudget||4):0));
      // Ask the provider for up to FIVE distinct initial A->B candidates,
      // including its initial alternatives. Leave capacity for corridor evasion.
      if(options.bottleneckRouting===true&&options.adaptive!==false&&
          vehicle==='carro'&&maxQueries>4&&pool.length<5){
        const allowance=Math.min(5-pool.length,maxQueries-4);
        const seeds=blockExploreSpecs(pool,allowance,{phase:1});
        if(seeds.length){
          seedRequests=seeds.length;probeCount+=seeds.length;
          const found=await probeGroup(origin,destination,token,language,vehicle,telemetry,
            options,seeds,fetcher,baseline,'seed',pool,probeAudit);
          const old=pool.length;pool=uniqueCandidates([...pool,...found],24);
          probeSuccess+=Math.max(0,pool.length-old);
        }
      }
      // Mark the ENTIRE congested corridor, 500m before and after, before
      // exploratory neighborhood probes. This path is car/V2/initial-only.
      if(options.bottleneckRouting===true&&options.adaptive!==false&&
          vehicle==='carro'&&maxQueries-probeCount>0){
        const focused=bottleneckDetourSpecs(pool,Math.min(4,maxQueries-probeCount));
        if(focused.length){
          probeCount+=focused.length;
          const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,
            options,focused,fetcher,baseline,'bottleneck',pool,probeAudit);
          bottleneckProbes=focused.length;bottleneckAccepted=extra.length;
          const before=pool.length;pool=uniqueCandidates([...pool,...extra],24);
          probeSuccess+=Math.max(0,pool.length-before);
          // If a focused search found a meaningful speedup, spare provider quota
          // and avoid delaying the navigation UI with exploratory probes.
          bottleneckImproved=pool.some(r=>r._bottleneckVariant===true&&
            r.duration<=baseline.duration-Math.max(25,Math.min(90,baseline.duration*.025)));
        }
      }
      const firstSpecs=bottleneckImproved||options.adaptive===false?[]:
        blockExploreSpecs(pool,Math.min(10,Math.max(0,maxQueries-probeCount)),{phase:1});
      if(firstSpecs.length){
        urbanProbes+=firstSpecs.length;probeCount+=firstSpecs.length;
        const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,
          options,firstSpecs,fetcher,baseline,'urban',pool,probeAudit);
        const originalLength=pool.length;
        pool=uniqueCandidates([...pool,...extra],24);
        const added=Math.max(0,pool.length-originalLength);
        urbanAccepted+=added;probeSuccess+=added;
      }
      const remaining=()=>Math.max(0,maxQueries-probeCount);
      // Existing traffic-triggered probes still run where congestion warrants.
      if(!bottleneckImproved&&options.adaptive!==false&&remaining()>0){
        const specs=adaptiveSpecs(pool,Math.min(2,remaining()));
        const limited=specs.slice(0,remaining());
        if(limited.length){
          probeCount+=limited.length;
          const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,
            options,limited,fetcher,baseline,'adaptive',[],probeAudit);
          const before=pool.length;pool=uniqueCandidates([...pool,...extra],24);
          probeSuccess+=Math.max(0,pool.length-before);
        }
      }
      if(!bottleneckImproved&&remaining()>0){
        const specs=denseSpecs(pool,Math.min(8,remaining())).slice(0,remaining());
        if(specs.length){
          probeCount+=specs.length;
          const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,
            options,specs,fetcher,baseline,'micro',[],probeAudit);
          const before=pool.length;pool=uniqueCandidates([...pool,...extra],24);
          probeSuccess+=Math.max(0,pool.length-before);
        }
      }
      // Second wave: inspect REAL nearby branches discovered in phase one,
      // plus paired block exclusions where no side corridor was returned.
      if(!bottleneckImproved&&options.adaptive!==false&&remaining()>0){
        const lateral=[baseline,...pool.filter(r=>r!==baseline)];
        const specs=blockExploreSpecs(lateral,remaining(),{phase:2,seen:firstSpecs});
        if(specs.length){
          urbanProbes+=specs.length;probeCount+=specs.length;
          const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,
            options,specs,fetcher,baseline,'urban',pool,probeAudit);
          const before=pool.length;pool=uniqueCandidates([...pool,...extra],24);
          const added=Math.max(0,pool.length-before);
          urbanAccepted+=added;probeSuccess+=added;
        }
      }
    }
    // Never show a provider-declared violation even as the secondary route.
    // No street-name list can override a provider's legally routable geometry.
    const compliantPool=pool.filter(r=>!hasProviderRouteViolation(r));
    if(!compliantPool.length)throw Error('Mapbox não retornou rota sem restrição de acesso.');
    const restrictedRejected=pool.length-compliantPool.length;
    pool=compliantPool;
    // Fast compares real provider ETA only after excluding explicit access violations.
    // The CEM road catalog has no licensed per-direction speeds to add here.
    const fastest=chooseStableFastRoute(pool)||pool[0];

    // The other route remains an alternative, NOT a verified safety assessment.
    // Bottleneck exploration improves ONLY the fast option; it does not
    // silently redefine the independent, not-yet-verified safe alternative.
    const safePool=pool.filter(r=>!r._bottleneckVariant);
    const other=safePool.find(r=>r!==fastest&&r.duration>=fastest.duration&&overlap(r,fastest)<.985)||
      safePool.find(r=>r!==fastest&&r.duration>=fastest.duration)||
      safePool.find(r=>r!==fastest)||fastest;
    const candidates=pool.slice(0,20).map(r=>({durationSeconds:r.duration,distanceMeters:r.distance,
      signature:signature(r),microRoute:r._microRoute===true,microStrategy:r._microStrategy||'',
      etaGainSeconds:r._etaGainSeconds||0}));
    return {routes:[present(other,'safe',options.routeDiagnostics===true),present(fastest,'fast',options.routeDiagnostics===true)].map(r=>({...r,
      routingProfile:usedProfile,
      trafficDataStatus:usedProfile==='driving-traffic'?'traffic-aware':'degraded',
      etaUpdatedAt:Date.now()})),
      // Internal-only candidate pool; returned to callers only on safe-comparison requests.
      ...(options.safeComparison===true?{safeCandidatePool:pool.slice(0,10).map((r,i)=>present(r,'safe-candidate-'+i))}:{}),
      source:'mapbox-v1-candidates',microRoutingActive:pool.some(r=>r._microRoute),urbanExplorationActive:probeAudit.urbanSent>0,
      safetyMessage:'Rota mais rápida baseada no ETA informado pelo provedor, com empate técnico máximo de 5 segundos para trajeto consideravelmente mais curto. A outra rota é alternativa, sem segurança superior comprovada.',
      candidateEngine:{version:'v1-eta-candidate-port',provider:usedProfile,
        fastestPolicy:'provider-traffic-ETA; reject provider-flagged violations; no unverified CEM speed penalty',
        initialCandidates:initial.length,candidateCount:pool.length,additionalRequests:probeAudit.sent,plannedExtraRequests:probeCount,throttledRequests:probeAudit.throttled,
        acceptedProbes:probeSuccess,urbanProbes:probeAudit.urbanSent,urbanAccepted,
        bottleneckProbes,bottleneckAccepted,bottleneckImproved,seedRequests,
        corridorMarginBeforeMeters:500,corridorMarginAfterMeters:500,
        verifiedCorridorAvoidance:fastest._bottleneckVariant===true,
        rejectedProviderViolations:restrictedRejected,
        searchZones:['inicio','meio','fim'],searchLimit:20,providerRouteCount:pool.length,
        technicalEtaTieSeconds:5,minimumSwitchSavingsSeconds:5,
        stableChoiceDurationSeconds:fastest.duration,originalChoiceDurationSeconds:originalBest.duration,
        trafficScore:Math.round(traffic(baseline).score),candidates,
        pipeline:['traffic-alternatives',...(options.bottleneckRouting===true?['five-initial-provider-candidates','priority-bottleneck-detours','500m-before-after-corridor-validation']:[]),'beginning-middle-end-blocks','traffic-aware-probes','lateral-branches-and-paired-blocks','geometric-deduplication','provider-eta-first-5s-technical-tie']}};
  }
  const work=compute();
  cache.set(key,{expires:Date.now()+CACHE_TTL,work});
  if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  try{return clone(await work);}catch(e){if(cache.get(key)?.work===work)cache.delete(key);throw e;}
}
