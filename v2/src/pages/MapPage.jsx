import React,{useEffect,useRef,useState} from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Home, BriefcaseBusiness, Clock3, Utensils, Cross, LocateFixed, Layers3, UserRound, ArrowLeft, ArrowRightLeft, Navigation, CarFront, Bike, ShieldCheck, Zap, ChevronDown, ChevronUp, MapPin, AlertTriangle, Volume2, VolumeX, Check, Flag, MoveRight, CornerUpRight, Info, MoreHorizontal, ArrowUpDown, PencilLine, MapPinned, Crosshair, ExternalLink, CornerUpLeft, ArrowUp, RotateCcw } from 'lucide-react';
import VanoMap from '../components/VanoMap';
import {nearestOnRoute,validPoint} from '../lib/navigationMotion';
import {geoErrorMessage, hasRecentGpsFix, gpsStateAfterError, evaluateGpsPosition} from '../lib/geolocation';
import {swapJourney} from '../lib/routePoints';
import { Brand } from '../components/Brand';
import { api, fmtKm, fmtTime } from '../lib/api';
import { useVano } from '../context';
const shortcuts=[{name:'Casa', icon:Home},{name:'Trabalho',icon:BriefcaseBusiness},{name:'Rotina',icon:Clock3},{name:'Restaurantes',icon:Utensils},{name:'Hospitais',icon:Cross}];
export default function MapPage(){
  const {preferences,favorites,saveTrip,setToast,demo,t,language}=useVano(),navigate=useNavigate(),location=useLocation();
  const mapControl=useRef(null),searchInput=useRef(null),routeEpoch=useRef(0),rerouteState=useRef({outsideSince:0,lastAttempt:0}),lastGpsFix=useRef(null),gpsRequestSeq=useRef(0),awaitingGpsDestination=useRef(false),manualCoordsRef=useRef(null),routeCalculator=useRef(null);
  const [telemetry,setTelemetry]=useState({}),[recalculating,setRecalculating]=useState(false),[userCoords,setUserCoords]=useState(null),[gpsStatus,setGpsStatus]=useState('checking'),[gpsMessage,setGpsMessage]=useState(''),[gpsClock,setGpsClock]=useState(0),[manualCoords,setManualCoords]=useState(null),[pickOriginMode,setPickOriginMode]=useState(false),[query,setQuery]=useState(''),[suggestions,setSuggestions]=useState([]),[allPlaces,setAllPlaces]=useState([]),[searchOpen,setSearchOpen]=useState(false),[dest,setDest]=useState(null),[routeData,setRouteData]=useState(null),[choice,setChoice]=useState('safe'),[sheetOpen,setSheetOpen]=useState(false),[loadingRoute,setLoadingRoute]=useState(false),[navMode,setNavMode]=useState(false),[muted,setMuted]=useState(false),[layer,setLayer]=useState('streets'),[pointMenu,setPointMenu]=useState(null),[editor,setEditor]=useState(null),[editorQuery,setEditorQuery]=useState(''),[editorResults,setEditorResults]=useState([]),[editorBusy,setEditorBusy]=useState(false),[manualLabel,setManualLabel]=useState('Origem selecionada'),[previewMode,setPreviewMode]=useState(false),[previewRun,setPreviewRun]=useState(0),[guidance,setGuidance]=useState(null);
  const initialChoice=preferences?.preferredRoute==='fast'?'fast':'safe';
  const handledDestination=useRef(''),destRef=useRef(null);
  destRef.current=dest;
  useEffect(()=>setChoice(initialChoice),[initialChoice]);
  useEffect(()=>{api('/places').then(setAllPlaces).catch(()=>{});},[]);
  useEffect(()=>{
    if(!pointMenu&&!editor)return;
    function key(e){if(e.key==='Escape'){setPointMenu(null);setEditor(null);}}
    function outside(e){if(pointMenu&&!e.target.closest('.v5-point-actions'))setPointMenu(null);}
    window.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside)};
  },[pointMenu,editor]);
  const origin=manualCoords||userCoords;
  const usingManual=validPoint(manualCoords);
  manualCoordsRef.current=manualCoords;
  const hasLiveGPS=validPoint(userCoords)&&!usingManual&&gpsStatus==='granted'&&hasRecentGpsFix(lastGpsFix.current,Date.now(),35000);
  function onPosition(p){
    const result=evaluateGpsPosition(p,lastGpsFix.current);
    if(!result.ok)return null;
    const {fix}=result;
    lastGpsFix.current=fix;
    setUserCoords(fix.coords);
    setTelemetry({heading:result.heading,speed:result.speed,accuracy:fix.accuracy});
    setGpsStatus(fix.accuracy<=100?'granted':'approximate');setGpsMessage('');
    if(awaitingGpsDestination.current&&!validPoint(manualCoordsRef.current)&&destRef.current){
      awaitingGpsDestination.current=false;setPickOriginMode(false);
      routeCalculator.current?.(destRef.current,fix.coords);
    }
    return fix;
  }
  function onPositionError(error){
    const state=gpsStateAfterError(error,lastGpsFix.current);
    // An old pending request or a temporary indoors accuracy error is not loss of an already valid fix.
    if(state==='granted'){setGpsStatus(lastGpsFix.current?.accuracy<=100?'granted':'approximate');setGpsMessage('');return;}
    setGpsStatus(state);
    setGpsMessage(geoErrorMessage(error));
  }
  function requestGPS(switchToGPS=true){
    if(switchToGPS&&hasRecentGpsFix(lastGpsFix.current,Date.now(),20000)){
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
  useEffect(()=>{requestGPS(false);},[]);
  useEffect(()=>{
    const id=setInterval(()=>{
      setGpsClock(x=>x+1);
      if(lastGpsFix.current&&!hasRecentGpsFix(lastGpsFix.current,Date.now(),60000))
        setGpsStatus(s=>s==='granted'||s==='approximate'?'reconnecting':s);
    },12000);
    return()=>clearInterval(id);
  },[]);
  useEffect(()=>{
    if(!window.isSecureContext||!navigator.geolocation)return;
    // Keep a live fix while the map is open, not only after Start. It also refreshes stale cached positions.
    const id=navigator.geolocation.watchPosition(onPosition,onPositionError,{
      enableHighAccuracy:navMode,maximumAge:navMode?2000:15000,timeout:navMode?15000:26000,
    });
    return()=>navigator.geolocation.clearWatch(id);
  },[navMode]);
  useEffect(()=>{
    if(!searchOpen)return;
    const t=setTimeout(()=>{
      if(query.trim().length<2){setSuggestions(allPlaces.slice(0,5));return;}
      api(`/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(language)}`).then(setSuggestions).catch(()=>setSuggestions([]));
    },280);
    return()=>clearTimeout(t);
  },[query,searchOpen,allPlaces,language]);
  async function calculateRoute(place,departure){
    if(!validPoint(departure)||!validPoint(place?.coords))return;
    const epoch=++routeEpoch.current;
    setLoadingRoute(true);setSheetOpen(true);setRouteData(null);
    try{
      const data=await api('/route',{method:'POST',body:JSON.stringify({origin:departure,destination:place.coords,vehicle:preferences.vehicle,language,telemetry:{bearing:hasLiveGPS?telemetry.heading:null,speed:hasLiveGPS?telemetry.speed:null}})});
      if(epoch===routeEpoch.current){setRouteData(data);setChoice(initialChoice);}
    }catch(e){if(epoch===routeEpoch.current)setToast(e.message);}
    finally{if(epoch===routeEpoch.current)setLoadingRoute(false);}
  }
  routeCalculator.current=calculateRoute;
  function pick(place){
    if(!validPoint(place.coords)){setToast('Este destino ainda não tem coordenadas.');return;}
    setDest(place);setQuery('');setSearchOpen(false);setEditor(null);setPointMenu(null);setNavMode(false);setPreviewMode(false);setGuidance(null);setRouteData(null);
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
    awaitingGpsDestination.current=false;setManualCoords(coords);setManualLabel(label);setPickOriginMode(false);setNavMode(false);setEditor(null);setPointMenu(null);
    setToast('Origem manual definida. Você já pode calcular rotas sem GPS.');
    if(dest)calculateRoute(dest,coords);
  }
  function openEditor(kind){
    setEditor(kind);setPointMenu(null);setSearchOpen(false);
    setEditorQuery('');setEditorResults(allPlaces.slice(0,6));
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
    setManualCoords(flipped.manualCoords);setManualLabel(flipped.manualLabel);setDest(flipped.destination);
    setPointMenu(null);setEditor(null);setNavMode(false);setRouteData(null);
    setSheetOpen(true);setPickOriginMode(false);setQuery('');
    calculateRoute(flipped.destination,flipped.manualCoords);
  }
  useEffect(()=>{
    if(!editor)return;
    const q=editorQuery.trim();
    if(q.length<2){setEditorResults(allPlaces.slice(0,6));setEditorBusy(false);return;}
    const controller=new AbortController();setEditorBusy(true);
    const timer=setTimeout(()=>{
      api(`/search?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(language)}`, {signal:controller.signal})
      .then(items=>{if(!controller.signal.aborted)setEditorResults(Array.isArray(items)?items:[]);})
      .catch(()=>{if(!controller.signal.aborted)setEditorResults([]);})
      .finally(()=>{if(!controller.signal.aborted)setEditorBusy(false);});
    },230);
    return()=>{clearTimeout(timer);controller.abort()};
  },[editor,editorQuery,allPlaces,language]);
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
  async function begin(){
    if(!route||!dest)return;
    const preview=!hasLiveGPS;
    if(preview && !(route.geometry?.coordinates?.length>1)){setToast('Esta rota não tem geometria suficiente para a prévia animada.');return;}
    setPreviewMode(preview);setPreviewRun(v=>v+1);setGuidance(null);setNavMode(true);setSheetOpen(false);
    if(preview){setToast('Prévia animada da rota. Não é sua posição real nem orientação para dirigir.');return;}
    try{await saveTrip({destination:dest,routeType:choice,duration:route.duration,distance:route.distance,proof:route.proof});setToast('GPS conectado. Siga sempre a sinalização real da via.');}
    catch(e){setToast('Navegação iniciada, mas o histórico não foi salvo: '+e.message);}
  }
  function reset(){awaitingGpsDestination.current=false;routeEpoch.current++;setNavMode(false);setPreviewMode(false);setGuidance(null);setDest(null);setRouteData(null);setSheetOpen(false);setEditor(null);setPointMenu(null);setPickOriginMode(false);setQuery('');}
  const demoRoute=routeData?.source==='demonstracao';
  // Debounced deviation reroute: only on good GPS with sustained off-route signal.
  useEffect(()=>{
    if(!navMode||!hasLiveGPS||!route?.geometry||demoRoute||recalculating||!dest)return;
    const now=Date.now(),state=rerouteState.current;
    const accuracy=telemetry.accuracy;
    if(!hasRecentGpsFix(lastGpsFix.current,Date.now(),15000)||!Number.isFinite(accuracy)||accuracy>35){state.outsideSince=0;return;}
    const deviation=nearestOnRoute(userCoords,route.geometry).distance;
    if(deviation<75){state.outsideSince=0;return;}
    if(!state.outsideSince){state.outsideSince=now;return;}
    if(now-state.outsideSince<2200||now-state.lastAttempt<25000)return;
    state.outsideSince=0;state.lastAttempt=now;
    const epoch=++routeEpoch.current;
    setRecalculating(true);
    api('/route',{method:'POST',body:JSON.stringify({origin:userCoords,destination:dest.coords,vehicle:preferences.vehicle,language,telemetry:{bearing:telemetry.heading,speed:telemetry.speed},reroute:true})})
      .then(next=>{if(epoch===routeEpoch.current){setRouteData(next);setToast('Rota recalculada conforme sua posição.');}})
      .catch(e=>{if(epoch===routeEpoch.current)setToast(`Rota atual mantida: ${e.message}`);})
      .finally(()=>{if(epoch===routeEpoch.current)setRecalculating(false);});
  },[navMode,userCoords?.[0],userCoords?.[1],telemetry?.accuracy,route,dest?.id,recalculating,preferences?.vehicle]);

  return <div className={`map-page ${sheetOpen?'has-sheet':''} ${navMode?'in-navigation':''}`}>
    <VanoMap userCoords={origin} destination={dest} previewMode={previewMode} previewRun={previewRun} onNavigationProgress={setGuidance} routes={routeData?.routes} selectedRoute={choice} navigation={navMode} controller={mapControl} layer={layer} telemetry={telemetry} vehicle={preferences.vehicle} pickingOrigin={pickOriginMode} onPickOrigin={chooseOrigin}/>
    {!navMode ? <div className="map-top">
      {!dest ? <><div className="map-header"><Brand/><Link className="circle-btn avatar-button" to="/perfil" aria-label="Abrir perfil"><UserRound size={20}/></Link></div>
      <div className="map-search"><Search size={20}/><input ref={searchInput} aria-label={t("Buscar endereço, lugar ou destino")} value={query} placeholder={t("Buscar endereço, lugar ou destino")} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}}/>{query&&<button onClick={()=>setQuery('')} aria-label="Limpar busca"><X size={18}/></button>}</div>
      {!searchOpen&&<div className="quick-scroll">{shortcuts.map(s=><button className="quick-chip" key={s.name} onClick={()=>clickShortcut(s)}><s.icon size={16}/>{t(s.name)}</button>)}</div>}
      </>:<><div className="map-header map-header-active"><Brand/><button className="circle-btn" onClick={reset} aria-label="Fechar rota"><X size={21}/></button></div>
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
      </div></>}
    </div> : <div className="nav-instruction v28-nav-instruction" aria-live="polite"><div className="turn-icon v28-turn-icon">{/left/.test(guidance?.modifier||'')?<CornerUpLeft size={35}/>: /right/.test(guidance?.modifier||'')?<CornerUpRight size={35}/>:<ArrowUp size={34}/>}</div><div className="v28-nav-copy" key={guidance?.instruction||'iniciar'}><strong>{guidance?.finished?'Fim da prévia animada':guidance?.instruction||route?.steps?.[0]?.instruction||t('Continue até o destino')}</strong><span>{previewMode?'PRÉVIA ANIMADA · Não é GPS':guidance?.distance>15?`${Math.round(guidance.distance)} m até a próxima indicação`:'Acompanhe a sinalização real'}</span>{guidance?.lanes?.length>0&&<div className="v28-lane-guidance" aria-label="Orientação de faixas disponível na rota">{guidance.lanes.map((lane,i)=><span key={i} className={lane.valid?'suggested':''} title={lane.valid?'Faixa indicada pela rota':'Outra faixa'}>{lane.indications?.some(v=>v.includes('left'))?'↰':lane.indications?.some(v=>v.includes('right'))?'↱':'↑'}</span>)}</div>}</div><button className="circle-btn" onClick={()=>setMuted(!muted)} aria-label={muted?'Ativar som':'Silenciar'} title="Preferência de áudio">{muted?<VolumeX size={21}/>:<Volume2 size={21}/>}</button></div>}
    {!navMode&&!searchOpen&&pickOriginMode&&<div className="gps-banner gps-picking" role="status">
      <div className="gps-banner-heading"><MapPin size={20}/><strong>{t('Escolha sua origem')}</strong></div>
      <p>Toque em qualquer rua no mapa para marcar seu ponto de partida.</p>
      <div className="gps-actions"><button onClick={()=>setPickOriginMode(false)}>{t('Cancelar')}</button><button className="gps-primary" onClick={()=>requestGPS(true)}>{t('Tentar GPS')}</button></div>
    </div>}
    {!navMode&&!searchOpen&&!pickOriginMode&&!validPoint(origin)&&<div className="gps-banner" role="status">
      <div className="gps-banner-heading"><AlertTriangle size={19}/><strong>{t(gpsStatus==='checking'?'Buscando sua localização…':'Localização indisponível')}</strong></div>
      <p>{gpsStatus==='checking'?'Você também pode escolher de onde sair.':gpsMessage||'Não conseguimos acessar seu GPS neste navegador.'}</p>
      <div className="gps-actions"><button onClick={()=>requestGPS(true)}>{t('Tentar novamente')}</button><button className="gps-primary" onClick={()=>setPickOriginMode(true)}>{t('Escolher origem no mapa')}</button></div>
    </div>}
    {!navMode&&!searchOpen&&!pickOriginMode&&usingManual&&!dest&&<div className="gps-manual-chip" role="status"><MapPin size={16}/> Origem manual <button onClick={()=>setPickOriginMode(true)}>{t('Alterar')}</button><button onClick={()=>requestGPS(true)}>{t('Usar GPS')}</button></div>}
    {searchOpen&&!dest&&<div className="search-results"><div className="search-results-head"><span>{t(query.trim()?'Resultados da busca':'Sugestões próximas')}</span><button aria-label="Fechar resultados" onClick={()=>setSearchOpen(false)}><X size={17}/></button></div>{suggestions.length?suggestions.map(s=><button key={s.id} className="suggestion" onClick={()=>pick(s)}><MapPin size={18}/><span><strong>{s.name}</strong><small>{s.address}</small></span><MoveRight size={16}/></button>):<div className="search-blank">Nenhum local encontrado. {demo?'Adicione as chaves Mapbox para buscar todos os endereços.':'Tente outro termo.'}</div>}</div>}
    {editor&&<div className="modal-backdrop v5-editor-overlay" onClick={()=>setEditor(null)}><section className="destination-modal v5-editor" aria-label={t(editor==='origin'?'Buscar origem':'Buscar destino')} onClick={e=>e.stopPropagation()}><div className="modal-title"><h3>{t(editor==='origin'?'Definir ponto de partida':'Escolher destino')}</h3><button type="button" aria-label="Fechar busca" onClick={()=>setEditor(null)}><X size={20}/></button></div><div className="map-search"><Search size={19}/><input autoFocus value={editorQuery} placeholder={t("Rua, endereço ou lugar")} onChange={e=>setEditorQuery(e.target.value)} aria-label="Buscar endereço"/></div><div className="v5-editor-results" aria-live="polite">{editorBusy&&<span className="v5-editor-busy">{t('Buscando endereços…')}</span>}{!editorBusy&&editorResults.length===0&&<span className="v5-editor-busy">{t('Nenhum endereço encontrado.')}</span>}{editorResults.map(x=><button key={x.id||`${x.name}-${x.coords?.join(',')}`} className="suggestion" onClick={()=>chooseEdited(x)}><MapPin size={18}/><span><strong>{x.name}</strong><small>{x.address||'Selecionar localização'}</small></span><MoveRight size={17}/></button>)}</div>{editor==='origin'&&<button className="v5-editor-map" onClick={()=>{setEditor(null);setPickOriginMode(true);setSheetOpen(false)}}><MapPinned size={18}/> Selecionar origem tocando no mapa <ArrowRightLeft size={17}/></button>}</section></div>}
    {!searchOpen&&<div className="map-controls"><button type="button" title={layer==='streets'?'Mostrar imagem de satélite':'Mostrar mapa de ruas'} aria-label={layer==='streets'?'Ativar imagem de satélite':'Ativar mapa de ruas'} aria-pressed={layer==='satellite'} className={`circle-btn v29-layer-control v30-layer-control ${layer==='satellite'?'is-satellite':''}`} onClick={()=>setLayer(l=>l==='streets'?'satellite':'streets')}><Layers3 size={21} strokeWidth={2.1} aria-hidden="true"/></button><button title="Minha localização" className="circle-btn" onClick={()=>validPoint(origin)?mapControl.current?.center():requestGPS()}><LocateFixed size={22}/></button>{navMode&&<button title="Alternar câmera 2D/3D" className="circle-btn" onClick={()=>mapControl.current?.tilt?.()} aria-label="Alternar inclinação da câmera">3D</button>}</div>}
    {!navMode&&dest&&sheetOpen&&<div className="route-sheet"><div className="sheet-handle"/><div className="sheet-title"><div><span className="eyebrow">{t('DESTINO SELECIONADO')}</span><h2>{t('Escolha a sua rota')}</h2></div><button className="sheet-close" onClick={()=>setSheetOpen(false)}><ChevronDown size={23}/></button></div>
      {loadingRoute?<div className="route-loader"><div className="spinner"/>{t('Calculando as opções...')}</div>:routeData?<><div className="route-options">{routeData.routes.map(r=><button key={r.id} className={`route-option ${choice===r.id?'selected':''}`} onClick={()=>setChoice(r.id)}><span className="route-option-icon">{r.id==='safe'?<ShieldCheck size={25}/>:<Zap size={25}/>}</span><span className="route-option-main"><span className="route-option-title">{t(r.id==='safe'?'Mais segura':'Mais rápida')}<span className={`radio-circle ${choice===r.id?'on':''}`}>{choice===r.id&&<Check size={13}/>}</span></span><small>{r.microRoute?'Micro-rota V1 • desvio anti-gargalo':r.id==='safe'&&!r.verifiedSafety?t('Segurança não verificada'):r.id==='safe'?t('Avaliação V1'):t('Menor tempo estimado')}</small><span className="route-stats"><strong>{fmtTime(r.duration)}</strong><span>{fmtKm(r.distance,language)}</span></span></span></button>)}</div><p className="route-caution"><Info size={16}/>{t(routeData.safetyMessage)}</p><button className="btn btn-primary start-btn" onClick={begin}><Navigation size={20}/> {t(hasLiveGPS?'Iniciar navegação com GPS':'Assistir prévia animada da rota')}</button></>:<div className="notice">{t('Não foi possível calcular o trajeto agora.')}</div>}
    </div>}
    {!navMode&&dest&&!sheetOpen&&!searchOpen&&<button className="collapsed-route" onClick={()=>setSheetOpen(true)}><span><strong>{dest.name}</strong><small>{route?`${fmtTime(route.duration)} · ${fmtKm(route.distance,language)}`:'Rota selecionada'}</small></span><ChevronUp size={23}/></button>}
    {navMode&&<div className="nav-bottom"><div className="nav-summary"><span><strong>{fmtTime(route?.duration)}</strong><small>{fmtKm(route?.distance,language)} · {t(choice==='safe'?'Mais segura':'Mais rápida')}</small></span><Link className="circle-btn" to="/relatar" title="Relatar ocorrência"><Flag size={19}/></Link></div>{recalculating&&<p className="nav-demo" role="status">{t('Recalculando sua rota…')}</p>}{previewMode&&<><p className="nav-demo v28-simulation-note"><Info size={16}/> Prévia acelerada: posição fictícia na rota. Não use para dirigir.</p><div className="v28-preview-track" role="progressbar" aria-label="Progresso da prévia" aria-valuenow={Math.round((guidance?.progress||0)*100)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${Math.round((guidance?.progress||0)*100)}%`}}/></div>{guidance?.finished&&<button className="v28-preview-replay" onClick={()=>{setGuidance(null);setPreviewRun(v=>v+1);}}><RotateCcw size={17}/> Repetir prévia</button>}</>}{demoRoute&&!previewMode&&<p className="nav-demo">Simulação local. Não utilize estas instruções para dirigir.</p>}<button className="btn btn-primary" onClick={reset}><X size={18}/> {t('Encerrar navegação')}</button></div>}
    {!dest&&!searchOpen&&demo&&<div className="demo-label">Prévia local · sem Mapbox</div>}
  </div>
}
