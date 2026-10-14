import React,{useEffect,useRef} from 'react';
import mapboxgl from 'mapbox-gl';
import {mapboxStyleFor,MAPBOX_STYLES,VANO_ATLAS_STYLE} from '../lib/mapLayers.js';
import {transitGeojson,transitStopsGeojson,transitBadgeGeojson} from '../lib/transitGeometry.mjs';

const layerIds=['vt-route-halo','vt-route-walk','vt-route-transit','vt-stop-circles','vt-stop-labels','vt-stop-text','vt-badge-circles','vt-badge-text'];
function drawTransit(map,{itinerary,origin,destination},overview){
 if(!map.isStyleLoaded())return;
 const lines=transitGeojson(itinerary);
 const stops=transitStopsGeojson(itinerary,origin,destination);
 const badges=transitBadgeGeojson(itinerary);
 const addSource=(id,data)=>{
   const existing=map.getSource(id);if(existing)existing.setData(data);
   else map.addSource(id,{type:'geojson',data});
 };
 addSource('vt-legs',lines);addSource('vt-stops',stops);addSource('vt-badges',badges);
 if(!map.getLayer(layerIds[0])){
  map.addLayer({id:layerIds[0],type:'line',source:'vt-legs',paint:{'line-color':'#FFFFFF','line-width':9,'line-opacity':0.94}});
  map.addLayer({id:layerIds[1],type:'line',source:'vt-legs',filter:['==',['get','transit'],false],
   paint:{'line-color':'#84919A','line-width':4,'line-opacity':1,'line-dasharray':[1,1.4]}});
  map.addLayer({id:layerIds[2],type:'line',source:'vt-legs',filter:['==',['get','transit'],true],
   paint:{'line-color':['get','color'],'line-width':6,'line-opacity':0.98}});
  map.addLayer({id:layerIds[3],type:'circle',source:'vt-stops',
   paint:{'circle-radius':['match',['get','kind'],'transfer',7,12],
   'circle-color':['match',['get','kind'],'transfer','#FFFFFF','#EA6229'],
   'circle-stroke-color':['match',['get','kind'],'transfer','#28333C','#FFFFFF'],'circle-stroke-width':3}});
  map.addLayer({id:layerIds[4],type:'symbol',source:'vt-stops',filter:['==',['get','kind'],'transfer'],
   layout:{'text-field':['get','label'],'text-size':11,'text-font':['DIN Pro Medium','Arial Unicode MS Regular'],
      'text-offset':[0,1.35],'text-anchor':'top','text-max-width':10,'text-optional':true},
   paint:{'text-color':'#FFFFFF','text-halo-color':'#192530','text-halo-width':2.4}});
  map.addLayer({id:layerIds[5],type:'symbol',source:'vt-stops',filter:['!=',['get','kind'],'transfer'],
   layout:{'text-field':['get','label'],'text-size':12,'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],
      'text-allow-overlap':true},
   paint:{'text-color':'#FFFFFF'}});
  map.addLayer({id:layerIds[6],type:'circle',source:'vt-badges',
   paint:{'circle-radius':15,'circle-color':['get','color'],'circle-stroke-color':'#FFFFFF','circle-stroke-width':2}});
  map.addLayer({id:layerIds[7],type:'symbol',source:'vt-badges',
   layout:{'text-field':['get','label'],'text-size':10,'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],
      'text-allow-overlap':false,'text-optional':true},
   paint:{'text-color':'#FFFFFF','text-halo-color':'#17232B','text-halo-width':0.5}});
 }
 const all=lines.features.flatMap(f=>f.geometry.coordinates).concat(stops.features.map(f=>f.geometry.coordinates));
 if(all.length){
  const bounds=new mapboxgl.LngLatBounds();all.forEach(p=>bounds.extend(p));
  const h=map.getContainer().clientHeight,compact=map.getContainer().clientWidth<700;
  const padding=overview?{top:Math.min(170,Math.round(h*0.25)),bottom:Math.min(265,Math.round(h*0.37)),left:34,right:34}
    :{top:80,bottom:80,left:40,right:40};
  map.fitBounds(bounds,{padding,maxZoom:14.5,pitch:overview?22:0,duration:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:560});
 }
}
export default function TransitMap({itinerary,origin,destination,overview=false,style='streets',controller=null}){
 const container=useRef(null),instance=useRef(null),data=useRef({itinerary,origin,destination});
 data.current={itinerary,origin,destination};
 const token=(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN||'').trim();
 useEffect(()=>{
  if(!token||!container.current)return;
  mapboxgl.accessToken=token;
  const selectedStyle=style==='satellite'?MAPBOX_STYLES.satellite:mapboxStyleFor('streets',(import.meta.env.VITE_MAPBOX_STYLE_URL||'').trim()||VANO_ATLAS_STYLE);
  const map=new mapboxgl.Map({container:container.current,style:selectedStyle,center:[0,20],zoom:1.5,
    attributionControl:true,logoPosition:'bottom-left',interactive:true,pitch:0});
  instance.current=map;
  if(controller)controller.current={recenter:()=>drawTransit(map,data.current,overview)};
  const paint=()=>{if(map.isStyleLoaded())drawTransit(map,data.current,overview);};
  map.on('load',paint);map.on('style.load',paint);
  return()=>{if(controller)controller.current=null;instance.current=null;map.remove();};
 },[token,style,overview]);
 useEffect(()=>{
  const map=instance.current;
  if(!map||!map.isStyleLoaded())return;
  drawTransit(map,data.current,overview);
 },[itinerary,origin?.coords?.[0],origin?.coords?.[1],destination?.coords?.[0],destination?.coords?.[1],overview]);
 return <div className="vano-transit-map" aria-label="Mapa do itinerário em transporte público">
  {token?<div ref={container} className="vano-transit-map-canvas"/>:<div className="vano-transit-map-empty">Mapa indisponível neste ambiente</div>}
  {!itinerary&&!overview&&<div className="vano-transit-map-hint">Escolha origem e destino para explorar as linhas disponíveis.</div>}
 </div>;
}
