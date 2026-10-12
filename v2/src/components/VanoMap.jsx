import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {CAMERA_STATES,blendAngle,blendPoint,cameraTarget,clamp,damp,validPoint} from '../lib/navigationMotion';

const START=[-46.6808,-23.5857];
const coord=p=>validPoint(p)?p:START;
const ll=p=>[p[1],p[0]];
const feature=r=>r?.geometry?.type==='LineString'&&r.geometry.coordinates?.length>1?{type:'Feature',properties:{id:r.id},geometry:r.geometry}:null;
const geo=features=>({type:'FeatureCollection',features:features.filter(Boolean)});
const markerElement=kind=>{const el=document.createElement('div');el.className=`map-pin map-pin-${kind}`;if(kind==='destination')el.textContent='⌖';return el;};
const styleFor=layer=>layer==='satellite'?'mapbox://styles/mapbox/satellite-streets-v12':'mapbox://styles/mapbox/streets-v12';
const isLoaded=map=>{try{return map.isStyleLoaded();}catch{return false;}};

/** Single camera writer: route launch, tracking, free-look and recenter all flow through it. */
function motionController(map,latest,status){
  let frame=0,previous=0,pose={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()},reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  let suspended=false,freeLook=false,active=false,completeAt=0;
  function target(){const d=latest.current;return cameraTarget({position:d.userCoords,destination:d.destination?.coords,route:d.routes?.find(r=>r.id===d.selectedRoute),telemetry:d.telemetry,vehicle:d.vehicle,navigation:d.navigation,reducedMotion:reduced});}
  function draw(now){frame=0;if(!active||suspended||!latest.current.navigation||freeLook)return;const dt=previous?Math.min(90,now-previous):16;previous=now;const t=target();if(!t)return;const cameraHalfLife=reduced?85:300,pointHalfLife=reduced?90:360;
    const nextCenter=blendPoint(pose.center,t.center,dt,pointHalfLife);
    const nextZoom=damp(pose.zoom,t.zoom,dt,cameraHalfLife),nextPitch=damp(pose.pitch,t.pitch,dt,cameraHalfLife);
    const nextBearing=t.bearing==null?pose.bearing:blendAngle(pose.bearing,t.bearing,1-Math.pow(.5,dt/(reduced?90:320)));
    const error=Math.abs(nextZoom-t.zoom)+Math.abs(nextPitch-t.pitch)*.01+(t.bearing===null?0:Math.abs(((nextBearing-t.bearing+540)%360)-180)*.002)+Math.abs(nextCenter[0]-t.center[0])*2000+Math.abs(nextCenter[1]-t.center[1])*2000;
    pose={center:nextCenter,zoom:nextZoom,pitch:nextPitch,bearing:nextBearing};
    try{map.jumpTo({...pose,padding:{top:latest.current.navigation?135:30,bottom:latest.current.navigation?225:40,left:20,right:20}});}catch(e){console.warn('VANO motion:',e.message);active=false;return;}
    if(error>.005||now<completeAt){frame=requestAnimationFrame(draw);}else{active=false;status.current=t.state;}
  }
  function start(){if(suspended||freeLook||!latest.current.navigation)return;active=true;completeAt=performance.now()+650;if(!frame)frame=requestAnimationFrame(draw);}
  function setFree(){freeLook=true;active=false;cancelAnimationFrame(frame);frame=0;status.current=CAMERA_STATES.FREE;}
  function recenter(){freeLook=false;pose={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};status.current=CAMERA_STATES.RECENTER;previous=0;start();}
  function preview(){if(latest.current.navigation||freeLook)return;const d=latest.current;if(!d.destination?.coords||!d.routes?.length||!isLoaded(map))return;const selected=d.routes.find(x=>x.id===d.selectedRoute)||d.routes[0];const points=selected?.geometry?.coordinates||[coord(d.userCoords),d.destination.coords];if(!points.length)return;const bounds=new mapboxgl.LngLatBounds();points.filter(validPoint).forEach(p=>bounds.extend(p));if(!bounds.isEmpty()){map.stop();map.fitBounds(bounds,{padding:{top:180,bottom:Math.round(window.innerHeight*.4),left:55,right:55},maxZoom:14.8,duration:reduced?0:600});status.current=CAMERA_STATES.PREVIEW;}}
  function suspend(){suspended=true;active=false;cancelAnimationFrame(frame);frame=0;}
  function resume(){suspended=false;previous=0;start();}
  function end(){suspend();}
  function zoom(delta){setFree();map.zoomTo(clamp(map.getZoom()+delta,4,19),{duration:reduced?0:250});}
  function tilt(){setFree();map.easeTo({pitch:map.getPitch()>12?0:45,duration:reduced?0:320});}
  return {start,setFree,recenter,preview,suspend,resume,end,zoom,tilt,get freeLook(){return freeLook;}};
}

export default function VanoMap({userCoords,destination,routes=[],selectedRoute='safe',navigation=false,layer='streets',controller,telemetry={},vehicle='carro',onMotionState,pickingOrigin=false,onPickOrigin}){
  const root=useRef(null),mapRef=useRef(null),backend=useRef(null),motion=useRef(null),lastSelection=useRef(''),lastFit=useRef(''),status=useRef(CAMERA_STATES.IDLE),latest=useRef({});
  const [error,setError]=useState('');
  latest.current={userCoords,destination,routes,selectedRoute,navigation,layer,telemetry,vehicle,pickingOrigin,onPickOrigin};
  const token=(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN||'').trim();
  useEffect(()=>{
    let map,deleted=false,canvas=null,wheelHandler=null;const initial=coord(latest.current.userCoords);
    const report=e=>{if(!deleted){const message=e?.error?.message||e?.message||'';if(/Unauthorized|Forbidden|Invalid Token|Style not found/i.test(message))setError('Não foi possível carregar o estilo Mapbox. Verifique o token.');console.warn('Mapbox:',message);}};
    if(token){
      try{
        mapboxgl.accessToken=token;
        map=new mapboxgl.Map({container:root.current,style:styleFor(latest.current.layer),center:initial,zoom:12.4,pitch:0,attributionControl:true,antialias:false});
        map.addControl(new mapboxgl.NavigationControl({showCompass:false,showZoom:false}),'bottom-right');
        map._vanoStyle=styleFor(latest.current.layer);
        map.on('error',report);
        backend.current='mapbox';mapRef.current=map;
        motion.current=motionController(map,latest,status);
        const update=()=>{if(deleted||!isLoaded(map))return;setError('');paintMapbox(map,latest.current,lastSelection);if(latest.current.navigation)motion.current?.start();else if(latest.current.destination?.coords)motion.current?.preview();};
        map.on('style.load',update);
        map.on('load',update);
        map.on('click',e=>{if(latest.current.pickingOrigin)latest.current.onPickOrigin?.(e.lngLat.toArray());});
        map.on('dragstart',()=>{if(!latest.current.pickingOrigin)motion.current?.setFree();});
        map.on('rotatestart',()=>motion.current?.setFree());
        canvas=map.getCanvas();wheelHandler=()=>motion.current?.setFree();canvas?.addEventListener('wheel',wheelHandler);
      }catch(e){console.warn('Mapbox startup failed:',e);setError('Falha na renderização Mapbox. Reinicie o mapa.');map?.remove?.();map=null;}
    }
    if(!map){
      map=L.map(root.current,{zoomControl:false,attributionControl:true}).setView(ll(initial),12);
      const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
      map._vanoTiles=tiles;map._vanoLayer=L.layerGroup().addTo(map);
      backend.current='leaflet';mapRef.current=map;
      paintLeaflet(map,latest.current);
      map.on('click',e=>{if(latest.current.pickingOrigin)latest.current.onPickOrigin?.([e.latlng.lng,e.latlng.lat]);});
    }
    if(controller)controller.current={center:()=>{if(backend.current==='mapbox'){if(latest.current.navigation)motion.current?.recenter();else if(validPoint(latest.current.userCoords))map.flyTo({center:latest.current.userCoords,zoom:Math.max(map.getZoom(),14),duration:650});}else if(validPoint(latest.current.userCoords))map.panTo(ll(latest.current.userCoords),{animate:true});},zoomIn:()=>backend.current==='mapbox'?motion.current?.zoom(1):map.zoomIn(),zoomOut:()=>backend.current==='mapbox'?motion.current?.zoom(-1):map.zoomOut(),tilt:()=>motion.current?.tilt()};
    function visibility(){if(document.hidden)motion.current?.suspend();else motion.current?.resume();}
    document.addEventListener('visibilitychange',visibility);
    return()=>{deleted=true;document.removeEventListener('visibilitychange',visibility);if(wheelHandler)canvas?.removeEventListener('wheel',wheelHandler);motion.current?.end();if(controller)controller.current=null;motion.current=null;mapRef.current=null;backend.current=null;try{map?.remove?.();}catch(e){console.warn(e.message);}};
  },[token]);
  // Render route only when route changes, not every camera frame. Camera uses an independent RAF writer.
  useEffect(()=>{const map=mapRef.current;if(!map)return;if(backend.current==='mapbox'){if(isLoaded(map)){paintMapbox(map,latest.current,lastSelection);if(navigation)motion.current?.start();else if(destination?.coords){const fitKey=`${destination.id}|${selectedRoute}`;if(lastFit.current!==fitKey){lastFit.current=fitKey;motion.current?.preview();}}}}else{paintLeaflet(map,latest.current);if(navigation&&validPoint(userCoords))map.panTo(ll(userCoords),{animate:true});}},[userCoords?.[0],userCoords?.[1],destination?.id,routes,selectedRoute,navigation,telemetry?.heading,telemetry?.speed,telemetry?.accuracy]);
  useEffect(()=>{const map=mapRef.current;if(!map||backend.current!=='mapbox')return;const style=styleFor(layer);if(map._vanoStyle===style)return;map._vanoStyle=style;if(map.loaded()||isLoaded(map)){map.setStyle(style);}else{const change=()=>{if(!mapRef.current||mapRef.current!==map)return;map.setStyle(style);};map.once('load',change);return()=>map.off('load',change);}},[layer,token]);
  useEffect(()=>{const map=mapRef.current;if(!map||backend.current!=='leaflet')return;const url=layer==='satellite'?'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png':'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';if(map._vanoTiles?._url!==url)map._vanoTiles.setUrl(url);},[layer]);
  useEffect(()=>{if(!navigation){status.current=CAMERA_STATES.IDLE;lastFit.current='';return;}motion.current?.recenter();},[navigation]);
  useEffect(()=>{onMotionState?.(status.current);},[navigation]);
  return <><div className={`map-container ${pickingOrigin?'choosing-origin':''}`} ref={root} role="region" aria-label="Mapa interativo de rotas"/>{error&&<div className="vano-map-alert" role="status">{error}</div>}</>;
}
function paintLeaflet(map,data){
  if(!map._vanoLayer)return;map._vanoLayer.clearLayers();
  [...(data.routes||[]).filter(x=>x.id!==data.selectedRoute),...(data.routes||[]).filter(x=>x.id===data.selectedRoute)].forEach(r=>{const points=r.geometry?.coordinates?.filter(validPoint).map(ll);if(points?.length>1)L.polyline(points,{color:r.id===data.selectedRoute?'#ff7900':'#8a9ba9',weight:r.id===data.selectedRoute?8:5,opacity:r.id===data.selectedRoute?1:.65}).addTo(map._vanoLayer);});
  if(validPoint(data.userCoords))L.marker(ll(data.userCoords),{icon:L.divIcon({className:'',html:'<div class="map-pin map-pin-origin"></div>',iconSize:[24,24]})}).addTo(map._vanoLayer);
  if(validPoint(data.destination?.coords))L.marker(ll(data.destination.coords),{icon:L.divIcon({className:'',html:'<div class="map-pin map-pin-destination">⌖</div>',iconSize:[30,30]})}).addTo(map._vanoLayer);
  if(data.destination?.coords&&data.routes?.length&&!data.navigation&&map._vanoFit!==data.destination.id){map._vanoFit=data.destination.id;const selected=data.routes.find(r=>r.id===data.selectedRoute)||data.routes[0];const pts=selected.geometry?.coordinates?.filter(validPoint);if(pts?.length)map.fitBounds(L.latLngBounds(pts.map(ll)),{padding:[60,60],maxZoom:14,animate:true});}
  if(!data.destination)map._vanoFit='';
}
function paintMapbox(map,data,selection){
  if(!isLoaded(map))return;
  const routes=(data.routes||[]).filter(feature),selected=routes.find(r=>r.id===data.selectedRoute),others=routes.filter(r=>r.id!==data.selectedRoute);
  const selectedGeo=geo(selected?[feature(selected)]:[]),othersGeo=geo(others.map(feature));
  const upsert=(id,body)=>{if(map.getSource(id))map.getSource(id).setData(body);else map.addSource(id,{type:'geojson',data:body});};
  upsert('vano-v2-alternatives',othersGeo);upsert('vano-v2-selected',selectedGeo);
  if(!map.getLayer('vano-v2-other'))map.addLayer({id:'vano-v2-other',type:'line',source:'vano-v2-alternatives',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#7d91a3','line-width':5,'line-opacity':.66}});
  if(!map.getLayer('vano-v2-halo'))map.addLayer({id:'vano-v2-halo',type:'line',source:'vano-v2-selected',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':13,'line-opacity':.94}});
  if(!map.getLayer('vano-v2-line'))map.addLayer({id:'vano-v2-line',type:'line',source:'vano-v2-selected',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ff7900','line-width':8,'line-opacity':1,'line-opacity-transition':{duration:250}}});
  const marker=(key,point)=>{if(!validPoint(point)){map._vanoMarker?.[key]?.remove();if(map._vanoMarker)delete map._vanoMarker[key];return;}map._vanoMarker??={};if(!map._vanoMarker[key])map._vanoMarker[key]=new mapboxgl.Marker({element:markerElement(key==='current'?'origin':'destination'),anchor:'center'}).setLngLat(point).addTo(map);else map._vanoMarker[key].setLngLat(point);};
  marker('current',data.userCoords);marker('destination',data.destination?.coords);
  if(selection.current!==data.selectedRoute){selection.current=data.selectedRoute;map.setPaintProperty('vano-v2-line','line-opacity',.84);requestAnimationFrame(()=>{if(isLoaded(map)&&map.getLayer('vano-v2-line'))map.setPaintProperty('vano-v2-line','line-opacity',1);});}
}
