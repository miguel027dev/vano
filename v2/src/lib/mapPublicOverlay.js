/** Camera-aware OSM map pins; existing route, GPS and Mapbox layers are untouched.
 * Keep markers as DOM overlays: style changes never lose radar pins.
 */
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {iconSvg,selectPublicPins,mapFeatureBBox,mapRadarBBox} from './mapPublicIcons.js';
import {radarDisplayAllowed} from './radarPolicy.js';
import {readMapboxPoiFeatures} from './mapboxPoiFallback.js';
import {rememberMapFeatures,cachedMapFeatures} from './mapFeaturePersistence.js';
import {rememberPublicFeatures,nearbyPublicFeatures} from './publicSourceStability.js';
import {dedupePublicFeatureSources} from './dedupePublicFeatureSources.js';

function buildPin(item){
 const element=document.createElement('div');
 element.className='v40-public-touch';
 element.setAttribute('role','button');
 element.setAttribute('tabindex','0');
 element.setAttribute('aria-label',item.name+', fonte '+item.source);
 element.title=item.name;
 const chip=document.createElement('span');
 const secondaryStyle={
   travessia:'is-crossing',estacionamento:'is-parking',ferrovia:'is-rail',banco:'is-bank',
   obra:'is-works','relato-obra':'is-works','alerta-via':'is-road-alert',
   mercado:'is-commerce',supermercado:'is-commerce',shopping:'is-shopping',
   'estacao-recarga':'is-electric','carregador-eletrico':'is-electric',eletroposto:'is-electric',
   restaurante:'is-food',fastfood:'is-food',cafeteria:'is-food',
   escola:'is-school',academia:'is-fitness',parque:'is-park',
   hotel:'is-hotel',petshop:'is-pet',correios:'is-service',farmacia:'is-pharmacy',
   lavarapido:'is-automotive',
   'terminal-onibus':'is-transit','estacao-trem':'is-transit','estacao-ferroviaria':'is-transit',aeroporto:'is-transit'
  }[item.type]||'';
 chip.className='v40-public-pin '+(item.type==='radar'?'is-radar':item.type.startsWith('relato-')?'is-report':'')+(secondaryStyle?' '+secondaryStyle:'');
 // Closed enum only. No remote text is inserted as HTML.
 chip.innerHTML=iconSvg(item.type);
 element.append(chip);
 return element;
}
// Compact place information: text comes from public providers and is never interpolated into HTML.
const PLACE_LABELS={
 radar:'Radar',semaforo:'Semáforo',lombada:'Lombada',pare:'Sinalização',preferencia:'Preferência',
 placa:'Placa de trânsito',travessia:'Travessia',ferrovia:'Cruzamento ferroviário',
 rotatoria:'Rotatória',obra:'Obra na via',hospital:'Hospital',saude:'Saúde',
 bombeiros:'Bombeiros','policia-base':'Polícia',combustivel:'Posto de combustível',
 estacionamento:'Estacionamento',banco:'Banco',eletroposto:'Recarga elétrica',
 'relato-transito':'Alerta de trânsito','relato-obra':'Obra sinalizada',
 'alerta-via':'Alerta viário','relato-acidente':'Acidente','relato-risco':'Alerta de risco',
 'relato-radar':'Radar',mercado:'Mercado',supermercado:'Supermercado',shopping:'Shopping',
 'estacao-recarga':'Estação de recarga','carregador-eletrico':'Carregador elétrico',
 restaurante:'Restaurante',fastfood:'Alimentação',cafeteria:'Cafeteria',hotel:'Hotel',
 escola:'Escola',academia:'Academia',parque:'Parque',petshop:'Pet shop',
 correios:'Correios',farmacia:'Farmácia',lavarapido:'Lava-rápido',
 'terminal-onibus':'Terminal de ônibus','estacao-trem':'Estação de trem',
 'estacao-ferroviaria':'Estação ferroviária',aeroporto:'Aeroporto'
};
function popupBody(item,onSelect){
 const wrapper=document.createElement('div');wrapper.className='v40-public-popup';
 const head=document.createElement('div');head.className='v40-public-popup-head';
 const pictogram=document.createElement('span');pictogram.className='v40-public-popup-icon';
 // iconSvg only accepts our closed glyph enum, not provider HTML.
 pictogram.innerHTML=iconSvg(item.type);
 const heading=document.createElement('div');heading.className='v40-public-popup-heading';
 const category=document.createElement('span');category.className='v40-public-popup-category';
 category.textContent=PLACE_LABELS[item.type]||'Local no mapa';
 const title=document.createElement('strong');title.className='v40-public-popup-title';
 title.textContent=item.name||'Local no mapa';
 heading.append(category,title);head.append(pictogram,heading);wrapper.append(head);
 const info=document.createElement('div');info.className='v40-public-popup-info';
 const source=document.createElement('small');source.className='v40-public-popup-source';
 source.textContent='Fonte: '+item.source+(item.source==='TomTom Traffic'?' · alerta do provedor':item.regional?' · atualização oficial':item.verified?' · relato verificado':' · cadastro público');
 // Required provider attribution stays in the persistent map credit; the POI popup is clean.
 if(item.source!=='TomTom Search'&&item.source!=='TomTom Traffic')info.append(source);
 if(item.description){const desc=document.createElement('p');desc.textContent=item.description;info.append(desc);}
 if(info.childNodes.length)wrapper.append(info);
 const coords=item.coords;
 if(!['radar','relato-radar'].includes(item.type)&&typeof onSelect==='function'&&Array.isArray(coords)&&coords.length===2&&
   coords.every(Number.isFinite)&&Math.abs(coords[0])<=180&&Math.abs(coords[1])<=90){
  const action=document.createElement('button');action.type='button';
  action.className='v40-public-popup-action';
  action.setAttribute('aria-label','Ir para '+(item.name||'este destino'));
  const label=document.createElement('span');label.textContent='Ir para este destino';
  const arrow=document.createElement('span');arrow.className='v40-public-popup-action-arrow';
  arrow.setAttribute('aria-hidden','true');arrow.textContent='→';
  action.append(label,arrow);
  action.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   onSelect();
  });
  wrapper.append(action);
 }
 return wrapper;
}
export function attachPublicMapOverlay(map,backend,getNavigation=()=>false,onPickPlace=null){
 if(!map||!['mapbox','leaflet'].includes(backend))return ()=>{};
 let done=false,timer=null,vectorTimer=null,regionalTimer=null,controller=null,radarController=null,radarRetryTimer=null,radarRetryCount=0,regionalController=null,latestKey='',lastRead=0,radarKey='',radarReadAt=0,regionalKey='',regionalReadAt=0,tomtomKey='',tomtomReadAt=0,tomtomDisabled=false,tomtomController=null,tomtomTimer=null,tomtomPoiController=null,tomtomPoiKey='',tomtomPoiReadAt=0,tomtomPoiTimer=null,chargeKey='',chargeReadAt=0,chargeDisabled=false,chargeController=null,chargeTimer=null,overtureKey='',overtureReadAt=0,overtureDisabled=false,overtureController=null,overtureTimer=null,items=[],remoteItems=[],radarItems=[],mapTilesItems=[];
 const stableTileCache=new Map();
 const sourceCache=new Map(); // OSM, verified reports and radar points; never erased on viewport changes.
 const markers=new Map();
 // Read-only evidence for private /v2 signs. A nearby signal is NOT a signal phase or turn instruction.
 map._vanoTrafficSignals=()=>items.filter(x=>x.type==='semaforo'&&(x.source==='OpenStreetMap'||x.source==='Mapbox Streets')).slice(0,100);
 // Provider links must be at the bottom of the viewport AND above the nav dock.
 // Rendering inside the map canvas's stacking context would hide them behind
 // the navigation UI even with a large CSS z-index.
 const creditHost=map.getContainer().closest?.('.map-page')||map.getContainer();
 const credit=document.createElement('a');
 credit.className='v40-map-credit';
 credit.href='https://www.openstreetmap.org/copyright';
 credit.rel='noopener noreferrer';credit.target='_blank';
 credit.textContent='OSM';
 const osmLogo=document.createElement('img');
 osmLogo.src='https://upload.wikimedia.org/wikipedia/commons/b/b0/Openstreetmap_logo.svg';
 osmLogo.alt='';
 osmLogo.width=20;osmLogo.height=20;osmLogo.decoding='async';
 osmLogo.addEventListener('load',()=>{credit.textContent='';credit.append(osmLogo);},{once:true});
 // Keep licensing information available without crowding the map interface.
 credit.title='Fontes e licenças: OpenStreetMap (ODbL 1.0) e ANTT (CC BY 4.0).';
 credit.setAttribute('aria-label','© OpenStreetMap contributors. Fontes: OpenStreetMap e ANTT; licenças ODbL 1.0 e CC BY 4.0.');
 credit.hidden=true;creditHost.append(credit);
 // Show provider attribution when actual TomTom traffic data is displayed.
 const tomtomCredit=document.createElement('a');
 tomtomCredit.className='v40-map-credit v40-tomtom-credit';
 tomtomCredit.href='https://www.tomtom.com/legal/';
 tomtomCredit.target='_blank';tomtomCredit.rel='noopener noreferrer';
 tomtomCredit.textContent='© TomTom';tomtomCredit.title='Dados e locais © TomTom';
 tomtomCredit.hidden=true;creditHost.append(tomtomCredit);
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
  // Small, display-aware budget: the selector enforces further category and spacing limits.
  const markerBudget=Math.max(20,Math.min(90,Math.round(node.clientWidth*node.clientHeight/10500)));
  const allowed=selectPublicPins(items,project,zoom,markerBudget,{width:node.clientWidth,height:node.clientHeight},{navigation:Boolean(getNavigation())});
  const current=new Set(allowed.map(x=>x.id));
  for(const [id,entry] of markers)if(!current.has(id)){entry.marker.remove();markers.delete(id);}
  for(const item of allowed){
   if(markers.has(item.id))continue;
   const element=buildPin(item);
   let marker;
   const popup=popupBody(item,typeof onPickPlace==='function'?()=>{
    // Never replace an active driving route from a map point card.
    if(getNavigation())return;
    if(backend==='mapbox')marker?.getPopup?.()?.remove?.();
    else marker?.closePopup?.();
    onPickPlace({id:item.id,name:item.name||'Local no mapa',coords:[...item.coords],source:item.source,type:item.type});
   }:null);
   if(backend==='mapbox'){
    marker=new mapboxgl.Marker({element,anchor:'bottom'}).setLngLat(item.coords).addTo(map);
    marker.setPopup(new mapboxgl.Popup({closeButton:true,closeOnClick:true,offset:18,maxWidth:'310px',className:'v40-place-popover'}).setDOMContent(popup));
   }else{
    const icon=L.divIcon({className:'v40-leaflet-pin',html:element.outerHTML,iconSize:[44,44],iconAnchor:[22,40]});
    marker=L.marker([item.coords[1],item.coords[0]],{icon,riseOnHover:true}).addTo(map);
    marker.bindPopup(popup,{minWidth:235,maxWidth:310,className:'v40-place-popover'});
   }
   markers.set(item.id,{marker});
  }
  credit.hidden=!items.some(item=>item.source==='OpenStreetMap'||item.id?.startsWith('radar-catalog-'));
  tomtomCredit.hidden=!allowed.some(item=>item.source==='TomTom Traffic'||item.source==='TomTom Search');
 }
 function mergeSources(){
  const b=map.getBounds?.();
  if(!b)return;
  const west=b.getWest(),east=b.getEast(),south=b.getSouth(),north=b.getNorth();
  const lonPad=Math.min(.025,Math.max(.005,(east-west)*.30));
  const latPad=Math.min(.025,Math.max(.005,(north-south)*.30));
  // The previous implementation kept ONLY the latest Overpass response:
  // switching viewports or receiving one empty response silently erased categories.
  const combined=nearbyPublicFeatures(sourceCache,[west,south,east,north],Date.now(),Math.max(lonPad,latPad));
  const seen=new Set(combined.map(item=>item.id));
  // Mapbox POIs and OSM often map the same place. Merge without discarding
  // distinct categories and without a quadratic scan on every map move.
  const grid=new Map(),step=.00028;
  const cell=(type,x,y)=>type+'|'+x+'|'+y;
  const addIndex=item=>{
   const [lon,lat]=item.coords;
   const x=Math.floor(lon/step),y=Math.floor(lat/step);
   const id=cell(item.type,x,y);
   if(!grid.has(id))grid.set(id,[]);
   grid.get(id).push(item);
  };
  for(const item of combined)addIndex(item);
  for(const item of mapTilesItems){
   if(!Array.isArray(item.coords)||item.coords.length!==2)continue;
   const [lon,lat]=item.coords;
   if(lon<west-lonPad||lon>east+lonPad||lat<south-latPad||lat>north+latPad)continue;
   if(seen.has(item.id))continue;
   const x=Math.floor(lon/step),y=Math.floor(lat/step);
   let duplicate=false;
   for(let dx=-1;dx<=1&&!duplicate;dx++)for(let dy=-1;dy<=1&&!duplicate;dy++)
    for(const other of grid.get(cell(item.type,x+dx,y+dy))||[])
     if(Math.abs(other.coords[0]-lon)<step&&Math.abs(other.coords[1]-lat)<step){duplicate=true;break;}
   if(!duplicate){combined.push(item);seen.add(item.id);addIndex(item);}
  }
  items=dedupePublicFeatureSources(combined).filter(item=>item.type!=='radar'||radarDisplayAllowed(item.coords));
  map._vanoSyncPrivateRoadSigns?.();
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
 async function refreshRadars(bbox){
  const key=bbox.map(n=>n.toFixed(3)).join(',');
  if(key===radarKey&&Date.now()-radarReadAt<180000)return;
  radarController?.abort();
  const request=new AbortController();
  radarController=request;
  try{
   const response=await fetch('/api/map-radars?bbox='+encodeURIComponent(bbox.join(',')),
    {signal:request.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Radares públicos: '+response.status);
   const data=await response.json();
   if(done||request.signal.aborted)return;
   if(Array.isArray(data?.features)){
    // Preserve an existing mapped-radar snapshot during transient failures.
    if(!data.error||data.features.length){
     radarItems=data.features.filter(x=>x?.type==='radar'&&Array.isArray(x.coords)).slice(0,120);
     rememberPublicFeatures(sourceCache,radarItems);
    }
    mergeSources();
    render();
   }
   if(key!==radarKey)radarRetryCount=0;
   radarKey=key;
   radarReadAt=Date.now();
   if(data.refreshing===true||data.error||data.features?.length===0&&data.available!==true&&data.coverage!=='national-snapshot'){
    // Global snapshots refresh in the background. Previously an unavailable
    // provider kept foreign maps blank for ~25 seconds or more.
    radarReadAt=0;
    if(radarRetryTimer!==null)clearTimeout(radarRetryTimer);
    if(radarRetryCount<(data.refreshing===true?5:3)){
     radarRetryCount++;
     radarRetryTimer=setTimeout(()=>{
      radarRetryTimer=null;
      if(done||document.hidden)return;
      const visible=mapRadarBBox(map);
      if(visible)void refreshRadars(visible);
     },data.refreshing===true?6000:5000);
    }
   }else radarRetryCount=0;
  }catch(error){
   if(error.name!=='AbortError'){
    radarKey='';radarReadAt=0;
    console.warn('VANO radars:',error?.message||String(error));
   }
  }
 }
 async function refreshRegional(bbox){
  // Region gating is server-side, with no request to a foreign provider
  // unless the viewport intersects that provider's configured coverage.
  const key=bbox.map(x=>x.toFixed(3)).join(',');
  if(key===regionalKey&&Date.now()-regionalReadAt<120000)return;
  regionalController?.abort();
  const request=new AbortController();regionalController=request;
  try{
   const response=await fetch('/api/road-events/regional?bbox='+encodeURIComponent(bbox.join(',')),
    {signal:request.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Regional roads: '+response.status);
   const data=await response.json();
   if(done||request.signal.aborted)return;
   if(Array.isArray(data?.features)&&data.features.length){
    rememberPublicFeatures(sourceCache,data.features.filter(x=>x?.regional===true).slice(0,100));
    mergeSources();render();
   }
   regionalKey=key;regionalReadAt=Date.now();
   if(data?.sources?.some(x=>x.status==='loading')){
    // An upstream cold start is deliberately nonblocking; fetch the new
    // snapshot once after the server-side asynchronous refresh.
    if(regionalTimer!==null)clearTimeout(regionalTimer);
    regionalTimer=setTimeout(()=>{
     regionalTimer=null;
     if(done||document.hidden)return;
     regionalReadAt=0;
     const latest=mapFeatureBBox(map,backend);
     if(latest)void refreshRegional(latest);
    },4600);
   }
  }catch(error){
   if(error?.name!=='AbortError'){regionalKey='';regionalReadAt=0;}
  }
 }
 async function refreshTomTomPoi(bbox){
  if(done||document.hidden||tomtomDisabled)return;
  const key=bbox.map(n=>n.toFixed(3)).join(',');
  if(key===tomtomPoiKey&&Date.now()-tomtomPoiReadAt<120000)return;
  tomtomPoiController?.abort();
  const request=new AbortController();tomtomPoiController=request;
  try{
   const response=await fetch('/api/places/tomtom?bbox='+encodeURIComponent(bbox.join(',')),
    {signal:request.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('TomTom POI: '+response.status);
   const result=await response.json();
   if(done||request.signal.aborted)return;
   if(result.enabled===false){tomtomPoiKey=key;tomtomPoiReadAt=Date.now();return;}
   if(Array.isArray(result.features)&&result.features.length){
    rememberPublicFeatures(sourceCache,result.features.filter(p=>p?.poi===true&&p.source==='TomTom Search').slice(0,70));
    mergeSources();render();
   }
   tomtomPoiKey=key;tomtomPoiReadAt=Date.now();
   if(result.status==='loading'){
    if(tomtomPoiTimer!==null)clearTimeout(tomtomPoiTimer);
    tomtomPoiTimer=setTimeout(()=>{
     tomtomPoiTimer=null;
     if(done||document.hidden)return;
     tomtomPoiReadAt=0;
     const latest=mapFeatureBBox(map,backend);
     if(latest)void refreshTomTomPoi(latest);
    },3700);
   }
  }catch(error){
   if(error?.name!=='AbortError')tomtomPoiReadAt=Date.now()-90000;
  }
 }
 async function refreshCharge(bbox){
  if(done||document.hidden||chargeDisabled)return;
  const key=bbox.map(n=>n.toFixed(3)).join(',');
  if(key===chargeKey&&Date.now()-chargeReadAt<150000)return;
  chargeController?.abort();
  const request=new AbortController();chargeController=request;
  try{
   const response=await fetch('/api/places/openchargemap?bbox='+encodeURIComponent(bbox.join(',')),
    {signal:request.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Charging POIs: '+response.status);
   const data=await response.json();
   if(done||request.signal.aborted)return;
   if(data.enabled===false){chargeDisabled=true;return;}
   if(Array.isArray(data.features)&&data.features.length){
    rememberPublicFeatures(sourceCache,data.features.filter(p=>
     p?.type==='estacao-recarga'&&p?.source==='Open Charge Map').slice(0,80));
    mergeSources();render();
   }
   chargeKey=key;chargeReadAt=Date.now();
   if(data.status==='loading'){
    if(chargeTimer!==null)clearTimeout(chargeTimer);
    chargeTimer=setTimeout(()=>{
     chargeTimer=null;
     if(done||document.hidden)return;
     chargeReadAt=0;
     const latest=mapFeatureBBox(map,backend);
     if(latest)void refreshCharge(latest);
    },3600);
   }
  }catch(error){
   if(error?.name!=='AbortError'){chargeReadAt=Date.now()-140000;}
  }
 }
 async function refreshOverture(bbox){
  if(done||document.hidden||overtureDisabled)return;
  const key=bbox.map(n=>n.toFixed(3)).join(',');
  if(key===overtureKey&&Date.now()-overtureReadAt<200000)return;
  overtureController?.abort();
  const request=new AbortController();overtureController=request;
  try{
   const response=await fetch('/api/places/overture?bbox='+encodeURIComponent(bbox.join(',')),
    {signal:request.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Overture POIs: '+response.status);
   const data=await response.json();
   if(done||request.signal.aborted)return;
   if(data.enabled===false){overtureDisabled=true;return;}
   if(Array.isArray(data.features)&&data.features.length){
    rememberPublicFeatures(sourceCache,data.features.filter(p=>p?.poi===true&&p?.source==='Overture Maps').slice(0,90));
    mergeSources();render();
   }
   overtureKey=key;overtureReadAt=Date.now();
   if(data.status==='loading'){
    if(overtureTimer!==null)clearTimeout(overtureTimer);
    overtureTimer=setTimeout(()=>{
     overtureTimer=null;
     if(done||document.hidden)return;
     overtureReadAt=0;
     const visible=mapFeatureBBox(map,backend);
     if(visible)void refreshOverture(visible);
    },4600);
   }
  }catch(error){
   if(error?.name!=='AbortError'){overtureReadAt=Date.now()-190000;}
  }
 }
 async function refreshTomTom(bbox){
  if(tomtomDisabled||done||document.hidden)return;
  const key=bbox.map(n=>n.toFixed(3)).join(',');
  if(key===tomtomKey&&Date.now()-tomtomReadAt<115000)return;
  tomtomController?.abort();
  const request=new AbortController();tomtomController=request;
  try{
   const response=await fetch('/api/traffic/incidents/tomtom?bbox='+encodeURIComponent(bbox.join(',')),
    {signal:request.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('TomTom map: '+response.status);
   const data=await response.json();
   if(done||request.signal.aborted)return;
   if(data.enabled===false){tomtomDisabled=true;return;}
   if(Array.isArray(data.features)&&data.features.length){
    rememberPublicFeatures(sourceCache,data.features.filter(x=>x?.source==='TomTom Traffic').slice(0,120));
    mergeSources();render();
   }
   tomtomKey=key;tomtomReadAt=Date.now();
   if(data.status==='loading'){
    if(tomtomTimer!==null)clearTimeout(tomtomTimer);
    tomtomTimer=setTimeout(()=>{
     tomtomTimer=null;
     if(done||document.hidden)return;
     tomtomReadAt=0;
     const visible=mapFeatureBBox(map,backend);
     if(visible)void refreshTomTom(visible);
    },3500);
   }
  }catch(error){
   if(error?.name!=='AbortError'){tomtomReadAt=Date.now()-85_000;}
  }
 }
 async function refresh(){
  timer=null;if(done||document.hidden)return;
  const bbox=mapFeatureBBox(map,backend);
  const radarBbox=mapRadarBBox(map);
  if(!bbox){
   // The Overpass API only serves small high-zoom bboxes, but previously
   // loaded vector POIs are still real and must not disappear on zoom-out.
   latestKey='';radarKey='';radarController?.abort();updateVectorPoi();mergeSources();render();setNotice('');return;
  }
  updateVectorPoi();render();
  // Never wait for the slow generic OpenStreetMap POI query to discover speed cameras.
  if(radarBbox)void refreshRadars(radarBbox);
  void refreshRegional(bbox);
  void refreshTomTom(bbox);
  void refreshTomTomPoi(bbox);
  void refreshCharge(bbox);
  void refreshOverture(bbox);
  const key=bbox.map(x=>x.toFixed(3)).join(',');
  if(key===latestKey&&Date.now()-lastRead<130000)return;
  if(controller)controller.abort();
  const signal=new AbortController();controller=signal;
  try{
   const response=await fetch('/api/map-features?bbox='+encodeURIComponent(bbox.join(',')),{signal:signal.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Dados públicos: '+response.status);
   const data=await response.json();
   if(done||signal.signal.aborted)return;
   // An empty/failed upstream is not evidence that old mapped points vanished.
   // Still accept verified community reports returned alongside an OSM outage.
   const incoming=Array.isArray(data?.features)?data.features.filter(x=>x&&Array.isArray(x.coords)).slice(0,220):[];
   remoteItems=data?.error?incoming.filter(x=>x.verified===true):incoming;
   rememberPublicFeatures(sourceCache,remoteItems);
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
 // The React navigation flag changes without recreating the map or fetching POIs.
 // Refresh only the visible markers when entering or leaving guidance mode.
 map._vanoRefreshPublicPins=render;
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
  if(radarRetryTimer!==null)clearTimeout(radarRetryTimer);
  if(regionalTimer!==null)clearTimeout(regionalTimer);
  if(tomtomTimer!==null)clearTimeout(tomtomTimer);
  if(tomtomPoiTimer!==null)clearTimeout(tomtomPoiTimer);
  if(chargeTimer!==null)clearTimeout(chargeTimer);
  if(overtureTimer!==null)clearTimeout(overtureTimer);
  overtureController?.abort();
  chargeController?.abort();
  tomtomController?.abort();
  tomtomPoiController?.abort();
  controller?.abort();
  radarController?.abort();
  regionalController?.abort();
  map.off('moveend',schedule);
  map.off('zoomend',schedule);
  if(backend==='mapbox'){
    map.off('load',schedule);
    map.off('idle',updateVectorPoi);
    map.off('style.load',updateVectorPoi);
    map.off('sourcedata',scheduleVectorUpdate);
  }
  document.removeEventListener('visibilitychange',visibility);
  if(map._vanoRefreshPublicPins===render)delete map._vanoRefreshPublicPins;
  delete map._vanoTrafficSignals;
  clear();stableTileCache.clear();sourceCache.clear();credit.remove();tomtomCredit.remove();notice.remove();
 };
}
