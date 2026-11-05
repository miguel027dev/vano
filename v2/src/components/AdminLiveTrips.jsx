import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {api} from '../lib/api';

export default function AdminLiveTrips(){
 const [trips,setTrips]=useState([]),[error,setError]=useState('');
 const container=useRef(null),map=useRef(null),markers=useRef(null),fitted=useRef(false);
 useEffect(()=>{
  const instance=L.map(container.current).setView([-14.235,-51.925],4);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri'}).addTo(instance);
  map.current=instance;markers.current=L.layerGroup().addTo(instance);
  return()=>{instance.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  let alive=true;
  const refresh=async()=>{try{const data=await api('/admin/live-trips');if(alive){setTrips(data.trips||[]);setError('');}}catch{if(alive)setError('Não foi possível atualizar as viagens.');}};
  void refresh();const timer=setInterval(refresh,5000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!markers.current)return;markers.current.clearLayers();
  const points=trips.map(t=>[t.coords[1],t.coords[0]]);
  for(const trip of trips)if(trip.trail?.length>1)L.polyline(trip.trail.map(p=>[p[1],p[0]]),{color:'#f07835',weight:4}).addTo(markers.current);
  for(const point of points)L.circleMarker(point,{radius:7,color:'#f07835',fillOpacity:0.85}).addTo(markers.current);
  if(points.length&&!fitted.current){map.current.fitBounds(points,{padding:[35,35],maxZoom:14});fitted.current=true;}
 },[trips]);
 return <section className="v3-admin-panel" aria-label="Viagens em andamento" style={{padding:20,marginBottom:20}}>
  <h2>Viagens em andamento</h2><p>Atualização a cada 5 segundos. O traço mostra as posições recebidas desde que a viagem ficou visível; a posição pode estar atrasada por falta de sinal.</p>
  {error&&<p role="alert">{error}</p>}
  <div ref={container} aria-label="Mapa das viagens" style={{height:320,width:'100%',borderRadius:12}}/>
  {!trips.length?<p>Nenhuma viagem disponível no momento.</p>:<ul>{trips.map(t=><li key={t.id}>{t.user?.name||'Visitante'} · {Math.round(t.meters)} m percorridos · atualizado às {new Date(t.updatedAt).toLocaleTimeString('pt-BR')} · precisão aproximada {Math.round(t.accuracy)} m</li>)}</ul>}
 </section>;
}
