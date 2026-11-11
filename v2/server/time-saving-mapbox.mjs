import {mapboxDirectionsUrl} from './mapbox-v1-fallback.mjs';

/** Probe adapter for the existing Mapbox engine. Token stays in caller memory.
 * Feed raw routes from the same context, not rounded frontend route cards.
 */
export function createMapboxTimeSavingProbe({origin,destination,vehicle='carro',telemetry={},language='pt-BR',options={},token,fetcher=fetch}){
  const context={origin,destination,vehicle,provider:'mapbox',profile:'driving-traffic',
    departureKey:options.departAt||'now',capturedAt:Date.now(),
    restrictionsKey:JSON.stringify({avoidTolls:!!options.avoidTolls,avoidFerries:!!options.avoidFerries,avoidUnpaved:!!options.avoidUnpaved||vehicle==='moto'})};
  async function fetchCandidate(spec,{signal}){
    const url=mapboxDirectionsUrl(origin,destination,token,language,vehicle,telemetry,options,{...spec,alternatives:false});
    const response=await fetcher(url,{signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('Candidate provider unavailable.');
    const body=await response.json();
    if(body.code&&body.code!=='Ok')throw Error('Candidate provider did not return a valid route.');
    return (body.routes||[]).map(route=>({route,context:{...context,capturedAt:Date.now()}}));
  }
  return {context,fetchCandidate};
}
