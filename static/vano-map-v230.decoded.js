(() => {
const BOOT=window.VANO_BOOT||{};
const TOKEN=BOOT.token||'', STYLE=BOOT.style||'', STYLE_SET=BOOT.styleSet||{}, MAP_STYLE_MODE=BOOT.mapStyleMode||'standard', MAP_ACCENT=BOOT.mapAccent||{}, NAV_PREFS=BOOT.navPrefs||{}, VANO_BLACK_THEME=document.documentElement.dataset.vanoTheme==='black', REACTIVE_BLACK_ALLOWED=MAP_STYLE_MODE==='auto', LOGGED_IN=!!BOOT.loggedIn, IS_ADMIN=!!BOOT.isAdmin, PRO_DRIVER=!!BOOT.professionalDriver, CSRF=BOOT.csrf||'', SHARED_TOKEN=new URLSearchParams(location.search).get('shared'), DISTANCE_UNIT=BOOT.distanceUnit||'km', HOME_LABEL=BOOT.homeLabel||'', WORK_LABEL=BOOT.workLabel||'', PRESENCE_ACTIVE=!!BOOT.presenceActive, LOGIN_URL=BOOT.loginUrl||'/login?next=/';
let guestRoutesRemaining=Number(BOOT.guestRoutesRemaining??10); const GUEST_ROUTE_LIMIT=Number(BOOT.guestRouteLimit??10);
const VANO_IOS_WEBKIT=/iP(ad|hone|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if(!TOKEN){if(window.lucide)lucide.createIcons();return;} mapboxgl.accessToken=TOKEN;document.documentElement.style.setProperty('--o',MAP_ACCENT.primary||'#F59A62');document.documentElement.style.setProperty('--o2',MAP_ACCENT.light||'#FFC39B');document.body?.classList.toggle('vano-pro-driver',PRO_DRIVER);
const $=id=>document.getElementById(id), toast=$('toast'), originInput=$('originInput'), destinationInput=$('destinationInput'), results=$('searchResults'), planSheet=$('planSheet'), routeState=$('routeState'), welcomeState=$('welcomeState'), activeNav=$('activeNav');
const bindClick=(id,fn)=>{const el=$(id);if(!el){console.warn(`[VANO MAPS:UI] botão ausente: ${id}`);return false}el.type=el.type||'button';el.addEventListener('click',e=>{e.preventDefault();try{const out=fn(e);if(out&&typeof out.catch==='function')out.catch(err=>{console.error(`[VANO MAPS:UI:${id}]`,err);showToast('Não foi possível concluir esta ação.')})}catch(err){console.error(`[VANO MAPS:UI:${id}]`,err);showToast('Não foi possível concluir esta ação.')}});return true};
function productTelemetry(event_type,label,target='map'){try{if(!CSRF)return;fetch('/api/telemetry/event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({event_type,label:String(label||'').slice(0,100),target:String(target||'map').slice(0,80),page:location.pathname})}).catch(()=>{})}catch{}}
async function vanoFetchJSON(url,options={},timeoutMs=15000){
  if(window.VANO_RUNTIME?.fetchJSON){
    try{const out=await window.VANO_RUNTIME.fetchJSON(url,options,timeoutMs);return{r:out.response,d:out.data||{},elapsedMs:out.elapsedMs||0}}
    catch(e){if(e?.status){return{r:{ok:false,status:e.status,headers:{get:()=>e.retryAfter||''}},d:e.data||{error:e.message,code:e.code||''},elapsedMs:0}}throw e}
  }
  const controller=new AbortController(),external=options.signal,timer=setTimeout(()=>controller.abort(),timeoutMs),abort=()=>controller.abort();
  try{if(external){if(external.aborted)controller.abort();else external.addEventListener('abort',abort,{once:true})}const r=await fetch(url,{credentials:'same-origin',...options,signal:controller.signal});const type=(r.headers.get('content-type')||'').toLowerCase();let d={};if(type.includes('application/json')){d=await r.json().catch(()=>({}))}else{const text=await r.text().catch(()=>'');d={error:r.ok?'Resposta inesperada do servidor':`HTTP ${r.status}`,detail:text.slice(0,400)}}return{r,d}}
  catch(e){if(controller.signal.aborted&&!external?.aborted){const err=new Error('A solicitação demorou mais do que o esperado.');err.code='timeout';throw err}throw e}
  finally{clearTimeout(timer);external?.removeEventListener?.('abort',abort)}
}

// OSINT of VANO integration events. No remote/admin credential is exposed here:
// this page only emits already-authorized navigation/GPS data to the VANO backend.
let osintRouteSessionId='';
function emitVanoOsint(type,detail={}){if(!LOGGED_IN)return;try{window.dispatchEvent(new CustomEvent('vano:osint',{detail:{type,...detail}}))}catch{}}
function osintPoint(x){if(!x)return{};const lat=Number.isFinite(+x.lat)?+x.lat:null,lon=Number.isFinite(+x.lon)?+x.lon:null;return{lat,lon,label:String(x.label||x.name||'').slice(0,255)}}
function makeOsintRouteSessionId(){const signature=String(selectedRoute?.route_signature||selectedRoute?.id||'route').replace(/[^A-Za-z0-9_.:-]/g,'').slice(0,70)||'route';return `vano-${signature}-${navStartedAt||Date.now()}`.slice(0,120)}
function osintLocationPayload(raw,p){return{lat:+p.lat,lon:+p.lon,accuracy_m:Number.isFinite(+raw?.accuracy)?+raw.accuracy:null,altitude_m:Number.isFinite(+raw?.altitude)?+raw.altitude:null,speed_mps:Number.isFinite(+raw?.speed)?Math.max(0,+raw.speed):(Number.isFinite(+p?.speed)?Math.max(0,+p.speed):null),heading_deg:Number.isFinite(+raw?.heading)?((+raw.heading%360+360)%360):(Number.isFinite(+p?.heading)?((+p.heading%360+360)%360):null),timestamp:new Date().toISOString()}}
function osintRoutePayload(position=null,metrics=null,etaSeconds=null){const o=osintPoint(origin),d=osintPoint(destination),route=selectedRoute||{};return{vano_route_id:osintRouteSessionId||makeOsintRouteSessionId(),route_mode:String(routeMode||'').slice(0,40),origin_name:o.label||'Minha localização',origin_lat:o.lat,origin_lon:o.lon,destination_name:d.label||'Destino',destination_lat:d.lat,destination_lon:d.lon,distance_m:Number.isFinite(+route.distance)?Math.max(0,+route.distance):null,remaining_m:Number.isFinite(+metrics?.remaining)?Math.max(0,+metrics.remaining):(Number.isFinite(+route.distance)?Math.max(0,+route.distance):null),eta_seconds:Number.isFinite(+etaSeconds)?Math.max(0,Math.round(+etaSeconds)):(Number.isFinite(+route.duration)?Math.max(0,Math.round(+route.duration)):null)}}

function renderGuestTrial(remaining){if(LOGGED_IN)return;guestRoutesRemaining=Math.max(0,Number(remaining??guestRoutesRemaining)||0);const el=$('guestTrialRemaining');if(el)el.textContent=guestRoutesRemaining;const pill=$('guestTrialPill');if(pill){pill.classList.toggle('low',guestRoutesRemaining<=3);pill.classList.toggle('empty',guestRoutesRemaining<=0)}}
function showGuestLimit(){if(LOGGED_IN)return;const modal=$('guestLimitModal');if(modal){modal.classList.add('show');modal.setAttribute('aria-hidden','false')}}
function hideGuestLimit(){const modal=$('guestLimitModal');if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}}
bindClick('guestTrialPill',()=>guestRoutesRemaining<=0?showGuestLimit():showToast(`${guestRoutesRemaining} de ${GUEST_ROUTE_LIMIT} rotas grátis restantes.`));bindClick('guestLimitBackdrop',hideGuestLimit);bindClick('guestLimitLater',hideGuestLimit);renderGuestTrial(guestRoutesRemaining);
document.querySelectorAll('button:not([type])').forEach(b=>b.type='button');

function normalizeBrandSurfaces(){
  const guestBrand=document.querySelector('.guest-drawer-brand');
  if(guestBrand){guestBrand.classList.add('simple');guestBrand.innerHTML=`<img src="/static/vano-maps-icon-64.png" alt="Ícone VANO MAPS"><span>VANO MAPS</span>`}
  const splash=$('appEntrySplash');
  if(splash){splash.classList.add('vano-entry-splash');splash.innerHTML=`<div class="vano-entry-splash-inner"><img src="/static/vano-maps-icon-192.png" alt="Ícone VANO MAPS"><strong>VANO MAPS</strong></div>`}
}
normalizeBrandSurfaces();

function runEntrySplash(){
  const splash=$('appEntrySplash');
  if(!splash||!LOGGED_IN)return;
  let seen=false;try{seen=sessionStorage.getItem('vano.app.splash.v57')==='1'}catch{}
  if(seen){splash.remove();return;}
  splash.classList.add('show');
  setTimeout(()=>{splash.classList.add('hide'); setTimeout(()=>splash.remove(),420)}, 980);
  try{sessionStorage.setItem('vano.app.splash.v57','1')}catch{}
}
runEntrySplash();

// Bind the primary navigation action early so a later optional UI error can never leave the CTA dead.
document.addEventListener('click',e=>{const btn=e.target.closest?.('#startTripBtn');if(!btn)return;e.preventDefault();e.stopPropagation();console.debug('[VANO MAPS:UI] iniciar navegação');startTrip();},true);
let map,userMarker,userMarkerElement,originMarker,destinationMarker,userLocation=null,origin=null,destination=null,routes=[],selectedRoute=null,routeMode='safest',profile='driving',searchTimer=null,watchId=null,passiveWatchId=null,mapFollowMode=true,lastPassivePosition=null,lastPassiveCameraAt=0,navStartedAt=0,gpsDistance=0,lastGps=null,lastNavPosition=null,smoothedPos=null,routeCumulative=[],routeTotalGeometry=1,starting=false,rerouting=false,offRouteCount=0,lastRerouteAt=0,followMode=true,wakeLock=null,soundEnabled=true,lastSpokenInstruction='',focusMode=false,roadAwareness=[],lastRoadFetchAt=0,lastRoadFetchPos=null,lastCameraBearing=null,trafficSuggestionRoute=null,lastTrafficCheckAt=0,trafficDismissUntil=0,trafficChecking=false,lastLiveEta=0,lastMarkerHeading=null,navCameraMode='top',spokenMilestones=new Set(),liveShareToken=null,liveShareUrl='',lastLiveShareAt=0,liveShareUpdating=false,safetyPulse=false,supportPoints=[],supportLoading=false,previewFrame=null,previewing=false,previewStartedAt=0,searchController=null,fastSearchController=null,searchRefineTimer=null,searchRequestId=0,activeSearchKind=null,liveContext=null,lastLiveContextAt=0,lastLiveContextPos=null,lastFlowProbeAt=0,signalRefreshTimer=null,lastSignalViewportKey='',adminSimulation=false,adminSimFrame=null,adminSimDistance=0,adminSimLastTs=0,adminSimRealSpeed=11.5,adminSimTimeScale=6,routeLoadingSeq=0,navGpsHeartbeatTimer=null,passiveGpsHeartbeatTimer=null,gpsHeartbeatBusy=false,lastGpsFixAt=0;

function vanoNativeMapBridge(){try{const b=window.VanoNative;if(!b||typeof b.nativeMapAvailable!=='function'||!b.nativeMapAvailable())return null;return b}catch{return null}}
function vanoNativeMapPayload(p=null){return JSON.stringify({route:selectedRoute||null,origin:origin||null,destination:destination||null,route_mode:routeMode||'',profile:profile||'driving',position:p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)?{lat:+p.lat,lon:+p.lon,accuracy:Number.isFinite(+p.accuracy)?+p.accuracy:null,heading:Number.isFinite(+p.heading)?+p.heading:null,speed:Number.isFinite(+p.speed)?+p.speed:null}:null,started_at:navStartedAt||Date.now()})}
function vanoStartNativeMap(p=null){const b=vanoNativeMapBridge();if(!b||!selectedRoute?.geometry?.coordinates?.length)return false;try{b.startNativeMap(vanoNativeMapPayload(p));vanoEnsureNativeMapSync();return true}catch(e){console.debug('[VANO MAPS:native-map-start]',e);return false}}
function vanoSyncNativeMapRoute(p=null){const b=vanoNativeMapBridge();if(!b||!selectedRoute?.geometry?.coordinates?.length)return false;try{b.updateNativeMapRoute(vanoNativeMapPayload(p));return true}catch(e){console.debug('[VANO MAPS:native-map-route]',e);return false}}
function vanoStopNativeMap(){const b=vanoNativeMapBridge();if(!b)return;try{b.stopNativeMap()}catch(e){console.debug('[VANO MAPS:native-map-stop]',e)}}
let vanoNativeMapSyncTimer=null,vanoNativeMapLastKey='';
function vanoNativeRouteKey(){return String(selectedRoute?.route_signature||selectedRoute?.id||selectedRoute?.geometry?.coordinates?.length||'')}
function vanoEnsureNativeMapSync(){if(vanoNativeMapSyncTimer)return;vanoNativeMapLastKey=vanoNativeRouteKey();vanoNativeMapSyncTimer=setInterval(()=>{if(!activeNav?.classList.contains('show')||!window.__vanoNativeMapActive)return;const k=vanoNativeRouteKey();if(k&&k!==vanoNativeMapLastKey){vanoNativeMapLastKey=k;vanoSyncNativeMapRoute(lastNavPosition||userLocation)}},900)}
function vanoClearNativeMapSync(){if(vanoNativeMapSyncTimer){clearInterval(vanoNativeMapSyncTimer);vanoNativeMapSyncTimer=null}vanoNativeMapLastKey=''}
function vanoNativeMapRecenter(){const b=vanoNativeMapBridge();if(!b)return false;try{b.recenterNativeMap();return true}catch{return false}}
const SEARCH_FAST_MIN=2,SEARCH_FAST_DELAY=70,SEARCH_REFINE_DELAY=140;
let vanoStableViewportH=Math.round(window.innerHeight||document.documentElement.clientHeight||screen.height||0),vanoViewportTimer=null,vanoKeyboardOpen=false,vanoScrollLockTimer=null;
const SEARCH_CLIENT_TTL=120000,searchClientCache=new Map();
let routeController=null,routeRequestId=0,manualRouteSelection=false,lastRouteEngine='',routeResponseCache=new Map(),lastNavUiAt=0,lastCameraUpdateAt=0,lastProgressPaintAt=0,lastSignalFetchAt=0,signalController=null,adminSimLastUiAt=0,lastTrafficRadarAt=0,lastTrafficRadarKey='',lastTrafficRadarAlong=0,navLastAlong=0,lastNavRoutePaintAt=0,navLastPaintAlong=0,navLastRawPosition=null,navLastCameraZoom=null,navCameraStartUntil=0,navVoiceHoldTimer=null,navVoiceHoldOpened=false,lastMapPointerAt=0;
let eventChecking=false,lastEventScanAt=0,lastEventRouteKey='',eventStickyUntil=0,eventStickyName='',lastEventNoticeKey='';
const routePrefetchJobs=new Map();let routePrefetchDestinationKey='';
const routeCommitKeys=new Set();
let navAlternativeHitKey='',navAlternativeHitCount=0,navAlternativeLastPaintAt=0,navAlternativePrimary=null,navAlternativeDismissedKey='',navAlternativeDismissUntil=0,navSuppressedRouteKeys=new Set(),lastRoutePuckBearing=null;
let navExperienceMode='immersive',pendingCameraChoiceResolve=null,cameraChoicePending=false;
let lastDisplayedSpeedKmh=0,currentMappedSpeedLimitKmh=null,lastSpeedCameraWarnKey='',lastSpeedCameraWarnAt=0;
let navSpeedFix=null,stableNavSpeedKmh=0,lastSpeedMotionAt=0;
let searchInteractionActive=false,searchComposing=false,searchInteractionTimer=null;
let puckFrame=null,puckDisplayPos=null,puckTargetPos=null,puckTargetUpdatedAt=0,puckLastPaintAt=0,puckLastFixAt=0,puckMotionLastTs=0;
let puckRouteAlong=null,puckRouteVelocity=0,puckRouteTargetAlong=null,puckRouteTargetSpeed=0,puckRouteFixAt=0;
let markerHeadingVisual=0,markerHeadingReady=false;
let cameraMotionFrame=null,cameraTargetContext=null,cameraVisualState=null,cameraLastPaintAt=0,internalCameraMoveUntil=0,driveCameraMood='',navStartupBearing=null,navStartupBearingUntil=0,cameraCalibrationUntil=0,cameraCalibrationStartedAt=0,cameraCalibrationTimer=null,navLaunchAnimationUntil=0,navLaunchResumeTimer=null,cameraIntent='',cameraIntentUntil=0;
let arrivalPresented=false;
const NAV_CAMERA_HOME={zoom:17.54,pitch:58,lookAhead:118,centerLead:.69,bottomRatio:.33,topRatio:.06};
let SAFE_AREA_BOTTOM=0;
function readSafeAreaInsetBottom(){try{const probe=document.createElement('div');probe.style.cssText='position:fixed;left:-9999px;top:-9999px;width:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px)';document.body.appendChild(probe);const v=parseFloat(getComputedStyle(probe).paddingBottom)||0;probe.remove();return v}catch{return 0}}
if(document.body)SAFE_AREA_BOTTOM=readSafeAreaInsetBottom();else document.addEventListener('DOMContentLoaded',()=>{SAFE_AREA_BOTTOM=readSafeAreaInsetBottom()},{once:true});
let routeFlowFrame=null,lastRouteFlowPaintAt=0;const REDUCED_MOTION=!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const LOW_POWER_DEVICE=!!((navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4));
let performanceTier=LOW_POWER_DEVICE?'normal':'high',perfMonitorFrame=null,perfLastTs=0,perfWindowStartedAt=0,perfFrameCount=0,perfFrameTotal=0,perfLongFrames=0,perfHealthyWindows=0;
let lastAcceptedGpsTimestamp=0,lastAcceptedGpsKey='',mapMatchMismatchHits=0,mapMatchReleaseUntil=0;
let trafficTrendSnapshot=null,trafficSuggestionMeta=null,lastTrafficTrendNoticeAt=0,lastRouteSwitchAt=0,lastRouteSwitchFromKey='',lastRouteSwitchToKey='',lastRouteSwitchSaving=0,lastGpsMetricAt=0,lastEtaMetricAt=0,lastEtaMetricValue=null,searchSuggestionsCache=null,searchSuggestionsAt=0,offlineSince=0,arrivalTelemetrySent=false,lastAlertPopupOpenAt=0,lastAlertRecords=[],alertDomMarkers=new Map(),lastAlertSyncTelemetryAt=0,lastAlertSyncTelemetryCount=-1,alertLiveSyncTimer=null;
let lastAlertFetchAt=0,lastAlertFetchCenter=null,lastAlertFetchZoom=null,lastAlertVectorKey='',lastNavAlertRefreshAt=0,lastNavAlertRefreshPos=null;
const ALERT_DOM_MARKER_MIN_ZOOM=13.35,ALERT_DOM_MARKER_MAX=90;
const routeSwitchCooldown=new Map();const ROUTE_SUGGEST_MIN_S=180,ROUTE_AUTO_MIN_S=300,ROUTE_SWITCH_COOLDOWN_MS=8*60*1000;
document.documentElement.classList.toggle('vano-low-power',LOW_POWER_DEVICE);
function visualFrameGap(){const nav=document.body?.classList.contains('body-nav');if(nav)return performanceTier==='eco'?24:16;return performanceTier==='high'?20:performanceTier==='normal'?28:40}
function setPerformanceTier(next,reason='adaptive'){
  if(!['high','normal','eco'].includes(next))return;
  if(LOW_POWER_DEVICE&&next==='high')next='normal';
  if(document.documentElement.classList.contains('vano-battery-save')&&next!=='eco')next='eco';
  if(next===performanceTier&&document.documentElement.classList.contains(`vano-perf-${next}`))return;
  performanceTier=next;document.documentElement.classList.remove('vano-perf-high','vano-perf-normal','vano-perf-eco');document.documentElement.classList.add(`vano-perf-${next}`);
  try{window.dispatchEvent(new CustomEvent('vano:performance-tier',{detail:{tier:next,reason}}))}catch{}
  if(next==='eco')updateAnimatedRoutePaint?.(true);
}
function perfMonitorTick(ts){
  perfMonitorFrame=requestAnimationFrame(perfMonitorTick);if(document.visibilityState==='hidden'){perfLastTs=ts;return}
  if(!perfLastTs){perfLastTs=ts;perfWindowStartedAt=ts;return}const dt=Math.max(1,Math.min(120,ts-perfLastTs));perfLastTs=ts;perfFrameCount++;perfFrameTotal+=dt;if(dt>28)perfLongFrames++;
  if(ts-perfWindowStartedAt<2600)return;const avg=perfFrameTotal/Math.max(1,perfFrameCount),longRatio=perfLongFrames/Math.max(1,perfFrameCount),batterySave=document.documentElement.classList.contains('vano-battery-save');let next=performanceTier;
  if(batterySave||avg>29||longRatio>.34){next='eco';perfHealthyWindows=0}else if(avg>20.5||longRatio>.16||LOW_POWER_DEVICE){next='normal';perfHealthyWindows=performanceTier==='eco'&&avg<22&&longRatio<.12?perfHealthyWindows+1:0}else{perfHealthyWindows++;if(performanceTier==='eco'&&perfHealthyWindows<3)next='eco';else if(performanceTier==='normal'&&perfHealthyWindows<2)next='normal';else next='high'}
  setPerformanceTier(next,'frame-health');perfWindowStartedAt=ts;perfFrameCount=0;perfFrameTotal=0;perfLongFrames=0;
}
function startPerformanceMonitor(){if(perfMonitorFrame||REDUCED_MOTION)return;setPerformanceTier(performanceTier,'boot');perfMonitorFrame=requestAnimationFrame(perfMonitorTick)}
function stopPerformanceMonitor(){if(perfMonitorFrame){cancelAnimationFrame(perfMonitorFrame);perfMonitorFrame=null}perfLastTs=0;perfWindowStartedAt=0;perfFrameCount=0;perfFrameTotal=0;perfLongFrames=0}
try{navigator.getBattery?.().then(b=>{const sync=()=>{const saving=!b.charging&&b.level<=.20;document.documentElement.classList.toggle('vano-battery-save',saving);if(saving)setPerformanceTier('eco','battery');else if(performanceTier==='eco'){perfHealthyWindows=0;setPerformanceTier(LOW_POWER_DEVICE?'normal':'high','battery-recovered')}};sync();b.addEventListener?.('levelchange',sync);b.addEventListener?.('chargingchange',sync)}).catch(()=>{})}catch{}
// Navigation stability: do not reroute on a couple of noisy GPS fixes or nearby street entrances.
const NAV_OFF_ROUTE_MIN_TRAVEL_M=500,NAV_OFF_ROUTE_MIN_TIME_MS=12000,NAV_OFF_ROUTE_MAX_ACCURACY_M=95;
let offRouteStartedAt=0,offRouteTravelM=0,offRouteStartRaw=null,offRouteLastRaw=null,offRoutePeakM=0;
function resetOffRouteTracker(){offRouteStartedAt=0;offRouteTravelM=0;offRouteStartRaw=null;offRouteLastRaw=null;offRoutePeakM=0;offRouteCount=0}
function offRouteThreshold(raw){const acc=Math.max(4,Number.isFinite(+raw?.accuracy)?+raw.accuracy:35);return Math.max(52,Math.min(110,acc*1.55))}
function updateOffRouteTracker(raw,offRoute){
  if(!raw||!Number.isFinite(+offRoute)||!Number.isFinite(+raw.lat)||!Number.isFinite(+raw.lon)){resetOffRouteTracker();return false}
  const acc=Math.max(1,Number.isFinite(+raw.accuracy)?+raw.accuracy:999),threshold=offRouteThreshold(raw),confident=acc<=NAV_OFF_ROUTE_MAX_ACCURACY_M&&offRoute>threshold;
  if(!confident){resetOffRouteTracker();return false}
  const now=Date.now(),point={lat:+raw.lat,lon:+raw.lon,accuracy:acc};
  if(!offRouteStartedAt){offRouteStartedAt=now;offRouteStartRaw=point;offRouteLastRaw=point;offRouteTravelM=0;offRoutePeakM=+offRoute||0;offRouteCount=1;return false}
  offRouteCount++;offRoutePeakM=Math.max(offRoutePeakM,+offRoute||0);
  if(offRouteLastRaw){const step=hav([offRouteLastRaw.lon,offRouteLastRaw.lat],[point.lon,point.lat]);const plausible=Math.max(90,Math.min(220,Math.max(acc,offRouteLastRaw.accuracy||acc)*3.2));if(Number.isFinite(step)&&step<=plausible)offRouteTravelM+=step}
  offRouteLastRaw=point;return offRouteEligibleForReroute()
}
function offRouteEligibleForReroute(){if(!offRouteStartedAt)return false;const elapsed=Date.now()-offRouteStartedAt,straight=offRouteStartRaw&&offRouteLastRaw?hav([offRouteStartRaw.lon,offRouteStartRaw.lat],[offRouteLastRaw.lon,offRouteLastRaw.lat]):0;return elapsed>=NAV_OFF_ROUTE_MIN_TIME_MS&&(offRouteTravelM>=NAV_OFF_ROUTE_MIN_TRAVEL_M||straight>=NAV_OFF_ROUTE_MIN_TRAVEL_M||offRoutePeakM>=NAV_OFF_ROUTE_MIN_TRAVEL_M)}
let destinationConfirmed=false,parkingController=null,parkingCache=new Map(),activeParkingItems=[];
let guestTrialId=''; const makeGuestTrialId=()=>`g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
const ACTIVE_TRIP_KEY='vano.activeTrip.v33',ACTIVE_TRIP_MAX_AGE=12*60*60*1000;let pendingResumeTrip=null,lastTripPersistAt=0;
let mapThemeOverride=null;try{const saved=localStorage.getItem('vano.map.theme.override.v173');if(saved==='night'||saved==='day')mapThemeOverride=saved}catch{}
let currentMapMood=(VANO_BLACK_THEME?'black':(mapThemeOverride||(MAP_STYLE_MODE==='auto'?'day':MAP_STYLE_MODE)));
function mapStyleForMood(mood){const key=String(mood||'day');if(key==='black')return STYLE_SET?.night||STYLE_SET?.black||STYLE_SET?.day||STYLE;return STYLE_SET?.[key]||STYLE_SET?.day||STYLE}
function applyVanoLightBasemapConfig(){
  if(!map||document.body.dataset.mood==='night'||currentMapMood==='night'||currentMapMood==='black')return;
  const cfg={lightPreset:'day',theme:'faded',font:'Inter',showPlaceLabels:true,showRoadLabels:true,showPointOfInterestLabels:false,showTransitLabels:false,showLandmarkIcons:false,showLandmarkIconLabels:false,showAdminBoundaries:false,showIndoor:false,showIndoorLabels:false,show3dObjects:true,show3dBuildings:true,show3dTrees:false,show3dLandmarks:true,show3dFacades:false};
  for(const [k,v] of Object.entries(cfg)){try{map.setConfigProperty?.('basemap',k,v)}catch{}}
}
let currentStyleUri=mapStyleForMood(currentMapMood),styleSwitching=false,weatherController=null,lastWeatherFetchAt=0,lastWeatherPos=null,moodTimer=null,signalPulseTimer=null,signalPulseState=false;

const VOICE_PREF_KEY='vano-nav-voice-v126';
let selectedVoiceName='';
try{selectedVoiceName=localStorage.getItem(VOICE_PREF_KEY)||''}catch{}
if(selectedVoiceName!=='vano')selectedVoiceName='';
const VANO_VOICE_BASE='/static/voices/vano/';
const vanoUrl=file=>VANO_VOICE_BASE+file+'?v=126';
const VANO_ASSETS={
  facaRetorno:'faca_retorno.mp3',continueFrente:'continue_em_frente.mp3',sigaFrente:'siga_em_frente.mp3',
  em50:'em_50_metros.mp3',em200:'em_200_metros.mp3',em300:'em_300_metros.mp3',em500:'em_500_metros.mp3',em1km:'em_1_km.mp3',em2km:'em_2_km.mp3',
  mantenhaSeDireita:'mantenha_se_a_direita.mp3',mantenhaDireita:'mantenha_a_direita.mp3',mantenhaEsquerda:'mantenha_a_esquerda.mp3',
  vireDireita:'vire_a_direita.mp3',leveDireita:'leve_curva_a_direita.mp3',leveEsquerda:'leve_curva_a_esquerda.mp3',
  chegou:'chegou_ao_destino.mp3',destinoEsquerda:'destino_a_esquerda.mp3'
};
let vanoAudio=null,vanoAudioGeneration=0,vanoWarmStarted=false;
const MAP_PREF_KEY='vano-map-preferences-v10';
function loadMapPrefs(){try{return {...{adaptiveRoutes:true,aggressiveShortcuts:true,showAlternatives:true,liveSignals:true,autoFaster:true},...JSON.parse(localStorage.getItem(MAP_PREF_KEY)||'{}')}}catch{return{adaptiveRoutes:true,aggressiveShortcuts:true,showAlternatives:true,liveSignals:true,autoFaster:true}}}
let mapPrefs=loadMapPrefs();
function saveMapPrefs(){try{localStorage.setItem(MAP_PREF_KEY,JSON.stringify(mapPrefs))}catch{}}
const vehicle3DState={hasFix:false,visible:false};
function ensureVehicle3DLayer(){return Promise.resolve(false)}
function syncUserMarkerVehicleAsset(){if(userMarkerElement){userMarkerElement.style.visibility='visible';userMarkerElement.style.opacity='1';userMarkerElement.style.zIndex='9999'}}
const VANO_PREF_KEY='vano-route-preferences-v2';
function loadSparkPrefs(){try{return {...{safety:68,traffic:62,choices:0},...JSON.parse(localStorage.getItem(VANO_PREF_KEY)||'{}')}}catch{return{safety:68,traffic:62,choices:0}}}
let sparkPrefs=loadSparkPrefs();
function saveSparkPrefs(){try{localStorage.setItem(VANO_PREF_KEY,JSON.stringify(sparkPrefs))}catch{}}
function learnRouteChoice(mode){sparkPrefs.choices=(+sparkPrefs.choices||0)+1;if(mode==='safest')sparkPrefs.safety=Math.min(90,(+sparkPrefs.safety||68)+3);if(mode==='fastest')sparkPrefs.safety=Math.max(42,(+sparkPrefs.safety||68)-3);if(mode==='smart'){sparkPrefs.safety=Math.min(82,Math.max(55,(+sparkPrefs.safety||68)+1));sparkPrefs.traffic=Math.min(88,(+sparkPrefs.traffic||62)+2)}saveSparkPrefs()}
const emptyFC=()=>({type:'FeatureCollection',features:[]});
const isMotorizedProfile=()=>profile==='driving'||profile==='motorcycle';
const profileLabel=()=>profile==='driving'?'carro':profile==='motorcycle'?'moto':profile==='walking'?'a pé':'bike';
function requireRouteAccount(){if(LOGGED_IN)return true;location.assign(LOGIN_URL);return false}
function syncRouteProfileUi(){}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function updatePlannerOriginStatus(label=null){const el=$('plannerOriginStatus');if(!el)return;const base=String(label??origin?.label??'').trim();if(base){el.textContent=/^minha localiza[cç][aã]o$/i.test(base)?'Saindo da sua localização atual':base}else el.textContent=userLocation?'Usando sua localização atual':'Toque em “Meu GPS” para definir a saída';}
function renderRouteSummaryPills(route){const box=$('routeSummaryPills'),count=$('routeChooserCount');if(count)count.textContent=(routes||[]).length>1?`${Math.min(4,(routes||[]).length)} opções comparadas`:'1 rota pronta';if(!box||!route)return;const pills=[];pills.push(`<span class="route-summary-pill emphasis"><i data-lucide="${routeMode==='fastest'?'zap':'shield-check'}" width="13"></i><b>${routeMode==='fastest'?'Modo ETA':'Modo seguro'}</b></span>`);box.innerHTML=pills.join('');}
function routeModeLabel(){return routeMode==='fastest'?'Mais rápida':'Mais segura'}
function profileRouteLabel(){return profile==='motorcycle'?'Moto':profile==='walking'?'A pé':'Carro'}
function navStatusLabel(){if(document.body.classList.contains('nav-drive-turn'))return'Preparando manobra';if(document.body.classList.contains('nav-drive-roundabout'))return'Rotatória à frente';if(document.body.classList.contains('nav-drive-junction'))return'Entroncamento';if(document.body.classList.contains('nav-drive-fast'))return'Fluxo rápido';if(document.body.classList.contains('nav-drive-stopped'))return'Trânsito lento';const trafficTitle=$('trafficSuggestionTitle')?.textContent?.trim();if(trafficTitle&&$('trafficSuggestion')?.classList.contains('show'))return'Alternativa pronta';return'Fluxo estável'}
function syncPremiumRouteCards(){
  const eta=$('selectedDuration')?.textContent?.trim()||'—',distance=$('selectedDistance')?.textContent?.trim()||'—',count=(routes||[]).filter(x=>x?.geometry).length||1,mode=routeModeLabel(),road=$('nextStreet')?.textContent?.trim()||$('roadAhead')?.textContent?.trim()||'Via acompanhada';
  const etaEl=$('routeGlanceEta'),etaMeta=$('routeGlanceEtaMeta'),modeEl=$('routeGlanceMode'),modeMeta=$('routeGlanceModeMeta'),distEl=$('routeGlanceDistance'),distMeta=$('routeGlanceDistanceMeta');
  if(etaEl)etaEl.textContent=eta;if(etaMeta)etaMeta.textContent=`${profileRouteLabel()} · ${count>1?`${Math.min(4,count)} opções comparadas`:'rota pronta'}`;if(modeEl)modeEl.textContent=mode;if(modeMeta)modeMeta.textContent=mode==='Mais rápida'?'menor ETA para sair agora':'equilíbrio entre tempo e contexto';if(distEl)distEl.textContent=distance;if(distMeta)distMeta.textContent=road&&road!=='Via indicada'?road:'trajeto conferido no mapa';
  const navMode=$('navTripMode'),navRoad=$('navTripRoad'),navStatus=$('navTripStatus');
  if(navMode)navMode.textContent=routeModeLabel();if(navRoad)navRoad.textContent=road||'Via acompanhada';if(navStatus)navStatus.textContent=navStatusLabel();
}
function showToast(m){toast.textContent=m;toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('show'),3300)}
function openAccountDrawer(force=true){const drawer=$('accountDrawer'),backdrop=$('accountBackdrop');if(!drawer||!backdrop)return;const show=force===null?!drawer.classList.contains('show'):!!force;drawer.classList.toggle('show',show);backdrop.classList.toggle('show',show);drawer.setAttribute('aria-hidden',String(!show));document.body.classList.toggle('vano-account-open',show);if(show){if(window.lucide)lucide.createIcons();requestAnimationFrame(()=>drawer.querySelector('[data-account-close]')?.focus({preventScroll:true}))}}
function bindAccountDrawerDrag(){const drawer=$('accountDrawer'),grab=drawer?.querySelector('.drawer-grab');if(!drawer||!grab)return;let active=false,startY=0,delta=0,moved=false;grab.style.touchAction='none';grab.addEventListener('pointerdown',e=>{if(!drawer.classList.contains('show'))return;active=true;moved=false;delta=0;startY=e.clientY;drawer.style.transition='none';grab.setPointerCapture?.(e.pointerId)});grab.addEventListener('pointermove',e=>{if(!active)return;delta=Math.max(0,e.clientY-startY);if(delta>4)moved=true;drawer.style.transform=`translateY(${delta}px)`});const finish=()=>{if(!active)return;active=false;drawer.style.transition='';drawer.style.transform='';if(delta>82)openAccountDrawer(false)};grab.addEventListener('pointerup',finish);grab.addEventListener('pointercancel',finish);grab.addEventListener('click',()=>{if(!moved)openAccountDrawer(false)})}
async function useSavedPlace(label){if(!label){showToast('Configure esse endereço no seu perfil.');return}const q=new URLSearchParams({q:label});if(userLocation){q.set('proximity_lat',userLocation.lat);q.set('proximity_lon',userLocation.lon)}try{const r=await fetch('/api/geocode?'+q),d=await r.json(),x=(d.results||[])[0];if(!r.ok||!x)throw new Error();setPoint('destination',x,x.label||label)}catch{destinationInput.value=label;destinationInput.focus();queueSearch(destinationInput,'destination')}}

function setAmbient(level=5){const h=$('ambientHalo');if(!h)return;h.classList.remove('attention','elevated');if(level<=2)h.classList.add('elevated');else if(level<=3)h.classList.add('attention')}
function haptic(ms=12){try{navigator.vibrate?.(ms)}catch{}}
function toggleFocus(force){haptic(8);focusMode=typeof force==='boolean'?force:!focusMode;$('wsApp').classList.toggle('focus-mode',focusMode);$('focusModeBtn')?.classList.toggle('active',focusMode);showToast(focusMode?'Modo foco ativado. Toque novamente para voltar.':'Interface completa restaurada.')}
function fmtDistance(m){m=Math.max(0,+m||0);if(DISTANCE_UNIT==='mi'){const mi=m/1609.344;return mi<.1?`${Math.round(m*3.28084)} ft`:`${mi.toFixed(mi<10?1:0)} mi`}return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(m<10000?1:0)} km`}
function fmtClock(d){return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
function fmtDuration(mins){mins=Math.max(0,Math.round(+mins||0));if(mins<60)return `${Math.max(1,mins)} min`;const h=Math.floor(mins/60),m=mins%60;if(h<24)return m?`${h} h ${m} min`:`${h} h`;const d=Math.floor(h/24),rh=h%24;return rh?`${d} d ${rh} h`:`${d} d`}
function fmtRemaining(seconds){seconds=Math.max(0,+seconds||0);const mins=Math.ceil(seconds/60);return fmtDuration(mins)}
function bearingBetween(a,b){const y=Math.sin((b[0]-a[0])*Math.PI/180)*Math.cos(b[1]*Math.PI/180),x=Math.cos(a[1]*Math.PI/180)*Math.sin(b[1]*Math.PI/180)-Math.sin(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.cos((b[0]-a[0])*Math.PI/180);return (Math.atan2(y,x)*180/Math.PI+360)%360}
function blendBearing(prev,next,alpha=.24){if(!Number.isFinite(prev))return next;let d=((next-prev+540)%360)-180;return (prev+d*alpha+360)%360}
function routeBearingAt(index,speed=0){const c=selectedRoute?.geometry?.coordinates||[];if(c.length<2)return null;const i=Math.max(0,Math.min(c.length-2,index||0)),look=Math.max(2,Math.min(30,Math.round(5+(+speed||0)*.9))),j=Math.min(c.length-1,i+look);if(hav(c[i],c[j])<4&&j<c.length-1)return bearingBetween(c[i],c[Math.min(c.length-1,j+2)]);return bearingBetween(c[i],c[j])}
function bearingDelta(a,b){return Math.abs(((b-a+540)%360)-180)}
function hav(a,b){const R=6371000,p1=a[1]*Math.PI/180,p2=b[1]*Math.PI/180,dp=(b[1]-a[1])*Math.PI/180,dl=(b[0]-a[0])*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function locationErrorMessage(e){if(e?.code===1)return 'A localização está bloqueada. Abra as permissões do navegador, permita Localização e tente novamente.';if(e?.code===2)return 'Não conseguimos determinar sua posição. Verifique se o GPS do celular está ligado.';if(e?.code===3)return 'O GPS demorou para responder. Tente novamente com melhor sinal.';return 'Permita acesso à localização para usar a navegação.'}
function showPermission(m){$('permissionText').textContent=m||'Precisamos do GPS para acompanhar sua posição e iniciar a navegação.';$('locationPermission').classList.add('show')}
function hidePermission(){$('locationPermission').classList.remove('show')}
const LAST_GPS_KEY='vano-last-location-v3';
let startupWatchId=null,startupWatchTimer=null;
function readLastGps(){try{const x=JSON.parse(localStorage.getItem(LAST_GPS_KEY)||'null');const age=Date.now()-(+x?.ts||0);if(!x||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon)||age>6*60*60*1000)return null;return{lat:+x.lat,lon:+x.lon,accuracy:+x.accuracy||999,heading:age<=20000&&Number.isFinite(+x.heading)?+x.heading:null,speed:age<=12000&&Number.isFinite(+x.speed)?Math.max(0,+x.speed):null,ts:+x.ts||0}}catch{return null}}
function saveLastGps(p){if(!p||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return;try{localStorage.setItem(LAST_GPS_KEY,JSON.stringify({lat:+p.lat,lon:+p.lon,accuracy:+p.accuracy||999,heading:Number.isFinite(+p.heading)?+p.heading:null,speed:Number.isFinite(+p.speed)?+p.speed:null,ts:Date.now()}))}catch{}}
function geoRaw(g){return{lat:g.coords.latitude,lon:g.coords.longitude,accuracy:g.coords.accuracy,altitude:Number.isFinite(g.coords.altitude)?g.coords.altitude:null,altitudeAccuracy:Number.isFinite(g.coords.altitudeAccuracy)?g.coords.altitudeAccuracy:null,heading:Number.isFinite(g.coords.heading)?g.coords.heading:null,speed:Number.isFinite(g.coords.speed)?Math.max(0,g.coords.speed):null,ts:Number.isFinite(+g.timestamp)?+g.timestamp:Date.now()}}
function acceptGpsRaw(raw,{force=false}={}){
  if(force||!raw)return true;const ts=Number.isFinite(+raw.ts)?+raw.ts:Date.now(),acc=Math.max(1,+raw.accuracy||999),key=`${(+raw.lat).toFixed(7)}:${(+raw.lon).toFixed(7)}:${Math.round(acc)}`;
  if(lastAcceptedGpsTimestamp&&ts<lastAcceptedGpsTimestamp-350)return false;
  if(key===lastAcceptedGpsKey&&ts-lastAcceptedGpsTimestamp<260)return false;
  lastAcceptedGpsTimestamp=Math.max(lastAcceptedGpsTimestamp,ts);lastAcceptedGpsKey=key;return true
}
function requestPosition(){return new Promise((ok,no)=>{if(!navigator.geolocation)return no({code:0});navigator.geolocation.getCurrentPosition(ok,no,{enableHighAccuracy:true,timeout:4500,maximumAge:5000})})}
function stopStartupGps(){if(startupWatchId!==null){try{navigator.geolocation.clearWatch(startupWatchId)}catch{}startupWatchId=null}if(startupWatchTimer){clearTimeout(startupWatchTimer);startupWatchTimer=null}}
function stopPassiveMapTracking(){if(passiveWatchId!==null){try{navigator.geolocation?.clearWatch(passiveWatchId)}catch{}passiveWatchId=null}if(passiveGpsHeartbeatTimer){clearInterval(passiveGpsHeartbeatTimer);passiveGpsHeartbeatTimer=null}}
function stopNavigationGpsHeartbeat(){if(navGpsHeartbeatTimer){clearInterval(navGpsHeartbeatTimer);navGpsHeartbeatTimer=null}gpsHeartbeatBusy=false}
function requestGpsHeartbeat(handler,timeout=3500,maximumAge=0){if(gpsHeartbeatBusy||!navigator.geolocation||document.visibilityState==='hidden')return;gpsHeartbeatBusy=true;try{navigator.geolocation.getCurrentPosition(g=>{gpsHeartbeatBusy=false;handler(g)},()=>{gpsHeartbeatBusy=false},{enableHighAccuracy:true,maximumAge,timeout})}catch{gpsHeartbeatBusy=false}}
function startPassiveGpsHeartbeat(){if(passiveGpsHeartbeatTimer||!navigator.geolocation)return;passiveGpsHeartbeatTimer=setInterval(()=>{if(activeNav?.classList.contains('show')||!mapFollowMode)return;if(Date.now()-lastGpsFixAt<7000)return;requestGpsHeartbeat(updatePassiveTracking,3500,1200)},7800)}
function startNavigationGpsHeartbeat(){stopNavigationGpsHeartbeat();if(!navigator.geolocation)return;navGpsHeartbeatTimer=setInterval(()=>{if(!activeNav?.classList.contains('show')||adminSimulation)return;if(Date.now()-lastGpsFixAt<4800)return;requestGpsHeartbeat(g=>{if(activeNav?.classList.contains('show')&&!adminSimulation)updateNavigation(g)},3000,0)},3500)}
function passiveCameraAllowed(){return !!map&&mapFollowMode&&!activeNav?.classList.contains('show')&&!previewing&&!destination&&!destinationConfirmed&&!selectedRoute&&!window.__searchPreviewPopup&&document.visibilityState!=='hidden'}
function updatePassiveTracking(g){
  if(!g?.coords)return;const raw=geoRaw(g);if(!acceptGpsRaw(raw))return;lastGpsFixAt=Date.now();const p=filterPosition(raw);saveLastGps(raw);userLocation={lat:p.lat,lon:p.lon};updateUserMarker(p);updateGpsQuality(raw.accuracy);hidePermission();maybeSyncPresence(p);scheduleEnvironmentalRefresh(p,false);scheduleTrafficSnapshot(false);emitVanoOsint('location',{location:osintLocationPayload(raw,p),navigation:false});
  const movedMeters=!lastPassivePosition?Infinity:hav([lastPassivePosition.lon,lastPassivePosition.lat],[p.lon,p.lat]);lastPassivePosition={...p};
  if(!passiveCameraAllowed()||searchInteractionActive||movedMeters<.22)return;const now=performance.now(),gap=lastPassiveCameraAt?now-lastPassiveCameraAt:500;if(gap<110)return;lastPassiveCameraAt=now;
  const z=Math.max(15.9,Math.min(17.15,map.getZoom?.()||16.25)),duration=Math.max(150,Math.min(680,gap*.96));
  try{map.easeTo({center:[p.lon,p.lat],zoom:z,duration,essential:true,easing:t=>1-Math.pow(1-t,3)})}catch{}
}
function startPassiveMapTracking(){
  if(!navigator.geolocation||activeNav?.classList.contains('show'))return;
  if(passiveWatchId===null){try{passiveWatchId=navigator.geolocation.watchPosition(updatePassiveTracking,e=>{if(e?.code===1)showPermission(locationErrorMessage(e))},{enableHighAccuracy:true,maximumAge:500,timeout:7000})}catch(e){console.warn('[VANO MAPS:passive GPS]',e)}}
  startPassiveGpsHeartbeat();
}
function applyStartupFix(g,asOrigin=false,center=false){const raw=geoRaw(g);if(!acceptGpsRaw(raw))return null;lastGpsFixAt=Date.now();const p=filterPosition(raw);saveLastGps(raw);userLocation={lat:p.lat,lon:p.lon};updateUserMarker(p);updateGpsQuality(raw.accuracy);hidePermission();if(asOrigin){if(!origin||origin.is_gps){if(!origin)setPoint('origin',{...p,is_gps:true},'Minha localização',false);else{origin={...origin,...p,is_gps:true,label:'Minha localização'};originInput.value='Minha localização';originMarker?.setLngLat([p.lon,p.lat])}}}if(center&&map)map.jumpTo({center:[p.lon,p.lat],zoom:16.2});if(destinationConfirmed&&destination&&origin&&!window.__sparkStartupRouteQueued){window.__sparkStartupRouteQueued=true;setTimeout(()=>{window.__sparkStartupRouteQueued=false;calculateRoutes()},120)}maybeSyncPresence(p);scheduleEnvironmentalRefresh(p,false);scheduleTrafficSnapshot(false);emitVanoOsint('location',{location:osintLocationPayload(raw,p),navigation:false});return p}
function bootstrapGps(asOrigin=false){const cached=readLastGps();mapFollowMode=true;if(cached){userLocation={lat:cached.lat,lon:cached.lon};lastPassivePosition={...cached};updateUserMarker(cached);updateGpsQuality(cached.accuracy);if(map)map.jumpTo({center:[cached.lon,cached.lat],zoom:16});scheduleTrafficSnapshot(false);if(asOrigin&&!origin){setPoint('origin',{...cached,is_gps:true},'Minha localização',false);origin.is_gps=true}}if(!navigator.geolocation)return;let gotFresh=false;const finishStartup=()=>{stopStartupGps();startPassiveMapTracking()};navigator.geolocation.getCurrentPosition(g=>{gotFresh=true;applyStartupFix(g,asOrigin,!cached)},e=>{if(!cached&&e?.code===1)showPermission(locationErrorMessage(e))},{enableHighAccuracy:false,timeout:1200,maximumAge:60000});stopStartupGps();startupWatchId=navigator.geolocation.watchPosition(g=>{applyStartupFix(g,asOrigin,!cached&&!gotFresh);gotFresh=true;if((+g.coords.accuracy||999)<=35)finishStartup()},e=>{if(!cached&&e?.code===1)showPermission(locationErrorMessage(e))},{enableHighAccuracy:true,maximumAge:600,timeout:5000});startupWatchTimer=setTimeout(finishStartup,8500)}
function updateGpsQuality(acc){if(!Number.isFinite(acc))return;const box=$('gpsQuality'),bars=$('gpsBars'),label=$('gpsAccuracy');if(!box||!bars||!label)return;const weak=acc>60,nav=!!activeNav?.classList.contains('show');box.classList.toggle('show',nav?weak:true);box.classList.toggle('weak',weak);label.textContent=weak?`GPS fraco · ±${Math.round(acc)} m`:`GPS ±${Math.round(acc)} m`;bars.className='gps-bars '+(acc<=20?'good':acc<=60?'mid':'')}
function makeUserMarker(){
  const el=document.createElement('div');
  el.className='vano-user-puck-v230';
  el.setAttribute('aria-hidden','true');
  el.style.visibility='visible';el.style.opacity='1';el.style.zIndex='99999';
  el.innerHTML=`<span class="vano-puck-accuracy"></span>
  <svg class="vano-puck-inline" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="vanoArrowFace248" x1="36" y1="14" x2="82" y2="92" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#FFC9A5"/>
        <stop offset="0.42" stop-color="#F59A62"/>
        <stop offset="1" stop-color="#D9703F"/>
      </linearGradient>
      <linearGradient id="vanoArrowDepth248" x1="56" y1="36" x2="82" y2="104" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#A85833"/>
        <stop offset="1" stop-color="#6E3420"/>
      </linearGradient>
      <linearGradient id="vanoArrowBase248" x1="40" y1="22" x2="76" y2="102" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#F3F5F7"/>
        <stop offset="1" stop-color="#CBD2D8"/>
      </linearGradient>
    </defs>
    <path d="M64 22 102 60 84 60 84 91 64 111 44 91 44 60 26 60 64 22Z" fill="#8C949D" opacity=".16" transform="translate(0 5)"/>
    <path d="M64 20 100 56 82 56 82 91 64 109 46 91 46 56 28 56 64 20Z" fill="url(#vanoArrowBase248)" stroke="#C8D0D7" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M64 14 98 48 81 48 81 82 64 99 47 82 47 48 30 48 64 14Z" fill="url(#vanoArrowDepth248)"/>
    <path d="M64 10 94 40 79 40 79 74 64 89 49 74 49 40 34 40 64 10Z" fill="url(#vanoArrowFace248)" stroke="#FFF8F2" stroke-width="4.6" stroke-linejoin="round"/>
    <path d="M64 18 83 37 73 37 73 61 64 70 55 61 55 37 45 37 64 18Z" fill="#FFFFFF" opacity=".16"/>
    <path d="M64 10 94 40 79 40 79 74 64 89 49 74 49 40 34 40 64 10Z" fill="none" stroke="#B25B35" stroke-width="1.8" stroke-linejoin="round" opacity=".22"/>
  </svg>`;
  userMarkerElement=el;markerHeadingReady=false;markerHeadingVisual=0;return el
}
function updateMarkerHeading(absoluteHeading,{instant=false}={}){
  let heading=Number.isFinite(+absoluteHeading)?+absoluteHeading:(Number.isFinite(+lastMarkerHeading)?+lastMarkerHeading:null);if(!Number.isFinite(heading))return;
  heading=(heading%360+360)%360;lastMarkerHeading=heading;if(!markerHeadingReady||instant){markerHeadingVisual=heading;markerHeadingReady=true}else markerHeadingVisual=blendBearing(markerHeadingVisual,heading,.34);try{userMarker?.setRotation(markerHeadingVisual)}catch{}
}
function routeAlignedPuckBearing(p){
  if(!selectedRoute?.geometry?.coordinates?.length)return Number.isFinite(lastRoutePuckBearing)?lastRoutePuckBearing:null;
  const along=Number.isFinite(+p?._distanceAlong)?+p._distanceAlong:+nearestProgress(p).distanceAlong||0,speed=Math.max(0,+p?.speed||0),span=Math.max(24,Math.min(70,32+speed*2.1)),raw=routeBearingAtDistance(along,span);
  if(!Number.isFinite(raw))return Number.isFinite(lastRoutePuckBearing)?lastRoutePuckBearing:null;
  if(!Number.isFinite(lastRoutePuckBearing))lastRoutePuckBearing=raw;else lastRoutePuckBearing=blendBearing(lastRoutePuckBearing,raw,speed>=8?.34:speed>=2?.26:.18);
  return lastRoutePuckBearing
}
function visualPuckLngLat(p){
  if(!p||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return[+p?.lon||0,+p?.lat||0];
  const navOn=!!activeNav?.classList.contains('show')&&!!selectedRoute?.geometry?.coordinates?.length;
  if(!navOn)return[+p.lon,+p.lat];
  let along=Number.isFinite(+p._distanceAlong)?+p._distanceAlong:null;
  let off=Number.isFinite(+p._rawOffRoute)?+p._rawOffRoute:null;
  if(!Number.isFinite(along)||!Number.isFinite(off)){
    const m=nearestProgress(p);along=Number.isFinite(along)?along:(m?.distanceAlong||0);off=Number.isFinite(off)?off:(m?.offRoute||Infinity);
  }
  const snapMax=Math.max(45,Math.min(130,(+p.accuracy||35)*1.9));
  if(!Number.isFinite(along)||!Number.isFinite(off)||off>snapMax)return[+p.lon,+p.lat];
  const xy=routePointAtDistance(along);return xy?[xy[0],xy[1]]:[+p.lon,+p.lat]
}
function paintUserMarker(p){
  if(!p||!map||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return;
  const navOn=!!activeNav?.classList.contains('show')&&!!selectedRoute,routeHeading=navOn?routeAlignedPuckBearing(p):null,heading=Number.isFinite(routeHeading)?routeHeading:p.heading;
  if(!userMarker){
    const el=makeUserMarker();
    userMarker=new mapboxgl.Marker({element:el,anchor:'center',rotationAlignment:'map',pitchAlignment:'viewport',occludedOpacity:1})
      .setLngLat(visualPuckLngLat(p)).addTo(map);
  }else userMarker.setLngLat(visualPuckLngLat(p));
  try{userMarker.getElement().style.visibility='visible';userMarker.getElement().style.opacity='1';userMarker.getElement().style.zIndex='9999'}catch{}
  if(userMarkerElement){
    vehicle3DState.hasFix=true;vehicle3DState.visible=true;
    const weak=Math.max(1,+p.accuracy||35)>55;
    const moving=Math.max(0,+p.speed||0)>.9||navOn;
    userMarkerElement.classList.toggle('is-gps-weak',weak);
    userMarkerElement.classList.toggle('is-moving',moving);
    syncUserMarkerVehicleAsset();
  }
  updateMarkerHeading(heading,{instant:!markerHeadingReady});
}
function stopPuckAnimation(){if(puckFrame!==null){cancelAnimationFrame(puckFrame);puckFrame=null}puckMotionLastTs=0}
function resetPuckMotionModel(){puckRouteAlong=null;puckRouteVelocity=0;puckRouteTargetAlong=null;puckRouteTargetSpeed=0;puckRouteFixAt=0}
function updatePuckRouteModel(next,now,{instant=false}={}){
  const navOn=!!activeNav?.classList.contains('show')&&!!selectedRoute?.geometry?.coordinates?.length&&Number.isFinite(+next?._distanceAlong);if(!navOn)return false;
  let along=Math.max(0,Math.min(routeTotalGeometry-1,+next._distanceAlong||0)),gpsSpeed=Number.isFinite(+next.speed)?Math.max(0,+next.speed):0;
  if(instant||!Number.isFinite(puckRouteAlong)){puckRouteAlong=along;puckRouteVelocity=gpsSpeed;puckRouteTargetAlong=along;puckRouteTargetSpeed=gpsSpeed;puckRouteFixAt=now;return true}
  const dtFix=puckRouteFixAt?Math.max(.12,Math.min(3,(now-puckRouteFixAt)/1000)):0,previousTarget=Number.isFinite(puckRouteTargetAlong)?puckRouteTargetAlong:along;let measured=dtFix>0?Math.max(0,(along-previousTarget)/dtFix):0;if(!Number.isFinite(measured)||measured>65)measured=0;
  const inferred=measured>.18?(gpsSpeed>.18?gpsSpeed*.68+measured*.32:measured):gpsSpeed;puckRouteTargetSpeed=Math.max(0,Math.min(60,Number.isFinite(inferred)?inferred:0));
  if(Number.isFinite(puckRouteAlong)&&along<puckRouteAlong&&puckRouteAlong-along<9)along=puckRouteAlong;puckRouteTargetAlong=along;puckRouteFixAt=now;return true
}
function predictedPuckTarget(ts){
  const base=puckTargetPos;if(!base)return null;const navOn=!!activeNav?.classList.contains('show')&&!!selectedRoute?.geometry?.coordinates?.length;if(!navOn||!Number.isFinite(+base._distanceAlong)||!Number.isFinite(puckRouteTargetAlong))return base;
  const age=Math.max(0,(ts-puckRouteFixAt)/1000),leadSec=age<=1.05?age:1.05+Math.min(.75,age-1.05)*.32,desiredAlong=Math.min(routeTotalGeometry-1,puckRouteTargetAlong+puckRouteTargetSpeed*leadSec),xy=routePointAtDistance(desiredAlong);return xy?{...base,lon:xy[0],lat:xy[1],_distanceAlong:desiredAlong,_motionAge:age}:base
}
function puckAnimationTick(ts){
  puckFrame=null;if(!puckTargetPos||document.visibilityState==='hidden'||searchInteractionActive){puckMotionLastTs=0;return}const target=predictedPuckTarget(ts);if(!target)return;const dt=puckMotionLastTs?Math.max(8,Math.min(72,ts-puckMotionLastTs)):visualFrameGap(),dtSec=dt/1000;puckMotionLastTs=ts;
  const routeMotion=!!activeNav?.classList.contains('show')&&!!selectedRoute?.geometry?.coordinates?.length&&Number.isFinite(+target._distanceAlong)&&Number.isFinite(puckRouteAlong);
  if(routeMotion){const desiredAlong=Math.max(0,Math.min(routeTotalGeometry-1,+target._distanceAlong)),error=desiredAlong-puckRouteAlong,age=Math.max(0,+target._motionAge||0),speed=Math.max(0,puckRouteTargetSpeed||+target.speed||0),correction=Math.max(-(speed*.55+1.2),Math.min(speed*.65+3.2,error*1.28)),staleFactor=age<=1.45?1:Math.max(0,1-(age-1.45)/.75);let desiredVelocity=Math.max(0,(speed+correction)*staleFactor);if(speed<.38&&Math.abs(error)<1.6)desiredVelocity=0;const velocityTau=performanceTier==='eco'?260:performanceTier==='normal'?205:170,va=1-Math.exp(-dt/velocityTau);puckRouteVelocity=puckRouteVelocity+(desiredVelocity-puckRouteVelocity)*va;let nextAlong=puckRouteAlong+puckRouteVelocity*dtSec;if(error>=0)nextAlong=Math.min(nextAlong,desiredAlong+1.15);else if(Math.abs(error)>9)nextAlong=Math.max(desiredAlong,nextAlong-Math.min(2.2,Math.abs(error)*.08));puckRouteAlong=Math.max(0,Math.min(routeTotalGeometry-1,nextAlong));const xy=routePointAtDistance(puckRouteAlong);puckDisplayPos=xy?{...target,lon:xy[0],lat:xy[1],_distanceAlong:puckRouteAlong}:{...target};if(ts-puckLastPaintAt>=visualFrameGap()){puckLastPaintAt=ts;paintUserMarker(puckDisplayPos)}const keepAlive=age<2.2&&(puckRouteVelocity>.08||Math.abs(error)>.06);if(keepAlive)puckFrame=requestAnimationFrame(puckAnimationTick);else{paintUserMarker(puckDisplayPos);puckMotionLastTs=0}return}
  if(!puckDisplayPos){puckDisplayPos={...target};paintUserMarker(puckDisplayPos);return}const distance=hav([puckDisplayPos.lon,puckDisplayPos.lat],[target.lon,target.lat]);if(distance>220){puckDisplayPos={...target};paintUserMarker(puckDisplayPos);return}const tau=performanceTier==='eco'?170:120,alpha=1-Math.exp(-dt/tau);puckDisplayPos={...target,lat:puckDisplayPos.lat+(target.lat-puckDisplayPos.lat)*alpha,lon:puckDisplayPos.lon+(target.lon-puckDisplayPos.lon)*alpha};if(ts-puckLastPaintAt>=visualFrameGap()){puckLastPaintAt=ts;paintUserMarker(puckDisplayPos)}if(distance>.035)puckFrame=requestAnimationFrame(puckAnimationTick);else{puckDisplayPos={...target};paintUserMarker(puckDisplayPos);puckMotionLastTs=0}
}
function updateUserMarker(p,opts={}){if(!p||!map||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return;if(window.__vanoNativeMapActive&&activeNav?.classList.contains('show'))return;const now=performance.now(),next={...p,lat:+p.lat,lon:+p.lon};puckLastFixAt=now;puckTargetUpdatedAt=now;puckTargetPos=next;const routeMotion=updatePuckRouteModel(next,now,{instant:!!opts.instant});if(searchInteractionActive){stopPuckAnimation();return}if(previewing||adminSimulation){stopPuckAnimation();if(previewing)resetPuckMotionModel();puckDisplayPos={...next};if(now-puckLastPaintAt>=visualFrameGap()||!vehicle3DState.hasFix){puckLastPaintAt=now;paintUserMarker(puckDisplayPos)}return}const distance=puckDisplayPos?hav([puckDisplayPos.lon,puckDisplayPos.lat],[next.lon,next.lat]):Infinity;if(opts.instant||!puckDisplayPos||distance>220){stopPuckAnimation();if(routeMotion&&Number.isFinite(puckRouteAlong)){const xy=routePointAtDistance(puckRouteAlong);puckDisplayPos=xy?{...next,lon:xy[0],lat:xy[1],_distanceAlong:puckRouteAlong}:{...next}}else puckDisplayPos={...next};puckLastPaintAt=now;paintUserMarker(puckDisplayPos);return}if(puckFrame===null)puckFrame=requestAnimationFrame(puckAnimationTick)}
function filterPosition(raw){
  if(!smoothedPos){smoothedPos={...raw};return smoothedPos}
  const prev=smoothedPos,jump=hav([prev.lon,prev.lat],[raw.lon,raw.lat]);
  if(jump>700&&raw.accuracy>80)return prev;
  const navOn=!!activeNav?.classList.contains('show'),speed=Number.isFinite(+raw.speed)?Math.max(0,+raw.speed):0;
  const realMove=jump>Math.max(.55,Math.min(3.2,(+raw.accuracy||30)*.075))||speed>.28;
  let alpha;
  if(navOn&&realMove)alpha=raw.accuracy<=18?.98:raw.accuracy<=40?.91:.78;
  else if(navOn)alpha=raw.accuracy<=18?.42:raw.accuracy<=40?.30:.20;
  else alpha=raw.accuracy<=15?.55:raw.accuracy<=40?.38:.24;
  smoothedPos={...raw,lat:prev.lat+(raw.lat-prev.lat)*alpha,lon:prev.lon+(raw.lon-prev.lon)*alpha,heading:Number.isFinite(raw.heading)?raw.heading:prev.heading,speed:Number.isFinite(raw.speed)?raw.speed:prev.speed,accuracy:raw.accuracy};return smoothedPos
}
function routePointAtDistance(distance){const c=selectedRoute?.geometry?.coordinates||[];if(!c.length)return null;if(c.length===1||!routeCumulative.length)return c[0];const target=Math.max(0,Math.min(routeTotalGeometry,+distance||0));let lo=0,hi=routeCumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(routeCumulative[mid]<target)lo=mid+1;else hi=mid}const i=Math.max(1,lo),a=c[i-1],b=c[i],d0=routeCumulative[i-1]||0,d1=routeCumulative[i]||d0+1,t=Math.max(0,Math.min(1,(target-d0)/Math.max(1,d1-d0)));return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}
function resetMapMatchHysteresis(){mapMatchMismatchHits=0;mapMatchReleaseUntil=0}
function stabilizeActiveNavPosition(filtered,raw,match=null){
  if(!activeNav?.classList.contains('show')||!selectedRoute?.geometry?.coordinates?.length)return filtered;
  if(!routeCumulative.length)buildMetrics();const m=match||nearestProgress(filtered),acc=Number.isFinite(+raw?.accuracy)?Math.max(1,+raw.accuracy):50,speed=Number.isFinite(+raw?.speed)?Math.max(0,+raw.speed):0,snapLimit=Math.max(18,Math.min(58,acc*1.22)),prevRaw=navLastRawPosition;
  const rawMove=prevRaw?hav([prevRaw.lon,prevRaw.lat],[raw.lon,raw.lat]):Infinity,motionBearing=prevRaw&&rawMove>3.5?bearingBetween([prevRaw.lon,prevRaw.lat],[raw.lon,raw.lat]):null;navLastRawPosition={lat:raw.lat,lon:raw.lon,accuracy:acc,speed,heading:raw.heading};
  if(!Number.isFinite(m.offRoute)||m.offRoute>snapLimit){mapMatchMismatchHits=Math.min(6,mapMatchMismatchHits+1);if(mapMatchMismatchHits>=3)mapMatchReleaseUntil=Date.now()+6500;return{...filtered,_rawOffRoute:m.offRoute,_routeSnapped:false}}
  let along=Math.max(0,m.distanceAlong||0);const routeHeading=routeBearingAtDistance(along,Math.max(26,Math.min(70,30+speed*2))),headingCandidate=speed>1.6&&Number.isFinite(+raw.heading)?+raw.heading:motionBearing,mismatch=Number.isFinite(routeHeading)&&Number.isFinite(headingCandidate)?bearingDelta(routeHeading,headingCandidate):0;
  const confidentLateral=acc<=20&&m.offRoute>Math.max(11,acc*.72)&&rawMove>2.4,headingConflict=speed>2.0&&mismatch>78&&rawMove>2.4;if(confidentLateral||headingConflict)mapMatchMismatchHits=Math.min(8,mapMatchMismatchHits+1);else mapMatchMismatchHits=Math.max(0,mapMatchMismatchHits-1);
  if(mapMatchMismatchHits>=3)mapMatchReleaseUntil=Date.now()+6500;const reacquired=m.offRoute<Math.max(6,acc*.38)&&mismatch<42;if(reacquired&&mapMatchMismatchHits===0&&Date.now()+1500>mapMatchReleaseUntil)mapMatchReleaseUntil=0;
  if(Date.now()<mapMatchReleaseUntil)return{...filtered,_rawOffRoute:m.offRoute,_routeSnapped:false,_mapMatchReleased:true};
  const jitterRadius=Math.max(2.4,Math.min(7.0,acc*.17)),moving=speed>.72||rawMove>jitterRadius;if(navLastAlong>0){if(!moving&&Math.abs(along-navLastAlong)<20)along=navLastAlong;else if(along<navLastAlong-5)along=navLastAlong;else if(moving&&along<navLastAlong)along=Math.max(navLastAlong-1.2,along)}
  const xy=routePointAtDistance(along);if(!xy)return filtered;let strength=moving?(acc<=28?.99:.94):1;if(mismatch>55&&moving)strength=Math.min(strength,.78);if(mismatch>72&&moving)strength=Math.min(strength,.58);
  return{...filtered,lon:filtered.lon+(xy[0]-filtered.lon)*strength,lat:filtered.lat+(xy[1]-filtered.lat)*strength,_rawOffRoute:m.offRoute,_routeSnapped:true,_distanceAlong:along,_moving:moving,_routeHeading:routeHeading}
}

function routeClientKey(route){return String(route?.route_signature||route?.id||`${Math.round(+route?.duration||0)}:${Math.round(+route?.distance||0)}`)}
function routeClientMetrics(route){
  const c=route?.geometry?.coordinates||[];if(!route||c.length<2)return{coords:c,cumulative:[0],total:+route?.distance||1};
  const cached=route.__sparkClientMetrics;if(cached&&cached.len===c.length)return cached;
  const cumulative=new Array(c.length).fill(0);for(let i=1;i<c.length;i++)cumulative[i]=cumulative[i-1]+hav(c[i-1],c[i]);
  const out={coords:c,cumulative,total:cumulative.at(-1)||+route.distance||1,len:c.length};try{Object.defineProperty(route,'__sparkClientMetrics',{value:out,writable:true,configurable:true})}catch{route.__sparkClientMetrics=out}return out
}
function nearestProgressOnRoute(p,route){
  const mt=routeClientMetrics(route),c=mt.coords;if(!c.length)return{distanceAlong:0,remaining:+route?.distance||0,progress:0,offRoute:Infinity,index:0};if(c.length===1)return{distanceAlong:0,remaining:+route?.distance||0,progress:0,offRoute:hav([p.lon,p.lat],c[0]),index:0};
  let best=Infinity,bestI=0,bestT=0,stride=Math.max(1,Math.floor((c.length-1)/900));for(let i=0;i<c.length-1;i+=stride){const j=Math.min(c.length-1,i+stride),pr=projectSegmentMeters(p,c[i],c[j]);if(pr.distance<best){best=pr.distance;bestI=i;bestT=pr.t}}
  const start=Math.max(0,bestI-stride*2),end=Math.min(c.length-2,bestI+stride*3);for(let i=start;i<=end;i++){const pr=projectSegmentMeters(p,c[i],c[i+1]);if(pr.distance<best){best=pr.distance;bestI=i;bestT=pr.t}}
  const seg=Math.max(0,(mt.cumulative[bestI+1]||mt.cumulative[bestI]||0)-(mt.cumulative[bestI]||0)),along=(mt.cumulative[bestI]||0)+seg*bestT,progress=Math.max(0,Math.min(1,along/Math.max(1,mt.total))),idx=Math.min(c.length-1,bestI+(bestT>.55?1:0));return{distanceAlong:along,remaining:Math.max(0,(+route.distance||mt.total)*(1-progress)),progress,offRoute:best,index:idx}
}
function routePointAtDistanceFor(route,distance){const mt=routeClientMetrics(route),c=mt.coords;if(!c.length)return null;if(c.length===1)return c[0];const target=Math.max(0,Math.min(mt.total,+distance||0));let lo=0,hi=mt.cumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(mt.cumulative[mid]<target)lo=mid+1;else hi=mid}const i=Math.max(1,lo),a=c[i-1],b=c[i],d0=mt.cumulative[i-1]||0,d1=mt.cumulative[i]||d0+1,t=Math.max(0,Math.min(1,(target-d0)/Math.max(1,d1-d0)));return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}
function routeBearingAtDistanceFor(route,distance,span=32){const a=routePointAtDistanceFor(route,distance),b=routePointAtDistanceFor(route,distance+span);return a&&b?bearingBetween(a,b):null}
function navigationAlternativeRoutes(){
  if(!activeNav?.classList.contains('show')||!isMotorizedProfile()||!selectedRoute)return[];const selectedKey=routeClientKey(selectedRoute),base=+selectedRoute.duration||0;
  return (routes||[]).filter(r=>r?.geometry?.coordinates?.length>1&&routeClientKey(r)!==selectedKey&&!navSuppressedRouteKeys.has(routeClientKey(r))).sort((a,b)=>{const am=a.micro_route?0:1,bm=b.micro_route?0:1;if(am!==bm)return am-bm;const ar=Math.max(0,+a.micro_traffic_relief||0),br=Math.max(0,+b.micro_traffic_relief||0);if(Math.abs(ar-br)>2)return br-ar;return(+a.duration||9e12)-(+b.duration||9e12)}).slice(0,3)
}
function navAlternativeFC(){const list=navigationAlternativeRoutes().slice(0,2);return{type:'FeatureCollection',features:list.map((r,i)=>({type:'Feature',properties:{alternative:true,rank:i,key:routeClientKey(r),micro:!!r.micro_route},geometry:r.geometry}))}}
function alternativeMeta(route){if(!route||!selectedRoute)return'';const saving=Math.max(0,(+selectedRoute.duration||0)-(+route.duration||0));if(saving<ROUTE_SUGGEST_MIN_S)return'';const min=Math.max(1,Math.round(saving/60));return `Economiza ${min} min`}
function routeSwitchBlocked(route,saving=0){if(!route)return true;const key=routeClientKey(route),until=routeSwitchCooldown.get(key)||0;if(Date.now()>=until){if(until)routeSwitchCooldown.delete(key);return false}return saving<480}
function rememberRouteSwitch(fromRoute,toRoute,saving=0){const now=Date.now(),fromKey=routeClientKey(fromRoute),toKey=routeClientKey(toRoute);lastRouteSwitchAt=now;lastRouteSwitchFromKey=fromKey;lastRouteSwitchToKey=toKey;lastRouteSwitchSaving=Math.max(0,+saving||0);if(fromKey)routeSwitchCooldown.set(fromKey,now+ROUTE_SWITCH_COOLDOWN_MS);if(toKey)routeSwitchCooldown.set(toKey,now+90000)}
function refreshNavigationAlternatives(force=false){
  if(!activeNav?.classList.contains('show'))return;const now=performance.now();if(!force&&now-navAlternativeLastPaintAt<1150)return;navAlternativeLastPaintAt=now;const list=navigationAlternativeRoutes();if(!window.__vanoNativeMapActive)map?.getSource('route-alternatives')?.setData(navAlternativeFC());
  const selectedEta=+selectedRoute?.duration||Infinity,primary=list.map(r=>({r,saving:selectedEta-(+r.duration||Infinity)})).filter(x=>x.saving>=ROUTE_SUGGEST_MIN_S&&!routeSwitchBlocked(x.r,x.saving)).sort((a,b)=>b.saving-a.saving)[0]?.r||null;navAlternativePrimary=primary;const box=$('navAltHint');if(!box)return;const key=routeClientKey(primary),dismissed=primary&&navAlternativeDismissedKey===key&&Date.now()<navAlternativeDismissUntil,show=!!primary&&!dismissed;box.classList.toggle('show',show);document.body.classList.toggle('nav-alt-visible',show);if(show){const saving=Math.max(0,selectedEta-(+primary.duration||0)),mins=Math.max(1,Math.round(saving/60));$('navAltHintText').textContent=`Economiza ${mins} min · trocar rota?`;$('navAltHintMeta').textContent=primary.micro_route?'Desvio mais rápido à frente':'Alternativa com ETA melhor';productTelemetry('route',`alternative-prompt:${mins}m`,'navigation')}
}
function acceptNavigationAlternative(){if(!navAlternativePrimary||!lastNavPosition)return;const m=nearestProgressOnRoute(lastNavPosition,navAlternativePrimary);productTelemetry('route','alternative-accepted','navigation');adoptNavigationAlternative(navAlternativePrimary,lastNavPosition,m)}
function dismissNavigationAlternative(){if(navAlternativePrimary){navAlternativeDismissedKey=routeClientKey(navAlternativePrimary);navAlternativeDismissUntil=Date.now()+180000}const box=$('navAltHint');box?.classList.remove('show');document.body.classList.remove('nav-alt-visible');productTelemetry('route','alternative-dismissed','navigation');showToast('Mantendo a rota atual.')}
function mergeNavigationAlternative(route){if(!route?.geometry?.coordinates?.length)return;const key=routeClientKey(route);if((routes||[]).some(r=>routeClientKey(r)===key))return;routes=[...(routes||[]),route];refreshNavigationAlternatives(true)}
function adoptNavigationAlternative(route,p,match=null,{automatic=false,reason='alternative'}={}){
  if(!route||route===selectedRoute)return false;const old=selectedRoute,saving=Math.max(0,(+old?.duration||0)-(+route.duration||0));if(automatic&&routeSwitchBlocked(route,saving))return false;const oldKey=routeClientKey(old);if(oldKey)navSuppressedRouteKeys.add(oldKey);rememberRouteSwitch(old,route,saving);selectedRoute=route;vanoSyncNativeMapRoute(p);navAlternativeDismissedKey='';navAlternativeDismissUntil=0;origin={lat:+p.lat,lon:+p.lon,label:'Minha localização',is_gps:true};buildMetrics();const m=match||nearestProgress(p);navLastAlong=Math.max(0,m.distanceAlong||0);navLastPaintAlong=navLastAlong;navLastRawPosition=null;lastNavRoutePaintAt=0;resetOffRouteTracker();resetMapMatchHysteresis();navAlternativeHitKey='';navAlternativeHitCount=0;setNavRouteData(navLastAlong);refreshNavigationAlternatives(true);updateRoadLayer();const step=currentStep(m.distanceAlong);$('nextStreet').textContent=stepStreet(step);$('nextInstruction').textContent=maneuverLabel(step);$('maneuverGlyph').textContent=maneuverGlyph(step);updateNavSummary(Math.max(0,(+selectedRoute.duration||0)*(1-m.progress)),m.remaining,step);scheduleCamera(p,true,m);haptic(automatic?8:14);productTelemetry('route',`${automatic?'alternative-auto':'alternative-manual'}:${reason}:${Math.max(0,Math.round(saving/60))}m`,'navigation');showToast(saving>=60?`Nova rota ativa · ${Math.round(saving/60)} min mais rápida.`:(route.micro_route?'Micro-rota ativada.':'Rota alternativa ativada.'));return true
}
function maybeAdoptNavigationAlternative(raw,p){
  if(!isMotorizedProfile()||!activeNav?.classList.contains('show')||!selectedRoute||navLastAlong<45||!offRouteEligibleForReroute())return false;const list=navigationAlternativeRoutes();if(!list.length)return false;const acc=Math.max(4,+raw?.accuracy||35),current=nearestProgressOnRoute(raw,selectedRoute),speed=Math.max(0,+raw?.speed||0);let best=null,bestScore=Infinity,bestMatch=null;
  for(const r of list){const m=nearestProgressOnRoute(raw,r),limit=Math.max(14,Math.min(42,acc*1.18));if(m.offRoute>limit)continue;let score=m.offRoute-current.offRoute;const h=Number.isFinite(+raw?.heading)?+raw.heading:null;if(h!=null&&speed>1.8){const altB=routeBearingAtDistanceFor(r,m.distanceAlong,34),curB=routeBearingAtDistanceFor(selectedRoute,current.distanceAlong,34);if(Number.isFinite(altB))score+=bearingDelta(h,altB)*.10;if(Number.isFinite(curB))score-=bearingDelta(h,curB)*.05}const convincinglyBetter=(current.offRoute>Math.max(24,acc*1.28)&&m.offRoute+8<current.offRoute)||(current.offRoute>Math.max(18,acc*.80)&&m.offRoute+14<current.offRoute);if(!convincinglyBetter)continue;if(score<bestScore){best=r;bestScore=score;bestMatch=m}}
  if(!best){navAlternativeHitKey='';navAlternativeHitCount=0;return false}const key=routeClientKey(best);if(navAlternativeHitKey===key)navAlternativeHitCount++;else{navAlternativeHitKey=key;navAlternativeHitCount=1}if(navAlternativeHitCount<4)return false;return adoptNavigationAlternative(best,p,bestMatch)
}

function remainingNavGeometry(startAlong=0){
  const c=selectedRoute?.geometry?.coordinates||[];if(c.length<2)return selectedRoute?.geometry||null;if(!routeCumulative.length)buildMetrics();
  const start=Math.max(0,Math.min(routeTotalGeometry-0.01,(+startAlong||0)-8)),pt=routePointAtDistance(start);let lo=0,hi=routeCumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(routeCumulative[mid]<start)lo=mid+1;else hi=mid}const coords=[pt,...c.slice(Math.max(1,lo))].filter(Boolean),clean=[];for(const x of coords){const prev=clean.at(-1);if(!prev||hav(prev,x)>.25)clean.push(x)}return clean.length>1?{type:'LineString',coordinates:clean}:selectedRoute.geometry;
}
function routeBearingAtDistance(distance,span=34){const a=routePointAtDistance(distance),b=routePointAtDistance(distance+span);return a&&b?bearingBetween(a,b):null}
function startupRouteBearing(m,p){
  const along=Math.max(0,+m?.distanceAlong||0),samples=[18,32,52,78,108],bearings=[];
  for(const span of samples){const b=routeBearingAtDistance(Math.max(0,along-2),span);if(Number.isFinite(b))bearings.push({b,w:span<=52?3:span<=78?2:1})}
  if(!bearings.length)return Number.isFinite(+p?.heading)?+p.heading:null;
  let x=0,y=0;for(const v of bearings){const r=v.b*Math.PI/180;x+=Math.sin(r)*v.w;y+=Math.cos(r)*v.w}let route=(Math.atan2(x,y)*180/Math.PI+360)%360;
  const gps=Number.isFinite(+p?.heading)?+p.heading:null,speed=Math.max(0,+p?.speed||0),acc=Math.max(0,+p?.accuracy||0);
  if(gps!=null&&speed>2.2&&acc<45&&bearingDelta(route,gps)<42)route=blendBearing(route,gps,.12);
  return route
}
function upcomingTurn(m,speed){const d=m?.distanceAlong||0,b0=routeBearingAtDistance(d,28),look=isMotorizedProfile()?Math.max(85,Math.min(250,110+speed*4.8)):42,b1=routeBearingAtDistance(d+look,34);return{angle:Number.isFinite(b0)&&Number.isFinite(b1)?bearingDelta(b0,b1):0,distance:look}}
function cameraLookAhead(speed,m){let base=isMotorizedProfile()?Math.max(105,Math.min(285,112+speed*5.3)):34;const turn=upcomingTurn(m,speed);if(turn.angle>58)base*=.62;else if(turn.angle>34)base*=.76;const step=currentStep(m?.distanceAlong||0);if((step.remainingInStep??9999)<120)base*=.78;return Math.max(isMotorizedProfile()?74:28,base)}
function roadControlAhead(type,along,maxAhead=90){let best=null;for(const x of roadAwareness||[]){if(type&&String(x.type||'')!==type)continue;if(!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon))continue;const m=nearestProgress({lat:+x.lat,lon:+x.lon}),ahead=m.distanceAlong-along;if(m.offRoute<=80&&ahead>=-10&&ahead<=maxAhead&&(!best||ahead<best.ahead))best={...x,ahead}}return best}
function cameraJunctionContext(m,step,turn){const rem=Math.max(0,+step?.remainingInStep||9999),type=String(step?.type||'').toLowerCase(),roundabout=type.includes('roundabout')||type.includes('rotary'),decision=rem<220&&(turn.angle>22||type==='fork'||type==='merge'||type==='end of road'||roundabout),large=decision&&(turn.angle>38||type==='fork'||type==='merge'||roundabout);return{rem,roundabout,decision,large}}
function cameraDynamicProgress(ctx,ts){
  const base=ctx?.progressInfo||nearestProgress(ctx.p),speed=Math.max(0,+ctx?.p?.speed||0),visualAlong=Number.isFinite(puckRouteAlong)&&Number.isFinite(+puckTargetPos?._distanceAlong)&&ts-puckRouteFixAt<2600?puckRouteAlong:null,elapsed=Math.max(0,Math.min(1.8,(ts-(ctx?.updatedAt||ts))/1000)),lead=Math.min(25,speed*elapsed*.90),along=Math.min(routeTotalGeometry-1,Math.max(0,visualAlong??((+base.distanceAlong||0)+lead)));
  return{...base,distanceAlong:along,remaining:Math.max(0,routeTotalGeometry-along),progress:routeTotalGeometry>0?Math.max(0,Math.min(1,along/routeTotalGeometry)):base.progress||0}
}
function setDriveCameraMood(speed,junction,turn){
  if(!activeNav?.classList.contains('show'))return;let mood='cruise';if(junction?.roundabout)mood='roundabout';else if(junction?.large)mood='junction';else if(junction?.decision||turn?.angle>34)mood='turn';else if(speed>18)mood='fast';else if(speed<1)mood='stopped';if(mood===driveCameraMood)return;driveCameraMood=mood;['stopped','cruise','fast','turn','junction','roundabout'].forEach(x=>document.body.classList.toggle(`nav-drive-${x}`,x===mood));const card=$('navManeuverTop');if(card)card.dataset.driveContext=mood
}
function buildCameraTarget(ctx,ts){
  const p=ctx.p,m=cameraDynamicProgress(ctx,ts),speed=Math.max(0,+p.speed||0),step=currentStep(m.distanceAlong),turn=upcomingTurn(m,speed),junction=cameraJunctionContext(m,step,turn),signal=roadControlAhead('traffic_signal',m.distanceAlong,70),nearlyStopped=speed<.45,stoppedAtSignal=!!signal&&speed<.9,arrivalApproach=m.remaining<420&&m.progress>.80;
  const calibrating=ts<cameraCalibrationUntil,bearingSpan=calibrating?72:Math.max(42,Math.min(125,52+speed*3.2)),routeBearing=routeBearingAtDistance(Math.max(0,m.distanceAlong-(calibrating?2:6)),bearingSpan),gpsHeading=Number.isFinite(+p.heading)?+p.heading:null;
  let rawTarget=Number.isFinite(routeBearing)?routeBearing:(Number.isFinite(lastRoutePuckBearing)?lastRoutePuckBearing:map.getBearing());
  const startupLocked=Number.isFinite(navStartupBearing)&&ts<navStartupBearingUntil;
  if(startupLocked){const release=Math.max(0,Math.min(1,1-(navStartupBearingUntil-ts)/2600));rawTarget=blendBearing(navStartupBearing,rawTarget,release*.28)}
  else if(gpsHeading!=null&&speed>3.2&&(p.accuracy||0)<55&&bearingDelta(rawTarget,gpsHeading)<32)rawTarget=blendBearing(rawTarget,gpsHeading,.14);
  let zoom,pitch,bearing,center=[p.lon,p.lat],padding={top:0,bottom:0,left:0,right:0};const currentXY=routePointAtDistance(m.distanceAlong);if(currentXY)center=currentXY;
  const vw=Math.max(320,window.innerWidth||320),vh=Math.max(480,window.innerHeight||480),startupRemain=Math.max(0,(+navCameraStartUntil||0)-ts),startupRatio=Math.min(1,startupRemain/6500),startupBoost=isMotorizedProfile()?(.36*startupRatio):(.24*startupRatio);
  let look=calibrating?NAV_CAMERA_HOME.lookAhead:cameraLookAhead(speed,m);if(!calibrating){if(junction.decision)look*=junction.large?.82:.90;if(junction.roundabout)look*=.76;if(arrivalApproach)look*=.68;look*=.88;look=Math.max(isMotorizedProfile()?78:24,Math.min(isMotorizedProfile()?220:54,look));if(startupRatio>.01)look*=.82+.18*(1-startupRatio)}
  const centerLead=navCameraMode==='top'?.34:(calibrating?NAV_CAMERA_HOME.centerLead:(junction.large?.62:(startupRatio>.01?.64:.72))),target=routePointAtDistance(Math.min(routeTotalGeometry-1,m.distanceAlong+look*centerLead));setDriveCameraMood(speed,junction,turn);
  if(navCameraMode==='top'){
    zoom=(isMotorizedProfile()?16.68:17.10)-Math.min(.38,speed*.015)+startupBoost*.55;pitch=0;bearing=0;if(target&&speed>4)center=routePointAtDistance(Math.min(routeTotalGeometry-1,m.distanceAlong+look*.30))||center;
  }else{
    if(target)center=target;
    const highSpeedOpen=Math.min(.42,speed*.012),turnClose=(junction.decision&&!junction.large)?Math.min(.10,Math.max(0,(180-junction.rem)/180)*.10):0,junctionOpen=junction.roundabout?.38:(junction.large?.30:0);
    const arrivalT=arrivalApproach?Math.max(0,Math.min(1,(420-m.remaining)/420)):0;zoom=calibrating?NAV_CAMERA_HOME.zoom:17.56-highSpeedOpen+turnClose-junctionOpen+startupBoost*.18+arrivalT*.16;
    pitch=calibrating?NAV_CAMERA_HOME.pitch:(junction.roundabout?40:junction.large?43:(turn.angle>58?49:(58-arrivalT*10)));
    const frozen=!calibrating&&(nearlyStopped||stoppedAtSignal);bearing=frozen&&Number.isFinite(lastCameraBearing)?lastCameraBearing:rawTarget;
    // VANO driver view: close to the puck, while the camera center is projected well ahead on the route.
    const bottomBase=calibrating?NAV_CAMERA_HOME.bottomRatio:(junction.large?.30:.33),topBase=calibrating?NAV_CAMERA_HOME.topRatio:(junction.large?.075:.055);
    padding={top:Math.round(Math.min(92,Math.max(28,vh*topBase))),bottom:Math.round(Math.min(390,Math.max(190,vh*bottomBase))+SAFE_AREA_BOTTOM),left:Math.round(Math.min(58,Math.max(10,vw*.028))),right:Math.round(Math.min(36,Math.max(8,vw*.016)))};
  }
  if((p.accuracy||0)>70)zoom=Math.min(zoom,16.58+startupBoost*.16);if(isMotorizedProfile())zoom=Math.max(15.84,Math.min(17.58,zoom));return{center,zoom,pitch,bearing,padding,rawTarget,stopped:nearlyStopped||stoppedAtSignal,junction,instant:!!ctx.instant,arrivalApproach,speed,nearlyStopped,previewing:!!previewing}
}
function primeNavigationCamera(p,m){
  if(!map||!p||!m)return;navCameraMode='perspective';navExperienceMode='immersive';const ts=performance.now(),locked=startupRouteBearing(m,p);markCameraIntent('launch',1080);if(Number.isFinite(locked)){navStartupBearing=locked;navStartupBearingUntil=ts+2800;lastCameraBearing=locked;lastRoutePuckBearing=locked}
  const target=buildCameraTarget({p:{...p},progressInfo:{...m},instant:true,updatedAt:ts},ts);if(Number.isFinite(navStartupBearing))target.bearing=navStartupBearing;lastCameraBearing=target.bearing;navLaunchAnimationUntil=ts+860;document.body.classList.add('nav-launching');
  try{const c=map.getCenter(),pad=map.getPadding?.()||{};cameraVisualState={center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),padding:{top:+pad.top||0,bottom:+pad.bottom||0,left:+pad.left||0,right:+pad.right||0}};map.stop?.();internalCameraMoveUntil=ts+980;map.easeTo({center:target.center,zoom:target.zoom,pitch:target.pitch,bearing:target.bearing,padding:target.padding,retainPadding:false,duration:820,essential:true,easing:t=>1-Math.pow(1-t,4)});setTimeout(()=>{document.body.classList.remove('nav-launching');cameraVisualState={center:[...target.center],zoom:target.zoom,pitch:target.pitch,bearing:target.bearing,padding:{...target.padding}}},820)}catch(e){console.debug('[VANO MAPS:camera-prime]',e)}updateMarkerHeading(Number.isFinite(navStartupBearing)?navStartupBearing:target.rawTarget)
}
function blendNumber(a,b,alpha){return Number.isFinite(+a)?(+a+(+b-+a)*alpha):+b}
function blendPadding(a={},b={},alpha){return{top:blendNumber(a.top||0,b.top||0,alpha),bottom:blendNumber(a.bottom||0,b.bottom||0,alpha),left:blendNumber(a.left||0,b.left||0,alpha),right:blendNumber(a.right||0,b.right||0,alpha)}}
function markCameraIntent(name='',ms=950){cameraIntent=String(name||'');cameraIntentUntil=performance.now()+Math.max(140,ms||0)}
function activeCameraIntent(ts=performance.now()){return ts<cameraIntentUntil?cameraIntent:''}
function cameraMotionProfile(target,ts,dt){
  const calibrating=ts<cameraCalibrationUntil;
  if(calibrating){const t=Math.max(0,Math.min(1,(ts-cameraCalibrationStartedAt)/1180)),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;return{label:'calibrating',posTau:Math.max(88,255-150*e),viewTau:Math.max(100,300-170*e),bearingTau:Math.max(118,350-185*e),centerEps:.07,zoomEps:.0035,bearingEps:.16}}
  const speed=Math.max(0,+target?.speed||0),intent=activeCameraIntent(ts),largeTurn=!!target?.junction?.large,turning=!!target?.junction?.decision,roundabout=!!target?.junction?.roundabout,arriving=!!target?.arrivalApproach,stopped=!!target?.stopped,instant=!!target?.instant&&ts-(cameraTargetContext?.updatedAt||ts)<420,top=navCameraMode==='top'||intent==='toggle-2d',preview=!!target?.previewing||intent==='preview';
  if(preview)return{label:'preview',posTau:150,viewTau:172,bearingTau:185,centerEps:.09,zoomEps:.004,bearingEps:.22};
  if(top)return{label:'top',posTau:instant?92:132,viewTau:instant?112:158,bearingTau:160,centerEps:.08,zoomEps:.004,bearingEps:.2};
  if(intent==='launch')return{label:'launch',posTau:86,viewTau:108,bearingTau:132,centerEps:.07,zoomEps:.003,bearingEps:.16};
  if(intent==='recenter'||intent==='follow')return{label:'recenter',posTau:94,viewTau:118,bearingTau:142,centerEps:.07,zoomEps:.003,bearingEps:.16};
  if(intent==='toggle-3d')return{label:'toggle-3d',posTau:102,viewTau:126,bearingTau:150,centerEps:.08,zoomEps:.0035,bearingEps:.18};
  if(arriving)return{label:'arrival',posTau:126,viewTau:158,bearingTau:225,centerEps:.075,zoomEps:.0038,bearingEps:.19};
  if(roundabout)return{label:'roundabout',posTau:128,viewTau:154,bearingTau:210,centerEps:.08,zoomEps:.004,bearingEps:.22};
  if(largeTurn)return{label:'junction',posTau:138,viewTau:165,bearingTau:225,centerEps:.08,zoomEps:.004,bearingEps:.22};
  if(turning)return{label:'turn',posTau:146,viewTau:176,bearingTau:245,centerEps:.082,zoomEps:.0042,bearingEps:.24};
  if(stopped||target?.nearlyStopped)return{label:'stopped',posTau:218,viewTau:278,bearingTau:520,centerEps:.06,zoomEps:.003,bearingEps:.14};
  if(speed>14)return{label:'fast',posTau:142,viewTau:176,bearingTau:232,centerEps:.09,zoomEps:.0044,bearingEps:.22};
  if(speed>6)return{label:'cruise',posTau:156,viewTau:188,bearingTau:248,centerEps:.085,zoomEps:.0044,bearingEps:.22};
  if(instant)return{label:'instant',posTau:88,viewTau:108,bearingTau:128,centerEps:.07,zoomEps:.003,bearingEps:.16};
  return{label:'steady',posTau:164,viewTau:205,bearingTau:270,centerEps:.085,zoomEps:.0045,bearingEps:.24};
}
function cameraMotionTick(ts){
  cameraMotionFrame=null;if(!cameraTargetContext||!map||!followMode||searchInteractionActive||document.visibilityState==='hidden'){cameraVisualState=null;return}if(ts-cameraLastPaintAt<visualFrameGap()){cameraMotionFrame=requestAnimationFrame(cameraMotionTick);return}const target=buildCameraTarget(cameraTargetContext,ts),dt=cameraLastPaintAt?Math.max(8,Math.min(90,ts-cameraLastPaintAt)):visualFrameGap();cameraLastPaintAt=ts;
  if(!cameraVisualState){const c=map.getCenter(),pad=map.getPadding?.()||{};cameraVisualState={center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),padding:{top:+pad.top||0,bottom:+pad.bottom||0,left:+pad.left||0,right:+pad.right||0}}}
  const profile=cameraMotionProfile(target,ts,dt),ap=1-Math.exp(-dt/profile.posTau),av=1-Math.exp(-dt/profile.viewTau),ab=1-Math.exp(-dt/profile.bearingTau);
  cameraVisualState.center=[blendNumber(cameraVisualState.center[0],target.center[0],ap),blendNumber(cameraVisualState.center[1],target.center[1],ap)];cameraVisualState.zoom=blendNumber(cameraVisualState.zoom,target.zoom,av);cameraVisualState.pitch=blendNumber(cameraVisualState.pitch,target.pitch,av);cameraVisualState.bearing=blendBearing(cameraVisualState.bearing,target.bearing,ab);cameraVisualState.padding=blendPadding(cameraVisualState.padding,target.padding,av);lastCameraBearing=cameraVisualState.bearing;navLastCameraZoom=cameraVisualState.zoom;
  internalCameraMoveUntil=performance.now()+120;try{map.jumpTo({center:cameraVisualState.center,zoom:cameraVisualState.zoom,pitch:cameraVisualState.pitch,bearing:cameraVisualState.bearing,padding:cameraVisualState.padding,retainPadding:false})}catch(e){console.debug('[VANO MAPS:camera-motion]',e)}updateMarkerHeading(target.rawTarget);
  const centerGap=hav(cameraVisualState.center,target.center),zoomGap=Math.abs(cameraVisualState.zoom-target.zoom),bearingGap=bearingDelta(cameraVisualState.bearing,target.bearing),predicting=(puckRouteVelocity>.08&&ts-puckRouteFixAt<2200)||(Math.max(0,+cameraTargetContext.p?.speed||0)>.75&&ts-(cameraTargetContext.updatedAt||ts)<1400),intentAlive=!!activeCameraIntent(ts);
  if(centerGap>profile.centerEps||zoomGap>profile.zoomEps||bearingGap>profile.bearingEps||predicting||intentAlive)cameraMotionFrame=requestAnimationFrame(cameraMotionTick)
}
function stopCameraMotion(){if(cameraMotionFrame!==null){cancelAnimationFrame(cameraMotionFrame);cameraMotionFrame=null}if(navLaunchResumeTimer){clearTimeout(navLaunchResumeTimer);navLaunchResumeTimer=null}cameraTargetContext=null;cameraVisualState=null;cameraLastPaintAt=0}
function scheduleCamera(p,instant=false,progressInfo=null){if(window.__vanoNativeMapActive&&activeNav?.classList.contains('show'))return;
  if(!p||!map||!selectedRoute||!followMode||searchInteractionActive)return;const now=performance.now();lastCameraUpdateAt=now;cameraTargetContext={p:{...p},progressInfo:progressInfo?{...progressInfo}:nearestProgress(p),instant:!!instant,updatedAt:now};if(now<navLaunchAnimationUntil){if(navLaunchResumeTimer===null)navLaunchResumeTimer=setTimeout(()=>{navLaunchResumeTimer=null;if(cameraTargetContext&&cameraMotionFrame===null)cameraMotionFrame=requestAnimationFrame(cameraMotionTick)},Math.max(30,navLaunchAnimationUntil-now+20));return}if(instant)cameraVisualState=null;if(cameraMotionFrame===null)cameraMotionFrame=requestAnimationFrame(cameraMotionTick)
}
function markerEl(kind){
  const el=document.createElement('div');
  if(kind==='origin'){el.className='route-marker origin';el.innerHTML='<div class="shell"></div>';return el}
  el.className='route-marker destination';
  el.setAttribute('aria-label','Destino');
  el.innerHTML='<span class="arrival-visual"><span class="arrival-ground"></span><span class="arrival-bubble"><span class="arrival-ring"><span class="arrival-checkers"></span></span></span></span>';
  return el
}
const ALERT_ART_ASSETS={blitz:'/static/icons/vano/reports/report-police-v188.png',speed_camera:'/static/icons/vano/reports/report-radar-v188.png',road_block:'/static/icons/vano/reports/report-roadblock-v188.png',traffic:'/static/icons/vano/reports/report-traffic-v188.png'};
function alertArtAsset(category=''){return ALERT_ART_ASSETS[String(category||'').toLowerCase()]||''}
function alertVisualKind(category='other'){const x=String(category||'other').toLowerCase();if(x==='blitz')return'police';if(x==='speed_camera')return'radar';if(x==='road_block')return'block';if(['robbery','harassment'].includes(x))return'security';if(x==='poor_lighting')return'light';if(['road_hazard','pothole','object_on_road','stopped_vehicle'].includes(x))return'hazard';if(x==='broken_signal')return'signal';if(x==='construction')return'construction';if(x==='flood')return'flood';if(x==='crowd')return'crowd';if(x==='traffic')return'traffic';if(x==='accident')return'accident';return'generic'}
function alertGlyphSvg(kind='generic'){switch(kind){case'police':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><rect class="accent" x="9" y="15.2" width="10" height="3" rx="1.5"/><path class="accent" d="M10.3 15.4a3.8 3.8 0 0 1 7.4 0z"/><circle class="light" cx="14" cy="13.2" r="2.3"/><path class="stroke" d="M14 6.8v2.2M8.4 9.1l1.7 1.2M19.6 9.1l-1.7 1.2M7.2 13.2h2.2M18.6 13.2h2.2"/></svg>`;case'accident':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><path class="fg" d="M4.5 17.8h6.6l1.8-2.5-1.6-1.1H6.7z"/><path class="fg" d="M23.5 17.8h-6.6l-1.8-2.5 1.6-1.1h4.6z"/><circle class="stroke-fill" cx="8.3" cy="18.8" r="1.6"/><circle class="stroke-fill" cx="19.7" cy="18.8" r="1.6"/><path class="accent" d="m14 7.1 1.6 3 3.3.2-2.5 2 1 3.1-3.4-1.7-3.4 1.7 1-3.1-2.5-2 3.3-.2z"/></svg>`;case'traffic':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><path class="fg" d="M6 17.8h6.4l1.1-3H7.4z"/><path class="fg" d="M15.6 17.2h6.2l.9-2.4h-5.9z"/><path class="fg" d="M10.6 12.3h6.8l.9-2.3h-6.1z"/><circle class="stroke-fill" cx="9" cy="18.8" r="1.5"/><circle class="stroke-fill" cx="18.7" cy="18.2" r="1.4"/><circle class="stroke-fill" cx="14" cy="13.3" r="1.3"/></svg>`;case'block':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><rect class="fg" x="6" y="9" width="16" height="4.2" rx="1.4"/><rect class="fg" x="6" y="15.2" width="16" height="4.2" rx="1.4"/><path class="accent" d="M7 11.2h4.1v1.7H7zm5.2 0h4.2v1.7h-4.2zm5.3 0H21v1.7h-3.5zM7 17.4h4.1v1.7H7zm5.2 0h4.2v1.7h-4.2zm5.3 0H21v1.7h-3.5z"/><path class="stroke" d="M9 19.6v2M19 19.6v2"/></svg>`;case'hazard':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><path class="fg" d="M14 6.6 22 20.8H6z"/><rect class="accent" x="13" y="11" width="2" height="5.9" rx="1"/><circle class="accent" cx="14" cy="18.7" r="1.2"/></svg>`;case'signal':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><rect class="fg" x="10.2" y="6.5" width="7.6" height="13.2" rx="2.1"/><circle class="accent" cx="14" cy="10" r="1.5"/><circle class="light" cx="14" cy="13.1" r="1.5"/><circle class="accent" cx="14" cy="16.2" r="1.5"/><path class="stroke" d="M14 19.8v2.7"/></svg>`;case'construction':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><rect class="fg" x="6.4" y="14.6" width="15.2" height="3.8" rx="1.3"/><path class="accent" d="M7.4 15.8h4.2v1.5H7.4zm5.1 0h4.3v1.5h-4.3zm5.2 0h2.9v1.5h-2.9z"/><path class="fg" d="m12.2 13.1 1.9-5.1 1.9 5.1"/><path class="stroke" d="M9.4 18.5v2.2M18.6 18.5v2.2"/></svg>`;case'flood':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><path class="accent" d="M14 7.2c1.8 2 3 3.5 3 5.2a3 3 0 1 1-6 0c0-1.7 1.2-3.2 3-5.2Z"/><path class="stroke" d="M7.2 17.1c1.4 1 2.7 1 4.1 0s2.7-1 4.1 0 2.7 1 4.1 0M7.2 20.1c1.4 1 2.7 1 4.1 0s2.7-1 4.1 0 2.7 1 4.1 0"/></svg>`;case'crowd':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><circle class="fg" cx="14" cy="10.3" r="2.6"/><circle class="light" cx="8.6" cy="11.8" r="2.1"/><circle class="light" cx="19.4" cy="11.8" r="2.1"/><path class="accent" d="M8 20.4a3.5 3.5 0 0 1 3.5-3.1h5A3.5 3.5 0 0 1 20 20.4z"/><path class="stroke" d="M5.8 20.4a2.7 2.7 0 0 1 2.7-2.4M22.2 20.4a2.7 2.7 0 0 0-2.7-2.4"/></svg>`;case'security':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><path class="fg" d="M14 6.8 20 9v4.4c0 3.6-2.3 6.4-6 7.8-3.7-1.4-6-4.2-6-7.8V9z"/><path class="accent" d="m14 10.1 1.2 2.2 2.5.2-1.9 1.4.7 2.4-2.5-1.2-2.5 1.2.7-2.4-1.9-1.4 2.5-.2z"/></svg>`;case'light':return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><path class="fg" d="M11.4 11.4a2.6 2.6 0 1 1 5.2 0c0 1.1-.5 1.8-1 2.4-.5.6-.9 1.1-1 1.8h-1.2c-.1-.7-.5-1.2-1-1.8-.5-.6-1-1.3-1-2.4Z"/><rect class="accent" x="12.2" y="16.2" width="3.6" height="1.5" rx=".7"/><rect class="accent" x="12.4" y="18.1" width="3.2" height="1.4" rx=".7"/><path class="stroke" d="M14 7.2v1.5M9.1 9.1l1 1M18.9 9.1l-1 1M7.6 13h1.5M18.9 13h1.5"/></svg>`;default:return`<svg class="alert-icon-svg" viewBox="0 0 28 28" aria-hidden="true"><circle class="fg" cx="14" cy="14" r="7.6"/><rect class="accent" x="13" y="9.4" width="2" height="7" rx="1"/><circle class="accent" cx="14" cy="19" r="1.2"/></svg>`}}
function alertBadgeMarkup(kind='generic',compact=false,category=''){const size=compact?'quick-alert':'alert',art=alertArtAsset(category);if(art)return`<span class="${size}-art-shell"><img class="${size}-art-pin" src="${art}" alt="" draggable="false"></span>`;return`<span class="${size}-badge-shell"><span class="${size}-badge-ring"><span class="${size}-badge-face"><span class="${size}-badge-icon">${alertGlyphSvg(kind)}</span></span></span></span>`}
function hydrateQuickAlertBadges(root=document){root?.querySelectorAll?.('.quick-alert-badge[data-kind]:not([data-ready])')?.forEach?.(el=>{el.dataset.ready='1';el.innerHTML=alertBadgeMarkup(alertVisualKind(el.dataset.kind),true,el.dataset.kind)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>hydrateQuickAlertBadges(),{once:true});else hydrateQuickAlertBadges();
function alertFeature(a){return{type:'Feature',properties:{id:a.id,title:a.title,category_label:a.category_label||a.title||'Alerta',severity:a.severity,category:a.category||'other',confirmations:a.confirmations||0,absence_votes:a.absence_votes||0,confidence:a.confidence||0,created_at:a.created_at||'',description:a.description||''},geometry:{type:'Point',coordinates:[+a.lon,+a.lat]}}}
function alertRecordSignature(a){return`${a.id}:${a.category}:${(+a.lat).toFixed(6)}:${(+a.lon).toFixed(6)}:${a.confirmations||0}:${a.confidence||0}`}
const ALERT_CLIENT_GRACE_MS=120000;const alertClientSeenAt=new Map();
function clearAlertDomMarkers(){for(const item of alertDomMarkers.values())item?.marker?.remove?.();alertDomMarkers.clear()}
function setAlertVectorMarkerVisibility(useDom){['alerts-marker-halo','alerts-marker','alerts-marker-symbol'].forEach(id=>{try{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',useDom?'none':'visible')}catch{}})}
function createAlertDomMarker(a){
  const el=document.createElement('button');el.type='button';el.className='route-marker alert-marker';const kind=alertVisualKind(a.category),art=alertArtAsset(a.category);el.dataset.kind=kind;el.setAttribute('aria-label',a.category_label||a.title||'Alerta no mapa');el.title=a.category_label||a.title||'Alerta no mapa';el.innerHTML=art?`<span class="alert-premium-art"><img src="${art}" alt="" draggable="false"></span>`:`<span class="alert-visual"><span class="alert-ground"></span><span class="alert-bubble"><span class="alert-ring"><span class="alert-face"><span class="alert-icon">${alertGlyphSvg(kind)}</span></span></span></span></span>`;el.__vanoAlert=a;
  ['pointerdown','mousedown','touchstart'].forEach(evt=>el.addEventListener(evt,ev=>ev.stopPropagation(),{passive:true}));el.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();const current=el.__vanoAlert;if(current)showMapAlertPopup({features:[alertFeature(current)]})});
  const marker=new mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat([+a.lon,+a.lat]).addTo(map);return{marker,el,sig:alertRecordSignature(a)}
}
function syncAlertDomMarkers(items=lastAlertRecords){
  if(!map?.loaded()){clearAlertDomMarkers();return}
  const domMode=(map.getZoom()>=ALERT_DOM_MARKER_MIN_ZOOM)&&!!items?.length;setAlertVectorMarkerVisibility(domMode);if(!domMode){clearAlertDomMarkers();return}
  const visible=(items||[]).filter(a=>Number.isFinite(+a.lat)&&Number.isFinite(+a.lon)).slice(0,ALERT_DOM_MARKER_MAX),wanted=new Set(visible.map(a=>String(a.id)));
  for(const [id,item] of alertDomMarkers){if(!wanted.has(id)){item.marker?.remove?.();alertDomMarkers.delete(id)}}
  for(const a of visible){const id=String(a.id),sig=alertRecordSignature(a),prior=alertDomMarkers.get(id);if(!prior){alertDomMarkers.set(id,createAlertDomMarker(a));continue}prior.el.__vanoAlert=a;prior.marker?.setLngLat?.([+a.lon,+a.lat]);prior.el.setAttribute('aria-label',a.category_label||a.title||'Alerta no mapa');prior.el.title=a.category_label||a.title||'Alerta no mapa';if(prior.sig!==sig&&prior.el.dataset.kind!==alertVisualKind(a.category)){prior.marker?.remove?.();alertDomMarkers.set(id,createAlertDomMarker(a));continue}prior.sig=sig}
}
function toggleSafetyPulse(){safetyPulse=!safetyPulse;const layer=map?.getLayer('alerts-heat');if(layer)map.setLayoutProperty('alerts-heat','visibility',safetyPulse?'visible':'none');$('map')?.classList.toggle('safety-pulse-on',safetyPulse);if(safetyPulse){refreshAlerts();showToast('Safety Pulse ativo.')}else showToast('Safety Pulse ocultado.')}
function openSafetyDrawer(force=true){const box=$('safetyDrawer'),btn=$('safetyToolsBtn');if(!box)return;const show=force===null?!box.classList.contains('show'):!!force;box.classList.toggle('show',show);btn?.classList.toggle('safety-open',show);if(show&&window.lucide)lucide.createIcons()}
function supportPointFC(items){return{type:'FeatureCollection',features:(items||[]).map(x=>({type:'Feature',properties:{id:x.id,type:x.type,label:x.label,name:x.name,distance_m:x.distance_m},geometry:{type:'Point',coordinates:[x.lon,x.lat]}}))}}
function renderSupportPoints(){const list=$('supportList'),box=$('supportResults');$('supportCount').textContent=supportPoints.length?`${supportPoints.length} encontrados`:'nenhum';if(!supportPoints.length){list.innerHTML='<div style="color:#727b86;font-size:8px;padding:8px 2px">Nenhum ponto mapeado encontrado nesse raio.</div>';box.classList.add('show');return}list.innerHTML=supportPoints.map((x,i)=>`<button type="button" class="support-item" data-support-i="${i}"><span><b>${esc(x.name||x.label)}</b><span>${esc(x.label)}${x.opening_hours?' · horário mapeado':''}</span></span><strong>${fmtDistance(+x.distance_m||0)}</strong></button>`).join('');box.classList.add('show');list.querySelectorAll('[data-support-i]').forEach(btn=>btn.onclick=()=>{const x=supportPoints[+btn.dataset.supportI];if(!x)return;followMode=false;$('navRecenter').classList.remove('active');map.easeTo({center:[x.lon,x.lat],zoom:16.4,pitch:48,bearing:map.getBearing(),duration:650});new mapboxgl.Popup({closeButton:false,offset:12}).setLngLat([x.lon,x.lat]).setHTML(`<b>${esc(x.name||x.label)}</b><div style="color:#9299a5;font-size:9px;margin-top:4px">${esc(x.label)} · ${fmtDistance(+x.distance_m||0)}</div>`).addTo(map)})}
async function loadSupportPoints(){if(supportLoading)return;const p=lastNavPosition||userLocation;if(!p){showToast('Ative sua localização para buscar pontos de apoio.');return}supportLoading=true;$('supportResults').classList.add('show');$('supportList').innerHTML='<div style="padding:10px 2px;color:#7f8893;font-size:8px"><span class="loading"></span> Buscando dados mapeados próximos…</div>';try{const r=await fetch(`/api/support-points?lat=${encodeURIComponent(p.lat)}&lon=${encodeURIComponent(p.lon)}&radius=3500`),d=await r.json();if(!r.ok)throw new Error(d.error||'Falha na busca');supportPoints=d.items||[];if(map?.getSource('support-points'))map.getSource('support-points').setData(supportPointFC(supportPoints));renderSupportPoints();if(supportPoints.length)showToast(`${supportPoints.length} ponto(s) de apoio mapeado(s) próximo(s).`)}catch(e){supportPoints=[];renderSupportPoints();showToast('Não foi possível carregar pontos de apoio agora.')}finally{supportLoading=false}}
async function shareSafetyMessage(kind='checkin'){const p=lastNavPosition||userLocation;if(!p){showToast('Sua posição ainda não está disponível.');return}const mapsUrl=`https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;let text=kind==='sos'?'Preciso de ajuda. Esta é minha posição atual.':'Estou bem. Compartilhando minha posição atual.';if(destination?.label)text+=` Destino: ${destination.label}.`;if(liveShareUrl)text+=` Acompanhamento ao vivo: ${liveShareUrl}`;if(kind==='sos'&&LOGGED_IN){try{const r=await fetch('/api/sos',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({lat:p.lat,lon:p.lon,destination:destination?.label||''})}),d=await r.json();if(r.ok&&d.notified>0)showToast(`SOS enviado para ${d.notified} conta(s) vinculada(s).`)}catch(e){console.warn('[VANO MAPS:SOS notify]',e)}}try{if(navigator.share)await navigator.share({title:kind==='sos'?'Compartilhamento de emergência':'Check-in VANO MAPS',text,url:liveShareUrl||mapsUrl});else{await navigator.clipboard.writeText(`${text} ${liveShareUrl||mapsUrl}`);showToast(kind==='sos'?'Mensagem de emergência copiada.':'Check-in copiado.')}}catch(e){if(e?.name!=='AbortError')showToast('Não foi possível abrir o compartilhamento.')}}
function setPoint(kind,p,label,calculate=true){const x={...p,lat:+p.lat,lon:+p.lon,label:label||p.label||`${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}`};if(kind==='destination'){mapFollowMode=false;lastPassiveCameraAt=performance.now()}if(kind==='origin'){origin=x;originInput.value=x.label;updatePlannerOriginStatus(x.label);if(originMarker){originMarker.remove();originMarker=null}/* GPS origin uses the live user puck; avoid drawing a duplicate marker. */if(!x.is_gps)originMarker=new mapboxgl.Marker({element:markerEl('origin')}).setLngLat([x.lon,x.lat]).addTo(map)}else{destination=x;destinationConfirmed=false;if(!LOGGED_IN&&!guestTrialId)guestTrialId=makeGuestTrialId();destinationInput.value=x.label;if(destinationMarker)destinationMarker.remove();destinationMarker=new mapboxgl.Marker({element:markerEl('destination'),anchor:'bottom',offset:[0,0]}).setLngLat([x.display_lon??x.lon,x.display_lat??x.lat]).addTo(map);prefetchDestinationRoutes(x)}hideResults();if(kind==='destination'&&calculate){showDestinationConfirmation();return}if(calculate&&origin&&destination&&destinationConfirmed){fitEndpoints();calculateRoutes()}}
function showDestinationConfirmation(){if(!destination)return;routeController?.abort();routes=[];selectedRoute=null;routeState.style.display='none';$('destinationConfirmTitle').textContent=String(destination.name||destination.label||'Destino selecionado').split(',')[0];$('destinationConfirmAddress').textContent=destination.label||'Confira o ponto no mapa antes de continuar.';$('destinationConfirm').classList.add('show');planSheet.classList.add('hidden');map?.stop?.();try{map?.resize?.()}catch{}haptic(8)}
function editDestination(){destinationConfirmed=false;abortRoutePrefetches();if(!LOGGED_IN)guestTrialId='';$('destinationConfirm').classList.remove('show');planSheet.classList.remove('hidden');planSheet.classList.add('sheet-collapsed');if(destinationMarker){destinationMarker.remove();destinationMarker=null}destination=null;routes=[];selectedRoute=null;try{destinationInput.focus({preventScroll:true})}catch{destinationInput.focus()}destinationInput.select();lockIOSInputViewport(destinationInput);hideResults()}
async function confirmDestination(){if(!destination)return;destinationConfirmed=true;mapFollowMode=false;$('destinationConfirm').classList.remove('show');planSheet.classList.remove('hidden');if(!origin){await locateUser(true,{centerMap:false,keepFollow:false});if(!origin){showToast('Ainda estamos aguardando sua localização.');return}}fitEndpoints();await calculateRoutes();if(profile==='driving')loadParkingNearby(false)}
function parkingCacheKey(){return destination?`${(+destination.lat).toFixed(4)},${(+destination.lon).toFixed(4)}`:''}
function renderParkingNearby(){const box=$('parkingNearby'),list=$('parkingList');if(!box||!list)return;const shouldShow=destinationConfirmed&&profile==='driving';box.classList.toggle('show',shouldShow);if(!shouldShow)return;if(!activeParkingItems.length&&list.dataset.state!=='loading'){list.innerHTML='<div class="parking-empty">Nenhum estacionamento mapeado encontrado perto deste destino.</div>';return}if(activeParkingItems.length){list.innerHTML=activeParkingItems.map((x,i)=>`<button type="button" class="parking-item" data-parking-i="${i}"><span><b>${esc(x.name||'Estacionamento')}</b><span>${fmtDistance(+x.walk_distance_m||+x.distance_straight_m||0)} a pé${x.fee==='yes'?' · pago':x.fee==='no'?' · gratuito':''}</span></span><strong>${Math.max(1,+x.walk_minutes||1)} min a pé</strong></button>`).join('');list.querySelectorAll('[data-parking-i]').forEach(btn=>btn.onclick=()=>{const x=activeParkingItems[+btn.dataset.parkingI];if(!x)return;map.easeTo({center:[+x.lon,+x.lat],zoom:17,pitch:38,duration:480});new mapboxgl.Popup({closeButton:false,offset:14}).setLngLat([+x.lon,+x.lat]).setHTML(`<b>${esc(x.name||'Estacionamento')}</b><div style="margin-top:4px;color:#9098a2;font-size:9px">${Math.max(1,+x.walk_minutes||1)} min a pé do destino · ${esc(fmtDistance(+x.walk_distance_m||0))}</div>`).addTo(map)})}}
async function loadParkingNearby(force=false){if(!destinationConfirmed||!destination||profile!=='driving'){renderParkingNearby();return}const key=parkingCacheKey(),cached=parkingCache.get(key);if(!force&&cached&&Date.now()-cached.ts<10*60*1000){activeParkingItems=cached.items;renderParkingNearby();return}parkingController?.abort();parkingController=new AbortController();const list=$('parkingList');$('parkingNearby').classList.add('show');list.dataset.state='loading';list.innerHTML='<div class="parking-empty"><span class="loading"></span> Procurando estacionamentos próximos e calculando a caminhada…</div>';try{const q=new URLSearchParams({lat:destination.lat,lon:destination.lon,radius:2200}),r=await fetch('/api/parking-nearby?'+q,{signal:parkingController.signal}),d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao buscar estacionamentos');activeParkingItems=d.items||[];parkingCache.set(key,{ts:Date.now(),items:activeParkingItems});delete list.dataset.state;renderParkingNearby()}catch(e){if(e?.name==='AbortError')return;activeParkingItems=[];delete list.dataset.state;list.innerHTML='<div class="parking-empty">Não foi possível consultar estacionamentos agora.</div>'}}
function fitEndpoints(){if(!origin||!destination)return;const b=new mapboxgl.LngLatBounds();b.extend([origin.lon,origin.lat]);b.extend([destination.lon,destination.lat]);map.fitBounds(b,{padding:{top:215,bottom:315,left:36,right:36},maxZoom:15.5,duration:680})}
async function reverseLabel(lat,lon){try{const r=await fetch(`/api/reverse?lat=${lat}&lon=${lon}`),d=await r.json();return d.label||'Minha localização'}catch{return 'Minha localização'}}
async function locateUser(asOrigin=false,options={}){if(!navigator.geolocation){showPermission('Seu navegador não oferece geolocalização. Abra o VANO MAPS em um navegador com GPS.');return null}const centerMap=options.centerMap!==false,keepFollow=options.keepFollow!==false;if(keepFollow)mapFollowMode=true;startPassiveMapTracking();const cached=readLastGps();if(cached&&!userLocation){userLocation={lat:cached.lat,lon:cached.lon};lastPassivePosition={...cached};updateUserMarker(cached);if(centerMap)map.easeTo({center:[cached.lon,cached.lat],zoom:16,duration:180})}try{const g=await requestPosition(),raw=geoRaw(g),p=filterPosition(raw);saveLastGps(raw);userLocation={lat:p.lat,lon:p.lon};lastPassivePosition={...p};updateUserMarker(p);updateGpsQuality(raw.accuracy);hidePermission();const label=await reverseLabel(p.lat,p.lon);$('cityStatus').textContent=(label.split(',').slice(0,2).join(',')||'Perto de você').slice(0,45);if(asOrigin||!origin){setPoint('origin',{...p,is_gps:true},'Minha localização',false);origin.is_gps=true}if(centerMap)map.easeTo({center:[p.lon,p.lat],zoom:16.2,duration:220});else mapFollowMode=false;updateFloatingSpeedometer(Number.isFinite(raw.speed)?raw.speed*3.6:0);maybeSyncPresence(p);scheduleEnvironmentalRefresh(p,true);if(destinationConfirmed&&origin&&destination)calculateRoutes();return g}catch(e){if(cached){hidePermission();showToast('Usando sua última posição enquanto o GPS atualiza.');if(keepFollow)bootstrapGps(asOrigin);return null}showPermission(locationErrorMessage(e));return null}}
function syncSearchResultsPlacement(open=results?.classList.contains('show')){
  const app=$('wsApp'),home=document.querySelector('.planner-search-card');if(!results||!app||!home)return;
  const mobile=window.innerWidth<900;
  if(!open||!mobile){
    if(results.parentElement!==home)home.appendChild(results);
    results.classList.remove('search-results-portal');
    ['left','right','top','bottom','width','maxHeight'].forEach(k=>results.style.removeProperty(k));
    return;
  }
  const hr=home.getBoundingClientRect(),ar=app.getBoundingClientRect();
  if(results.parentElement!==app)app.appendChild(results);
  results.classList.add('search-results-portal');
  const available=Math.max(150,Math.min(window.innerHeight*.42,hr.top-ar.top-18));
  results.style.setProperty('left',`${Math.round(hr.left-ar.left)}px`,'important');
  results.style.setProperty('right','auto','important');
  results.style.setProperty('top','auto','important');
  results.style.setProperty('bottom',`${Math.round(ar.bottom-hr.top+7)}px`,'important');
  results.style.setProperty('width',`${Math.round(hr.width)}px`,'important');
  results.style.setProperty('max-height',`${Math.round(available)}px`,'important');
}
function setSearchOpen(open){document.getElementById('wsApp')?.classList.toggle('search-open',!!open);requestAnimationFrame(()=>syncSearchResultsPlacement(!!open))}
function hideResults(){results.classList.remove('show');results.innerHTML='';setSearchOpen(false)}
function searchResultParts(x){
  const label=String(x.label||'Local').trim(),parts=label.split(',').map(v=>v.trim()).filter(Boolean),primary=String(x.name||parts[0]||label).trim();
  let secondary=String(x.address||'').trim();
  if(!secondary||secondary.toLocaleLowerCase()===primary.toLocaleLowerCase())secondary=parts.filter((part,i)=>i>0&&part.toLocaleLowerCase()!==primary.toLocaleLowerCase()).join(', ');
  if(!secondary){const street=[x.street,x.address_number].filter(Boolean).join(', ');secondary=[street,x.postcode,x.country].filter(Boolean).join(' · ')||'Local'}
  return{primary,secondary};
}
function searchResultMeta(x){const t={poi:x.category||'Lugar',address:'Endereço',street:'Rua',postcode:'CEP',neighborhood:'Bairro',locality:'Localidade',place:'Cidade',district:'Região'}[x.type]||x.category||'Local',bits=[t];if(x.source==='osm-photon'||x.source==='osm-nominatim')bits.push('OpenStreetMap');if(x.source==='fr-geopf')bits.push('IGN/BAN');if(x.precision_label&&x.precision_label!==t)bits.push(x.precision_label);if(Number.isFinite(+x.distance_m)&&+x.distance_m>0)bits.push(+x.distance_m<1000?`${Math.round(+x.distance_m)} m de você`:`${(+x.distance_m/1000).toFixed(+x.distance_m<10000?1:0)} km de você`);if(x.postcode&&!String(x.address||x.label||'').includes(x.postcode))bits.push(x.postcode);return bits.filter(Boolean).join(' · ')}
function searchResultBadge(x){if(x.type==='poi')return'LOCAL';if(x.address_number_match==='matched'&&x.postcode_match==='matched')return'EXATO';if(x.match_confidence==='exact')return'EXATO';if(x.accuracy==='rooftop')return'PRECISO';if(x.accuracy==='interpolated')return'APROX.';if(x.source==='cep-authoritative')return'CEP';if(x.source==='cep-fallback')return'APROX.';if(x.type==='address')return'ENDEREÇO';return''}
function searchResultIcon(x){if(x.type==='street')return'signpost';if(x.type==='postcode')return'mail';if(x.type==='address')return'map-pin-check';const k=x.category_key||'';return({school:'school',bank:'landmark',hospital:'hospital',pharmacy:'pill',fuel:'fuel',food:'utensils',mall:'shopping-bag',shop:'shopping-basket',hotel:'hotel',park:'trees',public:'building-2',business:'building-2',building:'building'})[k]||'map-pin'}
function mapboxStaticStyleId(){const uri=(currentStyleUri||STYLE_SET?.day||STYLE||'').replace('mapbox://styles/','');return uri||'mapbox/streets-v12'}
function placeThumbUrl(x){const raw=x?.image_url||x?.photo_url||x?.photo||x?.thumbnail_url||'';return typeof raw==='string'&&/^https?:\/\//i.test(raw)?raw:''}
function placeStars(x){const rating=Number.isFinite(+x.rating)?+x.rating:Number.isFinite(+x.google_rating)?+x.google_rating:null;const reviews=Number.isFinite(+x.reviews_count)?Math.round(+x.reviews_count):null;if(rating==null)return'';return `<span>${'★'.repeat(Math.max(1,Math.min(5,Math.round(rating))))}</span><b>${rating.toFixed(1)}</b>${reviews?`<em>${reviews} avaliações</em>`:''}`}
function resultHtml(list,title='Melhores resultados'){
  const visible=(list||[]).slice(0,8);
  return `<div class="search-label"><span>${esc(title)}</span><em>${visible.length} ${visible.length===1?'resultado':'resultados'}</em></div>`+visible.map((x,i)=>{
    const p=searchResultParts(x),badge=searchResultBadge(x),thumb=placeThumbUrl(x),label=x.category||({address:'Endereço',street:'Rua',postcode:'CEP'}[x.type])||'Local',rating=placeStars(x),hasPhoto=!!thumb,visual=hasPhoto?`<span class="place-thumb" style="background-image:url('${esc(thumb)}')"><span class="place-thumb-badge">${esc(label)}</span></span>`:`<span class="result-icon ${esc(x.type||'poi')}"><i data-lucide="${searchResultIcon(x)}" width="18"></i></span>`;
    return `<button type="button" class="search-item rich ${hasPhoto?'has-photo':'no-photo'}" data-i="${i}">${visual}<span class="result-copy"><div class="result-topline"><b>${esc(p.primary)}</b></div><span class="result-address">${esc(p.secondary)}</span><small>${esc(searchResultMeta(x))}</small>${rating?`<span class="result-stars">${rating}</span>`:''}</span>${badge?`<span class="result-meta ${badge==='EXATO'||badge==='PRECISO'?'precise':''}">${esc(badge)}</span>`:''}</button>`;
  }).join('')
}
function stablePlaceFrame(lon,lat){if(!map||!Number.isFinite(+lon)||!Number.isFinite(+lat))return;map.stop();const zoom=Math.max(14.8,Math.min(17.2,map.getZoom?.()||15.4)),frame={center:[+lon,+lat],zoom,pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0}};const apply=()=>{try{map.resize();map.jumpTo(frame)}catch{}};apply();requestAnimationFrame(apply);setTimeout(apply,90)}
async function saveSearchPlace(x,button=null){
  if(!LOGGED_IN){location.href=LOGIN_URL;return}
  if(!x||!Number.isFinite(+(x.display_lat??x.lat))||!Number.isFinite(+(x.display_lon??x.lon)))return;
  const original=button?.innerHTML;if(button){button.disabled=true;button.textContent='Salvando…'}
  try{const r=await fetch('/api/saved-places',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({name:x.name||searchResultParts(x).primary,label:x.label||searchResultParts(x).secondary,lat:+(x.display_lat??x.lat),lon:+(x.display_lon??x.lon)})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível salvar.');searchSuggestionsCache=null;showToast('Destino salvo nos favoritos.');if(button){button.innerHTML='<span>★</span> Salvo';button.classList.add('saved')}}catch(e){showToast(e.message||'Não foi possível salvar.');if(button){button.disabled=false;button.innerHTML=original||'Salvar'}}}
function showSearchResultPopup(kind,x){if(!map||!x)return;mapFollowMode=false;lastPassiveCameraAt=performance.now();hideResults();searchController?.abort();const input=kind==='origin'?originInput:destinationInput;input?.blur?.();if(kind==='destination')prefetchDestinationRoutes(x);const p=searchResultParts(x),thumb=placeThumbUrl(x),rating=placeStars(x),lon=+(x.display_lon??x.lon),lat=+(x.display_lat??x.lat);stablePlaceFrame(lon,lat);window.__searchPreviewPopup?.remove?.();const imageHtml=thumb?`<div class="place-popup-image" style="background-image:url('${esc(thumb)}')"></div>`:'',ratingHtml=rating?`<div class="place-popup-rating">${rating}</div>`:'';const favoriteHtml=LOGGED_IN?'<button type="button" class="place-popup-save" id="savePreviewPlaceBtn"><span>☆</span> Salvar</button>':'';const popup=new mapboxgl.Popup({offset:13,closeButton:true,maxWidth:'268px'}).setLngLat([lon,lat]).setHTML(`<div class="place-popup ${thumb?'has-image':'no-image'}">${imageHtml}<h4>${esc(p.primary)}</h4><p>${esc(p.secondary)}</p>${ratingHtml}<span class="place-popup-meta">${esc(searchResultMeta(x))}</span><div class="place-popup-actions">${favoriteHtml}<button type="button" class="place-popup-use" id="usePreviewPlaceBtn">Usar destino</button></div></div>`).addTo(map);window.__searchPreviewPopup=popup;popup.on?.('close',()=>{if(window.__searchPreviewPopup===popup)window.__searchPreviewPopup=null});setTimeout(()=>{const btn=document.getElementById('usePreviewPlaceBtn');if(btn)btn.onclick=()=>{popup.remove();setPoint(kind,x,x.label);haptic(10)};const save=document.getElementById('savePreviewPlaceBtn');if(save)save.onclick=()=>saveSearchPlace(x,save)},20)}
function invalidateSelectedPoint(kind,input){const point=kind==='origin'?origin:destination;if(!point)return;const current=String(input.value||'').trim(),saved=String(point.label||'').trim();if(saved&&current!==saved){if(kind==='origin'){abortRoutePrefetches();origin=null;originMarker?.remove();originMarker=null}else{abortRoutePrefetches();destination=null;destinationConfirmed=false;$('destinationConfirm')?.classList.remove('show');destinationMarker?.remove();destinationMarker=null}routes=[];selectedRoute=null}}
function searchBias(kind){const center=map?.getCenter?.();return userLocation||(kind==='destination'?origin:destination)||(center?{lat:center.lat,lon:center.lng}:null)}
function clientSearchKey(q,bias){const n=String(q||'').trim().toLocaleLowerCase();return `${n}|${bias?`${(+bias.lat).toFixed(2)},${(+bias.lon).toFixed(2)}`:'global'}`}
function getClientSearch(q,bias){const key=clientSearchKey(q,bias),row=searchClientCache.get(key);if(!row)return null;if(Date.now()-row.ts>SEARCH_CLIENT_TTL){searchClientCache.delete(key);return null}return row.list}
function setClientSearch(q,bias,list){if(searchClientCache.size>80){const oldest=[...searchClientCache.entries()].sort((a,b)=>a[1].ts-b[1].ts).slice(0,20);oldest.forEach(([key])=>searchClientCache.delete(key))}searchClientCache.set(clientSearchKey(q,bias),{ts:Date.now(),list:(list||[]).map(x=>({...x}))})}
function fastMapboxFeature(feature){
  const props=feature?.properties||{},coords=props.coordinates||{},geometry=feature?.geometry||{},pair=Array.isArray(geometry.coordinates)?geometry.coordinates:[];
  let lon=Number(coords.longitude??pair[0]),lat=Number(coords.latitude??pair[1]);if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
  const context=props.context||{},addressCtx=context.address||{},streetCtx=context.street||{},postcode=String(context.postcode?.name||'').trim(),country=String(context.country?.name||'').trim();
  const addressNumber=String(addressCtx.address_number||'').trim(),street=String(addressCtx.street_name||streetCtx.name||'').trim(),type=String(props.feature_type||'place');
  const routable=Array.isArray(coords.routable_points)?coords.routable_points:[],def=routable.find(x=>String(x?.name||'').toLowerCase()==='default'),ent=routable.find(x=>String(x?.name||'').toLowerCase()==='entrance');
  const navLon=Number(def?.longitude??lon),navLat=Number(def?.latitude??lat),name=String(props.name_preferred||props.name||street||'Local').trim();
  let label=String(props.full_address||[name,props.place_formatted].filter(Boolean).join(', ')||name).trim();if(postcode&&!label.includes(postcode))label+=`${label?', ':''}${postcode}`;
  const accuracy=String(coords.accuracy||'point').toLowerCase(),match=props.match_code||{},category=type==='address'?'Endereço':type==='street'?'Rua':type==='postcode'?'CEP':'Local';
  return {label,name,address:String(props.full_address||props.place_formatted||label),category,category_key:type==='address'?'address':type==='street'?'street':'place',lat:navLat,lon:navLon,display_lat:lat,display_lon:lon,entrance_lat:Number.isFinite(Number(ent?.latitude))?Number(ent.latitude):null,entrance_lon:Number.isFinite(Number(ent?.longitude))?Number(ent.longitude):null,type,mapbox_id:props.mapbox_id||feature.id||'',postcode,country,address_number:addressNumber,street,accuracy,match_confidence:String(match.confidence||'').toLowerCase(),address_number_match:String(match.address_number||'').toLowerCase(),street_match:String(match.street||'').toLowerCase(),postcode_match:String(match.postcode||'').toLowerCase(),precision_label:accuracy==='rooftop'?'entrada/prédio':accuracy==='interpolated'?'número estimado':type==='postcode'?'CEP':type==='street'?'rua':'endereço',source:'mapbox-fast'};
}
function mergeSearchLists(primary=[],secondary=[]){
  const out=[],seen=new Set();for(const x of [...primary,...secondary]){if(!x||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon))continue;const key=x.mapbox_id||`${(+x.lat).toFixed(5)}:${(+x.lon).toFixed(5)}:${String(x.label||'').toLocaleLowerCase().slice(0,80)}`;if(seen.has(key))continue;seen.add(key);out.push(x)}return out.slice(0,8)
}
function paintSearchList(kind,list,title='Resultados'){
  if(!Array.isArray(list)||!list.length)return false;results.innerHTML=resultHtml(list,title);if(window.lucide)lucide.createIcons();results.querySelectorAll('.search-item').forEach(el=>el.onclick=()=>{const x=list[+el.dataset.i];showSearchResultPopup(kind,x);searchController?.abort();fastSearchController?.abort()});requestAnimationFrame(()=>syncSearchResultsPlacement(true));return true
}
async function loadSearchSuggestions(force=false){
  if(!LOGGED_IN)return[];const now=Date.now();if(!force&&searchSuggestionsCache&&now-searchSuggestionsAt<120000)return searchSuggestionsCache;try{const r=await fetch('/api/search-suggestions',{headers:{Accept:'application/json'}}),d=await r.json();if(!r.ok)throw new Error();searchSuggestionsCache=Array.isArray(d.items)?d.items:[];searchSuggestionsAt=now;return searchSuggestionsCache}catch{return searchSuggestionsCache||[]}}
function paintSearchSuggestions(kind='destination',items=[]){if(!items.length)return false;setSearchOpen(true);results.classList.add('show');const icon=k=>k==='home'?'house':k==='work'?'briefcase-business':k==='favorite'?'star':k==='smart'?'sparkles':'history',title=k=>k==='home'?'Casa':k==='work'?'Trabalho':k==='favorite'?'Favorito':k==='smart'?'Sugestão agora':'Recente';results.innerHTML=`<div class="search-label"><span>Seus destinos</span><em>${items.length}</em></div>`+items.slice(0,PRO_DRIVER?12:10).map((x,i)=>`<button type="button" class="search-suggestion ${x.kind==='favorite'?'favorite':''}" data-suggest-i="${i}"><span class="result-icon"><i data-lucide="${icon(x.kind)}" width="18"></i></span><span><b>${esc(title(x.kind))}${x.kind==='favorite'&&x.name?` · ${esc(x.name)}`:''}</b><small>${esc(x.label)}</small></span><i data-lucide="chevron-right" width="15"></i></button>`).join('');if(window.lucide)lucide.createIcons();results.querySelectorAll('[data-suggest-i]').forEach(btn=>btn.onclick=()=>{const x=items[+btn.dataset.suggestI];if(!x)return;const input=kind==='origin'?originInput:destinationInput;input.value=x.label;if(Number.isFinite(+x.lat)&&Number.isFinite(+x.lon)&&['recent','favorite','smart'].includes(x.kind)){setPoint(kind,{lat:+x.lat,lon:+x.lon,label:x.label,name:x.name||String(x.label).split(',')[0],type:'saved'},x.label);hideResults()}else searchPlaces(x.label,kind)});requestAnimationFrame(()=>syncSearchResultsPlacement(true));return true}
async function showSavedSearchSuggestions(kind='destination'){const items=await loadSearchSuggestions(false);if(items.length)paintSearchSuggestions(kind,items)}
function clientSearchIntent(q){
  const raw=String(q||'').trim(),compact=raw.replace(/\D/g,''),cep=/(?:^|\s)(?:CEP\s*)?\d{5}[-.\s]?\d{3}(?:\s|$)/i.test(raw),street=/^\s*(?:rua|r\.?|avenida|av\.?|alameda|travessa|estrada|rodovia|street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|rue|route|calle|carrer)\b/i.test(raw),number=/(?:,|\bn(?:º|°|o|\.)?|#)\s*\d{1,6}[A-Za-z]?\s*$/i.test(raw);
  if(cep)return compact.length>=8?'cep':'address';
  if(street&&number)return'address';
  if(street)return'street';
  if(number)return'address';
  return'place';
}
async function fastGlobalAddressSearch(q,bias,signal){
  if(!TOKEN||q.length<SEARCH_FAST_MIN)return[];const params=new URLSearchParams({q,access_token:TOKEN,autocomplete:'true',limit:'8',language:String(BOOT.locale||'pt-BR').split('-',1)[0].toLowerCase(),types:'address,street,postcode,place,locality,neighborhood,district,region,country'});const explicitGeo=/\b(?:france|fran[cç]a|russia|r[uú]ssia|россия|brazil|brasil|portugal|spain|espanha|italy|italia|germany|alemanha|united kingdom|reino unido)\b/i.test(q)||/,\s*[^,0-9]{2,48}$/u.test(q);if(bias&&!explicitGeo&&Number.isFinite(+bias.lon)&&Number.isFinite(+bias.lat))params.set('proximity',`${(+bias.lon).toFixed(6)},${(+bias.lat).toFixed(6)}`);
  const r=await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,{signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Mapbox ${r.status}`);const d=await r.json();return (d.features||[]).map(fastMapboxFeature).filter(Boolean).slice(0,8)
}
function queueSearch(input,kind){
  clearTimeout(searchTimer);clearTimeout(searchRefineTimer);activeSearchKind=kind;invalidateSelectedPoint(kind,input);const q=input.value.trim();if(q.length<SEARCH_FAST_MIN){searchController?.abort();fastSearchController?.abort();hideResults();return}const intent=clientSearchIntent(q),delay=intent==='cep'?35:(q.length>=4?SEARCH_FAST_DELAY:110);searchTimer=setTimeout(()=>searchPlaces(q,kind),delay)
}
async function searchPlaces(q,kind){
  q=String(q||'').trim();if(q.length<SEARCH_FAST_MIN){hideResults();return}
  const searchStarted=performance.now(),requestId=++searchRequestId,bias=searchBias(kind),intent=clientSearchIntent(q),cached=getClientSearch(q,bias);searchController?.abort();fastSearchController?.abort();clearTimeout(searchRefineTimer);activeSearchKind=kind;setSearchOpen(true);results.classList.add('show');requestAnimationFrame(()=>syncSearchResultsPlacement(true));
  if(cached){paintSearchList(kind,cached,'Melhores resultados');productTelemetry('search',`results:${intent}:${cached.length}:cache`,'search');productTelemetry('performance',`search-latency:${Math.round(performance.now()-searchStarted)}ms:cache`,'search');return}
  const loadingLabel=intent==='place'?'Buscando local…':intent==='cep'?'Consultando CEP…':'Buscando endereço…';
  results.innerHTML=`<div class="search-loading"><span class="search-loading-pin"></span><span><b>${loadingLabel}</b><small>Priorizando exatamente o que você digitou</small></span></div>`;

  // The instant client-side Geocoding call is useful only for streets/addresses.
  // CEP and named places wait for the intent-aware backend so an unrelated nearby
  // commerce/locality never flashes above the exact result.
  const allowFast=intent==='street'||intent==='address';
  let fastList=[],fastError=null,fastTask=Promise.resolve([]);
  if(allowFast){
    fastSearchController=new AbortController();
    fastTask=fastGlobalAddressSearch(q,bias,fastSearchController.signal).then(list=>{if(requestId!==searchRequestId)return[];fastList=list;if(list.length)paintSearchList(kind,list,'Sugestões de endereço');return list}).catch(e=>{if(e?.name!=='AbortError')fastError=e;return[]});
  }
  if(q.length<3){await fastTask;if(requestId===searchRequestId&&!fastList.length&&fastError)results.innerHTML='<div class="search-message"><b>Continue digitando</b><span>Digite mais um caractere para refinar a busca.</span></div>';return}
  await new Promise(resolve=>{searchRefineTimer=setTimeout(resolve,intent==='cep'?20:SEARCH_REFINE_DELAY)});if(requestId!==searchRequestId)return;
  searchController=new AbortController();const p=new URLSearchParams({q});if(bias){p.set('proximity_lat',bias.lat);p.set('proximity_lon',bias.lon)}
  try{
    const {r,d}=await vanoFetchJSON('/api/geocode?'+p,{signal:searchController.signal,headers:{Accept:'application/json'}},12000);if(requestId!==searchRequestId)return;if(!r.ok)throw new Error(d.detail||d.error||'Falha na busca');await fastTask;
    const backend=(d.results||[]).slice(0,10),list=intent==='place'||intent==='cep'?backend:mergeSearchLists(backend,fastList);
    if(!list.length){productTelemetry('search',`no-results:${intent}`,'search');productTelemetry('performance',`search-latency:${Math.round(performance.now()-searchStarted)}ms:no-results`,'search');results.innerHTML='<div class="search-message"><b>Nenhum resultado encontrado</b><span>Tente CEP, rua + número ou o nome exato do local.</span></div>';return}
    setClientSearch(q,bias,list);paintSearchList(kind,list,'Melhores resultados');productTelemetry('search',`results:${intent}:${list.length}`,'search');productTelemetry('performance',`search-latency:${Math.round(performance.now()-searchStarted)}ms`,'search');
  }catch(e){
    if(e?.name==='AbortError')return;if(requestId!==searchRequestId)return;await fastTask;if(fastList.length){setClientSearch(q,bias,fastList);paintSearchList(kind,fastList,'Sugestões de endereço');return}results.innerHTML=`<div class="search-message"><b>Busca indisponível agora</b><span>${esc(e.message)}</span></div>`
  }
}


const VANO_MAP_ICONS={destination:'destination.svg',traffic:'traffic.svg',signal:'traffic-signal.svg',stop:'stop-sign.svg',yield:'yield-sign.svg',roadsign:'road-sign.svg',radar:'speed-camera.svg',alertAccident:'alert-accident-premium-v166.png',alertTraffic:'/static/icons/vano/reports/report-traffic-v188.png',alertBlock:'/static/icons/vano/reports/report-roadblock-v188.png',alertRadar:'/static/icons/vano/reports/report-radar-v188.png',alertHazard:'alert-hazard.svg',alertPothole:'alert-pothole-v167.svg',alertStoppedVehicle:'alert-stopped-vehicle-v167.svg',alertObjectRoad:'alert-object-road-v167.svg',alertBrokenSignal:'alert-broken-signal-v167.svg',alertFlood:'alert-flood.svg',alertConstruction:'alert-construction.svg',alertCrowd:'alert-crowd.svg',alertRobbery:'alert-robbery-premium-v166.png',alertPolice:'/static/icons/vano/reports/report-police-v188.png',alertSecurity:'alert-security.svg',alertLight:'alert-light.svg',alertGeneric:'alert-generic.svg'};
function loadSparkSvg(name,file){return new Promise(resolve=>{if(map.hasImage(name)){resolve();return}const img=new Image();img.onload=()=>{try{if(!map.hasImage(name))map.addImage(name,img,{pixelRatio:name==='vano-signal'?1.55:2})}catch{}resolve()};img.onerror=()=>resolve();img.src=String(file||'').startsWith('/')?file:'/static/icons/vano/'+file})}
async function registerSparkMapIcons(){await Promise.all(Object.entries(VANO_MAP_ICONS).map(([name,file])=>loadSparkSvg('vano-'+name,file)))}
function roadControlIconExpr(){return ['match',['get','type'],'speed_camera','vano-radar','traffic_signal','vano-signal','stop_sign','vano-stop','yield_sign','vano-yield','traffic_sign','vano-roadsign','vano-signal']}
function alertIconExpr(){return ['match',['get','category'],'robbery','vano-alertRobbery','harassment','vano-alertSecurity','poor_lighting','vano-alertLight','accident','vano-alertAccident','traffic','vano-alertTraffic','road_block','vano-alertBlock','blitz','vano-alertPolice','speed_camera','vano-alertRadar','road_hazard','vano-alertHazard','pothole','vano-alertPothole','stopped_vehicle','vano-alertStoppedVehicle','object_on_road','vano-alertObjectRoad','broken_signal','vano-alertBrokenSignal','flood','vano-alertFlood','construction','vano-alertConstruction','crowd','vano-alertCrowd','vano-alertGeneric']}

let lastPresenceSyncAt=0,lastNearbyFetchAt=0,nearbyController=null,lastNearbyDriversCount=0;
function nearbyDriverFC(items){return{type:'FeatureCollection',features:(items||[]).map(x=>({type:'Feature',properties:{id:x.id,label:x.label||'Motorista próximo'},geometry:{type:'Point',coordinates:[+x.lon,+x.lat]}}))}}
async function refreshNearbyDrivers(force=false){if(!LOGGED_IN||!userLocation||!map?.getSource('nearby-drivers'))return;const now=Date.now();if(!force&&now-lastNearbyFetchAt<30000)return;lastNearbyFetchAt=now;nearbyController?.abort();nearbyController=new AbortController();try{const q=new URLSearchParams({lat:userLocation.lat,lon:userLocation.lon}),r=await fetch('/api/nearby-drivers?'+q,{signal:nearbyController.signal}),d=await r.json();if(r.ok){const realDrivers=d.drivers||[];lastNearbyDriversCount=realDrivers.length;map.getSource('nearby-drivers').setData(nearbyDriverFC(realDrivers))}}catch(e){if(e?.name!=='AbortError')console.debug('[VANO MAPS:presence]',e)}}

async function maybeSyncPresence(p){if(!LOGGED_IN||!p)return;const now=Date.now();if(PRESENCE_ACTIVE&&now-lastPresenceSyncAt>40000){lastPresenceSyncAt=now;fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({lat:p.lat,lon:p.lon})}).catch(()=>{})}refreshNearbyDrivers(false)}
const BOOT_GPS=readLastGps();
function ensureGeoSource(id){if(!map.getSource(id))map.addSource(id,{type:'geojson',data:emptyFC()})}
function ensureLayer(layer,before){if(map.getLayer(layer.id))return;try{map.addLayer(layer,before&&map.getLayer(before)?before:undefined)}catch(e){console.debug('[VANO MAPS:layer]',layer.id,e)}}
const TRAFFIC_RADIUS_M=3000;
let trafficSnapshotTimer=null,trafficPulseTimer=null,trafficPulseState=false,lastTrafficSnapshotAt=0,lastTrafficSnapshotCenter=null,lastTrafficSnapshotZoom=null;
function trafficAnchor(){const p=userLocation||BOOT_GPS;return p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)?{lat:+p.lat,lon:+p.lon}:null}
function trafficBucketOf(props={}){if(String(props.closed||'').toLowerCase()==='yes')return'severe';const c=String(props.congestion||'').toLowerCase();return['moderate','heavy','severe'].includes(c)?c:null}
function trafficLineParts(geometry){if(!geometry)return[];if(geometry.type==='LineString')return[geometry.coordinates||[]];if(geometry.type==='MultiLineString')return geometry.coordinates||[];return[]}
function trafficPointVisible(c,anchor,b){if(!Array.isArray(c)||c.length<2)return false;const x=+c[0],y=+c[1];if(!Number.isFinite(x)||!Number.isFinite(y)||hav([anchor.lon,anchor.lat],[x,y])>TRAFFIC_RADIUS_M)return false;return x>=b.getWest()&&x<=b.getEast()&&y>=b.getSouth()&&y<=b.getNorth()}
function clipTrafficCoords(coords,anchor,b){const out=[];let cur=[];for(const c of coords||[]){if(trafficPointVisible(c,anchor,b)){cur.push([+c[0],+c[1]])}else{if(cur.length>1)out.push(cur);cur=[]}}if(cur.length>1)out.push(cur);return out}
function refreshVisibleTraffic(){if(!map?.getSource('vano-traffic-visible'))return;if(activeNav?.classList.contains('show')){window.__sparkVisibleTraffic=[];map.getSource('vano-traffic-visible').setData(emptyFC());map.getSource('vano-traffic-hotspots')?.setData(emptyFC());return}const anchor=trafficAnchor();if(!anchor||!mapPrefs.liveSignals){window.__sparkVisibleTraffic=[];map.getSource('vano-traffic-visible').setData(emptyFC());map.getSource('vano-traffic-hotspots')?.setData(emptyFC());return}let raw=[];try{raw=map.querySourceFeatures('vano-mapbox-traffic',{sourceLayer:'traffic'})||[]}catch(e){console.debug('[VANO MAPS:traffic-query]',e);return}const b=map.getBounds(),features=[],seen=new Set();for(const f of raw){const bucket=trafficBucketOf(f.properties||{});if(!bucket)continue;for(const line of trafficLineParts(f.geometry)){for(const part of clipTrafficCoords(line,anchor,b)){const a=part[0],z=part[part.length-1],key=`${bucket}:${a[0].toFixed(5)}:${a[1].toFixed(5)}:${z[0].toFixed(5)}:${z[1].toFixed(5)}:${part.length}`;if(seen.has(key))continue;seen.add(key);features.push({type:'Feature',properties:{bucket,congestion:String(f.properties?.congestion||bucket),closed:String(f.properties?.closed||'')},geometry:{type:'LineString',coordinates:part}})}}}const visible=features.slice(0,520);window.__sparkVisibleTraffic=visible;map.getSource('vano-traffic-visible').setData({type:'FeatureCollection',features:visible});if(map.getSource('vano-traffic-hotspots'))map.getSource('vano-traffic-hotspots').setData(trafficHotspotFC(visible))}
function trafficSnapshotNeedsRefresh(force=false){if(force||!map)return true;const now=Date.now(),c=map.getCenter?.(),z=map.getZoom?.();if(!c||!Number.isFinite(+z)||!lastTrafficSnapshotCenter)return true;if(now-lastTrafficSnapshotAt>12000)return true;if(Math.abs(+z-(+lastTrafficSnapshotZoom||+z))>.34)return true;return hav([lastTrafficSnapshotCenter.lon,lastTrafficSnapshotCenter.lat],[c.lng,c.lat])>130}
function rememberTrafficSnapshot(){const c=map?.getCenter?.();if(!c)return;lastTrafficSnapshotAt=Date.now();lastTrafficSnapshotCenter={lat:c.lat,lon:c.lng};lastTrafficSnapshotZoom=map.getZoom?.()||0}
function scheduleTrafficSnapshot(force=false){if(!force&&!trafficSnapshotNeedsRefresh(false))return;if(trafficSnapshotTimer&&!force)return;if(force&&trafficSnapshotTimer){clearTimeout(trafficSnapshotTimer);trafficSnapshotTimer=null}trafficSnapshotTimer=setTimeout(()=>{trafficSnapshotTimer=null;refreshVisibleTraffic();rememberTrafficSnapshot()},force?45:(performanceTier==='eco'?420:performanceTier==='normal'?320:240))}
function startTrafficPulse(){clearInterval(trafficPulseTimer);trafficPulseTimer=null;try{if(map?.getLayer('vano-traffic-core'))map.setPaintProperty('vano-traffic-core','line-opacity',.08);if(map?.getLayer('vano-traffic-glow'))map.setPaintProperty('vano-traffic-glow','line-opacity',.08);if(map?.getLayer('traffic-route-core'))map.setPaintProperty('traffic-route-core','line-opacity',.06)}catch{}}

function animatedRouteFlowGradient(phase=0,{base=MAP_ACCENT.primary||'#F59A62',accent=MAP_ACCENT.light||'#FFC39B',pulse='#F3FCFF',segments=7,pulseWidth=.085}={}){
  const wrap=v=>((v%1)+1)%1,stops=[[0,base],[1,base]],span=1/Math.max(3,segments),w=Math.max(.035,Math.min(.14,pulseWidth));
  for(let i=-1;i<segments+2;i++){
    const center=i*span+phase,a=center-w*.95,b=center-w*.42,c=center,d=center+w*.36,e=center+w*.96;
    [[a,base],[b,accent],[c,pulse],[d,accent],[e,base]].forEach(([pos,color])=>{if(pos>=0&&pos<=1)stops.push([pos,color]);else if(pos<0||pos>1){const alt=wrap(pos);if(alt>=0&&alt<=1)stops.push([alt,color]);}})
  }
  stops.sort((x,y)=>x[0]-y[0]);const clean=[];
  for(const [rawPos,color] of stops){let pos=Math.max(0,Math.min(1,rawPos));if(clean.length&&pos<=clean.at(-1)[0])pos=Math.min(1,clean.at(-1)[0]+.00001);clean.push([pos,color]);}
  if(clean[0]?.[0]!==0)clean.unshift([0,base]);if(clean.at(-1)?.[0]!==1)clean.push([1,base]);
  return ['interpolate',['linear'],['line-progress'],...clean.flat()]
}
function syncNavigationThemePaint(){
  if(!map)return;const black=(document.documentElement.dataset.vanoTheme==='black');
  try{
    if(map.getLayer('nav-route-casing'))map.setPaintProperty('nav-route-casing','line-color',black?'rgba(9,9,10,.78)':'rgba(255,255,255,.98)');
    if(map.getLayer('nav-route-casing'))map.setPaintProperty('nav-route-casing','line-opacity',black?.92:.84);
    if(map.getLayer('route-progress'))map.setPaintProperty('route-progress','line-color',black?'#1b1b1e':'#f6f7f9');
  }catch(e){console.debug('[VANO MAPS:theme-paint]',e)}
}
function updateAnimatedRoutePaint(force=false){
  if(!map?.loaded?.()||REDUCED_MOTION)return;
  const now=performance.now(),batterySave=document.documentElement.classList.contains('vano-battery-save'),paintGap=(batterySave||performanceTier==='eco')?1000:(performanceTier==='normal'||LOW_POWER_DEVICE)?420:260;if(!force&&now-lastRouteFlowPaintAt<paintGap)return;lastRouteFlowPaintAt=now;
  const planPhase=(now*0.00018)%1,navPhase=(now*0.00024)%1;
  try{
    if(map.getLayer('route-selected-flow'))map.setPaintProperty('route-selected-flow','line-gradient',animatedRouteFlowGradient(planPhase,{base:'#F59A62',accent:'#FFC39B',pulse:'#FFF6EE',segments:7,pulseWidth:.09}));
    if(map.getLayer('nav-route-flow'))map.setPaintProperty('nav-route-flow','line-gradient',animatedRouteFlowGradient(navPhase,{base:'#F59A62',accent:'#D9703F',pulse:'#FFFFFF',segments:8,pulseWidth:.072}));
    if(map.getLayer('nav-route-glow'))map.setPaintProperty('nav-route-glow','line-opacity',.10+((Math.sin(now/420)+1)*.028));
    if(map.getLayer('route-selected-glow'))map.setPaintProperty('route-selected-glow','line-opacity',.16+((Math.sin(now/530)+1)*.025));
    if(map.getLayer('alerts-marker-halo')){map.setPaintProperty('alerts-marker-halo','circle-opacity',.10+((Math.sin(now/430)+1)*.055));map.setPaintProperty('alerts-marker-halo','circle-radius',['interpolate',['linear'],['zoom'],10.5,10+((Math.sin(now/430)+1)*1.5),16,16+((Math.sin(now/430)+1)*2.2)])}
  }catch(e){console.debug('[VANO MAPS:route-flow]',e)}
}
function routeFlowDelay(){if(document.visibilityState==='hidden'||searchInteractionActive||(!selectedRoute&&!activeNav?.classList.contains('show')))return 1200;if(performanceTier==='eco')return 1000;if(performanceTier==='normal')return activeNav?.classList.contains('show')?520:420;return activeNav?.classList.contains('show')?300:260}
function startRouteFlowAnimation(){
  if(REDUCED_MOTION||routeFlowFrame!==null)return;const tick=()=>{routeFlowFrame=null;if(document.visibilityState!=='hidden'&&(selectedRoute||activeNav?.classList.contains('show')))updateAnimatedRoutePaint(false);routeFlowFrame=setTimeout(tick,routeFlowDelay())};routeFlowFrame=setTimeout(tick,80)
}
function stopRouteFlowAnimation(){if(routeFlowFrame!==null){clearTimeout(routeFlowFrame);routeFlowFrame=null}}

function trafficFeatureLength(f){const c=f?.geometry?.coordinates||[];let m=0;for(let i=1;i<c.length;i++)m+=hav(c[i-1],c[i]);return m}
function trafficHotspotFC(features=[]){const ranked=features.filter(f=>['heavy','severe'].includes(f.properties?.bucket)).map(f=>({f,len:trafficFeatureLength(f)})).sort((a,b)=>((b.f.properties?.bucket==='severe'?2:1)*b.len)-((a.f.properties?.bucket==='severe'?2:1)*a.len)).slice(0,14);return{type:'FeatureCollection',features:ranked.map(({f,len},i)=>{const c=f.geometry.coordinates||[],mid=c[Math.floor(c.length/2)]||c[0];return{type:'Feature',properties:{bucket:f.properties.bucket,label:f.properties.bucket==='severe'?'Trânsito muito intenso':'Trânsito intenso',length_m:Math.round(len),i},geometry:{type:'Point',coordinates:mid}}})}}
async function installRuntimeLayers(){
  await registerSparkMapIcons();
  const routeBefore=(map.getStyle()?.layers||[]).find(l=>l.type==='symbol'&&l.layout?.['text-field'])?.id;
  ensureGeoSource('route-alternatives');
  ensureLayer({id:'route-alternatives',type:'line',source:'route-alternatives',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#8a919a','line-width':['interpolate',['linear'],['zoom'],10,2.4,16,3.8,19,4.5],'line-opacity':.36}},routeBefore);
  if(!map.getSource('routes'))map.addSource('routes',{type:'geojson',lineMetrics:true,data:emptyFC()});
  ensureLayer({id:'route-shadow',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,.98)','line-width':['interpolate',['linear'],['zoom'],10,8.2,12,10.5,14,13.1,16,16.4,18,20.0,20,24.0],'line-opacity':.54}},routeBefore);
  ensureLayer({id:'route-selected-glow',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F59A62','line-width':['interpolate',['linear'],['zoom'],10,9.5,12,12.8,14,15.8,16,19.4,18,23.2,20,27.0],'line-opacity':.18,'line-blur':1.15}},routeBefore);
  ensureLayer({id:'route-selected',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':MAP_ACCENT.primary||'#F59A62','line-width':['interpolate',['linear'],['zoom'],10,5.3,12,6.9,14,8.9,16,11.3,18,14.5,20,17.2],'line-opacity':1}},routeBefore);
  ensureLayer({id:'route-selected-flow',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-gradient':animatedRouteFlowGradient(0,{base:'#F59A62',accent:'#FFC39B',pulse:'#FFF6EE',segments:7,pulseWidth:.09}),'line-width':['interpolate',['linear'],['zoom'],10,2.0,12,2.8,14,3.6,16,4.5,18,5.2,20,6.0],'line-opacity':.95}},routeBefore);
  if(!map.getSource('nav-route'))map.addSource('nav-route',{type:'geojson',lineMetrics:true,data:emptyFC()});
  ensureLayer({id:'nav-route-glow',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':MAP_ACCENT.primary||'#F59A62','line-width':['interpolate',['linear'],['zoom'],10,10.8,12,13.8,14,17.0,16,21.0,18,25.0,20,30.0],'line-opacity':.10,'line-blur':1.0}},routeBefore);
  ensureLayer({id:'nav-route-casing',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,.98)','line-width':['interpolate',['linear'],['zoom'],10,8.4,12,10.5,14,13.0,16,16.2,18,19.2,20,23.2],'line-opacity':.84}},routeBefore);
  ensureLayer({id:'nav-route-core',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-gradient':['interpolate',['linear'],['line-progress'],0,MAP_ACCENT.light||'#FFC39B',1,MAP_ACCENT.primary||'#F59A62'],'line-width':['interpolate',['linear'],['zoom'],10,5.9,12,7.6,14,9.4,16,12.0,18,15.0,20,18.5],'line-opacity':1}},routeBefore);
  ensureLayer({id:'nav-route-flow',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-gradient':animatedRouteFlowGradient(0,{base:'#F59A62',accent:'#D9703F',pulse:'#FFFFFF',segments:8,pulseWidth:.072}),'line-width':['interpolate',['linear'],['zoom'],10,2.2,12,3.0,14,3.8,16,4.8,18,5.8,20,6.8],'line-opacity':.94}},routeBefore);
  ensureGeoSource('nav-turn');
  ensureLayer({id:'nav-turn-glow',type:'line',source:'nav-turn',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFC39B','line-width':['interpolate',['linear'],['zoom'],12,10,16,16,20,22],'line-opacity':.18,'line-blur':1.2}},routeBefore);
  ensureLayer({id:'nav-turn-core',type:'line',source:'nav-turn',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFBF2','line-width':['interpolate',['linear'],['zoom'],12,3.0,16,4.6,20,6.2],'line-opacity':.96}},routeBefore);
  ensureGeoSource('route-progress');
  ensureLayer({id:'route-progress',type:'line',source:'route-progress',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f6f7f9','line-width':['interpolate',['linear'],['zoom'],10,5.6,12,7.2,14,9.0,16,11.6,18,14.6,20,18.0],'line-opacity':.72}},routeBefore);
  if(!map.getSource('alerts'))map.addSource('alerts',{type:'geojson',data:emptyFC(),cluster:true,clusterRadius:48,clusterMaxZoom:14});
  const unclustered=['!', ['has','point_count']];
  ensureLayer({id:'alerts-heat',type:'heatmap',source:'alerts',filter:unclustered,maxzoom:16,layout:{visibility:safetyPulse?'visible':'none'},paint:{'heatmap-weight':['interpolate',['linear'],['get','severity'],1,.18,5,1],'heatmap-intensity':['interpolate',['linear'],['zoom'],9,.55,15,1.45],'heatmap-radius':['interpolate',['linear'],['zoom'],9,15,15,46],'heatmap-opacity':['interpolate',['linear'],['zoom'],9,.40,16,.12]}});
  ensureLayer({id:'alerts-cluster',type:'circle',source:'alerts',filter:['has','point_count'],maxzoom:14.5,paint:{'circle-radius':['step',['get','point_count'],18,4,22,8,26,16,30],'circle-color':['step',['get','point_count'],'#2d3140',4,'#D9703F',8,'#ea580c',16,'#dc2626'],'circle-stroke-color':'rgba(255,255,255,.94)','circle-stroke-width':2,'circle-opacity':.96}},routeBefore);
  ensureLayer({id:'alerts-cluster-count',type:'symbol',source:'alerts',filter:['has','point_count'],maxzoom:14.5,layout:{'text-field':['get','point_count_abbreviated'],'text-size':11,'text-font':['Open Sans Bold','Arial Unicode MS Bold'],'text-allow-overlap':true},paint:{'text-color':'#ffffff'}},routeBefore);
  ensureLayer({id:'alerts-marker-halo',type:'circle',source:'alerts',filter:unclustered,minzoom:10.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],10.5,10,16,16],'circle-color':['match',['get','category'],'robbery','#ff3348','harassment','#D9703F','poor_lighting','#68758A','accident','#ff653d','traffic','#ee8a35','road_block','#ff3348','blitz','#ff8a2b','speed_camera','#ff9b32','road_hazard','#d47732','pothole','#d47732','stopped_vehicle','#e3903d','object_on_road','#e3903d','broken_signal','#ffb13b','flood','#4587d9','construction','#e09a37','crowd','#D9703F','#7d8290'],'circle-opacity':.14,'circle-blur':.48}},routeBefore);
  ensureLayer({id:'alerts-marker',type:'circle',source:'alerts',filter:unclustered,minzoom:10.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],10.5,15,13,18,16,22,18,25],'circle-color':'#ffffff','circle-opacity':.01,'circle-stroke-width':0}},routeBefore);
  ensureLayer({id:'alerts-marker-symbol',type:'symbol',source:'alerts',filter:unclustered,minzoom:10.8,layout:{'icon-image':alertIconExpr(),'icon-size':['interpolate',['linear'],['zoom'],10.8,.38,13,.47,16,.60,18,.69],'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport'}},routeBefore);
  ensureGeoSource('support-points');
  ensureGeoSource('road-controls');
  ensureLayer({id:'road-controls-pulse',type:'circle',source:'road-controls',minzoom:13.8,layout:{'circle-pitch-alignment':'viewport'},paint:{'circle-radius':8,'circle-color':['match',['get','type'],'speed_camera','#ef4444','traffic_signal','#ffb13b','stop_sign','#ff6166','yield_sign','#ff8b43','traffic_sign','#6db9ff','#ff9a45'],'circle-opacity':.13,'circle-blur':.58}});
  ensureLayer({id:'road-controls-dot',type:'symbol',source:'road-controls',minzoom:13.8,layout:{'icon-image':roadControlIconExpr(),'icon-size':['interpolate',['linear'],['zoom'],13.4,.48,15.5,.60,18,.74],'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['match',['get','type'],'traffic_signal',10,5],'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport'}});
  ensureGeoSource('nearby-drivers');
  ensureLayer({id:'nearby-drivers',type:'circle',source:'nearby-drivers',minzoom:13,paint:{'circle-radius':['interpolate',['linear'],['zoom'],13,4.5,17,6.5],'circle-color':'#ff7a2d','circle-stroke-color':'#ffffff','circle-stroke-width':2,'circle-opacity':.88}});
  // V25 — viewport traffic ribbon. The provider vector tiles still do the
  // heavy lifting, but only currently loaded streets inside 3 km of the user's
  // position are copied into a GeoJSON ribbon. This prevents painting an entire
  // city and lets us use rounded full-road widths + glow without extra REST calls.
  if(!map.getSource('vano-mapbox-traffic')){try{map.addSource('vano-mapbox-traffic',{type:'vector',url:'mapbox://mapbox.mapbox-traffic-v1'})}catch(e){console.debug('[VANO MAPS:traffic-source]',e)}}
  const trafficBefore=(map.getStyle()?.layers||[]).find(l=>l.type==='symbol'&&l.layout?.['text-field'])?.id;
  ensureLayer({id:'vano-traffic-probe',type:'line',source:'vano-mapbox-traffic','source-layer':'traffic',minzoom:9.5,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':1,'line-opacity':.001}},trafficBefore);
  if(!map.getSource('vano-traffic-visible'))map.addSource('vano-traffic-visible',{type:'geojson',lineMetrics:true,data:emptyFC()});
  if(!map.getSource('vano-traffic-hotspots'))map.addSource('vano-traffic-hotspots',{type:'geojson',data:emptyFC()});
  ensureLayer({id:'vano-traffic-hotspot-glow',type:'circle',source:'vano-traffic-hotspots',minzoom:12,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,9,16,15,19,20],'circle-color':['match',['get','bucket'],'severe','#ff3526','#ff8a00'],'circle-opacity':.10,'circle-blur':.45}},trafficBefore);
  ensureLayer({id:'vano-traffic-hotspot-dot',type:'circle',source:'vano-traffic-hotspots',minzoom:12,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,2.8,16,4.5,19,6],'circle-color':['match',['get','bucket'],'severe','#ff3b2f','#ff8a00'],'circle-stroke-color':'rgba(255,255,255,.82)','circle-stroke-width':1.2,'circle-opacity':.9}},trafficBefore);
  const trafficColor=['match',['get','bucket'],'severe','#ff584f','heavy','#ff9a3e','moderate','#e8c95b','#e58b45'];
  ensureLayer({id:'vano-traffic-glow',type:'line',source:'vano-traffic-visible',minzoom:10,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,5.4,13,7.4,16,10.0,19,12.8],'line-color':trafficColor,'line-opacity':.065,'line-blur':1.2}},trafficBefore);
  ensureLayer({id:'vano-traffic-flow',type:'line',source:'vano-traffic-visible',minzoom:10,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,3.6,13,5.0,16,6.9,19,9.1],'line-color':trafficColor,'line-opacity':['match',['get','bucket'],'severe',.84,'heavy',.80,'moderate',.74,.66],'line-blur':0}},trafficBefore);
  ensureLayer({id:'vano-traffic-core',type:'line',source:'vano-traffic-visible',minzoom:11.2,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],11.2,.4,16,.72,19,1.0],'line-color':['match',['get','bucket'],'severe','#ffb0a8','heavy','#ffd19a','moderate','#fff1a0','#ffd19a'],'line-opacity':.09,'line-blur':.04}},trafficBefore);
  ensureGeoSource('traffic-live-segments');
  ensureLayer({id:'traffic-route-glow',type:'line',source:'traffic-live-segments',minzoom:10,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,5.2,16,7.8,19,10.0],'line-color':['match',['get','bucket'],'severe','#ff1f18','heavy','#ff7a00','moderate','#ffd400','free','#52BFA9','#52BFA9'],'line-opacity':.06,'line-blur':1.1}});
  ensureLayer({id:'traffic-live-segments',type:'line',source:'traffic-live-segments',minzoom:10,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,3.5,16,5.4,19,7.2],'line-color':['match',['get','bucket'],'severe','#ff1f18','heavy','#ff7a00','moderate','#ffd400','free','#52BFA9','#52BFA9'],'line-opacity':.80,'line-blur':0}});
  ensureLayer({id:'traffic-route-core',type:'line',source:'traffic-live-segments',minzoom:11,layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],11,.4,16,.7,19,1.0],'line-color':['match',['get','bucket'],'severe','#ffd0cc','heavy','#ffe0bd','moderate','#fff4ad','free','#ffb77e','#ffb77e'],'line-opacity':.07,'line-blur':.03}});
  try{for(const id of ['traffic-route-glow','traffic-live-segments','traffic-route-core']){if(map.getLayer(id)){const before=map.getLayer('road-controls-pulse')?'road-controls-pulse':(map.getLayer('road-controls-dot')?'road-controls-dot':undefined);map.moveLayer(id,before)}}}catch{}
  startTrafficPulse();scheduleTrafficSnapshot(true);startSignalPulse();
}
function startSignalPulse(){
  clearInterval(signalPulseTimer);signalPulseTimer=null;
  if(!map?.getLayer('road-controls-pulse'))return;
  try{map.setPaintProperty('road-controls-pulse','circle-radius',8);map.setPaintProperty('road-controls-pulse','circle-opacity',.10)}catch{}
}
function navRouteGradient(startAlong=0){
  const base='#F59A62',remaining=Math.max(1,routeTotalGeometry-(+startAlong||0)),segs=(isMotorizedProfile()?(selectedRoute?.traffic_segments||[]):[]).filter(x=>Number.isFinite(+x.distance_start_m)&&Number.isFinite(+x.distance_end_m)&&(+x.distance_end_m||0)>=startAlong);
  if(!segs.length||!routeTotalGeometry)return ['interpolate',['linear'],['line-progress'],0,'#FFC39B',.55,'#F59A62',1,'#D9703F'];
  const color=x=>x==='severe'?'#ff5a4f':x==='heavy'?'#f99a45':x==='moderate'?'#e6c760':base,stops=[[0,base],[1,base]];
  for(const x of segs){const a=Math.max(0,Math.min(1,((+x.distance_start_m||0)-startAlong)/remaining)),b=Math.max(a,Math.min(1,((+x.distance_end_m||0)-startAlong)/remaining)),c=color(x.bucket||x.level),fade=.003;stops.push([Math.max(0,a-fade),base],[a,c],[b,c],[Math.min(1,b+fade),base])}
  stops.sort((a,b)=>a[0]-b[0]);const clean=[];for(const st of stops){let pos=st[0];if(clean.length&&pos<=clean.at(-1)[0])pos=Math.min(1,clean.at(-1)[0]+.00001);if(pos<=1)clean.push([pos,st[1]])}if(clean.at(-1)?.[0]<1)clean.push([1,base]);return ['interpolate',['linear'],['line-progress'],...clean.flat()]
}
function setNavRouteData(startAlong=null){
  if(window.__vanoNativeMapActive&&activeNav?.classList.contains('show'))return;
  if(!map?.getSource('nav-route'))return;if(!selectedRoute?.geometry){map.getSource('nav-route').setData(emptyFC());return}if(!routeCumulative.length)buildMetrics();
  const start=Number.isFinite(+startAlong)?Math.max(0,+startAlong):(lastNavPosition?Math.max(0,nearestProgress(lastNavPosition).distanceAlong):0),geometry=remainingNavGeometry(start)||selectedRoute.geometry;
  map.getSource('nav-route').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{active:true,start_m:start},geometry}]});
  try{if(map.getLayer('nav-route-core'))map.setPaintProperty('nav-route-core','line-gradient',navRouteGradient(start))}catch(e){console.debug('[VANO MAPS:nav-gradient]',e)}
  updateAnimatedRoutePaint(true);
}
function navigationLayerIds(){return ['vano-traffic-probe','vano-traffic-glow','vano-traffic-flow','vano-traffic-core','vano-traffic-hotspot-glow','vano-traffic-hotspot-dot','traffic-route-glow','traffic-live-segments','traffic-route-core','route-alternatives','route-shadow','route-selected-glow','route-selected','route-selected-flow','route-progress','nav-route-glow','nav-route-casing','nav-route-core','nav-route-flow','nav-turn-glow','nav-turn-core']}
function setNavigationRouteFocus(active){
  const routePlan=['route-shadow','route-selected-glow','route-selected','route-selected-flow','route-progress'],routeTraffic=['traffic-route-glow','traffic-live-segments','traffic-route-core'],mapTraffic=['vano-traffic-probe','vano-traffic-glow','vano-traffic-flow','vano-traffic-core','vano-traffic-hotspot-glow','vano-traffic-hotspot-dot'];
  routePlan.forEach(id=>setLayerVisibility(id,!active));setLayerVisibility('route-alternatives',true);routeTraffic.forEach(id=>setLayerVisibility(id,!active));mapTraffic.forEach(id=>setLayerVisibility(id,!active&&!!mapPrefs.liveSignals));['nav-route-glow','nav-route-casing','nav-route-core'].forEach(id=>setLayerVisibility(id,active));
  if(active){map.getSource('route-alternatives')?.setData(navAlternativeFC());map.getSource('route-progress')?.setData(emptyFC());map.getSource('traffic-live-segments')?.setData(emptyFC());map.getSource('vano-traffic-visible')?.setData(emptyFC());map.getSource('vano-traffic-hotspots')?.setData(emptyFC());setNavRouteData();refreshNavigationAlternatives(true)}else{map.getSource('nav-route')?.setData(emptyFC());map.getSource('nav-turn')?.setData(emptyFC());document.body.classList.remove('nav-alt-visible');$('navAltHint')?.classList.remove('show')}
}
function syncImmersiveButton(){
  const b=$('navImmersiveToggle'),active=navCameraMode==='perspective';navExperienceMode=active?'immersive':'normal';document.body.classList.toggle('nav-immersive',active&&!!activeNav?.classList.contains('show'));if(!b)return;
  b.classList.toggle('immersive-active',active);b.title=active?'Câmera 3D ativa':'Câmera 2D ativa';b.setAttribute('aria-label',b.title);b.innerHTML=active?'<i data-lucide="scan" width="18"></i>':'<i data-lucide="map" width="18"></i>';if(window.lucide)lucide.createIcons();
}
function setNavigationExperience(mode,{recenter=true,announce=true}={}){
  const immersive=mode==='immersive'||mode==='perspective'||mode==='3d';navExperienceMode=immersive?'immersive':'normal';navCameraMode=immersive?'perspective':'top';followMode=true;markCameraIntent(immersive?'toggle-3d':'toggle-2d',940);lastCameraBearing=immersive?lastCameraBearing:0;syncNavCameraButton();syncFollowButton();syncImmersiveButton();if(recenter&&lastNavPosition)scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition));if(announce)showToast(immersive?'Visualização 3D ativada.':'Visualização 2D ativada.')
}
function toggleImmersiveCamera(){calibrateNavigation()}
function setNavControlDrawer(open){
  const stack=$('navControlStack'),drawer=$('navControlDrawer'),toggle=$('navDrawerToggle');if(!stack||!drawer||!toggle)return;
  const show=!!open&&!!activeNav?.classList.contains('show');stack.classList.toggle('drawer-open',show);drawer.setAttribute('aria-hidden',String(!show));toggle.setAttribute('aria-expanded',String(show));toggle.setAttribute('aria-label',show?'Fechar controles':'Mostrar mais controles');toggle.title=show?'Fechar controles':'Mais controles';toggle.innerHTML=show?'<i data-lucide="chevron-down" width="18"></i>':'<i data-lucide="chevron-up" width="18"></i>';if(window.lucide)lucide.createIcons();
}
function toggleNavControlDrawer(){setNavControlDrawer(!$('navControlStack')?.classList.contains('drawer-open'));haptic(5)}
function navDrawerAction(fn){return()=>{setNavControlDrawer(false);return fn?.()}}
function chooseNavigationCamera(){return Promise.resolve('immersive')}
function resolveNavigationCameraChoice(){const resolve=pendingCameraChoiceResolve;pendingCameraChoiceResolve=null;if(resolve)resolve('immersive')}
function syncNavCameraButton(){const top=navCameraMode==='top',title=top?'Ativar visualização 3D':'Voltar para visualização 2D',icon=top?'<i data-lucide="box" width="18"></i>':'<i data-lucide="map" width="18"></i>';['navCameraToggle','focusModeBtn'].forEach(id=>{const b=$(id);if(!b)return;b.classList.toggle('active',!top);b.title=title;b.setAttribute('aria-label',title);b.innerHTML=icon});if(window.lucide)lucide.createIcons()}
function syncFollowButton(){const b=$('navFollowToggle');if(!b)return;b.classList.toggle('active',followMode);b.title=followMode?'Seguindo usuário · tocar para câmera livre':'Câmera livre · tocar para seguir';b.setAttribute('aria-label',b.title);b.innerHTML=followMode?'<i data-lucide="navigation" width="18"></i>':'<i data-lucide="move" width="18"></i>';if(window.lucide)lucide.createIcons()}
function setNavigationFollow(enabled,recenter=true){followMode=!!enabled;if(!followMode)stopCameraMotion();else if(recenter)markCameraIntent('follow',960);syncFollowButton();document.body.classList.toggle('nav-map-free',!followMode&&!!activeNav?.classList.contains('show'));if(followMode&&recenter&&lastNavPosition)scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition))}
function toggleNavigationFollow(){setNavigationFollow(!followMode,true);showToast(followMode?'Câmera seguindo o trajeto.':'Câmera livre. Toque no ícone de navegação para seguir novamente.')}
function animateCalibrationButton(){
  const ids=['navDrawerRecenter','recenterBtn'];
  ids.forEach(id=>$(id)?.classList.add('calibrating'));
  if(cameraCalibrationTimer)clearTimeout(cameraCalibrationTimer);
  cameraCalibrationTimer=setTimeout(()=>{ids.forEach(id=>$(id)?.classList.remove('calibrating'));cameraCalibrationTimer=null},1180);
}
function calibrateNavigation(){
  if(!lastNavPosition||!selectedRoute){locateUser(true);return}
  const now=performance.now();followMode=true;mapFollowMode=true;navCameraMode='perspective';markCameraIntent('recenter',1560);cameraCalibrationStartedAt=now;cameraCalibrationUntil=now+1180;navStartupBearing=null;navStartupBearingUntil=0;
  const m=nearestProgress(lastNavPosition),routeHome=routeBearingAtDistance(Math.max(0,(+m.distanceAlong||0)-1.5),64);
  if(Number.isFinite(routeHome)){lastCameraBearing=routeHome;lastRoutePuckBearing=routeHome}
  try{const c=map.getCenter(),pad=map.getPadding?.()||{};cameraVisualState={center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),padding:{top:+pad.top||0,bottom:+pad.bottom||0,left:+pad.left||0,right:+pad.right||0}}}catch{cameraVisualState=null}
  syncNavCameraButton();syncFollowButton();document.body.classList.remove('nav-map-free');animateCalibrationButton();
  scheduleCamera(lastNavPosition,false,m);haptic(8);setTimeout(()=>haptic(4),120);showToast('Câmera recalibrada.');
}
function syncSoundButton(){const b=$('soundBtn');if(!b)return;b.classList.toggle('active',!!soundEnabled);b.setAttribute('aria-label',soundEnabled?'Desativar orientações por voz':'Ativar orientações por voz');b.title=soundEnabled?'Áudio ligado · segure para trocar a voz':'Áudio desligado · segure para trocar a voz';b.innerHTML=soundEnabled?'<i data-lucide="volume-2" width="19"></i>':'<i data-lucide="volume-x" width="19"></i>';if(window.lucide)lucide.createIcons()}
function populateVoiceSelectors(){for(const id of ['voiceSelect','navVoiceSelect']){const s=$(id);if(!s)continue;s.innerHTML='<option value="">Automática</option><option value="vano">Vano Maps</option>';s.value=selectedVoiceName==='vano'?'vano':''}}
function getVanoAudio(){if(!vanoAudio){vanoAudio=new Audio();vanoAudio.preload='auto';vanoAudio.playsInline=true}return vanoAudio}
function stopVanoVoice(){vanoAudioGeneration++;if(vanoAudio){try{vanoAudio.pause();vanoAudio.currentTime=0}catch{}}}
function unlockVanoVoice(){try{const a=getVanoAudio();a.src=vanoUrl(VANO_ASSETS.sigaFrente);a.volume=0;const p=a.play();if(p?.then)p.then(()=>{try{a.pause();a.currentTime=0;a.volume=1}catch{}}).catch(()=>{a.volume=1})}catch{}}
function warmVanoVoice(){if(vanoWarmStarted)return;vanoWarmStarted=true;const files=[VANO_ASSETS.sigaFrente,VANO_ASSETS.vireDireita,VANO_ASSETS.chegou,VANO_ASSETS.em200];const work=()=>files.forEach(f=>{try{fetch(vanoUrl(f),{cache:'force-cache',credentials:'same-origin',priority:'low'}).catch(()=>{})}catch{}});if('requestIdleCallback'in window)requestIdleCallback(work,{timeout:1800});else setTimeout(work,500)}
function saveInstructionVoice(name){selectedVoiceName=String(name||'')==='vano'?'vano':'';try{localStorage.setItem(VOICE_PREF_KEY,selectedVoiceName)}catch{};for(const id of ['voiceSelect','navVoiceSelect']){const s=$(id);if(s&&s.value!==selectedVoiceName)s.value=selectedVoiceName}if(selectedVoiceName==='vano'){unlockVanoVoice();warmVanoVoice()}else stopVanoVoice();showToast(selectedVoiceName==='vano'?'Voz Vano Maps ativada.':'Voz automática ativada.')}
function toggleVoicePopover(force=null){const box=$('navVoicePopover');if(!box)return;const show=force===null?!box.classList.contains('show'):!!force;box.classList.toggle('show',show);if(show){populateVoiceSelectors();setTimeout(()=>$('navVoiceSelect')?.focus({preventScroll:true}),20)}}
function navMinutesLabel(seconds){const s=Math.max(0,+seconds||0);if(s<60)return'<1 min';return`${Math.max(1,Math.ceil(s/60))} min`}
function navKmLabel(meters){const km=Math.max(0,+meters||0)/1000;if(km<.1)return'<0,1 km';const value=km<10?km.toFixed(1):Math.round(km).toString();return`${String(value).replace('.',',')} km`}
function updateNavSummary(etaSeconds,remainingMeters,step){const mins=$('remainingMinutes'),km=$('remainingKm'),next=$('nextDistance');if(mins)mins.textContent=navMinutesLabel(etaSeconds);if(km)km.textContent=navKmLabel(remainingMeters);if(next){const d=Math.max(0,+step?.remainingInStep||0);next.textContent=d<18?'agora':fmtDistance(d)}syncPremiumRouteCards()}
async function returnToDestinationSearch(){await finishTrip(false);destinationConfirmed=false;if(!LOGGED_IN)guestTrialId='';destination=null;routes=[];selectedRoute=null;manualRouteSelection=false;if(destinationMarker){destinationMarker.remove();destinationMarker=null}try{map.getSource('routes')?.setData(emptyFC());map.getSource('route-alternatives')?.setData(emptyFC());map.getSource('nav-route')?.setData(emptyFC());map.getSource('traffic-live-segments')?.setData(emptyFC())}catch{}routeState.style.display='none';welcomeState.style.display='block';destinationInput.value='';planSheet.classList.remove('hidden','sheet-dragging');planSheet.classList.add('sheet-collapsed');planSheet.style.transform='';hideResults();requestAnimationFrame(()=>{syncFloatingLocate();destinationInput.focus({preventScroll:true});hideResults()})}
function restoreRuntimeMapState(){
  try{
    if(selectedRoute?.geometry&&map.getSource('routes'))map.getSource('routes').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:selectedRoute.geometry}]});
    map.getSource('route-alternatives')?.setData(alternativeRoutesFC());
    map.getSource('route-progress')?.setData(emptyFC());
    updateTrafficSegmentLayer();updateRoadLayer();
    if(supportPoints?.length&&map.getSource('support-points'))map.getSource('support-points').setData(supportPointFC(supportPoints));
    applyMapPrefs();scheduleTrafficSnapshot(true);
    setNavigationRouteFocus(!!activeNav?.classList.contains('show'));
    refreshAlerts();
    setTimeout(()=>{scheduleSignalRefresh(true);refreshNearbyDrivers(true)},120);
    if(activeNav?.classList.contains('show')&&lastNavPosition)setTimeout(()=>scheduleCamera(lastNavPosition,true),180);
  }catch(e){console.debug('[VANO MAPS:restore-style]',e)}
}
function moodFromConditions(weather){
  if(mapThemeOverride==='night'||mapThemeOverride==='day')return mapThemeOverride;
  const manualMode=(window.VANOTheme?.getMode?.()||document.documentElement.dataset.vanoThemeMode||'light');
  const manualBlack=manualMode==='black'||document.documentElement.dataset.vanoTheme==='black';
  // Explicit Black mode always wins and uses the dedicated VANO Black Mapbox style.
  if(manualBlack)return'black';
  if(MAP_STYLE_MODE!=='auto')return ['day','afternoon','night','rain'].includes(MAP_STYLE_MODE)?MAP_STYLE_MODE:'day';
  const h=new Date().getHours();
  const reactiveNight=REACTIVE_BLACK_ALLOWED && (h>=19||h<7);
  if(reactiveNight)return 'night';
  if(weather?.rainy)return 'rain';
  if(weather?.is_day===0||h>=18||h<6)return 'night';
  if(h>=12&&h<18)return 'afternoon';
  return 'day';
}
function moodLabel(mood){return mood==='black'?'BLACK':mood==='rain'?'CHUVA':mood==='night'?'NOITE':mood==='afternoon'?'TARDE':'DIA'}
const styleJsonCache=new Map();
function styleApiUrl(uri){if(!TOKEN||typeof uri!=='string'||!uri.startsWith('mapbox://styles/'))return'';const id=uri.slice('mapbox://styles/'.length);return `https://api.mapbox.com/styles/v1/${id}?access_token=${encodeURIComponent(TOKEN)}`}
async function prefetchMapStyle(uri){if(!uri||styleJsonCache.has(uri))return;const url=styleApiUrl(uri);if(!url)return;try{const r=await fetch(url,{cache:'force-cache'});if(r.ok){const json=await r.json();styleJsonCache.set(uri,json)}}catch{}}
function setMapStyleFast(uri,hard=false){if(!map||!uri)return;const cached=styleJsonCache.get(uri);try{map.setStyle(cached?structuredClone(cached):uri,{diff:!hard})}catch(e){try{map.setStyle(uri,{diff:!hard})}catch{} }if(!cached)prefetchMapStyle(uri)}
function updateWeatherPill(weather){const v=$('weatherPillValue'),pill=$('weatherPill');if(!v||!pill)return;const temp=weather&&Number.isFinite(+weather.temperature_c)?Math.round(+weather.temperature_c):null;v.textContent=temp!=null?`${temp}°`:'--°';pill.title=temp!=null?`${temp}°C agora`:'Clima indisponível'}
function resolveVehicleSpeedKmh(raw,p){
  const now=Number.isFinite(+raw?.ts)?+raw.ts:Date.now(),acc=Math.max(1,Number.isFinite(+raw?.accuracy)?+raw.accuracy:999),rawMps=Number.isFinite(+raw?.speed)?Math.max(0,+raw.speed):null;
  let derivedMps=null,moveMeters=0,dt=0,hadPrevious=!!navSpeedFix;
  if(navSpeedFix&&Number.isFinite(+navSpeedFix.ts)&&now>navSpeedFix.ts){dt=Math.max(.25,Math.min(5,(now-navSpeedFix.ts)/1000));moveMeters=hav([navSpeedFix.lon,navSpeedFix.lat],[raw.lon,raw.lat]);const plausibleStep=Math.max(2.5,Math.min(55,Math.max(acc,navSpeedFix.accuracy||acc)*1.15));if(Number.isFinite(moveMeters)&&moveMeters<=Math.max(220,plausibleStep*14))derivedMps=moveMeters/dt}
  navSpeedFix={lat:+raw.lat,lon:+raw.lon,accuracy:acc,ts:now};
  const idleRadius=Math.max(4.5,Math.min(11.0,acc*.30)),meaningfulMove=!hadPrevious||moveMeters>idleRadius,rawConsistent=!hadPrevious||rawMps==null||rawMps<.8||meaningfulMove||dt<.55;
  const rawReliable=rawMps!=null&&rawMps<75&&acc<=100&&rawConsistent;
  const derivedReliable=derivedMps!=null&&acc<=45&&dt>=.55&&moveMeters>idleRadius&&moveMeters<70;
  const stationary=hadPrevious&&!meaningfulMove&&(rawMps==null||rawMps<1.2||!rawReliable)&&(!derivedReliable||derivedMps<1.15);
  if(stationary){stableNavSpeedKmh*=.35;if(stableNavSpeedKmh<1.4)stableNavSpeedKmh=0;return 0}
  let targetMps=0;if(rawReliable&&derivedReliable&&rawMps>=.7)targetMps=rawMps*.82+derivedMps*.18;else if(rawReliable&&rawMps>=.8)targetMps=rawMps;else if(derivedReliable&&derivedMps>=1.0)targetMps=derivedMps;else if(rawReliable&&rawMps>=.5)targetMps=rawMps;else{stableNavSpeedKmh*=.45;if(stableNavSpeedKmh<1.4)stableNavSpeedKmh=0;return stableNavSpeedKmh}
  let targetKmh=Math.max(0,targetMps*3.6);if(targetKmh<4.5)targetKmh=0;if(targetKmh>0)lastSpeedMotionAt=now;if(targetKmh===0&&now-lastSpeedMotionAt<800)return stableNavSpeedKmh;const alpha=targetKmh>=stableNavSpeedKmh?.32:.24;stableNavSpeedKmh=stableNavSpeedKmh+(targetKmh-stableNavSpeedKmh)*alpha;if(stableNavSpeedKmh<1.6)stableNavSpeedKmh=0;return stableNavSpeedKmh
}

function updateFloatingSpeedometer(kmh){
  const box=$('vanoSpeedometerV220'),value=$('vanoSpeedValueV220');
  if(!box||!value)return;
  const n=Number.isFinite(+kmh)&&+kmh>0?Math.max(0,Math.round(+kmh)):0;
  lastDisplayedSpeedKmh=n;
  const limit=Number.isFinite(+currentMappedSpeedLimitKmh)&&+currentMappedSpeedLimitKmh>0?Math.round(+currentMappedSpeedLimitKmh):null;
  value.textContent=String(n);
  box.classList.toggle('over-limit',!!limit&&n>limit);
  box.setAttribute('aria-label',`Velocidade atual: ${n} quilômetros por hora`);
  box.title=limit?`${n} km/h · limite ${limit} km/h`:`${n} km/h`;
}
function applyMoodStyle(weather,announce=false){
  const mood=moodFromConditions(weather),uri=mapStyleForMood(mood);
  currentMapMood=mood;document.body.dataset.mood=(mood==='night'||mood==='black')?'night':'day';updateWeatherPill(weather||window.__sparkWeatherState||null);
  if(!uri||uri===currentStyleUri||!map||navigator.onLine===false)return;
  styleSwitching=true;currentStyleUri=uri;
  const fade=$('mapMoodFade'),hint=$('roadMoodHint');fade?.classList.add('active');
  if(announce&&hint){hint.textContent=`MAPA ${moodLabel(mood)}`;hint.classList.add('show');clearTimeout(hint._t);hint._t=setTimeout(()=>hint.classList.remove('show'),1900)}
  try{setMapStyleFast(uri,mood==='black')}catch(e){styleSwitching=false;fade?.classList.remove('active');console.warn('[VANO MAPS:style]',e)}
}
async function refreshEnvironmentalStyle(force=false){
  const p=userLocation||BOOT_GPS;const now=Date.now();
  if(!p){applyMoodStyle(null,false);return}
  if(!force&&now-lastWeatherFetchAt<180000&&lastWeatherPos&&hav([p.lon,p.lat],[lastWeatherPos.lon,lastWeatherPos.lat])<1800){applyMoodStyle(window.__sparkWeatherState||null,false);return}
  lastWeatherFetchAt=now;lastWeatherPos={lat:+p.lat,lon:+p.lon};weatherController?.abort();weatherController=new AbortController();
  try{
    const q=new URLSearchParams({lat:p.lat,lon:p.lon}),r=await fetch('/api/weather-now?'+q,{signal:weatherController.signal}),d=await r.json();
    let weather=(r.ok&&Number.isFinite(+d.temperature_c))?d:null;
    if(!weather){
      const fq=new URLSearchParams({latitude:p.lat,longitude:p.lon,current:'temperature_2m,precipitation,rain,showers,weather_code,is_day',timezone:'auto',forecast_days:'1'});
      const fr=await fetch('https://api.open-meteo.com/v1/forecast?'+fq,{signal:weatherController.signal});
      if(fr.ok){const fd=await fr.json(),cur=fd.current||{};weather={available:Number.isFinite(+cur.temperature_2m),source:'open-meteo-direct',temperature_c:cur.temperature_2m,precipitation_mm:cur.precipitation,rain_mm:cur.rain,showers_mm:cur.showers,weather_code:cur.weather_code,is_day:cur.is_day,rainy:Math.max(+cur.precipitation||0,+cur.rain||0,+cur.showers||0)>.05}}
    }
    if(weather){window.__sparkWeatherState=weather;updateWeatherPill(weather);applyMoodStyle(weather,MAP_STYLE_MODE==='auto')}
    else{updateWeatherPill(window.__sparkWeatherState||null);applyMoodStyle(window.__sparkWeatherState||null,false)}
  }catch(e){if(e?.name!=='AbortError'){updateWeatherPill(window.__sparkWeatherState||null);applyMoodStyle(window.__sparkWeatherState||null,false)}}
}
function scheduleEnvironmentalRefresh(p,force=false){clearTimeout(moodTimer);moodTimer=setTimeout(()=>refreshEnvironmentalStyle(!!force),force?80:500)}

function clearSavedActiveTrip(){try{localStorage.removeItem(ACTIVE_TRIP_KEY)}catch{}pendingResumeTrip=null;const card=$('resumeTripCard');card?.classList.remove('show');card?.setAttribute('aria-hidden','true')}
function compactRouteForResume(r){if(!r||!r.geometry?.coordinates?.length)return null;try{return JSON.parse(JSON.stringify(r))}catch{return null}}
function persistActiveTrip({force=false,position=null,metrics=null}={}){
  if(adminSimulation||!selectedRoute||!destination||!activeNav?.classList.contains('show'))return;
  const now=Date.now();if(!force&&now-lastTripPersistAt<3500)return;lastTripPersistAt=now;
  const route=compactRouteForResume(selectedRoute);if(!route)return;
  let m=metrics;if(!m&&position&&Number.isFinite(+position.lat)&&Number.isFinite(+position.lon)){try{m=nearestProgress(position)}catch{}}
  const remainingMeters=Math.max(0,+m?.remaining||+selectedRoute.distance||0),progress=Math.max(0,Math.min(1,+m?.progress||0));
  const remainingSeconds=Math.max(0,(+selectedRoute.duration||(+selectedRoute.duration_min||0)*60)*(1-progress));
  const payload={version:33,active:true,savedAt:now,startedAt:navStartedAt||now,profile,routeMode,origin,destination,route,lastPosition:position||lastNavPosition||userLocation||null,remainingMeters,remainingSeconds,progress};
  try{localStorage.setItem(ACTIVE_TRIP_KEY,JSON.stringify(payload))}catch(e){console.warn('[VANO MAPS:trip-persist]',e)}
}
function readSavedActiveTrip(){let d=null;try{d=JSON.parse(localStorage.getItem(ACTIVE_TRIP_KEY)||'null')}catch{}if(!d?.active||!d.destination||!d.route?.geometry?.coordinates?.length)return null;if(Date.now()-(+d.savedAt||0)>ACTIVE_TRIP_MAX_AGE||(+d.remainingMeters||0)<20||(+d.progress||0)>.995){clearSavedActiveTrip();return null}return d}
function resumeModeLabel(mode){return mode==='fastest'?'Rápida':'Segura'}
function resumeProfileLabel(p){return p==='driving'?'carro':p==='motorcycle'?'moto':p==='cycling'?'bike':'a pé'}
function resumeAgeLabel(ts){const min=Math.max(0,Math.round((Date.now()-(+ts||Date.now()))/60000));if(min<2)return'agora';if(min<60)return`há ${min} min`;const h=Math.round(min/60);return`há ${h}h`}
function resumeMiniPath(route){const c=route?.geometry?.coordinates||[];if(c.length<2)return'';const sample=c.filter((_,i)=>i===0||i===c.length-1||i%Math.max(1,Math.floor(c.length/34))===0);const xs=sample.map(x=>+x[0]),ys=sample.map(x=>+x[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=Math.max(1e-8,maxX-minX),dy=Math.max(1e-8,maxY-minY),scale=Math.min(76/dx,52/dy);const pts=sample.map(x=>[50+(x[0]-(minX+maxX)/2)*scale,36-(x[1]-(minY+maxY)/2)*scale]);return pts.map((q,i)=>`${i?'L':'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')}
function showSavedTripResume(){if(SHARED_TOKEN||activeNav?.classList.contains('show'))return;const d=readSavedActiveTrip();if(!d)return;pendingResumeTrip=d;const card=$('resumeTripCard');if(!card)return;$('resumeTripDestination').textContent=d.destination?.label||'Destino salvo';$('resumeTripEta').textContent=fmtDuration((+d.remainingSeconds||0)/60);$('resumeTripDistance').textContent=fmtDistance(+d.remainingMeters||0);$('resumeTripMode').textContent=resumeModeLabel(d.routeMode);$('resumeTripAge').textContent=resumeAgeLabel(d.savedAt);$('resumeTripSummary').textContent=`${resumeProfileLabel(d.profile)} · ${Math.round((+d.progress||0)*100)}% concluído`;const path=resumeMiniPath(d.route);if(path){$('resumeTripPath')?.setAttribute('d',path);$('resumeTripPathShadow')?.setAttribute('d',path)}card.classList.add('show');card.setAttribute('aria-hidden','false')}
async function continueSavedTrip(){const d=pendingResumeTrip||readSavedActiveTrip();if(!d)return;const btn=$('continueResumeTrip');if(btn){btn.disabled=true;btn.textContent='Retomando…'}try{
  profile=['walking','driving','motorcycle','cycling'].includes(d.profile)?d.profile:'driving';syncRouteProfileUi();routeMode=d.routeMode==='fastest'?'fastest':'safest';origin=d.origin||origin;destination=d.destination;selectedRoute=d.route;routes=[selectedRoute];destinationConfirmed=true;manualRouteSelection=false;
  destinationInput.value=destination?.label||'Destino';if(destinationMarker)destinationMarker.remove();destinationMarker=new mapboxgl.Marker({element:markerEl('destination'),anchor:'bottom',offset:[0,0]}).setLngLat([destination.display_lon??destination.lon,destination.display_lat??destination.lat]).addTo(map);
  document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===profile));document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.toggle('active',x.dataset.routeMode===routeMode));
  cardHideResume();welcomeState.style.display='none';routeState.style.display='block';renderRoute();await startTrip();
}catch(e){console.error('[VANO MAPS:resume-trip]',e);showToast(e?.message||'Não foi possível retomar o trajeto.');setTimeout(showSavedTripResume,120)}finally{if(btn){btn.disabled=false;btn.textContent='Continuar trajeto'}}}
function cardHideResume(){const card=$('resumeTripCard');card?.classList.remove('show');card?.setAttribute('aria-hidden','true')}
function discardSavedTrip(){clearSavedActiveTrip();showToast('Trajeto anterior encerrado.')}

window.__VANO_MAP_BOOT_STAGE='constructor';
map=new mapboxgl.Map({container:'map',style:currentStyleUri||STYLE,center:BOOT_GPS?[BOOT_GPS.lon,BOOT_GPS.lat]:[-46.6333,-23.5505],zoom:BOOT_GPS?15.6:11,attributionControl:false,cooperativeGestures:false,pitchWithRotate:true,bearingSnap:7,antialias:true,fadeDuration:LOW_POWER_DEVICE?0:220,maxPitch:70,projection:'mercator'});
window.__VANO_MAP_BOOT_STAGE='map-created';window.__VANO_MAP_INSTANCE_READY=true;setTimeout(()=>{prefetchMapStyle(mapStyleForMood('day'));prefetchMapStyle(mapStyleForMood('night'));prefetchMapStyle(mapStyleForMood('black'))},250);window.__VANO_MAP_BRIDGE={version:229,getMap:()=>map,getUserLocation:()=>{const p=userLocation;return p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)?{lat:+p.lat,lon:+p.lon}:null},getOsintSnapshot:()=>({navigation:!!activeNav?.classList?.contains('show'),location:(lastNavPosition||userLocation)?osintLocationPayload(lastNavPosition||userLocation,lastNavPosition||userLocation):null,route:(activeNav?.classList?.contains('show')&&selectedRoute)?osintRoutePayload(lastNavPosition||userLocation,lastNavPosition?nearestProgress(lastNavPosition):null,null):null}),isPlanning:()=>!!destination||!!destinationConfirmed||!!selectedRoute||!!activeNav?.classList?.contains('show'),getPerformanceTier:()=>performanceTier,openDestination:async p=>{if(!p||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return false;if(activeNav?.classList?.contains('show'))await returnToDestinationSearch();planSheet?.classList.remove('hidden');planSheet?.classList.remove('sheet-collapsed');if(welcomeState)welcomeState.style.display='block';if(routeState)routeState.style.display='none';setPoint('destination',{...p,lat:+p.lat,lon:+p.lon,label:String(p.label||'Destino'),name:String(p.name||String(p.label||'Destino').split(',')[0]),type:p.type||'routine'},String(p.label||'Destino'),true);return true}};window.dispatchEvent(new CustomEvent('vano:map-ready'));
let initialStyleLoaded=false,initialStyleFallbackTried=false;
const initialStyleWatchdog=setTimeout(()=>{
  if(initialStyleLoaded)return;
  console.warn('[VANO MAPS:mapbox] style load timeout; forcing Standard retry');
  try{currentStyleUri='mapbox://styles/mapbox/standard';map.setStyle(currentStyleUri,{diff:false})}catch{}
  setTimeout(()=>{if(!initialStyleLoaded){try{window.__VANO_SHOW_MAP_BOOT_ERROR?.()}catch{}}},7000);
},8500);
map.on('error',ev=>{
  const err=ev?.error||ev;const msg=String(err?.message||err||'map-error').slice(0,160);
  console.warn('[VANO MAPS:mapbox]',msg);
  // A custom environmental style must never be able to leave the entire map blank.
  // If the first style fails, fall back once to Mapbox Standard.
  if(!initialStyleLoaded&&!initialStyleFallbackTried&&currentStyleUri!=='mapbox://styles/mapbox/standard'){
    initialStyleFallbackTried=true;currentStyleUri='mapbox://styles/mapbox/standard';
    try{map.setStyle(currentStyleUri,{diff:false})}catch{}
  }
});
map.addControl(new mapboxgl.AttributionControl({compact:true}),'bottom-right');
try{const mapCanvas=map.getCanvas();const markMapPointer=()=>{lastMapPointerAt=Date.now()};mapCanvas?.addEventListener('pointerdown',markMapPointer,{passive:true});mapCanvas?.addEventListener('touchstart',markMapPointer,{passive:true});mapCanvas?.addEventListener('webglcontextlost',e=>{e.preventDefault?.();setTimeout(()=>hardRefreshMapViewport(),180)},{passive:false});mapCanvas?.addEventListener('webglcontextrestored',()=>hardRefreshMapViewport(),{passive:true})}catch{}
function restoreMapGestureHealth(){
  if(!map)return;
  try{map.dragPan?.enable?.();map.dragRotate?.enable?.();map.scrollZoom?.enable?.();map.doubleClickZoom?.enable?.();map.touchZoomRotate?.enable?.();map.touchPitch?.enable?.();map.keyboard?.enable?.()}catch{}
  try{const canvas=map.getCanvas?.();if(canvas){canvas.style.touchAction='none';canvas.style.webkitUserSelect='none'}}catch{}
}
function hardRefreshMapViewport(){
  restoreMapGestureHealth();refreshResponsiveViewport();
  [0,90,240,520].forEach(delay=>setTimeout(()=>{try{map?.resize?.();restoreMapGestureHealth()}catch{}},delay));
}
map.on('style.load',async()=>{initialStyleLoaded=true;clearTimeout(initialStyleWatchdog);try{map.setProjection?.('mercator')}catch{}await installRuntimeLayers();await ensureVehicle3DLayer();syncNavigationThemePaint();updateAnimatedRoutePaint(true);restoreRuntimeMapState();styleSwitching=false;$('mapMoodFade')?.classList.remove('active')});
map.on('load',async()=>{
  restoreMapGestureHealth();hardRefreshMapViewport();applyVanoLightBasemapConfig();
  await installRuntimeLayers();await ensureVehicle3DLayer();
  startRouteFlowAnimation();startPerformanceMonitor();
  applyMapPrefs();bootstrapGps(!SHARED_TOKEN);updatePlannerOriginStatus();scheduleEnvironmentalRefresh(BOOT_GPS||null,true);
  setTimeout(()=>scheduleSignalRefresh(true),1200);setTimeout(()=>refreshNearbyDrivers(true),3500);hydrateQuickAlertBadges();
  if(SHARED_TOKEN)setTimeout(loadSharedRoute,350);else setTimeout(showSavedTripResume,520);
  setInterval(()=>{if(document.visibilityState==='visible')refreshEnvironmentalStyle(false)},300000);
});
window.addEventListener('vano:themechange',e=>{
  const requested=String(e?.detail?.theme||e?.detail?.mode||'').toLowerCase();
  const black=requested?requested==='black':(document.documentElement.dataset.vanoTheme==='black'||document.documentElement.dataset.vanoThemeMode==='black');
  if(e?.detail?.reason==='manual'){
    mapThemeOverride=black?null:'day';
    try{black?localStorage.removeItem('vano.map.theme.override.v173'):localStorage.setItem('vano.map.theme.override.v173','day')}catch{}
  }
  currentMapMood=black?'black':'day';
  document.body.dataset.mood=black?'night':'day';
  const target=mapStyleForMood(currentMapMood);
  if(target&&target!==currentStyleUri){currentStyleUri=target;styleSwitching=true;$('mapMoodFade')?.classList.add('active');setMapStyleFast(target,true)}
  else{applyMoodStyle(window.__sparkWeatherState||null,true);syncNavigationThemePaint()}
  setTimeout(()=>{try{map?.resize()}catch{}},80);
});
function internalCameraMoveActive(){return performance.now()<internalCameraMoveUntil}
map.on('move',()=>{if(!internalCameraMoveActive())scheduleTrafficSnapshot(false)});map.on('zoomend',()=>syncAlertDomMarkers());map.on('moveend',()=>{if(internalCameraMoveActive()){syncAlertDomMarkers(lastAlertRecords);return}refreshAlerts(false);scheduleSignalRefresh(false);refreshNearbyDrivers(false);scheduleTrafficSnapshot(false)});map.on('sourcedata',e=>{if(e.sourceId==='vano-mapbox-traffic'&&e.isSourceLoaded)scheduleTrafficSnapshot(false)});map.on('click','road-controls-dot',e=>{const f=e.features?.[0];if(!f)return;new mapboxgl.Popup({closeButton:false,offset:12}).setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(f.properties.label||'Sinalização viária')}</b><div style="color:#9299a5;font-size:9px;margin-top:4px">Dado mapeado · confirme a sinalização real da via</div>`).addTo(map)});map.on('click','vano-traffic-hotspot-dot',e=>{const f=e.features?.[0];if(!f)return;const severe=f.properties?.bucket==='severe';new mapboxgl.Popup({closeButton:false,offset:12}).setLngLat(f.geometry.coordinates).setHTML(`<b style="color:${severe?'#ff6254':'#ff9b43'}">${esc(f.properties?.label||'Trânsito intenso')}</b><div style="color:#9299a5;font-size:9px;margin-top:4px">Fluxo viário detectado nesta área · raio do mapa: 3 km</div>`).addTo(map)});
if(alertLiveSyncTimer)clearInterval(alertLiveSyncTimer);alertLiveSyncTimer=setInterval(()=>{if(document.visibilityState==='visible'&&map?.loaded?.()&&map.getZoom()>=9)refreshAlerts(true)},5000);window.addEventListener('pagehide',()=>{if(alertLiveSyncTimer){clearInterval(alertLiveSyncTimer);alertLiveSyncTimer=null}},{once:true});
['alerts-marker','alerts-marker-symbol'].forEach(layer=>{map.on('click',layer,showMapAlertPopup);map.on('mouseenter',layer,()=>{map.getCanvas().style.cursor='pointer'});map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor=''})});['alerts-cluster','alerts-cluster-count'].forEach(layer=>{map.on('click',layer,expandAlertCluster);map.on('mouseenter',layer,()=>{map.getCanvas().style.cursor='pointer'});map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor=''})});
function releaseNavigationCameraFromGesture(e){
  const userGesture=!!e?.originalEvent||(Date.now()-lastMapPointerAt<1400);
  if(!userGesture)return;
  if(activeNav?.classList.contains('show')){if(!followMode)return;setNavigationFollow(false,false);document.body.classList.add('nav-map-free');haptic(5);return}
  mapFollowMode=false;
}
['dragstart','zoomstart','rotatestart','pitchstart'].forEach(evt=>map.on(evt,releaseNavigationCameraFromGesture));
function alertVectorFC(items=lastAlertRecords){return{type:'FeatureCollection',features:(items||[]).map(alertFeature)}}
function applyAlertRecords(items,{force=false}={}){
  const now=Date.now(),incoming=(items||[]).filter(a=>Number.isFinite(+a.lat)&&Number.isFinite(+a.lon)).map(a=>({...a,lat:+a.lat,lon:+a.lon})),byId=new Map();
  for(const a of incoming){const id=String(a.id);byId.set(id,a);alertClientSeenAt.set(id,now)}
  for(const old of lastAlertRecords||[]){const id=String(old.id);if(byId.has(id))continue;const seen=alertClientSeenAt.get(id)||now;if(now-seen<=ALERT_CLIENT_GRACE_MS)byId.set(id,old);else alertClientSeenAt.delete(id)}
  lastAlertRecords=[...byId.values()];const key=lastAlertRecords.map(alertRecordSignature).sort().join('|');if(force||key!==lastAlertVectorKey){lastAlertVectorKey=key;map?.getSource('alerts')?.setData(alertVectorFC(lastAlertRecords))}syncAlertDomMarkers(lastAlertRecords);const count=lastAlertRecords.length;if((count!==lastAlertSyncTelemetryCount||now-lastAlertSyncTelemetryAt>90000)&&now-lastAlertSyncTelemetryAt>12000){lastAlertSyncTelemetryAt=now;lastAlertSyncTelemetryCount=count;productTelemetry('alert',`map-sync:${count}`,'map-alerts')}
}
function upsertLocalAlert(a){if(!a||!Number.isFinite(+a.lat)||!Number.isFinite(+a.lon))return;const id=String(a.id||`local-${Date.now()}`),record={...a,id,lat:+a.lat,lon:+a.lon,created_at:a.created_at||new Date().toISOString(),confirmations:+a.confirmations||0,confidence:+a.confidence||0};applyAlertRecords([record,...lastAlertRecords.filter(x=>String(x.id)!==id)],{force:true})}
function alertsViewportNeedsRefresh(force=false){if(force||!map)return true;const c=map.getCenter?.(),z=map.getZoom?.(),now=Date.now();if(!c||!lastAlertFetchCenter||!Number.isFinite(+z))return true;const navOn=!!activeNav?.classList.contains('show'),ttl=navOn?18000:30000,move=hav([lastAlertFetchCenter.lon,lastAlertFetchCenter.lat],[c.lng,c.lat]);return now-lastAlertFetchAt>ttl||move>(navOn?145:210)||Math.abs(+z-(+lastAlertFetchZoom||+z))>.45}
async function refreshAlerts(force=false){
  if(!map?.loaded()||!map.getSource('alerts'))return;if(map.getZoom()<9){lastAlertRecords=[];lastAlertVectorKey='';clearAlertDomMarkers();setAlertVectorMarkerVisibility(false);return}if(!alertsViewportNeedsRefresh(force)){syncAlertDomMarkers(lastAlertRecords);return}
  const b=map.getBounds(),c=map.getCenter?.(),p=new URLSearchParams({min_lat:b.getSouth(),min_lon:b.getWest(),max_lat:b.getNorth(),max_lon:b.getEast()});lastAlertFetchAt=Date.now();if(c)lastAlertFetchCenter={lat:c.lat,lon:c.lng};lastAlertFetchZoom=map.getZoom();try{p.set('_ts',String(Date.now()));const r=await fetch('/api/alerts?'+p,{cache:'no-store',headers:{'Accept':'application/json'}}),d=await r.json();if(!r.ok)return;applyAlertRecords(d.alerts||[])}catch{}
}
function maybeRefreshNavigationAlerts(p){if(!p||!activeNav?.classList.contains('show'))return;const now=Date.now(),moved=!lastNavAlertRefreshPos?Infinity:hav([lastNavAlertRefreshPos.lon,lastNavAlertRefreshPos.lat],[p.lon,p.lat]);if(now-lastNavAlertRefreshAt<18000&&moved<145)return;lastNavAlertRefreshAt=now;lastNavAlertRefreshPos={lat:+p.lat,lon:+p.lon};refreshAlerts(false)}

function relativeAlertTime(raw){const t=Date.parse(raw||'');if(!Number.isFinite(t))return'Reportado recentemente';const m=Math.max(0,Math.round((Date.now()-t)/60000));if(m<2)return'Reportado agora';if(m<60)return`Reportado há ${m} min`;const h=Math.round(m/60);return h<24?`Reportado há ${h} h`:'Reportado recentemente'}
async function confirmMapAlert(id,button){if(!LOGGED_IN){location.href=LOGIN_URL;return}if(button){button.disabled=true;button.textContent='Confirmando…'}try{const r=await fetch(`/api/alerts/${encodeURIComponent(id)}/confirm`,{method:'POST',headers:{'X-CSRF-Token':CSRF}}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível confirmar.');showToast(d.already_confirmed?'Você já confirmou este alerta.':'Alerta confirmado.');productTelemetry('alert','confirmed','map-alert');await refreshAlerts(true);window.__mapAlertPopup?.remove?.()}catch(e){showToast(e.message||'Não foi possível confirmar.');if(button){button.disabled=false;button.textContent='Confirmar'}}}
async function markAlertGone(id,button){if(!LOGGED_IN){location.href=LOGIN_URL;return}if(button){button.disabled=true;button.textContent='Enviando…'}try{const r=await fetch(`/api/alerts/${encodeURIComponent(id)}/not-there`,{method:'POST',headers:{'X-CSRF-Token':CSRF}}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível avaliar.');showToast(d.resolved?'Alerta removido após confirmações da comunidade.':d.already_voted?'Você já informou isso.':'Obrigado. Vamos comparar com outras confirmações.');productTelemetry('alert',`not-there:${d.resolved?'resolved':'vote'}`,'map-alert');await refreshAlerts(true);window.__mapAlertPopup?.remove?.()}catch(e){showToast(e.message||'Não foi possível avaliar.');if(button){button.disabled=false;button.textContent='Não está mais lá'}}}
function showMapAlertPopup(e){const now=Date.now();if(now-lastAlertPopupOpenAt<120)return;lastAlertPopupOpenAt=now;const f=e.features?.[0];if(!f||f.properties?.cluster)return;const p=f.properties||{},coords=f.geometry?.coordinates;if(!coords)return;window.__mapAlertPopup?.remove?.();const confidence=Number(p.confidence||0),confidenceHtml=confidence?`<span class="alert-confidence">Confiança ${confidence}%</span>`:'';const popup=new mapboxgl.Popup({closeButton:true,offset:13,maxWidth:'280px'}).setLngLat(coords).setHTML(`<div class="vano-alert-popup"><small>ALERTA NO MAPA</small><b>${esc(p.category_label||p.title||'Alerta')}</b><span>${esc(relativeAlertTime(p.created_at))}</span><div class="alert-popup-meta">${p.confirmations?`<em>${Number(p.confirmations)} confirmação(ões)</em>`:''}${confidenceHtml}</div><div class="alert-popup-actions"><button type="button" class="confirm" data-confirm-map-alert="${esc(p.id)}">${LOGGED_IN?'Confirmar':'Entrar para confirmar'}</button><button type="button" class="gone" data-gone-map-alert="${esc(p.id)}">Não está mais lá</button></div></div>`).addTo(map);window.__mapAlertPopup=popup;setTimeout(()=>{const root=popup.getElement();root?.querySelector('[data-confirm-map-alert]')?.addEventListener('click',ev=>confirmMapAlert(p.id,ev.currentTarget));root?.querySelector('[data-gone-map-alert]')?.addEventListener('click',ev=>markAlertGone(p.id,ev.currentTarget))},0)}
function expandAlertCluster(e){const f=e.features?.[0],clusterId=f?.properties?.cluster_id,coords=f?.geometry?.coordinates;if(clusterId==null||!coords)return;const source=map.getSource('alerts'),go=zoom=>map.easeTo({center:coords,zoom:Math.min(18,Number(zoom)||map.getZoom()+2),duration:380});try{const maybe=source?.getClusterExpansionZoom?.(clusterId);if(maybe&&typeof maybe.then==='function')maybe.then(go).catch(()=>go(map.getZoom()+2));else source?.getClusterExpansionZoom?.(clusterId,(err,z)=>go(err?map.getZoom()+2:z))}catch{try{source?.getClusterExpansionZoom?.(clusterId,(err,z)=>go(err?map.getZoom()+2:z))}catch{go(map.getZoom()+2)}}}


function dedupeRoadItems(items){const seen=new Set();return (items||[]).filter(x=>{const k=`${x.type}:${(+x.lat).toFixed(4)}:${(+x.lon).toFixed(4)}`;if(seen.has(k))return false;seen.add(k);return true})}
function signalRadiusForCamera(){if(!map)return 0;const z=map.getZoom();if(z<13.4)return 0;if(z<14.2)return 5000;if(z<15.2)return 3500;return 2000}
function roadControlTypes(){return new Set(['speed_camera','traffic_signal','stop_sign','yield_sign','traffic_sign'])}
function updateRoadLayer(extra=[]){
  if(window.__vanoNativeMapActive&&activeNav?.classList.contains('show'))return;
  if(!map?.getSource('road-controls'))return;
  const radius=signalRadiusForCamera(),center=map.getCenter?.(),bounds=map.getBounds?.();
  if(!radius||!center||!bounds){map.getSource('road-controls').setData(emptyFC());return}
  const types=roadControlTypes(),base=selectedRoute?.road_controls||[];
  const visible=dedupeRoadItems([...base,...roadAwareness,...extra]).filter(x=>{
    if(!types.has(String(x.type||''))||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon))return false;
    const lon=+x.lon,lat=+x.lat;
    if(!(lon>=bounds.getWest()&&lon<=bounds.getEast()&&lat>=bounds.getSouth()&&lat<=bounds.getNorth()&&hav([center.lng,center.lat],[lon,lat])<=radius))return false;
    if(activeNav?.classList.contains('show')&&selectedRoute){const m=nearestProgressOnRoute({lat,lon},selectedRoute);if(m.offRoute>85)return false}
    return true;
  });
  const byDistance=(a,b)=>hav([center.lng,center.lat],[+a.lon,+a.lat])-hav([center.lng,center.lat],[+b.lon,+b.lat]);
  const radars=visible.filter(x=>String(x.type)==='speed_camera').sort(byDistance).slice(0,14);
  const signals=visible.filter(x=>String(x.type)==='traffic_signal').sort(byDistance).slice(0,20);
  const others=visible.filter(x=>!['traffic_signal','speed_camera'].includes(String(x.type))).sort(byDistance).slice(0,22);
  const shown=[...radars,...signals,...others];
  map.getSource('road-controls').setData({type:'FeatureCollection',features:shown.map(x=>({type:'Feature',properties:{type:x.type,label:x.label||roadLabelIcon(x.type),source:x.source||''},geometry:{type:'Point',coordinates:[+x.lon,+x.lat]}}))});
}
function currentSpeedLimit(index){const pts=selectedRoute?.speed_limit_points||[];let best=null;for(const x of pts){if((+x.index||0)<=index)best=x;else break}return best}
function roadLabelIcon(type){return type==='speed_camera'?'Radar de velocidade':type==='traffic_signal'?'Semáforo':type==='stop_sign'?'Parada obrigatória':type==='yield_sign'?'Dê a preferência':'Sinalização viária'}
function upcomingSpeedCamera(along=0,maxAhead=1300){if(!selectedRoute)return null;const all=dedupeRoadItems([...(selectedRoute.road_controls||[]),...roadAwareness]).filter(x=>String(x.type)==='speed_camera'),found=[];for(const x of all){const n=nearestProgress({lat:+x.lat,lon:+x.lon}),ahead=n.distanceAlong-along;if(n.offRoute<=105&&ahead>=-30&&ahead<=maxAhead)found.push({...x,ahead:Math.max(0,ahead),off:n.offRoute})}return found.sort((a,b)=>a.ahead-b.ahead||a.off-b.off)[0]||null}
function maybeWarnSpeedCamera(camera){if(!camera||!activeNav?.classList.contains('show'))return;const ahead=Math.max(0,+camera.ahead||0),key=`${(+camera.lat).toFixed(5)}:${(+camera.lon).toFixed(5)}:${ahead<=280?'near':'far'}`,now=Date.now();if(key===lastSpeedCameraWarnKey&&now-lastSpeedCameraWarnAt<90000)return;if(ahead<=850){lastSpeedCameraWarnKey=key;lastSpeedCameraWarnAt=now;productTelemetry('safety',ahead<=280?'speed-camera-near':'speed-camera-ahead','radar');if(ahead<=700)speak(`Radar de velocidade ${ahead<=280?'logo à frente':'à frente'}. Respeite o limite da via.`,'speed-camera-'+key)}}
function renderRoadAwareness(p,m){if(!selectedRoute)return;const types=roadControlTypes(),all=dedupeRoadItems([...(selectedRoute.road_controls||[]),...roadAwareness]).filter(x=>types.has(String(x.type||''))),ahead=[];for(const x of all){const n=nearestProgress({lat:+x.lat,lon:+x.lon}),delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<=105&&delta>=-12&&delta<=1800)ahead.push({...x,ahead:Math.max(0,delta),off:n.offRoute})}ahead.sort((a,b)=>a.ahead-b.ahead||a.off-b.off);const next=ahead[0];$('roadAhead').textContent=next?roadLabelIcon(next.type):'Nenhuma sinalização mapeada logo à frente';$('roadAheadDistance').textContent=next?`${fmtDistance(next.ahead)} à frente · dados OpenStreetMap`:'Continuamos verificando o corredor da rota';const lim=currentSpeedLimit(m.index),sign=$('speedSign');if(lim?.speed!=null){currentMappedSpeedLimitKmh=Math.round(+lim.speed);sign.classList.remove('unknown');sign.textContent=currentMappedSpeedLimitKmh;sign.title=`Limite ${lim.speed} ${lim.unit||'km/h'}`}else{currentMappedSpeedLimitKmh=null;sign.classList.add('unknown');sign.textContent='—';sign.title='Limite não mapeado'}updateFloatingSpeedometer(lastDisplayedSpeedKmh);const radar=upcomingSpeedCamera(m.distanceAlong,1400);if(radar)maybeWarnSpeedCamera(radar)}
async function refreshVisibleSignals(force=false){if(!mapPrefs.liveSignals)return;const native=!!window.__vanoNativeMapActive&&!!activeNav?.classList.contains('show');if(!native&&!map?.loaded())return;const radius=native?2200:signalRadiusForCamera();if(!radius){roadAwareness=[];updateRoadLayer();return}const navPos=native?(lastNavPosition||userLocation):null,c=navPos?{lat:+navPos.lat,lng:+navPos.lon}:map.getCenter(),prec=radius>=3500?2:3,key=`${c.lat.toFixed(prec)}:${c.lng.toFixed(prec)}:${radius}`;if(!force&&(key===lastSignalViewportKey||now-lastSignalFetchAt<12000))return;lastSignalViewportKey=key;lastSignalFetchAt=now;signalController?.abort();signalController=new AbortController();try{const q=new URLSearchParams({lat:c.lat,lon:c.lng,radius,controls_only:'1'}),r=await fetch('/api/road-awareness?'+q,{signal:signalController.signal}),d=await r.json();if(r.ok){const types=roadControlTypes();roadAwareness=(d.items||[]).filter(x=>types.has(String(x.type||''))).slice(0,120);updateRoadLayer()}}catch(e){if(e?.name!=='AbortError')console.warn('[VANO MAPS:signals]',e)}}
function scheduleSignalRefresh(force=false){clearTimeout(signalRefreshTimer);signalRefreshTimer=setTimeout(()=>refreshVisibleSignals(force),force?30:260)}
async function refreshRoadAwareness(p,force=false){scheduleSignalRefresh(force)}

function chooseByMode(){manualRouteSelection=false;const badge=routeMode==='fastest'?'fastest':'safest';selectedRoute=routes.find(r=>r.badges?.includes(badge))||routes.find(r=>r.badges?.includes('safest'))||routes[0]||null}
function routeName(){return routeMode==='fastest'?'Rota mais rápida':'Rota mais segura'}
function showRouteLoading(title,copy){const o=$('routeLoadingOverlay');if(!o)return;$('routeLoadingTitle').textContent=title||'Calculando rota…';$('routeLoadingText').textContent=copy||(isMotorizedProfile()?'Analisando trânsito, ETA e desvios por quarteirão.':'Montando o melhor trajeto.');o.classList.add('show');o.setAttribute('aria-hidden','false')}
function hideRouteLoading(){const o=$('routeLoadingOverlay');if(!o)return;o.classList.remove('show');o.setAttribute('aria-hidden','true')}
function routeCacheKey(start,endLat,endLon,modeOverride=routeMode){const mode=modeOverride==='fastest'?'fastest':'safest',moving=isMotorizedProfile()&&Number.isFinite(+start?.heading)&&Number.isFinite(+start?.speed)&&+start.speed>=1.2,dir=moving?`${Math.round((((+start.heading%360)+360)%360)/10)*10}:${Math.round(+start.speed)}`:'na';return [profile,mode,(+start.lat).toFixed(5),(+start.lon).toFixed(5),(+endLat).toFixed(5),(+endLon).toFixed(5),dir,start?.is_reroute?1:0,mapPrefs.adaptiveRoutes?1:0,mapPrefs.aggressiveShortcuts?1:0,NAV_PREFS.avoid_ferries?1:0,NAV_PREFS.avoid_tolls?1:0,NAV_PREFS.avoid_unpaved?1:0].join(':')}
function routeRequestInfo(start,dest=destination,modeOverride=routeMode){
  if(!start||!dest)return null;
  const mode=modeOverride==='fastest'?'fastest':'safest',hasEntrance=dest.entrance_lat!=null&&dest.entrance_lon!=null&&Number.isFinite(+dest.entrance_lat)&&Number.isFinite(+dest.entrance_lon),endLat=profile==='walking'&&hasEntrance?+dest.entrance_lat:+dest.lat,endLon=profile==='walking'&&hasEntrance?+dest.entrance_lon:+dest.lon,key=routeCacheKey(start,endLat,endLon,mode);
  const precise=!!start?.is_reroute,startLat=precise?String(+start.lat):(+start.lat).toFixed(5),startLon=precise?String(+start.lon):(+start.lon).toFixed(5),targetLat=(+endLat).toFixed(5),targetLon=(+endLon).toFixed(5);
  const p=new URLSearchParams({start_lat:startLat,start_lon:startLon,end_lat:targetLat,end_lon:targetLon,mode,profile,origin_label:start.label||'Minha localização',destination_label:dest.label||'Destino',local_hour:new Date().getHours(),depart_at:'now',safety_bias:Math.round(+sparkPrefs.safety||68),traffic_bias:Math.round(+sparkPrefs.traffic||62),adaptive:mapPrefs.adaptiveRoutes?'1':'0',variant_budget:mapPrefs.aggressiveShortcuts?'7':'4',trial_id:guestTrialId,avoid_ferries:NAV_PREFS.avoid_ferries?'1':'0',avoid_tolls:NAV_PREFS.avoid_tolls?'1':'0',avoid_unpaved:NAV_PREFS.avoid_unpaved?'1':'0'});
  const movingHeading=isMotorizedProfile()&&Number.isFinite(+start?.heading)&&Number.isFinite(+start?.speed)&&+start.speed>=1.2;if(movingHeading){p.set('start_bearing',String(((+start.heading%360)+360)%360));p.set('start_speed',String(Math.max(0,+start.speed)))}if(start?.is_reroute)p.set('reroute','1');
  const groupKey=key.replace(`${profile}:${mode}:`,`${profile}:*:`);
  return{key,groupKey,p,endLat,endLon,mode};
}
function trimRouteResponseCache(){if(routeResponseCache.size<=24)return;const rows=[...routeResponseCache.entries()].sort((a,b)=>(+a[1].at||0)-(+b[1].at||0)).slice(0,Math.max(1,routeResponseCache.size-20));rows.forEach(([key])=>routeResponseCache.delete(key))}
function abortRoutePrefetches(){for(const job of routePrefetchJobs.values()){try{job.controller?.abort()}catch{}}routePrefetchJobs.clear();routePrefetchDestinationKey=''}
function routePrefetchDestinationId(candidate){return candidate&&Number.isFinite(+candidate.lat)&&Number.isFinite(+candidate.lon)?`${profile}:${(+candidate.lat).toFixed(5)}:${(+candidate.lon).toFixed(5)}`:''}
function routeCacheFresh(info,prefetchedOnly=false){const row=info?routeResponseCache.get(info.key):null;if(!row)return null;const ttl=row.prefetched?(isMotorizedProfile()?22000:44000):(isMotorizedProfile()?9000:30000);if(Date.now()-row.at>=ttl){routeResponseCache.delete(info.key);return null}return prefetchedOnly&&!row.prefetched?null:row}
function prefetchRouteMode(candidate,mode,start){
  const info=routeRequestInfo(start,candidate,mode);if(!info)return Promise.resolve(null);
  const cached=routeCacheFresh(info);if(cached)return Promise.resolve(cached.data);
  const current=routePrefetchJobs.get(info.key);if(current)return current.promise;
  const controller=new AbortController();info.p.set('prefetch','1');
  const job={controller,mode:info.mode,promise:null};
  job.promise=(async()=>{try{const {r,d}=await vanoFetchJSON('/api/route?'+info.p,{signal:controller.signal,headers:{'Accept':'application/json'},priority:info.mode===routeMode?'high':'auto'},18000);if(!r.ok)throw new Error(d.detail||d.error||'Falha no pré-cálculo');const warmed=d.routes||[];if(!warmed.length)return null;routeResponseCache.set(info.key,{at:Date.now(),routes:warmed,data:d,engine:d.engine||'',prefetched:true,committing:false,mode:info.mode,groupKey:info.groupKey});trimRouteResponseCache();return d}catch(e){if(e?.name!=='AbortError')console.debug(`[VANO MAPS:route-prefetch:${info.mode}]`,e?.message||e);return null}finally{if(routePrefetchJobs.get(info.key)===job)routePrefetchJobs.delete(info.key)}})();
  routePrefetchJobs.set(info.key,job);return job.promise;
}
async function prefetchDestinationRoutes(candidate){
  if(!candidate||!Number.isFinite(+candidate.lat)||!Number.isFinite(+candidate.lon))return null;
  if(!LOGGED_IN&&guestRoutesRemaining<=0)return null;
  const start=origin||(userLocation?{lat:+userLocation.lat,lon:+userLocation.lon,label:'Minha localização',is_gps:true,heading:userLocation.heading,speed:userLocation.speed}:null);if(!start)return null;
  if(!LOGGED_IN&&!guestTrialId)guestTrialId=makeGuestTrialId();
  const destinationKey=routePrefetchDestinationId(candidate);if(routePrefetchDestinationKey&&routePrefetchDestinationKey!==destinationKey)abortRoutePrefetches();routePrefetchDestinationKey=destinationKey;
  const primaryMode=routeMode==='fastest'?'fastest':'safest',secondaryMode=primaryMode==='fastest'?'safest':'fastest';
  const primary=prefetchRouteMode(candidate,primaryMode,start);
  prefetchRouteMode(candidate,secondaryMode,start).catch(()=>{});
  return primary;
}
async function commitPrefetchedRoute(start,key){
  if(routeCommitKeys.has(key)||!destination)return;routeCommitKeys.add(key);
  try{const info=routeRequestInfo(start,destination);if(!info||info.key!==key)return;const {r,d}=await vanoFetchJSON('/api/route?'+info.p,{headers:{'Accept':'application/json'},keepalive:true},18000);if(d?.guest_trial?.active){renderGuestTrial(d.guest_trial.remaining);if(d.guest_trial.trial_id)guestTrialId=d.guest_trial.trial_id}if(!r.ok){if(d.code==='guest_route_limit_reached'){renderGuestTrial(0);showGuestLimit()}return}const row=routeResponseCache.get(key);if(row){row.prefetched=false;row.committing=false;row.at=Date.now();row.data=d;row.routes=d.routes||row.routes;row.engine=d.engine||row.engine}
    // One destination confirmation authorizes the whole pre-warmed chooser set.
    // Switching Safe <-> Fast must not consume a second guest route or write a
    // duplicate history row just because V84 calculated both modes in advance.
    for(const sibling of routeResponseCache.values()){if(sibling.groupKey===info.groupKey){sibling.prefetched=false;sibling.committing=false;sibling.at=Date.now()}}}catch(e){console.debug('[VANO MAPS:route-commit]',e?.message||e)}finally{const row=routeResponseCache.get(key);if(row?.prefetched)row.committing=false;routeCommitKeys.delete(key)}}
async function fetchRoutes(start,quiet=false){
  const routeStarted=performance.now();
  if(!LOGGED_IN&&guestRoutesRemaining<=0){showGuestLimit();throw new Error('Crie uma conta para continuar após as 10 rotas grátis.')}
  if(!LOGGED_IN&&!guestTrialId)guestTrialId=makeGuestTrialId();
  const info=routeRequestInfo(start,destination);if(!info)throw new Error('Destino inválido.');let cached=routeCacheFresh(info),cacheMs=cached?.prefetched?(isMotorizedProfile()?22000:44000):(isMotorizedProfile()?9000:30000);
  const pending=routePrefetchJobs.get(info.key)?.promise;if(!cached&&pending){try{await pending}catch{}cached=routeCacheFresh(info);cacheMs=cached?.prefetched?(isMotorizedProfile()?22000:44000):(isMotorizedProfile()?9000:30000)}
  if(cached&&Date.now()-cached.at<cacheMs){routes=cached.routes;lastRouteEngine=cached.engine||'';chooseByMode();if(!quiet)renderRoute();if(cached.prefetched&&!cached.committing){cached.committing=true;commitPrefetchedRoute(start,info.key)}productTelemetry('performance',`route-latency:${Math.round(performance.now()-routeStarted)}ms:cache`,'route');return cached.data}
  const requestId=++routeRequestId;routeController?.abort();routeController=new AbortController();
  const {r,d}=await vanoFetchJSON('/api/route?'+info.p,{signal:routeController.signal},22000);
  if(requestId!==routeRequestId)throw new DOMException('stale','AbortError');
  if(d?.guest_trial?.active){renderGuestTrial(d.guest_trial.remaining);if(d.guest_trial.trial_id)guestTrialId=d.guest_trial.trial_id;}
  if(!r.ok){if(d.code==='login_required_for_customization'){location.assign(d.login_url||LOGIN_URL);throw new DOMException('login','AbortError')}if(d.code==='guest_route_limit_reached'){renderGuestTrial(0);showGuestLimit()}throw new Error(d.detail||d.error||'Não foi possível calcular')}
  routes=d.routes||[];if(!routes.length)throw new Error('Nenhuma rota encontrada');lastRouteEngine=d.engine||'';productTelemetry('performance',`route-latency:${Math.round(performance.now()-routeStarted)}ms:${lastRouteEngine||'engine'}`,'route');
  routeResponseCache.set(info.key,{at:Date.now(),routes,data:d,engine:lastRouteEngine,prefetched:false,committing:false,groupKey:info.groupKey});trimRouteResponseCache();chooseByMode();if(!quiet)renderRoute();return d
}
async function calculateRoutes(preserveCurrent=false){
  if(previewing)stopRoutePreview(false);if(!origin||!destination)return;
  const seq=++routeLoadingSeq,info=routeRequestInfo(origin,destination),warm=info?routeCacheFresh(info):null,warmReady=!!warm,pending=info?routePrefetchJobs.get(info.key)?.promise:null;
  let loaderTimer=null,loaderShown=false;
  if(!warmReady){loaderTimer=setTimeout(()=>{if(seq!==routeLoadingSeq)return;loaderShown=true;showRouteLoading('Calculando rota…',pending?'Finalizando opções que já estavam sendo preparadas.':(isMotorizedProfile()?'Analisando trânsito, micro-rotas e alternativas.':'Montando o melhor trajeto.'))},pending?170:105)}
  await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  if(!preserveCurrent){routeState.style.display='none';welcomeState.style.display='block'}
  try{
    const data=await fetchRoutes(origin,true);
    if(seq!==routeLoadingSeq)return;
    planSheet.classList.remove('sheet-collapsed');welcomeState.style.display='none';routeState.style.display='block';renderRoute();renderParkingNearby();if(profile==='driving')loadParkingNearby(false);
    if(isMotorizedProfile())setTimeout(()=>nonFatal('event-pretrip',()=>checkEventDisruption(true,{pretrip:true})),260);
    const provider=String(data?.provider||'mapbox');
    if(provider!=='mapbox')showToast(`Rota calculada pelo fallback ${provider}.`);
  }catch(e){
    if(e?.name==='AbortError')return;
    if(seq!==routeLoadingSeq)return;
    if(!preserveCurrent){welcomeState.style.display='block';planSheet.classList.add('sheet-collapsed')}showToast(e.message);
  }finally{
    if(loaderTimer)clearTimeout(loaderTimer);if(loaderShown)hideRouteLoading();
  }
  if(window.lucide)lucide.createIcons();
}
function variantLabel(r){if(r.event_variant)return 'Desvio de evento';if(r.badges?.includes('fastest'))return 'Mais rápida';if(r.badges?.includes('safest')||r.badges?.includes('smart'))return 'Mais segura';if(r.safety_variant)return 'Desvio seguro';return r.micro_route?'Atalho':'Alternativa'}
function renderRouteVariants(){const box=$('routeVariants');if(!box)return;const list=(routes||[]).filter(r=>r?.geometry).slice().sort((a,b)=>(+a.duration||9e12)-(+b.duration||9e12)).slice(0,4);const count=$('routeChooserCount');if(count)count.textContent=list.length>1?`${list.length} opções comparadas`:'1 rota pronta';box.classList.toggle('route-alt-hidden',!mapPrefs.showAlternatives||list.length<2);if(!mapPrefs.showAlternatives||list.length<2){box.innerHTML='';return}const best=+list[0].duration||0;box.innerHTML=list.map(r=>{const active=selectedRoute&&String(selectedRoute.id)===String(r.id),delta=Math.max(0,Math.round(((+r.duration||0)-best)/60)),sub=(r.event_variant?'contorna movimento intenso':r.safety_variant?'evita ponto verificado':r.adaptive_variant?'corredor novo':r.micro_route?'microrrota':delta?`+${delta} min`:'menor ETA');return `<button type="button" class="route-variant ${active?'active':''}" data-route-id="${esc(r.id)}"><small>${active?'Selecionada':'Alternativa'}</small><b>${esc(fmtDuration(r.duration_min||(+r.duration||0)/60))}</b><span>${esc(variantLabel(r))}</span><em>${esc(sub)}</em></button>`}).join('');box.querySelectorAll('[data-route-id]').forEach(btn=>btn.onclick=()=>{const found=routes.find(r=>String(r.id)===btn.dataset.routeId);if(!found)return;manualRouteSelection=true;selectedRoute=found;renderRoute();haptic(8);if(isMotorizedProfile())setTimeout(()=>nonFatal('event-manual-route',()=>checkEventDisruption(true,{pretrip:!activeNav?.classList.contains('show')})),180)})}
function alternativeRoutesFC(){if(activeNav?.classList.contains('show'))return navAlternativeFC();if(!mapPrefs.showAlternatives||!selectedRoute)return emptyFC();const key=routeClientKey(selectedRoute),list=(routes||[]).filter(r=>r?.geometry?.coordinates?.length>1&&routeClientKey(r)!==key).slice().sort((a,b)=>(+a.duration||9e12)-(+b.duration||9e12)).slice(0,3);return{type:'FeatureCollection',features:list.map((r,i)=>({type:'Feature',properties:{alternative:true,rank:i,key:routeClientKey(r),micro:!!r.micro_route},geometry:r.geometry}))}}

function renderRoute(){
  if(!selectedRoute)return;
  const r=selectedRoute,fastOnly=routeMode==='fastest'&&r.fast_eta_only,level=Math.max(0,Math.min(5,+r.safety_level||0)),dots=Array.from({length:5},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('');
  $('routeHeading').textContent=r.event_variant?'Contorno de evento':(manualRouteSelection?'Alternativa escolhida':routeName());
  $('routeSubtitle').textContent=r.event_variant?`Desvio ativo para evitar movimento intenso${(r.event_avoid_names||[])[0]?` · ${(r.event_avoid_names||[])[0]}`:''}`:(manualRouteSelection?`${variantLabel(r)} · alternativa escolhida por você`:(routeMode==='fastest'?'Menor tempo estimado com o trânsito atual':'Equilíbrio entre tempo, alertas e contexto da via'));
  $('selectedDuration').textContent=fmtDuration(r.duration_min);$('selectedDistance').textContent=fmtDistance(r.distance);renderRouteSummaryPills(r);const decision=$('routeDecisionBadge');if(decision){const ordered=(routes||[]).filter(x=>x?.geometry).slice().sort((a,b)=>(+a.duration||9e12)-(+b.duration||9e12)),fastest=ordered[0],saving=fastest&&routeClientKey(fastest)!==routeClientKey(r)?Math.max(0,Math.round(((+r.duration||0)-(+fastest.duration||0))/60)):0,second=ordered.find(x=>routeClientKey(x)!==routeClientKey(r)),gain=second?Math.max(0,Math.round(((+second.duration||0)-(+r.duration||0))/60)):0;let text=r.event_variant?'Desvio de evento ativo':routeMode==='fastest'?(gain>0?`Mais rápida · economiza ${gain} min`:'Menor ETA agora'):(saving>0?`Mais segura · +${saving} min`:'Recomendada agora');decision.querySelector('span').textContent=text;}
  const liveFlowMeta=+r.live_flow_cells>0?` · VANO MAPS Flow ${r.live_flow_cells} cél.`:'',firstJam=(r.traffic_corridors||[])[0],delay=+r.traffic_delay_min||0,trafficDetail=firstJam?` · ${esc(firstJam.street||'trecho à frente')}`:'',delayText=delay>=.5?` · +${delay<10?delay.toFixed(1):Math.round(delay)} min`:'';const traffic=isMotorizedProfile()?`<div class="traffic-line"><span>Trânsito ${esc(r.traffic_level||'—')}${trafficDetail}${delayText}${liveFlowMeta}</span><span class="traffic-bar"><i style="width:${Math.min(100,+r.traffic_score||0)}%"></i></span><span>${Math.round(+r.traffic_score||0)}/100</span></div>`:'';const altCount=Math.max(1,(routes||[]).filter(x=>x?.geometry).length),modeCard=routeModeLabel(),profileCard=profileRouteLabel(),trafficCard=isMotorizedProfile()?(r.traffic_level||'Tráfego estável'):'Trajeto a pé',decisionCard=r.event_variant?'Contorno de evento':(routeMode==='fastest'?'Menor ETA agora':'Rota equilibrada'),glanceGrid=`<div class="route-deep-grid"><div class="route-deep-chip"><small>PRIORIDADE</small><b>${esc(modeCard)}</b><span>${routeMode==='fastest'?'ganhar tempo no trânsito atual':'evitar risco e manter consistência'}</span></div><div class="route-deep-chip"><small>TRANSPORTE</small><b>${esc(profileCard)}</b><span>${altCount>1?`${Math.min(4,altCount)} alternativas comparadas`:'trajeto confirmado'}</span></div><div class="route-deep-chip"><small>SITUAÇÃO</small><b>${esc(trafficCard)}</b><span>${firstJam?esc(firstJam.street||'trecho monitorado'):'fluxo acompanhado em tempo real'}</span></div></div>`,routeStory=`<div class="route-story-line"><i data-lucide="sparkles" width="14"></i><span>${esc(decisionCard)} · ${routeMode==='fastest'?'ajustada para manter a chegada no menor tempo possível':'ajustada para equilibrar tempo, alertas e contexto da via'}.</span></div>`;
  const eventName=(r.event_avoid_names||[])[0]||cleanEventName((r.event_disruptions||[])[0]),eventGain=+r.event_effective_gain_min||0,eventNote=r.event_variant?`<div class="smart-note"><span class="live-dot"></span><b>Contorno de evento</b> · evita movimento intenso em ${esc(eventName)}${eventGain>=.5?` · ganho estimado ${eventGain.toFixed(1)} min`:''}.</div>`:((r.event_disruptions||[]).length?`<div class="risk-note"><i data-lucide="calendar-clock" width="12"></i><span>Movimento de evento monitorado perto de ${esc(eventName)}.</span></div>`:'');
  const risk=(r.risk_zones?.length||r.risk_factors?.length)?`<div class="risk-note"><i data-lucide="shield-alert" width="12"></i><span>${esc((r.risk_factors&&r.risk_factors[0])||`${r.risk_zones.length} zona(s) de atenção próxima(s)`)}</span></div>`:'';
  const long=r.distance>=350000?'<span>longa distância</span>':'';
  if(fastOnly){
    const gain=+r.eta_gain_min||0,street=(r.micro_streets||[])[0]||'',micro=r.micro_route?`<div class="smart-note"><span class="live-dot"></span><b>Atalho por quarteirão</b> · ${street?`desvio em ${esc(street)} · `:''}contorna ${r.micro_avoided_points||1} gargalo(s)${gain>=.1?` · economiza ${gain<1?Math.round(gain*60)+' s':gain.toFixed(1)+' min'}`:''}.</div>`:'';
    $('routeCard').className='route-card fast-selected';
    $('routeCard').innerHTML=`<div class="route-card-top"><div><h3>${manualRouteSelection?'Alternativa escolhida':'Rota mais rápida'}</h3><div class="safety-level"><span class="level-pill"><i data-lucide="zap" width="10"></i>ETA</span><strong>${manualRouteSelection?'Alternativa escolhida por você':'Prioriza o menor tempo de chegada'}</strong></div></div><div class="mins">${esc(fmtDuration(r.duration_min))}</div></div>${glanceGrid}${traffic}${eventNote}${micro}${routeStory}<div class="route-ai"><span class="vano-dot"></span><b>Por que esta rota?</b><span>Menor tempo estimado entre as alternativas disponíveis agora.</span></div>`;
    setAmbient(3);renderRouteVariants();drawRoute();updateRoadLayer();syncPremiumRouteCards();if(window.lucide)lucide.createIcons();return;
  }
  const safeBypass=r.safety_variant?`<div class="smart-note"><span class="live-dot"></span><b>Desvio de segurança</b> · ${r.safety_avoided_points||1} ponto(s) verificado(s) evitado(s)${+r.safety_gain_vs_fastest>0?` · +${Math.round(+r.safety_gain_vs_fastest)} segurança`:''}${+r.eta_delta_vs_fastest_min>0?` · +${(+r.eta_delta_vs_fastest_min).toFixed(1)} min`:''}.</div>`:'';
  $('routeCard').className='route-card';
  $('routeCard').innerHTML=`<div class="route-card-top"><div><h3>${esc(routeName())}</h3><div class="safety-level"><span class="level-pill"><i data-lucide="shield" width="10"></i>${level}/5</span><span class="safety-dots">${dots}</span><strong>${esc(r.safety_level_label||'Atenção')}</strong></div></div><div class="mins">${esc(fmtDuration(r.duration_min))}</div></div>${glanceGrid}${traffic}${eventNote}${safeBypass}${risk}${routeStory}<div class="route-ai"><span class="vano-dot"></span><b>Por que esta rota?</b><span>Equilibra tempo de chegada, alertas recentes e contexto das vias.</span>${r.decision_reasons?.length?`<span> ${esc(r.decision_reasons.slice(0,2).join(' · '))}</span>`:''}</div>`;
  setAmbient(level);renderRouteVariants();drawRoute();updateRoadLayer();syncPremiumRouteCards();if(window.lucide)lucide.createIcons();
}
function drawRoute(){if(!selectedRoute?.geometry||!map.getSource('routes'))return;if(activeNav?.classList.contains('show')){buildMetrics();setNavigationRouteFocus(true);setNavRouteData();updateAnimatedRoutePaint(true);return}setNavigationRouteFocus(false);map.getSource('routes').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:selectedRoute.geometry}]});map.getSource('route-alternatives')?.setData(alternativeRoutesFC());map.getSource('route-progress')?.setData(emptyFC());updateTrafficSegmentLayer();updateAnimatedRoutePaint(true);const b=new mapboxgl.LngLatBounds();selectedRoute.geometry.coordinates.forEach(c=>b.extend(c));map.fitBounds(b,{padding:{top:220,bottom:325,left:35,right:35},maxZoom:16,duration:650})}
function buildMetrics(){const c=selectedRoute?.geometry?.coordinates||[];routeCumulative=new Array(c.length).fill(0);for(let i=1;i<c.length;i++)routeCumulative[i]=routeCumulative[i-1]+hav(c[i-1],c[i]);routeTotalGeometry=routeCumulative.at(-1)||selectedRoute?.distance||1}
function projectSegmentMeters(p,a,b){const lat0=p.lat*Math.PI/180,mx=111320*Math.max(.15,Math.cos(lat0)),my=110540,ax=(a[0]-p.lon)*mx,ay=(a[1]-p.lat)*my,bx=(b[0]-p.lon)*mx,by=(b[1]-p.lat)*my,vx=bx-ax,vy=by-ay,vv=vx*vx+vy*vy,t=vv>1e-6?Math.max(0,Math.min(1,-(ax*vx+ay*vy)/vv)):0,x=ax+vx*t,y=ay+vy*t;return{distance:Math.hypot(x,y),t}}
function nearestProgress(p){const c=selectedRoute?.geometry?.coordinates||[];if(!c.length)return{distanceAlong:0,remaining:selectedRoute?.distance||0,progress:0,offRoute:0,index:0};if(c.length===1)return{distanceAlong:0,remaining:selectedRoute?.distance||0,progress:0,offRoute:hav([p.lon,p.lat],c[0]),index:0};let best=Infinity,bestI=0,bestT=0,stride=Math.max(1,Math.floor((c.length-1)/1100));for(let i=0;i<c.length-1;i+=stride){const j=Math.min(c.length-1,i+stride),pr=projectSegmentMeters(p,c[i],c[j]);if(pr.distance<best){best=pr.distance;bestI=i;bestT=pr.t}}const start=Math.max(0,bestI-stride*2),end=Math.min(c.length-2,bestI+stride*3);for(let i=start;i<=end;i++){const pr=projectSegmentMeters(p,c[i],c[i+1]);if(pr.distance<best){best=pr.distance;bestI=i;bestT=pr.t}}const seg=Math.max(0,(routeCumulative[bestI+1]||routeCumulative[bestI]||0)-(routeCumulative[bestI]||0)),along=(routeCumulative[bestI]||0)+seg*bestT,progress=Math.max(0,Math.min(1,along/routeTotalGeometry)),idx=Math.min(c.length-1,bestI+(bestT>.55?1:0));return{distanceAlong:along,remaining:Math.max(0,(selectedRoute.distance||routeTotalGeometry)*(1-progress)),progress,offRoute:best,index:idx}}
function currentStep(along){const s=selectedRoute?.steps||[];let sum=0;for(let i=0;i<s.length;i++){const x=s[i];sum+=+x.distance||0;if(along<=sum)return{...x,stepIndex:i,remainingInStep:Math.max(0,sum-along)}}return s.length?{...s.at(-1),stepIndex:s.length-1,remainingInStep:0}:{instruction:'Siga pela rota indicada',stepIndex:0,remainingInStep:0}}
function updateTurnHighlight(along,step){if(window.__vanoNativeMapActive&&activeNav?.classList.contains('show'))return;const src=map?.getSource('nav-turn');if(!src||!selectedRoute||!step)return;const rem=Math.max(0,+step.remainingInStep||0),type=String(step.type||'').toLowerCase(),modifier=String(step.modifier||'').toLowerCase(),isDecision=['turn','fork','merge','roundabout','rotary','end of road','continue','new name'].includes(type)||modifier.includes('left')||modifier.includes('right')||modifier.includes('uturn');if(!isDecision||rem>260||rem<4){src.setData(emptyFC());return}const turnAt=Math.min(routeTotalGeometry-1,(+along||0)+rem),start=Math.max(+along||0,turnAt-Math.min(105,Math.max(38,rem*.72))),end=Math.min(routeTotalGeometry-1,turnAt+18),coords=[];for(let d=start;d<=end;d+=Math.max(5,Math.min(11,(end-start)/10||7))){const pt=routePointAtDistance(d);if(pt)coords.push(pt)}const last=routePointAtDistance(end);if(last)coords.push(last);src.setData(coords.length>1?{type:'FeatureCollection',features:[{type:'Feature',properties:{type,modifier},geometry:{type:'LineString',coordinates:coords}}]}:emptyFC())}
function maneuverLabel(step){const t=String(step?.type||''),m=String(step?.modifier||'');if(t==='arrive')return'Chegue ao destino';if(t==='depart')return'Siga em frente';if(t==='roundabout'||t==='rotary')return step?.exit?`Pegue a saída ${step.exit}`:'Entre na rotatória';if(t==='merge')return'Entre na via';if(t==='fork')return m.includes('left')?'Mantenha-se à esquerda':m.includes('right')?'Mantenha-se à direita':'Siga pela bifurcação';if(t==='turn'||t==='end of road'||t==='continue'||t==='new name'){if(m.includes('uturn'))return'Faça o retorno';if(m.includes('left'))return'Vire à esquerda';if(m.includes('right'))return'Vire à direita';if(m.includes('straight'))return'Siga em frente'}return step?.instruction||'Siga pela rota indicada'}
function stepStreet(step){const n=String(step?.name||'').trim();if(n)return n;const i=String(step?.instruction||'');const mt=i.match(/(?:na|no|em|para)\s+(.+)$/i);return mt?.[1]?.trim()||'Via indicada'}
function maneuverGlyph(step){const m=String(step?.modifier||'').toLowerCase(),t=String(step?.type||'').toLowerCase();if(t.includes('roundabout')||t.includes('rotary'))return '↻';if(m.includes('sharp left'))return '↰';if(m.includes('sharp right'))return '↱';if(m.includes('slight left'))return '↖';if(m.includes('slight right'))return '↗';if(m.includes('left'))return '←';if(m.includes('right'))return '→';if(t.includes('uturn')||m.includes('uturn'))return '↶';return '↑'}
function laneGlyph(indications){const x=(indications||[]).join(' ').toLowerCase();if(x.includes('left')&&x.includes('straight'))return '↖';if(x.includes('right')&&x.includes('straight'))return '↗';if(x.includes('left'))return '←';if(x.includes('right'))return '→';if(x.includes('uturn'))return '↶';return '↑'}
function renderLaneGuidance(step){const box=$('laneGuidance'),items=$('laneItems'),lanes=step?.lanes||[];if(!isMotorizedProfile()||!lanes.length||(step.remainingInStep??9999)>650){box.classList.remove('show');items.innerHTML='';return}items.innerHTML=lanes.map(l=>`<span class="lane ${l.valid?'valid':''} ${l.active?'active':''}">${laneGlyph(l.indications)}</span>`).join('');box.classList.add('show')}
function nextRiskAhead(m){if(!selectedRoute)return null;const events=[];for(const ev of selectedRoute.event_disruptions||[]){if(!Number.isFinite(+ev.lat)||!Number.isFinite(+ev.lon)||ev.destination_related)continue;const n=nearestProgress({lat:+ev.lat,lon:+ev.lon}),delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<Math.max(500,+ev.radius_m||850)&&delta>=-80&&delta<=2600)events.push({kind:'event',distance:Math.max(0,delta),title:`Evento/movimento · ${cleanEventName(ev)}`,copy:`Pressão ${Math.round(+ev.pressure_score||0)}/100 · VANO MAPS buscando contorno`,severity:(+ev.pressure_score||0)>=78?5:4})}for(const a of selectedRoute.nearby_alerts||[]){if(!Number.isFinite(+a.lat)||!Number.isFinite(+a.lon)||(+a.severity||0)<3)continue;const n=nearestProgress({lat:+a.lat,lon:+a.lon}),delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<150&&delta>=-20&&delta<=1600)events.push({kind:'alert',distance:Math.max(0,delta),title:a.category_label||a.title||'Alerta recente',copy:`Severidade ${a.severity}/5 · ${a.confirmations||0} confirmação(ões)`,severity:+a.severity||3})}for(const z of selectedRoute.risk_zones||[]){if(!Number.isFinite(+z.lat)||!Number.isFinite(+z.lon))continue;const n=nearestProgress({lat:+z.lat,lon:+z.lon}),delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<Math.max(160,+z.radius_m||350)&&delta>=-40&&delta<=1800)events.push({kind:'zone',distance:Math.max(0,delta),title:z.name||'Zona de atenção',copy:`Nível máximo estimado ${z.level_cap}/5 · área monitorada`,severity:Math.max(3,5-(+z.level_cap||3))})}return events.sort((a,b)=>a.distance-b.distance||b.severity-a.severity)[0]||null}
function renderRiskAhead(m){const box=$('riskAhead'),x=nextRiskAhead(m);if(!x||x.distance>1400){box.classList.remove('show');return}$('riskAheadTitle').textContent=x.title;$('riskAheadCopy').textContent=x.copy;$('riskAheadDistance').textContent=x.distance<25?'agora':fmtDistance(x.distance);box.classList.add('show')}
function maybeSpeakStep(step){
  if(!soundEnabled||!step)return;
  const d=Math.max(0,+step.remainingInStep||0),prompts=(step.voice_prompts||[]).filter(x=>x&&x.announcement).slice().sort((a,b)=>(+b.distance||0)-(+a.distance||0));
  for(let i=0;i<prompts.length;i++){
    const vp=prompts[i],trigger=Math.max(0,+vp.distance||0),key=`${step.stepIndex}:voice:${i}`;
    if(d<=trigger+18&&!spokenMilestones.has(key)){
      spokenMilestones.add(key);speak(vp.announcement,key);return;
    }
  }
  const threshold=d<=45?45:d<=120?120:d<=360?360:null;if(!threshold)return;
  const key=`${step.stepIndex}:fallback:${threshold}`;if(spokenMilestones.has(key))return;spokenMilestones.add(key);
  const prefix=threshold<=45?'Agora':`Em ${Math.max(50,Math.round(d/10)*10)} metros`;speak(`${prefix}, ${step.instruction||'siga pela rota'}`,key);
}

function updateProgressLine(index){if(activeNav?.classList.contains('show')){map.getSource('route-progress')?.setData(emptyFC());return}const c=selectedRoute?.geometry?.coordinates||[];if(index<1||!map.getSource('route-progress'))return;map.getSource('route-progress').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c.slice(0,index+1)}}]})}
async function requestWake(){try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen')}catch{}}
async function releaseWake(){try{await wakeLock?.release()}catch{}wakeLock=null}
function normalizeVanoText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.,;:!?]/g,' ').replace(/\s+/g,' ').trim()}
function vanoSegmentsForText(value){
  const t=normalizeVanoText(value),out=[];let maneuverMatched=false;
  const add=f=>{if(f&&!out.includes(f))out.push(f)};
  if(/\bem\s+50\s+metros?\b/.test(t))add(VANO_ASSETS.em50);
  else if(/\bem\s+200\s+metros?\b/.test(t))add(VANO_ASSETS.em200);
  else if(/\bem\s+300\s+metros?\b/.test(t))add(VANO_ASSETS.em300);
  else if(/\bem\s+500\s+metros?\b/.test(t))add(VANO_ASSETS.em500);
  else if(/\bem\s+(?:1|um)\s+(?:km|quilometro)\b/.test(t))add(VANO_ASSETS.em1km);
  else if(/\bem\s+(?:2|dois)\s+(?:km|quilometros)\b/.test(t))add(VANO_ASSETS.em2km);
  const maneuver=f=>{add(f);maneuverMatched=true};
  if(t.includes('chegou ao destino')||t.includes('voce chegou ao destino'))maneuver(VANO_ASSETS.chegou);
  else if(t.includes('destino')&&t.includes('esquerda'))maneuver(VANO_ASSETS.destinoEsquerda);
  else if(t.includes('faca o retorno')||t.includes('faca retorno')||t.includes('retorno'))maneuver(VANO_ASSETS.facaRetorno);
  else if(t.includes('leve curva')&&t.includes('esquerda'))maneuver(VANO_ASSETS.leveEsquerda);
  else if(t.includes('leve curva')&&t.includes('direita'))maneuver(VANO_ASSETS.leveDireita);
  else if(t.includes('mantenha-se a direita')||t.includes('mantenha se a direita'))maneuver(VANO_ASSETS.mantenhaSeDireita);
  else if(t.includes('mantenha a direita'))maneuver(VANO_ASSETS.mantenhaDireita);
  else if(t.includes('mantenha-se a esquerda')||t.includes('mantenha se a esquerda')||t.includes('mantenha a esquerda'))maneuver(VANO_ASSETS.mantenhaEsquerda);
  else if(t.includes('vire a direita'))maneuver(VANO_ASSETS.vireDireita);
  else if(t.includes('continue em frente'))maneuver(VANO_ASSETS.continueFrente);
  else if(t.includes('siga em frente')||t.includes('siga pela rota'))maneuver(VANO_ASSETS.sigaFrente);
  const needsManeuver=/\b(vire|curva|mantenha|retorno|destino|rotatoria|rotatória|saida|saída|siga|continue|entre na via)\b/.test(t);
  return needsManeuver&&!maneuverMatched?[]:out;
}
function speakAutomatic(text){
  text=window.VANO_I18N?.t?.(String(text))||String(text);
  try{if(window.Android&&typeof window.Android.speak==='function'){window.Android.speak(String(text));return true}}catch{}
  if(!('speechSynthesis'in window))return false;
  try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text));u.lang=String(BOOT.locale||window.VANO_ACTIVE_LOCALE||'pt-BR');u.rate=1.01;u.pitch=1;const voices=window.speechSynthesis.getVoices?.()||[],want=String(BOOT.locale||window.VANO_ACTIVE_LOCALE||'pt-BR'),base=want.split('-')[0],chosen=voices.find(v=>String(v.lang||'').toLowerCase()===want.toLowerCase())||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base.toLowerCase()));if(chosen){u.voice=chosen;u.lang=chosen.lang||u.lang}window.speechSynthesis.speak(u);return true}catch(e){console.debug('[VANO MAPS:voice-auto]',e);return false}
}
async function playVanoSequence(files,fallbackText){
  if(!files?.length)return speakAutomatic(fallbackText);
  stopVanoVoice();try{window.speechSynthesis?.cancel()}catch{}
  const generation=vanoAudioGeneration;
  for(const file of files){
    if(generation!==vanoAudioGeneration||!soundEnabled||selectedVoiceName!=='vano')return false;
    const ok=await new Promise(resolve=>{
      const a=getVanoAudio();try{a.pause()}catch{}a.src=vanoUrl(file);a.volume=1;a.preload='auto';
      let done=false;const finish=v=>{if(done)return;done=true;a.onended=a.onerror=null;resolve(v)};
      a.onended=()=>finish(true);a.onerror=()=>finish(false);
      const play=a.play();if(play?.catch)play.catch(()=>finish(false));
      setTimeout(()=>finish(false),6500);
    });
    if(generation!==vanoAudioGeneration)return false;
    if(!ok){stopVanoVoice();return speakAutomatic(fallbackText)}
  }
  if(generation===vanoAudioGeneration)vanoAudio=null;
  return true;
}
function speak(text,key=text){
  if(!soundEnabled||!text||key===lastSpokenInstruction)return;lastSpokenInstruction=key;
  const locale=String(BOOT.locale||window.VANO_ACTIVE_LOCALE||'pt-BR');
  if(selectedVoiceName==='vano'&&locale.toLowerCase().startsWith('pt')){const files=vanoSegmentsForText(text);if(files.length){playVanoSequence(files,String(text));return}}
  stopVanoVoice();speakAutomatic(String(text));
}
function setLayerVisibility(id,visible){try{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')}catch{}}
function applyMapPrefs(){const live=!!mapPrefs.liveSignals;setLayerVisibility('road-controls-dot',live);setLayerVisibility('road-controls-pulse',live);['vano-traffic-probe','vano-traffic-glow','vano-traffic-flow','vano-traffic-core','vano-traffic-hotspot-glow','vano-traffic-hotspot-dot'].forEach(id=>setLayerVisibility(id,live));if(!live){if(map?.getSource('road-controls'))map.getSource('road-controls').setData(emptyFC());if(map?.getSource('vano-traffic-visible'))map.getSource('vano-traffic-visible').setData(emptyFC())}else{scheduleSignalRefresh(true);scheduleTrafficSnapshot(true)}if(map?.getSource('route-alternatives'))map.getSource('route-alternatives').setData(alternativeRoutesFC());renderRouteVariants();updateTrafficRadar(true);if(activeNav?.classList.contains('show'))setNavigationRouteFocus(true)}
function syncPrefsUI(){[['prefAdaptive','adaptiveRoutes'],['prefAggressive','aggressiveShortcuts'],['prefAlternatives','showAlternatives'],['prefLiveSignals','liveSignals'],['prefAutoFaster','autoFaster']].forEach(([id,key])=>{const el=$(id);if(el)el.checked=!!mapPrefs[key]})}
function openPrefsDrawer(force){const d=$('prefsDrawer');if(!d)return;const open=typeof force==='boolean'?force:!d.classList.contains('show');d.classList.toggle('show',open);$('prefsBtn')?.classList.toggle('active',open);if(open){openSafetyDrawer(false);syncPrefsUI();populateVoiceSelectors()}}
function bindPref(id,key,recalc=false){const el=$(id);if(!el)return;el.addEventListener('change',()=>{mapPrefs[key]=!!el.checked;saveMapPrefs();applyMapPrefs();routeResponseCache.clear();if(recalc&&origin&&destination)calculateRoutes()})}

async function loadSharedRoute(){if(!SHARED_TOKEN)return;try{const r=await fetch('/api/shared-route/'+encodeURIComponent(SHARED_TOKEN)),d=await r.json();if(!r.ok)throw new Error(d.error||'Rota compartilhada indisponível.');profile=d.profile||'driving';routeMode=d.mode==='fastest'?'fastest':'safest';origin=d.origin;destination=d.destination;destinationConfirmed=true;originInput.value=origin.label||'Origem';destinationInput.value=destination.label||'Destino';if(originMarker)originMarker.remove();if(destinationMarker)destinationMarker.remove();originMarker=new mapboxgl.Marker({element:markerEl('origin')}).setLngLat([origin.lon,origin.lat]).addTo(map);destinationMarker=new mapboxgl.Marker({element:markerEl('destination'),anchor:'bottom',offset:[0,0]}).setLngLat([destination.lon,destination.lat]).addTo(map);selectedRoute=d.route;routes=[selectedRoute];document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===profile));document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.toggle('active',x.dataset.routeMode===routeMode));planSheet.classList.remove('sheet-collapsed');welcomeState.style.display='none';routeState.style.display='block';renderRoute();showToast('Rota compartilhada pronta para usar.')}catch(e){showToast(e.message)}}
function futureTrafficPoints(m){const c=selectedRoute?.geometry?.coordinates||[];if(!c.length||!routeCumulative.length)return[];const along=m?.distanceAlong||0,targets=[550,1600,3600,7000].map(x=>along+x).filter(x=>x<routeTotalGeometry-80),out=[];for(const target of targets){let lo=Math.max(0,m?.index||0),hi=routeCumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(routeCumulative[mid]<target)lo=mid+1;else hi=mid}if(c[lo])out.push(c[lo])}return out}
function eventProbePoints(route,maxPoints=8){
  const c=route?.geometry?.coordinates||[];if(c.length<2)return[];const n=Math.max(2,Math.min(maxPoints,c.length)),out=[];
  for(let i=0;i<n;i++){const idx=Math.round(i*(c.length-1)/(n-1)),p=c[idx];if(p&&p.length>=2&&(!out.length||hav(out.at(-1),p)>18))out.push([+p[0],+p[1]])}
  return out;
}
function cleanEventName(ev){return String(ev?.venue_name||ev?.name||'área de evento').trim()||'área de evento'}
function upcomingEventDisruption(along=0,maxAhead=3500){
  if(!selectedRoute)return null;const events=selectedRoute.event_disruptions||[];if(!events.length)return null;if(!routeCumulative.length)buildMetrics();const found=[];
  for(const ev of events){if(!Number.isFinite(+ev.lat)||!Number.isFinite(+ev.lon))continue;const n=nearestProgress({lat:+ev.lat,lon:+ev.lon}),radius=Math.max(450,+ev.radius_m||850),ahead=n.distanceAlong-along;if(ev.destination_related){if(ahead>=-300&&ahead<=Math.max(maxAhead,routeTotalGeometry))found.push({...ev,ahead:Math.max(0,ahead),offRoute:n.offRoute,destination_related:true});continue}if(n.offRoute<=radius&&ahead>=-180&&ahead<=maxAhead)found.push({...ev,ahead:Math.max(0,ahead),offRoute:n.offRoute})}
  return found.sort((a,b)=>Math.max(0,a.ahead)-Math.max(0,b.ahead)||(+b.pressure_score||0)-(+a.pressure_score||0))[0]||null;
}
function eventRadar(ev){const box=$('trafficRadar');if(!box||!ev)return;const name=cleanEventName(ev),ahead=Math.max(0,+ev.ahead||0),score=+ev.pressure_score||0;box.classList.toggle('severe',score>=76);$('trafficRadarTitle').textContent=ev.destination_related?`Evento próximo ao destino · ${name}`:`Movimento de evento à frente · ${name}`;$('trafficRadarMeta').textContent=ev.destination_related?'Os acessos finais podem mudar':`${ahead<50?'agora':fmtDistance(ahead)+' à frente'} · VANO MAPS monitorando contorno`;box.classList.add('show')}
function attachEventState(events=[]){if(!selectedRoute)return;selectedRoute.event_disruptions=Array.isArray(events)?events:[];const key=(selectedRoute.event_disruptions||[]).map(x=>`${cleanEventName(x)}:${Math.round(+x.pressure_score||0)}`).join('|');if(key&&key!==lastEventNoticeKey){lastEventNoticeKey=key;updateTrafficRadar(true)}}
async function checkEventDisruption(force=false,{pretrip=false}={}){
  if(!isMotorizedProfile()||!destination||!selectedRoute||eventChecking)return;if(!pretrip&&!activeNav?.classList.contains('show'))return;
  const now=Date.now(),routeKey=`${routeClientKey(selectedRoute)}:${(+destination.lat).toFixed(4)}:${(+destination.lon).toFixed(4)}`;
  if(!force&&now<eventStickyUntil&&selectedRoute.event_variant)return;if(!force&&routeKey===lastEventRouteKey&&now-lastEventScanAt<180000)return;if(!force&&now-lastEventScanAt<150000)return;
  const start=pretrip?(origin||userLocation):(lastNavPosition||userLocation||origin);if(!start||!Number.isFinite(+start.lat)||!Number.isFinite(+start.lon))return;
  eventChecking=true;lastEventScanAt=now;lastEventRouteKey=routeKey;
  try{
    const body={current_lat:+start.lat,current_lon:+start.lon,destination_lat:+destination.lat,destination_lon:+destination.lon,route_points:eventProbePoints(selectedRoute,8),route_mode:routeMode,profile,local_hour:new Date().getHours(),current_safety_level:selectedRoute.safety_level??3,heading:Number.isFinite(+start.heading)?+start.heading:null,speed:Number.isFinite(+start.speed)?Math.max(0,+start.speed):null};
    const r=await fetch('/api/event-route-check',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.error||'Falha na checagem de evento');
    if(Array.isArray(d.events)&&d.events.length)attachEventState(d.events);else if(!d.active&&selectedRoute&&!selectedRoute.event_variant)selectedRoute.event_disruptions=[];
    if(d.destination_event&&d.events?.length){const ev=d.events.find(x=>x.destination_related)||d.events[0];eventRadar({...ev,ahead:selectedRoute.distance||0});return}
    const route=d?.suggestion?.route;if(!d.recommend||!route?.geometry?.coordinates?.length){if(d.active&&d.events?.length)updateTrafficRadar(true);return}
    mergeNavigationAlternative(route);route.event_disruptions=d.events||[];
    const eventName=cleanEventName((d.events||[]).find(x=>!x.destination_related)||(d.events||[])[0]);
    const navActive=!!activeNav?.classList.contains('show');
    if(pretrip&&!navActive){
      if(d.auto_apply&&!manualRouteSelection){selectedRoute=route;if(activeNav?.classList.contains('show'))vanoSyncNativeMapRoute(lastNavPosition||userLocation);eventStickyUntil=Date.now()+12*60*1000;eventStickyName=eventName;renderRoute();showToast(`Rota ajustada para contornar movimento em ${eventName}.`)}else{renderRouteVariants();updateTrafficRadar(true)}
      return;
    }
    if(d.auto_apply&&navActive){trafficSuggestionRoute=route;eventStickyUntil=Date.now()+12*60*1000;eventStickyName=eventName;productTelemetry('route','event-detour-applied','navigation');applyTrafficSuggestion();showToast(`Desvio de evento aplicado · ${eventName}.`);speak(`Movimento intenso de evento à frente. Ajustei a rota para contornar.`,'event-detour-'+Date.now());}
    else{refreshNavigationAlternatives(true);eventRadar({...((d.events||[])[0]||{}),ahead:0});}
  }catch(e){console.debug('[VANO MAPS:event-intelligence]',e)}finally{eventChecking=false}
}

function hideTrafficSuggestion(){trafficSuggestionRoute=null;trafficSuggestionMeta=null;$('trafficSuggestion').classList.remove('show','urgent','worsening')}
function showTrafficSuggestion(route,data={}){if(!route||!activeNav?.classList.contains('show'))return;const saving=Math.max(0,+data.saving_seconds||((+selectedRoute?.duration||0)-(+route.duration||0))),mins=Math.max(1,Math.round(saving/60));if(saving<ROUTE_SUGGEST_MIN_S)return;trafficSuggestionRoute=route;trafficSuggestionMeta={...data,saving_seconds:saving};const box=$('trafficSuggestion');$('trafficSuggestionTitle').textContent=`Economiza ${mins} min`;$('trafficSuggestionCopy').textContent=data.traffic_worsening?'O trânsito está piorando antes de você chegar.':(route.micro_route?'Desvio mais rápido encontrado no corredor à frente.':'Encontramos uma alternativa com ETA melhor.');box.classList.toggle('urgent',saving>=ROUTE_AUTO_MIN_S);box.classList.toggle('worsening',!!data.traffic_worsening);box.classList.add('show');productTelemetry('route',`traffic-suggestion:${mins}m${data.traffic_worsening?':worsening':''}`,'navigation')}
function applyTrafficSuggestion(){if(!trafficSuggestionRoute||!lastNavPosition)return;const route=trafficSuggestionRoute,data=trafficSuggestionMeta||{},saving=Math.max(0,+data.saving_seconds||((+selectedRoute?.duration||0)-(+route.duration||0)));if(routeSwitchBlocked(route,saving)){hideTrafficSuggestion();return}const m=nearestProgressOnRoute(lastNavPosition,route);hideTrafficSuggestion();adoptNavigationAlternative(route,lastNavPosition,m,{automatic:!!data.auto_apply,reason:data.traffic_worsening?'traffic-worsening':'traffic'})}
function trafficSegmentFC(){const segs=isMotorizedProfile()?(selectedRoute?.traffic_segments||[]):[];return{type:'FeatureCollection',features:segs.filter(x=>Array.isArray(x.coordinates)&&x.coordinates.length>1).map((x,i)=>({type:'Feature',properties:{score:+x.score||0,level:x.level||'',bucket:x.bucket||'',street:x.street||'',start_m:+x.distance_start_m||0,end_m:+x.distance_end_m||0,i},geometry:{type:'LineString',coordinates:x.coordinates}}))}}
function updateTrafficSegmentLayer(){if(map?.getSource('traffic-live-segments'))map.getSource('traffic-live-segments').setData(activeNav?.classList.contains('show')?emptyFC():trafficSegmentFC());if(activeNav?.classList.contains('show'))setNavRouteData();updateTrafficRadar(false)}
function upcomingTrafficCorridor(along=0,maxAhead=1800){if(!isMotorizedProfile()||!selectedRoute)return null;const list=(selectedRoute.traffic_corridors||[]).map(x=>({...x,ahead:(+x.distance_start_m||0)-along})).filter(x=>x.ahead>=-100&&x.ahead<=maxAhead).sort((a,b)=>Math.max(0,a.ahead)-Math.max(0,b.ahead)||(+b.score||0)-(+a.score||0));return list[0]||null}
function updateTrafficRadar(force=false,along=null){const box=$('trafficRadar');if(!box)return;if(!isMotorizedProfile()||!selectedRoute){box.classList.remove('show','severe','speed-camera');return}const now=performance.now();if(!force&&now-lastTrafficRadarAt<700)return;lastTrafficRadarAt=now;const pos=Number.isFinite(along)?along:(activeNav?.classList.contains('show')&&lastNavPosition?nearestProgress(lastNavPosition).distanceAlong:0),camera=upcomingSpeedCamera(pos,1200);if(camera){const ahead=Math.max(0,+camera.ahead||0);box.classList.remove('severe');box.classList.add('speed-camera');$('trafficRadarTitle').textContent='Radar de velocidade à frente';$('trafficRadarMeta').textContent=`${ahead<35?'agora':fmtDistance(ahead)+' à frente'}${currentMappedSpeedLimitKmh?` · limite ${currentMappedSpeedLimitKmh} km/h`:''} · dirija no limite`;box.classList.add('show');maybeWarnSpeedCamera(camera);return}box.classList.remove('speed-camera');const ev=upcomingEventDisruption(pos,3500);if(ev){eventRadar(ev);return}const x=upcomingTrafficCorridor(pos,2200);if(!x){box.classList.remove('show','severe');return}const ahead=Math.max(0,+x.ahead||0),score=+x.score||0,delay=Math.max(0,+x.delay_s||0),key=`${x.street}:${Math.round(ahead/100)}:${Math.round(score/10)}`;if(!force&&key===lastTrafficRadarKey)return;lastTrafficRadarKey=key;box.classList.toggle('severe',score>=78);$('trafficRadarTitle').textContent=`${x.street||'Trânsito à frente'} · ${String(x.level||'trânsito').toLowerCase()}`;$('trafficRadarMeta').textContent=`${ahead<40?'agora':fmtDistance(ahead)+' à frente'}${delay>=45?` · +${Math.max(1,Math.round(delay/60))} min neste trecho`:''}`;box.classList.add('show')}

function clearLiveRoad(){liveContext=null;lastLiveContextAt=0;lastLiveContextPos=null;lastFlowProbeAt=0}

async function checkLiveTraffic(force=false){
  if(!mapPrefs.autoFaster||!isMotorizedProfile()||!destination||!selectedRoute||!activeNav.classList.contains('show')||!lastNavPosition||trafficChecking)return;
  const now=Date.now(),speed=Math.max(0,+lastNavPosition.speed||0),interval=speed>8?32000:speed>2?42000:56000;if(!force&&now-lastTrafficCheckAt<interval)return;if(now<trafficDismissUntil)return;
  const m=nearestProgress(lastNavPosition);if(m.remaining<900)return;trafficChecking=true;lastTrafficCheckAt=now;$('liveTrafficText').textContent='Atualizando corredor…';
  try{
    const previous=trafficTrendSnapshot||{};
    const {r,d}=await vanoFetchJSON('/api/traffic-recommendation',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({current_lat:lastNavPosition.lat,current_lon:lastNavPosition.lon,destination_lat:destination.lat,destination_lon:destination.lon,current_safety_level:selectedRoute.safety_level??3,future_points:futureTrafficPoints(m),local_hour:new Date().getHours(),route_mode:routeMode,profile,heading:Number.isFinite(+lastNavPosition.heading)?+lastNavPosition.heading:null,speed:Number.isFinite(+lastNavPosition.speed)?Math.max(0,+lastNavPosition.speed):null,previous_traffic_score:Number.isFinite(+previous.score)?+previous.score:null,previous_delay_min:Number.isFinite(+previous.delay)?+previous.delay:null})},15000);if(!r.ok)throw new Error(d.error||'Falha ao atualizar corredor');
    trafficTrendSnapshot={score:+d.traffic_score||0,delay:+d.traffic_delay_min||0,ts:Date.now()};
    if(Array.isArray(d.hotspots)&&d.hotspots.length&&selectedRoute){const baseAlong=m.distanceAlong||0;selectedRoute.traffic_corridors=d.hotspots.map(x=>({...x,distance_start_m:baseAlong+(+x.distance_start_m||0),distance_end_m:baseAlong+(+x.distance_end_m||0)}));selectedRoute.traffic_delay_min=+d.traffic_delay_min||selectedRoute.traffic_delay_min||0;updateTrafficRadar(true,baseAlong)}
    if(d.traffic_worsening){$('liveTrafficText').textContent='Trânsito piorando à frente';if(Date.now()-lastTrafficTrendNoticeAt>180000){lastTrafficTrendNoticeAt=Date.now();productTelemetry('traffic',`worsening:${Math.round(+d.traffic_score_delta||0)}`,'navigation')}}else if(d.traffic_detected)$('liveTrafficText').textContent=`Trânsito ${String(d.traffic_level||'').toLowerCase()} à frente`;else if(d.mapped_road_detected)$('liveTrafficText').textContent='Contexto viário mapeado à frente';else $('liveTrafficText').textContent='Fluxo normal à frente';
    if(d.recommend&&d.suggestion?.route){
      const route=d.suggestion.route,saving=Math.max(0,+d.saving_seconds||0);mergeNavigationAlternative(route);
      const canAuto=!!d.auto_apply&&saving>=ROUTE_AUTO_MIN_S&&!routeSwitchBlocked(route,saving)&&Date.now()-lastRouteSwitchAt>120000;
      if(canAuto){trafficSuggestionRoute=route;trafficSuggestionMeta={...d,auto_apply:true};applyTrafficSuggestion();showToast(`Trânsito piorando · rota ajustada com ganho de ${Math.round(saving/60)} min.`)}
      else if(saving>=ROUTE_SUGGEST_MIN_S&&!routeSwitchBlocked(route,saving)){showTrafficSuggestion(route,d);refreshNavigationAlternatives(true);haptic(8)}
      else hideTrafficSuggestion();
    }else if(d.traffic_detected||d.mapped_road_detected||d.traffic_worsening)hideTrafficSuggestion();
  }catch(e){$('liveTrafficText').textContent=navigator.onLine?'Monitoramento do corredor ativo':'Sem internet · mantendo sua rota';if(!navigator.onLine)productTelemetry('connectivity','traffic-check-offline','navigation')}finally{trafficChecking=false}
}

async function performNavReroute(position,{manual=false}={}){
  if(rerouting||!destination||!selectedRoute)return;const p=position||lastNavPosition||userLocation;if(!p)return;if(navigator.onLine===false){showToast('Sem internet · mantendo a rota já carregada.');productTelemetry('connectivity','reroute-deferred-offline','navigation');return}if(manual)haptic(10);
  const previousRouteKey=routeClientKey(selectedRoute);rerouting=true;lastRerouteAt=Date.now();productTelemetry('route',manual?'reroute-manual':'reroute-auto','navigation');resetOffRouteTracker();const notice=$('rerouteNotice'),btn=$('navRecalculateBtn');notice?.classList.add('show');btn?.classList.add('recalculating');if(notice)notice.querySelector('span:last-child').textContent=manual?'Recalculando…':'Ajustando rota…';
  try{if(manual)routeResponseCache.clear();const start={lat:+p.lat,lon:+p.lon,label:'Minha localização',is_gps:true,is_reroute:true,heading:Number.isFinite(+p.heading)?+p.heading:null,speed:Number.isFinite(+p.speed)?Math.max(0,+p.speed):null,accuracy:Number.isFinite(+p.accuracy)?+p.accuracy:null};await fetchRoutes(start,true);const nextRouteKey=routeClientKey(selectedRoute);if(!manual&&previousRouteKey&&nextRouteKey===previousRouteKey)productTelemetry('route','reroute-same-corridor','navigation');origin=start;navSuppressedRouteKeys.clear();navAlternativeHitKey='';navAlternativeHitCount=0;buildMetrics();navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;lastNavRoutePaintAt=0;const m=nearestProgress(p),step=currentStep(m.distanceAlong);navLastAlong=Math.max(0,m.distanceAlong);setNavigationRouteFocus(true);setNavRouteData(navLastAlong);refreshNavigationAlternatives(true);updateRoadLayer();$('nextStreet').textContent=stepStreet(step);$('nextInstruction').textContent=maneuverLabel(step);updateNavSummary(selectedRoute.duration||0,m.remaining,step);scheduleCamera(p,true,m);showToast(manual?'Rota recalculada.':'Rota ajustada ao seu trajeto.')}catch(e){if(e?.name!=='AbortError')showToast(e?.message||'Não foi possível recalcular a rota.')}finally{rerouting=false;notice?.classList.remove('show');btn?.classList.remove('recalculating')}}
function rerouteFrom(p){if(Date.now()-lastRerouteAt<45000)return;return performNavReroute(p,{manual:false})}
function recalculateActiveRoute(){return performNavReroute(lastNavPosition||userLocation,{manual:true})}

async function toggleLiveShare(){if(!LOGGED_IN){showToast('Entre na sua conta para compartilhar sua posição ao vivo.');return}if(liveShareToken){const url=liveShareUrl;try{if(navigator.share)await navigator.share({title:'Acompanhe meu trajeto no VANO MAPS',text:'Estou compartilhando meu trajeto ao vivo.',url});else{await navigator.clipboard.writeText(url);showToast('Link ao vivo copiado.')}}catch(e){if(e?.name!=='AbortError')showToast('Não foi possível compartilhar o link.')}return}const btn=$('liveShareBtn');btn.disabled=true;try{const r=await fetch('/api/live-trip',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({destination_label:destination?.label||'Destino',safety_level:selectedRoute?.safety_level??3})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível iniciar o compartilhamento.');liveShareToken=d.token;liveShareUrl=d.url;btn.classList.add('live-active');btn.innerHTML='<i data-lucide="radio" width="13"></i>Ao vivo';if(window.lucide)lucide.createIcons();if(lastNavPosition)pushLivePosition(lastNavPosition,nearestProgress(lastNavPosition),true);if(navigator.share)await navigator.share({title:'Acompanhe meu trajeto no VANO MAPS',text:'Estou compartilhando meu trajeto ao vivo.',url:d.url});else{await navigator.clipboard.writeText(d.url);showToast('Compartilhamento ao vivo iniciado e link copiado.')}}catch(e){if(e?.name!=='AbortError')showToast(e.message||'Não foi possível iniciar o compartilhamento.')}finally{btn.disabled=false}}
async function pushLivePosition(p,m,force=false){if(!liveShareToken||liveShareUpdating||!p)return;const now=Date.now();if(!force&&now-lastLiveShareAt<5000)return;lastLiveShareAt=now;liveShareUpdating=true;try{await fetch(`/api/live-trip/${encodeURIComponent(liveShareToken)}/update`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({lat:p.lat,lon:p.lon,accuracy:p.accuracy||0,speed:p.speed||0,heading:p.heading,progress:m?.progress||0,safety_level:selectedRoute?.safety_level??3})})}catch{}finally{liveShareUpdating=false}}
async function stopLiveShare(){if(!liveShareToken)return;const token=liveShareToken;liveShareToken=null;liveShareUrl='';$('liveShareBtn')?.classList.remove('live-active');try{await fetch(`/api/live-trip/${encodeURIComponent(token)}/stop`,{method:'POST',headers:{'X-CSRF-Token':CSRF}})}catch{}}
function toggleNavigationCamera(){
  const to3D=navCameraMode==='top';navCameraMode=to3D?'perspective':'top';navExperienceMode=to3D?'immersive':'normal';followMode=true;markCameraIntent(to3D?'toggle-3d':'toggle-2d',980);if(!to3D)lastCameraBearing=0;stopCameraMotion();syncNavCameraButton();syncFollowButton();syncImmersiveButton();haptic(6);showToast(to3D?'Visualização 3D.':'Visualização 2D.');
  if(lastNavPosition&&selectedRoute){scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition));return}
  const center=userLocation?[userLocation.lon,userLocation.lat]:undefined;try{map?.stop?.();map?.easeTo?.({...(center?{center}:{}),pitch:to3D?58:0,bearing:to3D?map.getBearing():0,zoom:to3D?Math.max(16.8,map.getZoom()):Math.max(16.2,map.getZoom()),padding:{top:0,bottom:0,left:0,right:0},retainPadding:false,duration:440,essential:true,easing:t=>1-Math.pow(1-t,4)})}catch(e){console.debug('[VANO MAPS:camera-toggle]',e)}
}
function syncPreviewCancelPosition(){const x=$('previewCancelBtn'),anchor=$('recenterBtn'),app=$('wsApp');if(!x||!anchor||!app||!x.classList.contains('show'))return;const a=anchor.getBoundingClientRect(),w=app.getBoundingClientRect();x.style.left=`${Math.round(a.right-w.left+8)}px`;x.style.top=`${Math.round(a.top-w.top)}px`;x.style.right='auto';x.style.bottom='auto'}
function setPreviewUi(active){const btn=$('previewRouteBtn'),cancel=$('previewCancelBtn');btn?.classList.toggle('previewing',!!active);if(btn)btn.innerHTML=active?'<i data-lucide="move-3d" width="14"></i>Prévia ativa':'<i data-lucide="move-3d" width="14"></i>Prévia 3D';cancel?.classList.toggle('show',!!active);document.body.classList.toggle('route-previewing',!!active);if(window.lucide)lucide.createIcons();if(active)requestAnimationFrame(syncPreviewCancelPosition)}
function stopRoutePreview(restore=true){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=null;previewing=false;cameraIntent='';cameraIntentUntil=0;stopCameraMotion();setPreviewUi(false);if(restore&&selectedRoute){followMode=false;drawRoute();if(userLocation)updateUserMarker({...userLocation,accuracy:0,heading:null,speed:0})}}
function previewRoute(){if(!selectedRoute)return;if(previewing){stopRoutePreview(true);return}buildMetrics();if(routeTotalGeometry<8)return;previewing=true;followMode=true;markCameraIntent('preview',1400);setPreviewUi(true);showToast('Prévia 3D do percurso completo. Toque no X para cancelar.');const start=performance.now(),distanceKm=routeTotalGeometry/1000,duration=Math.max(26000,Math.min(65000,26000+distanceKm*1700)),travel=Math.max(1,routeTotalGeometry-1);previewStartedAt=start;function frame(now){if(!previewing)return;const raw=Math.min(1,(now-start)/duration),t=raw<.5?2*raw*raw:1-Math.pow(-2*raw+2,2)/2,d=Math.min(routeTotalGeometry-1,travel*t),pt=routePointAtDistance(d);if(pt){const p={lon:pt[0],lat:pt[1],accuracy:5,speed:profile==='motorcycle'?9.5:profile==='driving'?10.5:1.2,heading:routeBearingAtDistance(d,30)};updateUserMarker(p);const m=nearestProgress(p);scheduleCamera(p,raw<.015,m)}if(raw<1)previewFrame=requestAnimationFrame(frame);else{previewFrame=null;previewing=false;setPreviewUi(false);followMode=false;drawRoute();if(userLocation)updateUserMarker({...userLocation,accuracy:0,heading:null,speed:0});showToast('Prévia concluída.')}}previewFrame=requestAnimationFrame(frame)}
function nonFatal(label,fn){try{const out=fn();if(out&&typeof out.catch==='function')out.catch(err=>console.warn(`[VANO MAPS:${label}]`,err));return out}catch(err){console.warn(`[VANO MAPS:${label}]`,err);return null}}
async function activateNavigationAt(p,{simulated=false}={}){
  arrivalTelemetrySent=false;arrivalPresented=false;trafficTrendSnapshot=null;lastRouteSwitchAt=0;lastEtaMetricAt=0;lastEtaMetricValue=null;routeSwitchCooldown.clear();$('arrivalExperience')?.classList.remove('show');document.body.classList.remove('nav-arrived');
  if(!selectedRoute?.geometry?.coordinates?.length)throw new Error('A rota selecionada não possui geometria válida. Recalcule a rota.');
  hidePermission();haptic(18);userLocation={lat:+p.lat,lon:+p.lon};lastNavPosition={...p,speed:0};lastGps={...p};gpsDistance=0;navStartedAt=Date.now();osintRouteSessionId=makeOsintRouteSessionId();followMode=true;resetOffRouteTracker();resetMapMatchHysteresis();stopCameraMotion();lastCameraBearing=null;navStartupBearing=null;navStartupBearingUntil=0;spokenMilestones=new Set();lastSpokenInstruction='';roadAwareness=[];lastNavUiAt=0;lastCameraUpdateAt=0;lastProgressPaintAt=0;navSpeedFix=null;stableNavSpeedKmh=0;lastSpeedMotionAt=0;lastDisplayedSpeedKmh=0;
  buildMetrics();resetPuckMotionModel();navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;navLastCameraZoom=null;navCameraStartUntil=performance.now()+4200;lastNavRoutePaintAt=0;navAlternativeHitKey='';navAlternativeHitCount=0;navSuppressedRouteKeys.clear();navCameraMode='perspective';navExperienceMode='immersive';followMode=true;lastRoutePuckBearing=null;syncNavCameraButton();syncFollowButton();syncImmersiveButton();
  planSheet.classList.remove('sheet-collapsed','sheet-dragging');planSheet.style.transform='';planSheet.classList.add('hidden');document.body.classList.add('body-nav');document.body.classList.remove('nav-map-free');setNavControlDrawer(false);try{map?.dragPan?.enable?.();map?.dragRotate?.enable?.();map?.scrollZoom?.enable?.();map?.doubleClickZoom?.enable?.();map?.touchZoomRotate?.enable?.();map?.touchPitch?.enable?.();map?.keyboard?.enable?.()}catch{}requestAnimationFrame(syncFloatingLocate);activeNav.classList.add('show');requestAnimationFrame(syncNavigationHudGeometry);setTimeout(syncNavigationHudGeometry,360);syncImmersiveButton();setNavigationRouteFocus(true);setNavRouteData();refreshNavigationAlternatives(true);
  nonFatal('marker',()=>updateUserMarker(p));
  const routeSeconds=Math.max(0,+selectedRoute.duration||(+selectedRoute.duration_min||0)*60),m=nearestProgress(p),firstStep=currentStep(m.distanceAlong);
  $('maneuverGlyph').textContent=maneuverGlyph(firstStep);$('nextInstruction').textContent=maneuverLabel(firstStep);$('nextStreet').textContent=stepStreet(firstStep);updateTurnHighlight(m.distanceAlong,firstStep);$('arrivalTime').textContent=fmtClock(new Date(Date.now()+routeSeconds*1000));$('currentSpeed').textContent='— km/h';updateNavSummary(routeSeconds,m.remaining,firstStep);syncSoundButton();
  nonFatal('native-map',()=>vanoStartNativeMap(p));
  if(!simulated)emitVanoOsint('route-start',{route:osintRoutePayload(p,m,routeSeconds),location:osintLocationPayload(p,p)});
  nonFatal('camera-prime',()=>primeNavigationCamera(p,m));setTimeout(()=>nonFatal('camera',()=>scheduleCamera(lastNavPosition||p,false,nearestProgress(lastNavPosition||p))),780);nonFatal('signals',()=>scheduleSignalRefresh(true));
  if(!simulated){nonFatal('flow',()=>pushFlowProbe(p,true));nonFatal('wake-lock',()=>requestWake())}else $('simBadge')?.classList.add('show');
  requestAnimationFrame(()=>nonFatal('map-resize',()=>map?.resize()));
  if(!simulated){persistActiveTrip({force:true,position:p});setTimeout(()=>speak('Navegação iniciada. Siga pela rota indicada.','nav-start'),180)}
}
function beginNavigationGpsWatch(){
  stopPassiveMapTracking();
  stopNavigationGpsHeartbeat();
  if(watchId!==null){try{navigator.geolocation?.clearWatch(watchId)}catch{}watchId=null}
  if(!navigator.geolocation)return;
  try{watchId=navigator.geolocation.watchPosition(updateNavigation,e=>{console.warn('[VANO MAPS:GPS watch]',e);if(e?.code===1){showPermission(locationErrorMessage(e));showToast('GPS bloqueado. A rota continua aberta usando a última posição.')}},{enableHighAccuracy:true,maximumAge:0,timeout:6000})}catch(e){console.warn('[VANO MAPS:GPS watch start]',e)}
  requestGpsHeartbeat(g=>{if(activeNav.classList.contains('show')&&!adminSimulation)updateNavigation(g)},2600,0);
  startNavigationGpsHeartbeat();
}
async function startTrip(){
  if(starting)return;if(!selectedRoute&&routes.length)chooseByMode();if(!selectedRoute){showToast('Calcule e selecione uma rota primeiro.');return}
  setNavigationExperience('immersive',{recenter:false,announce:false});
  stopStartupGps();stopPassiveMapTracking();if(previewing)stopRoutePreview(false);starting=true;const btn=$('startTripBtn');btn?.classList.add('is-starting');if(btn){btn.disabled=true;btn.innerHTML='<span class="start-trip-icon start-trip-loading-icon"><span class="loading"></span></span><span class="start-trip-copy"><b>Preparando navegação…</b><small>GPS, câmera e trajeto</small></span><span class="start-trip-arrow">…</span>'}showToast('Preparando navegação…');
  try{
    let p=null;const cached=userLocation||readLastGps()||((origin&&Number.isFinite(+origin.lat)&&Number.isFinite(+origin.lon))?origin:null);
    if(cached&&Number.isFinite(+cached.lat)&&Number.isFinite(+cached.lon)){p=filterPosition({lat:+cached.lat,lon:+cached.lon,accuracy:+cached.accuracy||80,heading:Number.isFinite(+cached.heading)?+cached.heading:null,speed:Number.isFinite(+cached.speed)?+cached.speed:null})}
    else if(navigator.geolocation){const g=await requestPosition(),raw=geoRaw(g);updateGpsQuality(raw.accuracy);p=filterPosition(raw)}
    if(!p)throw new Error('Não foi possível determinar uma posição inicial.');
    await activateNavigationAt(p,{simulated:false});productTelemetry('route','navigation-start','navigation');beginNavigationGpsWatch();setTimeout(()=>nonFatal('event-start',()=>checkEventDisruption(true,{pretrip:false})),4200);setTimeout(()=>nonFatal('traffic-start',()=>checkLiveTraffic(true)),12000);showToast('Navegação iniciada.');
  }catch(e){console.error('[VANO MAPS:startTrip]',e);if(activeNav.classList.contains('show')){showToast('Navegação iniciada. Alguns recursos ainda estão carregando.')}else{const geoCode=Number.isFinite(+e?.code)?+e.code:null;if(geoCode)showPermission(locationErrorMessage(e));showToast(geoCode?locationErrorMessage(e):(e?.message||'Não foi possível iniciar a navegação. Tente recalcular a rota.'))}}
  finally{starting=false;if(btn){btn.disabled=false;btn.classList.remove('is-starting');btn.innerHTML='<span class="start-trip-icon"><i data-lucide="navigation" width="18"></i></span><span class="start-trip-copy"><b>Iniciar</b><small>Modo imersivo · câmera alinhada ao trajeto</small></span><span class="start-trip-arrow">›</span>'}if(window.lucide)lucide.createIcons()}
}
function adminSimulationButton(running=false){const btn=$('adminSimBtn');if(!btn)return;btn.classList.toggle('running',running);btn.setAttribute('aria-pressed',String(!!running));btn.innerHTML=running?'<span class="admin-route-test-icon"><i data-lucide="square" width="16"></i></span><span class="admin-route-test-copy"><b>Parar teste</b><small>Simulação admin em andamento · movimento acelerado</small></span><span class="admin-route-test-badge">ATIVO</span>':'<span class="admin-route-test-icon"><i data-lucide="flask-conical" width="17"></i></span><span class="admin-route-test-copy"><b>Testar rota</b><small>Admin · simula movimento, câmera, manobras e chegada</small></span><span class="admin-route-test-badge">TESTE</span>';if(window.lucide)lucide.createIcons()}
function adminSimulationSpeed(){const seconds=Math.max(1,+selectedRoute?.duration||(+selectedRoute?.duration_min||0)*60||0),avg=routeTotalGeometry/seconds;if(profile==='walking')return Math.max(1.15,Math.min(1.9,Number.isFinite(avg)&&avg>0?avg:1.45));if(profile==='motorcycle')return Math.max(7.5,Math.min(24,Number.isFinite(avg)&&avg>0?avg:12));return Math.max(6.5,Math.min(27,Number.isFinite(avg)&&avg>0?avg:13.5))}
async function startAdminSimulation(){if(!IS_ADMIN)return;if(adminSimulation){stopAdminSimulation();showToast('Teste de rota encerrado.');return}if(!selectedRoute){showToast('Calcule uma rota antes de testar.');return}try{const r=await fetch('/api/admin/simulation/authorize',{method:'POST',headers:{'X-CSRF-Token':CSRF}}),d=await r.json();if(!r.ok||!d.authorized)throw new Error('Sem autorização para testar esta rota.');if(watchId!==null){try{navigator.geolocation.clearWatch(watchId)}catch{}watchId=null}stopNavigationGpsHeartbeat();stopStartupGps();stopPassiveMapTracking();if(previewing)stopRoutePreview(false);buildMetrics();adminSimulation=true;adminSimDistance=0;adminSimLastTs=0;adminSimRealSpeed=adminSimulationSpeed();adminSimTimeScale=profile==='walking'?8:6;arrivalPresented=false;arrivalTelemetrySent=false;gpsDistance=0;lastGps=null;const first=routePointAtDistance(0)||selectedRoute.geometry.coordinates[0],heading=routeBearingAtDistance(0,35);const p={lat:first[1],lon:first[0],accuracy:4,heading,speed:adminSimRealSpeed,_distanceAlong:0};smoothedPos={...p};await activateNavigationAt(p,{simulated:true});adminSimulationButton(true);showToast(`Teste iniciado · ${adminSimTimeScale}x mais rápido que o tempo real.`);adminSimFrame=requestAnimationFrame(stepAdminSimulation)}catch(e){adminSimulation=false;adminSimulationButton(false);showToast(e.message||'Não foi possível iniciar o teste da rota.')}}
function stepAdminSimulation(ts){if(!adminSimulation||!selectedRoute)return;if(!adminSimLastTs)adminSimLastTs=ts;const dt=Math.min(.12,Math.max(0,(ts-adminSimLastTs)/1000));adminSimLastTs=ts;adminSimDistance=Math.min(routeTotalGeometry,adminSimDistance+adminSimRealSpeed*dt*adminSimTimeScale);if(ts-adminSimLastUiAt>=70){adminSimLastUiAt=ts;const xy=routePointAtDistance(adminSimDistance),heading=routeBearingAtDistance(adminSimDistance,Math.max(20,adminSimRealSpeed*2.8));if(xy)updateNavigation({coords:{latitude:xy[1],longitude:xy[0],accuracy:4,heading,speed:adminSimRealSpeed}},true)}if(adminSimDistance>=routeTotalGeometry-2){const xy=routePointAtDistance(routeTotalGeometry-1);if(xy)updateNavigation({coords:{latitude:xy[1],longitude:xy[0],accuracy:4,heading:routeBearingAtDistance(Math.max(0,routeTotalGeometry-35),35),speed:0}},true);showToast('Teste concluído no destino.');stopAdminSimulation({keepNavigation:true});return}adminSimFrame=requestAnimationFrame(stepAdminSimulation)}
function stopAdminSimulation({keepNavigation=false}={}){adminSimulation=false;if(adminSimFrame)cancelAnimationFrame(adminSimFrame);adminSimFrame=null;adminSimLastTs=0;adminSimDistance=0;$('simBadge')?.classList.remove('show');adminSimulationButton(false);if(!keepNavigation&&activeNav?.classList.contains('show')){try{updateFloatingSpeedometer(0)}catch{}}}
function updateNavigation(g,simulated=false){
  const raw=simulated?{lat:g.coords.latitude,lon:g.coords.longitude,accuracy:g.coords.accuracy,heading:Number.isFinite(g.coords.heading)?g.coords.heading:null,speed:Number.isFinite(g.coords.speed)?Math.max(0,g.coords.speed):null,ts:Date.now()}:geoRaw(g);
  if(!simulated&&!acceptGpsRaw(raw))return;if(!simulated){lastGpsFixAt=Date.now();saveLastGps(raw)};const filtered=simulated?raw:filterPosition(raw),rawMatch=selectedRoute?nearestProgress(raw):null;let p=simulated?raw:stabilizeActiveNavPosition(filtered,raw,rawMatch);updateGpsQuality(raw.accuracy);if(!simulated&&Date.now()-lastGpsMetricAt>300000){lastGpsMetricAt=Date.now();const bucket=(+raw.accuracy||999)<=20?'excellent':(+raw.accuracy||999)<=50?'good':(+raw.accuracy||999)<=90?'weak':'poor';productTelemetry('gps',`quality:${bucket}`,'navigation')}if(!simulated&&maybeAdoptNavigationAlternative(raw,p)){p=stabilizeActiveNavPosition(filtered,raw,nearestProgress(raw))}userLocation={lat:p.lat,lon:p.lon};lastNavPosition=p;updateUserMarker(p);maybeRefreshNavigationAlerts(p);
  if(lastGps){const jump=hav([lastGps.lon,lastGps.lat],[p.lon,p.lat]);if(jump<Math.max(120,(raw.accuracy||30)*4))gpsDistance+=jump}lastGps=p;
  const m=nearestProgress(p),elapsed=Math.max(1,(Date.now()-navStartedAt)/1000),avg=gpsDistance/elapsed,step=currentStep(m.distanceAlong),now=performance.now();
  if(navLastAlong<=0)navLastAlong=Math.max(0,m.distanceAlong);else if(m.distanceAlong>navLastAlong+.45)navLastAlong=m.distanceAlong;
  let eta=(selectedRoute.duration||0)*(1-m.progress);if(elapsed>30&&avg>.45)eta=Math.min(eta*1.5,m.remaining/avg);eta=Math.max(0,eta);if(!simulated&&Date.now()-lastEtaMetricAt>60000){if(Number.isFinite(lastEtaMetricValue)){const shift=Math.abs(eta-lastEtaMetricValue);productTelemetry('performance',`eta-shift:${Math.round(shift)}s`,'navigation')}lastEtaMetricValue=eta;lastEtaMetricAt=Date.now()}
  const currentKmh=resolveVehicleSpeedKmh(raw,p);updateFloatingSpeedometer(currentKmh);
  if(!simulated)emitVanoOsint('location',{location:osintLocationPayload(raw,p),navigation:true,route:{remaining_m:Math.max(0,+m.remaining||0),eta_seconds:Math.max(0,Math.round(+eta||0)),destination_name:String(destination?.label||destination?.name||'Destino').slice(0,255)}});
  document.body.classList.toggle('nav-approaching-arrival',m.remaining<420&&m.progress>.80);if(now-lastNavUiAt>240){lastNavUiAt=now;$('maneuverGlyph').textContent=maneuverGlyph(step);$('nextInstruction').textContent=m.remaining<22&&m.progress>.92?'Você chegou':maneuverLabel(step);$('nextStreet').textContent=m.remaining<22?'Destino':stepStreet(step);$('arrivalTime').textContent=fmtClock(new Date(Date.now()+eta*1000));$('currentSpeed').textContent=Number.isFinite(+currentKmh)?`${Math.round(currentKmh)} km/h`:'— km/h';updateNavSummary(eta,m.remaining,step);}
  if(Math.abs(navLastAlong-navLastPaintAlong)>1.8||now-lastNavRoutePaintAt>420){lastNavRoutePaintAt=now;navLastPaintAlong=navLastAlong;setNavRouteData(navLastAlong)}if(now-lastProgressPaintAt>280){lastProgressPaintAt=now;updateTurnHighlight(m.distanceAlong,step)}
  refreshNavigationAlternatives(false);updateTrafficRadar(false,m.distanceAlong);
  if(!simulated){const rawOff=Number.isFinite(rawMatch?.offRoute)?rawMatch.offRoute:m.offRoute;const shouldReroute=updateOffRouteTracker(raw,rawOff);if(shouldReroute)rerouteFrom(filtered);pushFlowProbe(p,false);checkLiveTraffic(false);checkEventDisruption(false,{pretrip:false});pushLivePosition(p,m,false);maybeSyncPresence(p)}
  if(m.remaining<22&&m.progress>.92){clearSavedActiveTrip();if(!arrivalTelemetrySent){arrivalTelemetrySent=true;productTelemetry('route',`navigation-complete:${Math.round(elapsed)}s`,'navigation');speak('Você chegou ao destino.','arrival')}showArrivalExperience(m)}else{persistActiveTrip({position:p,metrics:m});maybeSpeakStep(step)}
  scheduleCamera(p,false,m);
}

function showArrivalExperience(m){if(arrivalPresented)return;arrivalPresented=true;document.body.classList.add('nav-arrived');const box=$('arrivalExperience'),name=$('arrivalDestinationName'),meta=$('arrivalDestinationMeta');if(name)name.textContent=destination?.name||destination?.label||'Destino';if(meta)meta.textContent='Rota concluída · você está no ponto de chegada.';box?.classList.add('show');box?.setAttribute('aria-hidden','false');setNavControlDrawer(false);haptic(20);setTimeout(()=>haptic(8),140);try{const xy=destination&&Number.isFinite(+destination.lon)&&Number.isFinite(+destination.lat)?[+destination.lon,+destination.lat]:routePointAtDistance(Math.max(0,(m?.distanceAlong||routeTotalGeometry)-2));if(xy)map?.easeTo?.({center:xy,zoom:18.05,pitch:38,bearing:Number.isFinite(lastCameraBearing)?lastCameraBearing:map.getBearing(),padding:{top:70,bottom:245,left:24,right:24},duration:620,essential:true,easing:t=>1-Math.pow(1-t,3)})}catch{}if(window.lucide)lucide.createIcons()}
function hideArrivalExperience(){arrivalPresented=false;document.body.classList.remove('nav-arrived');const box=$('arrivalExperience');box?.classList.remove('show');box?.setAttribute('aria-hidden','true')}
async function openArrivalParking(){const q='estacionamento';await finishTrip(false);planSheet.classList.remove('hidden','sheet-collapsed');welcomeState.style.display='';routeState.style.display='none';destinationInput.value=q;activeSearchKind='destination';setTimeout(()=>searchPlaces(q,'destination'),120)}
async function finishTrip(redraw=true){vanoClearNativeMapSync();vanoStopNativeMap();window.__vanoNativeMapActive=false;document.documentElement.classList.remove('vano-native-map-active');const osintWasArrived=!!arrivalPresented||(routeTotalGeometry>1&&navLastAlong>=routeTotalGeometry-25);if(activeNav?.classList.contains('show')&&osintRouteSessionId)emitVanoOsint('route-finish',{status:osintWasArrived?'completed':'cancelled',vano_route_id:osintRouteSessionId});osintRouteSessionId='';clearSavedActiveTrip();stopAdminSimulation();stopCameraMotion();resetMapMatchHysteresis();hideTrafficSuggestion();trafficChecking=false;navSpeedFix=null;stableNavSpeedKmh=0;lastSpeedMotionAt=0;updateFloatingSpeedometer(0);$('trafficRadar')?.classList.remove('show','severe');if(watchId!==null){try{navigator.geolocation.clearWatch(watchId)}catch{}watchId=null}stopNavigationGpsHeartbeat();mapFollowMode=true;lastPassivePosition=lastNavPosition?{...lastNavPosition}:lastPassivePosition;await nonFatal('live-stop',()=>stopLiveShare());setNavControlDrawer(false);document.body.classList.remove('body-nav','nav-alt-visible','nav-map-free','nav-immersive','nav-arrived','nav-approaching-arrival','nav-launching','nav-drive-stopped','nav-drive-cruise','nav-drive-fast','nav-drive-turn','nav-drive-junction','nav-drive-roundabout');hideArrivalExperience();driveCameraMood='';activeNav.classList.remove('show');$('navAltHint')?.classList.remove('show');toggleVoicePopover(false);try{map?.dragPan?.enable?.();map?.dragRotate?.enable?.();map?.scrollZoom?.enable?.();map?.doubleClickZoom?.enable?.();map?.touchZoomRotate?.enable?.();map?.keyboard?.enable?.()}catch{}resetPuckMotionModel();navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;navLastCameraZoom=null;navCameraStartUntil=0;lastNavRoutePaintAt=0;navAlternativeHitKey='';navAlternativeHitCount=0;navSuppressedRouteKeys.clear();setNavigationRouteFocus(false);applyMapPrefs();planSheet.classList.remove('hidden');requestAnimationFrame(syncFloatingLocate);followMode=true;resetOffRouteTracker();roadAwareness=[];lastCameraBearing=null;lastMarkerHeading=null;lastRoutePuckBearing=null;updateRoadLayer();await nonFatal('wake-release',()=>releaseWake());try{window.speechSynthesis?.cancel()}catch{}stopVanoVoice();if(redraw&&selectedRoute)drawRoute();else map.easeTo({pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0},retainPadding:false,duration:320});setTimeout(startPassiveMapTracking,180)}
async function copyText(value){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return}const ta=document.createElement('textarea');ta.value=value;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('Não foi possível copiar automaticamente.')}
async function shareRoute(){if(!origin||!destination||!selectedRoute){showToast('Calcule uma rota primeiro.');return}const btn=$('shareRouteBtn'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="loading"></span>Preparando…';try{const r=await fetch('/api/share-route',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({origin,destination,profile,mode:routeMode,route:selectedRoute})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível criar o link.');await copyText(d.url);showToast('Link copiado');}catch(e){showToast(e.message||'Não foi possível copiar o link.')}finally{btn.disabled=false;btn.innerHTML=old;if(window.lucide)lucide.createIcons()}}
function openQuickAlert(force=null){const sheet=$('quickAlertSheet');if(!sheet)return;const show=force===null?!sheet.classList.contains('show'):!!force;sheet.classList.toggle('show',show);sheet.setAttribute('aria-hidden',String(!show));if(show){const status=$('quickAlertStatus');if(status)status.textContent='';setNavControlDrawer(false);haptic(5);if(window.lucide)lucide.createIcons()}}
function alertPosition(){
  const cached=lastNavPosition||lastPassivePosition||userLocation||readLastGps?.();
  if(cached&&Number.isFinite(+cached.lat)&&Number.isFinite(+cached.lon))return Promise.resolve({lat:+cached.lat,lon:+cached.lon,accuracy:Number.isFinite(+cached.accuracy)?+cached.accuracy:null,ts:+cached.ts||Date.now()});
  return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('GPS indisponível.'));return}navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:Number.isFinite(+p.coords.accuracy)?+p.coords.accuracy:null,ts:+p.timestamp||Date.now()}),()=>reject(new Error('Ative a localização para enviar o alerta.')),{enableHighAccuracy:true,timeout:3200,maximumAge:12000})})
}
function quickAlertRoadHint(pos){
  if(!pos||!activeNav?.classList.contains('show')||!selectedRoute?.geometry?.coordinates?.length)return null;
  const m=nearestProgress(pos),acc=Math.max(6,Number.isFinite(+pos.accuracy)?+pos.accuracy:35),limit=Math.max(45,Math.min(150,acc*2.1));
  if(!Number.isFinite(+m?.distanceAlong)||!Number.isFinite(+m?.offRoute)||+m.offRoute>limit)return null;
  const xy=routePointAtDistance(+m.distanceAlong||0);if(!xy)return null;
  return{lat:+xy[1],lon:+xy[0],distance_m:+m.offRoute||0,source:'active-route'}
}
function quickAlertClientMeta(category,button){
  const label=button?.querySelector?.('.quick-alert-copy b')?.textContent?.trim()||'Alerta';
  const severity={accident:4,speed_camera:2,road_block:4,traffic:3,object_on_road:4,stopped_vehicle:3}[category]||3;
  return{label,severity}
}
function removeLocalAlert(id){const key=String(id||'');if(!key)return;alertClientSeenAt.delete(key);applyAlertRecords((lastAlertRecords||[]).filter(x=>String(x.id)!==key),{force:true})}
async function submitQuickAlert(category,button){
  if(!LOGGED_IN){location.href='/login?next=/';return}
  const status=$('quickAlertStatus'),buttons=[...document.querySelectorAll('[data-quick-alert]')];buttons.forEach(b=>b.disabled=true);button?.classList.add('sending');if(status)status.textContent='Enviando…';
  let tempId='';
  try{
    const pos=await alertPosition(),hint=quickAlertRoadHint(pos),visual=hint||pos,meta=quickAlertClientMeta(category,button),createdAt=new Date().toISOString();
    tempId=`pending-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    upsertLocalAlert({id:tempId,category,category_label:meta.label,severity:meta.severity,lat:+visual.lat,lon:+visual.lon,created_at:createdAt,confirmations:0,confidence:100,pending:true});
    if(status)status.textContent='Publicando para a comunidade…';
    openQuickAlert(false);haptic(14);showToast('Alerta adicionado ao mapa.');
    const payload={category,lat:+pos.lat,lon:+pos.lon,accuracy:Number.isFinite(+pos.accuracy)?+pos.accuracy:null};
    if(hint){payload.snap_lat=+hint.lat;payload.snap_lon=+hint.lon;payload.snap_source='active-route'}
    const r=await fetch('/api/alerts/quick',{method:'POST',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF,'Accept':'application/json'},body:JSON.stringify(payload)});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{d={error:r.ok?'Resposta inválida do servidor.':'Não foi possível registrar o alerta.'}}
    if(!r.ok||d.ok===false)throw new Error(d.error||'Não foi possível registrar o alerta.');
    removeLocalAlert(tempId);tempId='';
    upsertLocalAlert({id:d.id,category:d.category||category,category_label:d.category_label||meta.label,severity:d.severity||meta.severity,lat:Number.isFinite(+d.lat)?+d.lat:+visual.lat,lon:Number.isFinite(+d.lon)?+d.lon:+visual.lon,created_at:d.created_at||createdAt,confirmations:0,confidence:100});
    if(status)status.textContent=d.duplicate?'Alerta já confirmado nessa área':'Publicado';
    productTelemetry('alert',`quick-alert:${category}${d.road_snapped?':road-snapped':''}${d.snap_source==='active-route'?':route-fast':''}${d.duplicate?':duplicate':':created'}`,'quick-alert');
    setTimeout(()=>refreshAlerts(true),120);
  }catch(e){
    if(tempId)removeLocalAlert(tempId);
    const msg=e?.message||'Não foi possível registrar o alerta.';if(status)status.textContent=msg;showToast(`Alerta não publicado · ${msg}`)
  }finally{button?.classList.remove('sending');buttons.forEach(b=>b.disabled=false)}
}

async function refreshUnreadNotifications(){if(!LOGGED_IN)return;try{const r=await fetch('/api/notifications/unread'),d=await r.json(),b=$('notifCount');if(!b||!r.ok)return;const n=+d.unread||0;b.hidden=n<1;b.textContent=n>99?'99+':String(n)}catch{}}
function lockIOSInputViewport(input=null){
  if(!VANO_IOS_WEBKIT)return;
  const active=input||document.activeElement,isSearchInput=active===originInput||active===destinationInput;
  if(!isSearchInput)return;
  document.documentElement.classList.add('vano-ios-keyboard-lock');document.body.classList.add('vano-ios-keyboard-lock');
  const keepTop=()=>{try{window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0}catch{};try{syncSearchResultsPlacement()}catch{};try{syncFloatingLocate()}catch{}};
  keepTop();clearTimeout(vanoScrollLockTimer);let count=0;const tick=()=>{keepTop();if(++count<8&&(document.activeElement===originInput||document.activeElement===destinationInput))vanoScrollLockTimer=setTimeout(tick,70)};vanoScrollLockTimer=setTimeout(tick,35);
}
function releaseIOSInputViewport(){clearTimeout(vanoScrollLockTimer);if(!VANO_IOS_WEBKIT)return;setTimeout(()=>{if(document.activeElement!==originInput&&document.activeElement!==destinationInput){document.documentElement.classList.remove('vano-ios-keyboard-lock','vano-keyboard-open');document.body.classList.remove('vano-ios-keyboard-lock','vano-keyboard-open');try{window.scrollTo(0,0)}catch{};refreshResponsiveViewport()}},120)}
function setSearchInteraction(active){clearTimeout(searchInteractionTimer);searchInteractionActive=!!active;document.body.classList.toggle('vano-search-interacting',searchInteractionActive);if(searchInteractionActive){mapFollowMode=false;lastPassiveCameraAt=performance.now();try{map?.stop?.()}catch{}stopCameraMotion();stopPuckAnimation();lockIOSInputViewport();refreshResponsiveViewport();return}searchInteractionTimer=setTimeout(()=>{releaseIOSInputViewport();if(puckTargetPos){puckDisplayPos=puckDisplayPos||{...puckTargetPos};updateUserMarker(puckTargetPos)}try{map?.resize?.()}catch{}},140)}
function initVoiceAddressSearch(){const btn=$('voiceSearchBtn');if(!btn)return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){btn.hidden=true;return}let rec=null,listening=false;const stopUi=()=>{listening=false;btn.classList.remove('listening');btn.setAttribute('aria-pressed','false')};btn.addEventListener('click',()=>{if(listening){try{rec?.stop()}catch{}return}try{rec=new SR();rec.lang=BOOT.locale||'pt-BR';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;rec.onstart=()=>{listening=true;btn.classList.add('listening');btn.setAttribute('aria-pressed','true');showToast('Pode falar o destino.');};rec.onresult=e=>{const text=String(e.results?.[0]?.[0]?.transcript||'').trim();if(!text)return;destinationInput.value=text;destinationInput.dispatchEvent(new Event('input',{bubbles:true}));clearTimeout(searchTimer);if(text.length>=3)searchPlaces(text,'destination');};rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed')showToast('Permita o uso do microfone para pesquisar por voz.');else if(e.error!=='aborted'&&e.error!=='no-speech')showToast('Não consegui entender. Tente novamente.');};rec.onend=stopUi;rec.start()}catch(e){stopUi();showToast('Pesquisa por voz indisponível neste navegador.')}})}
initVoiceAddressSearch();
refreshUnreadNotifications();setTimeout(refreshUnreadNotifications,1800);document.body.dataset.mood=(moodFromConditions(window.__sparkWeatherState||null)==='night'?'night':'day');updateWeatherPill(window.__sparkWeatherState||null);updateFloatingSpeedometer(0);
[originInput,destinationInput].forEach(inp=>{
  const kind=inp===originInput?'origin':'destination';
  inp.addEventListener('compositionstart',()=>{searchComposing=true;setSearchInteraction(true)});
  inp.addEventListener('compositionend',()=>{searchComposing=false;queueSearch(inp,kind)});
  inp.addEventListener('input',()=>{setSearchInteraction(true);if(!searchComposing)queueSearch(inp,kind)});
  inp.addEventListener('focus',()=>{activeSearchKind=kind;setSearchInteraction(true);lockIOSInputViewport(inp);requestAnimationFrame(()=>lockIOSInputViewport(inp));if(inp.value.trim().length>=SEARCH_FAST_MIN&&!searchComposing)queueSearch(inp,kind);else{hideResults();if(kind==='destination')showSavedSearchSuggestions(kind)}});
  inp.addEventListener('blur',()=>{clearTimeout(searchInteractionTimer);searchInteractionTimer=setTimeout(()=>{const a=document.activeElement;if(a!==originInput&&a!==destinationInput)setSearchInteraction(false);releaseIOSInputViewport()},140)});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);clearTimeout(searchRefineTimer);const q=inp.value.trim();if(q.length>=SEARCH_FAST_MIN&&!searchComposing)searchPlaces(q,kind)}});
});
document.addEventListener('click',e=>{if(!e.target.closest('.search-card'))hideResults()});document.addEventListener('click',e=>{if(document.body.classList.contains('body-nav')&&$('navControlStack')?.classList.contains('drawer-open')&&!e.target.closest('#navControlStack'))setNavControlDrawer(false)});results.addEventListener('click',e=>{if(e.target.closest('.search-item')){destinationInput?.blur?.();originInput?.blur?.();}});
bindClick('locateBtn',()=>locateUser(true));bindClick('quickCurrent',()=>locateUser(true));bindClick('quickHome',()=>useSavedPlace(HOME_LABEL));bindClick('quickWork',()=>useSavedPlace(WORK_LABEL));bindClick('quickHomeTop',()=>useSavedPlace(HOME_LABEL));bindClick('quickWorkTop',()=>useSavedPlace(WORK_LABEL));bindClick('optionsBtn',()=>openAccountDrawer(null));document.querySelectorAll('[data-account-close]').forEach(btn=>btn.addEventListener('click',()=>openAccountDrawer(false)));document.querySelectorAll('[data-nearby-query]').forEach(btn=>btn.addEventListener('click',()=>{const q=btn.dataset.nearbyQuery||btn.textContent.trim();planSheet.classList.remove('sheet-collapsed');destinationInput.value=q;activeSearchKind='destination';searchPlaces(q,'destination');destinationInput.focus({preventScroll:true});haptic(6)}));bindClick('accountBackdrop',()=>openAccountDrawer(false));bindClick('focusModeBtn',()=>toggleNavigationCamera());bindClick('enableLocationBtn',()=>locateUser(!origin));bindClick('recenterBtn',()=>{vanoNativeMapRecenter();mapFollowMode=true;startPassiveMapTracking();setNavigationFollow(true,false);$('navRecenter')?.classList.add('active');if(lastNavPosition&&activeNav?.classList.contains('show'))calibrateNavigation();else if(userLocation)map.easeTo({center:[userLocation.lon,userLocation.lat],zoom:16.25,duration:520,essential:true,easing:t=>1-Math.pow(1-t,3)});else locateUser(true)});bindClick('swapBtn',()=>{});document.addEventListener('keydown',e=>{if(e.key==='Escape'){openAccountDrawer(false);toggleVoicePopover(false);openQuickAlert(false);setNavControlDrawer(false)}});
document.querySelectorAll('[data-route-mode]').forEach(btn=>btn.onclick=()=>{if(!requireRouteAccount())return;document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');routeMode=btn.dataset.routeMode==='fastest'?'fastest':'safest';learnRouteChoice(routeMode);manualRouteSelection=false;const hasBadge=routes.some(r=>r.badges?.includes(routeMode==='fastest'?'fastest':'safest')),fastEngine=routes.some(r=>r.fast_eta_only);if(destinationConfirmed&&origin&&destination){if(routeMode!=='fastest'&&hasBadge&&!fastEngine){chooseByMode();renderRoute()}else if(routeMode==='fastest'&&fastEngine&&hasBadge){chooseByMode();renderRoute()}else calculateRoutes(true)}else if(routes.length){chooseByMode();renderRoute()}});document.querySelectorAll('[data-profile]').forEach(btn=>btn.onclick=()=>{if(!requireRouteAccount())return;document.querySelectorAll('[data-profile]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');profile=btn.dataset.profile;syncRouteProfileUi();if(destinationConfirmed&&origin&&destination&&isMotorizedProfile())showRouteLoading(profile==='motorcycle'?'Calculando rota de moto…':'Calculando rota de carro…',profile==='motorcycle'?'Analisando trânsito, pavimento e micro-rotas com cálculo motorizado.':'Lendo trânsito e procurando o menor ETA.');renderParkingNearby();if(profile==='driving')loadParkingNearby(false);if(destinationConfirmed&&origin&&destination)calculateRoutes()});
const voiceSelect=$('voiceSelect'),navVoiceSelect=$('navVoiceSelect');voiceSelect?.addEventListener('change',()=>saveInstructionVoice(voiceSelect.value));navVoiceSelect?.addEventListener('change',()=>saveInstructionVoice(navVoiceSelect.value));bindClick('voicePreviewBtn',()=>{const oldKey=lastSpokenInstruction,oldSound=soundEnabled;lastSpokenInstruction='';soundEnabled=true;speak(selectedVoiceName==='vano'?'Siga em frente.':'Olá. Esta é a voz escolhida para suas instruções de navegação.','voice-preview-'+Date.now());soundEnabled=oldSound;lastSpokenInstruction=oldKey;});if('speechSynthesis'in window){window.speechSynthesis.onvoiceschanged=()=>populateVoiceSelectors();setTimeout(populateVoiceSelectors,180)}const soundButton=$('soundBtn');if(soundButton){const openVoice=()=>{clearTimeout(navVoiceHoldTimer);navVoiceHoldOpened=true;toggleVoicePopover(true);haptic(8)};soundButton.addEventListener('pointerdown',()=>{navVoiceHoldOpened=false;clearTimeout(navVoiceHoldTimer);navVoiceHoldTimer=setTimeout(openVoice,520)});['pointerup','pointercancel','pointerleave'].forEach(ev=>soundButton.addEventListener(ev,()=>clearTimeout(navVoiceHoldTimer)));soundButton.addEventListener('contextmenu',e=>{e.preventDefault();navVoiceHoldOpened=true;toggleVoicePopover(true)})}
bindClick('prefsBtn',()=>openPrefsDrawer(null));bindClick('prefsCloseBtn',()=>openPrefsDrawer(false));bindPref('prefAdaptive','adaptiveRoutes',true);bindPref('prefAggressive','aggressiveShortcuts',true);bindPref('prefAlternatives','showAlternatives',false);bindPref('prefLiveSignals','liveSignals',false);bindPref('prefAutoFaster','autoFaster',false);syncPrefsUI();
bindClick('quickPrefs',()=>openPrefsDrawer(true));

const plannerHeadingLabel=document.querySelector('.planner-heading-copy b');if(plannerHeadingLabel)plannerHeadingLabel.textContent='Para onde você vai?';if(destinationInput)destinationInput.setAttribute('placeholder','Para onde você vai?');
const sharedSearchQuery=new URLSearchParams(location.search).get('q');if(sharedSearchQuery&&destinationInput){destinationInput.value=sharedSearchQuery.slice(0,240);setTimeout(()=>searchPlaces(destinationInput.value,'destination'),520)}
['navDrawerAlert'].forEach(id=>{try{$(id)?.remove()}catch{}});document.querySelectorAll('.nav-report-fab,[data-action="report"],[data-nav-action="report"]').forEach(el=>{try{el.remove()}catch{}});
bindClick('navDrawerToggle',toggleNavControlDrawer);bindClick('navDrawerOptions',navDrawerAction(()=>openAccountDrawer(true)));bindClick('navDrawerSupport',navDrawerAction(()=>openSafetyDrawer(true)));bindClick('navDrawerRecenter',navDrawerAction(calibrateNavigation));
bindClick('continueResumeTrip',continueSavedTrip);bindClick('discardResumeTrip',discardSavedTrip);bindClick('arrivalFinishBtn',()=>finishTrip(false));bindClick('arrivalParkingBtn',openArrivalParking);bindClick('confirmDestinationBtn',confirmDestination);bindClick('editDestinationBtn',editDestination);bindClick('previewRouteBtn',previewRoute);bindClick('adminSimBtn',startAdminSimulation);bindClick('previewCancelBtn',()=>stopRoutePreview(true));bindClick('navAltAccept',acceptNavigationAlternative);bindClick('navAltDismiss',dismissNavigationAlternative);bindClick('navSearchBtn',returnToDestinationSearch);bindClick('navExitBtn',()=>finishTrip(false));syncNavCameraButton();syncFollowButton();syncImmersiveButton();syncSoundButton();populateVoiceSelectors();bindClick('quickAlertBtn',()=>openQuickAlert(null));bindClick('quickAlertCloseBtn',()=>openQuickAlert(false));bindClick('quickAlertBackdrop',()=>openQuickAlert(false));document.querySelectorAll('[data-quick-alert]').forEach(btn=>btn.addEventListener('click',()=>submitQuickAlert(btn.dataset.quickAlert,btn)));bindClick('safetyToolsBtn',()=>openSafetyDrawer(null));bindClick('safetyCloseBtn',()=>openSafetyDrawer(false));bindClick('safetyLiveBtn',toggleLiveShare);bindClick('supportPointsBtn',loadSupportPoints);bindClick('emergencyShareBtn',()=>shareSafetyMessage('sos'));bindClick('checkinBtn',()=>shareSafetyMessage('checkin'));bindClick('liveShareBtn',toggleLiveShare);bindClick('acceptTrafficRoute',applyTrafficSuggestion);bindClick('dismissTrafficRoute',()=>{trafficDismissUntil=Date.now()+120000;hideTrafficSuggestion();showToast('Mantendo a rota atual.')});bindClick('navRecenter',()=>{vanoNativeMapRecenter();setNavigationFollow(true,false);$('navRecenter')?.classList.add('active');if(lastNavPosition)scheduleCamera(lastNavPosition,true)});bindClick('soundBtn',()=>{if(navVoiceHoldOpened){navVoiceHoldOpened=false;return}soundEnabled=!soundEnabled;try{if(!soundEnabled){window.speechSynthesis?.cancel();stopVanoVoice()}}catch{}toggleVoicePopover(false);syncSoundButton();showToast(soundEnabled?'Orientações por voz ativadas.':'Orientações por voz desativadas.')});bindClick('shareRouteBtn',shareRoute);bindClick('showAlertsBtn',()=>{if(!selectedRoute)return;const n=selectedRoute.nearby_alerts?.length||0;showToast(n?`${n} alerta(s) comunitário(s) próximo(s) desta rota.`:'Nenhum alerta recente próximo desta rota.')});

function plannerCollapsedHeight(){if(!planSheet)return 190;const raw=parseFloat(getComputedStyle(planSheet).getPropertyValue('--planner-collapsed-h'));return Number.isFinite(raw)?raw:190}
function syncFloatingLocate(){
  const b=$('recenterBtn'),speedo=$('vanoSpeedometerV220'),app=$('wsApp');if(!b||!app)return;
  const navOn=activeNav?.classList.contains('show');
  if(navOn){b.style.removeProperty('bottom');if(speedo)speedo.style.bottom='';requestAnimationFrame(syncNavigationHudGeometry);requestAnimationFrame(syncPreviewCancelPosition);return}
  const sheetRect=planSheet?.getBoundingClientRect?.(),appRect=app.getBoundingClientRect();
  let bottom=100;
  if(sheetRect&&sheetRect.height>0&&!planSheet.classList.contains('hidden'))bottom=Math.max(70,Math.round(appRect.bottom-sheetRect.top+10));
  else bottom=window.innerWidth>=900?92:96;
  b.style.setProperty('bottom',`${bottom}px`,'important');
  if(speedo)speedo.style.bottom='';
  requestAnimationFrame(syncPreviewCancelPosition);
}
function syncNavigationHudGeometry(){
  const app=$('wsApp'),street=$('navStreetChip'),controls=$('navControlStack'),speedo=$('vanoSpeedometerV220');
  if(!app||!street||!activeNav?.classList.contains('show'))return;
  const wr=app.getBoundingClientRect(),nr=activeNav.getBoundingClientRect();if(!nr.width||!nr.height)return;
  const center=nr.left-wr.left+nr.width/2;
  const cardClearance=Math.max(0,Math.round(wr.bottom-nr.top+10));
  const streetBottom=Math.max(12,Math.round(wr.bottom-nr.top+8));
  street.style.setProperty('left',`${Math.round(center)}px`,'important');street.style.setProperty('right','auto','important');street.style.setProperty('top','auto','important');street.style.setProperty('bottom',`${streetBottom}px`,'important');street.style.setProperty('transform','translateX(-50%)','important');
  controls?.style.setProperty('bottom',`${cardClearance}px`,'important');
  speedo?.style.setProperty('bottom',`${cardClearance}px`,'important');
}
function bindPlanningSheetDrag(){
  const toggle=$('planGrab');if(!toggle||!planSheet)return;
  let active=false,pointerId=null,startY=0,lastY=0,lastT=0,moved=false,startedCollapsed=true,suppressClickUntil=0;
  const clearPreview=()=>planSheet.style.removeProperty('--planner-drag-y');
  const syncToggleState=()=>{
    const collapsed=planSheet.classList.contains('sheet-collapsed');
    toggle.setAttribute('aria-expanded',String(!collapsed));
    toggle.setAttribute('aria-label',collapsed?'Expandir painel de destino':'Recolher painel de destino');
    toggle.dataset.state=collapsed?'collapsed':'expanded';
  };
  const settle=(collapse,{pulse=true}={})=>{
    active=false;pointerId=null;planSheet.classList.remove('sheet-dragging');clearPreview();
    planSheet.classList.toggle('sheet-collapsed',!!collapse);syncToggleState();
    if(pulse)haptic(6);
    requestAnimationFrame(()=>{syncFloatingLocate();syncSearchResultsPlacement();try{map?.resize?.()}catch{}});
  };
  const dragRange=()=>Math.max(90,Math.min(window.innerHeight*.48,Math.max(180,planSheet.scrollHeight-plannerCollapsedHeight())));
  toggle.addEventListener('pointerdown',e=>{
    if(planSheet.classList.contains('hidden')||e.button>0)return;
    active=true;pointerId=e.pointerId;moved=false;startY=lastY=e.clientY;lastT=performance.now();
    startedCollapsed=planSheet.classList.contains('sheet-collapsed');
    planSheet.classList.add('sheet-dragging');clearPreview();
    try{toggle.setPointerCapture?.(e.pointerId)}catch{}
  });
  toggle.addEventListener('pointermove',e=>{
    if(!active||e.pointerId!==pointerId)return;
    const dy=e.clientY-startY;if(Math.abs(dy)>7)moved=true;
    if(!moved)return;
    e.preventDefault();
    const limit=dragRange();let preview;
    if(startedCollapsed)preview=Math.max(-Math.min(76,limit*.42),Math.min(18,dy));
    else preview=Math.max(-14,Math.min(Math.min(92,limit*.46),dy));
    if((startedCollapsed&&preview>0)||(!startedCollapsed&&preview<0))preview*=.22;
    planSheet.style.setProperty('--planner-drag-y',`${preview.toFixed(1)}px`);
    const now=performance.now();if(now-lastT>=18){lastY=e.clientY;lastT=now}
  },{passive:false});
  const finish=e=>{
    if(!active||e.pointerId!==pointerId)return;
    const dy=e.clientY-startY,dt=Math.max(16,performance.now()-lastT),velocity=(e.clientY-lastY)/dt;
    try{toggle.releasePointerCapture?.(pointerId)}catch{}
    planSheet.classList.remove('sheet-dragging');clearPreview();active=false;pointerId=null;
    if(!moved){syncToggleState();return}
    suppressClickUntil=performance.now()+320;
    const threshold=Math.max(28,Math.min(58,dragRange()*.14));
    let collapse=startedCollapsed;
    if(startedCollapsed&&(dy<=-threshold||velocity<-.48))collapse=false;
    else if(!startedCollapsed&&(dy>=threshold||velocity>.48))collapse=true;
    settle(collapse);
  };
  toggle.addEventListener('pointerup',finish);
  toggle.addEventListener('pointercancel',e=>{
    if(!active||e.pointerId!==pointerId)return;
    try{toggle.releasePointerCapture?.(pointerId)}catch{}
    active=false;pointerId=null;planSheet.classList.remove('sheet-dragging');clearPreview();syncToggleState();
  });
  toggle.addEventListener('click',e=>{
    if(performance.now()<suppressClickUntil){e.preventDefault();return}
    settle(!planSheet.classList.contains('sheet-collapsed'));
  });
  toggle.addEventListener('keydown',e=>{
    if(e.key==='ArrowUp'){e.preventDefault();settle(false)}
    else if(e.key==='ArrowDown'){e.preventDefault();settle(true)}
  });
  syncToggleState();
  try{new MutationObserver(syncToggleState).observe(planSheet,{attributes:true,attributeFilter:['class']})}catch{}
}
bindPlanningSheetDrag();bindAccountDrawerDrag();if(window.ResizeObserver&&planSheet){new ResizeObserver(()=>requestAnimationFrame(()=>{syncFloatingLocate();syncSearchResultsPlacement()})).observe(planSheet)}if(window.ResizeObserver&&activeNav){new ResizeObserver(()=>requestAnimationFrame(syncNavigationHudGeometry)).observe(activeNav)}activeNav?.addEventListener('transitionend',()=>requestAnimationFrame(syncNavigationHudGeometry));planSheet?.addEventListener('scroll',()=>requestAnimationFrame(syncSearchResultsPlacement),{passive:true});requestAnimationFrame(syncFloatingLocate);window.addEventListener('resize',()=>{syncFloatingLocate();syncSearchResultsPlacement()},{passive:true});
function refreshResponsiveViewport(){
  clearTimeout(vanoViewportTimer);
  const vv=window.visualViewport,layoutH=Math.round(window.innerHeight||document.documentElement.clientHeight||vv?.height||vanoStableViewportH||0),layoutW=Math.round(window.innerWidth||document.documentElement.clientWidth||vv?.width||0),rawH=Math.round(vv?.height||layoutH),rawW=Math.round(vv?.width||layoutW);
  const searchFocused=document.activeElement===originInput||document.activeElement===destinationInput,keyboardLikely=!!(VANO_IOS_WEBKIT&&searchFocused&&vv&&(layoutH-rawH>80||vv.offsetTop>0));
  if(!keyboardLikely&&layoutH>260)vanoStableViewportH=layoutH;
  vanoKeyboardOpen=keyboardLikely;document.documentElement.classList.toggle('vano-keyboard-open',keyboardLikely);document.body.classList.toggle('vano-keyboard-open',keyboardLikely);
  const safeH=keyboardLikely&&vanoStableViewportH?vanoStableViewportH:rawH;
  document.documentElement.style.setProperty('--vano-vh',`${Math.max(260,safeH)}px`);document.documentElement.style.setProperty('--vano-vw',`${Math.max(280,rawW)}px`);document.documentElement.style.setProperty('--vano-keyboard-bottom',`${keyboardLikely?Math.max(0,layoutH-rawH-(vv?.offsetTop||0)):0}px`);
  if(keyboardLikely)lockIOSInputViewport();
  vanoViewportTimer=setTimeout(()=>requestAnimationFrame(()=>{
    try{map?.resize?.()}catch{}
    try{syncFloatingLocate()}catch{}
    try{syncNavigationHudGeometry()}catch{}
    if(activeNav?.classList.contains('show')&&lastNavPosition&&followMode)scheduleCamera(lastNavPosition,true);
  }),keyboardLikely?40:90);
}
refreshResponsiveViewport();window.addEventListener('orientationchange',()=>{vanoStableViewportH=0;SAFE_AREA_BOTTOM=readSafeAreaInsetBottom();setTimeout(refreshResponsiveViewport,60)},{passive:true});
window.visualViewport?.addEventListener('resize',refreshResponsiveViewport,{passive:true});window.visualViewport?.addEventListener('scroll',refreshResponsiveViewport,{passive:true});
if(navigator.permissions?.query)navigator.permissions.query({name:'geolocation'}).then(s=>{if(s.state==='denied')showPermission(locationErrorMessage({code:1}));s.onchange=()=>s.state==='denied'?showPermission(locationErrorMessage({code:1})):s.state==='granted'&&hidePermission()}).catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){persistActiveTrip({force:true,position:lastNavPosition||userLocation});stopPerformanceMonitor();return}startPerformanceMonitor();hardRefreshMapViewport();if(activeNav.classList.contains('show')){if(!adminSimulation)beginNavigationGpsWatch();if(lastNavPosition){updateUserMarker(lastNavPosition,{instant:true});scheduleCamera(lastNavPosition,true)}if(!wakeLock)requestWake()}else startPassiveMapTracking()});
window.addEventListener('pageshow',e=>{hardRefreshMapViewport();if(e.persisted){if(activeNav.classList.contains('show')&&!adminSimulation)beginNavigationGpsWatch();else startPassiveMapTracking()}});window.addEventListener('focus',()=>hardRefreshMapViewport(),{passive:true});window.addEventListener('orientationchange',()=>setTimeout(hardRefreshMapViewport,80),{passive:true});
function syncConnectivityState(){const online=navigator.onLine!==false,box=$('connectivityPill');document.body.classList.toggle('vano-offline',!online);if(box){box.classList.toggle('show',!online);box.setAttribute('aria-hidden',String(online));const text=box.querySelector('span');if(text)text.textContent=activeNav?.classList.contains('show')?'Sem internet · rota mantida':'Sem internet · recursos ao vivo pausados'}if(!online){if(!offlineSince){offlineSince=Date.now();productTelemetry('connectivity','offline','app')}}else if(offlineSince){productTelemetry('connectivity',`online-again:${Math.round((Date.now()-offlineSince)/1000)}s`,'app');offlineSince=0;if(activeNav?.classList.contains('show')){setTimeout(()=>checkLiveTraffic(true),900);setTimeout(()=>refreshAlerts(),1200)}}}
window.addEventListener('offline',syncConnectivityState,{passive:true});window.addEventListener('online',syncConnectivityState,{passive:true});syncConnectivityState();
let clientErrorTelemetryCount=0,clientErrorTelemetryWindow=Date.now();function noteClientError(kind){const now=Date.now();if(now-clientErrorTelemetryWindow>60000){clientErrorTelemetryWindow=now;clientErrorTelemetryCount=0}if(clientErrorTelemetryCount>=5)return;clientErrorTelemetryCount++;productTelemetry('performance',`client-error:${kind}`,'app')}window.addEventListener('error',()=>noteClientError('runtime'));window.addEventListener('unhandledrejection',()=>noteClientError('promise'));
window.addEventListener('pagehide',()=>{vehicle3DState.visible=false;try{window.VANOUserCar3D?.setVisible(false)}catch{};stopVanoVoice();stopPuckAnimation();persistActiveTrip({force:true,position:lastNavPosition||userLocation})});window.addEventListener('beforeunload',()=>{stopPuckAnimation();persistActiveTrip({force:true,position:lastNavPosition||userLocation});if(watchId!==null)navigator.geolocation.clearWatch(watchId);stopNavigationGpsHeartbeat();stopPassiveMapTracking();stopStartupGps();clearInterval(signalPulseTimer);weatherController?.abort()});if(window.lucide)lucide.createIcons();
})();
