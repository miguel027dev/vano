import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {CAMERA_STATES,blendAngle,blendPoint,cameraTarget,clamp,damp,nextRouteBearing,validPoint} from '../lib/navigationMotion';
import {buildRouteTimeline, sampleRoute, distanceOnRoute, previewMetersPerSecond, nextManeuver} from '../lib/routeAnimation';
import {notifyNative} from '../lib/nativeShell';
import {mapboxStyleFor,leafletTilesFor,VANO_ATLAS_STYLE} from '../lib/mapLayers';

const START=[-46.6808,-23.5857];
const coord=p=>validPoint(p)?p:START;
const ll=p=>[p[1],p[0]];
const feature=r=>r?.geometry?.type==='LineString'&&r.geometry.coordinates?.length>1?{type:'Feature',properties:{id:r.id},geometry:r.geometry}:null;
const geo=features=>({type:'FeatureCollection',features:features.filter(Boolean)});
const markerElement=(kind,vehicle='carro')=>{
 const el=document.createElement('div');el.className=`map-pin map-pin-${kind}`;
 if(kind==='destination')el.textContent='⌖';
 if(kind==='vehicle') {
  // Proprietary VANO route arrow: raised orange enamel, extruded side and a soft compass halo.
  // Static markup only; no untrusted content is interpolated.
  el.className=`vano-vehicle-marker vano-direction-arrow vano-atlas-direction ${vehicle==='moto'?'vano-vehicle-moto':'vano-vehicle-car'}`;
  el.innerHTML='<svg viewBox="0 0 64 80" width="54" height="68" aria-hidden="true" focusable="false"><defs><linearGradient id="vano-atlas-fill" x1=".12" y1="0" x2=".88" y2="1"><stop offset="0" stop-color="#ff9857"/><stop offset=".55" stop-color="#F4682E"/><stop offset="1" stop-color="#DF4F1D"/></linearGradient></defs><path d="M32 8 55 61Q58 68 50 66L32 59 14 66Q6 68 9 61Z" fill="#A63A1B" opacity=".36" transform="translate(0 3)"/><path d="M32 8 55 61Q58 68 50 66L32 59 14 66Q6 68 9 61Z" fill="url(#vano-atlas-fill)" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/><path d="M32 19V51" stroke="#FFFAF6" stroke-width="2.7" stroke-linecap="round" opacity=".77"/></svg>';
 }
 return el;
};
const styleFor=layer=>mapboxStyleFor(layer,(import.meta.env.VITE_MAPBOX_STYLE_URL||'').trim()||VANO_ATLAS_STYLE);
const isLoaded=map=>{try{return map.isStyleLoaded();}catch{return false;}};

/** Single camera writer: route launch, tracking, free-look and recenter all flow through it. */
function motionController(map,latest,status){
  let frame=0,previous=0,pose={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()},reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  let suspended=false,freeLook=false,active=false,completeAt=0;
  function target(){const d=latest.current;return cameraTarget({position:d.motionCoords||d.userCoords,destination:d.destination?.coords,route:d.routes?.find(r=>r.id===d.selectedRoute),telemetry:d.previewMode?{...d.telemetry,heading:d.motionBearing,speed:12,accuracy:5}:d.telemetry,vehicle:d.vehicle,navigation:d.navigation,reducedMotion:reduced});}
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

export default function VanoMap({active=true,userCoords,destination,routes=[],selectedRoute='safe',navigation=false,layer='streets',controller,telemetry={},vehicle='carro',onMotionState,pickingOrigin=false,onPickOrigin,previewMode=false,previewRun=0,onNavigationProgress}){
  const root=useRef(null),mapRef=useRef(null),backend=useRef(null),motion=useRef(null),lastSelection=useRef(''),lastFit=useRef(''),status=useRef(CAMERA_STATES.IDLE),latest=useRef({});
  const [error,setError]=useState('');
  const visual=useRef({point:null,bearing:0,simMeters:0,last:0,lastReport:0,lastPaint:0});
  latest.current={active,userCoords,destination,routes,selectedRoute,navigation,layer,telemetry,vehicle,pickingOrigin,onPickOrigin,previewMode,previewRun,onNavigationProgress,motionCoords:visual.current.point,motionBearing:visual.current.bearing};
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
        map.on('load',()=>{update();map.once('render',()=>{requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!deleted)notifyNative({action:'firstFrame',backend:'mapbox'});}));});map.triggerRepaint();});
        map.on('click',e=>{if(latest.current.pickingOrigin)latest.current.onPickOrigin?.(e.lngLat.toArray());});
        map.on('dragstart',e=>{if(e.originalEvent&&!latest.current.pickingOrigin)motion.current?.setFree();});
        map.on('rotatestart',e=>{if(e.originalEvent)motion.current?.setFree();});
        canvas=map.getCanvas();wheelHandler=()=>motion.current?.setFree();canvas?.addEventListener('wheel',wheelHandler);
      }catch(e){console.warn('Mapbox startup failed:',e);setError('Falha na renderização Mapbox. Reinicie o mapa.');map?.remove?.();map=null;}
    }
    if(!map){
      map=L.map(root.current,{zoomControl:false,attributionControl:true}).setView(ll(initial),12);
      const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
      tiles.once('load',()=>requestAnimationFrame(()=>{if(!deleted)notifyNative({action:'firstFrame',backend:'leaflet'});}));map._vanoTiles=tiles;map._vanoLayer=L.layerGroup().addTo(map);
      backend.current='leaflet';mapRef.current=map;
      paintLeaflet(map,latest.current);
      map.on('click',e=>{if(latest.current.pickingOrigin)latest.current.onPickOrigin?.([e.latlng.lng,e.latlng.lat]);});
    }
    if(controller)controller.current={center:()=>{if(backend.current==='mapbox'){if(latest.current.navigation)motion.current?.recenter();else if(validPoint(latest.current.userCoords))map.flyTo({center:latest.current.userCoords,zoom:Math.max(map.getZoom(),14),duration:650});}else if(validPoint(latest.current.userCoords))map.panTo(ll(latest.current.motionCoords||latest.current.userCoords),{animate:true});},zoomIn:()=>backend.current==='mapbox'?motion.current?.zoom(1):map.zoomIn(),zoomOut:()=>backend.current==='mapbox'?motion.current?.zoom(-1):map.zoomOut(),tilt:()=>motion.current?.tilt()};
    function visibility(){if(document.hidden||!latest.current.active)motion.current?.suspend();else motion.current?.resume();}
    document.addEventListener('visibilitychange',visibility);
    return()=>{deleted=true;document.removeEventListener('visibilitychange',visibility);if(wheelHandler)canvas?.removeEventListener('wheel',wheelHandler);motion.current?.end();if(controller)controller.current=null;motion.current=null;mapRef.current=null;backend.current=null;try{map?.remove?.();}catch(e){console.warn(e.message);}};
  },[token]);
  useEffect(()=>{const map=mapRef.current;if(!map)return;if(!active)motion.current?.suspend();else{if(backend.current==='mapbox')map.resize();else map.invalidateSize({animate:false});motion.current?.resume();}},[active]);
  // Render route only when route changes, not every camera frame. Camera uses an independent RAF writer.
  useEffect(()=>{const map=mapRef.current;if(!map)return;if(backend.current==='mapbox'){if(isLoaded(map)){paintMapbox(map,latest.current,lastSelection);if(navigation)motion.current?.start();else if(destination?.coords){const fitKey=`${destination.id}|${selectedRoute}`;if(lastFit.current!==fitKey){lastFit.current=fitKey;motion.current?.preview();}}}}else{paintLeaflet(map,latest.current);if(navigation&&!previewMode&&validPoint(userCoords))map.panTo(ll(userCoords),{animate:true});}},[userCoords?.[0],userCoords?.[1],destination?.id,routes,selectedRoute,navigation,previewMode,telemetry?.heading,telemetry?.speed,telemetry?.accuracy]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='mapbox')return;
    const style=styleFor(layer);
    if(map._vanoStyle===style)return;
    // setStyle is valid during style loading. Waiting for map.loaded() can drop rapid layer taps.
    try{
      map._vanoStyle=style;
      setError('');
      map.setStyle(style,{diff:false});
      // style.load rehydrates route sources/layers and markers for the new style.
    }catch(e){map._vanoStyle='';setError('Não foi possível trocar a camada. Tente novamente.');console.warn('Mapbox style:',e.message);}
  },[layer,token]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='leaflet')return;
    const tiles=leafletTilesFor(layer);
    if(map._vanoTiles?._url!==tiles.url){
      // Leaflet has no setAttribution(): replace the layer so legal credits update too.
      if(map._vanoTiles)map.removeLayer(map._vanoTiles);
      map._vanoTiles=L.tileLayer(tiles.url,{maxZoom:19,attribution:tiles.attribution}).addTo(map);
    }
  },[layer]);
  useEffect(()=>{if(!navigation){status.current=CAMERA_STATES.IDLE;lastFit.current='';return;}motion.current?.recenter();},[navigation]);
  // The visual pose has its own RAF clock. GPS remains authoritative; preview never mutates GPS or history.
  useEffect(()=>{
    if(!active||!navigation){visual.current={point:null,bearing:0,simMeters:0,last:0,lastReport:0,lastPaint:0};return;}
    const route=routes?.find(r=>r.id===selectedRoute)||routes?.[0];
    const timeline=buildRouteTimeline(route?.geometry);
    if(previewMode && (!timeline.total || timeline.points.length<2))return;
    let raf=0,stopped=false;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    let state={...visual.current,simMeters:0,last:0,lastReport:0,lastPaint:0,point:previewMode?timeline.points[0]:validPoint(userCoords)?userCoords:null};
    visual.current=state;
    const simVelocity=previewMetersPerSecond(timeline.total,route?.duration);
    function animate(now){
      if(stopped)return;
      raf=requestAnimationFrame(animate);
      if(document.hidden||!latest.current.active){state.last=now;return;}
      if(state.last && now-state.last<28)return; // max ~35 fps avoids battery drain
      const dt=state.last?Math.min(now-state.last,100):33;state.last=now;
      const d=latest.current;
      const target=previewMode?sampleRoute(timeline,state.simMeters):validPoint(d.userCoords)?{point:d.userCoords,bearing:nextRouteBearing(d.userCoords,route?.geometry,Math.max(35,(Number(d.telemetry?.speed)||0)*4))??d.telemetry?.heading}:null;
      if(!target?.point)return;
      if(previewMode)state.simMeters=Math.min(timeline.total,state.simMeters+simVelocity*dt/1000);
      const point=previewMode?sampleRoute(timeline,state.simMeters).point:blendPoint(state.point,target.point,dt,reduced?70:270);
      const heading=previewMode?sampleRoute(timeline,state.simMeters).bearing:(Number.isFinite(d.telemetry?.heading)&&d.telemetry.heading>=0&&d.telemetry.speed>1.5?d.telemetry.heading:target.bearing);
      state.bearing=Number.isFinite(heading)?blendAngle(state.bearing,heading,1-Math.pow(.5,dt/(reduced?80:240))):state.bearing;
      state.point=point;
      d.motionCoords=point;d.motionBearing=state.bearing;
      const map=mapRef.current;
      if(map&&backend.current==='mapbox'){
        if(!map._vanoMarker?.current||!map._vanoMarker.current.getElement().classList.contains('vano-vehicle-marker')){
          try{if(isLoaded(map))paintMapbox(map,d,lastSelection);}catch{}
        }
        const marker=map._vanoMarker?.current;
        if(marker){marker.setLngLat(point);marker.setRotation(state.bearing);}
        if(previewMode)motion.current?.start();
        if(now-state.lastPaint>200 && timeline.points.length>1 && previewMode && isLoaded(map)){
          state.lastPaint=now;
          const position=sampleRoute(timeline,state.simMeters),at=timeline.cumulative;
          const traveled=timeline.points.filter((_,i)=>at[i]<=state.simMeters);
          traveled.push(position.point);
          map.getSource('vano-v2-traveled')?.setData(geo([{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:traveled.length>1?traveled:[point,point]}}]));
        }
      } else if(map&&backend.current==='leaflet'){
        if(!map._vanoVehicleMarker){map._vanoVehicleMarker=L.marker(ll(point),{interactive:false,icon:L.divIcon({className:'vano-leaflet-vehicle',html:markerElement('vehicle',d.vehicle).outerHTML,iconSize:[70,82],iconAnchor:[35,41]})}).addTo(map);}
        map._vanoVehicleMarker.setLatLng(ll(point));
        const svg=map._vanoVehicleMarker.getElement()?.querySelector('.vano-vehicle-marker');
        if(svg)svg.style.transform=`rotate(${state.bearing}deg)`;
        if(now-state.lastPaint>220&&!map._vanoFreeLook){state.lastPaint=now;map.panTo(ll(point),{animate:true,duration:.45});}
      }
      if(now-state.lastReport>320){
        state.lastReport=now;
        const progressed=previewMode?state.simMeters:distanceOnRoute(timeline,point);
        const guide=nextManeuver(route,timeline,progressed);
        d.onNavigationProgress?.({...guide,progress:timeline.total?progressed/timeline.total:0,preview:previewMode,finished:previewMode&&state.simMeters>=timeline.total,remaining:previewMode?Math.max(0,timeline.total-state.simMeters):null});
      }
    }
    raf=requestAnimationFrame(animate);
    return()=>{stopped=true;cancelAnimationFrame(raf);if(mapRef.current?._vanoVehicleMarker){mapRef.current._vanoVehicleMarker.remove();mapRef.current._vanoVehicleMarker=null;}visual.current={point:null,bearing:0,simMeters:0,last:0,lastReport:0,lastPaint:0};};
  },[active,navigation,previewMode,previewRun,selectedRoute,routes,token]);
  useEffect(()=>{onMotionState?.(status.current);},[navigation]);
  return <><div className={`map-container ${pickingOrigin?'choosing-origin':''}`} ref={root} role="region" aria-label="Mapa interativo de rotas"/>{error&&<div className="vano-map-alert" role="status">{error}</div>}</>;
}
function paintLeaflet(map,data){
  if(!map._vanoLayer)return;map._vanoLayer.clearLayers();
  [...(data.routes||[]).filter(x=>x.id!==data.selectedRoute),...(data.routes||[]).filter(x=>x.id===data.selectedRoute)].forEach(r=>{const points=r.geometry?.coordinates?.filter(validPoint).map(ll);if(points?.length>1)L.polyline(points,{color:r.id===data.selectedRoute?'#ff7900':'#8a9ba9',weight:r.id===data.selectedRoute?8:5,opacity:r.id===data.selectedRoute?1:.65}).addTo(map._vanoLayer);});
  if(validPoint(data.userCoords)&&!data.navigation)L.marker(ll(data.userCoords),{icon:L.divIcon({className:'',html:'<div class="map-pin map-pin-origin"></div>',iconSize:[24,24]})}).addTo(map._vanoLayer);
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
  if(!map.getSource('vano-v2-traveled'))upsert('vano-v2-traveled',geo([]));
  if(!data.navigation)map.getSource('vano-v2-traveled').setData(geo([]));
  if(!map.getLayer('vano-v2-progress'))map.addLayer({id:'vano-v2-progress',type:'line',source:'vano-v2-traveled',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#1e293b','line-width':7,'line-opacity':.85}});
  const marker=(key,point)=>{if(!validPoint(point)){map._vanoMarker?.[key]?.remove();if(map._vanoMarker)delete map._vanoMarker[key];return;}map._vanoMarker??={};const type=key==='current'?(data.navigation?'vehicle':'origin'):'destination';const current=map._vanoMarker[key];if(current&&!current.getElement().classList.contains(type==='vehicle'?'vano-vehicle-marker':`map-pin-${type}`)){current.remove();delete map._vanoMarker[key];}if(!map._vanoMarker[key])map._vanoMarker[key]=new mapboxgl.Marker({element:markerElement(type,data.vehicle),anchor:'center',rotationAlignment:type==='vehicle'?'map':'viewport',pitchAlignment:'viewport'}).setLngLat(point).addTo(map);else map._vanoMarker[key].setLngLat(point);};
  marker('current',data.navigation?(data.motionCoords||data.userCoords):data.userCoords);marker('destination',data.destination?.coords);
  if(selection.current!==data.selectedRoute){selection.current=data.selectedRoute;map.setPaintProperty('vano-v2-line','line-opacity',.84);requestAnimationFrame(()=>{if(isLoaded(map)&&map.getLayer('vano-v2-line'))map.setPaintProperty('vano-v2-line','line-opacity',1);});}
}
