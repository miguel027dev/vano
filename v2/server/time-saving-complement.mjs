/** Experimental complement. Raw provider routes: duration seconds, distance metres.
 * Does not change the published selector or infer roads, speeds or safety.
 */
import {createHash} from 'node:crypto';
import {pointOK} from './routing.mjs';
import {meters} from './v1-candidates.mjs';

export const TIME_SAVING_POLICY=Object.freeze({maxProbes:4,concurrency:2,deadlineMs:2500,
  maxSnapshotAgeMs:120000,minGainSeconds:90,minGainRatio:.04,maxExtraDistanceRatio:.25,
  minExtraDistanceAllowanceM:500,maxExtraDistanceM:5000,rerouteCooldownMs:90000,
  maneuverGuardM:250,maxEndpointDriftM:150});
const validRoute=r=>r?.geometry?.type==='LineString'&&Array.isArray(r.geometry.coordinates)
  &&r.geometry.coordinates.length>=2&&r.geometry.coordinates.length<=100000
  &&r.geometry.coordinates.every(pointOK)&&Number.isFinite(r.duration)&&r.duration>0
  &&Number.isFinite(r.distance)&&r.distance>0;
export function fullRouteSignature(route){
  if(!validRoute(route))return '';
  return createHash('sha256').update(JSON.stringify(route.geometry.coordinates)).digest('hex');
}
export function exactRoutePool(routes){
  const pool=new Map();
  for(const route of routes||[]){const key=fullRouteSignature(route);if(!key)continue;
    if(!pool.has(key)||route.duration<pool.get(key).duration)pool.set(key,route);}
  return [...pool.values()].sort((a,b)=>a.duration-b.duration);
}
function pointAt(coords,cumulative,at){
  let left=1,right=coords.length-1;
  while(left<right){const middle=(left+right)>>1;if(cumulative[middle]<at)left=middle+1;else right=middle;}
  const previous=left-1,fraction=Math.max(0,Math.min(1,(at-cumulative[previous])/Math.max(.001,cumulative[left]-cumulative[previous])));
  return coords[previous].map((value,i)=>value+(coords[left][i]-value)*fraction);
}
/** Prioritise measured excess over typical when available. Otherwise use time
 * exposed to congestion, explicitly a search heuristic, never a new ETA.
 */
export function delayTargets(route){
  if(!validRoute(route))return [];
  const measured=[];
  for(const leg of route.legs||[])for(const step of leg.steps||[]){
    if(Number.isFinite(step.duration)&&Number.isFinite(step.duration_typical)&&step.duration_typical>0
      &&step.duration-step.duration_typical>=20&&pointOK(step.maneuver?.location)){
      measured.push({point:step.maneuver.location,prioritySeconds:step.duration-step.duration_typical,
        evidence:'excess-over-typical'});
    }
  }
  if(measured.length)return measured.sort((a,b)=>b.prioritySeconds-a.prioritySeconds);
  const coords=route.geometry.coordinates,cumulative=[0];
  for(let i=1;i<coords.length;i++)cumulative.push(cumulative[i-1]+meters(coords[i-1],coords[i]));
  const totalGeometry=cumulative.at(-1),edges=[];let at=0;
  for(const leg of route.legs||[]){const ann=leg.annotation||{};
    for(let i=0;i<(ann.distance||[]).length;i++){
      const distance=ann.distance[i],duration=ann.duration?.[i],numeric=ann.congestion_numeric?.[i];
      const score=Number.isFinite(numeric)&&numeric>=0?Math.min(100,numeric):({moderate:48,heavy:76,severe:94}[ann.congestion?.[i]]??null);
      if(!Number.isFinite(distance)||distance<=0)return []; // Cannot align invalid annotations.
      if(score!==null&&score>=48&&Number.isFinite(duration)&&duration>0)edges.push({start:at,end:at+distance,prioritySeconds:duration*score/100});
      at+=distance;
    }
  }
  if(!at||!totalGeometry)return [];
  const clusters=[];
  for(const edge of edges){const last=clusters.at(-1);
    if(last&&edge.start-last.end<=120){last.end=edge.end;last.prioritySeconds+=edge.prioritySeconds;}
    else clusters.push({...edge});}
  return clusters.map(c=>({...c,point:pointAt(coords,cumulative,(c.start+c.end)/2/at*totalGeometry),evidence:'congestion-time-exposure'}))
    .sort((a,b)=>b.prioritySeconds-a.prioritySeconds);
}
export function exclusionKey(points){return [...points].map(p=>p.map(n=>n.toFixed(6)).join(',')).sort().join('|');}
/** Round-robin across corridor, single block and separated bottleneck strategies.
 * Provider supplies every tested detour; exclusions never create geometry.
 */
export function complementarySpecs(routes,{maxProbes=4,existingSpecs=[],origin,destination}={}){
  const base=exactRoutePool(routes)[0];if(!base||base.duration<300)return [];
  const targets=delayTargets(base).filter(t=>(!pointOK(origin)||meters(t.point,origin)>250)
    &&(!pointOK(destination)||meters(t.point,destination)>250)).slice(0,6);
  if(!targets.length)return [];
  const families=[[],targets.map(t=>({points:[t.point],kind:'time-priority-block'})),[]];
  for(let i=0;i<targets.length-1;i++)families[0].push({points:[targets[i].point,targets[i+1].point],kind:'time-priority-pair'});
  for(let i=0;i<targets.length-2;i++)families[2].push({points:[targets[i].point,targets[i+2].point],kind:'time-priority-separated'});
  const seen=new Set(existingSpecs.map(s=>exclusionKey(s.points||[]))),result=[];
  for(let row=0;row<targets.length&&result.length<Math.min(4,Math.max(0,maxProbes));row++)for(const family of families){
    const spec=family[row];if(!spec)continue;
    if(spec.points.length>1&&meters(spec.points[0],spec.points[1])<55)continue;
    const key=exclusionKey(spec.points);if(seen.has(key))continue;seen.add(key);
    result.push({...spec,evidence:targets[0].evidence});
    if(result.length>=Math.min(4,Math.max(0,maxProbes)))break;
  }
  return result;
}
function sameContext(a,b){return ['vehicle','provider','profile','departureKey','restrictionsKey'].every(k=>a[k]===b[k])
  &&JSON.stringify(a.origin)===JSON.stringify(b.origin)&&JSON.stringify(a.destination)===JSON.stringify(b.destination);}
function contextValid(c,now,policy){return c&&['carro','moto'].includes(c.vehicle)&&c.profile==='driving-traffic'
  &&typeof c.provider==='string'&&c.provider.length>0&&typeof c.departureKey==='string'
  &&typeof c.restrictionsKey==='string'&&pointOK(c.origin)&&pointOK(c.destination)
  &&Number.isFinite(c.capturedAt)&&now-c.capturedAt>=-5000&&now-c.capturedAt<=policy.maxSnapshotAgeMs;}
export function assessTimeSaving(baseline,candidate,context,candidateContext=context,state={},overrides={}){
  const p={...TIME_SAVING_POLICY,...overrides},now=state.now??Date.now();
  const reject=reason=>({accepted:false,reason});
  if(!validRoute(baseline)||!validRoute(candidate))return reject('invalid-route');
  if(!contextValid(context,now,p)||!contextValid(candidateContext,now,p))return reject('stale-or-unsupported-context');
  if(!sameContext(context,candidateContext))return reject('incomparable-context');
  if(fullRouteSignature(baseline)===fullRouteSignature(candidate))return reject('same-geometry');
  // Compare accepted provider anchors: a POI can be far from its road entrance.
  // Request coordinates still must match exactly in both contexts.
  const baseCoords=baseline.geometry.coordinates,candidateCoords=candidate.geometry.coordinates;
  if(meters(baseCoords[0],candidateCoords[0])>p.maxEndpointDriftM||meters(baseCoords.at(-1),candidateCoords.at(-1))>p.maxEndpointDriftM)return reject('endpoint-drift');
  for(const route of [baseline,candidate]){
    if((route.legs||[]).some(l=>l.annotation?.closure?.some(c=>c===true||c&&typeof c==='object')))return reject('known-closure');
    if((route.legs||[]).some(l=>l.notifications?.some(n=>n.type==='violation')))return reject('restriction-violation');
  }
  const gainSeconds=baseline.duration-candidate.duration,extraDistanceM=Math.max(0,candidate.distance-baseline.distance);
  const allowance=Math.max(p.minExtraDistanceAllowanceM,Math.min(p.maxExtraDistanceM,baseline.distance*p.maxExtraDistanceRatio));
  if(extraDistanceM>allowance)return reject('detour-too-long');
  if(gainSeconds<Math.max(p.minGainSeconds,baseline.duration*p.minGainRatio))return reject('gain-too-small');
  if(state.reroute){
    if(!state.gpsReliable)return reject('gps-unreliable');
    if(Number.isFinite(state.lastSwitchAt)&&now-state.lastSwitchAt<p.rerouteCooldownMs)return reject('cooldown');
    if(!Number.isFinite(state.maneuverDistanceM)||state.maneuverDistanceM<p.maneuverGuardM)return reject('near-or-unknown-maneuver');
  }
  return {accepted:true,reason:'provider-eta-gain',gainSeconds,extraDistanceM,
    secondsSavedPerExtraKm:extraDistanceM?gainSeconds/(extraDistanceM/1000):null};
}
/** Caller provides complete raw base pool and a callback that uses the same
 * provider/profile, departure, origin, destination and restrictions. Returns a
 * recommendation; caller retains route authority. No production side effects.
 */
export async function exploreTimeSavings({routes,context,fetchCandidate,existingSpecs=[],state={},policy={}}){
  const p={...TIME_SAVING_POLICY,...policy},pool=exactRoutePool(routes),baseline=pool[0],started=Date.now();
  if(!baseline)throw Error('A valid raw provider baseline is required.');
  const output={baseline,recommended:baseline,fastestObserved:baseline,decisions:[],probes:[],additionalRequests:0};
  if(!contextValid(context,started,p)||typeof fetchCandidate!=='function')return {...output,skipped:'unsupported-or-stale'};
  const specs=complementarySpecs(pool,{maxProbes:p.maxProbes,existingSpecs,origin:context.origin,destination:context.destination});
  const extra=[];let cursor=0;
  async function worker(){
    while(cursor<specs.length){const remaining=p.deadlineMs-(Date.now()-started);if(remaining<=0)break;
      const spec=specs[cursor++],controller=new AbortController();let timer;
      output.additionalRequests++;
      try{
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'));},remaining);});
        const found=await Promise.race([Promise.resolve().then(()=>fetchCandidate(spec,{signal:controller.signal,context})),timeout]);
        // Returned envelope carries actual request context for comparability checks.
        for(const entry of found||[])extra.push(entry);
        output.probes.push({kind:spec.kind,status:'ok'});
      }catch{output.probes.push({kind:spec.kind,status:controller.signal.aborted?'deadline':'failed'});}
      finally{clearTimeout(timer);}
    }
  }
  await Promise.all(Array.from({length:Math.max(1,Math.min(2,p.concurrency))},worker));
  for(const entry of extra){
    if(!entry?.context){output.decisions.push({accepted:false,reason:'missing-request-context'});continue;}
    const decision=assessTimeSaving(baseline,entry.route,context,entry.context,{...state,now:Date.now()},p);
    output.decisions.push({signature:fullRouteSignature(entry.route),...decision});
    if(validRoute(entry.route)&&!['invalid-route','stale-or-unsupported-context','incomparable-context','endpoint-drift','known-closure','restriction-violation'].includes(decision.reason)&&entry.route.duration<output.fastestObserved.duration)output.fastestObserved=entry.route;
    if(decision.accepted&&entry.route.duration<output.recommended.duration)output.recommended=entry.route;
  }
  output.elapsedMs=Date.now()-started;
  return output;
}
