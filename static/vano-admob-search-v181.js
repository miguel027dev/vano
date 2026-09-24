/* Readable VANO source; runtime eval/encoded wrapper removed. */
/* VANO V181 — low-jank AdMob Native bridge for Android WebView.
   The Android NativeAdView is hidden while the result list is moving and
   re-anchored once scrolling settles, avoiding layout/bridge work every frame. */
(()=>{
  'use strict';
  const results=document.getElementById('searchResults');
  if(!results)return;

  let slot=null,raf=0,motionTimer=0,lastPayload='',bridgeFailed=false,nativeRequested=false,motionActive=false;
  const bridge=()=>window.VanoNative;
  const available=()=>{
    if(bridgeFailed)return false;
    try{return !!bridge()&&typeof bridge().showSearchNativeAd==='function'&&typeof bridge().hideSearchNativeAd==='function'}catch(_){return false}
  };
  const callHide=()=>{
    if(!nativeRequested)return;
    nativeRequested=false;
    try{bridge()?.hideSearchNativeAd?.()}catch(_){bridgeFailed=true}
  };
  const removeSlot=()=>{
    callHide();
    if(raf)cancelAnimationFrame(raf);
    if(motionTimer)clearTimeout(motionTimer);
    raf=0;motionTimer=0;motionActive=false;
    slot?.remove();slot=null;lastPayload='';
  };
  const visible=()=>results.classList.contains('show')&&results.getClientRects().length>0;

  function ensureSlot(){
    if(!available()||!visible()){removeSlot();return}
    const items=results.querySelectorAll('.search-item');
    if(!items.length){removeSlot();return}
    if(!slot||!slot.isConnected){
      slot=document.createElement('div');
      slot.id='vanoNativeAdSlot';
      slot.className='vano-native-ad-slot';
      slot.setAttribute('aria-label','Publicidade');
      slot.setAttribute('role','presentation');
    }
    const anchor=items[Math.min(1,items.length-1)];
    if(slot.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',slot);
    queueSync(true);
  }

  function sync(force=false){
    raf=0;
    if(motionActive)return;
    if(!slot?.isConnected||!available()||!visible()){callHide();return}
    const r=slot.getBoundingClientRect();
    const vh=window.visualViewport?.height||innerHeight;
    const vw=window.visualViewport?.width||innerWidth;
    if(r.bottom<=0||r.top>=vh||r.right<=0||r.left>=vw||r.width<220||r.height<90){callHide();return}
    const payload=JSON.stringify({
      left:Math.round(r.left*2)/2,
      top:Math.round(r.top*2)/2,
      width:Math.round(r.width*2)/2,
      height:Math.round(r.height*2)/2,
      dpr:window.devicePixelRatio||1,
      theme:document.documentElement.dataset.vanoTheme==='black'?'black':'light'
    });
    if(!force&&payload===lastPayload)return;
    lastPayload=payload;
    try{
      bridge().showSearchNativeAd(payload);
      nativeRequested=true;
    }catch(_){bridgeFailed=true;removeSlot()}
  }
  function queueSync(force=false){
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>sync(force));
  }

  // Native views layered over WebView content are expensive to move continuously.
  // Hide once at scroll start, then position/show once after ~90 ms of idle time.
  function onMotion(){
    if(!motionActive){
      motionActive=true;
      callHide();
    }
    if(motionTimer)clearTimeout(motionTimer);
    motionTimer=setTimeout(()=>{
      motionTimer=0;
      motionActive=false;
      queueSync(true);
    },90);
  }

  window.VanoSearchAds={
    onNativeAdState(state){
      if(!slot?.isConnected)return;
      if(state==='ready')slot.classList.add('is-ready');
      if(state==='failed')removeSlot();
    },
    refresh(){ensureSlot()}
  };

  const mo=new MutationObserver(()=>requestAnimationFrame(ensureSlot));
  mo.observe(results,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
  results.addEventListener('scroll',onMotion,{passive:true});
  results.addEventListener('pointerdown',e=>{if(e.target.closest('.search-item'))callHide()},{passive:true});
  window.addEventListener('scroll',onMotion,true);
  window.addEventListener('resize',()=>queueSync(true),{passive:true});
  window.visualViewport?.addEventListener('resize',()=>queueSync(true),{passive:true});
  window.visualViewport?.addEventListener('scroll',onMotion,{passive:true});
  document.addEventListener('visibilitychange',()=>document.hidden?callHide():ensureSlot());
  window.addEventListener('pagehide',callHide,{passive:true});
  window.addEventListener('vano:themechange',()=>queueSync(true));
  setTimeout(ensureSlot,180);
})();
