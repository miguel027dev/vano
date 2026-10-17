/** Administrator-only map labels. Never generate instructions or navigation geometry. */
import {metersBetween,validPoint} from './navigationMotion.js';

const UNKNOWN=/^(?:sem nome|rua sem nome|unnamed(?: road)?|unknown|via sem nome|road|route|—|-|desconhecid[ao])$/i;
const NON_TURNS=new Set(['depart','departure','arrive','arrival','destination','continue','notification']);

function streetName(step){
 const raw=typeof step?.street==='string'?step.street.trim().replace(/\s+/g,' '):'';
 // The provider is authoritative. Never recover names from an address lookup,
 // nearby map label, or free-form navigation instruction.
 return raw&&raw.length<=68&&!UNKNOWN.test(raw)?raw:'';
}
function trueTurn(step){
 const kind=String(step?.type||'').toLowerCase(),modifier=String(step?.modifier||'').toLowerCase();
 if(NON_TURNS.has(kind)||modifier==='straight'&&(!kind||kind==='turn'))return false;
 return Boolean(kind||modifier);
}
function trustedSignalAt(point,signals){
 if(!validPoint(point)||!Array.isArray(signals))return false;
 return signals.some(s=>s?.type==='semaforo'&&validPoint(s.coords)&&
  (s.source==='Mapbox Streets'||s.source==='OpenStreetMap')&&
  metersBetween(point,s.coords)<=16);
}
export function privateRoadSignCandidates(route,guidance,signals=[],project=null){
 if(!Array.isArray(route?.steps)||!guidance||!Number.isInteger(guidance.stepIndex))return [];
 const distance=Number(guidance.distance);
 if(!Number.isFinite(distance)||distance<0||distance>550)return [];
 const make=(idx,priority)=>{
  const step=route.steps[idx];
  const street=streetName(step);
  if(!street||!trueTurn(step)||!validPoint(step?.location))return null;
  return {stepIndex:idx,street,coords:step.location,
   modifier:String(step.modifier||'').toLowerCase(),priority,
   signalNearby:trustedSignalAt(step.location,signals)};
 };
 const current=make(guidance.stepIndex,'primary');
 if(!current)return [];
 const result=[current];
 const following=guidance.following;
 const gap=Number(following?.gapMeters);
 if(distance<=140&&Number.isInteger(following?.stepIndex)&&gap>=55&&gap<=230){
  const second=make(following.stepIndex,'secondary');
  if(second&&second.street!==current.street&&metersBetween(current.coords,second.coords)>55){
   let separated=true;
   if(typeof project==='function'){
    try{const a=project(current.coords),b=project(second.coords);
     separated=Number.isFinite(a?.x)&&Number.isFinite(b?.x)&&Math.hypot(a.x-b.x,a.y-b.y)>=145;
    }catch{separated=false;}
   }
   if(separated)result.push(second);
  }
 }
 return result;
}
export function syncPrivateRoadSignMarkers(map,mapboxgl,data){
 if(!map||!mapboxgl)return;
 const cache=map._vanoPrivateRoadSigns??={signature:'',markers:[]};
 const clear=()=>{for(const marker of cache.markers)marker.remove();cache.markers=[];cache.signature='';};
 if(data?.privateRoadSigns!==true||data?.navigation!==true){
  if(cache.markers.length)clear();
  return;
 }
 const route=(data.routes||[]).find(x=>x?.id===data.selectedRoute)||data.routes?.[0];
 const signals=typeof map._vanoTrafficSignals==='function'?map._vanoTrafficSignals():[];
 const candidates=privateRoadSignCandidates(route,data.guidance,signals,point=>map.project(point));
 const signature=JSON.stringify([data.appearance,candidates.map(x=>[x.stepIndex,x.street,x.signalNearby,x.priority])]);
 if(cache.signature===signature)return;
 clear();
 cache.signature=signature;
 for(const item of candidates){
  const element=document.createElement('div');
  element.className='vano-private-road-sign'+(item.priority==='secondary'?' is-secondary':'');
  element.dataset.theme=data.appearance==='dark'?'dark':'light';
  element.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.className='vano-private-road-sign-name';
  label.textContent=item.street; // Never inject provider names as HTML.
  element.appendChild(label);
  if(item.signalNearby){
   const signal=document.createElement('small');
   signal.className='vano-private-road-sign-signal';
   signal.textContent='● Semáforo mapeado'; // NOT a claim about phase/direction.
   element.appendChild(signal);
  }
  const marker=new mapboxgl.Marker({element,anchor:'bottom',
   offset:[0,-13],rotationAlignment:'viewport',pitchAlignment:'viewport'})
   .setLngLat(item.coords).addTo(map);
  cache.markers.push(marker);
 }
}
export function clearPrivateRoadSignMarkers(map){
 if(!map?._vanoPrivateRoadSigns)return;
 for(const marker of map._vanoPrivateRoadSigns.markers)marker.remove();
 delete map._vanoPrivateRoadSigns;
}
