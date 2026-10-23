/** Isolated V2 initial car fast route. Mapbox verifies congestion while the
 * original Python engine keeps ownership of Safe/Smart/Quiet routes.
 * Never manufactures geometry or trusts an unverified traffic-free claim.
 */
const fast=routes=>routes?.find(r=>r?.id==='fast');
export async function chooseV2FastCorridor({original,mapbox}){
  if(typeof original!=='function'||typeof mapbox!=='function')throw Error('Missing route providers');
  const [python,traffic]=await Promise.allSettled([original(),mapbox()]);
  const baseline=python.status==='fulfilled'?python.value:null;
  const explored=traffic.status==='fulfilled'?traffic.value:null;
  if(!baseline&&!explored)throw (python.reason||traffic.reason||Error('Routing providers unavailable'));
  if(!baseline)return {...explored,fastRouteEngine:'v2-500m-traffic-corridor',fastEngineStatus:'mapbox-only'};
  if(!explored)return {...baseline,fastRouteEngine:'python-original',fastEngineStatus:'corridor-provider-unavailable'};
  const current=fast(baseline.routes),candidate=fast(explored.routes);
  const valid=Boolean(candidate&&candidate.routingProfile==='driving-traffic'&&
    Number.isFinite(candidate.durationSeconds)&&candidate.durationSeconds>0);
  const faster=valid&&(!current||!Number.isFinite(current.durationSeconds)||
    candidate.durationSeconds<=current.durationSeconds-5);
  if(!faster){
    return {...baseline,fastRouteEngine:'python-original',
      fastEngineStatus:valid?'corridor-checked-python-faster':'corridor-unverified',
      fastCandidateEngine:explored.candidateEngine??null};
  }
  const routes=(baseline.routes||[]).filter(r=>r?.id!=='fast');
  routes.push({...candidate,id:'fast',label:'Mais rápida'});
  return {...baseline,routes,
    source:'vano-v2-corridor-fast-python-safe',
    fastRouteEngine:'v2-500m-traffic-corridor',
    fastEngineStatus:explored.candidateEngine?.verifiedCorridorAvoidance?
      '500m-corridor-avoided':'traffic-eta-evaluated',
    candidateEngine:explored.candidateEngine??null,
    // Safe candidate pool must stay Python-owned; do not import unverified
    // Mapbox comparison candidates into an independent safe ranking.
    safeCandidatePool:baseline.safeCandidatePool};
}
