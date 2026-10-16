import React,{useEffect,useRef,useState} from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Home, BriefcaseBusiness, Clock3, Utensils, Cross, LocateFixed, Layers3, UserRound, ArrowLeft, ArrowRightLeft, Navigation, CarFront, BusFront, Footprints, ShieldCheck, Zap, ChevronDown, ChevronUp, MapPin, AlertTriangle, Volume2, VolumeX, Check, MoveRight, MoreHorizontal, ArrowUpDown, PencilLine, MapPinned, Crosshair, ExternalLink } from 'lucide-react';
import VanoMap from '../components/VanoMap';
import MotorcycleIcon from '../components/MotorcycleIcon';
import {nearestOnRoute,validPoint} from '../lib/navigationMotion';
import {geoErrorMessage, hasRecentGpsFix, gpsStateAfterError, evaluateGpsPosition} from '../lib/geolocation';
import {startGpsSession} from '../lib/gpsSession';
import {readWarmGps,saveWarmGps} from '../lib/gpsWarmStart.js';
import {smoothGpsSpeedSample} from '../lib/mapSpeed.js';
import {speedLimitAtGpsPosition} from '../lib/routeSpeedLimit.js';
import {advanceTravelDistance} from '../lib/travelDistance.js';
import {searchGeoBias} from '../lib/searchGeoBias.js';
import {shouldRefreshAddress,navigationStreetLabel} from '../lib/addressCard';
import {swapJourney} from '../lib/routePoints';
import { api, fmtKm, fmtTime } from '../lib/api';
import { navigationSummary,arrivalClock } from '../lib/navigationSummary';
import { useVano } from '../context';
import {readOffline,writeOffline,deleteOffline,validTrip} from '../lib/offlineStore';
import {spokenCue} from '../lib/offlineGuidance';
import {speakNavigationVoice,stopNavigationVoice} from '../lib/navigationVoice.js';
import JevVoiceButton from '../components/JevVoiceButton.jsx';
import {playMaviVoice} from '../lib/maviElevenPlayback.mjs';
import {acquireNavigationAudioFocus} from '../lib/maviAudioFocus.mjs';
import {jevRouteFingerprint} from '../lib/jevShared.mjs';
import {selectMaviPreview,canFocusMaviPreview} from '../lib/maviPreview.mjs';
import {classifyMaviIntent,answerMaviInformation} from '../lib/maviAssistant.mjs';
import {isMaviTalkTurn,limitedMaviTalkHistory} from '../lib/maviTalk.mjs';
import {routeRoadEvidence} from '../lib/jevStreetRouting.mjs';
import {upcomingCorridor} from '../lib/upcomingCorridor';
import {buildRouteTimeline,distanceOnRoute,nextManeuver} from '../lib/routeAnimation';
import {createManeuverTracker} from '../lib/maneuverTracker.js';
import {evaluateRouteDeviation} from '../lib/routeDeviation.js';
import {maneuverVariant,laneVariants,displayManeuverDistance,maneuverText} from '../lib/maneuverVisuals';
import ManeuverGlyph from '../components/ManeuverGlyph';
import {isNativeShell,notifyNative} from '../lib/nativeShell';
import {startNavigationWakeLock} from '../lib/navigationWakeLock.mjs';
const shortcuts=[{name:'Casa', icon:Home},{name:'Trabalho',icon:BriefcaseBusiness},{name:'Rotina',icon:Clock3},{name:'Restaurantes',icon:Utensils},{name:'Hospitais',icon:Cross}];
export default function MapPage({active=true}){
  const {user,preferences,favorites,saveTrip,setToast,demo,t,language}=useVano(),navigate=useNavigate(),location=useLocation();
  const jevMode=location.pathname==='/v2';
  const rerouteRequest=useRef(null),routeVehicleTimer=useRef(null),mapPageRef=useRef(null),mapControl=useRef(null),searchInput=useRef(null),searchCache=useRef(new Map()),routeEpoch=useRef(0),rerouteState=useRef({outsideSince:0,outsideCount:0,lastFixAt:0,lastAttempt:0}),lastGpsFix=useRef(null),gpsRequestSeq=useRef(0),awaitingGpsDestination=useRef(false),manualCoordsRef=useRef(null),speedSampleRef=useRef(null),speedExpiryTimer=useRef(null),routeCalculator=useRef(null),addressLookup=useRef(null),addressController=useRef(null);
  const maviResponseTurn=useRef(0),maviTalkHistory=useRef([]),maneuverAudioRef=useRef(null),guidanceTrackerRef=useRef({route:null,tracker:null}),cuePlaybackRef=useRef({at:0,stepIndex:null,stage:null,followingIndex:null}),voiceRouteProofRef=useRef({route:null,proof:null}),voiceRetryAfterRef=useRef(0);
  const measuredTrip=useRef(null),odometer=useRef({meters:0,anchor:null,lastSeenAt:null}),distanceSync=useRef(0),tripWrites=useRef(Promise.resolve()),lastWarmGpsWrite=useRef(0);
  function queueTripWrite(item){tripWrites.current=tripWrites.current.catch(()=>{}).then(()=>saveTrip(item)).catch(()=>setToast('Não foi possível salvar a distância percorrida.'));return tripWrites.current;}
  function syncMeasuredDistance(force=false){
    const trip=measuredTrip.current;if(!trip||(!force&&Date.now()-distanceSync.current<15000))return;
    distanceSync.current=Date.now();
    return queueTripWrite({type:'progress',journeyId:trip.id,travelledMeters:Math.round(odometer.current.meters)});
  }
  useEffect(()=>{const flush=()=>syncMeasuredDistance(true);window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('pagehide',flush);flush();};},[]);
  useEffect(()=>{if(!active)syncMeasuredDistance(true);},[active]);
  const [telemetry,setTelemetry]=useState({}),[speedSample,setSpeedSample]=useState(null),[recalculating,setRecalculating]=useState(false),[userCoords,setUserCoords]=useState(null),[warmCoords,setWarmCoords]=useState(()=>{try{return readWarmGps(window.localStorage)?.coords||null;}catch{return null;}}),[gpsStatus,setGpsStatus]=useState('checking'),[gpsMessage,setGpsMessage]=useState(''),[gpsClock,setGpsClock]=useState(0),[manualCoords,setManualCoords]=useState(null),[pickOriginMode,setPickOriginMode]=useState(false),[query,setQuery]=useState(''),[suggestions,setSuggestions]=useState([]),[searchBusy,setSearchBusy]=useState(false),[searchError,setSearchError]=useState(''),[allPlaces,setAllPlaces]=useState([]),[searchOpen,setSearchOpen]=useState(false),[dest,setDest]=useState(null),[maviPendingStop,setMaviPendingStop]=useState(null),[maviResuming,setMaviResuming]=useState(false),[routeData,setRouteData]=useState(null),[choice,setChoice]=useState('safe'),[sheetOpen,setSheetOpen]=useState(false),[loadingRoute,setLoadingRoute]=useState(false),[navMode,setNavMode]=useState(false),[muted,setMuted]=useState(false),[layer,setLayer]=useState('streets'),[trafficEnabled,setTrafficEnabled]=useState(()=>{try{return window.localStorage.getItem('vano-traffic-layer')!=='off';}catch{return true;}}),[trafficStatus,setTrafficStatus]=useState('loading'),[pointMenu,setPointMenu]=useState(null),[editor,setEditor]=useState(null),[editorQuery,setEditorQuery]=useState(''),[editorResults,setEditorResults]=useState([]),[editorBusy,setEditorBusy]=useState(false),[editorError,setEditorError]=useState(''),[manualLabel,setManualLabel]=useState('Origem selecionada'),[guidance,setGuidance]=useState(null),[currentAddress,setCurrentAddress]=useState(null);
  // Route selection is explicit: the chosen vehicle drives route calculation,
  // navigation marker, and any off-route recalculation.
  const [routeVehicle,setRouteVehicle]=useState(()=>preferences?.vehicle==='moto'?'moto':'carro');
  const [maviPreview,setMaviPreview]=useState(null); // V2 only, never changes the active route.
  const [offlineMap,setOfflineMap]=useState({status:'idle',key:''}),[spokenRevision,setSpokenRevision]=useState(0),[voiceProblem,setVoiceProblem]=useState(false),[storageReady,setStorageReady]=useState(null);
  const offlineGeneration=useRef(0),cachePosition=useRef(null),spoken=useRef(new Set()),lastVoiceAttempt=useRef(null),tripBooted=useRef(false),lastSave=useRef(0),lastSaveRoute=useRef(null),lastSaveOptions=useRef('');
  const initialChoice=preferences?.preferredRoute==='fast'?'fast':'safe';
  const handledDestination=useRef(''),destRef=useRef(null);
  useEffect(()=>{maviTalkHistory.current=[];},[user?.id]);
  useEffect(()=>{if(!dest&&!navMode)setRouteVehicle(preferences?.vehicle==='moto'?'moto':'carro');},[preferences?.vehicle]);
  useEffect(()=>()=>{if(routeVehicleTimer.current!==null)clearTimeout(routeVehicleTimer.current);},[]);
  destRef.current=dest;
  useEffect(()=>{if(!tripBooted.current)setChoice(initialChoice);},[initialChoice]);
  useEffect(()=>{try{window.localStorage.setItem('vano-traffic-layer',trafficEnabled?'on':'off');}catch{/* Private-mode storage unavailable. */}},[trafficEnabled]);
  useEffect(()=>{let dead=false;readOffline('active-trip').then(saved=>{const value=validTrip(saved,user?.id||'guest');if(dead||!value)return;tripBooted.current=true;if(value.measuredTrip?.id){measuredTrip.current=value.measuredTrip;odometer.current={meters:Number(value.measuredTrip.meters)||0,anchor:null,lastSeenAt:null};}setDest(value.destination);setMaviPendingStop(value.maviPendingStop?.originalDestination?.coords?.length===2?value.maviPendingStop:null);setRouteData({routes:[value.route],source:value.source,safetyMessage:value.safetyMessage});setChoice(value.route.id);setRouteVehicle(['carro','moto','a-pe'].includes(value.vehicle)?value.vehicle:preferences?.vehicle==='moto'?'moto':'carro');setLayer(value.layer||'streets');setMuted(!!value.muted);setNavMode(true);setSheetOpen(false);setOfflineMap({status:value.mapPrepared?'ready':'idle',key:value.route.id});if(value.position){setUserCoords(value.position.coords);setTelemetry(value.position.telemetry||{});}spoken.current=new Set(value.spoken||[]);});return()=>{dead=true;};},[user?.id]);
  useEffect(()=>{
    const status=()=>setVoiceProblem(true);
    const nativeFailure=event=>{
      const error=String(event?.detail?.error||'');
      // Existing Android WebView emits failed TTS here instead of voice-status.
      if(!/voz offline indisponível|instale uma voz local/i.test(error))return;
      if(jevMode){setVoiceProblem(true);return;} // V2 must not switch maneuvers to browser TTS.
      const attempt=lastVoiceAttempt.current;
      if(!navMode||muted||!attempt){setVoiceProblem(true);return;}
      // If the APK has no offline voice, try device/browser Web Speech once.
      // Never send the failed instruction back to the same Android bridge.
      const result=speakNavigationVoice(attempt.text,language,{
        native:false,
        onStart:()=>setVoiceProblem(false),
        onFailure:()=>{
          if(attempt.key)spoken.current.delete(attempt.key);
          setVoiceProblem(true);
        }
      });
      if(!result.ok)setVoiceProblem(true);
    };
    window.addEventListener('vano:voice-status',status);
    window.addEventListener('vano:native-dictation',nativeFailure);
    return()=>{
      window.removeEventListener('vano:voice-status',status);
      window.removeEventListener('vano:native-dictation',nativeFailure);
    };
  },[navMode,muted,language]);
  useEffect(()=>{const native=e=>onPosition(e.detail);window.addEventListener('vano:native-position',native);return()=>window.removeEventListener('vano:native-position',native);},[]);
  useEffect(()=>{notifyNative({action:'navigation',active:navMode});return()=>notifyNative({action:'navigation',active:false});},[navMode]);
  useEffect(()=>{notifyNative({action:'wake',active:navMode});return()=>notifyNative({action:'wake',active:false});},[navMode]);
  useEffect(()=>navMode&&active?startNavigationWakeLock():undefined,[navMode,active]);
  useEffect(()=>{const result=e=>{if(e.detail?.id!==offlineGeneration.current)return;setOfflineMap(v=>({...v,status:e.detail.ok?'ready':'partial'}));};window.addEventListener('vano:offline-map',result);return()=>window.removeEventListener('vano:offline-map',result);},[]);

  // Floating map controls are positioned against the ACTUAL route panel height.
  // This avoids the gap caused by assuming every expanded sheet occupies 66dvh.
  useEffect(()=>{
    const root=mapPageRef.current;
    if(!root)return;
    const panel=root.querySelector('.route-sheet, .collapsed-route');
    if(!panel){root.style.removeProperty('--v33-panel-clearance');return;}
    const measure=()=>{
      if(!panel.isConnected)return;
      const inset=Number.parseFloat(window.getComputedStyle(panel).bottom)||0;
      const clearance=Math.ceil(panel.offsetHeight+inset+12);
      root.style.setProperty('--v33-panel-clearance',clearance+'px');
    };
    measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(panel);
    window.addEventListener('resize',measure,{passive:true});
    return()=>{
      observer?.disconnect();
      window.removeEventListener('resize',measure);
      root.style.removeProperty('--v33-panel-clearance');
    };
  },[sheetOpen,navMode,searchOpen,Boolean(dest),loadingRoute]);

  // The dock may grow with GPS/route warnings. Measure its actual height so
  // the road-name pill never covers 'Encerrar navegação' on small phones.
  useEffect(()=>{
    if(!navMode)return;
    const root=mapPageRef.current;
    const dock=root?.querySelector('.nav-bottom');
    if(!root||!dock)return;
    const measure=()=>root.style.setProperty('--v36-nav-dock-height',Math.ceil(dock.offsetHeight)+'px');
    measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(dock);
    window.addEventListener('resize',measure,{passive:true});
    return()=>{
      observer?.disconnect();
      window.removeEventListener('resize',measure);
      root.style.removeProperty('--v36-nav-dock-height');
    };
  },[navMode]);

  useEffect(()=>{api('/places').then(setAllPlaces).catch(()=>{});},[]);
  useEffect(()=>{
    if(!pointMenu&&!editor)return;
    function key(e){if(e.key==='Escape'){setPointMenu(null);setEditor(null);}}
    function outside(e){if(pointMenu&&!e.target.closest('.v5-point-actions'))setPointMenu(null);}
    window.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside)};
  },[pointMenu,editor]);
  // Warm coordinates paint the previous real GPS marker immediately, but cannot
  // be a route origin or a substitute for an accepted live GPS fix.
  const displayCoords=userCoords||warmCoords;
  const origin=manualCoords||userCoords;
  const usingManual=validPoint(manualCoords);
  manualCoordsRef.current=manualCoords;
  const hasLiveGPS=validPoint(userCoords)&&!usingManual&&gpsStatus==='granted'&&hasRecentGpsFix(lastGpsFix.current,Date.now(),35000);
  // A speed readout is NOT the route's ETA/simulation: it is computed only
  // from accepted GPS speed samples during active navigation. Stale -> "—".
  const speedKmh=navMode&&hasLiveGPS&&speedSample&&
    Date.now()-speedSample.sourceAt<18000&&Date.now()>=speedSample.sourceAt
      ?speedSample.kmh:null;
  function onPosition(p){
    const result=evaluateGpsPosition(p,lastGpsFix.current);
    if(!result.ok)return null;
    const {fix}=result;
    lastGpsFix.current=fix;
    setUserCoords(fix.coords);
    if(warmCoords)setWarmCoords(null);
    if(Date.now()-lastWarmGpsWrite.current>=10000&&saveWarmGps(window.localStorage,fix))lastWarmGpsWrite.current=Date.now();
    setTelemetry({heading:result.heading,speed:result.speed,accuracy:fix.accuracy});
    if(measuredTrip.current&&!measuredTrip.current.simulated){
      odometer.current=advanceTravelDistance(odometer.current,fix,{active:true,speed:result.speed,vehicle:measuredTrip.current.vehicle});
      syncMeasuredDistance();
    }
    if(navMode){
      const next=smoothGpsSpeedSample(speedSampleRef.current,result.speed,{
        sourceAt:fix.sourceAt,accuracy:fix.accuracy,simulated:demo
      });
      speedSampleRef.current=next;
      setSpeedSample(next);
      if(speedExpiryTimer.current!==null)clearTimeout(speedExpiryTimer.current);
      speedExpiryTimer.current=null;
      if(next){
        const delay=Math.max(1,18000-(Date.now()-next.sourceAt));
        speedExpiryTimer.current=setTimeout(()=>{
          speedSampleRef.current=null;setSpeedSample(null);
          speedExpiryTimer.current=null;
        },delay);
      }
    }
    setGpsStatus(fix.accuracy<=50?'granted':'approximate');setGpsMessage('');
    if(awaitingGpsDestination.current&&!validPoint(manualCoordsRef.current)&&destRef.current){
      awaitingGpsDestination.current=false;setPickOriginMode(false);
      routeCalculator.current?.(destRef.current,fix.coords);
    }
    return fix;
  }
  function onPositionError(error){
    const state=gpsStateAfterError(error,lastGpsFix.current);
    // An old pending request or a temporary indoors accuracy error is not loss of an already valid fix.
    if(state==='granted'){setGpsStatus(lastGpsFix.current?.accuracy<=50?'granted':'approximate');setGpsMessage('');return;}
    setGpsStatus(state);
    setGpsMessage(geoErrorMessage(error));
  }
  function requestGPS(switchToGPS=true){
    if(switchToGPS&&hasRecentGpsFix(lastGpsFix.current,Date.now(),20000)&&lastGpsFix.current.accuracy<=50){
      const coords=lastGpsFix.current.coords;
      setManualCoords(null);setPickOriginMode(false);setGpsStatus('granted');setGpsMessage('');
      if(destRef.current)calculateRoute(destRef.current,coords);
      mapControl.current?.center?.();
      return;
    }
    if(!window.isSecureContext){if(!hasRecentGpsFix(lastGpsFix.current)){setGpsStatus('insecure');setGpsMessage('No celular, o IP por HTTP bloqueia o GPS. Use HTTPS confiável ou selecione a origem manualmente.');}return;}
    if(!navigator.geolocation){if(!hasRecentGpsFix(lastGpsFix.current)){setGpsStatus('unsupported');setGpsMessage('Este navegador não disponibilizou a localização.');}return;}
    if(!hasRecentGpsFix(lastGpsFix.current)){setGpsStatus('checking');setGpsMessage('');}
    const attempt=++gpsRequestSeq.current;
    const success=p=>{
      if(attempt!==gpsRequestSeq.current)return;
      const waiting=awaitingGpsDestination.current;
      const fix=onPosition(p);
      if(switchToGPS&&fix){
        awaitingGpsDestination.current=false;setManualCoords(null);setPickOriginMode(false);
        if(destRef.current&&!waiting)calculateRoute(destRef.current,fix.coords);
      }
    };
    const failed=e=>{
      if(attempt!==gpsRequestSeq.current)return;
      // A mobile GPS chip may be unavailable indoors; retry once using cached/network location.
      if(e?.code===2||e?.code===3){
        navigator.geolocation.getCurrentPosition(success,onPositionError,
          {enableHighAccuracy:false,timeout:14000,maximumAge:15000});
      }else onPositionError(e);
    };
    navigator.geolocation.getCurrentPosition(success,failed,
      {enableHighAccuracy:true,timeout:18000,maximumAge:30000});
  }
  useEffect(()=>{
    if(!navMode){speedSampleRef.current=null;setSpeedSample(null);}
    return()=>{if(speedExpiryTimer.current!==null){clearTimeout(speedExpiryTimer.current);speedExpiryTimer.current=null;}};
  },[navMode]);
  useEffect(()=>{
    const id=setInterval(()=>{
      setGpsClock(x=>x+1);
      if(lastGpsFix.current&&!hasRecentGpsFix(lastGpsFix.current,Date.now(),navMode?35000:60000))
        setGpsStatus(s=>s==='granted'||s==='approximate'?'reconnecting':s);
    },12000);
    return()=>clearInterval(id);
  },[navMode]);
  useEffect(()=>{
    if(!active&&!navMode)return;
    // First login: ONE permission prompt / continuous watch; delayed recovery only if no valid fix.
    // Every callback is deactivated on unmount and when changing navigation modes.
    if(!window.isSecureContext){
      setGpsStatus('insecure');
      setGpsMessage('A localização exige HTTPS. Use um endereço seguro ou escolha a origem no mapa.');
      return;
    }
    if(!navigator.geolocation){
      setGpsStatus('unsupported');
      setGpsMessage('Este navegador não oferece acesso ao GPS.');
      return;
    }
    if(!hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)){
      setGpsStatus('checking');
      setGpsMessage('');
    }
    const stop=startGpsSession(navigator.geolocation,{
      onPosition,onError:onPositionError,
      onRecover:()=>{if(navMode&&!hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)){
        setGpsStatus('reconnecting');setGpsMessage('Reconectando ao GPS. Mantendo o último ponto conhecido.');
      }}
    },{navigation:navMode,documentObject:document,windowObject:window});
    return()=>{
      stop();
      // getCurrentPosition cannot be canceled by browsers; invalidate any older callbacks.
      gpsRequestSeq.current++;
    };
  },[navMode,active]);
  // Reverse geocode a granted browser location, never the initial map default or a manual origin.
  // Requests are throttled by time and distance; out-of-order updates never repaint the card.
  useEffect(()=>{
    const point=userCoords;
    if(navigator.onLine===false||!active||!validPoint(point)||!hasRecentGpsFix(lastGpsFix.current,Date.now(),60000))return;
    if(addressController.current||!shouldRefreshAddress(addressLookup.current,point,Date.now(),navMode))return;
    addressLookup.current={point:[...point],at:Date.now()};
    const controller=new AbortController();
    addressController.current=controller;
    const longitude=point[0].toFixed(5),latitude=point[1].toFixed(5);
    api(`/reverse?longitude=${longitude}&latitude=${latitude}&lang=${encodeURIComponent(language)}`,{signal:controller.signal})
      .then(result=>{
        if(controller.signal.aborted)return;
        if(result?.found&&result.address?.street){
          setCurrentAddress({street:result.address.street,detail:result.address.detail||''});
        }else setCurrentAddress({street:'Endereço não encontrado',detail:'Seu GPS está ativo'});
      })
      .catch(()=>{
        if(!controller.signal.aborted)setCurrentAddress(prev=>prev||{street:'Localização identificada',detail:'Endereço temporariamente indisponível'});
      })
      .finally(()=>{if(addressController.current===controller)addressController.current=null;});
  },[userCoords?.[0],userCoords?.[1],navMode,language]);
  useEffect(()=>()=>addressController.current?.abort(),[]);
  useEffect(()=>{
    if(!searchOpen){setSearchBusy(false);return;}
    const term=query.trim();
    if(term.length<2){setSuggestions(allPlaces.slice(0,5));setSearchError('');setSearchBusy(false);return;}
    // Rounded GPS proximity favors nearby places without restricting worldwide search.
    const nearby=searchGeoBias(userCoords,{gpsGranted:gpsStatus==='granted',manual:usingManual});
    const cacheKey=language+'|'+term.toLocaleLowerCase()+'|'+nearby;
    const cached=searchCache.current.get(cacheKey);
    if(cached&&Date.now()-cached.at<45000){
      setSuggestions(cached.results);setSearchError('');setSearchBusy(false);return;
    }
    const controller=new AbortController();
    // Never let an older server response overwrite the latest query.
    setSuggestions([]);setSearchError('');setSearchBusy(true);
    const timer=setTimeout(()=>{
      api('/search?q='+encodeURIComponent(term)+'&lang='+encodeURIComponent(language)+nearby,{signal:controller.signal})
        .then(items=>{
          if(controller.signal.aborted)return;
          const results=Array.isArray(items)?items:[];
          searchCache.current.set(cacheKey,{results,at:Date.now()});
          if(searchCache.current.size>16)searchCache.current.clear();
          setSuggestions(results);
        })
        .catch(error=>{if(!controller.signal.aborted){setSuggestions([]);setSearchError(error?.message||'Busca indisponível no momento.');}})
        .finally(()=>{if(!controller.signal.aborted)setSearchBusy(false);});
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,searchOpen,allPlaces,language,usingManual,gpsStatus,userCoords?.[0],userCoords?.[1]]);
  async function calculateRoute(place,departure,vehicle=routeVehicle){
    // Any new route request supersedes a pending vehicle-change debounce.
    if(routeVehicleTimer.current!==null){clearTimeout(routeVehicleTimer.current);routeVehicleTimer.current=null;}
    if(!validPoint(departure)||!validPoint(place?.coords))return;
    const epoch=++routeEpoch.current;
    setLoadingRoute(true);setSheetOpen(true);setRouteData(null);
    try{
      const data=await api('/route',{method:'POST',body:JSON.stringify({origin:departure,destination:place.coords,vehicle,language,telemetry:{bearing:hasLiveGPS?telemetry.heading:null,speed:hasLiveGPS?telemetry.speed:null}})});
      if(epoch===routeEpoch.current){setRouteData(data);setChoice(vehicle==='a-pe'?'fast':initialChoice);}
    }catch(e){if(epoch===routeEpoch.current)setToast(e.message);}
    finally{if(epoch===routeEpoch.current)setLoadingRoute(false);}
  }
  routeCalculator.current=calculateRoute;
  function chooseRouteVehicle(vehicle){
    if(!['carro','moto','a-pe'].includes(vehicle)||vehicle===routeVehicle)return;
    setRouteVehicle(vehicle);
    // Invalidate an earlier request immediately: stale car routes must never
    // appear under a selected motorcycle toggle (and vice versa).
    routeEpoch.current++;
    if(routeVehicleTimer.current!==null){clearTimeout(routeVehicleTimer.current);routeVehicleTimer.current=null;}
    if(!dest||!validPoint(origin)){setRouteData(null);return;}
    setRouteData(null);setLoadingRoute(true);setSheetOpen(true);
    // Combine fast successive taps into one provider request (API quota).
    routeVehicleTimer.current=setTimeout(()=>{
      routeVehicleTimer.current=null;
      calculateRoute(dest,origin,vehicle);
    },220);
  }
  function pick(place){
    if(!validPoint(place.coords)){setToast('Este destino ainda não tem coordenadas.');return;}
    setMaviPendingStop(null);setDest(place);setQuery('');setSearchOpen(false);setEditor(null);setPointMenu(null);setNavMode(false);setGuidance(null);setRouteData(null);
    if(!validPoint(origin)){
      awaitingGpsDestination.current=true;
      routeEpoch.current++;
      setSheetOpen(false);setPickOriginMode(true);
      setToast('Selecione no mapa de onde você quer sair. Não precisa permitir o GPS.');
      return;
    }
    awaitingGpsDestination.current=false;setPickOriginMode(false);
    calculateRoute(place,origin);
  }
  function chooseOrigin(coords,label='Origem selecionada no mapa'){
    if(!validPoint(coords))return;
    awaitingGpsDestination.current=false;setMaviPendingStop(null);setManualCoords(coords);setManualLabel(label);setPickOriginMode(false);setNavMode(false);setEditor(null);setPointMenu(null);
    setToast('Origem manual definida. Você já pode calcular rotas sem GPS.');
    if(dest)calculateRoute(dest,coords);
  }
  function openEditor(kind){
    setEditor(kind);setPointMenu(null);setSearchOpen(false);
    setEditorQuery('');setEditorError('');setEditorResults(allPlaces.slice(0,6));
  }
  function chooseEdited(place){
    if(!validPoint(place?.coords)){setToast('O endereço ainda não possui uma posição válida.');return;}
    if(editor==='origin')chooseOrigin(place.coords,place.name);
    else pick(place);
    setEditor(null);
  }
  function swapPoints(){
    const flipped=swapJourney(origin,dest,usingManual?manualLabel:'Ponto de partida anterior');
    if(!flipped){setToast('Defina origem e destino para inverter.');return;}
    setMaviPendingStop(null);setManualCoords(flipped.manualCoords);setManualLabel(flipped.manualLabel);setDest(flipped.destination);
    setPointMenu(null);setEditor(null);setNavMode(false);setRouteData(null);
    setSheetOpen(true);setPickOriginMode(false);setQuery('');
    calculateRoute(flipped.destination,flipped.manualCoords);
  }
  useEffect(()=>{
    if(!editor)return;
    const q=editorQuery.trim();
    if(q.length<2){setEditorResults(allPlaces.slice(0,6));setEditorError('');setEditorBusy(false);return;}
    const controller=new AbortController();setEditorError('');setEditorBusy(true);
    const timer=setTimeout(()=>{
      api(`/search?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(language)}${searchGeoBias(userCoords,{gpsGranted:gpsStatus==='granted',manual:usingManual})}`, {signal:controller.signal})
      .then(items=>{if(!controller.signal.aborted)setEditorResults(Array.isArray(items)?items:[]);})
      .catch(error=>{if(!controller.signal.aborted){setEditorResults([]);setEditorError(error?.message||'Busca indisponível no momento.');}})
      .finally(()=>{if(!controller.signal.aborted)setEditorBusy(false);});
    },250);
    return()=>{clearTimeout(timer);controller.abort()};
  },[editor,editorQuery,allPlaces,language,usingManual,gpsStatus,userCoords?.[0],userCoords?.[1]]);
  function clickShortcut(s){
    if(s.name==='Rotina'){navigate('/rotinas');return;}
    if(s.name==='Casa'||s.name==='Trabalho'){const f=favorites.find(f=>f.category===s.name||f.name.toLowerCase()===s.name.toLowerCase());if(f)pick(f);else navigate(`/favoritos?new=${encodeURIComponent(s.name)}`);return;}
    setQuery(s.name==='Restaurantes'?'restaurante':'hospital');setSearchOpen(true);setTimeout(()=>searchInput.current?.focus(),70);
  }
  useEffect(()=>{
    const id=new URLSearchParams(location.search).get('destination');
    if(!id || handledDestination.current===id)return;
    const found=favorites.find(x=>x.id===id);
    if(found){handledDestination.current=id;pick(found);}
  },[location.search,favorites]);
  const route=routeData?.routes?.find(r=>r.id===choice)||routeData?.routes?.[0];
  // Experimental-only integration: none of these actions are exposed on /mapa.
  const jevKey=jevMode?jevRouteFingerprint(route):null;
  const visibleMaviPreview=jevMode&&maviPreview?.sourceKey===jevKey?maviPreview:null;
  const focusMaviPreview=!!visibleMaviPreview&&canFocusMaviPreview({
    navigation:navMode,hasLiveGPS,speedKmh
  });
  function showMaviPreview(proposal){
    if(jevMode)setMaviPreview(selectMaviPreview(proposal,route,dest));
  }
  function clearMaviPreview(){setMaviPreview(null);}
  async function askJev(text,signal,maviMeta={}){
    // Informational commands work even before planning a route. The server
    // gates route-changing requests until a real route and vehicle exist.
    const replyVariant=maviResponseTurn.current++%3;
    const conversation=isMaviTalkTurn(text,{conversationActive:maviTalkHistory.current.length>0});
    const rememberReply=response=>{
      if(!conversation||signal?.aborted||response?.mode!=='information'||typeof response.text!=='string')return response;
      maviTalkHistory.current=limitedMaviTalkHistory([
        ...maviTalkHistory.current,{role:'user',text},{role:'assistant',text:response.text}
      ]);
      return response;
    };
    const greeting=classifyMaviIntent(text)==='greeting';
    let firstMaviGreeting=false;
    if(greeting){
      try{firstMaviGreeting=window.localStorage.getItem('vano-mavi-introduced')!=='1';}
      catch{firstMaviGreeting=maviResponseTurn.current===1;}
    }
    const start=navMode&&hasLiveGPS&&validPoint(userCoords)?userCoords:origin;
    const all=route?.geometry?.coordinates;
    const idx=navMode&&hasLiveGPS&&Array.isArray(all)?
      Math.max(0,nearestOnRoute(userCoords,route.geometry)?.index||0):0;
    const path=Array.isArray(all)?all.slice(idx):[];
    const stride=Math.max(1,Math.ceil((path.length-1)/159));
    const routeGeometry=path.filter((_,i)=>i%stride===0||i===path.length-1);
    const payload={
      text,origin:validPoint(start)?start:null,destination:dest?.coords||null,vehicle:routeVehicle,language,
      currentRouteKey:jevKey,currentDuration:route?.duration??null,currentDistance:route?.distance??null,
      routeGeometry,
      context:{
        hasRoute:!!route,navigationActive:navMode,gpsReady:hasLiveGPS,pendingStop:!!maviPendingStop,
        firstMaviTurn:maviMeta.firstTurn===true,replyVariant,firstMaviGreeting,
        destination:String(dest?.name||dest?.address||'').slice(0,100),
        vehicle:routeVehicle,routeId:route?.id||null,audioMuted:muted,
        currentDuration:route?.duration??null,currentDistance:route?.distance??null,
        remainingMinutes:navMode&&hasLiveGPS?navigationStats?.remainingMinutes:null,
        remainingKm:navMode&&hasLiveGPS?navigationStats?.remainingKm:null,
        progress:navMode&&hasLiveGPS?navigationStats?.progress:null,
        arrivalClock:navMode&&hasLiveGPS?estimatedArrival:null,
        localClock:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false}),
        speedKmh:hasLiveGPS?speedKmh:null,postedLimit:hasLiveGPS?postedLimit:null,
        nextInstruction:navMode&&hasLiveGPS?guidance?.instruction:null,
        nextStreet:navMode&&hasLiveGPS?guidance?.street:null,
        nextDistanceMeters:navMode&&hasLiveGPS?guidance?.distance:null,
        currentStreet:navMode&&hasLiveGPS?navigationStreetLabel(currentAddress,true):null,
        ...(conversation?{conversationHistory:limitedMaviTalkHistory(maviTalkHistory.current)}:{})
      },telemetry:{
        bearing:hasLiveGPS?telemetry.heading:null,speed:hasLiveGPS?telemetry.speed:null
      }
    };
    // Read-only status and bounded map actions never need an LLM or network.
    // Speech remains cancellable and actual route changes still go to the server.
    const localIntent=classifyMaviIntent(text);
    if(localIntent!=='repeat'&&localIntent!=='places_unavailable'){
      const instant=answerMaviInformation(localIntent,payload.context);
      if(instant){
        if(greeting&&firstMaviGreeting){try{window.localStorage.setItem('vano-mavi-introduced','1');}catch{}}
        return {...instant,voiceTicketPromise:muted?null:api('/v2/assistant/local-voice-ticket',{
          method:'POST',signal,body:{intent:localIntent,context:payload.context}
        }).then(result=>result.voiceTicket).catch(()=>null)};
      }
    }
    return api('/v2/assistant',{method:'POST',signal,body:payload});
  }
  function handleMaviAction(action){
    if(!jevMode)return false;
    if(action==='recenter_map'){mapControl.current?.center?.();return true;}
    if(action==='show_traffic'){setTrafficEnabled(true);return true;}
    if(action==='hide_traffic'){setTrafficEnabled(false);return true;}
    if(action==='route_overview'){
      if(navMode&&(!hasLiveGPS||!Number.isFinite(speedKmh)||speedKmh>2))return false;
      mapControl.current?.overview?.();return true;
    }
    if(action==='mute_guidance'){
      setMuted(true);stopNavigationVoice({native:isNativeShell(),sendNative:notifyNative});return true;
    }
    if(action==='resume_original'){void resumeMaviDestination();return true;}
    if(action==='unmute_guidance'){
      setMuted(false);setVoiceProblem(false);spoken.current.clear();return true;
    }
    return false;
  }
  async function resumeMaviDestination(){
    const stop=maviPendingStop,original=stop?.originalDestination;
    if(!jevMode||!original||!validPoint(original.coords)||maviResuming)return false;
    if(navMode&&!hasLiveGPS){
      setToast('Aguarde o GPS atualizar antes de continuar até o destino original.');return false;
    }
    const departure=navMode&&hasLiveGPS?userCoords:origin;
    if(!validPoint(departure)){setToast('Localização de partida indisponível.');return false;}
    const epoch=++routeEpoch.current;setMaviResuming(true);
    try{
      const result=await api('/route',{method:'POST',body:JSON.stringify({
        origin:departure,destination:original.coords,vehicle:routeVehicle,language,
        telemetry:{bearing:hasLiveGPS?telemetry.heading:null,speed:hasLiveGPS?telemetry.speed:null}
      })});
      if(epoch!==routeEpoch.current)return false;
      if(result.source==='demonstracao'||!result.routes?.some(r=>validPoint(r.geometry?.coordinates?.at(-1)))){
        setToast('Não consegui uma rota real ao destino original. Mantive a parada.');return false;
      }
      setDest(original);setRouteData(result);
      setChoice(result.routes.some(r=>r.id===stop.originalChoice)?stop.originalChoice:
        (result.routes.find(r=>r.id==='fast')?.id||result.routes[0].id));
      setMaviPendingStop(null);setGuidance(null);spoken.current.clear();
      setToast('Rota retomada até '+original.name+'.');return true;
    }catch{
      if(epoch===routeEpoch.current)setToast('Não consegui calcular a continuação. Mantive a rota para a parada.');
      return false;
    }finally{setMaviResuming(false);}
  }
  function applyJev(proposal){
    if(!jevMode||!dest||!route||!proposal||proposal.mode!=='proposal')return false;
    if(proposal.kind==='poi_stop'){
      const place=proposal.poi,results=proposal.routeData?.routes;
      if(maviPendingStop||proposal.sourceKey!==jevRouteFingerprint(route)||
        !validPoint(place?.coords)||!validPoint(proposal.originalDestination)||
        !proposal.originalDestination.every((v,i)=>Math.abs(v-dest.coords[i])<0.00001)||
        !Array.isArray(results)||!results.some(r=>r.id===proposal.routeId&&r.proof&&
          Array.isArray(r.geometry?.coordinates)&&r.geometry.coordinates.length>=2))return false;
      const selected=results.find(r=>r.id===proposal.routeId);
      const endpoint=selected.geometry.coordinates.at(-1);
      if(!validPoint(endpoint)||Math.abs(endpoint[0]-place.coords[0])>0.005||
        Math.abs(endpoint[1]-place.coords[1])>0.005)return false;
      setMaviPendingStop({originalDestination:dest,originalChoice:choice,
        stop:{name:place.name,coords:place.coords}});
      routeEpoch.current++;spoken.current.clear();
      setDest(place);setRouteData(proposal.routeData);setChoice(proposal.routeId);
      setGuidance(null);setSheetOpen(false);
      setToast('Parada inserida: '+place.name+'. Destino original salvo.');return true;
    }
    if(proposal.sourceKey!==jevRouteFingerprint(route))return false;
    if(!validPoint(proposal.destination)||
      proposal.destination.some((coordinate,index)=>Math.abs(coordinate-dest.coords[index])>0.00001))return false;
    const routes=proposal.routeData?.routes;
    if(!Array.isArray(routes)||!routes.some(r=>r.id===proposal.routeId&&jevRouteFingerprint(r)!==proposal.sourceKey))return false;
    const selected=routes.find(r=>r.id===proposal.routeId);
    if(proposal.roadConstraint){
      const {road,kind}=proposal.roadConstraint;
      if(typeof road!=='string'||road.length>72||!['avoid','via'].includes(kind))return false;
      const evidence=routeRoadEvidence(selected,road);
      if(!evidence.known||evidence.uses!==(kind==='via'))return false;
    }
    routeEpoch.current++;spoken.current.clear();
    setRouteData(proposal.routeData);setChoice(proposal.routeId);setGuidance(null);
    setToast('Alternativa selecionada pela MAVI.');return true;
  }
  cachePosition.current=userCoords;
  // One accepted GPS fix drives both the instruction and its timing. The map's
  // animated marker cannot prematurely complete a maneuver.
  useEffect(()=>{
    if(!navMode||!hasLiveGPS||!route?.geometry)return;
    if(guidanceTrackerRef.current.route!==route){
      guidanceTrackerRef.current={route,tracker:createManeuverTracker(route)};
      cuePlaybackRef.current={at:0,stepIndex:null,stage:null,followingIndex:null};
    }
    const next=guidanceTrackerRef.current.tracker.update(userCoords,{
      accuracy:telemetry.accuracy,speed:telemetry.speed,heading:telemetry.heading,
      sourceAt:lastGpsFix.current?.sourceAt||Date.now()
    });
    if(next)setGuidance(next);
  },[navMode,hasLiveGPS,route,userCoords?.[0],userCoords?.[1]]);
  // The map supplies actual on-route GPS progress. Clock time follows the local device,
  // remaining minutes and kilometers shrink only as route progress is reported.
  const navigationStats=navMode?navigationSummary(route,guidance,Date.now()):null;
  const estimatedArrival=arrivalClock(navigationStats?.arrivalAt,language);
  useEffect(()=>{
    if(!navMode||!route?.geometry||!isNativeShell())return;
    let stopped=false,lastSection=-1;
    const prepareAhead=()=>{
      if(stopped||!active||navigator.onLine===false)return;
      const {points,section}=upcomingCorridor(route.geometry,cachePosition.current);
      if(points.length<2||section<0||section===lastSection)return;
      lastSection=section;
      const id=++offlineGeneration.current;
      setOfflineMap({status:'saving',key:route.id});
      try{
        if(!notifyNative({action:'prepareMap',id,points}))
          setOfflineMap({status:'partial',key:route.id});
      }catch{setOfflineMap({status:'partial',key:route.id});}
    };
    const start=setTimeout(prepareAhead,1600);
    const pulse=setInterval(prepareAhead,14000);
    return()=>{stopped=true;clearTimeout(start);clearInterval(pulse);};
  },[navMode,route?.id,route?.geometry,layer,active]);
  useEffect(()=>{
    if(!navMode||!route||!dest)return;
    const options=JSON.stringify([muted,layer,offlineMap.status,spokenRevision]);
    if(lastSaveRoute.current===route&&lastSaveOptions.current===options&&Date.now()-lastSave.current<4000)return;lastSave.current=Date.now();lastSaveRoute.current=route;lastSaveOptions.current=options;
    const snapshot={version:1,owner:user?.id||'guest',savedAt:Date.now(),destination:dest,...(maviPendingStop?{maviPendingStop}:{}),route,source:routeData?.source,safetyMessage:routeData?.safetyMessage,vehicle:routeVehicle,layer,muted,measuredTrip:measuredTrip.current?{...measuredTrip.current,meters:odometer.current.meters}:null,mapPrepared:offlineMap.status==='ready',position:userCoords?{coords:userCoords,telemetry}:null,spoken:[...spoken.current]};
    writeOffline('active-trip',snapshot).then(setStorageReady);
  },[navMode,route,dest,maviPendingStop,userCoords?.[0],userCoords?.[1],muted,layer,offlineMap.status,spokenRevision,routeVehicle]);
  function speakManeuver(text,key=null){
    if(jevMode){
      // V2 navigation never invokes browser TTS. Cartesia speaks actual
      // verified turn cues, authorized with the signed route proof.
      if(!route?.proof||language!=='pt-BR'){
        setVoiceProblem(true);return false;
      }
      if(maneuverAudioRef.current){
        const interrupted=lastVoiceAttempt.current;
        maneuverAudioRef.current.abort();
        // A canceled voice request was not heard. Keep its cue eligible.
        if(interrupted?.key)spoken.current.delete(interrupted.key);
      }
      lastVoiceAttempt.current={text,key};
      if(voiceRouteProofRef.current.route!==route)
        voiceRouteProofRef.current={route,proof:route?.proof};
      const controller=new AbortController();
      const releaseAudioFocus=acquireNavigationAudioFocus();
      maneuverAudioRef.current=controller;
      if(key){spoken.current.add(key);setSpokenRevision(v=>v+1);}
      void (async()=>{
        try{
          const result=await api('/v2/navigation/voice-ticket',{
            method:'POST',signal:controller.signal,
            body:{text,proof:voiceRouteProofRef.current.proof,language}
          });
          if(controller.signal.aborted||!result?.voiceTicket)throw Error('no_voice_ticket');
          if(typeof result.refreshedProof==='string'&&voiceRouteProofRef.current.route===route)
            voiceRouteProofRef.current.proof=result.refreshedProof;
          await playMaviVoice(result.voiceTicket,{signal:controller.signal});
          if(!controller.signal.aborted)setVoiceProblem(false);
        }catch{
          if(!controller.signal.aborted){
            if(key){spoken.current.delete(key);setSpokenRevision(v=>v+1);}
            voiceRetryAfterRef.current=Date.now()+12000;
            setVoiceProblem(true);
          }
        }finally{releaseAudioFocus();if(maneuverAudioRef.current===controller)maneuverAudioRef.current=null;}
      })();
      return true;
    }
    lastVoiceAttempt.current={text,key};
    const result=speakNavigationVoice(text,language,{
      native:isNativeShell(),sendNative:notifyNative,
      onStart:()=>setVoiceProblem(false),
      onFailure:()=>{
        if(key){spoken.current.delete(key);setSpokenRevision(v=>v+1);}
        setVoiceProblem(true);
      }
    });
    // A missing browser speech API must NEVER mark a maneuver as spoken.
    if(result.ok&&key){spoken.current.add(key);setSpokenRevision(v=>v+1);}
    return result.ok;
  }
  useEffect(()=>{
    if(!active||!navMode||muted||recalculating||Date.now()<voiceRetryAfterRef.current)return;
    const fresh=hasLiveGPS&&nearestOnRoute(userCoords,route?.geometry).distance<=Math.max(35,(telemetry.accuracy||0)*1.8);
    const cue=spokenCue(guidance,{fresh,preview:false,muted,speed:telemetry.speed,language});
    if(cue&&!spoken.current.has(cue.key)){
      const previous=cuePlaybackRef.current,now=Date.now(),elapsed=now-previous.at;
      // An earlier combined cue already announced the imminent second turn.
      const alreadyCovered=cue.stage==='now'&&previous.followingIndex===cue.stepIndex&&elapsed<5500;
      // Avoid cutting off a recent combined announcement for the same turn.
      const interruptedSequence=cue.stage==='now'&&previous.stage==='soon'&&previous.stepIndex===cue.stepIndex&&elapsed<2400&&cue.distance>8;
      const lowPriorityOverlap=cue.stage==='soon'&&elapsed<1800;
      if(!alreadyCovered&&!interruptedSequence&&!lowPriorityOverlap&&speakManeuver(cue.text,cue.key)){
        cuePlaybackRef.current={at:now,stepIndex:cue.stepIndex,stage:cue.stage,followingIndex:cue.followingIndex};
      }
    }
  },[active,navMode,guidance?.stepIndex,guidance?.instruction,guidance?.distance,hasLiveGPS,muted,language,voiceProblem,recalculating]);
  useEffect(()=>{
    if(jevMode&&(!navMode||muted))maneuverAudioRef.current?.abort();
    if(!navMode||muted)stopNavigationVoice({native:isNativeShell(),sendNative:notifyNative});
    return()=>{if(jevMode)maneuverAudioRef.current?.abort();if(navMode)stopNavigationVoice({native:isNativeShell(),sendNative:notifyNative});};
  },[navMode,muted]);
  function toggleVoice(){
    if(!muted){if(jevMode)maneuverAudioRef.current?.abort();setMuted(true);stopNavigationVoice({native:isNativeShell(),sendNative:notifyNative});}
    else{
      setMuted(false);setVoiceProblem(false);spoken.current.clear();
      speakManeuver(language==='fr-FR'?'Instructions vocales activées.':language==='en-US'?'Voice guidance enabled.':'Instruções por voz ativadas.');
    }
  }
  async function begin(){
    if(!route||!dest)return;
    spoken.current.clear();
    // A manual origin only plans a route: navigation needs a recent real GPS fix.
    if(!hasLiveGPS){requestGPS(true);return;}
    if(measuredTrip.current)return;
    measuredTrip.current={id:crypto.randomUUID(),vehicle:routeVehicle,simulated:routeData?.source==='demonstracao',startedAt:Date.now()};
    odometer.current={meters:0,anchor:null,lastSeenAt:null};distanceSync.current=Date.now();
    queueTripWrite({journeyId:measuredTrip.current.id,destination:dest,routeType:choice,proof:route.proof});
    setGuidance(null);setNavMode(true);setSheetOpen(false);
    // Called from the user's Start navigation click: unlock browser audio there.
    // Do not drown an imminent first turn in a generic startup greeting.
    const planned=buildRouteTimeline(route.geometry);
    const first=nextManeuver(route,planned,distanceOnRoute(planned,userCoords));
    if(!muted&&(!Number.isFinite(first?.distance)||first.distance>150))
      speakManeuver(language==='fr-FR'?'Navigation démarrée.':language==='en-US'?'Navigation started.':'Navegação iniciada.');
  }
  function reset(){if(jevMode)maneuverAudioRef.current?.abort();setMaviPendingStop(null);syncMeasuredDistance(true);measuredTrip.current=null;odometer.current={meters:0,anchor:null,lastSeenAt:null};rerouteRequest.current=null;setRecalculating(false);if(routeVehicleTimer.current!==null){clearTimeout(routeVehicleTimer.current);routeVehicleTimer.current=null;}deleteOffline('active-trip');stopNavigationVoice({native:isNativeShell(),sendNative:notifyNative});spoken.current.clear();awaitingGpsDestination.current=false;routeEpoch.current++;setNavMode(false);setGuidance(null);setDest(null);setRouteData(null);setSheetOpen(false);setEditor(null);setPointMenu(null);setPickOriginMode(false);setQuery('');}
  const demoRoute=routeData?.source==='demonstracao';
  // Deviation reroutes keep the current journey until a newer
  // route succeeds. The ref blocks duplicate requests before React re-renders.
  async function recalculateNavigationRoute(){
    if(rerouteRequest.current||!navMode||!dest||!route?.geometry)return;
    if(navigator.onLine===false){setToast('Conecte-se à internet para recalcular. A rota atual foi mantida.');return;}
    if(!hasLiveGPS||!hasRecentGpsFix(lastGpsFix.current,Date.now(),15000)||!Number.isFinite(telemetry.accuracy)||telemetry.accuracy>35){
      setToast('Aguarde um sinal GPS preciso para recalcular. A rota atual foi mantida.');return;
    }
    const epoch=++routeEpoch.current;
    rerouteRequest.current=epoch;
    rerouteState.current.outsideSince=0;rerouteState.current.lastAttempt=Date.now();
    setRecalculating(true);
    // Abort instructions tied to the wrong road while obtaining the new route.
    if(jevMode)maneuverAudioRef.current?.abort();
    else stopNavigationVoice({native:isNativeShell(),sendNative:notifyNative});
    try{
      const next=await api('/route',{method:'POST',body:JSON.stringify({
        origin:userCoords,destination:dest.coords,vehicle:routeVehicle,language,
        telemetry:{bearing:telemetry.heading,speed:telemetry.speed},
        routeOptions:{reroute:true,adaptive:false,variantBudget:2}
      })});
      if(epoch===routeEpoch.current){
        spoken.current.clear();cuePlaybackRef.current={at:0,stepIndex:null,stage:null,followingIndex:null};
        voiceRouteProofRef.current={route:null,proof:null};voiceRetryAfterRef.current=0;
        setRouteData(next);setGuidance(null);setToast('Rota recalculada conforme sua posição.');
      }
    }catch(e){
      if(epoch===routeEpoch.current)setToast(`Rota atual mantida: ${e.message}`);
    }finally{
      if(rerouteRequest.current===epoch){rerouteRequest.current=null;setRecalculating(false);}
    }
  }
  // Two coherent GPS fixes confirm a deviation; do not stall for 25 seconds.
  useEffect(()=>{
    if(navigator.onLine===false||!active||!navMode||!hasLiveGPS||!route?.geometry||demoRoute||recalculating||!dest)return;
    const now=Date.now(),fix=lastGpsFix.current;
    const decision=evaluateRouteDeviation(rerouteState.current,{
      distance:nearestOnRoute(userCoords,route.geometry).distance,
      accuracy:telemetry.accuracy,speed:telemetry.speed,
      sourceAt:fix?.sourceAt,now,
      fresh:hasRecentGpsFix(fix,now,12000)
    });
    rerouteState.current=decision.state;
    if(decision.reroute)void recalculateNavigationRoute();
  },[navMode,userCoords?.[0],userCoords?.[1],telemetry?.accuracy,route,dest?.id,recalculating,routeVehicle]);

  // The only readout lives beside the street name when a route is ACTIVE.
  // Never render it on the initial map or next to the location card.
  // Only the selected driving route and a fresh, precise GPS fix can supply
  // a posted limit; unknown provider segments never display guessed numbers.
  const postedLimit=navMode&&hasLiveGPS&&routeVehicle!=='a-pe'&&routeData?.source!=='demonstracao'
    ?speedLimitAtGpsPosition(route,userCoords,{
      accuracy:telemetry.accuracy,
      fresh:hasRecentGpsFix(lastGpsFix.current,Date.now(),15000),
      simulated:demoRoute
    }):null;
  const speedometer=<output className="v43-speedometer" aria-label={speedKmh===null?'Velocidade indisponível':`Velocidade atual: ${speedKmh} quilômetros por hora`+(postedLimit===null?'':`. Limite informado da via: ${postedLimit} quilômetros por hora`)} aria-live="off" title={postedLimit===null?'Velocidade do GPS. Limite da via indisponível':'Velocidade do GPS e limite informado pelo Mapbox'}><strong>{speedKmh===null?'—':speedKmh}</strong><small>km/h</small>{postedLimit!==null&&<span className="v43-speed-limit" aria-label={`Limite de velocidade informado: ${postedLimit} km/h`}><b>{postedLimit}</b></span>}</output>;

  const nextTurnText=maneuverText(guidance,route?.steps?.[0]?.instruction||t('Continue até o destino'));
  const visualLanes=Array.isArray(guidance?.lanes)?guidance.lanes.map((lane,index)=>({
    index,valid:lane?.valid===true,symbols:laneVariants(lane),
  })).filter(lane=>lane.symbols.length):[];

  return <div ref={mapPageRef} className={`map-page ${sheetOpen?'has-sheet':''} ${navMode?'in-navigation':''} ${navMode&&routeVehicle==='moto'?'is-moto-navigation':''} ${!navMode&&dest&&!sheetOpen&&!searchOpen?'has-collapsed-route':''}`}>
    <VanoMap active={active} userCoords={displayCoords||origin} gpsCoords={userCoords} manualOrigin={usingManual?manualCoords:null} destination={dest} awaitingInitialGps={gpsStatus==='checking'&&!validPoint(displayCoords)&&!validPoint(origin)} previewRoute={visibleMaviPreview?.route||null} previewFocus={focusMaviPreview} guidance={guidance} routes={routeData?.routes} selectedRoute={choice} navigation={navMode} controller={mapControl} layer={layer} trafficEnabled={trafficEnabled} onTrafficStatus={setTrafficStatus} telemetry={telemetry} vehicle={routeVehicle} pickingOrigin={pickOriginMode} onPickOrigin={chooseOrigin}/>
    {!navMode ? <div className={`map-top v31-map-top ${dest?'v32-route-top':''}`}>
      {!dest ? <>
      <div className="map-search v31-search"><Search size={22} aria-hidden="true"/><input ref={searchInput} role="combobox" aria-expanded={searchOpen} aria-controls="vano-location-options" aria-autocomplete="list" aria-label={t("Buscar endereço, lugar ou destino")} value={query} placeholder={t("Buscar endereço, lugar ou destino")} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);e.currentTarget.blur();}else if(e.key==='Enter'&&!searchBusy&&suggestions[0]){e.preventDefault();pick(suggestions[0]);}else if(e.key==='ArrowDown'){const first=document.querySelector('#vano-location-options .suggestion');if(first){e.preventDefault();first.focus();}}}}/>{searchBusy&&<span className="v32-search-spinner" role="status" aria-label="Buscando endereços"/>}{query&&<button type="button" onClick={()=>{setQuery('');searchInput.current?.focus();}} aria-label="Limpar busca"><X size={18}/></button>}<Link className="v31-profile-button" to="/perfil" aria-label="Abrir meu perfil" title="Meu perfil"><UserRound size={21} strokeWidth={1.9}/></Link></div>
      {!searchOpen&&<div className="quick-scroll v31-shortcuts" role="group" aria-label="Atalhos de destinos">{shortcuts.map(s=><button type="button" className="quick-chip" key={s.name} onClick={()=>clickShortcut(s)}><s.icon size={16}/>{t(s.name)}</button>)}</div>}
      </>:<><div className="v32-route-layout">
      <div className="v5-route-box" aria-label="Origem e destino da rota">
        <div className="v5-point-row">
          <span className="v5-point-indicator v5-point-start" aria-hidden="true"/>
          <button className="v5-point-label" onClick={()=>openEditor('origin')} aria-label="Alterar origem"><span>{usingManual?manualLabel:t('Minha localização')}</span><small>{t(usingManual?'Origem definida manualmente':hasLiveGPS?'GPS conectado':gpsStatus==='approximate'?'Localização aproximada':'Toque para definir origem')}</small></button>
          <div className="v5-point-actions"><button className="v5-point-more" aria-label="Opções da origem" aria-haspopup="menu" aria-expanded={pointMenu==='origin'} onClick={()=>setPointMenu(m=>m==='origin'?null:'origin')}><MoreHorizontal size={21}/></button>{pointMenu==='origin'&&<div className="v5-point-popover" role="menu"><button role="menuitem" onClick={()=>{setPointMenu(null);requestGPS(true)}}><LocateFixed size={17}/> {t('Usar meu GPS')}</button><button role="menuitem" onClick={()=>openEditor('origin')}><Search size={17}/> {t('Buscar endereço')}</button><button role="menuitem" onClick={()=>{setPointMenu(null);setPickOriginMode(true);setSheetOpen(false)}}><MapPinned size={17}/> {t('Escolher no mapa')}</button></div>}</div>
        </div>
        <div className="v5-point-row">
          <span className="v5-point-indicator v5-point-end" aria-hidden="true"/>
          <button className="v5-point-label" onClick={()=>openEditor('destination')} aria-label="Alterar destino"><span>{dest.name}</span><small>{t('Destino')}</small></button>
          <div className="v5-point-actions"><button className="v5-point-more" aria-label="Opções do destino" aria-haspopup="menu" aria-expanded={pointMenu==='destination'} onClick={()=>setPointMenu(m=>m==='destination'?null:'destination')}><MoreHorizontal size={21}/></button>{pointMenu==='destination'&&<div className="v5-point-popover" role="menu"><button role="menuitem" onClick={()=>openEditor('destination')}><PencilLine size={17}/> {t('Alterar destino')}</button><button role="menuitem" onClick={swapPoints}><ArrowUpDown size={17}/> {t('Inverter trajeto')}</button><button role="menuitem" onClick={reset}><X size={17}/> {t('Remover destino')}</button></div>}</div>
        </div>
        <button className="v5-swap" aria-label="Inverter origem e destino" title="Inverter origem e destino" onClick={swapPoints} disabled={!validPoint(origin)}><ArrowUpDown size={20}/></button>
      </div>
      <div className="v32-route-actions" role="group" aria-label="Ações da rota">
        <Link className="circle-btn v31-route-profile" to="/perfil" aria-label="Abrir meu perfil"><UserRound size={20}/></Link>
        <button type="button" className="circle-btn" onClick={reset} aria-label="Fechar rota"><X size={21}/></button>
      </div>
      </div></>}
      {jevMode&&<div id="mavi-offer-host" className="mavi-offer-host"/>}
    </div> : <div className="nav-instruction v28-nav-instruction" aria-label="Instrução da próxima manobra">
      <div className="turn-icon v28-turn-icon">
        <ManeuverGlyph variant={maneuverVariant(guidance)} size={37}/>
      </div>
      <div className="v28-nav-copy" key={`${guidance?.stepIndex??'inicio'}:${guidance?.instruction||''}`}>
        <strong className="v46-nav-distance" aria-live="off">{displayManeuverDistance(guidance?.distance,language)}</strong>
        <span className="v46-nav-instruction-text" aria-live="polite">{nextTurnText.instruction}</span>
        {nextTurnText.street&&<span className="v46-nav-street">{nextTurnText.street}</span>}
        {visualLanes.length>0&&<div className="v28-lane-guidance" role="group" aria-label="Orientação de faixas da rota">
          {visualLanes.map(lane=><span key={lane.index} className={`v46-lane ${lane.valid?'suggested':''}`}
            title={lane.valid?'Faixa indicada pela rota':'Outra faixa'}
            role="img" aria-label={`Faixa ${lane.index+1}${lane.valid?', recomendada':''}: ${lane.symbols.join(' ou ')}`}>
            {lane.symbols.map((symbol,index)=><ManeuverGlyph key={index} variant={symbol} size={21}/>)}
          </span>)}
        </div>}
      </div>
      <button className="circle-btn" onClick={toggleVoice} aria-label={muted?'Ativar som':'Silenciar'} title="Preferência de áudio">{muted?<VolumeX size={21}/>:<Volume2 size={21}/>}</button>
      {jevMode&&<div id="mavi-offer-host" className="mavi-offer-host"/>}
    </div>}
    {!navMode&&!searchOpen&&pickOriginMode&&<div className="gps-banner gps-picking" role="status">
      <div className="gps-banner-heading"><MapPin size={20}/><strong>{t('Escolha sua origem')}</strong></div>
      <p>Toque em qualquer rua no mapa para marcar seu ponto de partida.</p>
      <div className="gps-actions"><button onClick={()=>setPickOriginMode(false)}>{t('Cancelar')}</button><button className="gps-primary" onClick={()=>requestGPS(true)}>{t('Tentar GPS')}</button></div>
    </div>}
    {!navMode&&!searchOpen&&!pickOriginMode&&!validPoint(origin)&&gpsStatus!=='checking'&&<div className="gps-banner" role="status">
      <div className="gps-banner-heading"><AlertTriangle size={19}/><strong>{t(gpsStatus==='checking'?'Buscando sua localização…':'Localização indisponível')}</strong></div>
      <p>{gpsStatus==='checking'?'Você também pode escolher de onde sair.':gpsMessage||'Não conseguimos acessar seu GPS neste navegador.'}</p>
      <div className="gps-actions"><button onClick={()=>requestGPS(true)}>{t('Tentar novamente')}</button><button className="gps-primary" onClick={()=>setPickOriginMode(true)}>{t('Escolher origem no mapa')}</button></div>
    </div>}
    {!navMode&&!searchOpen&&!pickOriginMode&&usingManual&&!dest&&<div className="gps-manual-chip" role="status"><MapPin size={16}/> Origem manual <button onClick={()=>setPickOriginMode(true)}>{t('Alterar')}</button><button onClick={()=>requestGPS(true)}>{t('Usar GPS')}</button></div>}
    {searchOpen&&!dest&&<div id="vano-location-options" className="search-results v32-results" role="listbox" aria-label="Resultados de endereço"><div className="search-results-head"><span>{query.trim()?/^\d{5}-?\d{3}$/.test(query.trim())?'Endereços para este CEP':t('Resultados da busca'):t('Sugestões próximas')}</span><button type="button" aria-label="Fechar resultados" onClick={()=>setSearchOpen(false)}><X size={17}/></button></div>{suggestions.length?suggestions.map((s,i)=><button type="button" key={s.id||i} className="suggestion v32-suggestion" role="option" aria-selected={false} onClick={()=>pick(s)}><span className="v32-result-icon"><MapPin size={18}/></span><span><strong>{s.name}</strong><small>{s.address}</small></span><MoveRight size={16}/></button>):<div className="search-blank" role="status">{searchBusy?'Buscando endereços e lugares…':searchError?searchError:query.trim().length<2?'Digite um lugar, rua ou CEP.':demo?'Adicione as chaves Mapbox para buscar todos os endereços.':'Nenhum local encontrado. Tente outra busca.'}</div>}</div>}
    {editor&&<div className="modal-backdrop v5-editor-overlay" onClick={()=>setEditor(null)}><section className="destination-modal v5-editor" aria-label={t(editor==='origin'?'Buscar origem':'Buscar destino')} onClick={e=>e.stopPropagation()}><div className="modal-title"><h3>{t(editor==='origin'?'Definir ponto de partida':'Escolher destino')}</h3><button type="button" aria-label="Fechar busca" onClick={()=>setEditor(null)}><X size={20}/></button></div><div className="map-search"><Search size={19}/><input autoFocus value={editorQuery} placeholder={t("Rua, endereço ou lugar")} onChange={e=>setEditorQuery(e.target.value)} aria-label="Buscar endereço"/></div><div className="v5-editor-results" aria-live="polite">{editorBusy&&<span className="v5-editor-busy">{t('Buscando endereços…')}</span>}{!editorBusy&&editorResults.length===0&&<span className="v5-editor-busy">{editorError||t('Nenhum endereço encontrado.')}</span>}{editorResults.map(x=><button key={x.id||`${x.name}-${x.coords?.join(',')}`} className="suggestion" onClick={()=>chooseEdited(x)}><MapPin size={18}/><span><strong>{x.name}</strong><small>{x.address||'Selecionar localização'}</small></span><MoveRight size={17}/></button>)}</div>{editor==='origin'&&<button className="v5-editor-map" onClick={()=>{setEditor(null);setPickOriginMode(true);setSheetOpen(false)}}><MapPinned size={18}/> Selecionar origem tocando no mapa <ArrowRightLeft size={17}/></button>}</section></div>}
    {!navMode&&!sheetOpen&&!searchOpen&&!pickOriginMode&&<div className="v31-location-card" role="status" aria-label="Estado da sua localização">
      <span className="v31-location-symbol" aria-hidden="true"><LocateFixed size={18} strokeWidth={1.9}/></span>
      <span className="v31-location-copy">
        <span className="v31-location-eyebrow"><span className={hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)?'v31-gps-dot is-live':'v31-gps-dot'}/>
          {hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)?telemetry.accuracy>100?'Localização aproximada':'Sua localização':validPoint(displayCoords)?'Última localização':'Sua localização'}
        </span>
        <strong title={hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)?currentAddress?.street||'':''}>{hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)?currentAddress?.street||'Identificando endereço…':validPoint(displayCoords)?'Último ponto conhecido':gpsStatus==='denied'?'Localização desativada':'Buscando localização…'}</strong>
        <small>{hasRecentGpsFix(lastGpsFix.current,Date.now(),35000)?currentAddress?.detail||'Endereço atualizado pelo GPS':validPoint(displayCoords)?gpsStatus==='denied'?'GPS desativado · última posição salva':'Atualizando GPS · posição salva':gpsStatus==='checking'?'Localizando seu dispositivo…':'Ative o GPS ou escolha a origem'}</small>
      </span>
    </div>}
    {!searchOpen&&<div className="map-controls">
       {jevMode&&<JevVoiceButton onCommand={askJev} onAccept={applyJev} onAction={handleMaviAction} onPreview={showMaviPreview} onDismissPreview={clearMaviPreview} routeContextKey={String(jevKey)+String(dest?.coords)} navigationActive={navMode} maneuverDistance={guidance?.distance} muted={muted}/>}
      <button type="button" title={layer==='streets'?'Mostrar imagem de satélite':'Mostrar mapa de ruas'} aria-label={layer==='streets'?'Ativar imagem de satélite':'Ativar mapa de ruas'} aria-pressed={layer==='satellite'} className={`circle-btn v29-layer-control v30-layer-control ${layer==='satellite'?'is-satellite':''}`} onClick={()=>setLayer(l=>l==='streets'?'satellite':'streets')}><Layers3 size={21} strokeWidth={2.1} aria-hidden="true"/></button>
      {navMode&&<button type="button" title="Alternar câmera 2D/3D" className="circle-btn" onClick={()=>mapControl.current?.tilt?.()} aria-label="Alternar inclinação da câmera">3D</button>}
      <button type="button" className={`circle-btn v45-traffic-toggle ${trafficEnabled?'is-active':''}`} aria-pressed={trafficEnabled} aria-label={trafficStatus==='unavailable'?'Dados de trânsito indisponíveis neste mapa':trafficEnabled?'Ocultar trânsito nas ruas':'Mostrar trânsito nas ruas'} title={trafficStatus==='unavailable'?'Trânsito indisponível sem dados Mapbox':trafficEnabled?'Ocultar trânsito · verde livre, amarelo lento, vermelho pesado':'Mostrar trânsito nas ruas'} onClick={()=>setTrafficEnabled(value=>!value)} disabled={trafficStatus==='unavailable'}><span className="v45-traffic-glyph" aria-hidden="true"><i/><i/><i/></span></button>
      <button title="Minha localização" className="circle-btn" onClick={()=>validPoint(origin)?mapControl.current?.center():requestGPS()}><LocateFixed size={22}/></button>
    </div>}
    {!navMode&&dest&&sheetOpen&&<div className="route-sheet"><div className="sheet-handle"/><div className="sheet-title"><div><span className="eyebrow">{t('DESTINO SELECIONADO')}</span><h2>{t('Escolha a sua rota')}</h2></div><button className="sheet-close" onClick={()=>setSheetOpen(false)}><ChevronDown size={23}/></button></div>
      <div className="v47-route-vehicle" aria-label="Modo de transporte para calcular a rota">
        <span className="v47-route-vehicle-caption">{t('Modo')}</span>
        <div className={`v47-route-vehicle-switch ${import.meta.env.VITE_TRANSIT_PREVIEW==='1'?'has-transit':''} ${routeVehicle==='moto'?'is-moto':routeVehicle==='a-pe'?'is-walking':''}`} role="group" aria-label={import.meta.env.VITE_TRANSIT_PREVIEW==='1'?'Selecionar carro, moto, ônibus ou a pé':'Selecionar carro, moto ou a pé'} aria-busy={loadingRoute}>
          <button type="button" className={routeVehicle==='carro'?'is-selected':''} onClick={()=>chooseRouteVehicle('carro')}
            aria-pressed={routeVehicle==='carro'} aria-label="Calcular rota de carro">
            <CarFront size={18} strokeWidth={2} aria-hidden="true"/><span>{t('Carro')}</span>
          </button>
          <button type="button" className={routeVehicle==='moto'?'is-selected':''} onClick={()=>chooseRouteVehicle('moto')}
            aria-pressed={routeVehicle==='moto'} aria-label="Calcular rota de moto">
            <MotorcycleIcon size={22}/><span>{t('Moto')}</span>
          </button>
          {import.meta.env.VITE_TRANSIT_PREVIEW==='1'&&<Link to="/transporte" state={{from:validPoint(origin)?{name:'Sua localização',coords:origin}:null,to:dest}} className="v47-transit-mode" aria-label="Planejar rota de ônibus, metrô e trem" title="Planejar viagem em transporte público"><BusFront size={19} aria-hidden="true"/><span>Ônibus</span></Link>}
          <button type="button" className={routeVehicle==='a-pe'?'is-selected':''} onClick={()=>chooseRouteVehicle('a-pe')}
            aria-pressed={routeVehicle==='a-pe'} aria-label="Calcular rota a pé">
            <Footprints size={19} strokeWidth={2} aria-hidden="true"/><span>{t('A pé')}</span>
          </button>
        </div>
      </div>
      {loadingRoute?<div className="route-loader" role="status"><div className="spinner"/>{t('Calculando as opções...')}</div>:routeData?<><div className="route-options">{routeData.routes.map(r=><button key={r.id} className={`route-option ${choice===r.id?'selected':''}`} onClick={()=>setChoice(r.id)}><span className="route-option-icon">{routeVehicle==='a-pe'?<Footprints size={25}/>:r.id==='safe'?<ShieldCheck size={25}/>:<Zap size={25}/>}</span><span className="route-option-main"><span className="route-option-title">{t(routeVehicle==='a-pe'?'Rota a pé':r.id==='safe'?'Mais segura':'Mais rápida')}<span className={`radio-circle ${choice===r.id?'on':''}`}>{choice===r.id&&<Check size={13}/>}</span></span><small>{routeVehicle==='a-pe'?t('Percurso para caminhada'):r.microRoute?'Micro-rota V1 • desvio anti-gargalo':r.id==='safe'&&!r.verifiedSafety?t('Segurança não verificada'):r.id==='safe'?t('Avaliação V1'):t('Menor tempo estimado')}</small><span className="route-stats"><strong>{fmtTime(r.duration)}</strong><span>{fmtKm(r.distance,language)}</span></span></span></button>)}</div><span className="sr-only" role="status">{offlineMap.status==='saving'?'Atualizando detalhes adicionais do mapa.':''}</span><button className="btn btn-primary start-btn" onClick={begin}><Navigation size={20}/> {t(hasLiveGPS?'Iniciar navegação':'Ativar GPS para navegar')}</button></>:<div className="notice">{t('Não foi possível calcular o trajeto agora.')}</div>}
    </div>}
    {!navMode&&dest&&!sheetOpen&&!searchOpen&&<button className="collapsed-route" onClick={()=>setSheetOpen(true)}><span><strong>{dest.name}</strong><small>{route?`${fmtTime(route.duration)} · ${fmtKm(route.distance,language)}`:'Rota selecionada'}</small></span><ChevronUp size={23}/></button>}
    {navMode&&<div className="v36-nav-road-row" aria-label="Localização atual na navegação">
      {speedometer}
      <div className="v36-nav-road-pill" title={navigationStreetLabel(currentAddress,hasRecentGpsFix(lastGpsFix.current,Date.now(),60000))}>
        <strong>{navigationStreetLabel(currentAddress,hasRecentGpsFix(lastGpsFix.current,Date.now(),60000))}</strong>
      </div>
    </div>}
    {jevMode&&maviPendingStop&&navMode&&<div className="mavi-stop-continue" role="group" aria-label="Parada temporária da MAVI">
      <span>Parada: {dest?.name||'local escolhido'}</span>
      <button type="button" disabled={maviResuming} onClick={()=>void resumeMaviDestination()}>
        {maviResuming?'Calculando…':'Continuar ao destino original'}
      </button>
    </div>}
    {navMode&&<div className="nav-bottom v37-nav-bottom" aria-label="Resumo da navegação">
      <span className="v37-nav-handle" aria-hidden="true"/>
      <div className="nav-summary v37-nav-summary">
        <button type="button" className="circle-btn v37-nav-end" onClick={reset} aria-label="Encerrar navegação" title="Encerrar navegação"><X size={22} strokeWidth={2}/></button>
        <div className="v37-nav-center">
          <span className="sr-only">Previsão de chegada</span>
          <time className="v37-nav-arrival" dateTime={navigationStats?.arrivalAt?.toISOString()}>{estimatedArrival}</time>
          <div className="v37-nav-meta" aria-label="Tempo e distância restantes">
            <span>{navigationStats?fmtTime(navigationStats.remainingMinutes):'-- min'}</span>
            <span className="v37-nav-bullet" aria-hidden="true"/>
            <span>{navigationStats?fmtKm(navigationStats.remainingKm,language):'-- km'}</span>
          </div>
        </div>
        <Link className="circle-btn v36-nav-report" to="/relatar" title="Registrar alerta" aria-label="Registrar alerta"><AlertTriangle size={19} strokeWidth={1.9}/></Link>
      </div>
      {voiceProblem&&<p className="nav-demo" role="status">{isNativeShell()?'Voz de navegação indisponível no aparelho.':'O navegador não conseguiu reproduzir o áudio.'} <button type="button" onClick={()=>{setVoiceProblem(false);speakManeuver(language==='fr-FR'?'Test de la voix.':language==='en-US'?'Voice test.':'Teste de voz.');}}>Testar voz</button>{isNativeShell()&&<button type="button" onClick={()=>notifyNative({action:'voiceSettings'})}>Configurar voz</button>}</p>}{storageReady===false&&<p className="nav-demo" role="status">Não foi possível salvar o trajeto no celular. Libere espaço antes de fechar o aplicativo.</p>}
      {recalculating&&<p className="nav-demo" role="status">{t('Recalculando sua rota…')}</p>}
      {!hasLiveGPS&&<p className="nav-demo" role="status">Aguardando sinal GPS confiável. Exibindo a última localização recebida; confirme sempre sua posição na via.</p>}
      {demoRoute&&<p className="nav-demo">Simulação local. Não utilize estas instruções para dirigir.</p>}
    </div>}

  </div>
}
