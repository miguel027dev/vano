(() => {
  'use strict';
  const root=document.documentElement,body=document.body,$=id=>document.getElementById(id),app=$('wsApp');
  if(!app)return;
  const input=$('destinationInput'),clear=$('clearDestinationBtn'),sheet=$('planSheet'),nav=$('activeNav'),maneuver=$('navManeuverTop');
  let frame=null;
  function setVar(name,value){if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value)}
  function sync(){
    frame=null;
    const r=app.getBoundingClientRect(),sr=sheet?.getBoundingClientRect(),nr=nav?.getBoundingClientRect(),mr=maneuver?.getBoundingClientRect();
    const navOn=body.classList.contains('body-nav'),sheetVisible=sr&&!sheet.classList.contains('hidden')?Math.max(0,r.bottom-Math.max(r.top,sr.top)):0;
    setVar('--ux-sheet-visible',`${Math.round(sheetVisible)}px`);
    if(mr)setVar('--ux-maneuver-bottom',`${Math.round(mr.bottom-r.top)}px`);
    const vv=window.visualViewport,visibleHeight=vv?.height||innerHeight,offset=vv?.offsetTop||0;
    setVar('--ux-keyboard-inset',`${Math.round(Math.max(0,r.height-visibleHeight-offset))}px`);
    setVar('--ux-visual-height',`${Math.round(visibleHeight)}px`);
    if(navOn&&nr&&mr){
      const side=nr.width<r.width*.65;
      const top=side?24:Math.max(24,mr.bottom-r.top+12),bottom=side?28:Math.max(80,r.bottom-nr.top+44);
      const available=Math.max(40,r.height-top-bottom);
      window.VANO_MAP_LAYOUT={navigationPadding:side?{top,bottom,left:Math.min(r.width*.60,nr.right-r.left+32),right:84}:{top:Math.round(top+available*.36),bottom:Math.round(bottom),left:24,right:72}};
    }else window.VANO_MAP_LAYOUT=null;
    body.dataset.mapStage=navOn?'navigation':getComputedStyle($('routeState')).display!=='none'?'route':document.activeElement===input?'search':'idle';
    clear.hidden=!input?.value;
    // Accessibility state mirrors the selection used by the route engine.
    document.querySelectorAll('[data-profile],[data-route-mode],.route-variant').forEach(el=>el.setAttribute('aria-pressed',String(el.classList.contains('active'))));
    const isFree=navOn?body.classList.contains('nav-map-free'):body.classList.contains('map-browsing');
    $('navDrawerRecenter')?.setAttribute('aria-label',isFree?'Voltar à rota e seguir minha posição':'Centralizar e seguir minha posição');
  }
  function schedule(){if(frame===null)frame=requestAnimationFrame(sync)}
  if(window.ResizeObserver){const ro=new ResizeObserver(schedule);[app,sheet,nav,maneuver].filter(Boolean).forEach(el=>ro.observe(el))}
  const mo=new MutationObserver(schedule);[body,sheet,nav,$('routeVariants'),$('routeState')].filter(Boolean).forEach(el=>mo.observe(el,{attributes:true,attributeFilter:['class','style'],childList:el.id==='routeVariants'}));
  input?.addEventListener('input',schedule);
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});window.addEventListener('vano:map-ready',schedule);
  // Off-screen panels must not leave invisible controls in keyboard navigation.
  const panels=['accountDrawer','prefsDrawer','safetyDrawer','quickAlertSheet','navControlDrawer','locationPermission','destinationConfirm'];
  panels.forEach(id=>{const el=$(id);if(!el)return;const refresh=()=>{el.inert=!el.classList.contains('show');el.setAttribute('aria-hidden',String(el.inert))};new MutationObserver(refresh).observe(el,{attributes:true,attributeFilter:['class']});refresh()});
  // Focus is contained in active drawers and returns to the opener on dismissal.
  let focusPanel=null,returnFocus=null;
  document.addEventListener('keydown',e=>{
    const panel=panels.map($).find(el=>el&&!el.inert&&el.classList.contains('show')&&['accountDrawer','prefsDrawer','safetyDrawer','quickAlertSheet'].includes(el.id));
    if(!panel)return;
    if(e.key==='Escape'){const close=panel.querySelector('[data-account-close],.v258-drawer-close,.guest-drawer-close,#prefsCloseBtn,#safetyCloseBtn,#quickAlertCloseBtn');close?.click();return}
    if(e.key!=='Tab')return;
    const targets=[...panel.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[inert]'));
    if(!targets.length)return;
    if(e.shiftKey&&(document.activeElement===targets[0]||!panel.contains(document.activeElement))){e.preventDefault();targets.at(-1).focus()}
    else if(!e.shiftKey&&(document.activeElement===targets.at(-1)||!panel.contains(document.activeElement))){e.preventDefault();targets[0].focus()}
  });
  ['prefsDrawer','safetyDrawer','quickAlertSheet'].forEach(id=>{const el=$(id);if(!el)return;new MutationObserver(()=>{if(el.classList.contains('show')){if(focusPanel!==el){returnFocus=document.activeElement;focusPanel=el;requestAnimationFrame(()=>el.querySelector('button:not(:disabled),select')?.focus({preventScroll:true}))}}else if(focusPanel===el){focusPanel=null;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null}}).observe(el,{attributes:true,attributeFilter:['class']})});
  schedule();
})();
