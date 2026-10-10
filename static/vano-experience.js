(()=>{
  'use strict';
  const d=document,root=d.documentElement;
  if(root.dataset.vanoExperience410==='1')return;
  root.dataset.vanoExperience410='1';
  const motionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced=()=>!!motionQuery?.matches;
  const pulseTimers=new WeakMap();
  const interactive='button:not(:disabled),a[href],[role="button"]:not([aria-disabled="true"]),.route-variant,.planner-preset,.nearby-service,.sub-action,.ob-choice-v340,.ob-language-v340,.profile350-accent';

  function pulse(el,cls='vano-x-pop-in',ms=430){
    if(!el||reduced())return;
    const prior=pulseTimers.get(el);if(prior)clearTimeout(prior);
    el.classList.remove(cls);
    requestAnimationFrame(()=>{el.classList.add(cls);const timer=setTimeout(()=>{el.classList.remove(cls);pulseTimers.delete(el)},ms);pulseTimers.set(el,timer)});
  }

  function syncViewport(){
    const h=window.visualViewport?.height||window.innerHeight;
    if(h)root.style.setProperty('--vano-x-vh',`${Math.round(h)}px`);
  }
  syncViewport();
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(syncViewport,80),{passive:true});

  // Pointer feedback is delegated, so dynamically rendered map controls inherit it too.
  const clearPress=el=>el?.classList?.remove('vano-x-pressing');
  d.addEventListener('pointerdown',e=>{
    if(e.button!==undefined&&e.button!==0)return;
    const el=e.target.closest?.(interactive);if(!el)return;
    el.classList.add('vano-x-pressing');
    const done=()=>clearPress(el);
    el.addEventListener('pointerup',done,{once:true});
    el.addEventListener('pointercancel',done,{once:true});
    el.addEventListener('pointerleave',done,{once:true});
  },{passive:true});
  window.addEventListener('pointerup',()=>d.querySelectorAll('.vano-x-pressing').forEach(clearPress),{passive:true});
  window.addEventListener('blur',()=>d.querySelectorAll('.vano-x-pressing').forEach(clearPress));

  // Focus continuity for custom field wrappers.
  d.addEventListener('focusin',e=>{
    e.target.closest?.('.startup-input-wrap,.register-input-wrap,.ob-field-v340>div,.profile350-field>div,.input-wrap')?.classList.add('vano-x-field-focus');
  });
  d.addEventListener('focusout',e=>{
    e.target.closest?.('.startup-input-wrap,.register-input-wrap,.ob-field-v340>div,.profile350-field>div,.input-wrap')?.classList.remove('vano-x-field-focus');
  });

  // Form feedback: do not take over validation or navigation, just acknowledge the action.
  d.addEventListener('submit',e=>{
    const form=e.target;if(!(form instanceof HTMLFormElement)||!form.checkValidity())return;
    form.classList.add('vano-x-submitting');
  },true);
  window.addEventListener('pageshow',()=>d.querySelectorAll('form.vano-x-submitting').forEach(f=>f.classList.remove('vano-x-submitting')));

  // Theme motion belongs to the shared control. Avoid repainting every element
  // and applying a full-page filter over the map on each toggle.

  // Profile dirty state gives the save bar a clear but quiet response.
  const profileForm=d.getElementById('profileForm')||d.querySelector('.profile350-form');
  if(profileForm){
    const mark=()=>profileForm.classList.add('vano-x-dirty');
    profileForm.addEventListener('input',mark,{passive:true});profileForm.addEventListener('change',mark,{passive:true});
    profileForm.addEventListener('submit',()=>profileForm.classList.remove('vano-x-dirty'));
  }

  // Route result choreography. Existing rendering remains untouched.
  const routeState=d.getElementById('routeState');
  if(routeState){
    let wasVisible=false;
    const sync=()=>{
      const visible=getComputedStyle(routeState).display!=='none'&&routeState.getClientRects().length>0;
      if(visible&&!wasVisible&&!reduced()){
        routeState.classList.remove('vano-x-route-enter');
        requestAnimationFrame(()=>{routeState.classList.add('vano-x-route-enter');setTimeout(()=>routeState.classList.remove('vano-x-route-enter'),760)});
      }
      wasVisible=visible;
    };
    new MutationObserver(sync).observe(routeState,{attributes:true,attributeFilter:['style','class']});
    sync();
  }

  // Pop important overlays only when they become visible.
  const overlayVisible=el=>el.classList.contains('show')||el.classList.contains('open')||el.classList.contains('drawer-open')||el.getAttribute('aria-hidden')==='false'||(!el.hidden&&getComputedStyle(el).display!=='none'&&el.id==='destinationConfirm');
  ['arrivalExperience','guestLimitModal','locationPermission','safetyDrawer','prefsDrawer','accountDrawer','destinationConfirm','resumeTripCard','routeLoadingOverlay','vanoRoutineSheet','navControlDrawer','navVoicePopover'].forEach(id=>{
    const el=d.getElementById(id);if(!el)return;
    let prior=overlayVisible(el);
    new MutationObserver(()=>{
      const now=overlayVisible(el);
      if(now&&!prior)pulse(el,id==='routeLoadingOverlay'?'vano-x-fade-in':'vano-x-pop-in',id==='routeLoadingOverlay'?300:420);
      prior=now;
    }).observe(el,{attributes:true,attributeFilter:['class','aria-hidden','style','hidden']});
  });

  // Make language/choice selection feel immediate even when the page has its own logic.
  d.addEventListener('change',e=>{
    if(!e.target.matches?.('.ob-choice-v340 input,.ob-language-v340 input,.profile350-accent input,.profile350-chip-select input,.profile350-map-card input,.pref-switch,.voice-select'))return;
    pulse(e.target.closest('label')||e.target, 'vano-x-pop-in', 320);
  },{passive:true});
  motionQuery?.addEventListener?.('change',()=>{if(reduced())d.querySelectorAll('.vano-x-pop-in,.vano-x-fade-in,.vano-x-pressing').forEach(el=>el.classList.remove('vano-x-pop-in','vano-x-fade-in','vano-x-pressing'))});
})();
