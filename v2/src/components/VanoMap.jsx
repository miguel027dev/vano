import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {CAMERA_STATES,blendAngle,blendPoint,cameraTarget,clamp,damp,metersBetween,nearestOnRoute,nextRouteBearing,shortestAngle,shouldFollowLocation,validPoint} from '../lib/navigationMotion';
import {buildRouteTimeline,distanceOnRoute,nextManeuver,sampleRoute} from '../lib/routeAnimation';
import {simulationPointerBearing} from '../lib/adminRouteSimulator.mjs';
import {easeGpsPoint,routeTrace} from '../lib/liveMotion.js';
import {planManeuverCamera} from '../lib/navigationCameraPlanner.js';
import {planV2DroneCamera,observeV2DroneScene,shiftDroneView,chooseV2UrbanCamera,planV2RampApproach,v2UserCenteredRampView,planV2RearChase,inspectV2RoadAhead} from '../lib/v2DroneCamera.mjs';
import {planAdaptiveRoadDistance} from '../lib/adaptiveRoadCamera.mjs';
import {planStandardSimulationCamera} from '../lib/standardSimulationCamera.mjs';
import {planV1CloseChase} from '../lib/v1CloseChase.mjs';
import {planV2FocusCamera} from '../lib/v2FocusCamera.mjs';
import {v2SimulationChasePadding} from '../lib/v2SimulationChase.mjs';
import {planStandardPlayPointer} from '../lib/standardPlayPointer.mjs';
import {syncV2BuildingVisibility,discardV2BuildingVisibility} from '../lib/v2BuildingVisibility.mjs';
import {planMotorcycleCamera} from '../lib/motorcycleCamera.js';
import {computeSafeViewport} from '../lib/safeViewport.js';
import {STATIC_ROUTE_DASH_PATTERN,STATIC_LEAFLET_DASH,sameRouteShapeReferences} from '../lib/routeFlow.js';
import {v2RouteStrokePaint,v2RouteStrokePixels,V2_ROUTE_CASING_COLOR,shouldHighlightSelectedRoute} from '../lib/v2RouteStroke.mjs';
import {notifyNative} from '../lib/nativeShell';
import {mapboxStyleFor,leafletTilesFor,leafletBackupTilesFor,VANO_ATLAS_STYLE,MAPBOX_STYLES} from '../lib/mapLayers';
import {vectorStartupDecision,MAPBOX_VECTOR_PROBE_MS,WEBGL_CONTEXT_RESTORE_MS} from '../lib/mapRecovery.mjs';
import {night3dEnabled,syncNight3DBuildings,syncNight3DCamera} from '../lib/night3DBuildings.js';
import {syncNight3DScene} from '../lib/night3DScene.js';
import {navigationArrowSvg} from '../lib/navigationArrow3d.js';
import {arrivalMarkerSvg,ARRIVAL_PIN_WIDTH,ARRIVAL_PIN_HEIGHT,ARRIVAL_PIN_ANCHOR} from '../lib/arrivalMarker.js';
import {attachPublicMapOverlay} from '../lib/mapPublicOverlay.js';
import {attachCommunityReportOverlay} from '../lib/communityReportOverlay.js';
import '../community-reports.css';
import {ensureTrafficLayers,setTrafficVisibility,TRAFFIC_SOURCE_ID} from '../lib/trafficLayers.js';
import {attachMunicipalTrafficOverlay} from '../lib/trafficMunicipal.js';
import {syncPrivateRoadSignMarkers,clearPrivateRoadSignMarkers} from '../lib/privateRoadSigns.js';
import {syncVisibleStreetCards,clearVisibleStreetCards} from '../lib/visibleStreetCards.mjs';
import '../visible-street-cards.css';
import '../private-road-signs.css';
import {syncRouteTrafficMarkers,clearRouteTrafficMarkers,syncLeafletRouteTraffic} from '../lib/routeTrafficMarkers.jsx';
import {TRAFFIC_COLORS} from '../lib/routeTraffic.mjs';
import {updateV2RouteFlow} from '../lib/v2RouteFlow.mjs';
import {buildV2ManeuverArrows} from '../lib/v2ManeuverArrows.mjs';

const START=[-46.6808,-23.5857];
const coord=p=>validPoint(p)?p:START;
const ll=p=>[p[1],p[0]];
const feature=r=>r?.geometry?.type==='LineString'&&r.geometry.coordinates?.length>1?{type:'Feature',properties:{id:r.id},geometry:r.geometry}:null;
const geo=features=>({type:'FeatureCollection',features:features.filter(Boolean)});
const markerElement=(kind,vehicle='carro')=>{
 const el=document.createElement('div');el.className=`map-pin map-pin-${kind}`;
 if(kind==='destination'){
  // A single fixed SVG across Mapbox and Leaflet, anchored at the exact GPS destination.
  el.className='map-pin-destination vano-arrival-marker';
  el.innerHTML=arrivalMarkerSvg();
 }
 if(kind==='vehicle') {
  // Procedural extruded SVG: a consistent 3D marker at every heading.
  // Both Mapbox and Leaflet reuse this single visual definition.
  el.className=`vano-vehicle-marker vano-direction-arrow vano-atlas-direction vano-3d-nav-marker ${vehicle==='moto'?'vano-vehicle-moto':'vano-vehicle-car'}`;
  el.innerHTML=navigationArrowSvg();
 }
 return el;
};
const styleFor=(layer,appearance='light')=>mapboxStyleFor(layer,(import.meta.env.VITE_MAPBOX_STYLE_URL||'').trim()||VANO_ATLAS_STYLE,appearance);
// Recover a raster basemap without recreating route/GPS/POI overlays.
// Never request the volunteer-run OSM tile host in the fallback renderer.
const EMPTY_TILE='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
function installLeafletBasemap(map,layer,token,{onReady=()=>{},onError=()=>{},appearance='light'}={}){
  const preferred=leafletTilesFor(layer,token,appearance);
  const emergency=leafletBackupTilesFor(layer);
  if(map._vanoTiles)map.removeLayer(map._vanoTiles);
  const attach=(definition,isEmergency)=>{
    const tiles=L.tileLayer(definition.url,{
      maxZoom:21,maxNativeZoom:definition.maxNativeZoom||19,
      tileSize:definition.tileSize||256,zoomOffset:definition.zoomOffset||0,
      attribution:definition.attribution,errorTileUrl:EMPTY_TILE
    });
    map._vanoTiles=tiles;
    map._vanoTilesKey=definition.url;
    let failed=0,switched=false;
    tiles.once('load',()=>{if(map._vanoTiles===tiles)onReady();});
    tiles.on('tileerror',()=>{
      if(switched||map._vanoTiles!==tiles)return;
      if(++failed<2)return;
      switched=true;
      if(!isEmergency && definition.url!==emergency.url){
        map.removeLayer(tiles);
        attach(emergency,true);
      }else onError();
    });
    tiles.addTo(map);
    // Offline/no-token Esri fallback is light imagery; invert only its tiles,
    // never the route, radar, traffic, GPS or popup panes.
    tiles.getContainer()?.classList.toggle('v49-dark-raster-legacy',
      appearance==='dark'&&layer!=='satellite'&&definition.url===emergency.url);
  };
  attach(preferred,preferred.url===emergency.url);
}
const isLoaded=map=>{try{return map.isStyleLoaded();}catch{return false;}};

/** Single camera writer: route launch, tracking, free-look and recenter all flow through it. */
function motionController(map,latest,status){
  let frame=0,previous=0,pose={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()},reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  let suspended=false,freeLook=false,active=false,completeAt=0,motoPlan=null;
  // A throttled observation of surrounding 3D buildings and upcoming route bend.
  // No queries in the RAF hot path between samples; the HUD/GPS are untouched.
  let droneScene={density:0,sideBias:0,bendDegrees:0,obstruction:0,straightAheadMeters:0},lastSceneSample=0;
  let droneSceneRoute=null;
  let urbanMode='v1',urbanModeAt=0,urbanBlend=0,lastUrbanBlendAt=0;
  // Independent real-navigation microzoom: no 3D feature queries, 850ms
  // drone cadence or simulation GPS ever leaks into the user map.
  let realRouteGeometry=null,realLastRoadAt=0,realStraightMeters=0;
  let realZoom=0,realZoomGoal=0,realLastZoomAt=0;
  let droneZoom=null,droneZoomGoal=null,lastDroneZoomAt=0;
  // Standard Play scene is independent from the V2 SIM's observation state.
  let playScene={density:0,obstruction:0,straightAheadMeters:0,bendDegrees:0};
  let playSceneRoute=null,lastPlaySceneSample=0;
  // Padding affects the projected puck as much as center/zoom: ease it too.
  let chasePaddingTop=null,chasePaddingGoal=null;
  function realCameraDistance(d,route,base,now){
    if(!base||!d.navigation||d.simulationPreview||
      !['carro','moto'].includes(d.vehicle)||!route?.geometry){
      realRouteGeometry=null;realLastRoadAt=0;realStraightMeters=0;
      realZoom=0;realZoomGoal=0;realLastZoomAt=0;
      return base;
    }
    if(realRouteGeometry!==route.geometry){
      realRouteGeometry=route.geometry;realLastRoadAt=0;
      realStraightMeters=0;realZoom=0;realZoomGoal=0;realLastZoomAt=0;
    }
    const accuracy=d.telemetry?.accuracy;
    const point=validPoint(d.motionCoords)?d.motionCoords:d.gpsCoords;
    if(!realLastRoadAt||now-realLastRoadAt>=1550){
      realLastRoadAt=now;
      const sampled=Number.isFinite(accuracy)&&accuracy<=65&&validPoint(point)?
        inspectV2RoadAhead(point,route.geometry):null;
      realStraightMeters=sampled?.available?sampled.straightMeters:0;
    }
    const distancePlan=planAdaptiveRoadDistance({
      enabled:true,vehicle:d.vehicle,maneuver:d.guidance,route,
      speed:d.telemetry?.speed,accuracy,straightMeters:realStraightMeters,
      reducedMotion:reduced,simulation:false
    });
    // Ignore changes smaller than a few hundredths of a zoom level.
    // Direction changes and nearby exits still override immediately.
    if(Math.abs(distancePlan.zoomDelta-realZoomGoal)>.022||
      (distancePlan.zoomDelta===0&&realZoomGoal!==0)){
      realZoomGoal=distancePlan.zoomDelta;
    }
    const dt=realLastZoomAt?Math.min(90,Math.max(0,now-realLastZoomAt)):16;
    realLastZoomAt=now;
    realZoom=damp(realZoom,realZoomGoal,dt,realZoomGoal>realZoom?460:1080);
    return {...base,zoom:clamp(base.zoom+realZoom,14.8,18.2)};
  }
  function sampleDroneScene(d,route,now){
    if(!d.droneSimulation){
      droneScene={density:0,sideBias:0,bendDegrees:0,obstruction:0,straightAheadMeters:0};lastSceneSample=0;
      droneSceneRoute=null;
      return droneScene;
    }
    // A new route must never inherit a previous route's straight-road estimate.
    if(droneSceneRoute!==route?.geometry){
      droneSceneRoute=route?.geometry;
      droneScene={density:0,sideBias:0,bendDegrees:0,obstruction:0,straightAheadMeters:0};
      lastSceneSample=0;
    }
    const period=(window.innerWidth||700)<650?1100:850;
    if(now-lastSceneSample<period)return droneScene;
    lastSceneSample=now;
    const point=d.motionCoords||d.gpsCoords;
    if(!validPoint(point))return droneScene;
    const heading=Number.isFinite(d.motionBearing)?d.motionBearing:(d.telemetry?.heading||0);
    const roadAhead=inspectV2RoadAhead(point,route?.geometry);
    let bend=0;
    if(route?.geometry?.coordinates?.length>2){
      const near=nextRouteBearing(point,route.geometry,35);
      const far=nextRouteBearing(point,route.geometry,145);
      if(Number.isFinite(near)&&Number.isFinite(far))
        bend=shortestAngle(near,far);
    }
    let observed={density:0,sideBias:0,obstruction:0};
    if(isLoaded(map)&&typeof map.queryRenderedFeatures==='function'){
      try{
        const projected=map.project(point),radius=75;
        const bounds=[[projected.x-radius,projected.y-radius],
          [projected.x+radius,projected.y+radius]];
        observed=observeV2DroneScene(map.queryRenderedFeatures(bounds)||[],point,heading);
      }catch{/* Style switches and WebGL recovery can temporarily reject reads. */}
    }
    const smoothing=observed.density>droneScene.density?.53:.34;
    droneScene={
      density:droneScene.density+(observed.density-droneScene.density)*smoothing,
      sideBias:droneScene.sideBias+(observed.sideBias-droneScene.sideBias)*.25,
      obstruction:droneScene.obstruction+(observed.obstruction-droneScene.obstruction)*
        (observed.obstruction>droneScene.obstruction?.6:.34),
      straightAheadMeters:roadAhead.available?roadAhead.straightMeters:0,
      bendDegrees:droneScene.bendDegrees+shortestAngle(droneScene.bendDegrees,bend)*.38
    };
    // Buildings stay legible but translucent across /v2, independently of
    // the chosen V1/V2 simulation camera.
    if(d.v2Experience){
      const entrance=planV2RampApproach({
        enabled:true,vehicle:d.vehicle,maneuver:d.guidance,route
      }).strength;
      map._vanoV2UrbanDensity=droneScene.density;
      map._vanoV2UrbanObstruction=droneScene.obstruction;
      map._vanoV2RampStrength=entrance;
      syncV2BuildingVisibility(map,{enabled:true,density:droneScene.density,
        cinematic:true,obstruction:droneScene.obstruction,entrance});
    }
    return droneScene;
  }
  function sampleStandardPlayScene(d,route,now){
    if(playSceneRoute!==route?.geometry){
      playSceneRoute=route?.geometry;
      playScene={density:0,obstruction:0,straightAheadMeters:0,bendDegrees:0};
      lastPlaySceneSample=0;
    }
    // Observe geometry/buildings infrequently; never query GL or scan
    // full polylines at every animation frame.
    const period=(window.innerWidth||700)<650?1100:850;
    if(now-lastPlaySceneSample<period)return playScene;
    lastPlaySceneSample=now;
    const point=validPoint(d.motionCoords)?d.motionCoords:d.gpsCoords;
    if(!validPoint(point))return playScene;
    const heading=Number.isFinite(d.motionBearing)?d.motionBearing:0;
    const roadAhead=inspectV2RoadAhead(point,route?.geometry);
    let bend=0;
    if(route?.geometry?.coordinates?.length>2){
      const near=nextRouteBearing(point,route.geometry,35);
      const far=nextRouteBearing(point,route.geometry,145);
      if(Number.isFinite(near)&&Number.isFinite(far))
        bend=shortestAngle(near,far);
    }
    let observed={density:0,obstruction:0};
    if(isLoaded(map)&&typeof map.queryRenderedFeatures==='function'){
      try{
        const projected=map.project(point),radius=75;
        const bounds=[[projected.x-radius,projected.y-radius],
          [projected.x+radius,projected.y+radius]];
        observed=observeV2DroneScene(map.queryRenderedFeatures(bounds)||[],point,heading);
      }catch{/* Style reload / WebGL recovery keeps the previous safe result. */}
    }
    playScene={
      density:playScene.density+(observed.density-playScene.density)*
        (observed.density>playScene.density?.53:.34),
      obstruction:playScene.obstruction+(observed.obstruction-playScene.obstruction)*
        (observed.obstruction>playScene.obstruction?.6:.34),
      straightAheadMeters:roadAhead.available?roadAhead.straightMeters:0,
      bendDegrees:playScene.bendDegrees+shortestAngle(playScene.bendDegrees,bend)*.38
    };
    if(d.v2Experience){
      const entrance=planV2RampApproach({
        enabled:true,vehicle:d.vehicle,maneuver:d.guidance,route
      }).strength;
      map._vanoV2UrbanDensity=playScene.density;
      map._vanoV2UrbanObstruction=playScene.obstruction;
      map._vanoV2RampStrength=entrance;
      syncV2BuildingVisibility(map,{enabled:true,density:playScene.density,
        cinematic:true,obstruction:playScene.obstruction,entrance});
    }
    return playScene;
  }
  const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const preferenceChanged=()=>{reduced=Boolean(preference?.matches);start();};
  preference?.addEventListener?.('change',preferenceChanged);
  const following=()=>{const d=latest.current;return shouldFollowLocation({navigation:d.navigation,destination:d.destination,pickingOrigin:d.pickingOrigin,manualOrigin:d.manualOrigin,position:d.gpsCoords});};
  function target(now){
    const d=latest.current;
    const userHeading=Number.isFinite(d.telemetry?.heading)&&d.telemetry?.speed>1.5&&d.telemetry?.accuracy<=75?d.motionBearing:null;
    const route=d.navigation?(d.routes?.find(r=>r.id===d.selectedRoute)||d.routes?.[0]):null;
    const viewport=d.viewport||{padding:{top:100,bottom:100,left:20,right:20},compact:false};
    // Only the admin /v2 regular Play simulation gets this camera profile.
    // V2 SIM drone and normal live GPS navigation keep their existing policy.
    const standardPlay=d.v2Experience&&d.simulationPreview&&!d.droneSimulation&&
      d.navigation&&['carro','moto'].includes(d.vehicle);
    const v1Close=d.readableRouteStroke&&!d.v2Experience&&!d.simulationPreview&&
      !d.droneSimulation&&d.navigation&&['carro','moto'].includes(d.vehicle)&&
      validPoint(d.gpsCoords)&&Number.isFinite(d.telemetry?.accuracy)&&
      d.telemetry.accuracy<=50;
    if(!standardPlay&&!v1Close){
      playScene={density:0,obstruction:0,straightAheadMeters:0,bendDegrees:0};
      playSceneRoute=null;lastPlaySceneSample=0;
    }
    let maneuverPlan;
    if(d.vehicle==='moto'&&d.navigation){
      motoPlan=planMotorcycleCamera({navigation:true,route,maneuver:d.guidance,
        speed:d.telemetry?.speed,accuracy:d.telemetry?.accuracy,reducedMotion:reduced,
        previous:motoPlan,nowMs:now});
      maneuverPlan=motoPlan;
    }else{
      motoPlan=null;
      maneuverPlan=planManeuverCamera({navigation:d.navigation,maneuver:d.guidance,route,
        speed:d.telemetry?.speed,accuracy:d.telemetry?.accuracy,reducedMotion:reduced});
    }
    // The default camera zooms OUT at exits. Cancel that visual-only change
    // for Play, then let its dedicated planner ease a slight zoom IN instead.
    const framedManeuver=standardPlay?
      {...maneuverPlan,zoomOut:0,pitchDrop:0}:maneuverPlan;
    const base=cameraTarget({position:d.motionCoords||d.gpsCoords,
      destination:d.navigation?d.destination?.coords:null,
      route,
      telemetry:{...d.telemetry,heading:d.navigation?d.motionBearing:userHeading},
      vehicle:d.vehicle,navigation:following(),experimentalCameraV2:Boolean(d.navigation),immersiveDark:Boolean(d.navigation)&&night3dEnabled(d.appearance,d.layer),reducedMotion:reduced,maneuverPlan:framedManeuver,compactViewport:viewport.compact,viewportClearancePx:viewport.maxBehindPx});
    if(!d.droneSimulation){
      droneScene={density:0,sideBias:0,bendDegrees:0,obstruction:0,straightAheadMeters:0};lastSceneSample=0;
      droneSceneRoute=null;
      urbanMode='v1';urbanModeAt=0;urbanBlend=0;lastUrbanBlendAt=0;
      droneZoom=null;droneZoomGoal=null;lastDroneZoomAt=0;
      if(d.v2Experience&&!standardPlay){
        map._vanoV2UrbanDensity=0;
        map._vanoV2UrbanObstruction=0;
        map._vanoV2RampStrength=0;
        syncV2BuildingVisibility(map,{enabled:true,density:0,cinematic:false});
      }
    }
    if(standardPlay&&base){
      const scene=sampleStandardPlayScene(d,route,now);
      const regular=realCameraDistance(d,route,base,now);
      return planStandardSimulationCamera({
        enabled:true,base:regular,
        position:d.motionCoords||d.gpsCoords,markerBearing:d.motionBearing,
        maneuver:d.guidance,route,vehicle:d.vehicle,
        compactViewport:viewport.compact,reducedMotion:reduced,
        speed:d.telemetry?.speed,accuracy:d.telemetry?.accuracy,
        viewport,
        urbanDensity:scene.density,obstruction:scene.obstruction,
        straightAheadMeters:scene.straightAheadMeters,bendDegrees:scene.bendDegrees
      });
    }
    if(v1Close&&base){
      // Same chase/padding/easing as the V2 Play simulation, closer on /mapa.
      // Physical GPS and verified maneuver data remain the only inputs.
      const scene=sampleStandardPlayScene(d,route,now);
      const regular=realCameraDistance(d,route,base,now);
      return planV1CloseChase({
        enabled:true,base:regular,position:d.motionCoords||d.gpsCoords,
        markerBearing:d.motionBearing,maneuver:d.guidance,route,vehicle:d.vehicle,
        compactViewport:viewport.compact,reducedMotion:reduced,
        speed:d.telemetry?.speed,accuracy:d.telemetry?.accuracy,viewport,
        urbanDensity:scene.density,obstruction:scene.obstruction,
        straightAheadMeters:scene.straightAheadMeters,bendDegrees:scene.bendDegrees
      });
    }
    // Keep the existing real-navigation and drone isolation contract intact.
    if(!d.droneSimulation||!base)return realCameraDistance(d,route,base,now);
    const scene=sampleDroneScene(d,route,now);
    const nextMode=chooseV2UrbanCamera({
      enabled:true,density:scene.density,mode:urbanMode,
      lastSwitchAt:urbanModeAt,nowMs:now
    });
    if(nextMode.changed){urbanMode=nextMode.mode;urbanModeAt=now;}
    const dtMix=lastUrbanBlendAt?Math.min(100,Math.max(0,now-lastUrbanBlendAt)):16;
    lastUrbanBlendAt=now;
    urbanBlend=damp(urbanBlend,urbanMode==='v2'?1:0,dtMix,450);
    const ramp=planV2RampApproach({
      enabled:true,vehicle:d.vehicle,maneuver:d.guidance,route,
      compactViewport:viewport.compact,reducedMotion:reduced
    });
    function rampCloseup(view){
      // 3rd-person chase: target the ANIMATED USER PUCK, not the snapped route
      // or an entrance centroid. Positive short look-ahead + pitch physically
      // positions the perspective behind the simulated vehicle.
      const userPuck=validPoint(d.motionCoords)?d.motionCoords:d.gpsCoords;
      if(!validPoint(userPuck))return view;
      const markerHeading=Number.isFinite(d.motionBearing)?d.motionBearing:
        Number.isFinite(d.telemetry?.heading)?d.telemetry.heading:null;
      const chase=planV2RearChase({
        enabled:true,vehicle:d.vehicle,urbanDensity:scene.density,
        obstruction:scene.obstruction,rampStrength:ramp.strength,
        compactViewport:viewport.compact,reducedMotion:reduced,
        speed:d.telemetry?.speed,maneuver:d.guidance,route,
        straightAheadMeters:scene.straightAheadMeters,
        bendDegrees:scene.bendDegrees,accuracy:d.telemetry?.accuracy
      });
      if(!chase.enabled)return view;
      // The reference shot positions the USER itself at 73% of the safe
      // screen. An extra geographic look-ahead would double this offset.
      const behindView=v2UserCenteredRampView(
        userPuck,markerHeading,0
      );
      if(!behindView)return view;
      const maxZoom=typeof map.getMaxZoom==='function'?map.getMaxZoom():20;
      const maxPitch=typeof map.getMaxPitch==='function'?map.getMaxPitch():75;
      const desiredZoom=Math.min(maxZoom,chase.zoom);
      const zoomDt=lastDroneZoomAt?Math.min(90,Math.max(0,now-lastDroneZoomAt)):16;
      lastDroneZoomAt=now;
      // A slower zoom track for long straights prevents 850ms map-sample
      // micro-jumps. Decisions close to entrances recover zoom promptly.
      droneZoomGoal=desiredZoom;
      droneZoom=droneZoom===null?desiredZoom:damp(
        droneZoom,desiredZoom,zoomDt,chase.scenario==='straight'?1000:380
      );
      return {...view,
        // Strong user anchoring makes the camera stay behind the marker even
        // when an urban building or the road's snapped geometry is nearby.
        center:behindView,
        zoom:view.zoom+(droneZoom-view.zoom)*.95,
        pitch:view.pitch+(Math.min(maxPitch,chase.pitch)-view.pitch)*.95,
        // The view follows physical pointer direction, not the upcoming
        // route bearing/yaw. The camera writer already smooths rotation.
        bearing:Number.isFinite(markerHeading)?markerHeading:view.bearing,
        cameraFollowMarker:true,
        cameraPadding:v2SimulationChasePadding(viewport),
        droneCamera:{...view.droneCamera,
          halfLife:chase.halfLife,pointHalfLife:chase.pointHalfLife,
          bearingHalfLife:chase.bearingHalfLife}
      };
    }
    if(ramp.active&&urbanBlend<.001)return rampCloseup(base);
    if(urbanBlend<.001)return rampCloseup(base); // Open road: V1 framing, user-anchored chase.
    const drone=planV2DroneCamera({
      enabled:true,vehicle:d.vehicle,maneuver:d.guidance,route,
      speed:d.telemetry?.speed,urbanDensity:scene.density,
      sideBias:scene.sideBias,bendDegrees:scene.bendDegrees,
      compactViewport:viewport.compact,reducedMotion:reduced,
      accuracy:d.telemetry?.accuracy
    });
    if(!drone.enabled)return rampCloseup(base);
    const puck=d.motionCoords||d.gpsCoords;
    const center=validPoint(puck)?[
      puck[0]+(base.center[0]-puck[0])*drone.centerBlend,
      puck[1]+(base.center[1]-puck[1])*drone.centerBlend
    ]:base.center;
    const maxZoom=typeof map.getMaxZoom==='function'?map.getMaxZoom():20;
    const maxPitch=typeof map.getMaxPitch==='function'?map.getMaxPitch():75;
    const heading=Number.isFinite(base.bearing)?base.bearing:
      Number.isFinite(d.motionBearing)?d.motionBearing:0;
    const view=shiftDroneView(center,heading,drone.sideMeters);
    const targetBearing=Number.isFinite(base.bearing)?
      (base.bearing+drone.yawDegrees+360)%360:base.bearing;
    return rampCloseup({...base,
      center:base.center.map((coord,index)=>coord+(view[index]-coord)*urbanBlend),
      bearing:Number.isFinite(base.bearing)&&Number.isFinite(targetBearing)?
        blendAngle(base.bearing,targetBearing,urbanBlend):base.bearing,
      zoom:base.zoom+(Math.min(maxZoom,drone.zoom)-base.zoom)*urbanBlend,
      pitch:base.pitch+(Math.min(maxPitch,drone.pitch)-base.pitch)*urbanBlend,
      droneCamera:drone});

  }
  function draw(now){frame=0;if(!active||suspended||!following()||freeLook)return;const dt=previous?Math.min(90,now-previous):16;previous=now;
    const d=latest.current;
    const t=planV2FocusCamera({
      enabled:d.v2Experience&&d.focusMode&&d.navigation,
      base:target(now),vehicle:d.vehicle,speed:d.telemetry?.speed,
      maneuver:d.guidance,reducedMotion:reduced
    });
    if(!t)return;const motorcycle=d.vehicle==='moto';
    const drone=t.droneCamera;
    const cameraHalfLife=reduced?85:drone?.halfLife??(motorcycle?350:300);
    const pointHalfLife=reduced?90:drone?.pointHalfLife??(motorcycle?390:360);
    const nextCenter=reduced?t.center:blendPoint(pose.center,t.center,dt,pointHalfLife);
    const nextZoom=reduced?t.zoom:damp(pose.zoom,t.zoom,dt,cameraHalfLife),nextPitch=reduced?t.pitch:damp(pose.pitch,t.pitch,dt,cameraHalfLife);
    const softenedBearing=t.bearing==null?pose.bearing:reduced?t.bearing:blendAngle(pose.bearing,t.bearing,1-Math.pow(.5,dt/(drone?.bearingHalfLife??(motorcycle?420:320))));
    // Only admin Play: do not whip the map around when the marker enters a
    // corner. The physical car starts rotating first; the camera follows.
    const yawDelta=shortestAngle(pose.bearing,softenedBearing);
    const maxYawStep=(latest.current.droneSimulation||latest.current.v2Experience&&latest.current.simulationPreview?82:72)*dt/1000;
    const smoothChaseYaw=t.cameraFollowMarker?82*dt/1000:maxYawStep;
    const nextBearing=t.cameraFollowMarker&&!reduced?
      (pose.bearing+clamp(yawDelta,-smoothChaseYaw,smoothChaseYaw)+360)%360:softenedBearing;
    const error=Math.abs(nextZoom-t.zoom)+Math.abs(nextPitch-t.pitch)*.01+(t.bearing===null?0:Math.abs(((nextBearing-t.bearing+540)%360)-180)*.002)+Math.abs(nextCenter[0]-t.center[0])*2000+Math.abs(nextCenter[1]-t.center[1])*2000;
    pose={center:nextCenter,zoom:nextZoom,pitch:nextPitch,bearing:nextBearing};
    const defaultPadding=latest.current.viewport?.padding||{top:135,bottom:225,left:20,right:20};
    const targetPadding=t.cameraPadding||defaultPadding;
    if(chasePaddingTop===null){
      const previousPadding=map.getPadding?.();
      chasePaddingTop=Number.isFinite(previousPadding?.top)?previousPadding.top:defaultPadding.top;
    }
    chasePaddingGoal=targetPadding.top;
    chasePaddingTop=damp(chasePaddingTop,chasePaddingGoal,dt,reduced?85:290);
    const smoothPadding={...targetPadding,top:Math.round(chasePaddingTop)};
    try{map.jumpTo({...pose,padding:smoothPadding});}catch(e){console.warn('VANO motion:',e.message);active=false;return;}
    // The internal microzoom easing must finish even if the outer map
    // camera already reached an intermediate frame's target.
    const easingPending=Math.abs(realZoomGoal-realZoom)>.008||
      (droneZoom!==null&&droneZoomGoal!==null&&
        Math.abs(droneZoomGoal-droneZoom)>.008)||
      (chasePaddingGoal!==null&&Math.abs(chasePaddingGoal-chasePaddingTop)>1);
    if(error>.005||now<completeAt||easingPending){
      frame=requestAnimationFrame(draw);
    }else{active=false;status.current=t.state;}
  }
  function start(){if(suspended||freeLook||!following())return;if(!active)completeAt=performance.now()+650;active=true;if(!frame)frame=requestAnimationFrame(draw);}
  function setFree(){freeLook=true;active=false;cancelAnimationFrame(frame);frame=0;status.current=CAMERA_STATES.FREE;}
  function recenter(){freeLook=false;pose={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};status.current=CAMERA_STATES.RECENTER;previous=0;start();}
  function preview(){if(latest.current.navigation||freeLook)return;const d=latest.current;if(!d.destination?.coords||!d.routes?.length||!isLoaded(map))return;const selected=d.routes.find(x=>x.id===d.selectedRoute)||d.routes[0];const points=selected?.geometry?.coordinates||[coord(d.userCoords),d.destination.coords];if(!points.length)return;const bounds=new mapboxgl.LngLatBounds();points.filter(validPoint).forEach(p=>bounds.extend(p));if(!bounds.isEmpty()){map.stop();map.fitBounds(bounds,{padding:{top:180,bottom:Math.round(window.innerHeight*.4),left:55,right:55},maxZoom:14.8,duration:reduced?0:600});status.current=CAMERA_STATES.PREVIEW;}}
  function suspend(){suspended=true;active=false;cancelAnimationFrame(frame);frame=0;}
  function resume(){suspended=false;previous=0;start();}
  function end(){suspend();preference?.removeEventListener?.('change',preferenceChanged);}
  function zoom(delta){setFree();map.zoomTo(clamp(map.getZoom()+delta,4,19),{duration:reduced?0:250});}
  function tilt(){setFree();map.easeTo({pitch:map.getPitch()>12?0:45,duration:reduced?0:320});}
  return {start,setFree,recenter,preview,suspend,resume,end,zoom,tilt,get freeLook(){return freeLook;}};
}

export default function VanoMap({active=true,simulationPreview=false,droneSimulation=false,v2Experience=false,readableRouteStroke=false,userCoords,focusMode=false,gpsCoords=null,manualOrigin=null,destination,routes=[],selectedRoute='safe',navigation=false,layer='streets',appearance='light',trafficEnabled=true,onTrafficStatus,controller,telemetry={},vehicle='carro',onMotionState,pickingOrigin=false,onPickOrigin,onPublicPlaceSelect=null,onNavigationProgress,guidance=null,awaitingInitialGps=false,previewRoute=null,previewFocus=false,privateRoadSigns=false,roadCards=false,routeTraffic=null,poiVisible=null}){
  const root=useRef(null),mapRef=useRef(null),backend=useRef(null),motion=useRef(null),lastSelection=useRef(''),lastFit=useRef(''),status=useRef(CAMERA_STATES.IDLE),latest=useRef({});
  const firstGpsCenter=useRef(0),municipalFeed=useRef(null),maviPreviewCameraKey=useRef(null);
  const viewportRef=useRef(computeSafeViewport({width:360,height:640}));
  function centerOnFirstGpsFix(){
    const map=mapRef.current,d=latest.current;
    if(!map||d.navigation||d.destination||validPoint(d.manualOrigin)||!validPoint(d.gpsCoords)||firstGpsCenter.current||motion.current?.freeLook||map._vanoFreeLook)return;
    // The map may not have finished loading its vector tiles when GPS answers.
    // The camera must center immediately; waiting for isStyleLoaded() was
    // trapping users behind a permanent loading grid.

    if(backend.current==='mapbox'){
      map.stop();
      map.jumpTo({center:d.gpsCoords,zoom:Math.max(map.getZoom(),14.5)});
    }else if(backend.current==='leaflet'){
      map.setView(ll(d.gpsCoords),Math.max(map.getZoom(),14.5),{animate:false});
    }
    firstGpsCenter.current=1;
    // Rebase the eased camera after the initial instant fix: never animate back
    // to the fallback map center.
    if(backend.current==='mapbox')motion.current?.recenter();
  }
  const [error,setError]=useState(''),[forceRaster,setForceRaster]=useState(false);
  const visual=useRef({point:null,bearing:0,last:0,lastReport:0,lastPaint:0,progress:0});
  useEffect(()=>{mapRef.current?._vanoRefreshPublicPins?.();},[poiVisible]);
  const visibleRoadCards=roadCards&&!focusMode;
  latest.current={active,simulationPreview,droneSimulation,v2Experience,readableRouteStroke,userCoords,focusMode,gpsCoords,manualOrigin,destination,routes,selectedRoute,navigation,layer,appearance,trafficEnabled,onTrafficStatus,telemetry,vehicle,pickingOrigin,onPickOrigin,onPublicPlaceSelect,onNavigationProgress,guidance,previewRoute,previewFocus,privateRoadSigns,roadCards:visibleRoadCards,routeTraffic,poiVisible,viewport:viewportRef.current,motionCoords:visual.current.point,motionBearing:visual.current.bearing};
  const token=(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN||'').trim();
  useEffect(()=>{
    let map,deleted=false,canvas=null,wheelHandler=null,leafletWheelHandler=null,streetCardTimer=null,styleWatchdog=null,contextLostHandler=null,contextRestoredHandler=null,webglRecoveryTimer=null,styleRecoveryAttempted=false,styleRecoveryAt=0;const initial=coord(latest.current.userCoords);
    const report=e=>{if(!deleted){
   const message=e?.error?.message||e?.message||'';
   const source=e?.sourceId||e?.source?.id||'';
   if(source===TRAFFIC_SOURCE_ID||/mapbox-traffic-v1/i.test(message)){
     latest.current.onTrafficStatus?.('unavailable');
     return;
   }
   // A revoked/restricted pk may load the style shell and fail on vector
   // tile requests a moment later. Don't keep a blank WebGL canvas alive.
   // Optional traffic data has already been excluded above.
   const code=Number(e?.error?.status||e?.error?.statusCode||e?.status||0);
   const authFailed=code===401||code===403||/\b(?:401|403)\b|Unauthorized|Unauthorised|Forbidden|Invalid Token|access token is invalid|Not Authorized/i.test(message);
   const styleFailed=/Style not found|Failed to load style/i.test(message);
   // Do not replace the configured style because an optional vector asset
   // fails or a provider responds slowly. Retry the SAME chosen style.
   if((authFailed||styleFailed)&&!isLoaded(map)){
     if(source&&source!=='composite'){
       console.warn('VANO optional vector source unavailable; keeping selected style.');
       return;
     }
     if(!styleRecoveryAttempted){
       styleRecoveryAttempted=true;styleRecoveryAt=Date.now();
       try{
         const original=styleFor(latest.current.layer,latest.current.appearance);
         map._vanoStyle=original;
         map.setStyle(original,{diff:false});
         console.warn('VANO selected vector style: retrying original after provider error.');
         return;
       }catch{/* A permanent style/auth failure may require licensed raster. */}
     }
     // The retry may produce duplicate tile errors. Do not fall back on
     // every 401/403 burst before the original style has another chance.
     if(Date.now()-styleRecoveryAt<20000)return;
     console.warn('VANO configured vector style could not load; using raster last resort.',code||'style-error');
     setForceRaster(true);return;
   }
   // The provider message can contain access_token URLs. Never log it raw.
   console.warn('VANO Mapbox map error:',code||'provider-unavailable');
 }};
    if(token && !forceRaster && (!mapboxgl.supported || mapboxgl.supported())){
      try{
        mapboxgl.accessToken=token;
        const nightStart=night3dEnabled(latest.current.appearance,latest.current.layer);
        map=new mapboxgl.Map({container:root.current,style:styleFor(latest.current.layer,latest.current.appearance),center:initial,zoom:validPoint(latest.current.userCoords)?14.5:12.4,pitch:nightStart?48:0,attributionControl:true,logoPosition:'bottom-left',antialias:false});
        if(nightStart)map._vanoNight3DAutoPitch=0;
        map._vanoStyle=styleFor(latest.current.layer,latest.current.appearance);
        const attachOpenRouterMark=()=>{
          const tray=map.getContainer().querySelector('.mapboxgl-ctrl-bottom-left');
          if(!tray||tray.querySelector('.vano-openrouter-mark'))return;
          const mark=document.createElement('img');
          mark.className='vano-openrouter-mark';
          mark.src='https://openrouter.ai/brand/logos/transparent/glyph/svg/glyph-ink.svg';
          mark.alt='OpenRouter';
          mark.width=12;mark.height=12;mark.decoding='async';
          tray.appendChild(mark);
        };
        map.on('error',report);
        backend.current='mapbox';mapRef.current=map;
        motion.current=motionController(map,latest,status);
        const ensureNight3d=()=>{
          if(deleted||!isLoaded(map))return;
          try{
            syncNight3DBuildings(map,{appearance:latest.current.appearance,layer:latest.current.layer});
            syncV2BuildingVisibility(map,{enabled:latest.current.v2Experience,
              density:map._vanoV2UrbanDensity||0,
              cinematic:Boolean(latest.current.droneSimulation),
              obstruction:map._vanoV2UrbanObstruction||0,
              entrance:map._vanoV2RampStrength||0});
             syncNight3DScene(map,{appearance:latest.current.appearance,layer:latest.current.layer,navigation:latest.current.navigation,
               memory:typeof navigator!=='undefined'?navigator.deviceMemory:null,
               cores:typeof navigator!=='undefined'?navigator.hardwareConcurrency:null,
               saveData:typeof navigator!=='undefined'&&Boolean(navigator.connection?.saveData)});
          }catch(error){
            // 3D is an optional enhancement: never degrade map rendering,
            // switch to raster, or break a route because of unavailable buildings.
            console.warn('VANO night 3D unavailable:',error?.message||String(error));
          }
        };
        const update=()=>{
  if(deleted)return;
  ensureTrafficLayers(map,{enabled:latest.current.trafficEnabled,onStatus:latest.current.onTrafficStatus});
  if(!isLoaded(map))return;
  clearTimeout(styleWatchdog);styleWatchdog=null;
  ensureNight3d(); // Insert before route lines so navigation stays readable.
  try{paintMapbox(map,latest.current,lastSelection);}catch(error){
    // Individual radar, traffic or decorative overlay errors must NEVER
    // replace a functioning 3D/vector basemap with a flat raster image.
    // The map stays usable and overlays may recover on a later style update.
    console.warn('VANO optional map overlays unavailable; vector basemap retained.');
  }
  setError('');centerOnFirstGpsFix();if(shouldFollowLocation({navigation:latest.current.navigation,destination:latest.current.destination,pickingOrigin:latest.current.pickingOrigin,manualOrigin:latest.current.manualOrigin,position:latest.current.gpsCoords}))motion.current?.start();else if(latest.current.destination?.coords)motion.current?.preview();};
        map.on('style.load',update);
        // A style may report partial readiness on style.load; retry nonblocking
        // after vector tiles finish. getLayer makes this idempotent.
        map.on('idle',ensureNight3d);
         map.on('moveend',ensureNight3d);
        map.on('load',()=>{map._vanoSeenVectorFrame=true;attachOpenRouterMark();update();map.once('render',()=>{requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!deleted)notifyNative({action:'firstFrame',backend:'mapbox'});}));});map.triggerRepaint();});
        map.on('click',e=>{if(latest.current.pickingOrigin)latest.current.onPickOrigin?.(e.lngLat.toArray());});
        map.on('dragstart',e=>{if(e.originalEvent&&!latest.current.pickingOrigin)motion.current?.setFree();});
        map.on('rotatestart',e=>{if(e.originalEvent)motion.current?.setFree();});
        canvas=map.getCanvas();wheelHandler=()=>motion.current?.setFree();canvas?.addEventListener('wheel',wheelHandler);
        // Keep the vector renderer while WebGL restores a lost GPU context.
        contextLostHandler=e=>{
          e.preventDefault?.();
          if(deleted)return;
          clearTimeout(webglRecoveryTimer);
          webglRecoveryTimer=setTimeout(()=>{
            if(!deleted&&backend.current==='mapbox')setForceRaster(true);
          },WEBGL_CONTEXT_RESTORE_MS);
        };
        contextRestoredHandler=()=>{
          clearTimeout(webglRecoveryTimer);webglRecoveryTimer=null;
          if(!deleted){map.resize();map.triggerRepaint();}
        };
        canvas?.addEventListener('webglcontextlost',contextLostHandler,{passive:false});
        canvas?.addEventListener('webglcontextrestored',contextRestoredHandler);
        // Slow WebView tiles are not evidence of missing WebGL. Retry a real
        // Mapbox vector style before falling back to the flat map.
        const vectorStartedAt=Date.now();
        const checkVectorStartup=()=>{
          if(deleted||backend.current!=='mapbox')return;
          const selectedStyle=styleFor(latest.current.layer,latest.current.appearance);
          const decision=vectorStartupDecision({
            elapsedMs:Date.now()-vectorStartedAt,
            loaded:isLoaded(map)||Boolean(map._vanoSeenVectorFrame),
            usingCustomStyle:true,
            retriedOriginalStyle:styleRecoveryAttempted
          });
          if(decision==='ready')return;
          if(decision==='raster'){
            console.warn('VANO selected vector style exceeded recovery deadline; using raster last resort.');
            setForceRaster(true);return;
          }
          if(decision==='retry-original-vector'){
            styleRecoveryAttempted=true;styleRecoveryAt=Date.now();
            try{
              map._vanoStyle=selectedStyle;
              map.setStyle(selectedStyle,{diff:false});
              console.warn('VANO custom map slow: retrying configured style, not the default.');
            }catch{
              console.warn('VANO configured style retry deferred.');
            }
          }
          styleWatchdog=setTimeout(checkVectorStartup,8000);
        };
        styleWatchdog=setTimeout(checkVectorStartup,MAPBOX_VECTOR_PROBE_MS);
      }catch(e){
        // Recover from WebGL initialization failure without retaining a
        // permanent Mapbox error above the working raster fallback.
        console.warn('Mapbox startup failed; switching to Leaflet:',e?.message||String(e));
        try{map?.remove?.();}catch{/* partially constructed Mapbox */}
        map=null;
        root.current?.replaceChildren();
      }
    }
    if(!map){
      try{
        map=L.map(root.current,{zoomControl:false,attributionControl:true}).setView(ll(initial),12);
        setError('');
      }catch(error){
        console.warn('Leaflet startup failed:',error?.message||String(error));
        setError('Não foi possível carregar o mapa. Recarregue a página.');
        return()=>{};
      }
      // A Mapbox auth/style failure must NOT retry the rejected pk as
      // raster tiles. Use licensed Esri basemap directly on recovery.
      installLeafletBasemap(map,latest.current.layer,forceRaster?'':token,{
        appearance:latest.current.appearance,
        onReady:()=>requestAnimationFrame(()=>{if(!deleted){setError('');notifyNative({action:'firstFrame',backend:'leaflet'});}}),
        onError:()=>{if(!deleted)setError('A imagem do mapa está indisponível. Verifique a conexão e recarregue.');}
      });
      map._vanoLayer=L.layerGroup().addTo(map);
      backend.current='leaflet';mapRef.current=map;
       latest.current.onTrafficStatus?.('unavailable');
      paintLeaflet(map,latest.current);
      map._vanoFreeLook=false;
      map.on('dragstart',()=>{map._vanoFreeLook=true;status.current=CAMERA_STATES.FREE;});
      leafletWheelHandler=()=>{map._vanoFreeLook=true;status.current=CAMERA_STATES.FREE;};
      root.current?.addEventListener('wheel',leafletWheelHandler,{passive:true});
      map.on('click',e=>{if(latest.current.pickingOrigin)latest.current.onPickOrigin?.([e.latlng.lng,e.latlng.lat]);});
    }
    const refreshRouteTrafficMarkers=()=>syncRouteTrafficMarkers(map,backend.current,backend.current==='mapbox'?mapboxgl:L,latest.current);
    map.on('zoomend',refreshRouteTrafficMarkers);
    // Collision decisions depend on screen projection. A finished pan/zoom
    // can reveal or hide the next avenue sign without changing GPS or route.
    const refreshPrivateSigns=()=>{if(backend.current==='mapbox')syncPrivateRoadSignMarkers(map,mapboxgl,latest.current);};
    map.on('moveend',refreshPrivateSigns);
    // Persistent street atlas: query only the loaded vector roads in view,
    // after the camera settles, never in the GPS/animation rendering loop.
    let lastRoadCardScan=0;
    const refreshVisibleCards=()=>{
      if(deleted||backend.current!=='mapbox')return;
      try{syncVisibleStreetCards(map,mapboxgl,latest.current);}catch{
        // Labels are decorative and cannot interrupt maps, directions or GPS.
      }
      lastRoadCardScan=Date.now();
    };
    const scheduleVisibleCards=()=>{
      if(deleted||backend.current!=='mapbox')return;
      clearTimeout(streetCardTimer);
      streetCardTimer=setTimeout(refreshVisibleCards,Math.max(160,800-(Date.now()-lastRoadCardScan)));
    };
    if(backend.current==='mapbox'){
      map.on('idle',scheduleVisibleCards);
      map.on('moveend',scheduleVisibleCards);
      map.on('style.load',scheduleVisibleCards);
      map._vanoRefreshVisibleStreetCards=scheduleVisibleCards;
      scheduleVisibleCards();
    }
    // Independent POI pins survive style changes without altering GPS or route layers.
    // Admin sign overlay is a separate, disposable DOM layer; it never edits route, style or GPS sources.
    map._vanoSyncPrivateRoadSigns=()=>{
      if(backend.current==='mapbox')syncPrivateRoadSignMarkers(map,mapboxgl,latest.current);
    };
    const detachPublicPins=attachPublicMapOverlay(map,backend.current,()=>latest.current.navigation,place=>latest.current.onPublicPlaceSelect?.(place),()=>latest.current.v2Experience,()=>latest.current.poiVisible);
    const detachCommunityPins=attachCommunityReportOverlay(map,backend.current,()=>latest.current.simulationPreview?null:latest.current.gpsCoords,()=>latest.current.active&&!latest.current.simulationPreview);
    municipalFeed.current=backend.current==='mapbox'?attachMunicipalTrafficOverlay(map,{enabled:latest.current.trafficEnabled}):null;
    if(controller)controller.current={center:()=>{if(backend.current==='mapbox'){if(latest.current.navigation||shouldFollowLocation({navigation:false,destination:latest.current.destination,pickingOrigin:latest.current.pickingOrigin,manualOrigin:latest.current.manualOrigin,position:latest.current.gpsCoords}))motion.current?.recenter();
        else if(validPoint(latest.current.gpsCoords))map.flyTo({center:latest.current.gpsCoords,zoom:Math.max(map.getZoom(),14),duration:650});}else if(validPoint(latest.current.gpsCoords)){map._vanoFreeLook=false;map.panTo(ll(latest.current.motionCoords||latest.current.gpsCoords),{animate:true});}},zoomIn:()=>backend.current==='mapbox'?motion.current?.zoom(1):map.zoomIn(),zoomOut:()=>backend.current==='mapbox'?motion.current?.zoom(-1):map.zoomOut(),tilt:()=>motion.current?.tilt(),
      overview:()=>{
        const d=latest.current;
        const route=(d.routes||[]).find(r=>r.id===d.selectedRoute)||d.routes?.[0];
        const points=route?.geometry?.coordinates?.filter(validPoint);
        if(!points?.length)return false;
        const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
        if(backend.current==='mapbox'){
          motion.current?.setFree();
          const bounds=new mapboxgl.LngLatBounds();points.forEach(p=>bounds.extend(p));
          if(!bounds.isEmpty())map.fitBounds(bounds,{
            padding:{top:135,bottom:Math.round(window.innerHeight*.32),left:42,right:42},
            maxZoom:15.2,duration:reduced?0:650,pitch:0,bearing:0
          });
        }else{
          map._vanoFreeLook=true;
          map.fitBounds(L.latLngBounds(points.map(ll)),{
            padding:[48,48],maxZoom:15,animate:!reduced,duration:.6
          });
        }
        return true;
      }};
    function visibility(){if(document.hidden||!latest.current.active)motion.current?.suspend();else motion.current?.resume();}
    document.addEventListener('visibilitychange',visibility);
    return()=>{deleted=true;clearTimeout(streetCardTimer);
     map.off('zoomend',refreshRouteTrafficMarkers);map.off('moveend',refreshPrivateSigns);
     if(backend.current==='mapbox'){
       map.off('idle',scheduleVisibleCards);map.off('moveend',scheduleVisibleCards);map.off('style.load',scheduleVisibleCards);
     }
     clearVisibleStreetCards(map);delete map._vanoRefreshVisibleStreetCards;
     clearRouteTrafficMarkers(map);detachCommunityPins?.();detachPublicPins?.();clearPrivateRoadSignMarkers(map);delete map._vanoSyncPrivateRoadSigns;municipalFeed.current?.dispose();municipalFeed.current=null;document.removeEventListener('visibilitychange',visibility);if(wheelHandler)canvas?.removeEventListener('wheel',wheelHandler);if(contextLostHandler)canvas?.removeEventListener('webglcontextlost',contextLostHandler);if(contextRestoredHandler)canvas?.removeEventListener('webglcontextrestored',contextRestoredHandler);clearTimeout(webglRecoveryTimer);clearTimeout(styleWatchdog);if(leafletWheelHandler)root.current?.removeEventListener('wheel',leafletWheelHandler);motion.current?.end();if(controller)controller.current=null;motion.current=null;mapRef.current=null;backend.current=null;try{map?.remove?.();}catch(e){console.warn(e.message);}};
  },[token,forceRaster]);
  // Navigation switches should change POI categories immediately, without
  // remounting the map, touching GPS or triggering any provider request.
  useEffect(()=>{mapRef.current?._vanoRefreshPublicPins?.();},[navigation,v2Experience]);
  // Update proximity markers from live GPS without recreating the renderer or touching route layers.
  useEffect(()=>{mapRef.current?._vanoSyncCommunityReports?.();},[gpsCoords?.[0],gpsCoords?.[1],active,simulationPreview]);
  useEffect(()=>{
    const map=mapRef.current;
    if(map&&backend.current==='mapbox')syncPrivateRoadSignMarkers(map,mapboxgl,latest.current);
  },[privateRoadSigns,navigation,routes,selectedRoute,guidance?.stepIndex,guidance?.distance,guidance?.following?.stepIndex,guidance?.following?.gapMeters,appearance]);
   useEffect(()=>{mapRef.current?._vanoRefreshVisibleStreetCards?.();},
      [visibleRoadCards,active,navigation,layer,appearance,selectedRoute,privateRoadSigns]);
  // If GPS arrives before Mapbox is ready, the style.load handler performs
  // this same recenter as soon as the map can accept camera operations.
  useEffect(()=>{centerOnFirstGpsFix();},[userCoords?.[0],userCoords?.[1],telemetry?.accuracy,navigation,destination?.id]);

  // Read overlays only on layout/ResizeObserver changes, never in the camera RAF.
  // The viewport belongs to the MAP; a street card must not overlap the GPS arrow.
  useEffect(()=>{
    const mapEl=root.current,parent=mapEl?.closest('.map-page');
    if(!mapEl||!parent)return;
    const targets=navigation
      ?[['.nav-instruction','top'],['.v36-nav-road-row','bottom'],['.nav-bottom','bottom']]
      :[['.map-top','top'],['.v31-location-card','bottom']];
    const nodes=targets.map(([selector,edge])=>({node:parent.querySelector(selector),edge})).filter(x=>x.node);
    const measure=()=>{
      if(!mapEl.isConnected)return;
      const frame=mapEl.getBoundingClientRect();
      if(frame.width<1||frame.height<1)return;
      const overlays=nodes.filter(x=>{
        const style=window.getComputedStyle?.(x.node);
        return x.node.isConnected && style?.display!=='none' && style?.visibility!=='hidden';
      }).map(({node,edge})=>{
        const b=node.getBoundingClientRect();
        return {edge,top:b.top-frame.top,bottom:b.bottom-frame.top};
      });
      const next=computeSafeViewport({width:frame.width,height:frame.height,overlays,navigation,motorcycle:vehicle==='moto'});
      const prior=viewportRef.current;
      const unchanged=prior?.compact===next.compact&&Object.keys(next.padding).every(k=>prior.padding[k]===next.padding[k]);
      if(unchanged)return;
      viewportRef.current=next;
      latest.current.viewport=next;
      motion.current?.start();
    };
    measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(mapEl);
    nodes.forEach(x=>observer?.observe(x.node));
    window.addEventListener('resize',measure,{passive:true});
    window.addEventListener('orientationchange',measure,{passive:true});
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('orientationchange',measure);};
  },[navigation,Boolean(destination),Boolean(manualOrigin),pickingOrigin,vehicle,focusMode]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='mapbox')return;
    if(!map.getSource?.(TRAFFIC_SOURCE_ID))ensureTrafficLayers(map,{enabled:trafficEnabled,onStatus:onTrafficStatus});
    else setTrafficVisibility(map,trafficEnabled);
    municipalFeed.current?.setEnabled(trafficEnabled);
  },[trafficEnabled]);
  useEffect(()=>{const map=mapRef.current;if(!map)return;if(!active)motion.current?.suspend();else{if(backend.current==='mapbox')map.resize();else map.invalidateSize({animate:false});motion.current?.resume();}},[active]);
  // The MAVI candidate is separate from the live navigation route. If the driver
  // is moving we draw the suggestion without stealing the follow-camera.
  useEffect(()=>{
    const map=mapRef.current;
    if(!map)return;
    if(backend.current==='mapbox'){
      if(isLoaded(map))paintMapbox(map,latest.current,lastSelection);
    }else paintLeaflet(map,latest.current);
    // Never move, fit, stop or suspend the driver's camera to display MAVI
    // preview. At 0 km/h the GPS is still in active navigation.
    if(navigation){
      if(maviPreviewCameraKey.current!==null){
        maviPreviewCameraKey.current=null;
        if(backend.current==='mapbox')motion.current?.resume();
      }
      return;
    }
    const points=previewRoute?.geometry?.coordinates?.filter(validPoint);
    if(!previewFocus||!Array.isArray(points)||points.length<2){
      if(maviPreviewCameraKey.current!==null){
        maviPreviewCameraKey.current=null;
        if(backend.current==='mapbox'){
          map.stop();motion.current?.resume();
          if(navigation)motion.current?.recenter();else motion.current?.preview();
        }
      }
      return;
    }
    const key=points.length+':'+points[0].join(',')+':'+points.at(-1).join(',');
    if(maviPreviewCameraKey.current===key)return;
    maviPreviewCameraKey.current=key;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    if(backend.current==='mapbox'){
      if(!isLoaded(map))return;
      motion.current?.suspend();map.stop();
      const bounds=new mapboxgl.LngLatBounds();points.forEach(p=>bounds.extend(p));
      if(!bounds.isEmpty())map.fitBounds(bounds,{
        padding:{top:130,bottom:Math.round(window.innerHeight*.32),left:46,right:46},
        maxZoom:15.2,bearing:0,pitch:0,duration:reduced?0:650
      });
    }else map.fitBounds(L.latLngBounds(points.map(ll)),{
      padding:[46,46],maxZoom:15,animate:!reduced,duration:.55
    });
  },[previewRoute,previewFocus,navigation]);
  // Render route only when route changes, not every camera frame. Camera uses an independent RAF writer.
  useEffect(()=>{const map=mapRef.current;if(!map)return;if(backend.current==='mapbox'){if(isLoaded(map)){paintMapbox(map,latest.current,lastSelection);if(shouldFollowLocation({navigation,destination,pickingOrigin,manualOrigin,position:gpsCoords}))motion.current?.start();else if(destination?.coords){const fitKey=`${destination.id}|${selectedRoute}`;if(lastFit.current!==fitKey){lastFit.current=fitKey;motion.current?.preview();}}}}else{paintLeaflet(map,latest.current);/* Navigation camera is owned by the motion RAF; do not queue Leaflet pan animations. */}},[userCoords?.[0],userCoords?.[1],gpsCoords?.[0],gpsCoords?.[1],manualOrigin?.[0],manualOrigin?.[1],pickingOrigin,destination?.id,routes,selectedRoute,navigation,telemetry?.heading,telemetry?.speed,telemetry?.accuracy,v2Experience,routeTraffic]);
  // Changing the visual theme must never take control of a live GPS camera.
  // Away from navigation, the dark street style gains a useful 3D viewing angle.
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='mapbox')return;
    const following=shouldFollowLocation({
      navigation,destination,pickingOrigin,manualOrigin,position:gpsCoords
    });
    try{
      syncNight3DCamera(map,{appearance,layer,navigation,following,
        reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false});
    }catch(error){console.warn('VANO night camera unavailable:',error?.message||String(error));}
  },[appearance,layer,navigation]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='mapbox')return;
    const style=styleFor(layer,appearance);
    if(map._vanoStyle===style)return;
    // setStyle is valid during style loading. Waiting for map.loaded() can drop rapid layer taps.
    try{
      map._vanoStyle=style;
      discardV2BuildingVisibility(map);
      delete map._vanoNightFogApplied;
      delete map._vanoNightTreeStamp;
      setError('');
      map.setStyle(style,{diff:false});
      // style.load rehydrates route sources/layers and markers for the new style.
    }catch(e){map._vanoStyle='';setError('Não foi possível trocar a camada. Tente novamente.');console.warn('Mapbox style:',e.message);}
  },[layer,appearance,token]);
  // When either simulator starts/stops, restore building visibility for the
  // departing mode. Live map must never inherit simulated 3D opacity.
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='mapbox'||!isLoaded(map))return;
    if(!simulationPreview&&!droneSimulation){
      map._vanoV2UrbanDensity=0;
      map._vanoV2UrbanObstruction=0;
      map._vanoV2RampStrength=0;
    }
    syncV2BuildingVisibility(map,{enabled:v2Experience,density:map._vanoV2UrbanDensity||0,
      cinematic:Boolean(droneSimulation||(v2Experience&&simulationPreview)),
      obstruction:map._vanoV2UrbanObstruction||0,
      entrance:map._vanoV2RampStrength||0});
  },[v2Experience,simulationPreview,droneSimulation,appearance,layer]);
  // A mode switch while playback is PAUSED still starts the cinematic camera
  // transition. The existing single motion writer owns all Mapbox properties.
  useEffect(()=>{
    if(navigation&&backend.current==='mapbox')motion.current?.start();
  },[simulationPreview,droneSimulation,navigation,focusMode]);
  useEffect(()=>{
    // Reclaim a manually moved camera when the user chooses V2 immersive follow.
    if(focusMode&&navigation&&backend.current==='mapbox')motion.current?.recenter();
  },[focusMode,navigation]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||backend.current!=='leaflet')return;
    const tiles=leafletTilesFor(layer,forceRaster?'':token,appearance);
    if(map._vanoTilesKey!==tiles.url){
      // Layer changes keep the route, GPS and POI overlays untouched.
      installLeafletBasemap(map,layer,forceRaster?'':token,{
        appearance,
        onReady:()=>setError(''),
        onError:()=>setError('A imagem do mapa está indisponível. Verifique a conexão e recarregue.')
      });
    }else{
      map._vanoTiles?.getContainer?.()?.classList.toggle('v49-dark-raster-legacy',
        appearance==='dark'&&layer!=='satellite'&&tiles.url===leafletBackupTilesFor(layer).url);
    }
  },[layer,appearance,token]);
  useEffect(()=>{
    if(!navigation){status.current=CAMERA_STATES.IDLE;lastFit.current='';}
    // Switching modes reenables tracking, including after Leaflet free-look.
    if(shouldFollowLocation({navigation,destination,pickingOrigin,manualOrigin,position:gpsCoords})){
      if(backend.current==='leaflet'&&mapRef.current)mapRef.current._vanoFreeLook=false;
      motion.current?.recenter();
    }
  },[navigation]);
  // A single animation clock paints the freshest real GPS point and its traced progress.
  // There is no route simulation, velocity extrapolation, or fabricated GPS input.
  useEffect(()=>{
    if(!active)return;
    const route=routes?.find(r=>r.id===selectedRoute)||routes?.[0];
    const timeline=buildRouteTimeline(route?.geometry);
    let raf=0,stopped=false;
    const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced=preference?.matches||false;
    const state={...visual.current,last:0,lastReport:0,lastPaint:0,progress:0};
    // Reduced-motion still controls GPS/camera smoothing, not static markings.
    function preferenceChanged(){reduced=Boolean(preference?.matches);}
    preference?.addEventListener?.('change',preferenceChanged);
    visual.current=state;
    function animate(now){
      if(stopped)return;
      raf=requestAnimationFrame(animate);
      if(document.hidden||!latest.current.active){state.last=now;return;}
      const dt=state.last?Math.min(now-state.last,100):16;
      if(dt<13)return;
      state.last=now;
      const d=latest.current,target=d.gpsCoords;
      // Emergency stability gate: avoid continuous GL paint mutations until
      // extended device testing. Static orange route / traffic remains.
      if(import.meta.env.VITE_V2_ROUTE_FLOW_ANIMATION==='1')
        updateV2RouteFlow(mapRef.current,backend.current,d,now,reduced);
      if(!validPoint(target))return;
      // V2 Sim follows route PROGRESS, not a raw straight-line interpolation
      // between coordinates. This prevents the icon from cutting across sharp
      // turns and guarantees heading belongs to the SAME animated position.
      const simulationMeters=d.guidance?.routeMeters;
      let point,playPointer=null;
      const standardPlay=d.v2Experience&&d.simulationPreview&&!d.droneSimulation&&
        timeline.total>0&&Number.isFinite(simulationMeters);
      if(standardPlay){
        // 6x Play: follow simulated ARC distance instead of smoothing GPS
        // longitude/latitude across corners; reset when replay restarts.
        playPointer=planStandardPlayPointer({
          timeline,targetMeters:simulationMeters,previousMeters:state.playMeters,
          dtMs:dt,maneuver:d.guidance,route,reducedMotion:reduced
        });
        point=playPointer?.point;
        state.playMeters=playPointer?.progress??null;
        state.droneMeters=null;
      }else if(d.droneSimulation&&timeline.total>0&&Number.isFinite(simulationMeters)){
        state.playMeters=null;
        const targetMeters=clamp(simulationMeters,0,timeline.total);
        if(!Number.isFinite(state.droneMeters)||targetMeters+12<state.droneMeters){
          // Replay restart/new simulation epoch: never drift backwards around
          // multiple street corners using the preceding route's progress.
          state.droneMeters=targetMeters;
          state.droneHeadingInitialized=false;
        }else state.droneMeters=damp(state.droneMeters,targetMeters,dt,reduced?90:140);
        point=sampleRoute(timeline,state.droneMeters)?.point;
      }else{
        state.playMeters=null;
        state.droneMeters=null;
        point=easeGpsPoint(state.point,target,dt,{accuracy:d.telemetry?.accuracy,speed:d.telemetry?.speed,reducedMotion:reduced});
      }
      if(!validPoint(point))return;
      state.point=point;
      const heading=playPointer&&Number.isFinite(playPointer.bearing)?playPointer.bearing:
        d.droneSimulation&&Number.isFinite(state.droneMeters)
        ?simulationPointerBearing(timeline,state.droneMeters)
        :(d.vehicle!=='moto'||(d.telemetry?.accuracy<=65&&d.telemetry?.speed>2.2))&&Number.isFinite(d.telemetry?.heading)&&d.telemetry.heading>=0&&d.telemetry.speed>1.5
          ?d.telemetry.heading:d.vehicle==='moto'&&(d.telemetry?.accuracy>65||d.telemetry?.speed<=2.2)?null:nextRouteBearing(point,route?.geometry,Math.max(30,(Number(d.telemetry?.speed)||0)*4));
      if(d.droneSimulation&&Number.isFinite(heading)){
        // Do not pre-rotate at upcoming intersections. Even a 90° ramp turn
        // begins after the animated marker crosses its route vertex.
        if(!state.droneHeadingInitialized){
          state.bearing=heading;state.droneHeadingInitialized=true;
        }else{
          const delta=shortestAngle(state.bearing||0,heading);
          const ease=1-Math.pow(.5,dt/(reduced?85:165));
          const limited=Math.min(Math.abs(delta)*ease,dt*.37);
          state.bearing=(state.bearing+Math.sign(delta)*limited+360)%360;
        }
      }else if(playPointer){
        state.droneHeadingInitialized=false;
        if(Number.isFinite(heading)){
          if(!state.playHeadingInitialized){state.bearing=heading;state.playHeadingInitialized=true;}
          else state.bearing=blendAngle(state.bearing||0,heading,
            1-Math.pow(.5,dt/(reduced?50:playPointer.bearingHalfLifeMs)));
        }
      }else{
        state.droneHeadingInitialized=false;
        state.playHeadingInitialized=false;
        if(Number.isFinite(heading))state.bearing=blendAngle(state.bearing||0,heading,1-Math.pow(.5,dt/(reduced?75:240)));
      }
      d.motionCoords=point;d.motionBearing=state.bearing||0;
      const map=mapRef.current;
      if(map&&backend.current==='mapbox'){
        const marker=map._vanoMarker?.current;
        if(marker){
          if(!validPoint(state.lastMarkerPoint)||metersBetween(state.lastMarkerPoint,point)>.14){
            marker.setLngLat(point);
            state.lastMarkerPoint=point;
          }
          const nextBearing=state.bearing||0;
          if(marker.getElement().classList.contains('vano-vehicle-marker')&&
             (!Number.isFinite(state.lastMarkerBearing)||Math.abs(shortestAngle(state.lastMarkerBearing,nextBearing))>.25)){
            marker.setRotation(state.bearing||0);
            state.lastMarkerBearing=nextBearing;
          }
        }
        if(d.navigation&&timeline.total>0&&isLoaded(map)&&now-state.lastPaint>=110){
          const near=nearestOnRoute(point,route?.geometry);
          const maxOffset=Math.max(45,Math.min(100,Number(d.telemetry?.accuracy||15)*2));
          if(near.distance<=maxOffset){
            const meters=distanceOnRoute(timeline,point);
            state.progress=Math.max(state.progress-8,meters);
            const points=routeTrace(timeline,state.progress);
            if(points.length>1)map.getSource('vano-v2-traveled')?.setData(geo([{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}}]));
          }
          state.lastPaint=now;
        }
      }else if(map&&backend.current==='leaflet'){
        const follow=shouldFollowLocation({navigation:d.navigation,destination:d.destination,pickingOrigin:d.pickingOrigin,manualOrigin:d.manualOrigin,position:d.gpsCoords});
        if(follow){
          if(map._vanoOriginMarker){map._vanoOriginMarker.remove();map._vanoOriginMarker=null;}
          if(map._vanoVehicleMarker&&map._vanoVehicleKind!==d.vehicle){map._vanoVehicleMarker.remove();map._vanoVehicleMarker=null;}
          if(!map._vanoVehicleMarker){map._vanoVehicleKind=d.vehicle;map._vanoVehicleMarker=L.marker(ll(point),{interactive:false,icon:L.divIcon({
            className:'vano-leaflet-vehicle',html:markerElement('vehicle',d.vehicle).outerHTML,iconSize:[70,82],iconAnchor:[35,41]
          })}).addTo(map);}
          map._vanoVehicleMarker.setLatLng(ll(point));
          const arrow=map._vanoVehicleMarker.getElement()?.querySelector('.vano-vehicle-marker');
          if(arrow)arrow.style.transform='rotate('+(state.bearing||0)+'deg)';
          if(now-state.lastPaint>120&&!map._vanoFreeLook){
            state.lastPaint=now;
            const viewport=d.viewport?.padding||{top:0,bottom:0};
            const offset=(viewport.bottom-viewport.top)/2;
            const projected=map.project(L.latLng(ll(point)),map.getZoom());
            const center=map.unproject(projected.add([0,offset]),map.getZoom());
            if(map.distance(map.getCenter(),center)>1.3)map.panTo(center,{animate:false});
          }
        }else{
          if(map._vanoVehicleMarker){map._vanoVehicleMarker.remove();map._vanoVehicleMarker=null;}
          if(!map._vanoOriginMarker)map._vanoOriginMarker=L.marker(ll(point),{interactive:false,icon:L.divIcon({
            className:'',html:'<div class="map-pin map-pin-origin"></div>',iconSize:[24,24],iconAnchor:[12,12]
          })}).addTo(map);
          map._vanoOriginMarker.setLatLng(ll(point));
        }
      }
      // Maneuver state is exclusively updated by accepted sensor fixes in
      // MapPage; interpolated visual positions must never issue directions.
    }
    raf=requestAnimationFrame(animate);
    return()=>{
      stopped=true;cancelAnimationFrame(raf);
      const highlight=mapRef.current?._vanoFlowLine?.getElement?.();
      if(highlight)highlight.style.animationPlayState='paused';
      preference?.removeEventListener?.('change',preferenceChanged);
      visual.current={...state,last:0,lastPaint:0,lastReport:0};
    };
  },[active,navigation,selectedRoute,routes,token]);
  useEffect(()=>{onMotionState?.(status.current);},[navigation]);
  // Show the interactive map immediately. GPS acquisition is asynchronous and
  // must never cover/lock the map while permissions or network are pending.
  // A real first fix is applied directly via jumpTo, never a simulated fix.
  return <><div className={`map-container ${pickingOrigin?'choosing-origin':''}`} ref={root} role="region" aria-label="Mapa interativo de rotas"/>{error&&<div className="vano-map-alert" role="status">{error}</div>}</>;
}
function paintLeaflet(map,data){
  if(!map._vanoLayer)return;
  const ordered=[...(data.routes||[]).filter(x=>x.id!==data.selectedRoute),...(data.routes||[]).filter(x=>x.id===data.selectedRoute)];
  const geometries=ordered.map(r=>r.geometry);
  const strokeV2=shouldHighlightSelectedRoute(data);
  if(map._vanoLeafletSelection!==data.selectedRoute||
      map._vanoLeafletStrokeV2!==strokeV2||
      !sameRouteShapeReferences(map._vanoLeafletGeometries,geometries)){
    map._vanoLayer.clearLayers();
    map._vanoV2SelectedLine=null;map._vanoV2SelectedHalo=null;
    const sizes=v2RouteStrokePixels(map.getZoom(),strokeV2);
    ordered.forEach(r=>{
      const points=r.geometry?.coordinates?.filter(validPoint).map(ll);
      if(!points||points.length<2)return;
      if(r.id===data.selectedRoute&&strokeV2){
        // Border is BELOW the brand stroke, never beside a parallel road.
        map._vanoV2SelectedHalo=L.polyline(points,{
          color:V2_ROUTE_CASING_COLOR,weight:sizes.halo,opacity:.91,
          lineJoin:'round',lineCap:'round',interactive:false
        }).addTo(map._vanoLayer);
        map._vanoV2SelectedLine=L.polyline(points,{
          color:'#ff7900',weight:sizes.core,opacity:1,
          lineJoin:'round',lineCap:'round',interactive:false
        }).addTo(map._vanoLayer);
      }else L.polyline(points,{
        color:r.id===data.selectedRoute?'#ff7900':'#8a9ba9',
        weight:r.id===data.selectedRoute?8:5,
        opacity:r.id===data.selectedRoute?1:.65
      }).addTo(map._vanoLayer);
    });
    map._vanoLeafletSelection=data.selectedRoute;
    map._vanoLeafletStrokeV2=strokeV2;
    map._vanoLeafletGeometries=geometries;
  }
  if(!map._vanoV2StrokeZoomHook){
    // Keep the fallback as responsive as Mapbox; never modify the camera.
    map._vanoV2StrokeZoomHook=()=>{
      if(!map._vanoLeafletStrokeV2)return;
      const sizes=v2RouteStrokePixels(map.getZoom(),true);
      map._vanoV2SelectedHalo?.setStyle({weight:sizes.halo});
      map._vanoV2SelectedLine?.setStyle({weight:sizes.core});
      const arrowWidth=Math.min(9.3,Math.max(3.9,sizes.core*.68));
      map._vanoArrowLineGroup?.eachLayer(layer=>layer.setStyle?.({weight:arrowWidth}));
    };
    map.on('zoomend',map._vanoV2StrokeZoomHook);
  }
  // Keep the SVG flow overlay across GPS updates so its motion never restarts.
  const flowRoute=(data.routes||[]).find(r=>r.id===data.selectedRoute);
  if(map._vanoFlowGeometry!==flowRoute?.geometry){
    map._vanoFlowLine?.remove();
    map._vanoFlowLine=null;
    map._vanoFlowGeometry=flowRoute?.geometry;
    const flowPoints=flowRoute?.geometry?.coordinates?.filter(validPoint).map(ll);
    if(flowPoints?.length>1)map._vanoFlowLine=L.polyline(flowPoints,{color:'#fff2df',weight:2,opacity:.62,dashArray:STATIC_LEAFLET_DASH,lineCap:'butt',interactive:false,className:'vano-v35-flow-leaflet'}).addTo(map);
  }
  // Confirmed maneuvers remain visible in the Leaflet fallback, including /mapa.
  const arrowRoute=(data.routes||[]).find(r=>r.id===data.selectedRoute)||null;
  const showArrows=Boolean(data.readableRouteStroke||data.v2Experience);
  if(map._vanoLeafletDirectionArrowRoute!==arrowRoute||
      map._vanoLeafletDirectionArrowsVisible!==showArrows){
    map._vanoArrowLineGroup?.remove();
    map._vanoArrowLineGroup=null;
    map._vanoLeafletDirectionArrowRoute=arrowRoute;
    map._vanoLeafletDirectionArrowsVisible=showArrows;
    if(showArrows&&arrowRoute){
      const arrows=buildV2ManeuverArrows(arrowRoute);
      const group=L.layerGroup();
      const width=Math.min(9.3,Math.max(3.9,v2RouteStrokePixels(map.getZoom(),true).core*.68));
      arrows.features.forEach(f=>{
        const coordinates=f.geometry?.coordinates;
        if(f.geometry?.type==='Point'&&validPoint(coordinates)){
          const size=Math.min(13,Math.max(5,v2RouteStrokePixels(map.getZoom(),true).core*.9));
          const bearing=Number.isFinite(f.properties?.bearing)?f.properties.bearing:0;
          const icon=L.divIcon({
            className:'vano-route-turn-tip',
            html:`<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block;transform:rotate(${bearing}deg);transform-origin:50% 0"><path d="M16 1 L28 27 Q16 22 4 27 Z" fill="#fff"/></svg>`,
            iconSize:[size,size],iconAnchor:[size/2,0]
          });
          L.marker(ll(coordinates),{icon,interactive:false,keyboard:false}).addTo(group);
        }else if(f.geometry?.type==='LineString'&&coordinates?.length>1){
          L.polyline(coordinates.map(ll),{
            color:'#ffffff',weight:width,opacity:.98,
            lineJoin:'round',lineCap:'round',interactive:false
          }).addTo(group);
        }
      });
      group.addTo(map);
      map._vanoArrowLineGroup=group;
    }
  }
  const maviPoints=data.previewRoute?.geometry?.coordinates?.filter(validPoint);
  if(map._vanoMaviPreviewGeometry!==data.previewRoute?.geometry){
    map._vanoMaviPreviewLine?.remove();map._vanoMaviPreviewLine=null;
    map._vanoMaviPreviewGeometry=data.previewRoute?.geometry;
    if(maviPoints?.length>1)map._vanoMaviPreviewLine=L.polyline(maviPoints.map(ll),{
      color:'#00a9a1',weight:7,opacity:.94,dashArray:'10 8',interactive:false,
      className:'vano-mavi-route-preview'
    }).addTo(map);
  }
  syncLeafletRouteTraffic(map,L,{...data,routeTraffic:data.vehicle==='a-pe'?null:data.routeTraffic});
  syncRouteTrafficMarkers(map,'leaflet',L,data);
  map._vanoFlowLine?.bringToFront();map._vanoMaviPreviewLine?.bringToFront();
  map._vanoArrowLineGroup?.eachLayer(layer=>layer.bringToFront?.());
  if(validPoint(data.destination?.coords)){
    if(!map._vanoDestMarker){
      map._vanoDestMarker=L.marker(ll(data.destination.coords),{interactive:false,icon:L.divIcon({
        className:'vano-arrival-leaflet-icon',html:markerElement('destination').outerHTML,
        iconSize:[ARRIVAL_PIN_WIDTH,ARRIVAL_PIN_HEIGHT],iconAnchor:ARRIVAL_PIN_ANCHOR
      })}).addTo(map);
    }else map._vanoDestMarker.setLatLng(ll(data.destination.coords));
  }else if(map._vanoDestMarker){map._vanoDestMarker.remove();map._vanoDestMarker=null;}
  if(validPoint(data.manualOrigin)){
    if(!map._vanoManualOriginMarker)map._vanoManualOriginMarker=L.marker(ll(data.manualOrigin),{interactive:false,icon:L.divIcon({
      className:'',html:'<div class="map-pin map-pin-origin"></div>',iconSize:[24,24],iconAnchor:[12,12]
    })}).addTo(map);
    else map._vanoManualOriginMarker.setLatLng(ll(data.manualOrigin));
  }else if(map._vanoManualOriginMarker){map._vanoManualOriginMarker.remove();map._vanoManualOriginMarker=null;}
  if(data.destination?.coords&&data.routes?.length&&!data.navigation&&map._vanoFit!==data.destination.id){map._vanoFit=data.destination.id;const selected=data.routes.find(r=>r.id===data.selectedRoute)||data.routes[0];const pts=selected.geometry?.coordinates?.filter(validPoint);if(pts?.length)map.fitBounds(L.latLngBounds(pts.map(ll)),{padding:[60,60],maxZoom:14,animate:true});}
  if(!data.destination)map._vanoFit='';
}
function paintMapbox(map,data,selection){
  if(!isLoaded(map))return;
  const routes=(data.routes||[]).filter(feature),selected=routes.find(r=>r.id===data.selectedRoute),others=routes.filter(r=>r.id!==data.selectedRoute);
  const selectedGeo=geo(selected?[feature(selected)]:[]),othersGeo=geo(others.map(feature));
  // Repainting the same GeoJSON on every GPS tick interrupted the dash animation
  // and needlessly reprocessed route geometry. Reuse sources until actual shapes change.
  const routeShapes=map._vanoRouteSourceShapes??={};
  const upsert=(id,body)=>{
    const shapes=body.features.map(x=>x.geometry);
    const source=map.getSource(id);
    if(!source){map.addSource(id,{type:'geojson',data:body,...(id==='vano-v2-selected'?{lineMetrics:true}:{})});routeShapes[id]=shapes;return;}
    const previous=routeShapes[id];
    if(sameRouteShapeReferences(previous,shapes))return;
    source.setData(body);routeShapes[id]=shapes;
  };
  upsert('vano-v2-alternatives',othersGeo);upsert('vano-v2-selected',selectedGeo);
  const maviCandidate=feature(data.previewRoute);
  upsert('vano-mavi-route-preview',geo(maviCandidate?[maviCandidate]:[]));
  if(!map.getLayer('vano-v2-line')){map._vanoTrafficGradient=null;map._vanoTrafficV2=null;}
  if(!map.getLayer('vano-v2-other'))map.addLayer({id:'vano-v2-other',type:'line',source:'vano-v2-alternatives',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#7d91a3','line-width':5,'line-opacity':.66}});
  const strokeV2=shouldHighlightSelectedRoute(data);
  const stroke=v2RouteStrokePaint(strokeV2);
  // Only /v2 gets this heavier brand stroke. /mapa keeps its existing widths.
  const privateV2=Boolean(data.v2Experience);
  const privateLineWidth=privateV2?['interpolate',['linear'],['zoom'],14,6,15,7.5,16,9.5,17,11.5,18,13.5,19,15]:stroke.line['line-width'];
  const privateHaloWidth=privateV2?['interpolate',['linear'],['zoom'],14,10,15,11.5,16,14,17,16,18,19,19,21]:stroke.halo['line-width'];
  if(!map.getLayer('vano-v2-halo'))map.addLayer({id:'vano-v2-halo',type:'line',source:'vano-v2-selected',layout:{'line-join':'round','line-cap':'round'},paint:{...stroke.halo,'line-width':privateHaloWidth}});
  if(!map.getLayer('vano-v2-line'))map.addLayer({id:'vano-v2-line',type:'line',source:'vano-v2-selected',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ff7900',...stroke.line,'line-width':privateLineWidth,'line-opacity':1,'line-opacity-transition':{duration:250}}});
  // /mapa and /v2 share the approved thicker stroke while leaving camera,
  // GPS and privileged V2 behaviors separate. Update only on a true mode
  // change, never per frame, so route-flow animations stay untouched.
  if(map._vanoRouteStrokeV2!==strokeV2||map._vanoPrivateV2Stroke!==privateV2){
    map.setPaintProperty('vano-v2-halo','line-color',stroke.halo['line-color']);
    map.setPaintProperty('vano-v2-halo','line-width',privateHaloWidth);
    map.setPaintProperty('vano-v2-halo','line-opacity',stroke.halo['line-opacity']);
    map.setPaintProperty('vano-v2-line','line-width',privateLineWidth);
    map._vanoRouteStrokeV2=strokeV2;map._vanoPrivateV2Stroke=privateV2;
  }
  if(!map.getLayer('vano-mavi-preview-halo'))map.addLayer({
    id:'vano-mavi-preview-halo',type:'line',source:'vano-mavi-route-preview',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#ffffff','line-width':11,'line-opacity':.95}
  });
  if(!map.getLayer('vano-mavi-preview-line'))map.addLayer({
    id:'vano-mavi-preview-line',type:'line',source:'vano-mavi-route-preview',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#00a9a1','line-width':7,'line-opacity':.96,
      'line-dasharray':[2,1.5],'line-opacity-transition':{duration:180}}
  });
  // Motion 3.5: decorative dashes use the SAME source as the existing route.
  // The original orange stroke, white outline and progress layer remain intact.
  if(!map.getLayer('vano-v2-flow'))map.addLayer({
    id:'vano-v2-flow',type:'line',source:'vano-v2-selected',
    layout:{'line-join':'round','line-cap':'butt'},
    paint:{'line-color':'#fff2df','line-width':2.1,'line-opacity':.62,'line-dasharray':STATIC_ROUTE_DASH_PATTERN}
  },map.getLayer('vano-v2-progress')?'vano-v2-progress':undefined);
  // Route geometry is stable; a GPS update must never rebuild these arrows.
  const arrowsEnabled=Boolean(data.v2Experience||data.readableRouteStroke);
  const arrowsSource='vano-v2-maneuver-arrows';
  if(arrowsEnabled&&(!map.getSource(arrowsSource)||
      map._vanoDirectionArrowRoute!==(selected||null))){
    upsert(arrowsSource,buildV2ManeuverArrows(selected||null));
    map._vanoDirectionArrowRoute=selected||null;
  }
  const traffic=data.v2Experience&&data.vehicle!=='a-pe'?data.routeTraffic:null;
  if(map._vanoTrafficGradient!==traffic?.gradient||map._vanoTrafficV2!==Boolean(traffic)){
    if(traffic&&traffic.index?.points===selected?.geometry?.coordinates){
      map.setPaintProperty('vano-v2-line','line-gradient',traffic.gradient);
      map.setPaintProperty('vano-v2-line','line-color',TRAFFIC_COLORS.unknown);
    }else{
      map.setPaintProperty('vano-v2-line','line-gradient',null);
      map.setPaintProperty('vano-v2-line','line-color','#ff7900');
    }
    map.setLayoutProperty('vano-v2-flow','visibility','visible');
    map._vanoTrafficGradient=traffic?.gradient;map._vanoTrafficV2=Boolean(traffic);
  }
  syncRouteTrafficMarkers(map,'mapbox',mapboxgl,data);
  if(!map.getSource('vano-v2-traveled'))upsert('vano-v2-traveled',geo([]));
  // Empty progress only when navigation ends; repeated clears on every GPS update
  // caused extra source repaints and visible instability in the route overlay.
  if(data.navigation)map._vanoTraveledCleared=false;
  else if(!map._vanoTraveledCleared){
    map.getSource('vano-v2-traveled').setData(geo([]));
    map._vanoTraveledCleared=true;
  }
  if(!map.getLayer('vano-v2-progress'))map.addLayer({id:'vano-v2-progress',type:'line',source:'vano-v2-traveled',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#1e293b','line-width':7,'line-opacity':.85}});
  if(arrowsEnabled){
    const imageId='vano-route-arrowhead-white';
    if(!map.hasImage(imageId)){
      // A rounded filled chevron, not meter-wide line wings: 100% inside
      // the orange stroke at every supported zoom and screen inclination.
      const canvas=document.createElement('canvas');
      canvas.width=32;canvas.height=32;
      const ctx=canvas.getContext('2d');
      if(ctx){
        ctx.fillStyle='#ffffff';
        ctx.beginPath();
        ctx.moveTo(16,1);ctx.lineTo(28,27);
        ctx.quadraticCurveTo(16,22,4,27);
        ctx.closePath();ctx.fill();
        map.addImage(imageId,ctx.getImageData(0,0,32,32),{pixelRatio:1});
      }
    }
    if(!map.getLayer('vano-v2-maneuver-arrows-line'))map.addLayer({
      id:'vano-v2-maneuver-arrows-line',type:'line',source:arrowsSource,minzoom:14.2,
      filter:['==',['geometry-type'],'LineString'],
      layout:{'line-join':'round','line-cap':'round'},
      paint:{'line-color':'#ffffff','line-opacity':.98,
        'line-width':['interpolate',['linear'],['zoom'],
          14,3,15,3.8,16,4.7,17,5.8,18,7,19,8]}
    });
    if(map.hasImage(imageId)&&!map.getLayer('vano-v2-maneuver-arrows-head'))map.addLayer({
      id:'vano-v2-maneuver-arrows-head',type:'symbol',source:arrowsSource,minzoom:14.2,
      filter:['==',['geometry-type'],'Point'],
      layout:{'symbol-placement':'point','icon-image':imageId,
        'icon-allow-overlap':true,'icon-ignore-placement':true,
        'icon-anchor':'top','icon-rotation-alignment':'map',
        'icon-pitch-alignment':'map','icon-rotate':['get','bearing'],
        'icon-size':['interpolate',['linear'],['zoom'],
          14,.16,15,.2,16,.26,17,.33,18,.37,19,.4]},
      paint:{'icon-opacity':.98}
    });
    for(const layerId of ['vano-v2-maneuver-arrows-line','vano-v2-maneuver-arrows-head']){
      if(map.getLayer(layerId)&&map.getLayoutProperty(layerId,'visibility')!=='visible')
        map.setLayoutProperty(layerId,'visibility','visible');
    }
  }else{
    for(const layerId of ['vano-v2-maneuver-arrows-line','vano-v2-maneuver-arrows-head']){
      if(map.getLayer(layerId)&&map.getLayoutProperty(layerId,'visibility')!=='none')
        map.setLayoutProperty(layerId,'visibility','none');
    }
  }

  const marker=(key,point)=>{if(!validPoint(point)){map._vanoMarker?.[key]?.remove();if(map._vanoMarker)delete map._vanoMarker[key];return;}map._vanoMarker??={};const follow=shouldFollowLocation({navigation:data.navigation,destination:data.destination,pickingOrigin:data.pickingOrigin,manualOrigin:data.manualOrigin,position:data.gpsCoords});const type=key==='manual'?'origin':key==='current'?(follow?'vehicle':'origin'):'destination';const current=map._vanoMarker[key];if(current&&(!current.getElement().classList.contains(type==='vehicle'?'vano-vehicle-marker':`map-pin-${type}`)||(type==='vehicle'&&!current.getElement().classList.contains(data.vehicle==='moto'?'vano-vehicle-moto':'vano-vehicle-car')))){current.remove();delete map._vanoMarker[key];}if(!map._vanoMarker[key])map._vanoMarker[key]=new mapboxgl.Marker({element:markerElement(type,data.vehicle),anchor:type==='destination'?'bottom':'center',offset:type==='destination'?[0,5]:[0,0],rotationAlignment:type==='vehicle'?'map':'viewport',pitchAlignment:type==='vehicle'&&!data.droneSimulation?'map':'viewport',rotation:type==='vehicle'&&Number.isFinite(data.motionBearing)?data.motionBearing:0,occludedOpacity:type==='vehicle'&&data.droneSimulation?1:.2}).setLngLat(point).addTo(map);else map._vanoMarker[key].setLngLat(point);if(type==='vehicle'){const desiredPitch=data.droneSimulation?'viewport':'map';if(map._vanoMarker[key]._vanoV2PitchAlignment!==desiredPitch){map._vanoMarker[key].setPitchAlignment?.(desiredPitch);map._vanoMarker[key]._vanoV2PitchAlignment=desiredPitch;}const visibility=data.droneSimulation?1:.2;if(map._vanoMarker[key].getOccludedOpacity?.()!==visibility)map._vanoMarker[key].setOccludedOpacity?.(visibility);}};
  marker('current',data.motionCoords||data.gpsCoords||data.userCoords);marker('manual',validPoint(data.gpsCoords)?data.manualOrigin:null);marker('destination',data.destination?.coords);
  if(selection.current!==data.selectedRoute){selection.current=data.selectedRoute;map.setPaintProperty('vano-v2-line','line-opacity',.84);requestAnimationFrame(()=>{if(isLoaded(map)&&map.getLayer('vano-v2-line'))map.setPaintProperty('vano-v2-line','line-opacity',1);});}
  syncPrivateRoadSignMarkers(map,mapboxgl,data);
}
