import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './v40-public-map.css';
import './partner-map.css';
import {attachPublicMapOverlay} from './lib/mapPublicOverlay.js';
import {createPartnerSessionClient} from './lib/partnerSessionClient.mjs';
import {arrivalMarkerSvg} from './lib/arrivalMarker.js';
import {partnerPlace,resolvePartnerPlace,locatePartnerUser} from './lib/partnerInputs.mjs';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;

/** Same map/search application in the hosted embed and native SDK. */
export async function mountPartnerMap(container,{session,apiBase,token,onEvent=()=>{},onSessionExpired=null,shadow=true,controls,autoLocate,autoRoute=true,origin:providedOrigin,location:providedLocation,destination:providedDestination,query:providedQuery,address:providedAddress}={}){
 if(!container?.append)throw Error('Informe um elemento para o mapa.');
 const base=apiBase||session?.api_base||new URL('/api/partner/v1',import.meta.url).href;
 const host=shadow&&container.attachShadow?(container.shadowRoot||container.attachShadow({mode:'open'})):container;
 const root=document.createElement('section');root.className='map-page vano-partner-root';
 root.innerHTML='<div class="vano-partner-canvas" aria-label="Mapa VANO"></div><section class="vano-partner-panel" aria-label="Busca e rotas"><header><strong>VANO <small>MAPS</small></strong><button data-action="theme" aria-label="Alternar tema">◐</button><button data-action="tilt" aria-label="Alternar mapa 3D">3D</button></header><label>Origem<input data-field="origin" autocomplete="off" placeholder="Endereço de origem" role="combobox" aria-autocomplete="list" aria-expanded="false"></label><label>Destino<input data-field="destination" autocomplete="off" placeholder="Para onde você vai?" role="combobox" aria-autocomplete="list" aria-expanded="false"></label><div class="vano-partner-results" role="listbox" hidden></div><div class="vano-partner-tools"><select aria-label="Modo de transporte"><option value="car">Carro</option><option value="motorcycle">Moto</option><option value="walking">A pé</option></select><button data-action="locate">Minha localização</button><button data-action="route">Traçar rota</button></div><p class="vano-partner-status" role="status">Carregando mapa…</p><div class="vano-partner-routes" aria-label="Alternativas"></div><details hidden><summary>Orientações</summary><ol></ol></details></section>';
 root.querySelectorAll('button').forEach(b=>b.type='button');host.append(root);
 const $=s=>root.querySelector(s),list=$('.vano-partner-results');
 $('.vano-partner-panel').hidden=true;
 let map=null,data=null,overlay=null,timer=null,searchTimer=null,searchAbort=null,generation=0,originPoint=null,destination=null,routes=[],choice=0,theme='light',destroyed=false,field=null,selected=-1,results=[],destinationMarker=null,originMarker=null;
 let originRevision=0,destinationRevision=0,pendingOrigin=null,pendingDestination=null,locationTask=null,calculationTask=null,calculationKey='',calculationAt=0;
 const notify=(type,detail={})=>{if(destroyed)return;onEvent({type,...detail});container.dispatchEvent(new CustomEvent('vano:'+type,{detail}));if(window.parent!==window&&data?.allowed_origin)window.parent.postMessage({type:'vano:'+type,...detail},data.allowed_origin);};
 const show=text=>{const s=$('.vano-partner-status');s.textContent=text||'';s.hidden=!text;};
 const error=e=>{if(destroyed||e?.name==='AbortError')return;show(e.message||'Falha ao consultar mapa.');notify('error',{message:e.message,code:e.code,request_id:e.requestId});};
 const schedule=next=>{clearTimeout(timer);const expires=Date.parse(next.expires_at),until=Date.parse(next.session_until),last=Number.isFinite(until)&&expires>=until;if(!destroyed)timer=setTimeout(()=>void client.renew().catch(error),Math.max(1000,expires-Date.now()+(last?100:-60000)));};
 const client=createPartnerSessionClient({token:token||session?.browser_token,baseURL:base,onRenew:schedule,onExpired:onSessionExpired});
 function clearRoute(){routes=[];choice=0;calculationKey='';$('.vano-partner-routes').replaceChildren();$('details').hidden=true;map?.getSource('vano-partner-route')?.setData({type:'FeatureCollection',features:[]});}
 function pick(which,value,revision=null){
  const normalized=partnerPlace(value);if(!normalized)throw Error('Coordenadas inválidas.');
  if(which==='origin'){if(revision!==null&&revision!==originRevision)return null;if(revision===null)originRevision++;}
  else{if(revision!==null&&revision!==destinationRevision)return null;if(revision===null)destinationRevision++;}
  const p={...value,...normalized};clearRoute();
  if(which==='origin')originPoint=p;else destination=p;
  $('[data-field="'+which+'"]').value=p.name;list.hidden=true;root.querySelectorAll('input').forEach(x=>x.setAttribute('aria-expanded','false'));
  if(which==='destination'){destinationMarker?.remove();const node=document.createElement('div');node.className='vano-partner-arrival';node.innerHTML=arrivalMarkerSvg();destinationMarker=new mapboxgl.Marker({element:node,anchor:'bottom'}).setLngLat(p.coords).addTo(map);}
  else{originMarker?.remove();originMarker=new mapboxgl.Marker({color:'#267ac5'}).setLngLat(p.coords).addTo(map);}
  map.flyTo({center:p.coords,zoom:Math.max(14,map.getZoom()),duration:350});notify('place-selected',{field:which,place:p});
  return p;
 }
 function draw(fit=false){
  const r=routes[choice];if(!map?.isStyleLoaded()||!r)return;
  const geo={type:'Feature',properties:{},geometry:r.geometry};
  if(map.getSource('vano-partner-route'))map.getSource('vano-partner-route').setData(geo);
  else{map.addSource('vano-partner-route',{type:'geojson',data:geo});for(const [id,color,width]of [['casing','#fff',10],['line','#ff7900',6]])map.addLayer({id:'vano-partner-route-'+id,type:'line',source:'vano-partner-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':width}});}
  if(fit){const b=new mapboxgl.LngLatBounds();for(const p of r.geometry.coordinates)b.extend(p);const panel=!$('.vano-partner-panel').hidden,mobile=root.clientWidth<=650;map.fitBounds(b,{padding:{top:panel&&mobile?Math.min(root.clientHeight*.5,280):40,bottom:40,left:panel&&!mobile?365:35,right:35},maxZoom:16,duration:350});}
  const area=$('.vano-partner-routes');area.replaceChildren();
  routes.forEach((r,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(i===choice));b.textContent=(r.profile==='safe'?'Safe':'Rápida')+' · '+Math.ceil(r.duration_s/60)+' min · '+(r.distance_m/1000).toFixed(1)+' km';b.onclick=()=>{choice=i;draw();notify('route-selected',{route:r});};area.append(b);});
  $('details').hidden=false;const ol=$('ol');ol.replaceChildren();for(const s of r.steps||[]){const li=document.createElement('li');li.textContent=s.instruction+(s.distance_m!==null?' · '+s.distance_m+' m':'');ol.append(li);}
  show('Tempo estimado. Confira as condições e a sinalização da via.');
 }
 async function calculate(options={}){
  if(destroyed)return null;
  try{
  if(options.origin!==undefined)await setOrigin(options.origin,{calculate:false});
  if(options.destination!==undefined||options.address!==undefined||options.query!==undefined)await setDestination(options.destination??options.address??options.query,{calculate:false});
  if(options.mode!==undefined){if(!['car','motorcycle','walking'].includes(options.mode))throw Error('Modo de transporte inválido.');$('select').value=options.mode;}
  await pendingOrigin;await pendingDestination;
  }catch(e){error(e);return null;}
  if(!originPoint){try{await locate();}catch(e){if(!originPoint){error(e);return null;}}}
  if(!originPoint||!destination){notify('location-required');show('O parceiro precisa enviar a origem e o destino.');return null;}
  const originSnapshot=originRevision,destinationSnapshot=destinationRevision;
  const body={origin:{lat:originPoint.coords[1],lng:originPoint.coords[0]},destination:{lat:destination.coords[1],lng:destination.coords[0]},mode:$('select').value,profile:'fastest',alternatives:2};
  const key=JSON.stringify(body);if(calculationTask&&key===calculationKey&&(Date.now()-calculationAt<2000))return calculationTask;
  calculationKey=key;calculationAt=Date.now();
  const b=$('[data-action="route"]');b.disabled=true;show('Calculando alternativas…');
  calculationTask=(async()=>{try{const value=await client.request('/routes',{method:'POST',body});if(destroyed||originSnapshot!==originRevision||destinationSnapshot!==destinationRevision)return null;routes=value.routes;choice=0;draw(true);notify('routes',{routes});return value;}catch(e){error(e);return null;}finally{b.disabled=false;}})();return calculationTask;
 }
 async function search(q,{signal}={}){const params=new URLSearchParams({q,limit:'30'}),bias=originPoint?.coords||map?.getCenter()?.toArray();if(valid(bias)){params.set('lng',bias[0]);params.set('lat',bias[1]);}return (await client.request('/places/search?'+params,{signal})).items;}
 async function resolveAndPick(which,value){
  const revision=which==='origin'?++originRevision:++destinationRevision;
  clearRoute();
  const p=await resolvePartnerPlace(value,{search,details:id=>client.request('/places/'+encodeURIComponent(id))});
  if(destroyed)return null;return pick(which,p,revision);
 }
 function setOrigin(value,{calculate:shouldCalculate=autoRoute}={}){pendingOrigin=resolveAndPick('origin',value);pendingOrigin.then(()=>{if(shouldCalculate&&destination&&!routes.length)void calculate();}).catch(error);return pendingOrigin;}
 function setDestination(value,{calculate:shouldCalculate=autoRoute}={}){pendingDestination=resolveAndPick('destination',value);pendingDestination.then(()=>{if(shouldCalculate)void calculate();}).catch(error);return pendingDestination;}
 async function locate(){
  if(locationTask)return locationTask;
  const revision=originRevision;
  if(window.parent!==window&&data?.allowed_origin)window.parent.postMessage({type:'vano:request-location'},data.allowed_origin);
  notify('location-status',{status:'requesting'});
  locationTask=locatePartnerUser().then(async p=>{
   if(destroyed||originRevision!==revision)return originPoint;
   const selected=pick('origin',p);notify('location',{place:selected,status:'available'});
   if(data?.features.search)void client.request('/geocode/reverse?lat='+p.lat+'&lng='+p.lng).then(r=>{if(!destroyed&&originPoint===selected&&r.found)notify('location-address',{place:selected,address:r.address});}).catch(()=>{});
   return selected;
  }).catch(e=>{if(originRevision!==revision&&originPoint)return originPoint;notify('location-status',{status:e.code==='LOCATION_PERMISSION_REQUIRED'?'permission-required':'unavailable',code:e.code});throw e;}).finally(()=>{locationTask=null;});
  return locationTask;
 }
 function setRoutes(value){const next=Array.isArray(value)?value:value?.routes??value?.data?.routes;if(!Array.isArray(next)||!next.length||next.length>3||next.some(r=>r.geometry?.type!=='LineString'||!Array.isArray(r.geometry.coordinates)||r.geometry.coordinates.length<2||r.geometry.coordinates.length>50000||!r.geometry.coordinates.every(valid)||!Number.isFinite(r.duration_s)||!Number.isFinite(r.distance_m)))throw Error('Rotas inválidas. Use a resposta de /routes.');routes=next;choice=0;draw(true);notify('routes',{routes});}
 async function update(value={}){if(value.mode!==undefined){if(!['car','motorcycle','walking'].includes(value.mode))throw Error('Modo de transporte inválido.');$('select').value=value.mode;}if(value.origin!==undefined||value.location!==undefined)await setOrigin(value.origin??value.location,{calculate:false});if(value.destination!==undefined||value.query!==undefined||value.address!==undefined)await setDestination(value.destination??value.address??value.query,{calculate:false});if(value.routes) return setRoutes(value.routes);if(value.calculate!==false&&destination)return calculate();}
 function showResults(items,which){
  results=items;selected=-1;list.replaceChildren();list.hidden=false;
  if(!items.length){const p=document.createElement('p');p.textContent='Nenhum resultado. Inclua bairro, cidade ou número.';list.append(p);return;}
  items.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.id='vano-result-'+i;b.setAttribute('aria-selected','false');const title=document.createElement('strong'),address=document.createElement('small');title.textContent=p.name;address.textContent=p.address;b.append(title,address);b.onclick=()=>{pick(which,p);show('Local selecionado. Toque em Traçar rota.');};list.append(b);});
 }
 for(const input of root.querySelectorAll('input')){
  input.addEventListener('input',()=>{field=input.dataset.field;const which=field,current=++generation;searchAbort?.abort();clearTimeout(searchTimer);clearRoute();if(which==='origin'){originPoint=null;originRevision++;}else{destination=null;destinationRevision++;}const q=input.value.trim();if(q.length<2){list.hidden=true;return;}show('Buscando endereços…');searchTimer=setTimeout(async()=>{searchAbort=new AbortController();try{const items=await search(q,{signal:searchAbort.signal});if(current!==generation||destroyed)return;showResults(items,which);input.setAttribute('aria-expanded','true');show('');}catch(e){error(e);}},300);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){list.hidden=true;input.setAttribute('aria-expanded','false');return;}if(list.hidden||!results.length||field!==input.dataset.field)return;if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;[...list.querySelectorAll('button')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant','vano-result-'+selected);list.querySelectorAll('button')[selected]?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&selected>=0){e.preventDefault();pick(input.dataset.field,results[selected]);}});
 }
 $('[data-action="route"]').onclick=()=>void calculate();
 $('[data-action="locate"]').onclick=()=>void locate().then(()=>{if(destination&&autoRoute)void calculate();}).catch(error);
 const onMessage=e=>{
  if(e.source!==window.parent||e.origin!==data?.allowed_origin||!e.data||typeof e.data!=='object')return;
  try{const m=e.data;
   if(m.type==='vano:set-origin')void setOrigin(m.place??m.origin??m.location??m.position);
   if(m.type==='vano:set-destination')void setDestination(m.place??m.destination??m.address??m.query);
   if(m.type==='vano:calculate')void calculate(m.options||{});
   if(m.type==='vano:set-routes')setRoutes(m.routes??m.data);
   if(m.type==='vano:update')void update(m.state??m).catch(error);
   if(m.type==='vano:search')void search(m.query??m.address).then(items=>notify('search-results',{request_id:m.request_id,items})).catch(error);
  }catch(err){error(err);}
 };
 try{
  data=await client.request('/map-session-data');if(destroyed)return;
  if(shadow)await Promise.all((data.stylesheets||[]).map(href=>new Promise((resolve,reject)=>{const u=new URL(href);if(u.origin!==new URL(base).origin){resolve();return;}const link=document.createElement('link');link.rel='stylesheet';link.href=u.href;const timeout=setTimeout(()=>reject(Error('Não foi possível carregar os estilos do mapa. Confira style-src no parceiro.')),10000);link.onload=()=>{clearTimeout(timeout);resolve();};link.onerror=()=>{clearTimeout(timeout);reject(Error('Estilos do mapa bloqueados pelo navegador. Confira a política CSP do parceiro.'));};host.prepend(link);})));if(destroyed)return;
  theme=data.theme;root.dataset.mapAppearance=theme;if(!data.mapbox_public_token)throw Error('Mapa temporariamente indisponível.');mapboxgl.accessToken=data.mapbox_public_token;
  map=new mapboxgl.Map({container:$('.vano-partner-canvas'),style:data.styles[theme],center:data.center,zoom:data.zoom,attributionControl:true});map.addControl(new mapboxgl.NavigationControl(),'bottom-right');
  map.on('error',()=>{if(!map.isStyleLoaded())error(new Error('Mapa indisponível. Confira a rede e as permissões do provedor.'));});
  $('.vano-partner-panel').hidden=!(controls??data.controls??false);
  root.dataset.externalControls=String($('.vano-partner-panel').hidden);routes=data.routes||[];
  const initialOrigin=providedOrigin??providedLocation??data.origin;
  const initialDestination=providedDestination??providedAddress??providedQuery??data.destination??data.query;
  // Geometry may describe a previously selected trip; a camera center never does.
  if(routes[0]?.geometry?.coordinates?.length){const points=routes[0].geometry.coordinates;originPoint={coords:points[0],name:'Origem do trajeto'};destination={coords:points.at(-1),name:'Destino do trajeto'};$('[data-field="origin"]').value=originPoint.name;$('[data-field="destination"]').value=destination.name;}
  $('[data-action="theme"]').onclick=()=>{theme=theme==='dark'?'light':'dark';root.dataset.mapAppearance=theme;map.setStyle(data.styles[theme]);};
  $('[data-action="tilt"]').onclick=()=>map.easeTo({pitch:map.getPitch()>10?0:50,duration:350});
  map.on('style.load',()=>draw());map.once('load',()=>{show('');for(const m of data.markers)new mapboxgl.Marker({color:'#f2762b'}).setLngLat(m.coords).setPopup(new mapboxgl.Popup().setText(m.label)).addTo(map);overlay=attachPublicMapOverlay(map,'mapbox',()=>false,p=>void setDestination(p),()=>false,()=>null,{request:client.overlayRequest});if(routes.length)draw(true);notify('ready',{features:data.features,external_controls:$('.vano-partner-panel').hidden});});
  if(!data.features.search)for(const input of root.querySelectorAll('input'))input.disabled=true;$('[data-action="route"]').disabled=!data.features.directions;schedule(data);if(window.parent!==window)window.addEventListener('message',onMessage);
  if(initialOrigin)await setOrigin(initialOrigin,{calculate:false});
  else if(autoLocate??data.auto_locate??true)void locate().then(()=>{if(destination&&autoRoute)void calculate();}).catch(error);
  if(initialDestination)await setDestination(initialDestination);
 }catch(e){error(e);}
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>map?.resize()):null;resize?.observe(container);
 return {get map(){return map;},get origin(){return originPoint;},get destination(){return destination;},search,setOrigin,setDestination,setRoutes,update,locate,calculate,destroy(){destroyed=true;clearTimeout(timer);clearTimeout(searchTimer);searchAbort?.abort();overlay?.();resize?.disconnect();client.close();window.removeEventListener('message',onMessage);map?.remove();root.remove();}};
}
