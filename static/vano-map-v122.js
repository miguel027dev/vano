/* Legacy VANO map fallback. Kept readable intentionally: no runtime eval/encoded payload. */
(() => {
const BOOT=window.VANO_BOOT||{};
const TOKEN=BOOT.token||'', STYLE=BOOT.style||'', STYLE_SET=BOOT.styleSet||{}, MAP_STYLE_MODE=BOOT.mapStyleMode||'standard', MAP_ACCENT=BOOT.mapAccent||{}, NAV_PREFS=BOOT.navPrefs||{}, VANO_BLACK_THEME=document.documentElement.dataset.vanoTheme==='black', REACTIVE_BLACK_ALLOWED=MAP_STYLE_MODE==='auto', LOGGED_IN=!!BOOT.loggedIn, IS_ADMIN=!!BOOT.isAdmin, CSRF=BOOT.csrf||'', SHARED_TOKEN=new URLSearchParams(location.search).get('shared'), DISTANCE_UNIT=BOOT.distanceUnit||'km', HOME_LABEL=BOOT.homeLabel||'', WORK_LABEL=BOOT.workLabel||'', PRESENCE_ACTIVE=!!BOOT.presenceActive;
let guestRoutesRemaining=Number(BOOT.guestRoutesRemaining??10); const GUEST_ROUTE_LIMIT=Number(BOOT.guestRouteLimit??10);
if(!TOKEN){if(window.lucide)lucide.createIcons();return;} mapboxgl.accessToken=TOKEN;document.documentElement.style.setProperty('--o',MAP_ACCENT.primary||'#F59A62');document.documentElement.style.setProperty('--o2',MAP_ACCENT.light||'#FFC39B');
const $=id=>document.getElementById(id), toast=$('toast'), originInput=$('originInput'), destinationInput=$('destinationInput'), results=$('searchResults'), planSheet=$('planSheet'), routeState=$('routeState'), welcomeState=$('welcomeState'), activeNav=$('activeNav');
const bindClick=(id,fn)=>{const el=$(id);if(!el){console.warn(`[VANO:UI] botão ausente: ${id}`);return false}el.type=el.type||'button';el.addEventListener('click',e=>{e.preventDefault();try{const out=fn(e);if(out&&typeof out.catch==='function')out.catch(err=>{console.error(`[VANO:UI:${id}]`,err);showToast('Não foi possível concluir esta ação.')})}catch(err){console.error(`[VANO:UI:${id}]`,err);showToast('Não foi possível concluir esta ação.')}});return true};

function renderGuestTrial(remaining){if(LOGGED_IN)return;guestRoutesRemaining=Math.max(0,Number(remaining??guestRoutesRemaining)||0);const el=$('guestTrialRemaining');if(el)el.textContent=guestRoutesRemaining;const pill=$('guestTrialPill');if(pill){pill.classList.toggle('low',guestRoutesRemaining<=3);pill.classList.toggle('empty',guestRoutesRemaining<=0)}}
function showGuestLimit(){if(LOGGED_IN)return;const modal=$('guestLimitModal');if(modal){modal.classList.add('show');modal.setAttribute('aria-hidden','false')}}
function hideGuestLimit(){const modal=$('guestLimitModal');if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}}
bindClick('guestTrialPill',()=>guestRoutesRemaining<=0?showGuestLimit():showToast(`${guestRoutesRemaining} de ${GUEST_ROUTE_LIMIT} rotas grátis restantes.`));bindClick('guestLimitBackdrop',hideGuestLimit);bindClick('guestLimitLater',hideGuestLimit);renderGuestTrial(guestRoutesRemaining);
document.querySelectorAll('button:not([type])').forEach(b=>b.type='button');

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
document.addEventListener('click',e=>{const btn=e.target.closest?.('#startTripBtn');if(!btn)return;e.preventDefault();e.stopPropagation();console.debug('[VANO:UI] iniciar navegação');startTrip();},true);
let map,userMarker,userMarkerElement,originMarker,destinationMarker,userLocation=null,origin=null,destination=null,routes=[],selectedRoute=null,routeMode='safest',profile='driving',searchTimer=null,watchId=null,passiveWatchId=null,mapFollowMode=true,lastPassivePosition=null,lastPassiveCameraAt=0,navStartedAt=0,gpsDistance=0,lastGps=null,lastNavPosition=null,smoothedPos=null,routeCumulative=[],routeTotalGeometry=1,starting=false,rerouting=false,offRouteCount=0,lastRerouteAt=0,followMode=true,wakeLock=null,soundEnabled=true,lastSpokenInstruction='',cameraFrame=null,focusMode=false,roadAwareness=[],lastRoadFetchAt=0,lastRoadFetchPos=null,lastCameraBearing=null,trafficSuggestionRoute=null,lastTrafficCheckAt=0,trafficDismissUntil=0,trafficChecking=false,lastLiveEta=0,lastMarkerHeading=null,navCameraMode='top',spokenMilestones=new Set(),liveShareToken=null,liveShareUrl='',lastLiveShareAt=0,liveShareUpdating=false,safetyPulse=false,supportPoints=[],supportLoading=false,previewFrame=null,previewing=false,previewStartedAt=0,searchController=null,fastSearchController=null,searchRefineTimer=null,searchRequestId=0,activeSearchKind=null,liveContext=null,lastLiveContextAt=0,lastLiveContextPos=null,lastFlowProbeAt=0,signalRefreshTimer=null,lastSignalViewportKey='',adminSimulation=false,adminSimFrame=null,adminSimDistance=0,adminSimLastTs=0,routeLoadingSeq=0,navGpsHeartbeatTimer=null,passiveGpsHeartbeatTimer=null,gpsHeartbeatBusy=false,lastGpsFixAt=0;
const SEARCH_FAST_MIN=2,SEARCH_FAST_DELAY=70,SEARCH_REFINE_DELAY=140;
const SEARCH_CLIENT_TTL=120000,searchClientCache=new Map();
let routeController=null,routeRequestId=0,manualRouteSelection=false,lastRouteEngine='',routeResponseCache=new Map(),lastNavUiAt=0,lastCameraUpdateAt=0,lastProgressPaintAt=0,lastSignalFetchAt=0,signalController=null,adminSimLastUiAt=0,lastTrafficRadarAt=0,lastTrafficRadarKey='',lastTrafficRadarAlong=0,navLastAlong=0,lastNavRoutePaintAt=0,navLastPaintAlong=0,navLastRawPosition=null,navLastCameraZoom=null,navCameraStartUntil=0,navVoiceHoldTimer=null,navVoiceHoldOpened=false,lastMapPointerAt=0;
const routePrefetchJobs=new Map();let routePrefetchDestinationKey='';
const routeCommitKeys=new Set();
let navAlternativeHitKey='',navAlternativeHitCount=0,navAlternativeLastPaintAt=0,navAlternativePrimary=null,navAlternativeDismissedKey='',navAlternativeDismissUntil=0,navSuppressedRouteKeys=new Set(),lastRoutePuckBearing=null;
let navExperienceMode='normal',pendingCameraChoiceResolve=null,cameraChoicePending=false;
let searchInteractionActive=false,searchComposing=false,searchInteractionTimer=null;
let puckFrame=null,puckDisplayPos=null,puckTargetPos=null,puckAnimFrom=null,puckAnimStartedAt=0,puckAnimDuration=320,puckLastPaintAt=0,puckLastFixAt=0;
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
let lastCameraEaseCadence=650;
let destinationConfirmed=false,parkingController=null,parkingCache=new Map(),activeParkingItems=[];
let guestTrialId=''; const makeGuestTrialId=()=>`g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
const ACTIVE_TRIP_KEY='vano.activeTrip.v33',ACTIVE_TRIP_MAX_AGE=12*60*60*1000;let pendingResumeTrip=null,lastTripPersistAt=0;
let currentMapMood=(MAP_STYLE_MODE==='auto'?(VANO_BLACK_THEME?'night':'day'):MAP_STYLE_MODE),currentStyleUri=STYLE,styleSwitching=false,weatherController=null,lastWeatherFetchAt=0,lastWeatherPos=null,moodTimer=null,signalPulseTimer=null,signalPulseState=false;

const VOICE_PREF_KEY='vano-nav-voice-v43';
let selectedVoiceName='';
try{selectedVoiceName=localStorage.getItem(VOICE_PREF_KEY)||''}catch{}
const MAP_PREF_KEY='vano-map-preferences-v10';
function loadMapPrefs(){try{return {...{adaptiveRoutes:true,aggressiveShortcuts:true,showAlternatives:true,liveSignals:true,autoFaster:true},...JSON.parse(localStorage.getItem(MAP_PREF_KEY)||'{}')}}catch{return{adaptiveRoutes:true,aggressiveShortcuts:true,showAlternatives:true,liveSignals:true,autoFaster:true}}}
let mapPrefs=loadMapPrefs();
function saveMapPrefs(){try{localStorage.setItem(MAP_PREF_KEY,JSON.stringify(mapPrefs))}catch{}}
const VANO_PREF_KEY='vano-route-preferences-v2';
function loadSparkPrefs(){try{return {...{safety:68,traffic:62,choices:0},...JSON.parse(localStorage.getItem(VANO_PREF_KEY)||'{}')}}catch{return{safety:68,traffic:62,choices:0}}}
let sparkPrefs=loadSparkPrefs();
function saveSparkPrefs(){try{localStorage.setItem(VANO_PREF_KEY,JSON.stringify(sparkPrefs))}catch{}}
function learnRouteChoice(mode){sparkPrefs.choices=(+sparkPrefs.choices||0)+1;if(mode==='safest')sparkPrefs.safety=Math.min(90,(+sparkPrefs.safety||68)+3);if(mode==='fastest')sparkPrefs.safety=Math.max(42,(+sparkPrefs.safety||68)-3);if(mode==='smart'){sparkPrefs.safety=Math.min(82,Math.max(55,(+sparkPrefs.safety||68)+1));sparkPrefs.traffic=Math.min(88,(+sparkPrefs.traffic||62)+2)}saveSparkPrefs()}
const emptyFC=()=>({type:'FeatureCollection',features:[]});
const isMotorizedProfile=()=>profile==='driving'||profile==='motorcycle';
const profileLabel=()=>profile==='driving'?'carro':profile==='motorcycle'?'moto':profile==='walking'?'a pé':'bike';
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function updatePlannerOriginStatus(label=null){const el=$('plannerOriginStatus');if(!el)return;const base=String(label??origin?.label??'').trim();if(base){el.textContent=/^minha localiza[cç][aã]o$/i.test(base)?'Saindo da sua localização atual':base}else el.textContent=userLocation?'Usando sua localização atual':'Toque em “Meu GPS” para definir a saída';}
function renderRouteSummaryPills(route){const box=$('routeSummaryPills'),count=$('routeChooserCount');if(count)count.textContent=(routes||[]).length>1?`${Math.min(4,(routes||[]).length)} opções comparadas`:'1 rota pronta';if(!box||!route)return;const pills=[];pills.push(`<span class="route-summary-pill emphasis"><i data-lucide="${routeMode==='fastest'?'zap':'shield-check'}" width="13"></i><b>${routeMode==='fastest'?'Modo ETA':'Modo seguro'}</b></span>`);pills.push(`<span class="route-summary-pill"><i data-lucide="traffic-cone" width="13"></i><span>${esc(route.traffic_level||'Fluxo estimado')}</span></span>`);pills.push(`<span class="route-summary-pill"><i data-lucide="triangle-alert" width="13"></i><span>${Math.max(0,route.nearby_alerts?.length||0)} alertas</span></span>`);if(routeMode!=='fastest')pills.push(`<span class="route-summary-pill"><i data-lucide="sparkles" width="13"></i><span>Score ${Math.round(+route.vano_score||0)}/100</span></span>`);else if(route.micro_route)pills.push(`<span class="route-summary-pill"><i data-lucide="route" width="13"></i><span>Microrrota ativa</span></span>`);box.innerHTML=pills.join('');}
function showToast(m){toast.textContent=m;toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('show'),3300)}
function openAccountDrawer(force=true){const drawer=$('accountDrawer'),backdrop=$('accountBackdrop');if(!drawer||!backdrop)return;const show=force===null?!drawer.classList.contains('show'):!!force;drawer.classList.toggle('show',show);backdrop.classList.toggle('show',show);if(show&&window.lucide)lucide.createIcons()}
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
function readLastGps(){try{const x=JSON.parse(localStorage.getItem(LAST_GPS_KEY)||'null');if(!x||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon)||Date.now()-(+x.ts||0)>6*60*60*1000)return null;return{lat:+x.lat,lon:+x.lon,accuracy:+x.accuracy||999,heading:Number.isFinite(+x.heading)?+x.heading:null,speed:Number.isFinite(+x.speed)?+x.speed:null,ts:+x.ts||0}}catch{return null}}
function saveLastGps(p){if(!p||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return;try{localStorage.setItem(LAST_GPS_KEY,JSON.stringify({lat:+p.lat,lon:+p.lon,accuracy:+p.accuracy||999,heading:Number.isFinite(+p.heading)?+p.heading:null,speed:Number.isFinite(+p.speed)?+p.speed:null,ts:Date.now()}))}catch{}}
function geoRaw(g){return{lat:g.coords.latitude,lon:g.coords.longitude,accuracy:g.coords.accuracy,heading:Number.isFinite(g.coords.heading)?g.coords.heading:null,speed:Number.isFinite(g.coords.speed)?Math.max(0,g.coords.speed):null}}
function requestPosition(){return new Promise((ok,no)=>{if(!navigator.geolocation)return no({code:0});navigator.geolocation.getCurrentPosition(ok,no,{enableHighAccuracy:true,timeout:4500,maximumAge:5000})})}
function stopStartupGps(){if(startupWatchId!==null){try{navigator.geolocation.clearWatch(startupWatchId)}catch{}startupWatchId=null}if(startupWatchTimer){clearTimeout(startupWatchTimer);startupWatchTimer=null}}
function stopPassiveMapTracking(){if(passiveWatchId!==null){try{navigator.geolocation?.clearWatch(passiveWatchId)}catch{}passiveWatchId=null}if(passiveGpsHeartbeatTimer){clearInterval(passiveGpsHeartbeatTimer);passiveGpsHeartbeatTimer=null}}
function stopNavigationGpsHeartbeat(){if(navGpsHeartbeatTimer){clearInterval(navGpsHeartbeatTimer);navGpsHeartbeatTimer=null}gpsHeartbeatBusy=false}
function requestGpsHeartbeat(handler,timeout=3500,maximumAge=0){if(gpsHeartbeatBusy||!navigator.geolocation||document.visibilityState==='hidden')return;gpsHeartbeatBusy=true;try{navigator.geolocation.getCurrentPosition(g=>{gpsHeartbeatBusy=false;lastGpsFixAt=Date.now();handler(g)},()=>{gpsHeartbeatBusy=false},{enableHighAccuracy:true,maximumAge,timeout})}catch{gpsHeartbeatBusy=false}}
function startPassiveGpsHeartbeat(){if(passiveGpsHeartbeatTimer||!navigator.geolocation)return;passiveGpsHeartbeatTimer=setInterval(()=>{if(activeNav?.classList.contains('show')||!mapFollowMode)return;if(Date.now()-lastGpsFixAt<4200)return;requestGpsHeartbeat(updatePassiveTracking,3500,900)},5200)}
function startNavigationGpsHeartbeat(){stopNavigationGpsHeartbeat();if(!navigator.geolocation)return;navGpsHeartbeatTimer=setInterval(()=>{if(!activeNav?.classList.contains('show')||adminSimulation)return;if(Date.now()-lastGpsFixAt<1200)return;requestGpsHeartbeat(g=>{if(activeNav?.classList.contains('show')&&!adminSimulation)updateNavigation(g)},3000,0)},2200)}
function passiveCameraAllowed(){return !!map&&mapFollowMode&&!activeNav?.classList.contains('show')&&!previewing&&!destinationConfirmed&&!selectedRoute&&document.visibilityState!=='hidden'}
function updatePassiveTracking(g){
  if(!g?.coords)return;lastGpsFixAt=Date.now();const raw=geoRaw(g),p=filterPosition(raw);saveLastGps(raw);userLocation={lat:p.lat,lon:p.lon};updateUserMarker(p);updateGpsQuality(raw.accuracy);hidePermission();maybeSyncPresence(p);scheduleEnvironmentalRefresh(p,false);scheduleTrafficSnapshot(false);
  const movedMeters=!lastPassivePosition?Infinity:hav([lastPassivePosition.lon,lastPassivePosition.lat],[p.lon,p.lat]);lastPassivePosition={...p};
  if(!passiveCameraAllowed()||searchInteractionActive||movedMeters<.35)return;const now=performance.now(),gap=lastPassiveCameraAt?now-lastPassiveCameraAt:500;if(gap<140)return;lastPassiveCameraAt=now;
  const z=Math.max(15.8,Math.min(17.1,map.getZoom?.()||16.2)),duration=Math.max(180,Math.min(760,gap*1.05));
  try{map.easeTo({center:[p.lon,p.lat],zoom:z,duration,essential:true,easing:t=>1-Math.pow(1-t,3)})}catch{}
}
function startPassiveMapTracking(){
  if(!navigator.geolocation||activeNav?.classList.contains('show'))return;
  if(passiveWatchId===null){try{passiveWatchId=navigator.geolocation.watchPosition(updatePassiveTracking,e=>{if(e?.code===1)showPermission(locationErrorMessage(e))},{enableHighAccuracy:true,maximumAge:0,timeout:9000})}catch(e){console.warn('[VANO:passive GPS]',e)}}
  startPassiveGpsHeartbeat();
}
function applyStartupFix(g,asOrigin=false,center=false){const raw=geoRaw(g),p=filterPosition(raw);saveLastGps(raw);userLocation={lat:p.lat,lon:p.lon};updateUserMarker(p);updateGpsQuality(raw.accuracy);hidePermission();if(asOrigin){if(!origin||origin.is_gps){if(!origin)setPoint('origin',{...p,is_gps:true},'Minha localização',false);else{origin={...origin,...p,is_gps:true,label:'Minha localização'};originInput.value='Minha localização';originMarker?.setLngLat([p.lon,p.lat])}}}if(center&&map)map.jumpTo({center:[p.lon,p.lat],zoom:16.2});if(destinationConfirmed&&destination&&origin&&!window.__sparkStartupRouteQueued){window.__sparkStartupRouteQueued=true;setTimeout(()=>{window.__sparkStartupRouteQueued=false;calculateRoutes()},120)}maybeSyncPresence(p);scheduleEnvironmentalRefresh(p,false);scheduleTrafficSnapshot(false);return p}
function bootstrapGps(asOrigin=false){const cached=readLastGps();mapFollowMode=true;if(cached){userLocation={lat:cached.lat,lon:cached.lon};lastPassivePosition={...cached};updateUserMarker(cached);updateGpsQuality(cached.accuracy);if(map)map.jumpTo({center:[cached.lon,cached.lat],zoom:16});scheduleTrafficSnapshot(false);if(asOrigin&&!origin){setPoint('origin',{...cached,is_gps:true},'Minha localização',false);origin.is_gps=true}}if(!navigator.geolocation)return;let gotFresh=false;const finishStartup=()=>{stopStartupGps();startPassiveMapTracking()};navigator.geolocation.getCurrentPosition(g=>{gotFresh=true;applyStartupFix(g,asOrigin,!cached)},e=>{if(!cached&&e?.code===1)showPermission(locationErrorMessage(e))},{enableHighAccuracy:false,timeout:1200,maximumAge:60000});stopStartupGps();startupWatchId=navigator.geolocation.watchPosition(g=>{applyStartupFix(g,asOrigin,!cached&&!gotFresh);gotFresh=true;if((+g.coords.accuracy||999)<=35)finishStartup()},e=>{if(!cached&&e?.code===1)showPermission(locationErrorMessage(e))},{enableHighAccuracy:true,maximumAge:600,timeout:5000});startupWatchTimer=setTimeout(finishStartup,8500)}
function updateGpsQuality(acc){if(!Number.isFinite(acc))return;const box=$('gpsQuality'),bars=$('gpsBars');box.classList.add('show');$('gpsAccuracy').textContent=`GPS ±${Math.round(acc)} m`;bars.className='gps-bars '+(acc<=20?'good':acc<=60?'mid':'')}
function makeUserMarker(){const el=document.createElement('div');el.className='user-marker vano-uploaded-user';el.innerHTML='<span class="pulse"></span><img class="user-puck-image" src="/static/icons/vano/user-puck.svg" alt="">';userMarkerElement=el;return el}
function updateMarkerHeading(absoluteHeading){if(!userMarkerElement||!map)return;const h=userMarkerElement.querySelector('.user-puck-image');if(!h)return;if(!Number.isFinite(absoluteHeading)){h.style.transform='rotate(0deg)';return}lastMarkerHeading=absoluteHeading;const screen=((absoluteHeading-map.getBearing()+540)%360)-180;h.style.transform=`rotate(${screen}deg)`}
function routeAlignedPuckBearing(p){if(!selectedRoute?.geometry?.coordinates?.length)return null;const m=nearestProgress(p),along=Number.isFinite(+p?._distanceAlong)?+p._distanceAlong:+m.distanceAlong||0,speed=Math.max(0,+p?.speed||0),span=Math.max(22,Math.min(64,30+speed*1.8)),bearing=routeBearingAtDistance(along,span);if(!Number.isFinite(bearing))return Number.isFinite(lastRoutePuckBearing)?lastRoutePuckBearing:null;lastRoutePuckBearing=bearing;return bearing}
function paintUserMarker(p){if(!p||!map)return;if(!userMarker)userMarker=new mapboxgl.Marker({element:makeUserMarker(),anchor:'center'}).setLngLat([p.lon,p.lat]).addTo(map);else userMarker.setLngLat([p.lon,p.lat]);const navOn=activeNav?.classList.contains('show')&&selectedRoute,routeHeading=navOn?routeAlignedPuckBearing(p):null;updateMarkerHeading(Number.isFinite(routeHeading)?routeHeading:p.heading)}
function stopPuckAnimation(){if(puckFrame!==null){cancelAnimationFrame(puckFrame);puckFrame=null}}
function puckAnimationTick(ts){puckFrame=null;if(!puckTargetPos||!puckAnimFrom||document.visibilityState==='hidden'||searchInteractionActive)return;const t=Math.max(0,Math.min(1,(ts-puckAnimStartedAt)/Math.max(1,puckAnimDuration))),e=1-Math.pow(1-t,3);puckDisplayPos={...puckTargetPos,lat:puckAnimFrom.lat+(puckTargetPos.lat-puckAnimFrom.lat)*e,lon:puckAnimFrom.lon+(puckTargetPos.lon-puckAnimFrom.lon)*e};if(ts-puckLastPaintAt>=30||t>=1){puckLastPaintAt=ts;paintUserMarker(puckDisplayPos)}if(t<1)puckFrame=requestAnimationFrame(puckAnimationTick)}
function updateUserMarker(p,opts={}){if(!p||!map||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return;const now=performance.now(),next={...p,lat:+p.lat,lon:+p.lon},gap=puckLastFixAt?Math.max(100,Math.min(1800,now-puckLastFixAt)):360;puckLastFixAt=now;puckTargetPos=next;if(searchInteractionActive){stopPuckAnimation();return}if(previewing||adminSimulation){stopPuckAnimation();puckDisplayPos={...next};if(now-puckLastPaintAt>=30||!userMarker){puckLastPaintAt=now;paintUserMarker(puckDisplayPos)}return}const distance=puckDisplayPos?hav([puckDisplayPos.lon,puckDisplayPos.lat],[next.lon,next.lat]):Infinity;if(opts.instant||!puckDisplayPos||distance>220){stopPuckAnimation();puckDisplayPos={...next};paintUserMarker(puckDisplayPos);return}stopPuckAnimation();puckAnimFrom={...puckDisplayPos};puckAnimStartedAt=now;puckAnimDuration=Math.max(110,Math.min(480,gap*.68));if(distance<.02){puckDisplayPos={...next};paintUserMarker(puckDisplayPos);return}puckFrame=requestAnimationFrame(puckAnimationTick)}
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
function stabilizeActiveNavPosition(filtered,raw,match=null){
  if(!activeNav?.classList.contains('show')||!selectedRoute?.geometry?.coordinates?.length)return filtered;
  if(!routeCumulative.length)buildMetrics();
  const m=match||nearestProgress(filtered),acc=Number.isFinite(+raw?.accuracy)?Math.max(1,+raw.accuracy):50,speed=Number.isFinite(+raw?.speed)?Math.max(0,+raw.speed):0,snapLimit=Math.max(18,Math.min(58,acc*1.22));
  const rawMove=navLastRawPosition?hav([navLastRawPosition.lon,navLastRawPosition.lat],[raw.lon,raw.lat]):Infinity;
  navLastRawPosition={lat:raw.lat,lon:raw.lon,accuracy:acc,speed};
  if(!Number.isFinite(m.offRoute)||m.offRoute>snapLimit)return {...filtered,_rawOffRoute:m.offRoute,_routeSnapped:false};
  let along=Math.max(0,m.distanceAlong||0);
  const jitterRadius=Math.max(2.4,Math.min(7.0,acc*.17)),moving=speed>.72||rawMove>jitterRadius;
  if(navLastAlong>0){
    if(!moving&&Math.abs(along-navLastAlong)<20)along=navLastAlong;
    else if(along<navLastAlong-5)along=navLastAlong;
    else if(moving&&along<navLastAlong)along=Math.max(navLastAlong-1.2,along);
  }
  const xy=routePointAtDistance(along);if(!xy)return filtered;
  // While matched to the corridor, keep the puck on the actual route geometry.
  // The raw GPS is still used for off-route detection so a real departure is not hidden.
  const strength=moving?(acc<=28?.99:.94):1;
  return {...filtered,lon:filtered.lon+(xy[0]-filtered.lon)*strength,lat:filtered.lat+(xy[1]-filtered.lat)*strength,_rawOffRoute:m.offRoute,_routeSnapped:true,_distanceAlong:along,_moving:moving};
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
function alternativeMeta(route){if(!route||!selectedRoute)return'';const saving=Math.max(0,(+selectedRoute.duration||0)-(+route.duration||0));if(saving<20)return'';const min=Math.max(1,Math.round(saving/60));return `Economiza cerca de ${min} min`}
function refreshNavigationAlternatives(force=false){
  if(!activeNav?.classList.contains('show'))return;const now=performance.now();if(!force&&now-navAlternativeLastPaintAt<500)return;navAlternativeLastPaintAt=now;const list=navigationAlternativeRoutes();map?.getSource('route-alternatives')?.setData(navAlternativeFC());
  const selectedEta=+selectedRoute?.duration||Infinity,primary=list.filter(r=>(+r.duration||Infinity)+20<selectedEta).sort((a,b)=>(+a.duration||Infinity)-(+b.duration||Infinity))[0]||null;navAlternativePrimary=primary;const box=$('navAltHint');if(!box)return;const key=routeClientKey(primary),dismissed=primary&&navAlternativeDismissedKey===key&&Date.now()<navAlternativeDismissUntil,show=!!primary&&!dismissed;box.classList.toggle('show',show);document.body.classList.toggle('nav-alt-visible',show);if(show){$('navAltHintText').textContent='Tem uma rota mais rápida, quer trocar pra ela?';$('navAltHintMeta').textContent=alternativeMeta(primary)}
}
function acceptNavigationAlternative(){if(!navAlternativePrimary||!lastNavPosition)return;const m=nearestProgressOnRoute(lastNavPosition,navAlternativePrimary);adoptNavigationAlternative(navAlternativePrimary,lastNavPosition,m)}
function dismissNavigationAlternative(){if(navAlternativePrimary){navAlternativeDismissedKey=routeClientKey(navAlternativePrimary);navAlternativeDismissUntil=Date.now()+90000}const box=$('navAltHint');box?.classList.remove('show');document.body.classList.remove('nav-alt-visible');showToast('Mantendo a rota atual.')}
function mergeNavigationAlternative(route){if(!route?.geometry?.coordinates?.length)return;const key=routeClientKey(route);if((routes||[]).some(r=>routeClientKey(r)===key))return;routes=[...(routes||[]),route];refreshNavigationAlternatives(true)}
function adoptNavigationAlternative(route,p,match=null){
  if(!route||route===selectedRoute)return false;const old=selectedRoute,oldKey=routeClientKey(old);if(oldKey)navSuppressedRouteKeys.add(oldKey);selectedRoute=route;navAlternativeDismissedKey='';navAlternativeDismissUntil=0;origin={lat:+p.lat,lon:+p.lon,label:'Minha localização',is_gps:true};buildMetrics();const m=match||nearestProgress(p);navLastAlong=Math.max(0,m.distanceAlong||0);navLastPaintAlong=navLastAlong;navLastRawPosition=null;lastNavRoutePaintAt=0;resetOffRouteTracker();navAlternativeHitKey='';navAlternativeHitCount=0;setNavRouteData(navLastAlong);refreshNavigationAlternatives(true);updateRoadLayer();const step=currentStep(m.distanceAlong);$('nextStreet').textContent=stepStreet(step);$('nextInstruction').textContent=maneuverLabel(step);$('maneuverGlyph').textContent=maneuverGlyph(step);updateNavSummary(Math.max(0,(+selectedRoute.duration||0)*(1-m.progress)),m.remaining,step);scheduleCamera(p,true,m);haptic(14);showToast(route.micro_route?'Micro-rota ativada automaticamente.':'Rota alternativa ativada automaticamente.');speak(route.micro_route?'Entrei na micro-rota. Ajustei o trajeto.':'Entrei na rota alternativa. Ajustei o trajeto.','alternative-adopt-'+Date.now());return true
}
function maybeAdoptNavigationAlternative(raw,p){
  if(!isMotorizedProfile()||!activeNav?.classList.contains('show')||!selectedRoute||navLastAlong<45||!offRouteEligibleForReroute())return false;const list=navigationAlternativeRoutes();if(!list.length)return false;const acc=Math.max(4,+raw?.accuracy||35),current=nearestProgressOnRoute(raw,selectedRoute),speed=Math.max(0,+raw?.speed||0);let best=null,bestScore=Infinity,bestMatch=null;
  for(const r of list){const m=nearestProgressOnRoute(raw,r),limit=Math.max(14,Math.min(42,acc*1.18));if(m.offRoute>limit)continue;let score=m.offRoute-current.offRoute;const h=Number.isFinite(+raw?.heading)?+raw.heading:null;if(h!=null&&speed>1.8){const altB=routeBearingAtDistanceFor(r,m.distanceAlong,34),curB=routeBearingAtDistanceFor(selectedRoute,current.distanceAlong,34);if(Number.isFinite(altB))score+=bearingDelta(h,altB)*.10;if(Number.isFinite(curB))score-=bearingDelta(h,curB)*.05}const convincinglyBetter=(current.offRoute>Math.max(24,acc*1.28)&&m.offRoute+8<current.offRoute)||(current.offRoute>Math.max(18,acc*.80)&&m.offRoute+14<current.offRoute);if(!convincinglyBetter)continue;if(score<bestScore){best=r;bestScore=score;bestMatch=m}}
  if(!best){navAlternativeHitKey='';navAlternativeHitCount=0;return false}const key=routeClientKey(best);if(navAlternativeHitKey===key)navAlternativeHitCount++;else{navAlternativeHitKey=key;navAlternativeHitCount=1}if(navAlternativeHitCount<4)return false;return adoptNavigationAlternative(best,p,bestMatch)
}

function remainingNavGeometry(startAlong=0){
  const c=selectedRoute?.geometry?.coordinates||[];if(c.length<2)return selectedRoute?.geometry||null;if(!routeCumulative.length)buildMetrics();
  const start=Math.max(0,Math.min(routeTotalGeometry-0.01,+startAlong||0)),pt=routePointAtDistance(start);let lo=0,hi=routeCumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(routeCumulative[mid]<start)lo=mid+1;else hi=mid}const coords=[pt,...c.slice(Math.max(1,lo))].filter(Boolean),clean=[];for(const x of coords){const prev=clean.at(-1);if(!prev||hav(prev,x)>.25)clean.push(x)}return clean.length>1?{type:'LineString',coordinates:clean}:selectedRoute.geometry;
}
function routeBearingAtDistance(distance,span=34){const a=routePointAtDistance(distance),b=routePointAtDistance(distance+span);return a&&b?bearingBetween(a,b):null}
function upcomingTurn(m,speed){const d=m?.distanceAlong||0,b0=routeBearingAtDistance(d,28),look=isMotorizedProfile()?Math.max(85,Math.min(220,105+speed*4.2)):42,b1=routeBearingAtDistance(d+look,34);return{angle:Number.isFinite(b0)&&Number.isFinite(b1)?bearingDelta(b0,b1):0,distance:look}}
function cameraLookAhead(speed,m){let base=isMotorizedProfile()?Math.max(100,Math.min(225,102+speed*4.6)):34;const turn=upcomingTurn(m,speed);if(turn.angle>58)base*=.62;else if(turn.angle>34)base*=.76;const step=currentStep(m?.distanceAlong||0);if((step.remainingInStep??9999)<120)base*=.82;return Math.max(isMotorizedProfile()?72:28,base)}
function scheduleCamera(p,instant=false,progressInfo=null){
  if(!p||!map||!selectedRoute||!followMode||searchInteractionActive)return;
  const now=performance.now(),gap=lastCameraUpdateAt?now-lastCameraUpdateAt:lastCameraEaseCadence;if(!instant&&gap<110)return;lastCameraUpdateAt=now;lastCameraEaseCadence=Math.max(160,Math.min(950,lastCameraEaseCadence*.72+gap*.28));
  if(cameraFrame)cancelAnimationFrame(cameraFrame);
  cameraFrame=requestAnimationFrame(()=>{
    if(searchInteractionActive||!followMode)return;
    const speed=Math.max(0,+p.speed||0),m=progressInfo||nearestProgress(p),routeBearing=routeBearingAtDistance(m.distanceAlong,Math.max(24,Math.min(58,30+speed*1.6))),targetBearing=Number.isFinite(routeBearing)?routeBearing:(Number.isFinite(lastRoutePuckBearing)?lastRoutePuckBearing:map.getBearing());
    let zoom,pitch,bearing,center=[p.lon,p.lat],padding={top:0,bottom:0,left:0,right:0};
    const startupRemain=Math.max(0,(+navCameraStartUntil||0)-now),startupRatio=Math.min(1,startupRemain/6500),startupBoost=isMotorizedProfile()?(.58*startupRatio):(.34*startupRatio);
    if(navExperienceMode==='immersive'){
      const turn=upcomingTurn(m,speed),look=isMotorizedProfile()?Math.max(25,Math.min(58,31+speed*1.05)):17,routeTarget=routePointAtDistance(Math.min(routeTotalGeometry-1,m.distanceAlong+look));if(routeTarget)center=routeTarget;
      zoom=(isMotorizedProfile()?17.18:17.38)-Math.min(.22,speed*.007)+startupBoost*.72;pitch=turn.angle>58?50:turn.angle>36?54:57;lastCameraBearing=blendBearing(lastCameraBearing,targetBearing,instant?.62:.28);bearing=lastCameraBearing;
      const vw=Math.max(320,window.innerWidth||320),vh=Math.max(480,window.innerHeight||480);padding={top:Math.round(Math.min(108,vh*.105)),bottom:Math.round(Math.min(318,Math.max(182,vh*.275))),left:Math.round(Math.min(88,Math.max(22,vw*.052))),right:Math.round(Math.min(34,Math.max(8,vw*.016)))};
    }else if(navCameraMode==='top'){zoom=(isMotorizedProfile()?16.90:17.30)-Math.min(.22,speed*.010)+startupBoost;pitch=0;bearing=0}
    else{zoom=(isMotorizedProfile()?16.58:17.08)-Math.min(.31,speed*.013)+startupBoost*.88;pitch=isMotorizedProfile()?59:49;lastCameraBearing=blendBearing(lastCameraBearing,targetBearing,instant?.55:.24);bearing=lastCameraBearing}
    if((p.accuracy||0)>70)zoom=Math.min(zoom,16.42+startupBoost*.35);const currentZoom=Number.isFinite(navLastCameraZoom)?navLastCameraZoom:map.getZoom(),smoothZoom=instant?zoom:(currentZoom+(zoom-currentZoom)*.28);navLastCameraZoom=smoothZoom;
    const duration=instant?320:Math.max(180,Math.min(900,lastCameraEaseCadence*1.02));
    try{map.stop?.();map.easeTo({center,zoom:smoothZoom,pitch,bearing,padding,duration:Math.max(170,Math.min(duration,gap*1.15)),essential:true,easing:t=>1-Math.pow(1-t,3)})}catch(e){console.debug('[VANO:camera]',e)}updateMarkerHeading(targetBearing);
  });
}
function markerEl(kind){
  const el=document.createElement('div');
  if(kind==='origin'){el.className='route-marker origin';el.innerHTML='<div class="shell"></div>';return el}
  el.className='route-marker destination';
  el.setAttribute('aria-label','Destino');
  el.innerHTML='<span class="arrival-visual"><span class="arrival-ground"></span><span class="arrival-bubble"><span class="arrival-ring"><span class="arrival-checkers"></span></span></span></span>';
  return el
}
function toggleSafetyPulse(){safetyPulse=!safetyPulse;const layer=map?.getLayer('alerts-heat');if(layer)map.setLayoutProperty('alerts-heat','visibility',safetyPulse?'visible':'none');$('map')?.classList.toggle('safety-pulse-on',safetyPulse);if(safetyPulse){refreshAlerts();showToast('Safety Pulse ativo.')}else showToast('Safety Pulse ocultado.')}
function openSafetyDrawer(force=true){const box=$('safetyDrawer'),btn=$('safetyToolsBtn'),show=force===null?!box.classList.contains('show'):!!force;box.classList.toggle('show',show);btn.classList.toggle('safety-open',show);if(show&&window.lucide)lucide.createIcons()}
function supportPointFC(items){return{type:'FeatureCollection',features:(items||[]).map(x=>({type:'Feature',properties:{id:x.id,type:x.type,label:x.label,name:x.name,distance_m:x.distance_m},geometry:{type:'Point',coordinates:[x.lon,x.lat]}}))}}
function renderSupportPoints(){const list=$('supportList'),box=$('supportResults');$('supportCount').textContent=supportPoints.length?`${supportPoints.length} encontrados`:'nenhum';if(!supportPoints.length){list.innerHTML='<div style="color:#727b86;font-size:8px;padding:8px 2px">Nenhum ponto mapeado encontrado nesse raio.</div>';box.classList.add('show');return}list.innerHTML=supportPoints.map((x,i)=>`<button type="button" class="support-item" data-support-i="${i}"><span><b>${esc(x.name||x.label)}</b><span>${esc(x.label)}${x.opening_hours?' · horário mapeado':''}</span></span><strong>${fmtDistance(+x.distance_m||0)}</strong></button>`).join('');box.classList.add('show');list.querySelectorAll('[data-support-i]').forEach(btn=>btn.onclick=()=>{const x=supportPoints[+btn.dataset.supportI];if(!x)return;followMode=false;$('navRecenter').classList.remove('active');map.easeTo({center:[x.lon,x.lat],zoom:16.4,pitch:48,bearing:map.getBearing(),duration:650});new mapboxgl.Popup({closeButton:false,offset:12}).setLngLat([x.lon,x.lat]).setHTML(`<b>${esc(x.name||x.label)}</b><div style="color:#9299a5;font-size:9px;margin-top:4px">${esc(x.label)} · ${fmtDistance(+x.distance_m||0)}</div>`).addTo(map)})}
async function loadSupportPoints(){if(supportLoading)return;const p=lastNavPosition||userLocation;if(!p){showToast('Ative sua localização para buscar pontos de apoio.');return}supportLoading=true;$('supportResults').classList.add('show');$('supportList').innerHTML='<div style="padding:10px 2px;color:#7f8893;font-size:8px"><span class="loading"></span> Buscando dados mapeados próximos…</div>';try{const r=await fetch(`/api/support-points?lat=${encodeURIComponent(p.lat)}&lon=${encodeURIComponent(p.lon)}&radius=3500`),d=await r.json();if(!r.ok)throw new Error(d.error||'Falha na busca');supportPoints=d.items||[];if(map?.getSource('support-points'))map.getSource('support-points').setData(supportPointFC(supportPoints));renderSupportPoints();if(supportPoints.length)showToast(`${supportPoints.length} ponto(s) de apoio mapeado(s) próximo(s).`)}catch(e){supportPoints=[];renderSupportPoints();showToast('Não foi possível carregar pontos de apoio agora.')}finally{supportLoading=false}}
async function shareSafetyMessage(kind='checkin'){const p=lastNavPosition||userLocation;if(!p){showToast('Sua posição ainda não está disponível.');return}const mapsUrl=`https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;let text=kind==='sos'?'Preciso de ajuda. Esta é minha posição atual.':'Estou bem. Compartilhando minha posição atual.';if(destination?.label)text+=` Destino: ${destination.label}.`;if(liveShareUrl)text+=` Acompanhamento ao vivo: ${liveShareUrl}`;if(kind==='sos'&&LOGGED_IN){try{const r=await fetch('/api/sos',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({lat:p.lat,lon:p.lon,destination:destination?.label||''})}),d=await r.json();if(r.ok&&d.notified>0)showToast(`SOS enviado para ${d.notified} conta(s) vinculada(s).`)}catch(e){console.warn('[VANO:SOS notify]',e)}}try{if(navigator.share)await navigator.share({title:kind==='sos'?'Compartilhamento de emergência':'Check-in VANO',text,url:liveShareUrl||mapsUrl});else{await navigator.clipboard.writeText(`${text} ${liveShareUrl||mapsUrl}`);showToast(kind==='sos'?'Mensagem de emergência copiada.':'Check-in copiado.')}}catch(e){if(e?.name!=='AbortError')showToast('Não foi possível abrir o compartilhamento.')}}
function setPoint(kind,p,label,calculate=true){const x={...p,lat:+p.lat,lon:+p.lon,label:label||p.label||`${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}`};if(kind==='origin'){origin=x;originInput.value=x.label;updatePlannerOriginStatus(x.label);if(originMarker){originMarker.remove();originMarker=null}/* GPS origin uses the live user puck; avoid drawing a duplicate marker. */if(!x.is_gps)originMarker=new mapboxgl.Marker({element:markerEl('origin')}).setLngLat([x.lon,x.lat]).addTo(map)}else{destination=x;destinationConfirmed=false;if(!LOGGED_IN&&!guestTrialId)guestTrialId=makeGuestTrialId();destinationInput.value=x.label;if(destinationMarker)destinationMarker.remove();destinationMarker=new mapboxgl.Marker({element:markerEl('destination'),anchor:'bottom',offset:[0,0]}).setLngLat([x.display_lon??x.lon,x.display_lat??x.lat]).addTo(map);prefetchDestinationRoutes(x)}hideResults();if(kind==='destination'&&calculate){showDestinationConfirmation();return}if(calculate&&origin&&destination&&destinationConfirmed){fitEndpoints();calculateRoutes()}}
function showDestinationConfirmation(){if(!destination)return;routeController?.abort();routes=[];selectedRoute=null;routeState.style.display='none';$('destinationConfirmTitle').textContent=String(destination.name||destination.label||'Destino selecionado').split(',')[0];$('destinationConfirmAddress').textContent=destination.label||'Confira o ponto no mapa antes de continuar.';$('destinationConfirm').classList.add('show');planSheet.classList.add('hidden');map?.stop?.();try{map?.resize?.()}catch{}haptic(8)}
function editDestination(){destinationConfirmed=false;abortRoutePrefetches();if(!LOGGED_IN)guestTrialId='';$('destinationConfirm').classList.remove('show');planSheet.classList.remove('hidden');planSheet.classList.add('sheet-collapsed');if(destinationMarker){destinationMarker.remove();destinationMarker=null}destination=null;routes=[];selectedRoute=null;destinationInput.focus();destinationInput.select();hideResults()}
async function confirmDestination(){if(!destination)return;destinationConfirmed=true;$('destinationConfirm').classList.remove('show');planSheet.classList.remove('hidden');if(!origin){await locateUser(true);if(!origin){showToast('Ainda estamos aguardando sua localização.');return}}fitEndpoints();await calculateRoutes();if(profile==='driving')loadParkingNearby(false)}
function parkingCacheKey(){return destination?`${(+destination.lat).toFixed(4)},${(+destination.lon).toFixed(4)}`:''}
function renderParkingNearby(){const box=$('parkingNearby'),list=$('parkingList');if(!box||!list)return;const shouldShow=destinationConfirmed&&profile==='driving';box.classList.toggle('show',shouldShow);if(!shouldShow)return;if(!activeParkingItems.length&&list.dataset.state!=='loading'){list.innerHTML='<div class="parking-empty">Nenhum estacionamento mapeado encontrado perto deste destino.</div>';return}if(activeParkingItems.length){list.innerHTML=activeParkingItems.map((x,i)=>`<button type="button" class="parking-item" data-parking-i="${i}"><span><b>${esc(x.name||'Estacionamento')}</b><span>${fmtDistance(+x.walk_distance_m||+x.distance_straight_m||0)} a pé${x.fee==='yes'?' · pago':x.fee==='no'?' · gratuito':''}</span></span><strong>${Math.max(1,+x.walk_minutes||1)} min a pé</strong></button>`).join('');list.querySelectorAll('[data-parking-i]').forEach(btn=>btn.onclick=()=>{const x=activeParkingItems[+btn.dataset.parkingI];if(!x)return;map.easeTo({center:[+x.lon,+x.lat],zoom:17,pitch:38,duration:480});new mapboxgl.Popup({closeButton:false,offset:14}).setLngLat([+x.lon,+x.lat]).setHTML(`<b>${esc(x.name||'Estacionamento')}</b><div style="margin-top:4px;color:#9098a2;font-size:9px">${Math.max(1,+x.walk_minutes||1)} min a pé do destino · ${esc(fmtDistance(+x.walk_distance_m||0))}</div>`).addTo(map)})}}
async function loadParkingNearby(force=false){if(!destinationConfirmed||!destination||profile!=='driving'){renderParkingNearby();return}const key=parkingCacheKey(),cached=parkingCache.get(key);if(!force&&cached&&Date.now()-cached.ts<10*60*1000){activeParkingItems=cached.items;renderParkingNearby();return}parkingController?.abort();parkingController=new AbortController();const list=$('parkingList');$('parkingNearby').classList.add('show');list.dataset.state='loading';list.innerHTML='<div class="parking-empty"><span class="loading"></span> Procurando estacionamentos próximos e calculando a caminhada…</div>';try{const q=new URLSearchParams({lat:destination.lat,lon:destination.lon,radius:2200}),r=await fetch('/api/parking-nearby?'+q,{signal:parkingController.signal}),d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao buscar estacionamentos');activeParkingItems=d.items||[];parkingCache.set(key,{ts:Date.now(),items:activeParkingItems});delete list.dataset.state;renderParkingNearby()}catch(e){if(e?.name==='AbortError')return;activeParkingItems=[];delete list.dataset.state;list.innerHTML='<div class="parking-empty">Não foi possível consultar estacionamentos agora.</div>'}}
function fitEndpoints(){if(!origin||!destination)return;const b=new mapboxgl.LngLatBounds();b.extend([origin.lon,origin.lat]);b.extend([destination.lon,destination.lat]);map.fitBounds(b,{padding:{top:215,bottom:315,left:36,right:36},maxZoom:15.5,duration:680})}
async function reverseLabel(lat,lon){try{const r=await fetch(`/api/reverse?lat=${lat}&lon=${lon}`),d=await r.json();return d.label||'Minha localização'}catch{return 'Minha localização'}}
async function locateUser(asOrigin=false){if(!navigator.geolocation){showPermission('Seu navegador não oferece geolocalização. Abra o VANO em um navegador com GPS.');return null}mapFollowMode=true;startPassiveMapTracking();const cached=readLastGps();if(cached&&!userLocation){userLocation={lat:cached.lat,lon:cached.lon};lastPassivePosition={...cached};updateUserMarker(cached);map.easeTo({center:[cached.lon,cached.lat],zoom:16,duration:180})}try{const g=await requestPosition(),raw=geoRaw(g),p=filterPosition(raw);saveLastGps(raw);userLocation={lat:p.lat,lon:p.lon};lastPassivePosition={...p};updateUserMarker(p);updateGpsQuality(raw.accuracy);hidePermission();const label=await reverseLabel(p.lat,p.lon);$('cityStatus').textContent=(label.split(',').slice(0,2).join(',')||'Perto de você').slice(0,45);if(asOrigin||!origin){setPoint('origin',{...p,is_gps:true},'Minha localização',false);origin.is_gps=true}map.easeTo({center:[p.lon,p.lat],zoom:16.2,duration:220});updateFloatingSpeedometer(Number.isFinite(raw.speed)?raw.speed*3.6:0);maybeSyncPresence(p);scheduleEnvironmentalRefresh(p,true);if(destinationConfirmed&&origin&&destination)calculateRoutes();return g}catch(e){if(cached){hidePermission();showToast('Usando sua última posição enquanto o GPS atualiza.');bootstrapGps(asOrigin);return null}showPermission(locationErrorMessage(e));return null}}
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
  if(!secondary){const street=[x.street,x.address_number].filter(Boolean).join(', ');secondary=[street,x.postcode].filter(Boolean).join(' · ')||'Brasil'}
  return{primary,secondary};
}
function searchResultMeta(x){const t={poi:x.category||'Lugar',address:'Endereço',street:'Rua',postcode:'CEP',neighborhood:'Bairro',locality:'Localidade',place:'Cidade',district:'Região'}[x.type]||x.category||'Local',bits=[t];if(x.precision_label&&x.precision_label!==t)bits.push(x.precision_label);if(Number.isFinite(+x.distance_m)&&+x.distance_m>0)bits.push(+x.distance_m<1000?`${Math.round(+x.distance_m)} m de você`:`${(+x.distance_m/1000).toFixed(+x.distance_m<10000?1:0)} km de você`);if(x.postcode&&!String(x.address||x.label||'').includes(x.postcode))bits.push(x.postcode);return bits.filter(Boolean).join(' · ')}
function searchResultBadge(x){if(x.type==='poi')return'LOCAL';if(x.address_number_match==='matched'&&x.postcode_match==='matched')return'EXATO';if(x.match_confidence==='exact')return'EXATO';if(x.accuracy==='rooftop')return'PRECISO';if(x.accuracy==='interpolated')return'APROX.';if(x.source==='cep-authoritative')return'CEP';if(x.source==='cep-fallback')return'APROX.';if(x.type==='address')return'ENDEREÇO';return''}
function searchResultIcon(x){if(x.type==='street')return'signpost';if(x.type==='postcode')return'mail';if(x.type==='address')return'map-pin-check';const k=x.category_key||'';return({school:'school',bank:'landmark',hospital:'hospital',pharmacy:'pill',fuel:'fuel',food:'utensils',shop:'shopping-basket',hotel:'hotel',park:'trees',public:'building-2',business:'building-2',building:'building'})[k]||'map-pin'}
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
function showSearchResultPopup(kind,x){if(!map||!x)return;hideResults();searchController?.abort();const input=kind==='origin'?originInput:destinationInput;input?.blur?.();if(kind==='destination')prefetchDestinationRoutes(x);const p=searchResultParts(x),thumb=placeThumbUrl(x),rating=placeStars(x),lon=+(x.display_lon??x.lon),lat=+(x.display_lat??x.lat);stablePlaceFrame(lon,lat);window.__searchPreviewPopup?.remove?.();const imageHtml=thumb?`<div class="place-popup-image" style="background-image:url('${esc(thumb)}')"></div>`:'';const ratingHtml=rating?`<div class="place-popup-rating">${rating}</div>`:'';const popup=new mapboxgl.Popup({offset:13,closeButton:true,maxWidth:'248px'}).setLngLat([lon,lat]).setHTML(`<div class="place-popup ${thumb?'has-image':'no-image'}">${imageHtml}<h4>${esc(p.primary)}</h4><p>${esc(p.secondary)}</p>${ratingHtml}<span class="place-popup-meta">${esc(searchResultMeta(x))}</span><button type="button" class="place-popup-use" id="usePreviewPlaceBtn">Usar destino</button></div>`).addTo(map);window.__searchPreviewPopup=popup;setTimeout(()=>{const btn=document.getElementById('usePreviewPlaceBtn');if(btn)btn.onclick=()=>{popup.remove();setPoint(kind,x,x.label);haptic(10)}} ,20)}
function invalidateSelectedPoint(kind,input){const point=kind==='origin'?origin:destination;if(!point)return;const current=String(input.value||'').trim(),saved=String(point.label||'').trim();if(saved&&current!==saved){if(kind==='origin'){abortRoutePrefetches();origin=null;originMarker?.remove();originMarker=null}else{abortRoutePrefetches();destination=null;destinationConfirmed=false;$('destinationConfirm')?.classList.remove('show');destinationMarker?.remove();destinationMarker=null}routes=[];selectedRoute=null}}
function searchBias(kind){const center=map?.getCenter?.();return userLocation||(kind==='destination'?origin:destination)||(center?{lat:center.lat,lon:center.lng}:null)}
function clientSearchKey(q,bias){const n=String(q||'').trim().toLocaleLowerCase();return `${n}|${bias?`${(+bias.lat).toFixed(2)},${(+bias.lon).toFixed(2)}`:'global'}`}
function getClientSearch(q,bias){const key=clientSearchKey(q,bias),row=searchClientCache.get(key);if(!row)return null;if(Date.now()-row.ts>SEARCH_CLIENT_TTL){searchClientCache.delete(key);return null}return row.list}
function setClientSearch(q,bias,list){if(searchClientCache.size>80){const oldest=[...searchClientCache.entries()].sort((a,b)=>a[1].ts-b[1].ts).slice(0,20);oldest.forEach(([key])=>searchClientCache.delete(key))}searchClientCache.set(clientSearchKey(q,bias),{ts:Date.now(),list:(list||[]).map(x=>({...x}))})}
function fastMapboxFeature(feature){
  const props=feature?.properties||{},coords=props.coordinates||{},geometry=feature?.geometry||{},pair=Array.isArray(geometry.coordinates)?geometry.coordinates:[];
  let lon=Number(coords.longitude??pair[0]),lat=Number(coords.latitude??pair[1]);if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
  const context=props.context||{},addressCtx=context.address||{},streetCtx=context.street||{},postcode=String(context.postcode?.name||'').trim();
  const addressNumber=String(addressCtx.address_number||'').trim(),street=String(addressCtx.street_name||streetCtx.name||'').trim(),type=String(props.feature_type||'place');
  const routable=Array.isArray(coords.routable_points)?coords.routable_points:[],def=routable.find(x=>String(x?.name||'').toLowerCase()==='default'),ent=routable.find(x=>String(x?.name||'').toLowerCase()==='entrance');
  const navLon=Number(def?.longitude??lon),navLat=Number(def?.latitude??lat),name=String(props.name_preferred||props.name||street||'Local').trim();
  let label=String(props.full_address||[name,props.place_formatted].filter(Boolean).join(', ')||name).trim();if(postcode&&!label.includes(postcode))label+=`${label?', ':''}${postcode}`;
  const accuracy=String(coords.accuracy||'point').toLowerCase(),match=props.match_code||{},category=type==='address'?'Endereço':type==='street'?'Rua':type==='postcode'?'CEP':'Local';
  return {label,name,address:String(props.full_address||props.place_formatted||label),category,category_key:type==='address'?'address':type==='street'?'street':'place',lat:navLat,lon:navLon,display_lat:lat,display_lon:lon,entrance_lat:Number.isFinite(Number(ent?.latitude))?Number(ent.latitude):null,entrance_lon:Number.isFinite(Number(ent?.longitude))?Number(ent.longitude):null,type,mapbox_id:props.mapbox_id||feature.id||'',postcode,address_number:addressNumber,street,accuracy,match_confidence:String(match.confidence||'').toLowerCase(),address_number_match:String(match.address_number||'').toLowerCase(),street_match:String(match.street||'').toLowerCase(),postcode_match:String(match.postcode||'').toLowerCase(),precision_label:accuracy==='rooftop'?'entrada/prédio':accuracy==='interpolated'?'número estimado':type==='postcode'?'CEP':type==='street'?'rua':'endereço',source:'mapbox-fast'};
}
function mergeSearchLists(primary=[],secondary=[]){
  const out=[],seen=new Set();for(const x of [...primary,...secondary]){if(!x||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon))continue;const key=x.mapbox_id||`${(+x.lat).toFixed(5)}:${(+x.lon).toFixed(5)}:${String(x.label||'').toLocaleLowerCase().slice(0,80)}`;if(seen.has(key))continue;seen.add(key);out.push(x)}return out.slice(0,8)
}
function paintSearchList(kind,list,title='Resultados'){
  if(!Array.isArray(list)||!list.length)return false;results.innerHTML=resultHtml(list,title);if(window.lucide)lucide.createIcons();results.querySelectorAll('.search-item').forEach(el=>el.onclick=()=>{const x=list[+el.dataset.i];showSearchResultPopup(kind,x);searchController?.abort();fastSearchController?.abort()});requestAnimationFrame(()=>syncSearchResultsPlacement(true));return true
}
async function fastGlobalAddressSearch(q,bias,signal){
  if(!TOKEN||q.length<SEARCH_FAST_MIN)return[];const params=new URLSearchParams({q,access_token:TOKEN,autocomplete:'true',limit:'8',language:String(BOOT.locale||'pt-BR').split('-',1)[0].toLowerCase(),types:'address,street,postcode,place,locality,neighborhood,district,region,country'});if(bias&&Number.isFinite(+bias.lon)&&Number.isFinite(+bias.lat))params.set('proximity',`${(+bias.lon).toFixed(6)},${(+bias.lat).toFixed(6)}`);
  const r=await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,{signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Mapbox ${r.status}`);const d=await r.json();return (d.features||[]).map(fastMapboxFeature).filter(Boolean).slice(0,8)
}
function queueSearch(input,kind){
  clearTimeout(searchTimer);clearTimeout(searchRefineTimer);activeSearchKind=kind;invalidateSelectedPoint(kind,input);const q=input.value.trim();if(q.length<SEARCH_FAST_MIN){searchController?.abort();fastSearchController?.abort();hideResults();return}const compact=q.replace(/\s+/g,'');const postal=/^[A-Za-z0-9 -]{3,10}$/.test(q)&&/\d/.test(q),delay=postal?45:(q.length>=4?SEARCH_FAST_DELAY:110);searchTimer=setTimeout(()=>searchPlaces(q,kind),delay)
}
async function searchPlaces(q,kind){
  q=String(q||'').trim();if(q.length<SEARCH_FAST_MIN){hideResults();return}
  const requestId=++searchRequestId,bias=searchBias(kind),cached=getClientSearch(q,bias);searchController?.abort();fastSearchController?.abort();clearTimeout(searchRefineTimer);activeSearchKind=kind;setSearchOpen(true);results.classList.add('show');requestAnimationFrame(()=>syncSearchResultsPlacement(true));
  if(cached){paintSearchList(kind,cached,'Resultados');return}
  results.innerHTML='<div class="search-loading"><span class="search-loading-pin"></span><span><b>Buscando endereço…</b><small>Resultados globais enquanto você digita</small></span></div>';
  fastSearchController=new AbortController();let fastList=[],fastError=null;
  const fastTask=fastGlobalAddressSearch(q,bias,fastSearchController.signal).then(list=>{if(requestId!==searchRequestId)return[];fastList=list;if(list.length)paintSearchList(kind,list,'Resultados rápidos');return list}).catch(e=>{if(e?.name!=='AbortError')fastError=e;return[]});
  if(q.length<3){await fastTask;if(requestId===searchRequestId&&!fastList.length&&fastError)results.innerHTML='<div class="search-message"><b>Continue digitando</b><span>Digite mais um caractere para refinar a busca.</span></div>';return}
  await new Promise(resolve=>{searchRefineTimer=setTimeout(resolve,SEARCH_REFINE_DELAY)});if(requestId!==searchRequestId)return;
  searchController=new AbortController();const p=new URLSearchParams({q});if(bias){p.set('proximity_lat',bias.lat);p.set('proximity_lon',bias.lon)}
  try{const r=await fetch('/api/geocode?'+p,{signal:searchController.signal,headers:{Accept:'application/json'}}),d=await r.json();if(requestId!==searchRequestId)return;if(!r.ok)throw new Error(d.detail||d.error||'Falha na busca');await fastTask;const backend=(d.results||[]).slice(0,8),list=mergeSearchLists(backend,fastList);if(!list.length){results.innerHTML='<div class="search-message"><b>Nenhum endereço encontrado</b><span>Tente rua + número, nome do lugar, cidade ou código postal.</span></div>';return}setClientSearch(q,bias,list);paintSearchList(kind,list,'Melhores resultados')}catch(e){if(e?.name==='AbortError')return;if(requestId!==searchRequestId)return;await fastTask;if(fastList.length){setClientSearch(q,bias,fastList);paintSearchList(kind,fastList,'Resultados rápidos');return}results.innerHTML=`<div class="search-message"><b>Busca indisponível agora</b><span>${esc(e.message)}</span></div>`}
}

const VANO_MAP_ICONS={destination:'destination.svg',traffic:'traffic.svg',signal:'traffic-signal.svg',stop:'stop-sign.svg',yield:'yield-sign.svg',roadsign:'road-sign.svg',user:'user-puck.svg'};
function loadSparkSvg(name,file){return new Promise(resolve=>{if(map.hasImage(name)){resolve();return}const img=new Image();img.onload=()=>{try{if(!map.hasImage(name))map.addImage(name,img,{pixelRatio:name==='vano-signal'?1.55:2})}catch{}resolve()};img.onerror=()=>resolve();img.src='/static/icons/vano/'+file})}
async function registerSparkMapIcons(){await Promise.all(Object.entries(VANO_MAP_ICONS).map(([name,file])=>loadSparkSvg('vano-'+name,file)))}
function roadControlIconExpr(){return ['match',['get','type'],'traffic_signal','vano-signal','stop_sign','vano-stop','yield_sign','vano-yield','traffic_sign','vano-roadsign','vano-signal']}

let lastPresenceSyncAt=0,lastNearbyFetchAt=0,nearbyController=null,lastNearbyDriversCount=0;
function nearbyDriverFC(items){return{type:'FeatureCollection',features:(items||[]).map(x=>({type:'Feature',properties:{id:x.id,label:x.label||'Motorista próximo'},geometry:{type:'Point',coordinates:[+x.lon,+x.lat]}}))}}
async function refreshNearbyDrivers(force=false){if(!LOGGED_IN||!userLocation||!map?.getSource('nearby-drivers'))return;const now=Date.now();if(!force&&now-lastNearbyFetchAt<30000)return;lastNearbyFetchAt=now;nearbyController?.abort();nearbyController=new AbortController();try{const q=new URLSearchParams({lat:userLocation.lat,lon:userLocation.lon}),r=await fetch('/api/nearby-drivers?'+q,{signal:nearbyController.signal}),d=await r.json();if(r.ok){const realDrivers=d.drivers||[];lastNearbyDriversCount=realDrivers.length;map.getSource('nearby-drivers').setData(nearbyDriverFC(realDrivers))}}catch(e){if(e?.name!=='AbortError')console.debug('[VANO:presence]',e)}}

async function maybeSyncPresence(p){if(!LOGGED_IN||!p)return;const now=Date.now();if(PRESENCE_ACTIVE&&now-lastPresenceSyncAt>40000){lastPresenceSyncAt=now;fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({lat:p.lat,lon:p.lon})}).catch(()=>{})}refreshNearbyDrivers(false)}
const BOOT_GPS=readLastGps();
function ensureGeoSource(id){if(!map.getSource(id))map.addSource(id,{type:'geojson',data:emptyFC()})}
function ensureLayer(layer,before){if(map.getLayer(layer.id))return;try{map.addLayer(layer,before&&map.getLayer(before)?before:undefined)}catch(e){console.debug('[VANO:layer]',layer.id,e)}}
const TRAFFIC_RADIUS_M=3000;
let trafficSnapshotTimer=null,trafficPulseTimer=null,trafficPulseState=false;
function trafficAnchor(){const p=userLocation||BOOT_GPS;return p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)?{lat:+p.lat,lon:+p.lon}:null}
function trafficBucketOf(props={}){if(String(props.closed||'').toLowerCase()==='yes')return'severe';const c=String(props.congestion||'').toLowerCase();return['moderate','heavy','severe'].includes(c)?c:null}
function trafficLineParts(geometry){if(!geometry)return[];if(geometry.type==='LineString')return[geometry.coordinates||[]];if(geometry.type==='MultiLineString')return geometry.coordinates||[];return[]}
function trafficPointVisible(c,anchor,b){if(!Array.isArray(c)||c.length<2)return false;const x=+c[0],y=+c[1];if(!Number.isFinite(x)||!Number.isFinite(y)||hav([anchor.lon,anchor.lat],[x,y])>TRAFFIC_RADIUS_M)return false;return x>=b.getWest()&&x<=b.getEast()&&y>=b.getSouth()&&y<=b.getNorth()}
function clipTrafficCoords(coords,anchor,b){const out=[];let cur=[];for(const c of coords||[]){if(trafficPointVisible(c,anchor,b)){cur.push([+c[0],+c[1]])}else{if(cur.length>1)out.push(cur);cur=[]}}if(cur.length>1)out.push(cur);return out}
function refreshVisibleTraffic(){if(!map?.getSource('vano-traffic-visible'))return;if(activeNav?.classList.contains('show')){window.__sparkVisibleTraffic=[];map.getSource('vano-traffic-visible').setData(emptyFC());map.getSource('vano-traffic-hotspots')?.setData(emptyFC());return}const anchor=trafficAnchor();if(!anchor||!mapPrefs.liveSignals){window.__sparkVisibleTraffic=[];map.getSource('vano-traffic-visible').setData(emptyFC());map.getSource('vano-traffic-hotspots')?.setData(emptyFC());return}let raw=[];try{raw=map.querySourceFeatures('vano-mapbox-traffic',{sourceLayer:'traffic'})||[]}catch(e){console.debug('[VANO:traffic-query]',e);return}const b=map.getBounds(),features=[],seen=new Set();for(const f of raw){const bucket=trafficBucketOf(f.properties||{});if(!bucket)continue;for(const line of trafficLineParts(f.geometry)){for(const part of clipTrafficCoords(line,anchor,b)){const a=part[0],z=part[part.length-1],key=`${bucket}:${a[0].toFixed(5)}:${a[1].toFixed(5)}:${z[0].toFixed(5)}:${z[1].toFixed(5)}:${part.length}`;if(seen.has(key))continue;seen.add(key);features.push({type:'Feature',properties:{bucket,congestion:String(f.properties?.congestion||bucket),closed:String(f.properties?.closed||'')},geometry:{type:'LineString',coordinates:part}})}}}const visible=features.slice(0,520);window.__sparkVisibleTraffic=visible;map.getSource('vano-traffic-visible').setData({type:'FeatureCollection',features:visible});if(map.getSource('vano-traffic-hotspots'))map.getSource('vano-traffic-hotspots').setData(trafficHotspotFC(visible))}
function scheduleTrafficSnapshot(force=false){if(trafficSnapshotTimer&&!force)return;if(force&&trafficSnapshotTimer){clearTimeout(trafficSnapshotTimer);trafficSnapshotTimer=null}trafficSnapshotTimer=setTimeout(()=>{trafficSnapshotTimer=null;refreshVisibleTraffic()},force?45:240)}
function startTrafficPulse(){clearInterval(trafficPulseTimer);trafficPulseTimer=null;try{if(map?.getLayer('vano-traffic-core'))map.setPaintProperty('vano-traffic-core','line-opacity',.08);if(map?.getLayer('vano-traffic-glow'))map.setPaintProperty('vano-traffic-glow','line-opacity',.08);if(map?.getLayer('traffic-route-core'))map.setPaintProperty('traffic-route-core','line-opacity',.06)}catch{}}

function trafficFeatureLength(f){const c=f?.geometry?.coordinates||[];let m=0;for(let i=1;i<c.length;i++)m+=hav(c[i-1],c[i]);return m}
function trafficHotspotFC(features=[]){const ranked=features.filter(f=>['heavy','severe'].includes(f.properties?.bucket)).map(f=>({f,len:trafficFeatureLength(f)})).sort((a,b)=>((b.f.properties?.bucket==='severe'?2:1)*b.len)-((a.f.properties?.bucket==='severe'?2:1)*a.len)).slice(0,14);return{type:'FeatureCollection',features:ranked.map(({f,len},i)=>{const c=f.geometry.coordinates||[],mid=c[Math.floor(c.length/2)]||c[0];return{type:'Feature',properties:{bucket:f.properties.bucket,label:f.properties.bucket==='severe'?'Trânsito muito intenso':'Trânsito intenso',length_m:Math.round(len),i},geometry:{type:'Point',coordinates:mid}}})}}
async function installRuntimeLayers(){
  await registerSparkMapIcons();
  const routeBefore=(map.getStyle()?.layers||[]).find(l=>l.type==='symbol'&&l.layout?.['text-field'])?.id;
  ensureGeoSource('route-alternatives');
  ensureLayer({id:'route-alternatives',type:'line',source:'route-alternatives',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#8a919a','line-width':['interpolate',['linear'],['zoom'],10,2.4,16,3.8,19,4.5],'line-opacity':.36}},routeBefore);
  ensureGeoSource('routes');
  ensureLayer({id:'route-shadow',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,.96)','line-width':['interpolate',['linear'],['zoom'],10,7.5,12,9.5,14,12.0,16,15.0,18,18.5,20,22.0],'line-opacity':.48}},routeBefore);
  ensureLayer({id:'route-selected',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':MAP_ACCENT.primary||'#F59A62','line-width':['interpolate',['linear'],['zoom'],10,5.0,12,6.3,14,8.1,16,10.5,18,13.5,20,16.5],'line-opacity':1}},routeBefore);
  if(!map.getSource('nav-route'))map.addSource('nav-route',{type:'geojson',lineMetrics:true,data:emptyFC()});
  ensureLayer({id:'nav-route-glow',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':MAP_ACCENT.primary||'#F59A62','line-width':['interpolate',['linear'],['zoom'],10,10.0,12,13.0,14,16.0,16,20.0,18,24.0,20,29.0],'line-opacity':.075,'line-blur':.8}},routeBefore);
  ensureLayer({id:'nav-route-casing',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,.98)','line-width':['interpolate',['linear'],['zoom'],10,8.0,12,10.0,14,12.5,16,15.5,18,18.5,20,22.5],'line-opacity':.80}},routeBefore);
  ensureLayer({id:'nav-route-core',type:'line',source:'nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-gradient':['interpolate',['linear'],['line-progress'],0,MAP_ACCENT.light||'#FFC39B',1,MAP_ACCENT.primary||'#F59A62'],'line-width':['interpolate',['linear'],['zoom'],10,5.6,12,7.2,14,9.0,16,11.6,18,14.6,20,18.0],'line-opacity':1}},routeBefore);
  ensureGeoSource('route-progress');
  ensureLayer({id:'route-progress',type:'line',source:'route-progress',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f6f7f9','line-width':['interpolate',['linear'],['zoom'],10,5.6,12,7.2,14,9.0,16,11.6,18,14.6,20,18.0],'line-opacity':.72}},routeBefore);
  ensureGeoSource('alerts');
  ensureLayer({id:'alerts-heat',type:'heatmap',source:'alerts',maxzoom:16,layout:{visibility:safetyPulse?'visible':'none'},paint:{'heatmap-weight':['interpolate',['linear'],['get','severity'],1,.18,5,1],'heatmap-intensity':['interpolate',['linear'],['zoom'],9,.55,15,1.45],'heatmap-radius':['interpolate',['linear'],['zoom'],9,15,15,46],'heatmap-opacity':['interpolate',['linear'],['zoom'],9,.48,16,.16]}});
  ensureLayer({id:'alerts-marker-halo',type:'circle',source:'alerts',minzoom:10.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],10.5,7,16,12],'circle-color':['match',['get','category'],'accident','#e95b55','traffic','#ee8a35','road_block','#d94d5e','blitz','#D9703F','road_hazard','#d47732','flood','#4587d9','#7d8290'],'circle-opacity':.14,'circle-blur':.25}},routeBefore);
  ensureLayer({id:'alerts-marker',type:'circle',source:'alerts',minzoom:10.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],10.5,5.4,16,7.4],'circle-color':['match',['get','category'],'accident','#e95b55','traffic','#ee8a35','road_block','#d94d5e','blitz','#D9703F','road_hazard','#d47732','flood','#4587d9','#7d8290'],'circle-stroke-color':'#ffffff','circle-stroke-width':2,'circle-opacity':.98}},routeBefore);
  ensureLayer({id:'alerts-marker-symbol',type:'symbol',source:'alerts',minzoom:12,layout:{'text-field':['match',['get','category'],'accident','!','traffic','≡','road_block','×','blitz','◎','road_hazard','!','flood','≈','•'],'text-size':['interpolate',['linear'],['zoom'],12,8,16,10],'text-font':['Open Sans Bold','Arial Unicode MS Bold'],'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#ffffff'}},routeBefore);
  ensureGeoSource('support-points');
  ensureGeoSource('road-controls');
  ensureLayer({id:'road-controls-pulse',type:'circle',source:'road-controls',minzoom:13.8,layout:{'circle-pitch-alignment':'viewport'},paint:{'circle-radius':8,'circle-color':['match',['get','type'],'traffic_signal','#ffb13b','stop_sign','#ff6166','yield_sign','#ff8b43','traffic_sign','#6db9ff','#ff9a45'],'circle-opacity':.13,'circle-blur':.58}});
  ensureLayer({id:'road-controls-dot',type:'symbol',source:'road-controls',minzoom:13.8,layout:{'icon-image':roadControlIconExpr(),'icon-size':['interpolate',['linear'],['zoom'],13.4,.48,15.5,.58,18,.70],'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['match',['get','type'],'traffic_signal',10,5],'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport'}});
  ensureGeoSource('nearby-drivers');
  ensureLayer({id:'nearby-drivers',type:'circle',source:'nearby-drivers',minzoom:13,paint:{'circle-radius':['interpolate',['linear'],['zoom'],13,4.5,17,6.5],'circle-color':'#ff7a2d','circle-stroke-color':'#ffffff','circle-stroke-width':2,'circle-opacity':.88}});
  // V25 — viewport traffic ribbon. The provider vector tiles still do the
  // heavy lifting, but only currently loaded streets inside 3 km of the user's
  // position are copied into a GeoJSON ribbon. This prevents painting an entire
  // city and lets us use rounded full-road widths + glow without extra REST calls.
  if(!map.getSource('vano-mapbox-traffic')){try{map.addSource('vano-mapbox-traffic',{type:'vector',url:'mapbox://mapbox.mapbox-traffic-v1'})}catch(e){console.debug('[VANO:traffic-source]',e)}}
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
  if(!map?.getSource('nav-route'))return;if(!selectedRoute?.geometry){map.getSource('nav-route').setData(emptyFC());return}if(!routeCumulative.length)buildMetrics();
  const start=Number.isFinite(+startAlong)?Math.max(0,+startAlong):(lastNavPosition?Math.max(0,nearestProgress(lastNavPosition).distanceAlong):0),geometry=remainingNavGeometry(start)||selectedRoute.geometry;
  map.getSource('nav-route').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{active:true,start_m:start},geometry}]});
  try{if(map.getLayer('nav-route-core'))map.setPaintProperty('nav-route-core','line-gradient',navRouteGradient(start))}catch(e){console.debug('[VANO:nav-gradient]',e)}
}
function navigationLayerIds(){return ['vano-traffic-probe','vano-traffic-glow','vano-traffic-flow','vano-traffic-core','vano-traffic-hotspot-glow','vano-traffic-hotspot-dot','traffic-route-glow','traffic-live-segments','traffic-route-core','route-alternatives','route-shadow','route-selected','route-progress']}
function setNavigationRouteFocus(active){
  const routePlan=['route-shadow','route-selected','route-progress'],routeTraffic=['traffic-route-glow','traffic-live-segments','traffic-route-core'],mapTraffic=['vano-traffic-probe','vano-traffic-glow','vano-traffic-flow','vano-traffic-core','vano-traffic-hotspot-glow','vano-traffic-hotspot-dot'];
  routePlan.forEach(id=>setLayerVisibility(id,!active));setLayerVisibility('route-alternatives',true);routeTraffic.forEach(id=>setLayerVisibility(id,!active));mapTraffic.forEach(id=>setLayerVisibility(id,!active&&!!mapPrefs.liveSignals));['nav-route-glow','nav-route-casing','nav-route-core'].forEach(id=>setLayerVisibility(id,active));
  if(active){map.getSource('route-alternatives')?.setData(navAlternativeFC());map.getSource('route-progress')?.setData(emptyFC());map.getSource('traffic-live-segments')?.setData(emptyFC());map.getSource('vano-traffic-visible')?.setData(emptyFC());map.getSource('vano-traffic-hotspots')?.setData(emptyFC());setNavRouteData();refreshNavigationAlternatives(true)}else{map.getSource('nav-route')?.setData(emptyFC());document.body.classList.remove('nav-alt-visible');$('navAltHint')?.classList.remove('show')}
}
function syncImmersiveButton(){
  const b=$('navImmersiveToggle'),active=navExperienceMode==='immersive';if(!b)return;
  b.classList.toggle('immersive-active',active);b.title=active?'Voltar para câmera normal':'Ativar modo imersivo';b.setAttribute('aria-label',b.title);b.innerHTML=active?'<i data-lucide="panel-top-open" width="18"></i>':'<i data-lucide="scan" width="18"></i>';document.body.classList.toggle('nav-immersive',active&&!!activeNav?.classList.contains('show'));if(window.lucide)lucide.createIcons();
}
function setNavigationExperience(mode,{recenter=true,announce=true}={}){
  navExperienceMode=mode==='immersive'?'immersive':'normal';
  if(navExperienceMode==='immersive'){navCameraMode='perspective';followMode=true;lastCameraBearing=null;}
  else{navCameraMode='top';lastCameraBearing=null;}
  syncNavCameraButton();syncFollowButton();syncImmersiveButton();
  if(recenter&&lastNavPosition)scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition));
  if(announce)showToast(navExperienceMode==='immersive'?'Modo imersivo ativado.':'Câmera normal ativada.');
}
function toggleImmersiveCamera(){setNavigationExperience(navExperienceMode==='immersive'?'normal':'immersive',{recenter:true,announce:true})}
function setNavControlDrawer(open){
  const stack=$('navControlStack'),drawer=$('navControlDrawer'),toggle=$('navDrawerToggle');if(!stack||!drawer||!toggle)return;
  const show=!!open&&!!activeNav?.classList.contains('show');stack.classList.toggle('drawer-open',show);drawer.setAttribute('aria-hidden',String(!show));toggle.setAttribute('aria-expanded',String(show));toggle.setAttribute('aria-label',show?'Fechar controles':'Mostrar mais controles');toggle.title=show?'Fechar controles':'Mais controles';toggle.innerHTML=show?'<i data-lucide="chevron-down" width="18"></i>':'<i data-lucide="chevron-up" width="18"></i>';if(window.lucide)lucide.createIcons();
}
function toggleNavControlDrawer(){setNavControlDrawer(!$('navControlStack')?.classList.contains('drawer-open'));haptic(5)}
function navDrawerAction(fn){return()=>{setNavControlDrawer(false);return fn?.()}}
function chooseNavigationCamera(){
  const box=$('immersiveChoice');if(!box)return Promise.resolve('normal');
  box.classList.add('show');box.setAttribute('aria-hidden','false');if(window.lucide)lucide.createIcons();
  return new Promise(resolve=>{pendingCameraChoiceResolve=resolve;});
}
function resolveNavigationCameraChoice(mode){
  const box=$('immersiveChoice');box?.classList.remove('show');box?.setAttribute('aria-hidden','true');
  const resolve=pendingCameraChoiceResolve;pendingCameraChoiceResolve=null;if(resolve)resolve(mode==='immersive'?'immersive':'normal');
}
function syncNavCameraButton(){const top=navCameraMode==='top',title=top?'Ativar visualização 3D':'Voltar para visualização 2D',icon=top?'<i data-lucide="box" width="18"></i>':'<i data-lucide="map" width="18"></i>';['navCameraToggle','focusModeBtn'].forEach(id=>{const b=$(id);if(!b)return;b.classList.toggle('active',!top);b.title=title;b.setAttribute('aria-label',title);b.innerHTML=icon});if(window.lucide)lucide.createIcons()}
function syncFollowButton(){const b=$('navFollowToggle');if(!b)return;b.classList.toggle('active',followMode);b.title=followMode?'Seguindo usuário · tocar para câmera livre':'Câmera livre · tocar para seguir';b.setAttribute('aria-label',b.title);b.innerHTML=followMode?'<i data-lucide="navigation" width="18"></i>':'<i data-lucide="move" width="18"></i>';if(window.lucide)lucide.createIcons()}
function setNavigationFollow(enabled,recenter=true){followMode=!!enabled;syncFollowButton();document.body.classList.toggle('nav-map-free',!followMode&&!!activeNav?.classList.contains('show'));if(followMode&&recenter&&lastNavPosition)scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition))}
function toggleNavigationFollow(){setNavigationFollow(!followMode,true);showToast(followMode?'Câmera seguindo o trajeto.':'Câmera livre. Toque no ícone de navegação para seguir novamente.')}
function calibrateNavigation(){if(!lastNavPosition||!selectedRoute){locateUser(true);return}followMode=true;lastCameraBearing=null;lastRoutePuckBearing=routeAlignedPuckBearing(lastNavPosition);syncFollowButton();scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition));haptic(10);showToast('Câmera recalibrada na direção da rota.')}
function syncSoundButton(){const b=$('soundBtn');if(!b)return;b.classList.toggle('active',!!soundEnabled);b.setAttribute('aria-label',soundEnabled?'Desativar orientações por voz':'Ativar orientações por voz');b.title=soundEnabled?'Áudio ligado · segure para trocar a voz':'Áudio desligado · segure para trocar a voz';b.innerHTML=soundEnabled?'<i data-lucide="volume-2" width="19"></i>':'<i data-lucide="volume-x" width="19"></i>';if(window.lucide)lucide.createIcons()}
function availableInstructionVoices(){if(!('speechSynthesis'in window))return[];const voices=window.speechSynthesis.getVoices?.()||[],base=String(BOOT.locale||window.VANO_ACTIVE_LOCALE||'pt-BR').split('-')[0],local=voices.filter(v=>String(v.lang||'').toLowerCase().startsWith(base.toLowerCase()));return (local.length?local:voices).slice().sort((a,b)=>String(a.lang).localeCompare(String(b.lang))||String(a.name).localeCompare(String(b.name)))}
function populateVoiceSelectors(){const voices=availableInstructionVoices();for(const id of ['voiceSelect','navVoiceSelect']){const s=$(id);if(!s)continue;const current=selectedVoiceName;s.innerHTML='<option value="">Automática</option>'+voices.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} · ${esc(v.lang||'')}</option>`).join('');s.value=voices.some(v=>v.name===current)?current:''} }
function saveInstructionVoice(name){selectedVoiceName=String(name||'');try{localStorage.setItem(VOICE_PREF_KEY,selectedVoiceName)}catch{};for(const id of ['voiceSelect','navVoiceSelect']){const s=$(id);if(s&&s.value!==selectedVoiceName)s.value=selectedVoiceName}showToast(selectedVoiceName?`Voz: ${selectedVoiceName}`:'Voz automática ativada.')}
function toggleVoicePopover(force=null){const box=$('navVoicePopover');if(!box)return;const show=force===null?!box.classList.contains('show'):!!force;box.classList.toggle('show',show);if(show){populateVoiceSelectors();setTimeout(()=>$('navVoiceSelect')?.focus({preventScroll:true}),20)}}
function navMinutesLabel(seconds){const s=Math.max(0,+seconds||0);if(s<60)return'<1 min';return`${Math.max(1,Math.ceil(s/60))} min`}
function navKmLabel(meters){const km=Math.max(0,+meters||0)/1000;if(km<.1)return'<0,1 km';const value=km<10?km.toFixed(1):Math.round(km).toString();return`${String(value).replace('.',',')} km`}
function updateNavSummary(etaSeconds,remainingMeters,step){const mins=$('remainingMinutes'),km=$('remainingKm'),next=$('nextDistance');if(mins)mins.textContent=navMinutesLabel(etaSeconds);if(km)km.textContent=navKmLabel(remainingMeters);if(next){const d=Math.max(0,+step?.remainingInStep||0);next.textContent=d<18?'agora':fmtDistance(d)}}
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
  }catch(e){console.debug('[VANO:restore-style]',e)}
}
function moodFromConditions(weather){
  if(MAP_STYLE_MODE!=='auto')return ['day','afternoon','night','rain'].includes(MAP_STYLE_MODE)?MAP_STYLE_MODE:'day';
  const h=new Date().getHours();
  const manualMode=(window.VANOTheme?.getMode?.()||document.documentElement.dataset.vanoThemeMode||'light');
  const manualBlack=manualMode==='black';
  const reactiveNight=REACTIVE_BLACK_ALLOWED && (h>=19||h<7);
  if(manualBlack || reactiveNight || document.documentElement.dataset.vanoTheme==='black' && manualMode!=='light')return 'night';
  if(weather?.rainy)return 'rain';
  if(weather?.is_day===0||h>=18||h<6)return 'night';
  if(h>=12&&h<18)return 'afternoon';
  return 'day';
}
function moodLabel(mood){return mood==='rain'?'CHUVA':mood==='night'?'NOITE':mood==='afternoon'?'TARDE':'DIA'}
function updateWeatherPill(weather){const v=$('weatherPillValue'),pill=$('weatherPill');if(!v||!pill)return;const temp=weather&&Number.isFinite(+weather.temperature_c)?Math.round(+weather.temperature_c):null;v.textContent=temp!=null?`${temp}°`:'--°';pill.title=temp!=null?`${temp}°C agora`:'Clima indisponível'}
function updateFloatingSpeedometer(kmh){const box=$('floatingSpeedo'),value=$('floatingSpeedValue');if(!box||!value)return;const n=Number.isFinite(+kmh)&&+kmh>0?Math.max(0,Math.round(+kmh)):0,capped=Math.min(n,140),progress=capped/140,arc=Math.max(0,Math.min(300,(capped/140)*300));value.textContent=String(n);box.style.setProperty('--speed-angle',`${arc.toFixed(1)}deg`);box.style.setProperty('--speed-progress',progress.toFixed(3));box.classList.toggle('active',n>0);box.classList.toggle('moving',n>=3)}
function applyMoodStyle(weather,announce=false){
  const mood=moodFromConditions(weather),uri=(STYLE_SET&&STYLE_SET[mood])||STYLE_SET?.day||STYLE;
  currentMapMood=mood;document.body.dataset.mood=mood==='night'?'night':'day';updateWeatherPill(weather||window.__sparkWeatherState||null);
  if(!uri||uri===currentStyleUri||!map)return;
  styleSwitching=true;currentStyleUri=uri;
  const fade=$('mapMoodFade'),hint=$('roadMoodHint');fade?.classList.add('active');
  if(announce&&hint){hint.textContent=`MAPA ${moodLabel(mood)}`;hint.classList.add('show');clearTimeout(hint._t);hint._t=setTimeout(()=>hint.classList.remove('show'),1900)}
  setTimeout(()=>{try{map.setStyle(uri,{diff:true})}catch(e){styleSwitching=false;fade?.classList.remove('active');console.warn('[VANO:style]',e)}},80);
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
  try{localStorage.setItem(ACTIVE_TRIP_KEY,JSON.stringify(payload))}catch(e){console.warn('[VANO:trip-persist]',e)}
}
function readSavedActiveTrip(){let d=null;try{d=JSON.parse(localStorage.getItem(ACTIVE_TRIP_KEY)||'null')}catch{}if(!d?.active||!d.destination||!d.route?.geometry?.coordinates?.length)return null;if(Date.now()-(+d.savedAt||0)>ACTIVE_TRIP_MAX_AGE||(+d.remainingMeters||0)<20||(+d.progress||0)>.995){clearSavedActiveTrip();return null}return d}
function resumeModeLabel(mode){return mode==='fastest'?'Rápida':'Segura'}
function resumeProfileLabel(p){return p==='driving'?'carro':p==='motorcycle'?'moto':p==='cycling'?'bike':'a pé'}
function resumeAgeLabel(ts){const min=Math.max(0,Math.round((Date.now()-(+ts||Date.now()))/60000));if(min<2)return'agora';if(min<60)return`há ${min} min`;const h=Math.round(min/60);return`há ${h}h`}
function resumeMiniPath(route){const c=route?.geometry?.coordinates||[];if(c.length<2)return'';const sample=c.filter((_,i)=>i===0||i===c.length-1||i%Math.max(1,Math.floor(c.length/34))===0);const xs=sample.map(x=>+x[0]),ys=sample.map(x=>+x[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=Math.max(1e-8,maxX-minX),dy=Math.max(1e-8,maxY-minY),scale=Math.min(76/dx,52/dy);const pts=sample.map(x=>[50+(x[0]-(minX+maxX)/2)*scale,36-(x[1]-(minY+maxY)/2)*scale]);return pts.map((q,i)=>`${i?'L':'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')}
function showSavedTripResume(){if(SHARED_TOKEN||activeNav?.classList.contains('show'))return;const d=readSavedActiveTrip();if(!d)return;pendingResumeTrip=d;const card=$('resumeTripCard');if(!card)return;$('resumeTripDestination').textContent=d.destination?.label||'Destino salvo';$('resumeTripEta').textContent=fmtDuration((+d.remainingSeconds||0)/60);$('resumeTripDistance').textContent=fmtDistance(+d.remainingMeters||0);$('resumeTripMode').textContent=resumeModeLabel(d.routeMode);$('resumeTripAge').textContent=resumeAgeLabel(d.savedAt);$('resumeTripSummary').textContent=`${resumeProfileLabel(d.profile)} · ${Math.round((+d.progress||0)*100)}% concluído`;const path=resumeMiniPath(d.route);if(path){$('resumeTripPath')?.setAttribute('d',path);$('resumeTripPathShadow')?.setAttribute('d',path)}card.classList.add('show');card.setAttribute('aria-hidden','false')}
async function continueSavedTrip(){const d=pendingResumeTrip||readSavedActiveTrip();if(!d)return;const btn=$('continueResumeTrip');if(btn){btn.disabled=true;btn.textContent='Retomando…'}try{
  profile=['walking','driving','motorcycle','cycling'].includes(d.profile)?d.profile:'driving';routeMode=d.routeMode==='fastest'?'fastest':'safest';origin=d.origin||origin;destination=d.destination;selectedRoute=d.route;routes=[selectedRoute];destinationConfirmed=true;manualRouteSelection=false;
  destinationInput.value=destination?.label||'Destino';if(destinationMarker)destinationMarker.remove();destinationMarker=new mapboxgl.Marker({element:markerEl('destination'),anchor:'bottom',offset:[0,0]}).setLngLat([destination.display_lon??destination.lon,destination.display_lat??destination.lat]).addTo(map);
  document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===profile));document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.toggle('active',x.dataset.routeMode===routeMode));
  cardHideResume();welcomeState.style.display='none';routeState.style.display='block';renderRoute();await startTrip();
}catch(e){console.error('[VANO:resume-trip]',e);showToast(e?.message||'Não foi possível retomar o trajeto.');setTimeout(showSavedTripResume,120)}finally{if(btn){btn.disabled=false;btn.textContent='Continuar trajeto'}}}
function cardHideResume(){const card=$('resumeTripCard');card?.classList.remove('show');card?.setAttribute('aria-hidden','true')}
function discardSavedTrip(){clearSavedActiveTrip();showToast('Trajeto anterior encerrado.')}

map=new mapboxgl.Map({container:'map',style:STYLE,center:BOOT_GPS?[BOOT_GPS.lon,BOOT_GPS.lat]:[-46.6333,-23.5505],zoom:BOOT_GPS?15.6:11,attributionControl:false,cooperativeGestures:false,pitchWithRotate:true,bearingSnap:7});window.__VANO_MAP_BOOT_STAGE='map-created-fallback';window.__VANO_MAP_INSTANCE_READY=true;window.__VANO_MAP_BRIDGE={version:132,getMap:()=>map,getUserLocation:()=>{const p=userLocation;return p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)?{lat:+p.lat,lon:+p.lon}:null},isPlanning:()=>!!destination||!!destinationConfirmed||!!selectedRoute||!!activeNav?.classList?.contains('show')};window.dispatchEvent(new CustomEvent('vano:map-ready'));
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
map.on('style.load',async()=>{await installRuntimeLayers();restoreRuntimeMapState();styleSwitching=false;$('mapMoodFade')?.classList.remove('active')});
map.on('load',async()=>{
  restoreMapGestureHealth();hardRefreshMapViewport();
  await installRuntimeLayers();
  applyMapPrefs();bootstrapGps(!SHARED_TOKEN);updatePlannerOriginStatus();scheduleEnvironmentalRefresh(BOOT_GPS||null,true);
  setTimeout(()=>scheduleSignalRefresh(true),1200);setTimeout(()=>refreshNearbyDrivers(true),3500);
  if(SHARED_TOKEN)setTimeout(loadSharedRoute,350);else setTimeout(showSavedTripResume,520);
  setInterval(()=>{if(document.visibilityState==='visible')refreshEnvironmentalStyle(false)},300000);
});
window.addEventListener('vano:themechange',e=>{
  const black=e?.detail?.theme==='black';
  currentMapMood=black?'night':'day';
  applyMoodStyle(window.__sparkWeatherState||null,false);
  setTimeout(()=>{try{map?.resize()}catch{}},80);
});
map.on('move',()=>scheduleTrafficSnapshot(false));map.on('moveend',()=>{refreshAlerts();scheduleSignalRefresh(false);refreshNearbyDrivers(false);scheduleTrafficSnapshot(false)});map.on('sourcedata',e=>{if(e.sourceId==='vano-mapbox-traffic'&&e.isSourceLoaded)scheduleTrafficSnapshot(false)});map.on('rotate',()=>{if(Number.isFinite(lastMarkerHeading))updateMarkerHeading(lastMarkerHeading)});map.on('click','road-controls-dot',e=>{const f=e.features?.[0];if(!f)return;new mapboxgl.Popup({closeButton:false,offset:12}).setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(f.properties.label||'Sinalização viária')}</b><div style="color:#9299a5;font-size:9px;margin-top:4px">Dado mapeado · confirme a sinalização real da via</div>`).addTo(map)});map.on('click','vano-traffic-hotspot-dot',e=>{const f=e.features?.[0];if(!f)return;const severe=f.properties?.bucket==='severe';new mapboxgl.Popup({closeButton:false,offset:12}).setLngLat(f.geometry.coordinates).setHTML(`<b style="color:${severe?'#ff6254':'#ff9b43'}">${esc(f.properties?.label||'Trânsito intenso')}</b><div style="color:#9299a5;font-size:9px;margin-top:4px">Fluxo viário detectado nesta área · raio do mapa: 3 km</div>`).addTo(map)});
map.on('click','alerts-marker',showMapAlertPopup);map.on('mouseenter','alerts-marker',()=>{map.getCanvas().style.cursor='pointer'});map.on('mouseleave','alerts-marker',()=>{map.getCanvas().style.cursor=''});
function releaseNavigationCameraFromGesture(e){
  const userGesture=!!e?.originalEvent||(Date.now()-lastMapPointerAt<1400);
  if(!userGesture)return;
  if(activeNav?.classList.contains('show')){if(!followMode)return;setNavigationFollow(false,false);document.body.classList.add('nav-map-free');haptic(5);return}
  mapFollowMode=false;
}
['dragstart','zoomstart','rotatestart','pitchstart'].forEach(evt=>map.on(evt,releaseNavigationCameraFromGesture));
async function refreshAlerts(){if(!map?.loaded()||map.getZoom()<9||!map.getSource('alerts'))return;const b=map.getBounds(),p=new URLSearchParams({min_lat:b.getSouth(),min_lon:b.getWest(),max_lat:b.getNorth(),max_lon:b.getEast()});try{const r=await fetch('/api/alerts?'+p),d=await r.json();if(!r.ok)return;map.getSource('alerts').setData({type:'FeatureCollection',features:(d.alerts||[]).map(a=>({type:'Feature',properties:{id:a.id,title:a.title,category_label:a.category_label||a.title||'Alerta',severity:a.severity,category:a.category||'other',confirmations:a.confirmations||0,created_at:a.created_at||'',description:a.description||''},geometry:{type:'Point',coordinates:[a.lon,a.lat]}}))})}catch{}}
function relativeAlertTime(raw){const t=Date.parse(raw||'');if(!Number.isFinite(t))return'Reportado recentemente';const m=Math.max(0,Math.round((Date.now()-t)/60000));if(m<2)return'Reportado agora';if(m<60)return`Reportado há ${m} min`;const h=Math.round(m/60);return h<24?`Reportado há ${h} h`:'Reportado recentemente'}
async function confirmMapAlert(id,button){if(!LOGGED_IN){location.href='/login?next=/';return}if(button){button.disabled=true;button.textContent='Confirmando…'}try{const r=await fetch(`/api/alerts/${encodeURIComponent(id)}/confirm`,{method:'POST',headers:{'X-CSRF-Token':CSRF}}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível confirmar.');showToast(d.already_confirmed?'Você já confirmou este alerta.':'Alerta confirmado.');await refreshAlerts();map.getPopup?.()?.remove?.()}catch(e){showToast(e.message||'Não foi possível confirmar.');if(button){button.disabled=false;button.textContent='Confirmar'}}}
function showMapAlertPopup(e){const f=e.features?.[0];if(!f)return;const p=f.properties||{},coords=f.geometry?.coordinates;if(!coords)return;const popup=new mapboxgl.Popup({closeButton:true,offset:13,maxWidth:'260px'}).setLngLat(coords).setHTML(`<div class="vano-alert-popup"><small>ALERTA NO MAPA</small><b>${esc(p.category_label||p.title||'Alerta')}</b><span>${esc(relativeAlertTime(p.created_at))}</span>${p.confirmations?`<em>${Number(p.confirmations)} confirmação(ões)</em>`:''}<button type="button" data-confirm-map-alert="${esc(p.id)}">${LOGGED_IN?'Confirmar':'Entrar para confirmar'}</button></div>`).addTo(map);setTimeout(()=>{const btn=popup.getElement()?.querySelector('[data-confirm-map-alert]');btn?.addEventListener('click',()=>confirmMapAlert(p.id,btn))},0)}

function dedupeRoadItems(items){const seen=new Set();return (items||[]).filter(x=>{const k=`${x.type}:${(+x.lat).toFixed(4)}:${(+x.lon).toFixed(4)}`;if(seen.has(k))return false;seen.add(k);return true})}
function signalRadiusForCamera(){if(!map)return 0;const z=map.getZoom();if(z<13.4)return 0;if(z<14.2)return 5000;if(z<15.2)return 3500;return 2000}
function roadControlTypes(){return new Set(['traffic_signal','stop_sign','yield_sign','traffic_sign'])}
function updateRoadLayer(extra=[]){
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
  const signals=visible.filter(x=>String(x.type)==='traffic_signal').sort(byDistance).slice(0,20);
  const others=visible.filter(x=>String(x.type)!=='traffic_signal').sort(byDistance).slice(0,24);
  const shown=[...signals,...others];
  map.getSource('road-controls').setData({type:'FeatureCollection',features:shown.map(x=>({type:'Feature',properties:{type:x.type,label:x.label||roadLabelIcon(x.type),source:x.source||''},geometry:{type:'Point',coordinates:[+x.lon,+x.lat]}}))});
}
function currentSpeedLimit(index){const pts=selectedRoute?.speed_limit_points||[];let best=null;for(const x of pts){if((+x.index||0)<=index)best=x;else break}return best}
function roadLabelIcon(type){return type==='traffic_signal'?'Semáforo':type==='stop_sign'?'Parada obrigatória':type==='yield_sign'?'Dê a preferência':'Sinalização viária'}
function renderRoadAwareness(p,m){if(!selectedRoute)return;const types=roadControlTypes(),all=dedupeRoadItems([...(selectedRoute.road_controls||[]),...roadAwareness]).filter(x=>types.has(String(x.type||'')));const ahead=[];for(const x of all){const n=nearestProgress({lat:+x.lat,lon:+x.lon});const delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<=105&&delta>=-12&&delta<=1800)ahead.push({...x,ahead:Math.max(0,delta),off:n.offRoute})}ahead.sort((a,b)=>a.ahead-b.ahead||a.off-b.off);const next=ahead[0];$('roadAhead').textContent=next?roadLabelIcon(next.type):'Nenhuma sinalização mapeada logo à frente';$('roadAheadDistance').textContent=next?`${fmtDistance(next.ahead)} à frente · dados OpenStreetMap`:'Continuamos verificando o corredor da rota';const lim=currentSpeedLimit(m.index),sign=$('speedSign');if(lim?.speed!=null){sign.classList.remove('unknown');sign.textContent=Math.round(+lim.speed);sign.title=`Limite ${lim.speed} ${lim.unit||'km/h'}`}else{sign.classList.add('unknown');sign.textContent='—';sign.title='Limite não mapeado'}}
async function refreshVisibleSignals(force=false){if(!map?.loaded()||!mapPrefs.liveSignals)return;const radius=signalRadiusForCamera();if(!radius){roadAwareness=[];updateRoadLayer();return}const now=Date.now(),c=map.getCenter(),prec=radius>=3500?2:3,key=`${c.lat.toFixed(prec)}:${c.lng.toFixed(prec)}:${radius}`;if(!force&&(key===lastSignalViewportKey||now-lastSignalFetchAt<12000))return;lastSignalViewportKey=key;lastSignalFetchAt=now;signalController?.abort();signalController=new AbortController();try{const q=new URLSearchParams({lat:c.lat,lon:c.lng,radius,controls_only:'1'}),r=await fetch('/api/road-awareness?'+q,{signal:signalController.signal}),d=await r.json();if(r.ok){const types=roadControlTypes();roadAwareness=(d.items||[]).filter(x=>types.has(String(x.type||''))).slice(0,120);updateRoadLayer()}}catch(e){if(e?.name!=='AbortError')console.warn('[VANO:signals]',e)}}
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
  const p=new URLSearchParams({start_lat:startLat,start_lon:startLon,end_lat:targetLat,end_lon:targetLon,mode,profile,origin_label:start.label||'Minha localização',destination_label:dest.label||'Destino',local_hour:new Date().getHours(),depart_at:'now',safety_bias:Math.round(+sparkPrefs.safety||68),traffic_bias:Math.round(+sparkPrefs.traffic||62),adaptive:mapPrefs.adaptiveRoutes?'1':'0',variant_budget:mapPrefs.aggressiveShortcuts?'5':'3',trial_id:guestTrialId,avoid_ferries:NAV_PREFS.avoid_ferries?'1':'0',avoid_tolls:NAV_PREFS.avoid_tolls?'1':'0',avoid_unpaved:NAV_PREFS.avoid_unpaved?'1':'0'});
  const movingHeading=isMotorizedProfile()&&Number.isFinite(+start?.heading)&&Number.isFinite(+start?.speed)&&+start.speed>=1.2;if(movingHeading){p.set('start_bearing',String(((+start.heading%360)+360)%360));p.set('start_speed',String(Math.max(0,+start.speed)))}if(start?.is_reroute)p.set('reroute','1');
  const groupKey=key.replace(`${profile}:${mode}:`,`${profile}:*:`);
  return{key,groupKey,p,endLat,endLon,mode};
}
function trimRouteResponseCache(){if(routeResponseCache.size<=24)return;const rows=[...routeResponseCache.entries()].sort((a,b)=>(+a[1].at||0)-(+b[1].at||0)).slice(0,Math.max(1,routeResponseCache.size-20));rows.forEach(([key])=>routeResponseCache.delete(key))}
function abortRoutePrefetches(){for(const job of routePrefetchJobs.values()){try{job.controller?.abort()}catch{}}routePrefetchJobs.clear();routePrefetchDestinationKey=''}
function routePrefetchDestinationId(candidate){return candidate&&Number.isFinite(+candidate.lat)&&Number.isFinite(+candidate.lon)?`${profile}:${(+candidate.lat).toFixed(5)}:${(+candidate.lon).toFixed(5)}`:''}
function routeCacheFresh(info,prefetchedOnly=false){const row=info?routeResponseCache.get(info.key):null;if(!row)return null;const ttl=row.prefetched?(isMotorizedProfile()?30000:44000):(isMotorizedProfile()?15000:30000);if(Date.now()-row.at>=ttl){routeResponseCache.delete(info.key);return null}return prefetchedOnly&&!row.prefetched?null:row}
function prefetchRouteMode(candidate,mode,start){
  const info=routeRequestInfo(start,candidate,mode);if(!info)return Promise.resolve(null);
  const cached=routeCacheFresh(info);if(cached)return Promise.resolve(cached.data);
  const current=routePrefetchJobs.get(info.key);if(current)return current.promise;
  const controller=new AbortController();info.p.set('prefetch','1');
  const job={controller,mode:info.mode,promise:null};
  job.promise=(async()=>{try{const r=await fetch('/api/route?'+info.p,{signal:controller.signal,headers:{'Accept':'application/json'},priority:info.mode===routeMode?'high':'low'}),d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||'Falha no pré-cálculo');const warmed=d.routes||[];if(!warmed.length)return null;routeResponseCache.set(info.key,{at:Date.now(),routes:warmed,data:d,engine:d.engine||'',prefetched:true,committing:false,mode:info.mode,groupKey:info.groupKey});trimRouteResponseCache();return d}catch(e){if(e?.name!=='AbortError')console.debug(`[VANO:route-prefetch:${info.mode}]`,e?.message||e);return null}finally{if(routePrefetchJobs.get(info.key)===job)routePrefetchJobs.delete(info.key)}})();
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
  // Critical-path first: warm the alternate mode only after the selected mode is ready.
  primary.then(()=>{setTimeout(()=>{if(routePrefetchDestinationKey===destinationKey)prefetchRouteMode(candidate,secondaryMode,start).catch(()=>{})},260)}).catch(()=>{});
  return primary;
}
async function commitPrefetchedRoute(start,key){
  if(routeCommitKeys.has(key)||!destination)return;routeCommitKeys.add(key);
  try{const info=routeRequestInfo(start,destination);if(!info||info.key!==key)return;const r=await fetch('/api/route?'+info.p,{headers:{'Accept':'application/json'},keepalive:true}),d=await r.json();if(d?.guest_trial?.active){renderGuestTrial(d.guest_trial.remaining);if(d.guest_trial.trial_id)guestTrialId=d.guest_trial.trial_id}if(!r.ok){if(d.code==='guest_route_limit_reached'){renderGuestTrial(0);showGuestLimit()}return}const row=routeResponseCache.get(key);if(row){row.prefetched=false;row.committing=false;row.at=Date.now();row.data=d;row.routes=d.routes||row.routes;row.engine=d.engine||row.engine}
    // One destination confirmation authorizes the whole pre-warmed chooser set.
    // Switching Safe <-> Fast must not consume a second guest route or write a
    // duplicate history row just because V84 calculated both modes in advance.
    for(const sibling of routeResponseCache.values()){if(sibling.groupKey===info.groupKey){sibling.prefetched=false;sibling.committing=false;sibling.at=Date.now()}}}catch(e){console.debug('[VANO:route-commit]',e?.message||e)}finally{const row=routeResponseCache.get(key);if(row?.prefetched)row.committing=false;routeCommitKeys.delete(key)}}
async function fetchRoutes(start,quiet=false){
  if(!LOGGED_IN&&guestRoutesRemaining<=0){showGuestLimit();throw new Error('Crie uma conta para continuar após as 10 rotas grátis.')}
  if(!LOGGED_IN&&!guestTrialId)guestTrialId=makeGuestTrialId();
  const info=routeRequestInfo(start,destination);if(!info)throw new Error('Destino inválido.');let cached=routeCacheFresh(info),cacheMs=cached?.prefetched?(isMotorizedProfile()?30000:44000):(isMotorizedProfile()?15000:30000);
  const pending=routePrefetchJobs.get(info.key)?.promise;if(!cached&&pending){try{await pending}catch{}cached=routeCacheFresh(info);cacheMs=cached?.prefetched?(isMotorizedProfile()?30000:44000):(isMotorizedProfile()?15000:30000)}
  if(cached&&Date.now()-cached.at<cacheMs){routes=cached.routes;lastRouteEngine=cached.engine||'';chooseByMode();if(!quiet)renderRoute();if(cached.prefetched&&!cached.committing){cached.committing=true;commitPrefetchedRoute(start,info.key)}return cached.data}
  const requestId=++routeRequestId;routeController?.abort();routeController=new AbortController();
  const r=await fetch('/api/route?'+info.p,{signal:routeController.signal,headers:{'Accept':'application/json'},priority:'high'}),d=await r.json();
  if(requestId!==routeRequestId)throw new DOMException('stale','AbortError');
  if(d?.guest_trial?.active){renderGuestTrial(d.guest_trial.remaining);if(d.guest_trial.trial_id)guestTrialId=d.guest_trial.trial_id;}
  if(!r.ok){if(d.code==='guest_route_limit_reached'){renderGuestTrial(0);showGuestLimit()}throw new Error(d.detail||d.error||'Não foi possível calcular')}
  routes=d.routes||[];if(!routes.length)throw new Error('Nenhuma rota encontrada');lastRouteEngine=d.engine||'';
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
function variantLabel(r){if(r.badges?.includes('fastest'))return 'Mais rápida';if(r.badges?.includes('safest')||r.badges?.includes('smart'))return 'Mais segura';if(r.safety_variant)return 'Desvio seguro';return r.micro_route?'Atalho':'Alternativa'}
function renderRouteVariants(){const box=$('routeVariants');if(!box)return;const list=(routes||[]).filter(r=>r?.geometry).slice().sort((a,b)=>(+a.duration||9e12)-(+b.duration||9e12)).slice(0,4);const count=$('routeChooserCount');if(count)count.textContent=list.length>1?`${list.length} opções comparadas`:'1 rota pronta';box.classList.toggle('route-alt-hidden',!mapPrefs.showAlternatives||list.length<2);if(!mapPrefs.showAlternatives||list.length<2){box.innerHTML='';return}const best=+list[0].duration||0;box.innerHTML=list.map(r=>{const active=selectedRoute&&String(selectedRoute.id)===String(r.id),delta=Math.max(0,Math.round(((+r.duration||0)-best)/60)),sub=(r.safety_variant?'evita ponto verificado':r.adaptive_variant?'corredor novo':r.micro_route?'microrrota':delta?`+${delta} min`:'menor ETA');return `<button type="button" class="route-variant ${active?'active':''}" data-route-id="${esc(r.id)}"><small>${active?'Selecionada':'Alternativa'}</small><b>${esc(fmtDuration(r.duration_min||(+r.duration||0)/60))}</b><span>${esc(variantLabel(r))}</span><em>${esc(sub)}</em></button>`}).join('');box.querySelectorAll('[data-route-id]').forEach(btn=>btn.onclick=()=>{const found=routes.find(r=>String(r.id)===btn.dataset.routeId);if(!found)return;manualRouteSelection=true;selectedRoute=found;renderRoute();haptic(8)})}
function alternativeRoutesFC(){if(activeNav?.classList.contains('show'))return navAlternativeFC();if(!mapPrefs.showAlternatives||!selectedRoute)return emptyFC();const key=routeClientKey(selectedRoute),list=(routes||[]).filter(r=>r?.geometry?.coordinates?.length>1&&routeClientKey(r)!==key).slice().sort((a,b)=>(+a.duration||9e12)-(+b.duration||9e12)).slice(0,3);return{type:'FeatureCollection',features:list.map((r,i)=>({type:'Feature',properties:{alternative:true,rank:i,key:routeClientKey(r),micro:!!r.micro_route},geometry:r.geometry}))}}

function renderRoute(){
  if(!selectedRoute)return;
  const r=selectedRoute,fastOnly=routeMode==='fastest'&&r.fast_eta_only,level=Math.max(0,Math.min(5,+r.safety_level||0)),dots=Array.from({length:5},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('');
  $('routeHeading').textContent=manualRouteSelection?'Alternativa escolhida':routeName();
  $('routeSubtitle').textContent=manualRouteSelection?`${variantLabel(r)} · alternativa escolhida por você`:(routeMode==='fastest'?'Menor tempo estimado com o trânsito atual':'Equilíbrio entre tempo, alertas e contexto da via');
  $('selectedDuration').textContent=fmtDuration(r.duration_min);$('selectedDistance').textContent=fmtDistance(r.distance);renderRouteSummaryPills(r);
  const liveFlowMeta=+r.live_flow_cells>0?` · VANO Flow ${r.live_flow_cells} cél.`:'',firstJam=(r.traffic_corridors||[])[0],delay=+r.traffic_delay_min||0,trafficDetail=firstJam?` · ${esc(firstJam.street||'trecho à frente')}`:'',delayText=delay>=.5?` · +${delay<10?delay.toFixed(1):Math.round(delay)} min`:'';const traffic=isMotorizedProfile()?`<div class="traffic-line"><span>Trânsito ${esc(r.traffic_level||'—')}${trafficDetail}${delayText}${liveFlowMeta}</span><span class="traffic-bar"><i style="width:${Math.min(100,+r.traffic_score||0)}%"></i></span><span>${Math.round(+r.traffic_score||0)}/100</span></div>`:'';
  const risk=(r.risk_zones?.length||r.risk_factors?.length)?`<div class="risk-note"><i data-lucide="shield-alert" width="12"></i><span>${esc((r.risk_factors&&r.risk_factors[0])||`${r.risk_zones.length} zona(s) de atenção próxima(s)`)}</span></div>`:'';
  const long=r.distance>=350000?'<span>longa distância</span>':'';
  if(fastOnly){
    const gain=+r.eta_gain_min||0,street=(r.micro_streets||[])[0]||'',micro=r.micro_route?`<div class="smart-note"><span class="live-dot"></span><b>Atalho por quarteirão</b> · ${street?`desvio em ${esc(street)} · `:''}contorna ${r.micro_avoided_points||1} gargalo(s)${gain>=.1?` · economiza ${gain<1?Math.round(gain*60)+' s':gain.toFixed(1)+' min'}`:''}.</div>`:'';
    $('routeCard').className='route-card fast-selected';
    $('routeCard').innerHTML=`<div class="route-card-top"><div><h3>${manualRouteSelection?'Alternativa escolhida':'Rota mais rápida'}</h3><div class="safety-level"><span class="level-pill"><i data-lucide="zap" width="10"></i>ETA</span><strong>${manualRouteSelection?'Alternativa escolhida por você':'Prioriza o menor tempo de chegada'}</strong></div></div><div class="mins">${esc(fmtDuration(r.duration_min))}</div></div>${traffic}<div class="route-card-meta"><span>${fmtDistance(r.distance)}</span><span>${r.severe_segments||0} trecho(s) congestionado(s)</span>${r.congested_distance_km?`<span>${r.congested_distance_km} km de lentidão</span>`:''}${long}<span>${profileLabel()}</span></div>${micro}<div class="route-ai"><span class="vano-dot"></span><b>Por que esta rota?</b><span>Menor tempo estimado entre as alternativas disponíveis agora.</span></div>`;
    setAmbient(3);renderRouteVariants();drawRoute();updateRoadLayer();if(window.lucide)lucide.createIcons();return;
  }
  const safeBypass=r.safety_variant?`<div class="smart-note"><span class="live-dot"></span><b>Desvio de segurança</b> · ${r.safety_avoided_points||1} ponto(s) verificado(s) evitado(s)${+r.safety_gain_vs_fastest>0?` · +${Math.round(+r.safety_gain_vs_fastest)} segurança`:''}${+r.eta_delta_vs_fastest_min>0?` · +${(+r.eta_delta_vs_fastest_min).toFixed(1)} min`:''}.</div>`:'';
  $('routeCard').className='route-card';
  $('routeCard').innerHTML=`<div class="route-card-top"><div><h3>${esc(routeName())}</h3><div class="safety-level"><span class="level-pill"><i data-lucide="shield" width="10"></i>${level}/5</span><span class="safety-dots">${dots}</span><strong>${esc(r.safety_level_label||'Atenção')}</strong></div></div><div class="mins">${esc(fmtDuration(r.duration_min))}</div></div>${traffic}<div class="route-card-meta"><span>${fmtDistance(r.distance)}</span><span>${r.nearby_alerts?.length||0} alertas próximos</span>${r.incidents_count?`<span>${r.incidents_count} incidente(s)</span>`:''}${r.closures_count?`<span>${r.closures_count} bloqueio(s)</span>`:''}${long}<span>${profileLabel()}</span></div>${safeBypass}${risk}<div class="route-ai"><span class="vano-dot"></span><b>Por que esta rota?</b><span>Equilibra tempo de chegada, alertas recentes e contexto das vias.</span>${r.decision_reasons?.length?`<span> ${esc(r.decision_reasons.slice(0,2).join(' · '))}</span>`:''}</div>`;
  setAmbient(level);renderRouteVariants();drawRoute();updateRoadLayer();if(window.lucide)lucide.createIcons();
}
function drawRoute(){if(!selectedRoute?.geometry||!map.getSource('routes'))return;if(activeNav?.classList.contains('show')){buildMetrics();setNavigationRouteFocus(true);setNavRouteData();return}setNavigationRouteFocus(false);map.getSource('routes').setData({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:selectedRoute.geometry}]});map.getSource('route-alternatives')?.setData(alternativeRoutesFC());map.getSource('route-progress')?.setData(emptyFC());updateTrafficSegmentLayer();const b=new mapboxgl.LngLatBounds();selectedRoute.geometry.coordinates.forEach(c=>b.extend(c));map.fitBounds(b,{padding:{top:220,bottom:325,left:35,right:35},maxZoom:16,duration:650})}
function buildMetrics(){const c=selectedRoute?.geometry?.coordinates||[];routeCumulative=new Array(c.length).fill(0);for(let i=1;i<c.length;i++)routeCumulative[i]=routeCumulative[i-1]+hav(c[i-1],c[i]);routeTotalGeometry=routeCumulative.at(-1)||selectedRoute?.distance||1}
function projectSegmentMeters(p,a,b){const lat0=p.lat*Math.PI/180,mx=111320*Math.max(.15,Math.cos(lat0)),my=110540,ax=(a[0]-p.lon)*mx,ay=(a[1]-p.lat)*my,bx=(b[0]-p.lon)*mx,by=(b[1]-p.lat)*my,vx=bx-ax,vy=by-ay,vv=vx*vx+vy*vy,t=vv>1e-6?Math.max(0,Math.min(1,-(ax*vx+ay*vy)/vv)):0,x=ax+vx*t,y=ay+vy*t;return{distance:Math.hypot(x,y),t}}
function nearestProgress(p){const c=selectedRoute?.geometry?.coordinates||[];if(!c.length)return{distanceAlong:0,remaining:selectedRoute?.distance||0,progress:0,offRoute:0,index:0};if(c.length===1)return{distanceAlong:0,remaining:selectedRoute?.distance||0,progress:0,offRoute:hav([p.lon,p.lat],c[0]),index:0};let best=Infinity,bestI=0,bestT=0,stride=Math.max(1,Math.floor((c.length-1)/1100));for(let i=0;i<c.length-1;i+=stride){const j=Math.min(c.length-1,i+stride),pr=projectSegmentMeters(p,c[i],c[j]);if(pr.distance<best){best=pr.distance;bestI=i;bestT=pr.t}}const start=Math.max(0,bestI-stride*2),end=Math.min(c.length-2,bestI+stride*3);for(let i=start;i<=end;i++){const pr=projectSegmentMeters(p,c[i],c[i+1]);if(pr.distance<best){best=pr.distance;bestI=i;bestT=pr.t}}const seg=Math.max(0,(routeCumulative[bestI+1]||routeCumulative[bestI]||0)-(routeCumulative[bestI]||0)),along=(routeCumulative[bestI]||0)+seg*bestT,progress=Math.max(0,Math.min(1,along/routeTotalGeometry)),idx=Math.min(c.length-1,bestI+(bestT>.55?1:0));return{distanceAlong:along,remaining:Math.max(0,(selectedRoute.distance||routeTotalGeometry)*(1-progress)),progress,offRoute:best,index:idx}}
function currentStep(along){const s=selectedRoute?.steps||[];let sum=0;for(let i=0;i<s.length;i++){const x=s[i];sum+=+x.distance||0;if(along<=sum)return{...x,stepIndex:i,remainingInStep:Math.max(0,sum-along)}}return s.length?{...s.at(-1),stepIndex:s.length-1,remainingInStep:0}:{instruction:'Siga pela rota indicada',stepIndex:0,remainingInStep:0}}
function maneuverLabel(step){const t=String(step?.type||''),m=String(step?.modifier||'');if(t==='arrive')return'Chegue ao destino';if(t==='depart')return'Siga em frente';if(t==='roundabout'||t==='rotary')return step?.exit?`Pegue a saída ${step.exit}`:'Entre na rotatória';if(t==='merge')return'Entre na via';if(t==='fork')return m.includes('left')?'Mantenha-se à esquerda':m.includes('right')?'Mantenha-se à direita':'Siga pela bifurcação';if(t==='turn'||t==='end of road'||t==='continue'||t==='new name'){if(m.includes('uturn'))return'Faça o retorno';if(m.includes('left'))return'Vire à esquerda';if(m.includes('right'))return'Vire à direita';if(m.includes('straight'))return'Siga em frente'}return step?.instruction||'Siga pela rota indicada'}
function stepStreet(step){const n=String(step?.name||'').trim();if(n)return n;const i=String(step?.instruction||'');const mt=i.match(/(?:na|no|em|para)\s+(.+)$/i);return mt?.[1]?.trim()||'Via indicada'}
function maneuverGlyph(step){const m=String(step?.modifier||'').toLowerCase(),t=String(step?.type||'').toLowerCase();if(t.includes('roundabout')||t.includes('rotary'))return '↻';if(m.includes('sharp left'))return '↰';if(m.includes('sharp right'))return '↱';if(m.includes('slight left'))return '↖';if(m.includes('slight right'))return '↗';if(m.includes('left'))return '←';if(m.includes('right'))return '→';if(t.includes('uturn')||m.includes('uturn'))return '↶';return '↑'}
function laneGlyph(indications){const x=(indications||[]).join(' ').toLowerCase();if(x.includes('left')&&x.includes('straight'))return '↖';if(x.includes('right')&&x.includes('straight'))return '↗';if(x.includes('left'))return '←';if(x.includes('right'))return '→';if(x.includes('uturn'))return '↶';return '↑'}
function renderLaneGuidance(step){const box=$('laneGuidance'),items=$('laneItems'),lanes=step?.lanes||[];if(!isMotorizedProfile()||!lanes.length||(step.remainingInStep??9999)>650){box.classList.remove('show');items.innerHTML='';return}items.innerHTML=lanes.map(l=>`<span class="lane ${l.valid?'valid':''} ${l.active?'active':''}">${laneGlyph(l.indications)}</span>`).join('');box.classList.add('show')}
function nextRiskAhead(m){if(!selectedRoute)return null;const events=[];for(const a of selectedRoute.nearby_alerts||[]){if(!Number.isFinite(+a.lat)||!Number.isFinite(+a.lon)||(+a.severity||0)<3)continue;const n=nearestProgress({lat:+a.lat,lon:+a.lon}),delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<150&&delta>=-20&&delta<=1600)events.push({kind:'alert',distance:Math.max(0,delta),title:a.category_label||a.title||'Alerta recente',copy:`Severidade ${a.severity}/5 · ${a.confirmations||0} confirmação(ões)`,severity:+a.severity||3})}for(const z of selectedRoute.risk_zones||[]){if(!Number.isFinite(+z.lat)||!Number.isFinite(+z.lon))continue;const n=nearestProgress({lat:+z.lat,lon:+z.lon}),delta=n.distanceAlong-m.distanceAlong;if(n.offRoute<Math.max(160,+z.radius_m||350)&&delta>=-40&&delta<=1800)events.push({kind:'zone',distance:Math.max(0,delta),title:z.name||'Zona de atenção',copy:`Nível máximo estimado ${z.level_cap}/5 · área monitorada`,severity:Math.max(3,5-(+z.level_cap||3))})}return events.sort((a,b)=>a.distance-b.distance||b.severity-a.severity)[0]||null}
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
function speak(text,key=text){
  if(!soundEnabled||!text||key===lastSpokenInstruction)return;lastSpokenInstruction=key;
  text=window.VANO_I18N?.t?.(String(text))||String(text);
  const customWebVoice=!!selectedVoiceName&&('speechSynthesis'in window)&&availableInstructionVoices().some(v=>v.name===selectedVoiceName);
  try{if(!customWebVoice&&window.Android&&typeof window.Android.speak==='function'){window.Android.speak(String(text));return}}catch{}
  if(!('speechSynthesis'in window)){try{if(window.Android&&typeof window.Android.speak==='function')window.Android.speak(String(text))}catch{}return;}
  try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text));u.lang=String(BOOT.locale||window.VANO_ACTIVE_LOCALE||'pt-BR');u.rate=1.01;u.pitch=1;const voices=window.speechSynthesis.getVoices?.()||[],want=String(BOOT.locale||window.VANO_ACTIVE_LOCALE||'pt-BR'),base=want.split('-')[0],chosen=(selectedVoiceName&&voices.find(v=>v.name===selectedVoiceName))||voices.find(v=>String(v.lang||'').toLowerCase()===want.toLowerCase())||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base.toLowerCase()));if(chosen){u.voice=chosen;u.lang=chosen.lang||u.lang}window.speechSynthesis.speak(u)}catch(e){console.debug('[VANO:voice]',e)}
}
function setLayerVisibility(id,visible){try{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')}catch{}}
function applyMapPrefs(){const live=!!mapPrefs.liveSignals;setLayerVisibility('road-controls-dot',live);setLayerVisibility('road-controls-pulse',live);['vano-traffic-probe','vano-traffic-glow','vano-traffic-flow','vano-traffic-core','vano-traffic-hotspot-glow','vano-traffic-hotspot-dot'].forEach(id=>setLayerVisibility(id,live));if(!live){if(map?.getSource('road-controls'))map.getSource('road-controls').setData(emptyFC());if(map?.getSource('vano-traffic-visible'))map.getSource('vano-traffic-visible').setData(emptyFC())}else{scheduleSignalRefresh(true);scheduleTrafficSnapshot(true)}if(map?.getSource('route-alternatives'))map.getSource('route-alternatives').setData(alternativeRoutesFC());renderRouteVariants();updateTrafficRadar(true);if(activeNav?.classList.contains('show'))setNavigationRouteFocus(true)}
function syncPrefsUI(){[['prefAdaptive','adaptiveRoutes'],['prefAggressive','aggressiveShortcuts'],['prefAlternatives','showAlternatives'],['prefLiveSignals','liveSignals'],['prefAutoFaster','autoFaster']].forEach(([id,key])=>{const el=$(id);if(el)el.checked=!!mapPrefs[key]})}
function openPrefsDrawer(force){const d=$('prefsDrawer');if(!d)return;const open=typeof force==='boolean'?force:!d.classList.contains('show');d.classList.toggle('show',open);$('prefsBtn')?.classList.toggle('active',open);if(open){openSafetyDrawer(false);syncPrefsUI();populateVoiceSelectors()}}
function bindPref(id,key,recalc=false){const el=$(id);if(!el)return;el.addEventListener('change',()=>{mapPrefs[key]=!!el.checked;saveMapPrefs();applyMapPrefs();routeResponseCache.clear();if(recalc&&origin&&destination)calculateRoutes()})}

async function loadSharedRoute(){if(!SHARED_TOKEN)return;try{const r=await fetch('/api/shared-route/'+encodeURIComponent(SHARED_TOKEN)),d=await r.json();if(!r.ok)throw new Error(d.error||'Rota compartilhada indisponível.');profile=d.profile||'driving';routeMode=d.mode==='fastest'?'fastest':'safest';origin=d.origin;destination=d.destination;destinationConfirmed=true;originInput.value=origin.label||'Origem';destinationInput.value=destination.label||'Destino';if(originMarker)originMarker.remove();if(destinationMarker)destinationMarker.remove();originMarker=new mapboxgl.Marker({element:markerEl('origin')}).setLngLat([origin.lon,origin.lat]).addTo(map);destinationMarker=new mapboxgl.Marker({element:markerEl('destination'),anchor:'bottom',offset:[0,0]}).setLngLat([destination.lon,destination.lat]).addTo(map);selectedRoute=d.route;routes=[selectedRoute];document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===profile));document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.toggle('active',x.dataset.routeMode===routeMode));planSheet.classList.remove('sheet-collapsed');welcomeState.style.display='none';routeState.style.display='block';renderRoute();showToast('Rota compartilhada pronta para usar.')}catch(e){showToast(e.message)}}
function futureTrafficPoints(m){const c=selectedRoute?.geometry?.coordinates||[];if(!c.length||!routeCumulative.length)return[];const along=m?.distanceAlong||0,targets=[550,1600,3600,7000].map(x=>along+x).filter(x=>x<routeTotalGeometry-80),out=[];for(const target of targets){let lo=Math.max(0,m?.index||0),hi=routeCumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(routeCumulative[mid]<target)lo=mid+1;else hi=mid}if(c[lo])out.push(c[lo])}return out}
function hideTrafficSuggestion(){trafficSuggestionRoute=null;$('trafficSuggestion').classList.remove('show')}
function applyTrafficSuggestion(){if(!trafficSuggestionRoute||!lastNavPosition)return;const oldKey=routeClientKey(selectedRoute);if(oldKey)navSuppressedRouteKeys.add(oldKey);mergeNavigationAlternative(trafficSuggestionRoute);selectedRoute=trafficSuggestionRoute;origin={lat:lastNavPosition.lat,lon:lastNavPosition.lon,label:'Minha localização'};buildMetrics();navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;lastNavRoutePaintAt=0;drawRoute();updateRoadLayer();$('arrivalTime').textContent=fmtClock(new Date(Date.now()+(selectedRoute.duration||0)*1000));const m=nearestProgress(lastNavPosition),step=currentStep(m.distanceAlong);$('nextInstruction').textContent=maneuverLabel(step);$('nextStreet').textContent=stepStreet(step);$('maneuverGlyph').textContent=maneuverGlyph(step);updateNavSummary(selectedRoute.duration||0,m.remaining,step);hideTrafficSuggestion();resetOffRouteTracker();showToast(selectedRoute.micro_route?'Micro-rota aplicada.':'Nova rota aplicada.');scheduleCamera(lastNavPosition,true,m)}
function trafficSegmentFC(){const segs=isMotorizedProfile()?(selectedRoute?.traffic_segments||[]):[];return{type:'FeatureCollection',features:segs.filter(x=>Array.isArray(x.coordinates)&&x.coordinates.length>1).map((x,i)=>({type:'Feature',properties:{score:+x.score||0,level:x.level||'',bucket:x.bucket||'',street:x.street||'',start_m:+x.distance_start_m||0,end_m:+x.distance_end_m||0,i},geometry:{type:'LineString',coordinates:x.coordinates}}))}}
function updateTrafficSegmentLayer(){if(map?.getSource('traffic-live-segments'))map.getSource('traffic-live-segments').setData(activeNav?.classList.contains('show')?emptyFC():trafficSegmentFC());if(activeNav?.classList.contains('show'))setNavRouteData();updateTrafficRadar(false)}
function upcomingTrafficCorridor(along=0,maxAhead=1800){if(!isMotorizedProfile()||!selectedRoute)return null;const list=(selectedRoute.traffic_corridors||[]).map(x=>({...x,ahead:(+x.distance_start_m||0)-along})).filter(x=>x.ahead>=-100&&x.ahead<=maxAhead).sort((a,b)=>Math.max(0,a.ahead)-Math.max(0,b.ahead)||(+b.score||0)-(+a.score||0));return list[0]||null}
function updateTrafficRadar(force=false,along=null){const box=$('trafficRadar');if(!box)return;if(!isMotorizedProfile()||!selectedRoute){box.classList.remove('show','severe');return}const now=performance.now();if(!force&&now-lastTrafficRadarAt<700)return;lastTrafficRadarAt=now;const pos=Number.isFinite(along)?along:(activeNav?.classList.contains('show')&&lastNavPosition?nearestProgress(lastNavPosition).distanceAlong:0),x=upcomingTrafficCorridor(pos,1800);if(!x){box.classList.remove('show','severe');return}const ahead=Math.max(0,+x.ahead||0),score=+x.score||0,delay=Math.max(0,+x.delay_s||0),key=`${x.street}:${Math.round(ahead/100)}:${Math.round(score/10)}`;if(!force&&key===lastTrafficRadarKey)return;lastTrafficRadarKey=key;box.classList.toggle('severe',score>=78);$('trafficRadarTitle').textContent=`${x.street||'Trânsito à frente'} · ${String(x.level||'trânsito').toLowerCase()}`;$('trafficRadarMeta').textContent=`${ahead<40?'agora':fmtDistance(ahead)+' à frente'}${delay>=45?` · +${Math.max(1,Math.round(delay/60))} min neste trecho`:''}`;box.classList.add('show')}

function clearLiveRoad(){liveContext=null;lastLiveContextAt=0;lastLiveContextPos=null;lastFlowProbeAt=0}

async function checkLiveTraffic(force=false){
  if(!mapPrefs.autoFaster||!isMotorizedProfile()||!destination||!selectedRoute||!activeNav.classList.contains('show')||!lastNavPosition||trafficChecking)return;
  const now=Date.now();if(!force&&now-lastTrafficCheckAt<60000)return;if(now<trafficDismissUntil)return;
  const m=nearestProgress(lastNavPosition);if(m.remaining<900)return;
  trafficChecking=true;lastTrafficCheckAt=now;$('liveTrafficText').textContent='Atualizando corredor…';
  try{
    const r=await fetch('/api/traffic-recommendation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_lat:lastNavPosition.lat,current_lon:lastNavPosition.lon,destination_lat:destination.lat,destination_lon:destination.lon,current_safety_level:selectedRoute.safety_level??3,future_points:futureTrafficPoints(m),local_hour:new Date().getHours(),route_mode:routeMode,profile,heading:Number.isFinite(+lastNavPosition.heading)?+lastNavPosition.heading:null,speed:Number.isFinite(+lastNavPosition.speed)?Math.max(0,+lastNavPosition.speed):null})}),d=await r.json();
    if(!r.ok)throw new Error(d.error||'Falha ao atualizar corredor');
    if(Array.isArray(d.hotspots)&&d.hotspots.length&&selectedRoute){const baseAlong=m.distanceAlong||0;selectedRoute.traffic_corridors=d.hotspots.map(x=>({...x,distance_start_m:baseAlong+(+x.distance_start_m||0),distance_end_m:baseAlong+(+x.distance_end_m||0)}));selectedRoute.traffic_delay_min=+d.traffic_delay_min||selectedRoute.traffic_delay_min||0;updateTrafficRadar(true,baseAlong)}
    if(d.traffic_detected)$('liveTrafficText').textContent=`Trânsito ${String(d.traffic_level||'').toLowerCase()} à frente`;
    else if(d.mapped_road_detected)$('liveTrafficText').textContent='Contexto viário mapeado à frente';
    else $('liveTrafficText').textContent='Fluxo normal à frente';
    if(d.recommend&&d.suggestion?.route){
      trafficSuggestionRoute=d.suggestion.route;mergeNavigationAlternative(trafficSuggestionRoute);
      hideTrafficSuggestion();refreshNavigationAlternatives(true);haptic(20);
      speak(`Tem uma rota mais rápida disponível${d.saving_minutes?`, economizando cerca de ${d.saving_minutes} minutos`:''}.`,'faster-route-'+Date.now());
    }else if(d.traffic_detected||d.mapped_road_detected)hideTrafficSuggestion();
  }catch(e){$('liveTrafficText').textContent='Monitoramento do corredor ativo'}finally{trafficChecking=false}
}

async function performNavReroute(position,{manual=false}={}){
  if(rerouting||!destination||!selectedRoute)return;const p=position||lastNavPosition||userLocation;if(!p)return;if(manual)haptic(10);
  rerouting=true;lastRerouteAt=Date.now();resetOffRouteTracker();const notice=$('rerouteNotice'),btn=$('navRecalculateBtn');notice?.classList.add('show');btn?.classList.add('recalculating');if(notice)notice.querySelector('span:last-child').textContent=manual?'Recalculando…':'Ajustando rota…';
  try{if(manual)routeResponseCache.clear();const start={lat:+p.lat,lon:+p.lon,label:'Minha localização',is_gps:true,is_reroute:true,heading:Number.isFinite(+p.heading)?+p.heading:null,speed:Number.isFinite(+p.speed)?Math.max(0,+p.speed):null,accuracy:Number.isFinite(+p.accuracy)?+p.accuracy:null};await fetchRoutes(start,true);origin=start;navSuppressedRouteKeys.clear();navAlternativeHitKey='';navAlternativeHitCount=0;buildMetrics();navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;lastNavRoutePaintAt=0;const m=nearestProgress(p),step=currentStep(m.distanceAlong);navLastAlong=Math.max(0,m.distanceAlong);setNavigationRouteFocus(true);setNavRouteData(navLastAlong);refreshNavigationAlternatives(true);updateRoadLayer();$('nextStreet').textContent=stepStreet(step);$('nextInstruction').textContent=maneuverLabel(step);updateNavSummary(selectedRoute.duration||0,m.remaining,step);scheduleCamera(p,true,m);showToast(manual?'Rota recalculada.':'Rota ajustada ao seu trajeto.')}catch(e){if(e?.name!=='AbortError')showToast(e?.message||'Não foi possível recalcular a rota.')}finally{rerouting=false;notice?.classList.remove('show');btn?.classList.remove('recalculating')}}
function rerouteFrom(p){if(Date.now()-lastRerouteAt<30000)return;return performNavReroute(p,{manual:false})}
function recalculateActiveRoute(){return performNavReroute(lastNavPosition||userLocation,{manual:true})}

async function toggleLiveShare(){if(!LOGGED_IN){showToast('Entre na sua conta para compartilhar sua posição ao vivo.');return}if(liveShareToken){const url=liveShareUrl;try{if(navigator.share)await navigator.share({title:'Acompanhe meu trajeto no VANO',text:'Estou compartilhando meu trajeto ao vivo.',url});else{await navigator.clipboard.writeText(url);showToast('Link ao vivo copiado.')}}catch(e){if(e?.name!=='AbortError')showToast('Não foi possível compartilhar o link.')}return}const btn=$('liveShareBtn');btn.disabled=true;try{const r=await fetch('/api/live-trip',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({destination_label:destination?.label||'Destino',safety_level:selectedRoute?.safety_level??3})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível iniciar o compartilhamento.');liveShareToken=d.token;liveShareUrl=d.url;btn.classList.add('live-active');btn.innerHTML='<i data-lucide="radio" width="13"></i>Ao vivo';if(window.lucide)lucide.createIcons();if(lastNavPosition)pushLivePosition(lastNavPosition,nearestProgress(lastNavPosition),true);if(navigator.share)await navigator.share({title:'Acompanhe meu trajeto no VANO',text:'Estou compartilhando meu trajeto ao vivo.',url:d.url});else{await navigator.clipboard.writeText(d.url);showToast('Compartilhamento ao vivo iniciado e link copiado.')}}catch(e){if(e?.name!=='AbortError')showToast(e.message||'Não foi possível iniciar o compartilhamento.')}finally{btn.disabled=false}}
async function pushLivePosition(p,m,force=false){if(!liveShareToken||liveShareUpdating||!p)return;const now=Date.now();if(!force&&now-lastLiveShareAt<5000)return;lastLiveShareAt=now;liveShareUpdating=true;try{await fetch(`/api/live-trip/${encodeURIComponent(liveShareToken)}/update`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({lat:p.lat,lon:p.lon,accuracy:p.accuracy||0,speed:p.speed||0,heading:p.heading,progress:m?.progress||0,safety_level:selectedRoute?.safety_level??3})})}catch{}finally{liveShareUpdating=false}}
async function stopLiveShare(){if(!liveShareToken)return;const token=liveShareToken;liveShareToken=null;liveShareUrl='';$('liveShareBtn')?.classList.remove('live-active');try{await fetch(`/api/live-trip/${encodeURIComponent(token)}/stop`,{method:'POST',headers:{'X-CSRF-Token':CSRF}})}catch{}}
function toggleNavigationCamera(){if(navExperienceMode==='immersive'){setNavigationExperience('normal',{recenter:false,announce:false});navCameraMode='perspective'}else navCameraMode=navCameraMode==='top'?'perspective':'top';syncNavCameraButton();showToast(navCameraMode==='top'?'Visualização 2D.':'Visualização 3D.');if(followMode&&lastNavPosition)scheduleCamera(lastNavPosition,true,nearestProgress(lastNavPosition));else map?.easeTo?.({pitch:navCameraMode==='top'?0:58,bearing:navCameraMode==='top'?0:map.getBearing(),duration:260})}
function syncPreviewCancelPosition(){const x=$('previewCancelBtn'),anchor=$('recenterBtn'),app=$('wsApp');if(!x||!anchor||!app||!x.classList.contains('show'))return;const a=anchor.getBoundingClientRect(),w=app.getBoundingClientRect();x.style.left=`${Math.round(a.right-w.left+8)}px`;x.style.top=`${Math.round(a.top-w.top)}px`;x.style.right='auto';x.style.bottom='auto'}
function setPreviewUi(active){const btn=$('previewRouteBtn'),cancel=$('previewCancelBtn');btn?.classList.toggle('previewing',!!active);if(btn)btn.innerHTML=active?'<i data-lucide="move-3d" width="14"></i>Prévia ativa':'<i data-lucide="move-3d" width="14"></i>Prévia 3D';cancel?.classList.toggle('show',!!active);document.body.classList.toggle('route-previewing',!!active);if(window.lucide)lucide.createIcons();if(active)requestAnimationFrame(syncPreviewCancelPosition)}
function stopRoutePreview(restore=true){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=null;previewing=false;setPreviewUi(false);if(restore&&selectedRoute){followMode=false;drawRoute();if(userLocation)updateUserMarker({...userLocation,accuracy:0,heading:null,speed:0})}}
function previewRoute(){if(!selectedRoute)return;if(previewing){stopRoutePreview(true);return}buildMetrics();if(routeTotalGeometry<8)return;previewing=true;followMode=true;setPreviewUi(true);showToast('Prévia 3D do percurso completo. Toque no X para cancelar.');const start=performance.now(),distanceKm=routeTotalGeometry/1000,duration=Math.max(26000,Math.min(65000,26000+distanceKm*1700)),travel=Math.max(1,routeTotalGeometry-1);previewStartedAt=start;function frame(now){if(!previewing)return;const raw=Math.min(1,(now-start)/duration),t=raw<.5?2*raw*raw:1-Math.pow(-2*raw+2,2)/2,d=Math.min(routeTotalGeometry-1,travel*t),pt=routePointAtDistance(d);if(pt){const p={lon:pt[0],lat:pt[1],accuracy:5,speed:profile==='motorcycle'?9.5:profile==='driving'?10.5:1.2,heading:routeBearingAtDistance(d,30)};updateUserMarker(p);const m=nearestProgress(p);scheduleCamera(p,raw<.015,m)}if(raw<1)previewFrame=requestAnimationFrame(frame);else{previewFrame=null;previewing=false;setPreviewUi(false);followMode=false;drawRoute();if(userLocation)updateUserMarker({...userLocation,accuracy:0,heading:null,speed:0});showToast('Prévia concluída.')}}previewFrame=requestAnimationFrame(frame)}
function nonFatal(label,fn){try{const out=fn();if(out&&typeof out.catch==='function')out.catch(err=>console.warn(`[VANO:${label}]`,err));return out}catch(err){console.warn(`[VANO:${label}]`,err);return null}}
async function activateNavigationAt(p,{simulated=false}={}){
  if(!selectedRoute?.geometry?.coordinates?.length)throw new Error('A rota selecionada não possui geometria válida. Recalcule a rota.');
  hidePermission();haptic(18);userLocation={lat:+p.lat,lon:+p.lon};lastNavPosition={...p};lastGps={...p};gpsDistance=0;navStartedAt=Date.now();followMode=true;resetOffRouteTracker();lastCameraBearing=null;spokenMilestones=new Set();lastSpokenInstruction='';roadAwareness=[];lastNavUiAt=0;lastCameraUpdateAt=0;lastProgressPaintAt=0;
  buildMetrics();navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;navLastCameraZoom=null;navCameraStartUntil=performance.now()+6500;lastNavRoutePaintAt=0;navAlternativeHitKey='';navAlternativeHitCount=0;navSuppressedRouteKeys.clear();navCameraMode=navExperienceMode==='immersive'?'perspective':'top';followMode=true;lastRoutePuckBearing=null;syncNavCameraButton();syncFollowButton();syncImmersiveButton();
  planSheet.classList.remove('sheet-collapsed','sheet-dragging');planSheet.style.transform='';planSheet.classList.add('hidden');document.body.classList.add('body-nav');document.body.classList.remove('nav-map-free');setNavControlDrawer(false);try{map?.dragPan?.enable?.();map?.dragRotate?.enable?.();map?.scrollZoom?.enable?.();map?.doubleClickZoom?.enable?.();map?.touchZoomRotate?.enable?.();map?.touchPitch?.enable?.();map?.keyboard?.enable?.()}catch{}requestAnimationFrame(syncFloatingLocate);activeNav.classList.add('show');requestAnimationFrame(syncNavigationHudGeometry);setTimeout(syncNavigationHudGeometry,360);syncImmersiveButton();setNavigationRouteFocus(true);setNavRouteData();refreshNavigationAlternatives(true);
  nonFatal('marker',()=>updateUserMarker(p));
  const routeSeconds=Math.max(0,+selectedRoute.duration||(+selectedRoute.duration_min||0)*60),m=nearestProgress(p),firstStep=currentStep(m.distanceAlong);
  $('maneuverGlyph').textContent=maneuverGlyph(firstStep);$('nextInstruction').textContent=maneuverLabel(firstStep);$('nextStreet').textContent=stepStreet(firstStep);$('arrivalTime').textContent=fmtClock(new Date(Date.now()+routeSeconds*1000));$('currentSpeed').textContent='— km/h';updateNavSummary(routeSeconds,m.remaining,firstStep);syncSoundButton();
  nonFatal('camera',()=>scheduleCamera(p,true,m));nonFatal('signals',()=>scheduleSignalRefresh(true));
  if(!simulated){nonFatal('flow',()=>pushFlowProbe(p,true));nonFatal('wake-lock',()=>requestWake())}else $('simBadge')?.classList.add('show');
  requestAnimationFrame(()=>nonFatal('map-resize',()=>map?.resize()));
  if(!simulated){persistActiveTrip({force:true,position:p});setTimeout(()=>speak('Navegação iniciada. Siga pela rota indicada.','nav-start'),180)}
}
function beginNavigationGpsWatch(){
  stopPassiveMapTracking();
  stopNavigationGpsHeartbeat();
  if(watchId!==null){try{navigator.geolocation?.clearWatch(watchId)}catch{}watchId=null}
  if(!navigator.geolocation)return;
  try{watchId=navigator.geolocation.watchPosition(updateNavigation,e=>{console.warn('[VANO:GPS watch]',e);if(e?.code===1){showPermission(locationErrorMessage(e));showToast('GPS bloqueado. A rota continua aberta usando a última posição.')}},{enableHighAccuracy:true,maximumAge:0,timeout:8000})}catch(e){console.warn('[VANO:GPS watch start]',e)}
  requestGpsHeartbeat(g=>{if(activeNav.classList.contains('show')&&!adminSimulation)updateNavigation(g)},3500,0);
  startNavigationGpsHeartbeat();
}
async function startTrip(){
  if(starting||cameraChoicePending)return;if(!selectedRoute&&routes.length)chooseByMode();if(!selectedRoute){showToast('Calcule e selecione uma rota primeiro.');return}
  cameraChoicePending=true;const cameraChoice=await chooseNavigationCamera();cameraChoicePending=false;setNavigationExperience(cameraChoice,{recenter:false,announce:false});
  stopStartupGps();stopPassiveMapTracking();if(previewing)stopRoutePreview(false);starting=true;const btn=$('startTripBtn');btn?.classList.add('is-starting');if(btn){btn.disabled=true;btn.innerHTML='<span class="start-trip-icon start-trip-loading-icon"><span class="loading"></span></span><span class="start-trip-copy"><b>Preparando navegação…</b><small>GPS, câmera e trajeto</small></span><span class="start-trip-arrow">…</span>'}showToast('Preparando navegação…');
  try{
    let p=null;const cached=userLocation||readLastGps()||((origin&&Number.isFinite(+origin.lat)&&Number.isFinite(+origin.lon))?origin:null);
    if(cached&&Number.isFinite(+cached.lat)&&Number.isFinite(+cached.lon)){p=filterPosition({lat:+cached.lat,lon:+cached.lon,accuracy:+cached.accuracy||80,heading:Number.isFinite(+cached.heading)?+cached.heading:null,speed:Number.isFinite(+cached.speed)?+cached.speed:null})}
    else if(navigator.geolocation){const g=await requestPosition(),raw=geoRaw(g);updateGpsQuality(raw.accuracy);p=filterPosition(raw)}
    if(!p)throw new Error('Não foi possível determinar uma posição inicial.');
    await activateNavigationAt(p,{simulated:false});beginNavigationGpsWatch();setTimeout(()=>nonFatal('traffic-start',()=>checkLiveTraffic(true)),12000);showToast('Navegação iniciada.');
  }catch(e){console.error('[VANO:startTrip]',e);if(activeNav.classList.contains('show')){showToast('Navegação iniciada. Alguns recursos ainda estão carregando.')}else{const geoCode=Number.isFinite(+e?.code)?+e.code:null;if(geoCode)showPermission(locationErrorMessage(e));showToast(geoCode?locationErrorMessage(e):(e?.message||'Não foi possível iniciar a navegação. Tente recalcular a rota.'))}}
  finally{starting=false;if(btn){btn.disabled=false;btn.classList.remove('is-starting');btn.innerHTML='<span class="start-trip-icon"><i data-lucide="navigation" width="18"></i></span><span class="start-trip-copy"><b>Iniciar navegação</b><small>Rota pronta · toque para começar</small></span><span class="start-trip-arrow">›</span>'}if(window.lucide)lucide.createIcons()}
}
async function startAdminSimulation(){if(!IS_ADMIN)return;if(adminSimulation){stopAdminSimulation();showToast('Simulação encerrada.');return}if(!selectedRoute){showToast('Calcule uma rota antes de simular.');return}try{const r=await fetch('/api/admin/simulation/authorize',{method:'POST',headers:{'X-CSRF-Token':CSRF}}),d=await r.json();if(!r.ok||!d.authorized)throw new Error('Sem autorização para simular.');if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}stopStartupGps();stopPassiveMapTracking();if(previewing)stopRoutePreview(false);buildMetrics();adminSimulation=true;adminSimDistance=0;adminSimLastTs=0;const first=routePointAtDistance(0)||selectedRoute.geometry.coordinates[0],heading=routeBearingAtDistance(0,35);const p={lat:first[1],lon:first[0],accuracy:4,heading,speed:11};smoothedPos={...p};await activateNavigationAt(p,{simulated:true});$('adminSimBtn')?.classList.add('running');if($('adminSimBtn'))$('adminSimBtn').innerHTML='<i data-lucide="square" width="13"></i>Parar simulação';if(window.lucide)lucide.createIcons();adminSimFrame=requestAnimationFrame(stepAdminSimulation)}catch(e){showToast(e.message||'Não foi possível iniciar a simulação.')}}
function stepAdminSimulation(ts){if(!adminSimulation||!selectedRoute)return;if(!adminSimLastTs)adminSimLastTs=ts;const dt=Math.min(.12,Math.max(0,(ts-adminSimLastTs)/1000));adminSimLastTs=ts;const speed=profile==='motorcycle'?10.5:profile==='driving'?11.5:1.8;adminSimDistance=Math.min(routeTotalGeometry,adminSimDistance+speed*dt);if(ts-adminSimLastUiAt>=80){adminSimLastUiAt=ts;const xy=routePointAtDistance(adminSimDistance),heading=routeBearingAtDistance(adminSimDistance,Math.max(18,speed*3));if(xy)updateNavigation({coords:{latitude:xy[1],longitude:xy[0],accuracy:4,heading,speed}},true)}if(adminSimDistance>=routeTotalGeometry-2){showToast('Simulação chegou ao destino.');stopAdminSimulation();return}adminSimFrame=requestAnimationFrame(stepAdminSimulation)}
function stopAdminSimulation(){adminSimulation=false;if(adminSimFrame)cancelAnimationFrame(adminSimFrame);adminSimFrame=null;adminSimLastTs=0;$('simBadge')?.classList.remove('show');$('adminSimBtn')?.classList.remove('running');if($('adminSimBtn'))$('adminSimBtn').innerHTML='<i data-lucide="play" width="14"></i>Simular movimento da rota';if(window.lucide)lucide.createIcons()}
function updateNavigation(g,simulated=false){
  if(!simulated)lastGpsFixAt=Date.now();
  const raw={lat:g.coords.latitude,lon:g.coords.longitude,accuracy:g.coords.accuracy,heading:Number.isFinite(g.coords.heading)?g.coords.heading:null,speed:Number.isFinite(g.coords.speed)?Math.max(0,g.coords.speed):null};
  if(!simulated)saveLastGps(raw);const filtered=simulated?raw:filterPosition(raw),rawMatch=selectedRoute?nearestProgress(raw):null;let p=simulated?raw:stabilizeActiveNavPosition(filtered,raw,rawMatch);updateGpsQuality(raw.accuracy);if(!simulated&&maybeAdoptNavigationAlternative(raw,p)){p=stabilizeActiveNavPosition(filtered,raw,nearestProgress(raw))}userLocation={lat:p.lat,lon:p.lon};lastNavPosition=p;updateUserMarker(p);scheduleTrafficSnapshot(false);
  if(lastGps){const jump=hav([lastGps.lon,lastGps.lat],[p.lon,p.lat]);if(jump<Math.max(120,(raw.accuracy||30)*4))gpsDistance+=jump}lastGps=p;
  const m=nearestProgress(p),elapsed=Math.max(1,(Date.now()-navStartedAt)/1000),avg=gpsDistance/elapsed,step=currentStep(m.distanceAlong),now=performance.now();
  if(navLastAlong<=0)navLastAlong=Math.max(0,m.distanceAlong);else if(m.distanceAlong>navLastAlong+.45)navLastAlong=m.distanceAlong;
  let eta=(selectedRoute.duration||0)*(1-m.progress);if(elapsed>30&&avg>.45)eta=Math.min(eta*1.5,m.remaining/avg);eta=Math.max(0,eta);
  const currentKmh=Number.isFinite(raw.speed)?raw.speed*3.6:(avg>.15?avg*3.6:null);updateFloatingSpeedometer(currentKmh);
  if(now-lastNavUiAt>180){lastNavUiAt=now;$('maneuverGlyph').textContent=maneuverGlyph(step);$('nextInstruction').textContent=m.remaining<22&&m.progress>.92?'Você chegou':maneuverLabel(step);$('nextStreet').textContent=m.remaining<22?'Destino':stepStreet(step);$('arrivalTime').textContent=fmtClock(new Date(Date.now()+eta*1000));$('currentSpeed').textContent=currentKmh!=null?`${Math.round(currentKmh)} km/h`:'— km/h';updateNavSummary(eta,m.remaining,step);}
  if(Math.abs(navLastAlong-navLastPaintAlong)>.45||now-lastNavRoutePaintAt>180){lastNavRoutePaintAt=now;navLastPaintAlong=navLastAlong;setNavRouteData(navLastAlong)}
  refreshNavigationAlternatives(false);updateTrafficRadar(false,m.distanceAlong);
  if(!simulated){const rawOff=Number.isFinite(rawMatch?.offRoute)?rawMatch.offRoute:m.offRoute;const shouldReroute=updateOffRouteTracker(raw,rawOff);if(shouldReroute)rerouteFrom(filtered);pushFlowProbe(p,false);checkLiveTraffic(false);pushLivePosition(p,m,false);maybeSyncPresence(p)}
  if(m.remaining<22&&m.progress>.92){clearSavedActiveTrip();speak('Você chegou ao destino.','arrival')}else{persistActiveTrip({position:p,metrics:m});maybeSpeakStep(step)}
  scheduleCamera(p,false,m);
}
async function finishTrip(redraw=true){clearSavedActiveTrip();stopAdminSimulation();hideTrafficSuggestion();trafficChecking=false;updateFloatingSpeedometer(0);$('trafficRadar')?.classList.remove('show','severe');if(watchId!==null){try{navigator.geolocation.clearWatch(watchId)}catch{}watchId=null}stopNavigationGpsHeartbeat();mapFollowMode=true;lastPassivePosition=lastNavPosition?{...lastNavPosition}:lastPassivePosition;await nonFatal('live-stop',()=>stopLiveShare());setNavControlDrawer(false);document.body.classList.remove('body-nav','nav-alt-visible','nav-map-free','nav-immersive');activeNav.classList.remove('show');$('navAltHint')?.classList.remove('show');toggleVoicePopover(false);try{map?.dragPan?.enable?.();map?.dragRotate?.enable?.();map?.scrollZoom?.enable?.();map?.doubleClickZoom?.enable?.();map?.touchZoomRotate?.enable?.();map?.keyboard?.enable?.()}catch{}navLastAlong=0;navLastPaintAlong=0;navLastRawPosition=null;navLastCameraZoom=null;navCameraStartUntil=0;lastNavRoutePaintAt=0;navAlternativeHitKey='';navAlternativeHitCount=0;navSuppressedRouteKeys.clear();setNavigationRouteFocus(false);applyMapPrefs();planSheet.classList.remove('hidden');requestAnimationFrame(syncFloatingLocate);followMode=true;resetOffRouteTracker();roadAwareness=[];lastCameraBearing=null;lastMarkerHeading=null;lastRoutePuckBearing=null;updateRoadLayer();await nonFatal('wake-release',()=>releaseWake());try{window.speechSynthesis?.cancel()}catch{}if(redraw&&selectedRoute)drawRoute();else map.easeTo({pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0},retainPadding:false,duration:320});setTimeout(startPassiveMapTracking,180)}
async function copyText(value){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return}const ta=document.createElement('textarea');ta.value=value;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('Não foi possível copiar automaticamente.')}
async function shareRoute(){if(!origin||!destination||!selectedRoute){showToast('Calcule uma rota primeiro.');return}const btn=$('shareRouteBtn'),old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="loading"></span>Preparando…';try{const r=await fetch('/api/share-route',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({origin,destination,profile,mode:routeMode,route:selectedRoute})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível criar o link.');await copyText(d.url);showToast('Link copiado');}catch(e){showToast(e.message||'Não foi possível copiar o link.')}finally{btn.disabled=false;btn.innerHTML=old;if(window.lucide)lucide.createIcons()}}
function openQuickAlert(force=null){const sheet=$('quickAlertSheet');if(!sheet)return;const show=force===null?!sheet.classList.contains('show'):!!force;sheet.classList.toggle('show',show);sheet.setAttribute('aria-hidden',String(!show));if(show){$('quickAlertStatus').textContent='';haptic(5)}}
function alertPosition(){const cached=lastNavPosition||userLocation;if(cached&&Number.isFinite(+cached.lat)&&Number.isFinite(+cached.lon))return Promise.resolve({lat:+cached.lat,lon:+cached.lon});return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('GPS indisponível.'));return}navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),()=>reject(new Error('Ative a localização para enviar o alerta.')),{enableHighAccuracy:true,timeout:7000,maximumAge:8000})})}
async function submitQuickAlert(category,button){if(!LOGGED_IN){location.href='/login?next=/';return}const status=$('quickAlertStatus'),buttons=[...document.querySelectorAll('[data-quick-alert]')];buttons.forEach(b=>b.disabled=true);if(status)status.textContent='Obtendo sua localização…';try{const pos=await alertPosition();if(status)status.textContent='Registrando alerta…';const r=await fetch('/api/alerts/quick',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF,'Accept':'application/json'},body:JSON.stringify({category,lat:pos.lat,lon:pos.lon})});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{d={error:r.ok?'Resposta inválida do servidor.':'Não foi possível registrar o alerta.'}}if(!r.ok||d.ok===false)throw new Error(d.error||'Não foi possível registrar o alerta.');if(status)status.textContent=d.duplicate?'Alerta semelhante já estava no mapa':'Alerta registrado';showToast(d.duplicate?'Esse alerta já estava registrado por perto.':'Alerta registrado');await refreshAlerts();setTimeout(()=>openQuickAlert(false),260);haptic(12)}catch(e){const msg=e?.message||'Não foi possível registrar o alerta.';if(status)status.textContent=msg;showToast(msg)}finally{buttons.forEach(b=>b.disabled=false)}}

async function refreshUnreadNotifications(){if(!LOGGED_IN)return;try{const r=await fetch('/api/notifications/unread'),d=await r.json(),b=$('notifCount');if(!b||!r.ok)return;const n=+d.unread||0;b.hidden=n<1;b.textContent=n>99?'99+':String(n)}catch{}}
function setSearchInteraction(active){clearTimeout(searchInteractionTimer);searchInteractionActive=!!active;document.body.classList.toggle('vano-search-interacting',searchInteractionActive);if(searchInteractionActive){try{map?.stop?.()}catch{}if(cameraFrame){cancelAnimationFrame(cameraFrame);cameraFrame=null}stopPuckAnimation();return}searchInteractionTimer=setTimeout(()=>{if(puckTargetPos){puckDisplayPos=puckDisplayPos||{...puckTargetPos};updateUserMarker(puckTargetPos)}try{map?.resize?.()}catch{}},140)}
function initVoiceAddressSearch(){const btn=$('voiceSearchBtn');if(!btn)return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){btn.hidden=true;return}let rec=null,listening=false;const stopUi=()=>{listening=false;btn.classList.remove('listening');btn.setAttribute('aria-pressed','false')};btn.addEventListener('click',()=>{if(listening){try{rec?.stop()}catch{}return}try{rec=new SR();rec.lang=BOOT.locale||'pt-BR';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;rec.onstart=()=>{listening=true;btn.classList.add('listening');btn.setAttribute('aria-pressed','true');showToast('Pode falar o destino.');};rec.onresult=e=>{const text=String(e.results?.[0]?.[0]?.transcript||'').trim();if(!text)return;destinationInput.value=text;destinationInput.dispatchEvent(new Event('input',{bubbles:true}));clearTimeout(searchTimer);if(text.length>=3)searchPlaces(text,'destination');};rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed')showToast('Permita o uso do microfone para pesquisar por voz.');else if(e.error!=='aborted'&&e.error!=='no-speech')showToast('Não consegui entender. Tente novamente.');};rec.onend=stopUi;rec.start()}catch(e){stopUi();showToast('Pesquisa por voz indisponível neste navegador.')}})}
initVoiceAddressSearch();
refreshUnreadNotifications();setTimeout(refreshUnreadNotifications,1800);document.body.dataset.mood=(moodFromConditions(window.__sparkWeatherState||null)==='night'?'night':'day');updateWeatherPill(window.__sparkWeatherState||null);updateFloatingSpeedometer(0);
[originInput,destinationInput].forEach(inp=>{
  const kind=inp===originInput?'origin':'destination';
  inp.addEventListener('compositionstart',()=>{searchComposing=true;setSearchInteraction(true)});
  inp.addEventListener('compositionend',()=>{searchComposing=false;queueSearch(inp,kind)});
  inp.addEventListener('input',()=>{setSearchInteraction(true);if(!searchComposing)queueSearch(inp,kind)});
  inp.addEventListener('focus',()=>{activeSearchKind=kind;setSearchInteraction(true);if(inp.value.trim().length>=SEARCH_FAST_MIN&&!searchComposing)queueSearch(inp,kind);else hideResults()});
  inp.addEventListener('blur',()=>{clearTimeout(searchInteractionTimer);searchInteractionTimer=setTimeout(()=>{const a=document.activeElement;if(a!==originInput&&a!==destinationInput)setSearchInteraction(false)},140)});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);clearTimeout(searchRefineTimer);const q=inp.value.trim();if(q.length>=SEARCH_FAST_MIN&&!searchComposing)searchPlaces(q,kind)}});
});
document.addEventListener('click',e=>{if(!e.target.closest('.search-card'))hideResults()});document.addEventListener('click',e=>{if(document.body.classList.contains('body-nav')&&$('navControlStack')?.classList.contains('drawer-open')&&!e.target.closest('#navControlStack'))setNavControlDrawer(false)});results.addEventListener('click',e=>{if(e.target.closest('.search-item')){destinationInput?.blur?.();originInput?.blur?.();}});
bindClick('locateBtn',()=>locateUser(true));bindClick('quickCurrent',()=>locateUser(true));bindClick('quickHome',()=>useSavedPlace(HOME_LABEL));bindClick('quickWork',()=>useSavedPlace(WORK_LABEL));bindClick('quickHomeTop',()=>useSavedPlace(HOME_LABEL));bindClick('quickWorkTop',()=>useSavedPlace(WORK_LABEL));bindClick('optionsBtn',()=>openAccountDrawer(null));document.querySelectorAll('[data-nearby-query]').forEach(btn=>btn.addEventListener('click',()=>{const q=btn.dataset.nearbyQuery||btn.textContent.trim();planSheet.classList.remove('sheet-collapsed');destinationInput.value=q;activeSearchKind='destination';searchPlaces(q,'destination');destinationInput.focus({preventScroll:true});haptic(6)}));bindClick('accountBackdrop',()=>openAccountDrawer(false));bindClick('focusModeBtn',()=>toggleNavigationCamera());bindClick('enableLocationBtn',()=>locateUser(!origin));bindClick('recenterBtn',()=>{mapFollowMode=true;startPassiveMapTracking();setNavigationFollow(true,false);$('navRecenter')?.classList.add('active');if(lastNavPosition&&activeNav?.classList.contains('show'))scheduleCamera(lastNavPosition,true);else if(userLocation)map.easeTo({center:[userLocation.lon,userLocation.lat],zoom:16.25,duration:220,essential:true});else locateUser(true)});bindClick('swapBtn',()=>{});document.addEventListener('keydown',e=>{if(e.key==='Escape'){openAccountDrawer(false);toggleVoicePopover(false);openQuickAlert(false);setNavControlDrawer(false)}});
document.querySelectorAll('[data-route-mode]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');routeMode=btn.dataset.routeMode==='fastest'?'fastest':'safest';learnRouteChoice(routeMode);manualRouteSelection=false;const hasBadge=routes.some(r=>r.badges?.includes(routeMode==='fastest'?'fastest':'safest')),fastEngine=routes.some(r=>r.fast_eta_only);if(destinationConfirmed&&origin&&destination){if(routeMode!=='fastest'&&hasBadge&&!fastEngine){chooseByMode();renderRoute()}else if(routeMode==='fastest'&&fastEngine&&hasBadge){chooseByMode();renderRoute()}else calculateRoutes(true)}else if(routes.length){chooseByMode();renderRoute()}});document.querySelectorAll('[data-profile]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-profile]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');profile=btn.dataset.profile;if(isMotorizedProfile()&&destinationConfirmed&&origin&&destination)showRouteLoading(profile==='motorcycle'?'Calculando rota de moto…':'Calculando rota de carro…',profile==='motorcycle'?'Analisando trânsito, pavimento e micro-rotas com cálculo motorizado.':'Lendo trânsito e procurando o menor ETA.');if(routeMode==='smart'){routeMode='safest';document.querySelectorAll('[data-route-mode]').forEach(x=>x.classList.toggle('active',x.dataset.routeMode==='safest'))}renderParkingNearby();if(profile==='driving')loadParkingNearby(false);if(destinationConfirmed&&origin&&destination)calculateRoutes()});
const voiceSelect=$('voiceSelect'),navVoiceSelect=$('navVoiceSelect');voiceSelect?.addEventListener('change',()=>saveInstructionVoice(voiceSelect.value));navVoiceSelect?.addEventListener('change',()=>saveInstructionVoice(navVoiceSelect.value));bindClick('voicePreviewBtn',()=>{const oldKey=lastSpokenInstruction,oldSound=soundEnabled;lastSpokenInstruction='';soundEnabled=true;speak('Olá. Esta é a voz escolhida para suas instruções de navegação.','voice-preview-'+Date.now());soundEnabled=oldSound;lastSpokenInstruction=oldKey;});if('speechSynthesis'in window){window.speechSynthesis.onvoiceschanged=()=>populateVoiceSelectors();setTimeout(populateVoiceSelectors,180)}const soundButton=$('soundBtn');if(soundButton){const openVoice=()=>{clearTimeout(navVoiceHoldTimer);navVoiceHoldOpened=true;toggleVoicePopover(true);haptic(8)};soundButton.addEventListener('pointerdown',()=>{navVoiceHoldOpened=false;clearTimeout(navVoiceHoldTimer);navVoiceHoldTimer=setTimeout(openVoice,520)});['pointerup','pointercancel','pointerleave'].forEach(ev=>soundButton.addEventListener(ev,()=>clearTimeout(navVoiceHoldTimer)));soundButton.addEventListener('contextmenu',e=>{e.preventDefault();navVoiceHoldOpened=true;toggleVoicePopover(true)})}
bindClick('prefsBtn',()=>openPrefsDrawer(null));bindClick('prefsCloseBtn',()=>openPrefsDrawer(false));bindPref('prefAdaptive','adaptiveRoutes',true);bindPref('prefAggressive','aggressiveShortcuts',true);bindPref('prefAlternatives','showAlternatives',false);bindPref('prefLiveSignals','liveSignals',false);bindPref('prefAutoFaster','autoFaster',false);syncPrefsUI();

const plannerHeadingLabel=document.querySelector('.planner-heading-copy b');if(plannerHeadingLabel)plannerHeadingLabel.textContent='Pra onde você vai?';if(destinationInput)destinationInput.setAttribute('placeholder','Pra onde você vai?');
bindClick('chooseNormalCamera',()=>resolveNavigationCameraChoice('normal'));bindClick('chooseImmersiveCamera',()=>resolveNavigationCameraChoice('immersive'));bindClick('navImmersiveToggle',navDrawerAction(toggleImmersiveCamera));bindClick('navDrawerToggle',toggleNavControlDrawer);bindClick('navDrawerOptions',navDrawerAction(()=>openAccountDrawer(true)));bindClick('navDrawerAlert',navDrawerAction(()=>openQuickAlert(true)));bindClick('navDrawerSupport',navDrawerAction(()=>openSafetyDrawer(true)));bindClick('navDrawerRecenter',navDrawerAction(calibrateNavigation));
bindClick('continueResumeTrip',continueSavedTrip);bindClick('discardResumeTrip',discardSavedTrip);bindClick('confirmDestinationBtn',confirmDestination);bindClick('editDestinationBtn',editDestination);bindClick('previewRouteBtn',previewRoute);bindClick('previewCancelBtn',()=>stopRoutePreview(true));bindClick('cameraModeBtn',toggleNavigationCamera);bindClick('navCameraToggle',toggleNavigationCamera);bindClick('navAltAccept',acceptNavigationAlternative);bindClick('navAltDismiss',dismissNavigationAlternative);bindClick('navSearchBtn',returnToDestinationSearch);syncNavCameraButton();syncFollowButton();syncImmersiveButton();syncSoundButton();populateVoiceSelectors();bindClick('quickAlertBtn',()=>openQuickAlert(null));bindClick('quickAlertCloseBtn',()=>openQuickAlert(false));bindClick('quickAlertBackdrop',()=>openQuickAlert(false));document.querySelectorAll('[data-quick-alert]').forEach(btn=>btn.addEventListener('click',()=>submitQuickAlert(btn.dataset.quickAlert,btn)));bindClick('safetyToolsBtn',()=>openSafetyDrawer(null));bindClick('safetyCloseBtn',()=>openSafetyDrawer(false));bindClick('safetyLiveBtn',toggleLiveShare);bindClick('supportPointsBtn',loadSupportPoints);bindClick('emergencyShareBtn',()=>shareSafetyMessage('sos'));bindClick('checkinBtn',()=>shareSafetyMessage('checkin'));bindClick('liveShareBtn',toggleLiveShare);bindClick('acceptTrafficRoute',applyTrafficSuggestion);bindClick('dismissTrafficRoute',()=>{trafficDismissUntil=Date.now()+120000;hideTrafficSuggestion();showToast('Mantendo a rota atual.')});bindClick('navRecenter',()=>{setNavigationFollow(true,false);$('navRecenter')?.classList.add('active');if(lastNavPosition)scheduleCamera(lastNavPosition,true)});bindClick('soundBtn',()=>{if(navVoiceHoldOpened){navVoiceHoldOpened=false;return}soundEnabled=!soundEnabled;try{if(!soundEnabled)window.speechSynthesis?.cancel()}catch{}toggleVoicePopover(false);syncSoundButton();showToast(soundEnabled?'Orientações por voz ativadas.':'Orientações por voz desativadas.')});bindClick('shareRouteBtn',shareRoute);bindClick('showAlertsBtn',()=>{if(!selectedRoute)return;const n=selectedRoute.nearby_alerts?.length||0;showToast(n?`${n} alerta(s) comunitário(s) próximo(s) desta rota.`:'Nenhum alerta recente próximo desta rota.')});

function plannerCollapsedHeight(){if(!planSheet)return 190;const raw=parseFloat(getComputedStyle(planSheet).getPropertyValue('--planner-collapsed-h'));return Number.isFinite(raw)?raw:190}
function syncFloatingLocate(){
  const b=$('recenterBtn'),speedo=$('floatingSpeedo'),app=$('wsApp');if(!b||!app)return;
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
  const app=$('wsApp'),street=$('navStreetChip'),controls=$('navControlStack'),speedo=$('floatingSpeedo');
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
  const grab=$('planGrab');if(!grab||!planSheet)return;
  let active=false,startY=0,lastY=0,lastT=0,moved=false,startedCollapsed=true,suppressClick=false;
  const clearPreview=()=>planSheet.style.removeProperty('--planner-drag-y');
  const settle=collapse=>{
    planSheet.classList.remove('sheet-dragging');
    clearPreview();
    planSheet.classList.toggle('sheet-collapsed',!!collapse);
    grab.setAttribute('aria-expanded',String(!collapse));grab.setAttribute('aria-label',collapse?'Abrir painel de destino':'Recolher painel de destino');
    requestAnimationFrame(()=>{syncFloatingLocate();syncSearchResultsPlacement()});
  };
  const range=()=>Math.max(80,Math.min(window.innerHeight*.58,planSheet.getBoundingClientRect().height-plannerCollapsedHeight()));
  grab.addEventListener('pointerdown',e=>{
    if(planSheet.classList.contains('hidden'))return;
    active=true;moved=false;suppressClick=false;startY=lastY=e.clientY;lastT=performance.now();
    startedCollapsed=planSheet.classList.contains('sheet-collapsed');
    planSheet.classList.add('sheet-dragging');
    planSheet.style.setProperty('--planner-drag-y','0px');
    grab.setPointerCapture?.(e.pointerId);
  });
  grab.addEventListener('pointermove',e=>{
    if(!active)return;
    const dy=e.clientY-startY,limit=range();
    if(Math.abs(dy)>9)moved=true;
    let preview=dy;
    if(startedCollapsed)preview=Math.max(-limit,Math.min(26,dy));
    else preview=Math.max(-20,Math.min(limit,dy));
    if((startedCollapsed&&preview>0)||(!startedCollapsed&&preview<0))preview*=.28;
    planSheet.style.setProperty('--planner-drag-y',`${preview.toFixed(1)}px`);
    const now=performance.now();if(now-lastT>24){lastY=e.clientY;lastT=now}
    requestAnimationFrame(syncFloatingLocate);
  });
  const end=e=>{
    if(!active)return;active=false;
    const dy=e.clientY-startY,dt=Math.max(16,performance.now()-lastT),velocity=(e.clientY-lastY)/dt;
    if(!moved||Math.abs(dy)<16){
      suppressClick=true;
      settle(!startedCollapsed);
      setTimeout(()=>{suppressClick=false},100);
      return
    }
    suppressClick=true;
    const threshold=Math.max(34,Math.min(88,range()*.18));
    let collapse=startedCollapsed;
    if(dy<=-threshold||velocity<-.55)collapse=false;
    else if(dy>=threshold||velocity>.55)collapse=true;
    settle(collapse);
    setTimeout(()=>{suppressClick=false},80);
  };
  grab.addEventListener('pointerup',end);
  grab.addEventListener('pointercancel',e=>{if(active)end(e)});
  grab.addEventListener('click',()=>{if(suppressClick)return;settle(!planSheet.classList.contains('sheet-collapsed'))});
  grab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();settle(!planSheet.classList.contains('sheet-collapsed'))}});
  grab.setAttribute('aria-expanded',String(!planSheet.classList.contains('sheet-collapsed')));grab.setAttribute('aria-label',planSheet.classList.contains('sheet-collapsed')?'Abrir painel de destino':'Recolher painel de destino');
}
bindPlanningSheetDrag();bindAccountDrawerDrag();if(window.ResizeObserver&&planSheet){new ResizeObserver(()=>requestAnimationFrame(()=>{syncFloatingLocate();syncSearchResultsPlacement()})).observe(planSheet)}if(window.ResizeObserver&&activeNav){new ResizeObserver(()=>requestAnimationFrame(syncNavigationHudGeometry)).observe(activeNav)}activeNav?.addEventListener('transitionend',()=>requestAnimationFrame(syncNavigationHudGeometry));planSheet?.addEventListener('scroll',()=>requestAnimationFrame(syncSearchResultsPlacement),{passive:true});requestAnimationFrame(syncFloatingLocate);window.addEventListener('resize',()=>{syncFloatingLocate();syncSearchResultsPlacement()},{passive:true});
let vanoViewportTimer=null;
function refreshResponsiveViewport(){
  clearTimeout(vanoViewportTimer);
  const vv=window.visualViewport;document.documentElement.style.setProperty('--vano-vh',`${Math.round(vv?.height||window.innerHeight)}px`);document.documentElement.style.setProperty('--vano-vw',`${Math.round(vv?.width||window.innerWidth)}px`);
  vanoViewportTimer=setTimeout(()=>requestAnimationFrame(()=>{
    try{map?.resize?.()}catch{}
    try{syncFloatingLocate()}catch{}
    try{syncNavigationHudGeometry()}catch{}
    if(activeNav?.classList.contains('show')&&lastNavPosition&&followMode)scheduleCamera(lastNavPosition,true);
  }),90);
}
refreshResponsiveViewport();window.addEventListener('orientationchange',refreshResponsiveViewport,{passive:true});
window.visualViewport?.addEventListener('resize',refreshResponsiveViewport,{passive:true});
if(navigator.permissions?.query)navigator.permissions.query({name:'geolocation'}).then(s=>{if(s.state==='denied')showPermission(locationErrorMessage({code:1}));s.onchange=()=>s.state==='denied'?showPermission(locationErrorMessage({code:1})):s.state==='granted'&&hidePermission()}).catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){persistActiveTrip({force:true,position:lastNavPosition||userLocation});return}hardRefreshMapViewport();if(activeNav.classList.contains('show')){if(!adminSimulation)beginNavigationGpsWatch();if(!wakeLock)requestWake()}else startPassiveMapTracking()});
window.addEventListener('pageshow',e=>{hardRefreshMapViewport();if(e.persisted){if(activeNav.classList.contains('show')&&!adminSimulation)beginNavigationGpsWatch();else startPassiveMapTracking()}});window.addEventListener('focus',()=>hardRefreshMapViewport(),{passive:true});window.addEventListener('orientationchange',()=>setTimeout(hardRefreshMapViewport,80),{passive:true});
window.addEventListener('pagehide',()=>{stopPuckAnimation();persistActiveTrip({force:true,position:lastNavPosition||userLocation})});window.addEventListener('beforeunload',()=>{stopPuckAnimation();persistActiveTrip({force:true,position:lastNavPosition||userLocation});if(watchId!==null)navigator.geolocation.clearWatch(watchId);stopNavigationGpsHeartbeat();stopPassiveMapTracking();stopStartupGps();clearInterval(signalPulseTimer);weatherController?.abort()});if(window.lucide)lucide.createIcons();
})();
