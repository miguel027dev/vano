/* Android/TWA navigation overlay geometry.
 * Observe state/insets, never poll GPS frames or touch Mapbox rendering.
 */
(()=>{
  'use strict';
  const html=document.documentElement;
  if(!html.classList.contains('vano-android-shell'))return;
  let frame=0;
  const byId=id=>document.getElementById(id);
  const shown=(el,requiredClass='')=>{
    if(!el||el.hidden||(requiredClass&&!el.classList.contains(requiredClass)))return false;
    const style=getComputedStyle(el);
    return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';
  };
  const px=n=>Math.round(Math.max(0,n))+'px';
  const setVar=(name,value)=>{
    if(html.style.getPropertyValue(name)!==value)html.style.setProperty(name,value);
  };
  function sync(){
    frame=0;
    if(!document.body?.classList.contains('body-nav')){
      window.__VANO_NAV_SAFE_VIEWPORT=null;
      return;
    }
    const vh=Math.max(260,window.visualViewport?.height||window.innerHeight||600);
    const nav=byId('activeNav'),radar=byId('trafficRadar'),ctx=byId('navContextAlert');
    let headerBottom=12;
    for(const id of ['navManeuverTop','navStreetChip']){
      const el=byId(id);
      if(!shown(el))continue;
      const rect=el.getBoundingClientRect();
      if(rect.height>0&&rect.bottom>0&&rect.top<vh*.65)
        headerBottom=Math.max(headerBottom,rect.bottom+9);
    }
    // Android devices may have a 2-line maneuver: never assume a 76px header.
    headerBottom=Math.min(vh*.53,Math.max(72,headerBottom));
    const navRect=shown(nav,'show')?nav.getBoundingClientRect():null;
    const navTop=navRect?navRect.top:vh-155;
    // One measured viewport model for HUD and camera: no per-frame DOM reads
    // in the Mapbox motion loop, and no fixed dock height guesses.
    const measuredDock=Math.max(0,navRect?.height||0);
    window.__VANO_NAV_SAFE_VIEWPORT={
      top:Math.max(0,Math.round(headerBottom)),
      bottom:Math.max(0,Math.round(measuredDock)),
      width:Math.round(window.innerWidth||0),height:Math.round(vh),
      measuredAt:performance.now()
    };
    const free=Math.max(70,navTop-headerBottom-12);
    const ctxShowing=shown(ctx)&&ctx.getAttribute('hidden')===null;
    const reserveContext=ctxShowing?Math.min(76,Math.max(48,free*.43)):0;
    const radarVisible=shown(radar,'show');
    const maxRadar=Math.max(44,Math.min(122,free-reserveContext-(ctxShowing?8:0)));
    setVar('--vano-android-radar-top',px(headerBottom));
    setVar('--vano-android-radar-cap',px(maxRadar));
    let radarHeight=0;
    if(radarVisible){
      const measured=radar.getBoundingClientRect().height;
      radarHeight=Math.min(maxRadar,Math.max(42,measured||60));
    }
    const contextTop=Math.min(vh-62,headerBottom+radarHeight+(radarVisible?8:0));
    setVar('--vano-android-context-top',px(contextTop));
    setVar('--vano-android-context-cap',px(Math.max(45,navTop-contextTop-10)));
    html.classList.toggle('vano-android-nav-compact',free<190);
  }
  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(sync);
  }
  const observe=()=>{
    const body=document.body;
    if(!body)return;
    const mo=new MutationObserver(schedule);
    mo.observe(body,{attributes:true,attributeFilter:['class']});
    for(const id of ['activeNav','trafficRadar','navManeuverTop','navStreetChip','navContextAlert']){
      const el=byId(id);
      if(el)mo.observe(el,{attributes:true,attributeFilter:['class','hidden','style']});
    }
    if('ResizeObserver' in window){
      const ro=new ResizeObserver(schedule);
      for(const id of ['activeNav','trafficRadar','navManeuverTop','navStreetChip','navContextAlert']){
        const el=byId(id);
        if(el)ro.observe(el);
      }
    }
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('pageshow',schedule,{passive:true});
    schedule();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});
  else observe();
})();
