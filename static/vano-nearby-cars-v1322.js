/* Readable VANO source; runtime eval/encoded wrapper removed. */
/* VANO MAPS V252 — ambient traffic intelligence.
   Client-side visual ambience only: cars follow real road geometry, adapt speed
   to curves and simulated traffic, brake progressively and preserve continuity
   across short reloads. No nearby-user/presence API is used here. */
(()=>{
  'use strict';

  const BOOT=window.VANO_BOOT||{};
  const TOKEN=String(BOOT.token||'');
  const ICONS=[
    '/static/icons/vano/nearby-car-graphite-v161.png?v=161',
    '/static/icons/vano/nearby-car-silver-v161.png?v=161',
    '/static/icons/vano/nearby-car-midnight-v161.png?v=161'
  ];
  const MAX_CAR_COUNT=5;
  const BOOT_DEADLINE_MS=60000;
  const SESSION_MAX_MS=180000;
  const USER_ESCAPE_M=2400;
  const CAR_ESCAPE_M=3200;
  const CREATED_AT=performance.now();
  const REDUCED_MOTION=!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const SAVE_DATA=!!navigator.connection?.saveData;
  const LOW_MEMORY=Number(navigator.deviceMemory||8)<=4;
  const LOW_CPU=Number(navigator.hardwareConcurrency||8)<=4;

  const CACHE_KEY='vano:ambient-cars:v252';
  const CACHE_VERSION=252;
  const CACHE_TTL_MS=180000;
  const CACHE_MAX_USER_SHIFT_M=850;
  const CACHE_CONTINUE_MAX_MS=9000;
  const CACHE_SAVE_EVERY_MS=5000;
  const MAX_REPLACEMENT_ROUTES=6;

  let starting=false,started=false,stopped=false,navSuppressed=false,generation=0,raf=0,lastPaint=0,anchor=null,startupPoll=0,lastCacheSave=0;
  let replenishing=false,replacementRoutes=0,nextReplenishAt=0;
  const cars=[];

  const bridge=()=>window.__VANO_MAP_BRIDGE||null;
  const currentMap=()=>{try{return bridge()?.getMap?.()||null}catch{return null}};
  const currentUser=()=>{try{return bridge()?.getUserLocation?.()||null}catch{return null}};
  const navigationActive=()=>document.body.classList.contains('body-nav') || !!document.getElementById('activeNav')?.classList.contains('show');
  const isPlanning=()=>{
    if(navigationActive())return true;
    try{if(bridge()?.isPlanning?.())return true}catch{}
    return !!document.getElementById('destinationConfirm')?.classList.contains('show') ||
           document.getElementById('routeState')?.style?.display==='block';
  };
  const performanceTier=()=>{try{return bridge()?.getPerformanceTier?.()||'normal'}catch{return 'normal'}};
  const desiredCarCount=()=>REDUCED_MOTION||SAVE_DATA?0:(LOW_MEMORY||LOW_CPU)?1:performanceTier()==='eco'?1:performanceTier()==='normal'?3:MAX_CAR_COUNT;
  const paintGap=()=>performanceTier()==='high'?34:60;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const jitter=n=>(Math.random()*2-1)*n;

  const hav=(a,b)=>{
    const R=6371000,r=Math.PI/180,dLat=(b[1]-a[1])*r,dLon=(b[0]-a[0])*r;
    const x=Math.sin(dLat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(x));
  };
  const roadBearing=(a,b)=>{
    const r=Math.PI/180,p1=a[1]*r,p2=b[1]*r,dl=(b[0]-a[0])*r;
    const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return (Math.atan2(y,x)/r+360)%360;
  };
  const angleDelta=(a,b)=>((b-a+540)%360)-180;
  const smoothAngle=(current,target,amount)=>(current+angleDelta(current,target)*clamp(amount,0,1)+360)%360;
  const projectPoint=(p,meters,deg)=>{
    const R=6371000,r=Math.PI/180,d=meters/R,br=deg*r,p1=p.lat*r,l1=p.lon*r;
    const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(br));
    const l2=l1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
    return {lat:p2/r,lon:((l2/r+540)%360)-180};
  };

  function routeMetrics(coords,traffic=[]){
    const cum=[0];for(let i=1;i<coords.length;i++)cum[i]=cum[i-1]+hav(coords[i-1],coords[i]);
    return {coords,cum,total:cum.at(-1)||0,traffic:Array.isArray(traffic)?traffic:[]};
  }
  function routeSegmentIndex(route,distance){
    const d=clamp(distance,0,route.total);let lo=0,hi=route.cum.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(route.cum[mid]<d)lo=mid+1;else hi=mid}
    return Math.max(0,Math.min(route.coords.length-2,Math.max(1,lo)-1));
  }
  function trafficFactorAt(route,distance){
    const idx=routeSegmentIndex(route,distance),level=Number(route.traffic?.[idx]);
    if(!Number.isFinite(level))return .92+.08*Math.sin((distance+idx*19)/180);
    return clamp(1-(clamp(level,0,100)*.0068),.30,1.02);
  }
  function routePoint(route,distance){
    const d=clamp(distance,0,route.total);let lo=0,hi=route.cum.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(route.cum[mid]<d)lo=mid+1;else hi=mid;}
    const i=Math.max(1,lo),a=route.coords[i-1],b=route.coords[i],d0=route.cum[i-1]||0,d1=route.cum[i]||d0+1,t=(d-d0)/Math.max(1,d1-d0);
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  }
  function curvatureDegrees(route,distance,speed){
    const near=routePoint(route,distance),p1=routePoint(route,Math.min(route.total,distance+Math.max(10,speed*1.2))),p2=routePoint(route,Math.min(route.total,distance+Math.max(32,speed*3.6)));
    return Math.abs(angleDelta(roadBearing(near,p1),roadBearing(p1,p2)));
  }
  function curveSpeedLimit(curve,cruise){
    if(curve>78)return Math.min(cruise,3.8);
    if(curve>52)return Math.min(cruise,5.1);
    if(curve>30)return Math.min(cruise,6.6);
    if(curve>17)return Math.min(cruise,8.4);
    return cruise;
  }

  function clearSavedState(){try{localStorage.removeItem(CACHE_KEY)}catch{}}
  function saveState(force=false){
    if(!anchor||!cars.length||isPlanning())return;const now=Date.now();if(!force&&now-lastCacheSave<CACHE_SAVE_EVERY_MS)return;
    const live=cars.filter(c=>!c.dead&&c.route?.coords?.length>1&&c.distance<c.route.total-4&&now<c.expiresAt);
    if(!live.length){clearSavedState();return}
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({v:CACHE_VERSION,savedAt:now,anchor:{lat:+anchor.lat,lon:+anchor.lon},cars:live.slice(0,MAX_CAR_COUNT).map(c=>({route:c.route.coords.map(p=>[+p[0].toFixed(6),+p[1].toFixed(6)]),traffic:(c.route.traffic||[]).slice(0,Math.max(0,c.route.coords.length-1)),distance:+c.distance.toFixed(2),speed:+c.speed.toFixed(3),cruise:+c.cruise.toFixed(3),expiresAt:+c.expiresAt,signalDistance:+c.signalDistance.toFixed(2),signalDone:!!c.signalDone,phase:+c.phase.toFixed(1)}))}));lastCacheSave=now}catch{}
  }
  function readSavedState(user){
    let raw=null;try{raw=localStorage.getItem(CACHE_KEY)}catch{return null}if(!raw)return null;
    try{const state=JSON.parse(raw),now=Date.now();if(state?.v!==CACHE_VERSION||!state.anchor||!Array.isArray(state.cars)||!state.cars.length)throw 0;if(!Number.isFinite(+state.savedAt)||now-(+state.savedAt)>CACHE_TTL_MS||now-(+state.savedAt)<-5000)throw 0;if(hav([+state.anchor.lon,+state.anchor.lat],[+user.lon,+user.lat])>CACHE_MAX_USER_SHIFT_M)throw 0;return state}catch{clearSavedState();return null}
  }


async function buildRoadRoute(center,index,signal,attempt=0){
  const sector=(360/MAX_CAR_COUNT)*index+8+jitter(22),start=projectPoint(center,75+Math.random()*270,sector);
  const turn1=sector+(Math.random()<.5?-1:1)*(36+Math.random()*68),via=projectPoint(start,260+Math.random()*430,turn1);
  const turn2=turn1+(Math.random()<.5?-1:1)*(28+Math.random()*72),end=projectPoint(via,470+Math.random()*820,turn2);
  const coords=[start,via,end].map(p=>`${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const url=`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?alternatives=false&continue_straight=false&geometries=geojson&overview=full&steps=false&annotations=congestion_numeric&access_token=${encodeURIComponent(TOKEN)}`;
  const res=await fetch(url,{signal,headers:{Accept:'application/json'}});if(!res.ok)throw new Error(`directions-${res.status}`);
  const data=await res.json(),routeData=data?.routes?.[0],road=routeData?.geometry?.coordinates;if(!Array.isArray(road)||road.length<4)throw new Error('route-empty');
  const traffic=(routeData?.legs||[]).flatMap(leg=>Array.isArray(leg?.annotation?.congestion_numeric)?leg.annotation.congestion_numeric:[]);
  const route=routeMetrics(road,traffic);if((route.total<420||route.total>5000)&&attempt<1)return buildRoadRoute(center,index,signal,attempt+1);if(route.total<300)throw new Error('route-too-short');return route;
}


function createDestinationMarker(map,route,index){
  const end=routePoint(route,Math.max(0,route.total-1)),el=document.createElement('div');
  el.className='vano-ambient-destination';el.setAttribute('aria-hidden','true');
  el.style.cssText='width:15px;height:15px;pointer-events:none;opacity:.56;z-index:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.16));transition:opacity .25s ease;';
  el.innerHTML=`<span style="display:block;width:13px;height:13px;border-radius:50%;background:rgba(255,255,255,.94);border:2px solid #F59A62;box-sizing:border-box;position:relative"><span style="position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:#D9703F;transform:translate(-50%,-50%)"></span></span>`;
  const marker=new mapboxgl.Marker({element:el,anchor:'center',rotationAlignment:'viewport',pitchAlignment:'viewport'}).setLngLat(end).addTo(map);
  return {marker,el,end,index};
}
function followSpeedLimit(car){
  if(!car.pos)return Infinity;let bestGap=Infinity,leadSpeed=Infinity;
  for(const other of cars){
    if(other===car||other.dead||!other.pos)continue;const gap=hav(car.pos,other.pos);if(gap>58||gap>=bestGap)continue;
    const toLead=roadBearing(car.pos,other.pos);if(Math.abs(angleDelta(car.bearing,toLead))>31||Math.abs(angleDelta(car.bearing,other.bearing))>38)continue;
    bestGap=gap;leadSpeed=other.speed;
  }
  if(!Number.isFinite(bestGap))return Infinity;
  const safe=6.5+car.speed*1.25;
  if(bestGap<5.5)return 0;
  if(bestGap<safe)return Math.max(0,leadSpeed*(bestGap-4)/Math.max(1,safe-4));
  if(bestGap<safe+15)return Math.max(1.5,leadSpeed+((bestGap-safe)/15)*2.2);
  return Infinity;
}

  function createMarker(map,route,index,restored=null){
    const el=document.createElement('div');el.className='vano-ambient-car';el.setAttribute('aria-hidden','true');el.style.cssText='width:23px;height:36px;pointer-events:none;opacity:0;transition:opacity .28s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.24));will-change:transform,opacity;z-index:2;transform:translateZ(0);';
    const img=document.createElement('img');img.src=ICONS[index%ICONS.length];img.alt='';img.draggable=false;img.decoding='async';img.style.cssText='display:block;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;opacity:.94;';el.appendChild(img);
    const now=Date.now();let initial,speed,cruise,expiresAt,signalDistance,signalDone=false,phase=Math.random()*10000;
    if(restored){const elapsed=clamp(now-(+restored.savedAt||now),0,CACHE_CONTINUE_MAX_MS)/1000;speed=clamp(+restored.speed||7,0,15);cruise=clamp(+restored.cruise||9,6.2,13.4);initial=Math.max(0,(+restored.distance||0)+(speed*elapsed*.72));expiresAt=Math.max(now+6000,+restored.expiresAt||now+45000);signalDistance=clamp(+restored.signalDistance||route.total*.66,80,Math.max(81,route.total-80));signalDone=!!restored.signalDone;phase=Number.isFinite(+restored.phase)?+restored.phase:phase}
    else{initial=Math.min(route.total*.16,12+Math.random()*Math.max(45,route.total*.10));cruise=7.2+Math.random()*5.4;speed=Math.max(3.6,cruise*(.66+Math.random()*.26));expiresAt=now+100000+Math.random()*72000+index*1600;signalDistance=route.total*(.42+Math.random()*.38)}
    if(initial>=route.total-4||expiresAt<=now)return null;
    const p=routePoint(route,initial),ahead=routePoint(route,Math.min(route.total,initial+18)),bearing=roadBearing(p,ahead);
    const marker=new mapboxgl.Marker({element:el,anchor:'center',rotationAlignment:'map',pitchAlignment:'map'}).setLngLat(p).setRotation(bearing).addTo(map);
    const destination=createDestinationMarker(map,route,index),car={marker,el,destinationMarker:destination.marker,destinationEl:destination.el,route,distance:initial,speed,cruise,expiresAt,lastTs:0,dead:false,bearing,phase,signalDistance,signalDone,stopHoldUntil:0,noiseTarget:0,noise:0,nextNoiseAt:0,braking:false,pos:p,accel:1.15+Math.random()*.85,brake:2.8+Math.random()*1.5,trafficFactor:1};cars.push(car);requestAnimationFrame(()=>{if(!car.dead)el.style.opacity='.92'});return car;
  }

  function restoreCars(map,user){
    const state=readSavedState(user);if(!state)return false;const now=Date.now();anchor={lat:+state.anchor.lat,lon:+state.anchor.lon};
    for(let i=0;i<state.cars.length&&cars.filter(c=>!c.dead).length<desiredCarCount();i++){const saved=state.cars[i];if(!Array.isArray(saved?.route)||saved.route.length<2||(+saved.expiresAt||0)<=now)continue;const coords=saved.route.filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(p=>[+p[0],+p[1]]);if(coords.length<2)continue;const route=routeMetrics(coords,saved.traffic||[]);if(route.total<80)continue;createMarker(map,route,i,{...saved,savedAt:+state.savedAt})}
    if(!cars.filter(c=>!c.dead).length){clearSavedState();return false}saveState(true);return true;
  }

  function removeCar(car,animated=true){if(!car||car.dead)return;car.dead=true;const finish=()=>{try{car.marker.remove()}catch{}try{car.destinationMarker?.remove?.()}catch{}};if(animated){car.el.style.opacity='0';if(car.destinationEl)car.destinationEl.style.opacity='0';setTimeout(finish,320)}else finish()}
  function stopAll(animated=true,{clearCache=true}={}){if(stopped)return;stopped=true;generation++;if(clearCache)clearSavedState();else saveState(true);if(startupPoll){clearInterval(startupPoll);startupPoll=0}if(raf){cancelAnimationFrame(raf);raf=0}cars.forEach(c=>removeCar(c,animated));cars.length=0}

  function clearForNavigation(animated=true){
    if(navSuppressed&&cars.length===0&&!started)return;
    navSuppressed=true;generation++;clearSavedState();
    if(raf){cancelAnimationFrame(raf);raf=0}
    cars.forEach(c=>removeCar(c,animated));cars.length=0;started=false;starting=false;anchor=null;replenishing=false;replacementRoutes=0;nextReplenishAt=0;
  }
  function syncNavigationSuppression(){
    if(stopped)return;
    if(navigationActive()){clearForNavigation(true);return}
    if(navSuppressed){navSuppressed=false;setTimeout(()=>{if(!stopped&&!navigationActive())start()},320)}
  }


function targetSpeed(car,now){
  const curve=curvatureDegrees(car.route,car.distance,Math.max(2,car.speed));let target=curveSpeedLimit(curve,car.cruise);
  car.trafficFactor=trafficFactorAt(car.route,car.distance);target*=car.trafficFactor;
  if(now>=car.nextNoiseAt){car.noiseTarget=jitter(.62);car.nextNoiseAt=now+1100+Math.random()*2400}
  car.noise+=(car.noiseTarget-car.noise)*.05;target+=car.noise;
  const wave=.94+.06*Math.sin((now+car.phase)/1650);target*=wave;
  const follow=followSpeedLimit(car);if(Number.isFinite(follow)&&follow<target){target=follow;car.braking=true}
  if(!car.signalDone){const remain=car.signalDistance-car.distance;if(remain<34&&remain>0){target=Math.min(target,Math.max(.25,(remain/34)*car.cruise*.78));car.braking=true}else if(remain<=1.2){if(!car.stopHoldUntil)car.stopHoldUntil=now+1400+Math.random()*2600;if(now<car.stopHoldUntil){target=0;car.braking=true}else{car.signalDone=true;car.braking=false;target=Math.max(3.1,target)}}}
  if(car.trafficFactor<.48&&car.speed>target+.6)car.braking=true;
  return clamp(target,0,car.cruise+1.0);
}

  async function replenishFleet(){
    if(replenishing||stopped||isPlanning()||!TOKEN||replacementRoutes>=MAX_REPLACEMENT_ROUTES)return;const wanted=desiredCarCount(),live=cars.filter(c=>!c.dead).length;if(live>=wanted||wanted<=0)return;
    const now=Date.now();if(now<nextReplenishAt)return;replenishing=true;replacementRoutes++;nextReplenishAt=now+1800+Math.random()*1300;
    try{const u=currentUser(),map=currentMap();if(!u||!map)return;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);try{const route=await buildRoadRoute({lat:+u.lat,lon:+u.lon},replacementRoutes%MAX_CAR_COUNT,controller.signal);if(!stopped&&!isPlanning()&&cars.filter(c=>!c.dead).length<desiredCarCount())createMarker(map,route,replacementRoutes)}finally{clearTimeout(timer)}}catch(e){if(e?.name!=='AbortError')console.debug('[VANO:ambient-car replenish]',e?.message||e)}finally{replenishing=false}
  }

  function tick(ts){
    if(stopped)return;if(navigationActive()){clearForNavigation(true);return}if(isPlanning()){stopAll(true,{clearCache:true});return}const u=currentUser();if(!u||!anchor||hav([anchor.lon,anchor.lat],[u.lon,u.lat])>USER_ESCAPE_M||ts-CREATED_AT>SESSION_MAX_MS){stopAll(true,{clearCache:true});return}
    let alive=0;const paint=ts-lastPaint>=paintGap(),now=Date.now();
    for(const car of cars){
      if(car.dead)continue;if(!car.lastTs)car.lastTs=ts;const dt=clamp((ts-car.lastTs)/1000,0,.14);car.lastTs=ts;
      const desired=targetSpeed(car,now),maxUp=car.accel*dt,maxDown=(car.braking?car.brake:2.35)*dt,diff=desired-car.speed;car.speed+=clamp(diff,-maxDown,maxUp);if(car.speed<.08)car.speed=0;
      car.distance+=car.speed*dt;const p=routePoint(car.route,car.distance),ahead=routePoint(car.route,Math.min(car.route.total,car.distance+Math.max(11,car.speed*2.1))),rawBearing=roadBearing(p,ahead);car.pos=p;car.bearing=smoothAngle(car.bearing,rawBearing,dt*(car.speed<1?2.2:5.2));
      if(car.distance>=car.route.total-4||now>=car.expiresAt||hav([u.lon,u.lat],p)>CAR_ESCAPE_M){removeCar(car,true);continue}
      if(paint){car.marker.setLngLat(p);car.marker.setRotation(car.bearing);if(car.destinationEl){const remain=car.route.total-car.distance;car.destinationEl.style.opacity=remain<90?String(clamp(.25+remain/180,.25,.72)):'.56'}}alive++;
    }
    if(paint){lastPaint=ts;saveState(false);replenishFleet()}
    if(!alive&&desiredCarCount()<=0){stopAll(false,{clearCache:true});return}
    if(!alive&&replacementRoutes>=MAX_REPLACEMENT_ROUTES){clearSavedState();stopAll(false,{clearCache:true});return}
    raf=requestAnimationFrame(tick);
  }

  async function start(){
    if(starting||started||stopped||navSuppressed||navigationActive()||isPlanning())return;const map=currentMap(),u=currentUser();if(!map||!u||!window.mapboxgl?.Marker)return;starting=true;
    try{const wanted=desiredCarCount();if(wanted<=0){stopped=true;return}if(restoreCars(map,u)){started=true;if(startupPoll){clearInterval(startupPoll);startupPoll=0}raf=requestAnimationFrame(tick);replenishFleet();return}if(!TOKEN)return;
      anchor={lat:+u.lat,lon:+u.lon};const myGen=++generation,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
      try{const routes=[];for(let offset=0;offset<wanted;offset+=2){const batch=await Promise.all(Array.from({length:Math.min(2,wanted-offset)},(_,j)=>buildRoadRoute(anchor,offset+j,controller.signal).catch(()=>null)));routes.push(...batch.filter(Boolean));if(stopped||myGen!==generation||isPlanning())return}routes.forEach((route,i)=>createMarker(map,route,i));if(cars.filter(c=>!c.dead).length){started=true;saveState(true);if(startupPoll){clearInterval(startupPoll);startupPoll=0}raf=requestAnimationFrame(tick);replenishFleet()}}finally{clearTimeout(timer)}
    }catch(e){console.debug('[VANO:ambient-cars]',e?.message||e)}finally{starting=false}
  }

  function bindStopSignals(){
    const activeNav=document.getElementById('activeNav');
    const navObserver=new MutationObserver(syncNavigationSuppression);
    try{navObserver.observe(document.body,{attributes:true,attributeFilter:['class']});if(activeNav)navObserver.observe(activeNav,{attributes:true,attributeFilter:['class']})}catch{}
    syncNavigationSuppression();
    const dest=document.getElementById('destinationInput');['focus','input'].forEach(type=>dest?.addEventListener(type,()=>stopAll(true,{clearCache:true}),{passive:true}));document.getElementById('destinationConfirm')?.addEventListener('click',()=>stopAll(true,{clearCache:true}),{passive:true});
    window.addEventListener('pagehide',()=>{saveState(true);if(raf){cancelAnimationFrame(raf);raf=0}});window.addEventListener('pageshow',()=>{if(!stopped&&cars.some(c=>!c.dead)&&!raf){cars.forEach(c=>c.lastTs=performance.now());raf=requestAnimationFrame(tick)}});
    window.addEventListener('vano:performance-tier',()=>{if(stopped)return;const wanted=desiredCarCount();if(wanted<=0){stopAll(true,{clearCache:true});return}const live=cars.filter(c=>!c.dead);live.slice(wanted).forEach(c=>removeCar(c,true));if(live.length<wanted)replenishFleet()},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){saveState(true);if(raf){cancelAnimationFrame(raf);raf=0}}else if(!stopped&&cars.some(c=>!c.dead)&&!raf){cars.forEach(c=>c.lastTs=performance.now());raf=requestAnimationFrame(tick)}},{passive:true});
  }
  function boot(){if(stopped)return;bindStopSignals();const attempt=()=>{if(stopped||started)return;if(performance.now()-CREATED_AT>BOOT_DEADLINE_MS){if(startupPoll)clearInterval(startupPoll);startupPoll=0;return}start()};attempt();startupPoll=setInterval(attempt,700);window.addEventListener('vano:map-ready',attempt,{passive:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
