(()=>{
  'use strict';
  const root=document.documentElement;
  const ready=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.add('v268-ready')));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
  document.addEventListener('visibilitychange',()=>root.classList.toggle('v268-page-hidden',document.hidden),{passive:true});
})();
