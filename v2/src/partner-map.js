import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './partner-map.css';
const status=document.querySelector('#status');
const token=new URLSearchParams(location.hash.slice(1)).get('session');
history.replaceState(null,'',location.pathname);
const show=text=>{status.textContent=text;status.hidden=false;};
try{
 if(!token)throw Error('Sessão ausente. Reabra o mapa pela integração.');
 const response=await fetch('/api/partner/v1/map-session-data',{headers:{Authorization:'Bearer '+token},credentials:'omit'});
 const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Não foi possível carregar o mapa.');
 const data=result.data;if(!data.mapbox_public_token)throw Error('Mapa temporariamente indisponível.');
 mapboxgl.accessToken=data.mapbox_public_token;
 const map=new mapboxgl.Map({container:'map',style:data.theme==='dark'?'mapbox://styles/mapbox/dark-v11':'mapbox://styles/mapbox/streets-v12',center:data.center,zoom:data.zoom,attributionControl:true});
 map.addControl(new mapboxgl.NavigationControl(),'top-right');
 map.on('error',()=>show('O mapa não respondeu. Tente abrir novamente.'));
 map.on('load',()=>{
  status.hidden=true;
  for(const m of data.markers)new mapboxgl.Marker({color:'#f2762b'}).setLngLat(m.coords).setPopup(new mapboxgl.Popup().setText(m.label)).addTo(map);
  const route=data.routes?.[0];
  if(route){
   map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:route.geometry}});
   map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f2762b','line-width':6}});
   const bounds=new mapboxgl.LngLatBounds();for(const p of route.geometry.coordinates)bounds.extend(p);map.fitBounds(bounds,{padding:40,maxZoom:16,duration:0});
   show(Math.ceil(route.duration_s/60)+' min estimados · '+(route.distance_m/1000).toFixed(1)+' km · VANO');
  }
  const remaining=Math.max(0,Date.parse(data.expires_at)-Date.now());
  setTimeout(()=>{map.remove();show('Sessão expirada. Reabra o mapa pela integração.');},remaining);
 });
}catch(e){show(e.message||'Não foi possível abrir o mapa.');}
