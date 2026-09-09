/* VANO MAPS V281 — focused driver-state polish. Loaded after the v232 map core. */
(()=>{
  'use strict';
  if(window.__VANO_NAV_RUNTIME_281)return;
  window.__VANO_NAV_RUNTIME_281=true;

  const $=id=>document.getElementById(id);
  const MANAGED=['gpsQuality','connectivityPill','trafficRadar','navAltHint'];
  const placeholders=new Map();
  const childObservers=new Map();
  let rail=null,installed=false,gpsMode='fresh',gpsTimer=null,viewportTimer=null;
  let resumeGraceUntil=Date.now()+4500;

  function bridge(){return window.__VANO_MAP_BRIDGE||null}
  function state(){try{return bridge()?.getNavigationRuntime?.()||null}catch{return null}}
  function navActive(){const s=state();return !!s?.active||document.body.classList.contains('body-nav')}

  function ensureRail(){
    if(rail?.isConnected)return rail;
    const host=document.querySelector('.ws-app');
    if(!host)return null;
    rail=document.createElement('div');
    rail.id='vanoNavInfoRail';
    rail.className='vano-nav-info-rail';
    rail.setAttribute('aria-label','Avisos da navegação');
    host.appendChild(rail);
    return rail;
  }
  function mountRail(){
    if(!navActive())return restoreRail();
    const host=ensureRail();if(!host)return;
    for(const id of MANAGED){
      const el=$(id);if(!el||el.parentNode===host)continue;
      const marker=document.createComment(`vano-v281:${id}`);
      el.parentNode?.insertBefore(marker,el);
      placeholders.set(id,marker);
      host.appendChild(el);
    }
    syncPriority();
  }
  function restoreRail(){
    for(const id of MANAGED){
      const el=$(id),marker=placeholders.get(id);
      if(el&&marker?.parentNode)marker.parentNode.insertBefore(el,marker);
      marker?.remove?.();placeholders.delete(id);
    }
    rail?.remove?.();rail=null;
    document.body.classList.remove('nav-has-alt','nav-has-critical-radar','nav-has-traffic','nav-dock-action','nav-rerouting');
  }
  function syncPriority(){
    const alt=$('navAltHint'),radar=$('trafficRadar'),suggestion=$('trafficSuggestion'),reroute=$('rerouteNotice');
    const altOn=!!alt?.classList.contains('show');
    const radarOn=!!radar?.classList.contains('show');
    const critical=radarOn&&(radar.classList.contains('severe')||radar.classList.contains('speed-camera'));
    const dockAction=!!suggestion?.classList.contains('show');
    const rerouting=!!reroute?.classList.contains('show');
    document.body.classList.toggle('nav-has-alt',altOn);
    document.body.classList.toggle('nav-has-traffic',radarOn);
    document.body.classList.toggle('nav-has-critical-radar',critical);
    document.body.classList.toggle('nav-dock-action',dockAction);
    document.body.classList.toggle('nav-rerouting',rerouting);
  }
  function observeManaged(){
    for(const id of [...MANAGED,'trafficSuggestion','rerouteNotice']){
      const el=$(id);if(!el||childObservers.has(id))continue;
      const ob=new MutationObserver(()=>{
        syncPriority();
        if(id==='trafficSuggestion'||id==='rerouteNotice')requestAnimationFrame(()=>bridge()?.syncNavigationHud?.());
      });
      ob.observe(el,{attributes:true,attributeFilter:['class','style','aria-hidden']});
      childObservers.set(id,ob);
    }
  }

  function syncFreeCamera(){
    const free=document.body.classList.contains('nav-map-free');
    const btn=$('navDrawerRecenter');
    btn?.classList.toggle('free-camera',free);
    if(btn){
      btn.setAttribute('aria-label',free?'Voltar a seguir minha posição':'Recalibrar câmera e seguir minha posição');
      btn.title=free?'Voltar a seguir':'Recalibrar câmera';
    }
  }

  function setSpeedUnavailable(unavailable,s){
    const box=$('vanoSpeedometerV220'),value=$('vanoSpeedValueV220');
    box?.classList.toggle('gps-unavailable',unavailable);
    if(!value)return;
    if(unavailable){value.textContent='—';box?.setAttribute('aria-label','Velocidade indisponível enquanto o GPS reconecta')}
    else if(s&&Number.isFinite(+s.speedKmh)){const n=Math.max(0,Math.round(+s.speedKmh));value.textContent=String(n);box?.setAttribute('aria-label',`Velocidade atual: ${n} quilômetros por hora`)}
  }
  function renderGps(mode,s){
    const box=$('gpsQuality'),bars=$('gpsBars'),label=$('gpsAccuracy'),puck=document.querySelector('.vano-user-puck-v232');
    document.body.classList.toggle('nav-gps-stale',mode==='stale');
    document.body.classList.toggle('nav-gps-lost',mode==='lost');
    puck?.classList.toggle('is-gps-stale',mode==='stale');
    puck?.classList.toggle('is-gps-lost',mode==='lost');
    if(!box||!bars||!label)return;
    box.classList.remove('stale','lost');
    if(mode==='lost'){
      box.classList.add('show','weak','lost');box.setAttribute('aria-hidden','false');
      label.textContent='Sinal GPS perdido · mantendo a rota';bars.className='gps-bars';setSpeedUnavailable(true,s);return;
    }
    if(mode==='stale'){
      box.classList.add('show','weak','stale');box.setAttribute('aria-hidden','false');
      label.textContent='GPS instável · mantendo sua posição';bars.className='gps-bars mid';setSpeedUnavailable(false,s);return;
    }
    setSpeedUnavailable(false,s);
    const acc=Number.isFinite(+s?.accuracy)?Math.max(1,+s.accuracy):null;
    if(navActive()){
      const weak=acc!=null&&acc>60;
      box.classList.toggle('show',weak);box.classList.toggle('weak',weak);box.setAttribute('aria-hidden',String(!weak));
      if(acc!=null)label.textContent=weak?`GPS fraco · ±${Math.round(acc)} m`:`GPS ±${Math.round(acc)} m`;
      bars.className='gps-bars '+(acc!=null&&acc<=20?'good':acc!=null&&acc<=60?'mid':'');
    }else if(acc!=null){
      box.classList.add('show');box.classList.toggle('weak',acc>60);box.setAttribute('aria-hidden','false');
      label.textContent=acc>60?`GPS fraco · ±${Math.round(acc)} m`:`GPS ±${Math.round(acc)} m`;
      bars.className='gps-bars '+(acc<=20?'good':acc<=60?'mid':'');
    }else{box.classList.remove('show','weak');box.setAttribute('aria-hidden','true')}
  }
  function setGpsMode(next,s){
    if(next===gpsMode){renderGps(next,s);return}
    const previous=gpsMode;gpsMode=next;
    if((next==='stale'||next==='lost')&&previous==='fresh'){
      try{bridge()?.stopGuidanceCamera?.();bridge()?.stopPuckPrediction?.()}catch{}
    }
    renderGps(next,s);
  }
  function gpsWatchdog(){
    const s=state();
    if(!s?.active||document.visibilityState==='hidden'){if(gpsMode!=='fresh')setGpsMode('fresh',s);return}
    if(Date.now()<resumeGraceUntil){setGpsMode('fresh',s);return}
    const fix=+s.lastGpsFixAt||0,age=fix?Date.now()-fix:Infinity;
    setGpsMode(age>15000?'lost':age>7000?'stale':'fresh',s);
  }

  function syncViewport(){
    clearTimeout(viewportTimer);
    viewportTimer=setTimeout(()=>requestAnimationFrame(()=>{
      try{bridge()?.getMap?.()?.resize?.()}catch{}
      try{bridge()?.syncNavigationHud?.()}catch{}
      mountRail();syncFreeCamera();syncPriority();
    }),80);
  }
  function install(){
    if(installed)return;installed=true;
    mountRail();observeManaged();syncFreeCamera();gpsWatchdog();
    gpsTimer=setInterval(gpsWatchdog,1000);
    const bodyObserver=new MutationObserver(()=>{mountRail();observeManaged();syncFreeCamera();syncPriority()});
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',syncViewport,{passive:true});
    window.addEventListener('orientationchange',syncViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'){resumeGraceUntil=Date.now()+4500;syncViewport()}
    },{passive:true});
    window.addEventListener('pageshow',()=>{resumeGraceUntil=Date.now()+3500;if(!gpsTimer)gpsTimer=setInterval(gpsWatchdog,1000);syncViewport()},{passive:true});
    window.addEventListener('pagehide',()=>{if(gpsTimer){clearInterval(gpsTimer);gpsTimer=null}},{passive:true});
  }

  window.addEventListener('vano:map-ready',install,{once:true});
  if(window.__VANO_MAP_INSTANCE_READY)install();
  else setTimeout(()=>{if(window.__VANO_MAP_INSTANCE_READY)install()},1500);
})();
