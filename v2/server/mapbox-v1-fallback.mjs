/** V1 candidate-generation order for V2 when its original Python service is absent.
 * Provider ETA wins. This deliberately does NOT port or imitate V1 safety evidence.
 */
import {pointOK} from './routing.mjs';
import {adaptiveSpecs,denseSpecs,overlap,traffic,uniqueCandidates,signature} from './v1-candidates.mjs';
import {mapboxEtaEvidence} from './route-eta-diagnostics.mjs';
import {blockExploreSpecs,validExploredVariant} from './urban-route-exploration.mjs';

const cache=new Map(), CACHE_TTL=15000,MAX_CACHE=48;
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
      if(opts.reroute===true)u.searchParams.set('avoid_maneuver_radius',String(Math.round(Math.max(45,Math.min(160,45+telemetry.speed*7)))));
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
async function probeGroup(origin,destination,access,language,vehicle,telemetry,options,specs,fetcher,baseline,kind){
  const results=[],concurrency=kind==='urban'?2:4;
  for(let i=0;i<specs.length;i+=concurrency){
    const batch=specs.slice(i,i+concurrency);
    const found=await Promise.all(batch.map(async spec=>{
      try{
        const url=mapboxDirectionsUrl(origin,destination,access,language,vehicle,telemetry,options,{...spec,alternatives:false});
        const r=(await request(url,fetcher,kind==='urban'?5500:9500))[0];
        if(!r||r.duration>baseline.duration*(kind==='adaptive'?1.70:1.48))return null;
        if(kind==='urban'){
          if(!validExploredVariant(r,baseline,results))return null;
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
    let pool=uniqueCandidates(initial),probeCount=0,probeSuccess=0,urbanProbes=0,urbanAccepted=0;
    const baseline=pool[0];
    if(usedProfile==='driving-traffic'&&options.skipCandidateProbes!==true&&options.reroute!==true){
      const providerBudget=options.routeDiagnostics===true?9:Math.max(3,Math.min(6,(options.variantBudget||4)+1));
      if(options.adaptive!==false){
        const specs=adaptiveSpecs(pool,Math.min(2,options.variantBudget||4));
        if(specs.length){const limited=specs.slice(0,Math.max(0,providerBudget-probeCount));probeCount+=limited.length;
          const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,options,limited,fetcher,baseline,'adaptive');
          probeSuccess+=extra.length;pool=uniqueCandidates([...pool,...extra]);
        }
      }
      const specs=denseSpecs(pool,Math.min(8,(options.variantBudget||4)+2));
      if(specs.length){const limited=specs.slice(0,Math.max(0,providerBudget-probeCount));probeCount+=limited.length;
        const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,options,limited,fetcher,baseline,'micro');
        probeSuccess+=extra.length;pool=uniqueCandidates([...pool,...extra]);
      }
      // Mapbox alternatives and traffic-only micro-probes can both return
      // just one path during apparently light traffic. Explore a few distinct
      // provider-validated block corridors instead of taking "low" at face value.
      if(options.adaptive!==false&&probeCount<providerBudget&&pool.length<6){
        const proposals=blockExploreSpecs(pool,Math.min(options.routeDiagnostics===true?5:3,providerBudget-probeCount));
        urbanProbes=proposals.length;probeCount+=urbanProbes;
        if(urbanProbes){
          const extra=await probeGroup(origin,destination,token,language,vehicle,telemetry,options,proposals,fetcher,baseline,'urban');
          const previous=pool.length;
          pool=uniqueCandidates([...pool,...extra]);
          urbanAccepted=Math.max(0,pool.length-previous);
          probeSuccess+=urbanAccepted;
        }
      }
    }
    const fastest=pool[0];
    // The other route remains an alternative, NOT a verified safety assessment.
    const other=pool.find(r=>r!==fastest&&overlap(r,fastest)<.985)||pool.find(r=>r!==fastest)||fastest;
    const candidates=pool.slice(0,6).map(r=>({durationSeconds:r.duration,distanceMeters:r.distance,
      signature:signature(r),microRoute:r._microRoute===true,microStrategy:r._microStrategy||'',
      etaGainSeconds:r._etaGainSeconds||0}));
    return {routes:[present(other,'safe',options.routeDiagnostics===true),present(fastest,'fast',options.routeDiagnostics===true)].map(r=>({...r,
      routingProfile:usedProfile,
      trafficDataStatus:usedProfile==='driving-traffic'?'traffic-aware':'degraded',
      etaUpdatedAt:Date.now()})),
      // Internal-only candidate pool; returned to callers only on safe-comparison requests.
      ...(options.safeComparison===true?{safeCandidatePool:pool.slice(0,10).map((r,i)=>present(r,'safe-candidate-'+i))}:{}),
      source:'mapbox-v1-candidates',microRoutingActive:pool.some(r=>r._microRoute),urbanExplorationActive:urbanProbes>0,
      safetyMessage:'Rota rápida selecionada pelo menor ETA do provedor após avaliar alternativas e micro-desvios. A outra rota é uma alternativa sem avaliação de segurança verificada.',
      candidateEngine:{version:'v1-eta-candidate-port',provider:usedProfile,
        initialCandidates:initial.length,candidateCount:pool.length,additionalRequests:probeCount,
        acceptedProbes:probeSuccess,urbanProbes,urbanAccepted,trafficScore:Math.round(traffic(baseline).score),candidates,
        pipeline:['traffic-alternatives','adaptive-if-needed','congestion-block-probes','independent-urban-corridors','exact-deduplication','minimum-provider-eta']}};
  }
  const work=compute();
  cache.set(key,{expires:Date.now()+CACHE_TTL,work});
  if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  try{return clone(await work);}catch(e){if(cache.get(key)?.work===work)cache.delete(key);throw e;}
}
