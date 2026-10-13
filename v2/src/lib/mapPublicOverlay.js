/** Camera-aware OSM map pins; existing route, GPS and Mapbox layers are untouched.
 * Keep markers as DOM overlays: style changes never lose radar pins.
 */
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {iconSvg,selectPublicPins,mapFeatureBBox} from './mapPublicIcons.js';
import {readMapboxPoiFeatures} from './mapboxPoiFallback.js';

function buildPin(item){
 const element=document.createElement('div');
 element.className='v40-public-touch';
 element.setAttribute('role','button');
 element.setAttribute('tabindex','0');
 element.setAttribute('aria-label',item.name+', fonte '+item.source);
 element.title=item.name;
 const chip=document.createElement('span');
 chip.className='v40-public-pin '+(item.type==='radar'?'is-radar':item.type.startsWith('relato-')?'is-report':'');
 // Closed enum only. No remote text is inserted as HTML.
 chip.innerHTML=iconSvg(item.type);
 element.append(chip);
 return element;
}
function popupBody(item){
 const wrapper=document.createElement('div');wrapper.className='v40-public-popup';
 const title=document.createElement('strong');title.textContent=item.name;
 const source=document.createElement('small');
 source.textContent='Fonte: '+item.source+(item.verified?' · relato verificado':' · cadastro público');
 wrapper.append(title,source);
 if(item.description){const desc=document.createElement('p');desc.textContent=item.description;wrapper.append(desc);}
 return wrapper;
}
export function attachPublicMapOverlay(map,backend){
 if(!map||!['mapbox','leaflet'].includes(backend))return ()=>{};
 let done=false,timer=null,controller=null,latestKey='',lastRead=0,items=[],remoteItems=[],mapTilesItems=[];
 const markers=new Map();
 const credit=document.createElement('a');
 credit.className='v40-map-credit';
 credit.href='https://www.openstreetmap.org/copyright';
 credit.rel='noopener noreferrer';credit.target='_blank';
 credit.textContent='© OpenStreetMap contributors · ODbL';
 credit.hidden=true;map.getContainer().append(credit);
 const notice=document.createElement('button');
 notice.type='button';
 notice.className='v41-public-status';
 notice.hidden=true;
 notice.setAttribute('aria-label','Tentar carregar os pontos públicos novamente');
 notice.addEventListener('click',()=>{latestKey='';lastRead=0;schedule();});
 map.getContainer().append(notice);
 function setNotice(message){notice.textContent=message;notice.hidden=!message;}
 function clear(){
  for(const entry of markers.values())entry.marker.remove();
  markers.clear();
 }
 function project(coords){
  if(backend==='mapbox'){const p=map.project(coords);return {x:p.x,y:p.y};}
  const p=map.latLngToContainerPoint([coords[1],coords[0]]);
  return {x:p.x,y:p.y};
 }
 function render(){
  if(done)return;
  const zoom=map.getZoom();
  const node=map.getContainer();
  const allowed=selectPublicPins(items,project,zoom,55,{width:node.clientWidth,height:node.clientHeight});
  const current=new Set(allowed.map(x=>x.id));
  for(const [id,entry] of markers)if(!current.has(id)){entry.marker.remove();markers.delete(id);}
  for(const item of allowed){
   if(markers.has(item.id))continue;
   const element=buildPin(item);
   const popup=popupBody(item);
   let marker;
   if(backend==='mapbox'){
    marker=new mapboxgl.Marker({element,anchor:'bottom'}).setLngLat(item.coords).addTo(map);
    marker.setPopup(new mapboxgl.Popup({closeButton:true,closeOnClick:true,offset:14,maxWidth:'240px'}).setDOMContent(popup));
   }else{
    const icon=L.divIcon({className:'v40-leaflet-pin',html:element.outerHTML,iconSize:[44,44],iconAnchor:[22,40]});
    marker=L.marker([item.coords[1],item.coords[0]],{icon,riseOnHover:true}).addTo(map);
    marker.bindPopup(popup,{maxWidth:240});
   }
   markers.set(item.id,{marker});
  }
  credit.hidden=!items.some(item=>item.source==='OpenStreetMap');
 }
 function mergeSources(){
  const combined=[...remoteItems],seen=new Set(combined.map(x=>x.id));
  for(const item of mapTilesItems){
   if(seen.has(item.id))continue;
   const duplicate=combined.some(x=>x.type===item.type&&Array.isArray(x.coords)&&
    Math.abs(x.coords[0]-item.coords[0])<.00028&&Math.abs(x.coords[1]-item.coords[1])<.00028);
   if(!duplicate){combined.push(item);seen.add(item.id);}
  }
  items=combined;
 }
 function updateVectorPoi(){
  if(done||backend!=='mapbox')return;
  const local=readMapboxPoiFeatures(map);
  if(!local.length)return;
  mapTilesItems=local;mergeSources();render();
 }
 function schedule(){
  if(done||document.hidden)return;
  if(timer!==null)clearTimeout(timer);
  timer=setTimeout(refresh,750);
 }
 async function refresh(){
  timer=null;if(done||document.hidden)return;
  const bbox=mapFeatureBBox(map,backend);
  if(!bbox){remoteItems=[];mapTilesItems=[];items=[];latestKey='';clear();credit.hidden=true;setNotice('');return;}
  updateVectorPoi();render();
  const key=bbox.map(x=>x.toFixed(3)).join(',');
  if(key===latestKey&&Date.now()-lastRead<130000)return;
  if(controller)controller.abort();
  const signal=new AbortController();controller=signal;
  try{
   const response=await fetch('/api/map-features?bbox='+encodeURIComponent(bbox.join(',')),{signal:signal.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Dados públicos: '+response.status);
   const data=await response.json();
   if(done||signal.signal.aborted)return;
   remoteItems=Array.isArray(data?.features)?data.features.filter(x=>x&&Array.isArray(x.coords)).slice(0,220):[];
   mergeSources();
   // Never silently show an empty map when the external data provider failed.
   setNotice(data?.error?'Dados públicos indisponíveis · tentar novamente':'');
   latestKey=key;lastRead=Date.now();
   render();
  }catch(error){
   if(error.name!=='AbortError'){
    // Do not suppress retries for 130 seconds after a transient failure.
    lastRead=0;latestKey='';mergeSources();setNotice('Radares e sinalização indisponíveis · tentar novamente');
    console.warn('VANO public map:',error?.message||String(error));render();
   }
  }
 }
 function visibility(){if(!document.hidden)schedule();}
 map.on('moveend',schedule);
 map.on('zoomend',schedule);
 if(backend==='mapbox'){
    map.on('load',schedule);
    map.on('idle',updateVectorPoi);
    map.on('style.load',updateVectorPoi);
  }
 document.addEventListener('visibilitychange',visibility);
 schedule();
 return ()=>{
  done=true;
  if(timer!==null)clearTimeout(timer);
  controller?.abort();
  map.off('moveend',schedule);
  map.off('zoomend',schedule);
  if(backend==='mapbox'){
    map.off('load',schedule);
    map.off('idle',updateVectorPoi);
    map.off('style.load',updateVectorPoi);
  }
  document.removeEventListener('visibilitychange',visibility);
  clear();credit.remove();notice.remove();
 };
}
