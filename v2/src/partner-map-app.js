import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './v40-public-map.css';
import './partner-map.css';
import {attachPublicMapOverlay} from './lib/mapPublicOverlay.js';
import {createPartnerSessionClient} from './lib/partnerSessionClient.mjs';
import {arrivalMarkerSvg} from './lib/arrivalMarker.js';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;

/** Same map/search application in the hosted embed and native SDK. */
export async function mountPartnerMap(container,{session,apiBase,token,onEvent=()=>{},onSessionExpired=null,shadow=true}={}){
 if(!container?.append)throw Error('Informe um elemento para o mapa.');
 const base=apiBase||session?.api_base||new URL('/api/partner/v1',import.meta.url).href;
 const host=shadow&&container.attachShadow?(container.shadowRoot||container.attachShadow({mode:'open'})):container;
 const root=document.createElement('section');root.className='map-page vano-partner-root';
 root.innerHTML='<div class="vano-partner-canvas" aria-label="Mapa VANO"></div><section class="vano-partner-panel" aria-label="Busca e rotas"><header><strong>VANO <small>MAPS</small></strong><button data-action="theme" aria-label="Alternar tema">◐</button><button data-action="tilt" aria-label="Alternar mapa 3D">3D</button></header><label>Origem<input data-field="origin" autocomplete="off" placeholder="Endereço de origem" role="combobox" aria-autocomplete="list" aria-expanded="false"></label><label>Destino<input data-field="destination" autocomplete="off" placeholder="Para onde você vai?" role="combobox" aria-autocomplete="list" aria-expanded="false"></label><div class="vano-partner-results" role="listbox" hidden></div><div class="vano-partner-tools"><select aria-label="Modo de transporte"><option value="car">Carro</option><option value="motorcycle">Moto</option><option value="walking">A pé</option></select><button data-action="locate">Minha localização</button><button data-action="route">Traçar rota</button></div><p class="vano-partner-status" role="status">Carregando mapa…</p><div class="vano-partner-routes" aria-label="Alternativas"></div><details hidden><summary>Orientações</summary><ol></ol></details></section>';
 root.querySelectorAll('button').forEach(b=>b.type='button');host.append(root);
 const $=s=>root.querySelector(s),list=$('.vano-partner-results');
 let map=null,data=null,overlay=null,timer=null,searchTimer=null,searchAbort=null,generation=0,originPoint=null,destination=null,routes=[],choice=0,theme='light',destroyed=false,field=null,selected=-1,results=[],destinationMarker=null,originMarker=null;
 const notify=(type,detail={})=>{onEvent({type,...detail});container.dispatchEvent(new CustomEvent('vano:'+type,{detail}));};
 const show=text=>{const s=$('.vano-partner-status');s.textContent=text||'';s.hidden=!text;};
 const error=e=>{if(destroyed||e?.name==='AbortError')return;show(e.message||'Falha ao consultar mapa.');notify('error',{message:e.message,code:e.code,request_id:e.requestId});};
 const schedule=next=>{clearTimeout(timer);if(!destroyed)timer=setTimeout(()=>void client.renew().catch(error),Math.max(1000,Date.parse(next.expires_at)-Date.now()-60000));};
 const client=createPartnerSessionClient({token:token||session?.browser_token,baseURL:base,onRenew:schedule,onExpired:onSessionExpired});
 function pick(which,value){
  const coords=Array.isArray(value?.coords)?value.coords:[value?.lng,value?.lat];if(!valid(coords))throw Error('Coordenadas inválidas.');
  const p={...value,coords:[...coords],name:String(value.name||value.label||'Local selecionado').slice(0,140)};
  if(which==='origin')originPoint=p;else destination=p;
  $('[data-field="'+which+'"]').value=p.name;list.hidden=true;root.querySelectorAll('input').forEach(x=>x.setAttribute('aria-expanded','false'));
  if(which==='destination'){destinationMarker?.remove();const node=document.createElement('div');node.className='vano-partner-arrival';node.innerHTML=arrivalMarkerSvg();destinationMarker=new mapboxgl.Marker({element:node,anchor:'bottom'}).setLngLat(p.coords).addTo(map);}
  else{originMarker?.remove();originMarker=new mapboxgl.Marker({color:'#267ac5'}).setLngLat(p.coords).addTo(map);}
  map.flyTo({center:p.coords,zoom:Math.max(14,map.getZoom()),duration:350});notify('place-selected',{field:which,place:p});
 }
 function draw(fit=false){
  const r=routes[choice];if(!map?.isStyleLoaded()||!r)return;
  const geo={type:'Feature',properties:{},geometry:r.geometry};
  if(map.getSource('vano-partner-route'))map.getSource('vano-partner-route').setData(geo);
  else{map.addSource('vano-partner-route',{type:'geojson',data:geo});for(const [id,color,width]of [['casing','#fff',10],['line','#ff7900',6]])map.addLayer({id:'vano-partner-route-'+id,type:'line',source:'vano-partner-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':width}});}
  if(fit){const b=new mapboxgl.LngLatBounds();for(const p of r.geometry.coordinates)b.extend(p);const mobile=root.clientWidth<=650;map.fitBounds(b,{padding:{top:mobile?Math.min(root.clientHeight*.5,280):40,bottom:40,left:mobile?35:365,right:35},maxZoom:16,duration:350});}
  const area=$('.vano-partner-routes');area.replaceChildren();
  routes.forEach((r,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(i===choice));b.textContent=(r.profile==='safe'?'Safe':'Rápida')+' · '+Math.ceil(r.duration_s/60)+' min · '+(r.distance_m/1000).toFixed(1)+' km';b.onclick=()=>{choice=i;draw();notify('route-selected',{route:r});};area.append(b);});
  $('details').hidden=false;const ol=$('ol');ol.replaceChildren();for(const s of r.steps||[]){const li=document.createElement('li');li.textContent=s.instruction+(s.distance_m!==null?' · '+s.distance_m+' m':'');ol.append(li);}
  show('Tempo estimado. Confira as condições e a sinalização da via.');
 }
 async function calculate(){
  if(!originPoint||!destination){show('Selecione a origem e o destino.');return null;}
  const b=$('[data-action="route"]');b.disabled=true;show('Calculando alternativas…');
  try{const value=await client.request('/routes',{method:'POST',body:{origin:{lat:originPoint.coords[1],lng:originPoint.coords[0]},destination:{lat:destination.coords[1],lng:destination.coords[0]},mode:$('select').value,profile:'fastest',alternatives:2}});if(destroyed)return;routes=value.routes;choice=0;draw(true);notify('routes',{routes});return value;}catch(e){error(e);return null;}finally{b.disabled=false;}
 }
 async function search(q,{signal}={}){const params=new URLSearchParams({q,limit:'30'}),bias=originPoint?.coords||map?.getCenter()?.toArray();if(valid(bias)){params.set('lng',bias[0]);params.set('lat',bias[1]);}return (await client.request('/places/search?'+params,{signal})).items;}
 function showResults(items,which){
  results=items;selected=-1;list.replaceChildren();list.hidden=false;
  if(!items.length){const p=document.createElement('p');p.textContent='Nenhum resultado. Inclua bairro, cidade ou número.';list.append(p);return;}
  items.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.id='vano-result-'+i;b.setAttribute('aria-selected','false');const title=document.createElement('strong'),address=document.createElement('small');title.textContent=p.name;address.textContent=p.address;b.append(title,address);b.onclick=()=>{pick(which,p);show('Local selecionado. Toque em Traçar rota.');};list.append(b);});
 }
 for(const input of root.querySelectorAll('input')){
  input.addEventListener('input',()=>{field=input.dataset.field;const which=field,current=++generation;searchAbort?.abort();clearTimeout(searchTimer);if(which==='origin')originPoint=null;else destination=null;const q=input.value.trim();if(q.length<2){list.hidden=true;return;}show('Buscando endereços…');searchTimer=setTimeout(async()=>{searchAbort=new AbortController();try{const items=await search(q,{signal:searchAbort.signal});if(current!==generation||destroyed)return;showResults(items,which);input.setAttribute('aria-expanded','true');show('');}catch(e){error(e);}},300);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){list.hidden=true;input.setAttribute('aria-expanded','false');return;}if(list.hidden||!results.length||field!==input.dataset.field)return;if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;[...list.querySelectorAll('button')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant','vano-result-'+selected);list.querySelectorAll('button')[selected]?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&selected>=0){e.preventDefault();pick(input.dataset.field,results[selected]);}});
 }
 $('[data-action="route"]').onclick=calculate;
 $('[data-action="locate"]').onclick=()=>{if(window.parent!==window&&data?.allowed_origin)window.parent.postMessage({type:'vano:request-location'},data.allowed_origin);if(!navigator.geolocation){show('Busque o endereço de origem.');return;}navigator.geolocation.getCurrentPosition(p=>pick('origin',{coords:[p.coords.longitude,p.coords.latitude],name:'Minha localização'}),()=>show('Permita localização no aplicativo parceiro ou busque o endereço de origem.'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});};
 const onMessage=e=>{if(e.source!==window.parent||e.origin!==data?.allowed_origin||!e.data||typeof e.data!=='object')return;try{if(e.data.type==='vano:set-origin')pick('origin',e.data.place);if(e.data.type==='vano:set-destination')pick('destination',e.data.place);if(e.data.type==='vano:calculate')void calculate();}catch(err){error(err);}};
 try{
  data=await client.request('/map-session-data');if(destroyed)return;
  if(shadow)await Promise.all((data.stylesheets||[]).map(href=>new Promise((resolve,reject)=>{const u=new URL(href);if(u.origin!==new URL(base).origin){resolve();return;}const link=document.createElement('link');link.rel='stylesheet';link.href=u.href;const timeout=setTimeout(()=>reject(Error('Não foi possível carregar os estilos do mapa. Confira style-src no parceiro.')),10000);link.onload=()=>{clearTimeout(timeout);resolve();};link.onerror=()=>{clearTimeout(timeout);reject(Error('Estilos do mapa bloqueados pelo navegador. Confira a política CSP do parceiro.'));};host.prepend(link);})));if(destroyed)return;
  theme=data.theme;root.dataset.mapAppearance=theme;if(!data.mapbox_public_token)throw Error('Mapa temporariamente indisponível.');mapboxgl.accessToken=data.mapbox_public_token;
  map=new mapboxgl.Map({container:$('.vano-partner-canvas'),style:data.styles[theme],center:data.center,zoom:data.zoom,attributionControl:true});map.addControl(new mapboxgl.NavigationControl(),'bottom-right');
  map.on('error',()=>{if(!map.isStyleLoaded())error(new Error('Mapa indisponível. Confira a rede e as permissões do provedor.'));});
  originPoint={coords:data.center,name:'Origem do mapa'};$('[data-field="origin"]').value=originPoint.name;routes=data.routes||[];
  $('[data-action="theme"]').onclick=()=>{theme=theme==='dark'?'light':'dark';root.dataset.mapAppearance=theme;map.setStyle(data.styles[theme]);};
  $('[data-action="tilt"]').onclick=()=>map.easeTo({pitch:map.getPitch()>10?0:50,duration:350});
  map.on('style.load',()=>draw());map.once('load',()=>{show('Busque um destino ou toque em um ponto do mapa.');for(const m of data.markers)new mapboxgl.Marker({color:'#f2762b'}).setLngLat(m.coords).setPopup(new mapboxgl.Popup().setText(m.label)).addTo(map);overlay=attachPublicMapOverlay(map,'mapbox',()=>false,p=>pick('destination',p),()=>false,()=>null,{request:client.overlayRequest});if(routes.length)draw(true);notify('ready',{features:data.features});});
  if(!data.features.search)for(const input of root.querySelectorAll('input'))input.disabled=true;$('[data-action="route"]').disabled=!data.features.directions;schedule(data);if(window.parent!==window)window.addEventListener('message',onMessage);
 }catch(e){error(e);}
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>map?.resize()):null;resize?.observe(container);
 return {get map(){return map;},search,setOrigin:p=>pick('origin',p),setDestination:p=>pick('destination',p),calculate,destroy(){destroyed=true;clearTimeout(timer);clearTimeout(searchTimer);searchAbort?.abort();overlay?.();resize?.disconnect();client.close();window.removeEventListener('message',onMessage);map?.remove();root.remove();}};
}
