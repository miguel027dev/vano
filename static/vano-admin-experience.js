(()=>{
  const root=document.querySelector('[data-admin350-root]');
  if(!root)return;
  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const revealEls=[...root.querySelectorAll('.admin350-reveal')];
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target)}}),{rootMargin:'0px 0px -5% 0px',threshold:.06});
    revealEls.forEach((el,i)=>{el.style.setProperty('--admin-delay',`${Math.min(i*35,180)}ms`);io.observe(el)});
  }else revealEls.forEach(el=>el.classList.add('is-visible'));

  root.querySelector('[data-admin-jump-top]')?.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduceMotion()?'auto':'smooth'}));

  const updated=document.getElementById('infraUpdated');
  if(updated){
    const observer=new MutationObserver(()=>{updated.classList.remove('is-fresh');requestAnimationFrame(()=>updated.classList.add('is-fresh'));setTimeout(()=>updated.classList.remove('is-fresh'),550)});
    observer.observe(updated,{childList:true,characterData:true,subtree:true});
  }

  root.querySelectorAll('.node-filter').forEach(btn=>btn.addEventListener('click',()=>{
    root.querySelectorAll('.node-filter').forEach(other=>other.classList.toggle('active',other===btn));
  }));

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const modal=document.getElementById('nodeConfigModal');
    if(modal&&!modal.hidden)modal.querySelector('[data-close-node-modal]')?.click();
  });
})();
