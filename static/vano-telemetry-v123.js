/* Readable VANO source; runtime eval/encoded wrapper removed. */
(()=>{
  'use strict';
  const csrf=window.VANO?.csrf||'';
  if(!csrf)return;
  const endpoint='/api/telemetry/event';
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,100);
  const page=()=>location.pathname;
  function safeHref(el){
    const raw=el?.getAttribute?.('href');if(!raw)return'';
    try{const u=new URL(raw,location.href);return u.origin===location.origin?u.pathname:''}catch{return''}
  }
  function labelFor(el){
    const tag=String(el?.tagName||'').toUpperCase();
    if(['INPUT','TEXTAREA','SELECT','OPTION'].includes(tag))return clean(el?.getAttribute?.('aria-label')||el?.getAttribute?.('name')||el?.getAttribute?.('type')||tag);
    // Search-result text can contain a precise address. Record the action without
    // copying that personal location into the audit database.
    if(el?.closest?.('.search-results'))return 'resultado de busca';
    return clean(el?.getAttribute?.('aria-label')||el?.getAttribute?.('title')||((tag==='BUTTON'||tag==='A')?el?.textContent:''));
  }
  function send(event_type,el,extra={}){
    try{
      const tag=String(el?.tagName||extra.target||'').toLowerCase().slice(0,80);
      const payload={event_type,target:tag,element_id:clean(el?.id),classes:clean(el?.className),label:labelFor(el),href:safeHref(el),page:page(),...extra};
      fetch(endpoint,{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload)}).catch(()=>{});
    }catch{}
  }
  document.addEventListener('click',ev=>{
    const el=ev.target?.closest?.('button,a,[role="button"],input[type="submit"],input[type="button"]')||ev.target;
    if(!el)return;send('click',el);
  },{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>send('visibility',document.documentElement,{label:document.visibilityState}),{passive:true});
  window.addEventListener('pageshow',()=>send('navigation',document.documentElement,{label:'pageshow'}),{once:true,passive:true});
})();
