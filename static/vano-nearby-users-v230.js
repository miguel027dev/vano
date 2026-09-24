/* Readable VANO source; runtime eval/encoded wrapper removed. */
/* VANO MAPS V135 — nearby users notice, 24/7.
   No hour/daypart restriction: every app entry attempts to show the notice,
   using a fast live query and only a very short cache while live data loads. */
(()=>{
  'use strict';

  const BOOT=window.VANO_BOOT||{};
  const NOTICE=document.getElementById('nearbyUsersNotice');
  const COPY=document.getElementById('nearbyUsersNoticeText');
  const PLAN=document.getElementById('planSheet');
  const DEST=document.getElementById('destinationInput');
  if(!NOTICE||!COPY||!PLAN)return;

  const HOLD_MS=8800;
  const START_DEADLINE_MS=45000;
  const CREATED_AT=performance.now();
  const LAST_GPS_KEY='vano-last-location-v3';
  const NOTICE_CACHE_KEY='vano.nearbyNotice.v134';
  const MAX_CACHE_AGE_MS=90*1000; // startup bridge only; never a time-of-day gate
  let shown=false;
  let dismissed=false;
  let busy=false;
  let leaveTimer=0;
  let pollTimer=0;
  let resizeObserver=null;
  let lastFetchAt=0;
  let directGeoRequested=false;
  let directGeoRetryTimer=0;

  const bridge=()=>window.__VANO_MAP_BRIDGE||null;
  const planningNow=()=>{
    try{if(bridge()?.isPlanning?.())return true}catch{}
    return document.body.classList.contains('body-nav')||
      document.documentElement.classList.contains('vano-keyboard-open')||
      document.body.classList.contains('vano-keyboard-open');
  };
  const locale=String(BOOT.locale||document.documentElement.lang||navigator.language||'pt-BR').toLowerCase();

  function haversineM(a,b){
    if(!a||!b)return Infinity;
    const toRad=v=>v*Math.PI/180;
    const R=6371000;
    const dLat=toRad((+b.lat)-(+a.lat));
    const dLon=toRad((+b.lon)-(+a.lon));
    const lat1=toRad(+a.lat), lat2=toRad(+b.lat);
    const s=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(s));
  }

  function readLastGps(){
    try{
      const x=JSON.parse(localStorage.getItem(LAST_GPS_KEY)||'null');
      if(!x||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon))return null;
      if(Date.now()-(+x.ts||0)>6*60*60*1000)return null;
      return {lat:+x.lat,lon:+x.lon,ts:+x.ts||0};
    }catch{return null}
  }

  function readNoticeCache(){
    try{
      const x=JSON.parse(sessionStorage.getItem(NOTICE_CACHE_KEY)||localStorage.getItem(NOTICE_CACHE_KEY)||'null');
      if(!x||!Number.isFinite(+x.count)||+x.count<1||!Number.isFinite(+x.lat)||!Number.isFinite(+x.lon))return null;
      if(Date.now()-(+x.ts||0)>MAX_CACHE_AGE_MS)return null;
      return {count:+x.count,lat:+x.lat,lon:+x.lon,ts:+x.ts||0};
    }catch{return null}
  }

  function writeNoticeCache(pos,count){
    try{
      const payload=JSON.stringify({count:Math.max(1,Math.floor(+count||0)),lat:+pos.lat,lon:+pos.lon,ts:Date.now()});
      sessionStorage.setItem(NOTICE_CACHE_KEY,payload);
      localStorage.setItem(NOTICE_CACHE_KEY,payload);
    }catch{}
  }

  function locationNow(){
    try{
      const p=bridge()?.getUserLocation?.();
      if(p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon))return {lat:+p.lat,lon:+p.lon};
    }catch{}
    return readLastGps();
  }

  function sendTelemetry(label){
    const csrf=String(BOOT.csrf||'');if(!csrf)return;
    try{fetch('/api/telemetry/event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({event_type:'ui',label:String(label||'').slice(0,100),target:'nearby-users-notice',page:location.pathname})}).catch(()=>{})}catch{}
  }

  function formatCount(n){return n>99?'99+':String(n)}
  function phrase(n){
    const c=formatCount(n),one=n===1;
    if(locale.startsWith('fr'))return `${c} ${one?'utilisateur':'utilisateurs'} près de vous utilisent VANO MAPS maintenant`;
    if(locale.startsWith('de'))return `${c} ${one?'Nutzer':'Nutzer'} in deiner Nähe ${one?'nutzt':'nutzen'} VANO MAPS gerade`;
    if(locale.startsWith('ru'))return `${c} ${one?'пользователь рядом с вами использует':'пользователей рядом с вами используют'} VANO MAPS сейчас`;
    if(locale.startsWith('es'))return `${c} ${one?'usuario cerca de ti está usando':'usuarios cerca de ti están usando'} VANO MAPS ahora`;
    if(locale.startsWith('en'))return `${c} ${one?'user near you is':'users near you are'} using VANO MAPS now`;
    return `${c} ${one?'usuário perto de você usando':'usuários perto de você usando'} VANO MAPS agora`;
  }

  function syncPosition(){
    const app=document.getElementById('wsApp');
    const appRect=app?.getBoundingClientRect?.();
    const sheetRect=PLAN.getBoundingClientRect();
    const rootLeft=appRect?.left||0,rootTop=appRect?.top||0,rootHeight=appRect?.height||window.innerHeight;
    const center=(sheetRect.left-rootLeft)+(sheetRect.width/2);
    const bottom=Math.max(16,rootHeight-((sheetRect.top-rootTop))+12);
    NOTICE.style.left=`${Math.round(center)}px`;
    NOTICE.style.bottom=`${Math.round(bottom)}px`;
  }

  function hideNotice(immediate=false){
    if(dismissed)return;
    dismissed=true;
    clearTimeout(leaveTimer);
    if(immediate){
      NOTICE.classList.remove('is-visible','is-leaving');
      NOTICE.setAttribute('aria-hidden','true');
      return;
    }
    NOTICE.classList.remove('is-visible');
    NOTICE.classList.add('is-leaving');
    setTimeout(()=>{
      NOTICE.classList.remove('is-leaving');
      NOTICE.setAttribute('aria-hidden','true');
    },470);
  }

  function showNotice(count,{immediate=false}={}){
    count=Math.max(0,Math.floor(Number(count)||0));
    if(shown||dismissed||count<1||planningNow())return false;
    shown=true;
    COPY.innerHTML=phrase(count).replace(/^([^ ]+)/, '<strong>$1</strong>');
    syncPosition();
    NOTICE.setAttribute('aria-hidden','false');
    if(immediate){
      NOTICE.classList.remove('is-leaving');
      NOTICE.classList.add('is-visible');
    }else{
      requestAnimationFrame(()=>requestAnimationFrame(()=>NOTICE.classList.add('is-visible')));
    }
    sendTelemetry(`nearby-users-notice:${count}`);
    leaveTimer=setTimeout(()=>hideNotice(false),HOLD_MS);
    return true;
  }

  async function fetchSummary(pos,{allowImmediateShow=false}={}){
    if(busy||dismissed||!pos)return;
    const now=Date.now();
    if(now-lastFetchAt<900)return;
    lastFetchAt=now;
    busy=true;
    try{
      const q=new URLSearchParams({lat:Number(pos.lat).toFixed(6),lon:Number(pos.lon).toFixed(6)});
      const r=await fetch('/api/nearby-users-summary?'+q,{credentials:'same-origin',headers:{Accept:'application/json'}});
      const d=await r.json().catch(()=>({}));
      const count=Math.max(0,Number(d.count)||0);
      if(count>=1){
        writeNoticeCache(pos,count);
        if(!shown)showNotice(count,{immediate:allowImmediateShow});
      }
    }catch(e){
      console.debug('[VANO MAPS:nearby-notice]',e?.message||e);
    }finally{busy=false}
  }

  function showFromCache(){
    const cached=readNoticeCache();
    const pos=locationNow()||cached;
    if(!cached||!pos)return false;
    if(haversineM(pos,cached)>1800)return false;
    return showNotice(cached.count,{immediate:true});
  }

  function requestDirectGeolocation(){
    if(directGeoRequested||!navigator.geolocation||shown||dismissed||planningNow())return;
    directGeoRequested=true;
    clearTimeout(directGeoRetryTimer);
    try{
      navigator.geolocation.getCurrentPosition(
        g=>{directGeoRequested=false;fetchSummary({lat:+g.coords.latitude,lon:+g.coords.longitude},{allowImmediateShow:!shown})},
        ()=>{directGeoRetryTimer=setTimeout(()=>{directGeoRequested=false;attempt()},1400)},
        {enableHighAccuracy:false,timeout:2600,maximumAge:30000}
      );
    }catch{directGeoRetryTimer=setTimeout(()=>{directGeoRequested=false;attempt()},1400)}
  }

  function adminPreview(){
    if(!BOOT.isAdmin)return false;
    const raw=new URLSearchParams(location.search).get('preview_nearby_notice');
    if(raw===null)return false;
    const n=Math.max(1,Math.min(999,parseInt(raw,10)||30));
    setTimeout(()=>showNotice(n),350);
    return true;
  }

  function attempt(){
    if(shown||dismissed){clearInterval(pollTimer);pollTimer=0;return}
    if(performance.now()-CREATED_AT>START_DEADLINE_MS){clearInterval(pollTimer);pollTimer=0;return}
    if(planningNow())return;
    const p=locationNow();
    if(p){fetchSummary(p,{allowImmediateShow:true});return}
    requestDirectGeolocation();
  }

  function boot(){
    if(adminPreview())return;
    syncPosition();
    // If we already know a fresh count around this area, show it instantly.
    setTimeout(()=>{if(!shown&&!dismissed&&!planningNow())showFromCache()},220);

    DEST?.addEventListener('focus',()=>{if(shown&&!dismissed)hideNotice(false)},{passive:true});
    DEST?.addEventListener('input',()=>{if(shown&&!dismissed)hideNotice(false)},{passive:true});
    window.addEventListener('resize',syncPosition,{passive:true});
    window.visualViewport?.addEventListener('resize',syncPosition,{passive:true});
    window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!shown&&!dismissed)attempt()},{passive:true});
    window.addEventListener('pageshow',()=>{if(!shown&&!dismissed)attempt()},{passive:true});
    if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>requestAnimationFrame(syncPosition));resizeObserver.observe(PLAN)}
    const mo=new MutationObserver(()=>{if(shown&&!dismissed){if(planningNow())hideNotice(false);else requestAnimationFrame(syncPosition)}});
    mo.observe(document.body,{attributes:true,attributeFilter:['class']});
    mo.observe(PLAN,{attributes:true,attributeFilter:['class','style']});

    // Make the first appearance happen as soon as possible.
    setTimeout(attempt,120);
    pollTimer=setInterval(attempt,300);
    window.addEventListener('vano:map-ready',attempt,{passive:true});
    window.addEventListener('pagehide',()=>{clearInterval(pollTimer);clearTimeout(leaveTimer);clearTimeout(directGeoRetryTimer);resizeObserver?.disconnect();mo.disconnect()},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
