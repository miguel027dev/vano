/** Camera-aware OSM map pins; existing route, GPS and Mapbox layers are untouched.
 * Keep markers as DOM overlays: style changes never lose radar pins.
 */
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {iconSvg,selectPublicPins,mapFeatureBBox} from './mapPublicIcons.js';
import {readMapboxPoiFeatures} from './mapboxPoiFallback.js';
import {rememberMapFeatures,cachedMapFeatures} from './mapFeaturePersistence.js';

function buildPin(item){
 const element=document.createElement('div');
 element.className='v40-public-touch';
 element.setAttribute('role','button');
 element.setAttribute('tabindex','0');
 element.setAttribute('aria-label',item.name+', fonte '+item.source);
 element.title=item.name;
 const chip=document.createElement('span');
 const secondaryStyle={travessia:'is-crossing',estacionamento:'is-parking',ferrovia:'is-rail',banco:'is-bank'}[item.type]||'';
 chip.className='v40-public-pin '+(item.type==='radar'?'is-radar':item.type.startsWith('relato-')?'is-report':'')+(secondaryStyle?' '+secondaryStyle:'');
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
 let done=false,timer=null,vectorTimer=null,controller=null,latestKey='',lastRead=0,items=[],remoteItems=[],mapTilesItems=[];
 const stableTileCache=new Map();
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
  // Bound DOM work by viewport area, not by arbitrary zoom / icon category.
  const markerBudget=Math.max(100,Math.min(300,Math.round(node.clientWidth*node.clientHeight/2300)));
  const allowed=selectPublicPins(items,project,zoom,markerBudget,{width:node.clientWidth,height:node.clientHeight});
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
  // Include only nearby cached real points. Panning never deletes the original
  // observation; a point reappears at exactly the same coordinate when revisited.
  const b=map.getBounds?.();
  const west=b?.getWest?.()??-180,east=b?.getEast?.()??180;
  const south=b?.getSouth?.()??-85,north=b?.getNorth?.()??85;
  const lonPad=Math.min(.025,Math.max(.005,(east-west)*.35));
  const latPad=Math.min(.025,Math.max(.005,(north-south)*.35));
  for(const item of mapTilesItems){
   if(item.coords[0]<west-lonPad||item.coords[0]>east+lonPad
      ||item.coords[1]<south-latPad||item.coords[1]>north+latPad)continue;
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
  // A revisited viewport may contain ONLY already-known points. Always
  // recompute what's in view from the retained cache, even without discoveries.
  if(local.length&&rememberMapFeatures(stableTileCache,local))
    mapTilesItems=cachedMapFeatures(stableTileCache);
  if(!mapTilesItems.length)return;
  mergeSources();render();
 }
 function scheduleVectorUpdate(){
  if(done||document.hidden||backend!=='mapbox'||vectorTimer!==null)return;
  // Tiles arrive independently while the user pans. Wait for the next batch,
  // but don't wait for camera idle or a network fetch to show new services.
  vectorTimer=setTimeout(()=>{
   vectorTimer=null;
   updateVectorPoi();
  },160);
 }
 function schedule(){
  if(done||document.hidden)return;
  if(timer!==null)clearTimeout(timer);
  scheduleVectorUpdate();
  timer=setTimeout(refresh,540);
 }
 async function refresh(){
  timer=null;if(done||document.hidden)return;
  const bbox=mapFeatureBBox(map,backend);
  if(!bbox){
   // The Overpass API only serves small high-zoom bboxes, but previously
   // loaded vector POIs are still real and must not disappear on zoom-out.
   remoteItems=[];latestKey='';updateVectorPoi();mergeSources();render();setNotice('');return;
  }
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
   // Mapbox tiles continue supplying confirmed mapped services/signals even
   // during an Overpass outage. Don't cover a working map with a false global
   // 'dados públicos indisponíveis' warning.
   setNotice(data?.error&&items.length===0?'Sinalização pública não carregada · tentar novamente':'');
   latestKey=key;lastRead=Date.now();
   render();
  }catch(error){
   if(error.name!=='AbortError'){
    // Do not suppress retries for 130 seconds after a transient failure.
    lastRead=0;latestKey='';mergeSources();
    setNotice(items.length===0?'Sinalização pública não carregada · tentar novamente':'');
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
    map.on('sourcedata',scheduleVectorUpdate);
  }
 document.addEventListener('visibilitychange',visibility);
 schedule();
 return ()=>{
  done=true;
  if(timer!==null)clearTimeout(timer);
  if(vectorTimer!==null)clearTimeout(vectorTimer);
  controller?.abort();
  map.off('moveend',schedule);
  map.off('zoomend',schedule);
  if(backend==='mapbox'){
    map.off('load',schedule);
    map.off('idle',updateVectorPoi);
    map.off('style.load',updateVectorPoi);
    map.off('sourcedata',scheduleVectorUpdate);
  }
  document.removeEventListener('visibilitychange',visibility);
  clear();stableTileCache.clear();credit.remove();notice.remove();
 };
}
