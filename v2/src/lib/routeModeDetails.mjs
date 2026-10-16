/** Route-mode UX details built from provider steps and optional, tagged OSM
 * crossing nodes. Never infer a zebra crossing from the word "avenida".
 */
const str=value=>typeof value==='string'?value.trim().slice(0,150):'';
const norm=value=>str(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function previewManeuvers(route,vehicle='carro'){
 const steps=Array.isArray(route?.steps)?route.steps:[];
 const entries=[],seen=new Set();
 for(const step of steps){
  if(!step||typeof step!=='object')continue;
  const text=str(step.instruction);
  if(text.length<5||seen.has(norm(text)))continue;
  seen.add(norm(text));
  const type=norm(step.type||step.kind);
  if(/depart|arrive|arrival|destination/.test(type)&&steps.length>3)continue;
  const distance=Number.isFinite(step.distance)&&step.distance>0?Math.round(step.distance):null;
  entries.push({instruction:text,distance,street:str(step.street),kind:type,
   detail:modeManeuverDetail(vehicle,step)});
  if(entries.length>=4)break;
 }
 return entries;
}
export function modeManeuverDetail(vehicle,step={}){
 const type=norm(step?.type||step?.kind);
 const modifier=norm(step?.modifier);
 if(vehicle==='a-pe'){
  if(/crosswalk|faixa de pedestres|passadeira|pedestrian crossing|passage pieton/.test(norm(step.instruction)))
   return 'Travessia mencionada pelo provedor da rota. Confira a sinalização no local.';
  if(/steps|stairs|escad|escaliers/.test(norm(step.instruction)+' '+type))
   return 'Trecho com escadas indicado nas orientações.';
  return null;
 }
 if(vehicle==='moto'){
  if(/roundabout|rotatoria/.test(type))return 'Confira as entradas e saídas da rotatória.';
  if(/ramp|exit|merge|fork/.test(type))return 'Acesso ou bifurcação indicado pela rota. Observe a sinalização.';
  if(/turn/.test(type)&&/sharp/.test(modifier))return 'Curva acentuada indicada pelo provedor.';
  return null;
 }
 if(vehicle==='carro'){
  const lanes=Array.isArray(step.lanes)?step.lanes:[];
  if(lanes.some(x=>x?.valid===true))return 'Faixas recomendadas conforme os dados disponíveis da rota.';
  if(/ramp|exit|merge|fork/.test(type))return 'Acesso ou bifurcação indicado pelo provedor.';
 }
 return null;
}
export function nextMappedCrossing(features,progress,{maxAhead=180}={}){
 if(!Array.isArray(features)||!Number.isFinite(progress)||progress<0)return null;
 let nearest=null;
 for(const feature of features){
  if(feature?.source!=='OpenStreetMap'||!['marked','signals'].includes(feature.type)||
    !Number.isFinite(feature.routeMeters))continue;
  const distance=feature.routeMeters-progress;
  if(distance<-7||distance>maxAhead)continue;
  if(!nearest||distance<nearest.distance)nearest={...feature,distance:Math.max(0,Math.round(distance))};
 }
 return nearest;
}
export function crossingLabel(crossing,language='pt-BR'){
 if(!crossing)return null;
 const en=language.startsWith('en'),fr=language.startsWith('fr');
 if(crossing.type==='signals')return en?'Mapped pedestrian signals':fr?'Feu piéton cartographié':'Semáforo de pedestres mapeado';
 return en?'Mapped pedestrian crossing':fr?'Passage piéton cartographié':'Faixa de pedestres mapeada';
}
export function crossingSafetyNote(language='pt-BR'){
 return language.startsWith('en')?'Check signs and traffic before crossing.':
  language.startsWith('fr')?'Vérifiez la signalisation et la circulation avant de traverser.':
  'Confira a sinalização e o trânsito antes de atravessar.';
}
export function crossingVoiceCue(crossing,{navigation=false,liveGps=false,muted=false,language='pt-BR',maneuverDistance=null}={}){
 if(!navigation||!liveGps||muted||!crossing||!Number.isFinite(crossing.distance)||
    crossing.distance>42||crossing.distance<0||Number.isFinite(maneuverDistance)&&maneuverDistance<60)return null;
 // Spoken guidance follows a mapped node; it never claims a signal is green.
 const text=language.startsWith('en')?'Approach the mapped pedestrian crossing. Check signs before crossing.':
  language.startsWith('fr')?'Approchez du passage piéton indiqué sur la carte. Vérifiez la signalisation.':
  'Aproxime-se da travessia de pedestres mapeada. Confira a sinalização antes de atravessar.';
 return {key:'walk-feature:'+crossing.id,text};
}
