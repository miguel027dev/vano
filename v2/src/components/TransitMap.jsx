import React,{useEffect,useRef} from 'react';
import mapboxgl from 'mapbox-gl';
import {mapboxStyleFor,VANO_ATLAS_STYLE} from '../lib/mapLayers.js';

const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function decodeTransitPolyline(encoded){
 if(typeof encoded!=='string'||encoded.length>50000)return [];
 let lat=0,lon=0,index=0;const points=[];
 const next=()=>{let result=0,shift=0,b;do{if(index>=encoded.length||shift>30)throw Error('Invalid polyline');b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):(result>>1);};
 try{while(index<encoded.length&&points.length<10000){lat+=next();lon+=next();const p=[lon/1e5,lat/1e5];if(!valid(p)||Math.abs(p[0])>180||Math.abs(p[1])>90)return [];points.push(p);}return points;}catch{return [];}
}
export function transitGeojson(itinerary){
 const features=(itinerary?.legs||[]).flatMap((leg,i)=>{
  const points=decodeTransitPolyline(leg.geometryEncoded);
  const coords=points.length>=2?points:[leg.from?.coords,leg.to?.coords].filter(valid);
  if(coords.length<2)return [];
  const lineColor=leg.transit?leg.lineColor||'#EF652B':'#778798';
  return [{type:'Feature',properties:{order:i,transit:leg.transit===true,color:lineColor},
    geometry:{type:'LineString',coordinates:coords}}];
 });
 return {type:'FeatureCollection',features};
}
export default function TransitMap({itinerary,origin,destination}){
 const container=useRef(null),instance=useRef(null),data=useRef({itinerary,origin,destination});
 data.current={itinerary,origin,destination};
 const token=(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN||'').trim();
 useEffect(()=>{
  if(!token||!container.current)return;
  mapboxgl.accessToken=token;
  const map=new mapboxgl.Map({container:container.current,style:mapboxStyleFor('streets',(import.meta.env.VITE_MAPBOX_STYLE_URL||'').trim()||VANO_ATLAS_STYLE),
    center:[0,20],zoom:1.5,attributionControl:true,logoPosition:'bottom-left',interactive:true});
  instance.current=map;
  const update=()=>{
   if(!map.isStyleLoaded())return;
   const selected=data.current;
   const geo=transitGeojson(selected.itinerary);
   const existing=map.getSource('vano-transit-legs');
   if(existing)existing.setData(geo);
   else{
    map.addSource('vano-transit-legs',{type:'geojson',data:geo});
    map.addLayer({id:'vano-transit-walking',type:'line',source:'vano-transit-legs',
      filter:['==',['get','transit'],false],paint:{'line-color':'#8390A2','line-width':4,'line-opacity':0.85,'line-dasharray':[1.6,1.2]}});
    map.addLayer({id:'vano-transit-lines',type:'line',source:'vano-transit-legs',
      filter:['==',['get','transit'],true],paint:{'line-color':['get','color'],'line-width':6,'line-opacity':0.95}});
   }
   const all=geo.features.flatMap(f=>f.geometry.coordinates).concat([selected.origin?.coords,selected.destination?.coords].filter(valid));
   if(all.length){
    const bounds=new mapboxgl.LngLatBounds();all.forEach(p=>bounds.extend(p));
    if(!bounds.isEmpty())map.fitBounds(bounds,{padding:{top:80,bottom:80,left:40,right:40},maxZoom:15,duration:450});
   }
  };
  map.on('load',update);map.on('style.load',update);
  return()=>{instance.current=null;map.remove();};
 },[token]);
 useEffect(()=>{
  const map=instance.current;if(!map)return;
  if(map.isStyleLoaded()){
   const geo=transitGeojson(itinerary);
   const source=map.getSource('vano-transit-legs');
   if(source)source.setData(geo);
   const bounds=new mapboxgl.LngLatBounds();
   geo.features.flatMap(f=>f.geometry.coordinates).concat([origin?.coords,destination?.coords].filter(valid)).forEach(p=>bounds.extend(p));
   if(!bounds.isEmpty())map.fitBounds(bounds,{padding:{top:70,bottom:80,left:40,right:40},maxZoom:15,duration:450});
  }
 },[itinerary,origin,destination]);
 return <div className="vano-transit-map" aria-label="Mapa do itinerário em transporte público">
   {token?<div ref={container} className="vano-transit-map-canvas"/>:<div className="vano-transit-map-empty">Mapa indisponível neste ambiente</div>}
   {!itinerary&&<div className="vano-transit-map-hint">Escolha origem e destino para explorar as linhas disponíveis.</div>}
 </div>;
}
