import React,{useEffect,useRef,useState} from 'react';
import mapboxgl from 'mapbox-gl';
import {ArrowLeft, Crosshair, MapPin, Navigation, Users} from 'lucide-react';
import {api} from '../lib/api';
import '../admin-live-trips.css';

const empty=()=>({type:'FeatureCollection',features:[]});
export default function AdminLiveTrips({onClose}){
 const [trips,setTrips]=useState([]),[error,setError]=useState(''),[selected,setSelected]=useState(null),[mapReady,setMapReady]=useState(false);
 const container=useRef(null),map=useRef(null),fitted=useRef(false),tripsRef=useRef([]);
 tripsRef.current=trips;
 useEffect(()=>{
  const token=(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN||'').trim();
  if(!token){setError('Mapa indisponível: token Mapbox não configurado.');return;}
  mapboxgl.accessToken=token;
  let instance;
  try{instance=new mapboxgl.Map({container:container.current,style:'mapbox://styles/mapbox/dark-v11',center:[-46.65,-23.56],zoom:10,pitch:55,bearing:-15,antialias:true,attributionControl:true});}
  catch{setError('Não foi possível abrir o mapa 3D neste dispositivo.');return;}
  map.current=instance;
  instance.on('load',()=>{
   const layers=instance.getStyle().layers||[];
   const before=layers.find(l=>l.type==='symbol'&&l.layout?.['text-field'])?.id;
   if(instance.getSource('composite'))instance.addLayer({id:'live-buildings',source:'composite','source-layer':'building',type:'fill-extrusion',minzoom:14,filter:['==','extrude','true'],paint:{'fill-extrusion-color':'#30353d','fill-extrusion-height':['coalesce',['get','height'],0],'fill-extrusion-base':['coalesce',['get','min_height'],0],'fill-extrusion-opacity':0.85}},before);
   instance.addSource('live-routes',{type:'geojson',data:empty()});
   instance.addLayer({id:'live-routes-line',type:'line',source:'live-routes',paint:{'line-color':'#70aaff','line-width':4,'line-opacity':0.8},layout:{'line-join':'round','line-cap':'round'}});
   instance.addSource('live-points',{type:'geojson',data:empty()});
   instance.addLayer({id:'live-points-halo',type:'circle',source:'live-points',paint:{'circle-radius':15,'circle-color':'#6da7ff','circle-opacity':0.18}});
   instance.addLayer({id:'live-points-core',type:'circle',source:'live-points',paint:{'circle-radius':6,'circle-color':'#8bbaff','circle-stroke-color':'#ffffff','circle-stroke-width':2}});
   instance.on('click','live-points-core',e=>{const id=e.features?.[0]?.properties?.id;if(id)setSelected(id);});
   instance.on('mouseenter','live-points-core',()=>{instance.getCanvas().style.cursor='pointer';});
   instance.on('mouseleave','live-points-core',()=>{instance.getCanvas().style.cursor='';});
   setMapReady(true);
  });
  return()=>{instance.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  let alive=true,busy=false;
  const refresh=async()=>{if(busy)return;busy=true;try{const data=await api('/admin/live-trips');if(alive){setTrips(data.trips||[]);setError('');}}catch{if(alive)setError('Não foi possível atualizar as viagens. Tentando novamente.');}finally{busy=false;}};
  void refresh();const timer=setInterval(refresh,5000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 useEffect(()=>{
  const m=map.current;if(!m||!mapReady)return;
  const points={type:'FeatureCollection',features:trips.map(t=>({type:'Feature',properties:{id:t.id},geometry:{type:'Point',coordinates:t.coords}}))};
  const routes={type:'FeatureCollection',features:trips.filter(t=>(t.route||t.trail)?.length>1).map(t=>({type:'Feature',properties:{id:t.id},geometry:{type:'LineString',coordinates:t.route||t.trail}}))};
  m.getSource('live-points')?.setData(points);m.getSource('live-routes')?.setData(routes);
  if(trips.length&&!fitted.current){const bounds=new mapboxgl.LngLatBounds();trips.forEach(t=>bounds.extend(t.coords));m.fitBounds(bounds,{padding:100,maxZoom:15,duration:0});fitted.current=true;}
 },[trips,mapReady]);
 function focusAll(){const m=map.current;if(!m||!tripsRef.current.length)return;const bounds=new mapboxgl.LngLatBounds();tripsRef.current.forEach(t=>bounds.extend(t.coords));m.fitBounds(bounds,{padding:100,maxZoom:15,duration:800});setSelected(null);}
 function focusTrip(trip){setSelected(trip.id);map.current?.flyTo({center:trip.coords,zoom:16,pitch:60,duration:900,essential:false});}
 const current=trips.find(t=>t.id===selected);
 return <section className="alt-overlay" role="dialog" aria-modal="true" aria-label="Mapa de viagens em andamento">
  <div ref={container} className="alt-map" aria-label="Mapa 3D das viagens"/>
  <header className="alt-toolbar"><button className="alt-glass alt-back" type="button" onClick={onClose}><ArrowLeft size={18}/> <span>Voltar</span></button><div className="alt-title"><span className="alt-live-dot"/><div><strong>Viagens em andamento</strong><small>Mapa ao vivo</small></div></div><button className="alt-glass alt-all" type="button" onClick={focusAll} disabled={!trips.length}><Crosshair size={17}/> <span>Ver todos</span></button></header>
  <div className="alt-status"><Users size={15}/><span>{trips.length} {trips.length===1?'viagem ativa':'viagens ativas'}</span><span className="alt-status-divider"/>Atualização a cada 5 s</div>
  {error&&<p className="alt-error" role="alert">{error}</p>}
  {current&&<aside className="alt-detail"><button type="button" className="alt-detail-close" onClick={()=>setSelected(null)} aria-label="Fechar detalhes">×</button><span className="alt-detail-icon"><Navigation size={18}/></span><small>VIAGEM SELECIONADA</small><h2>{current.user?.name||'Visitante'}</h2><p><MapPin size={14}/> Atualizado às {new Date(current.updatedAt).toLocaleTimeString('pt-BR')}</p><p>{Math.round(current.meters)} m percorridos · precisão {Math.round(current.accuracy)} m</p><p>{current.route?'Rota planejada em azul':'Aguardando rota planejada'}</p></aside>}
  <nav className="alt-trip-list" aria-label="Viagens ativas">{trips.map(t=><button className={'alt-trip'+(selected===t.id?' is-active':'')} key={t.id} type="button" onClick={()=>focusTrip(t)}><span className="alt-trip-dot"/><span><strong>{t.user?.name||'Visitante'}</strong><small>{new Date(t.updatedAt).toLocaleTimeString('pt-BR')}</small></span></button>)}{!trips.length&&!error&&<div className="alt-empty">Nenhuma viagem em andamento</div>}</nav>
 </section>;
}
