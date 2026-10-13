import {pointOK} from './routing.mjs';

export function walkingDirectionsUrl(origin,destination,token,language='pt-BR',options={}){
  if(!pointOK(origin)||!pointOK(destination)||!token)throw Error('Origem, destino ou token de rota inválidos.');
  const url=new URL('https://api.mapbox.com/directions/v5/mapbox/walking/'+origin.join(',')+';'+destination.join(','));
  for(const [key,value] of Object.entries({alternatives:'false',geometries:'geojson',overview:'full',steps:'true',language,access_token:token}))url.searchParams.set(key,value);
  if(options.avoidFerries)url.searchParams.set('exclude','ferry');
  return url;
}

export async function calculateWalkingRoute(origin,destination,language,options,token,fetcher=fetch){
  const response=await fetcher(walkingDirectionsUrl(origin,destination,token,language,options),{signal:AbortSignal.timeout(12500),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Mapbox HTTP '+response.status);
  const body=await response.json();
  if(body.code&&body.code!=='Ok')throw Error('Mapbox '+body.code);
  const route=body.routes?.[0];
  if(!route||!Number.isFinite(route.duration)||route.duration<=0||!Number.isFinite(route.distance)||route.distance<=0||route.geometry?.type!=='LineString'||!Array.isArray(route.geometry.coordinates)||route.geometry.coordinates.length<2||!route.geometry.coordinates.every(pointOK))throw Error('Nenhuma rota a pé disponível.');
  const steps=(route.legs||[]).flatMap(leg=>(leg.steps||[]).map(step=>({instruction:step.maneuver?.instruction||step.name||'Siga em frente',distance:step.distance,location:step.maneuver?.location,modifier:step.maneuver?.modifier||'straight',type:step.maneuver?.type||'',street:step.name||'',lanes:[]}))).slice(0,700);
  return {source:'mapbox-walking',vehicle:'a-pe',safetyMessage:'Percurso para caminhada; segurança não verificada.',routes:[{id:'fast',label:'Rota a pé',duration:Math.max(1,Math.round(route.duration/60)),distance:Math.max(.1,Math.round(route.distance/100)/10),geometry:route.geometry,steps,verifiedSafety:false,routingProvider:'mapbox-walking'}]};
}
