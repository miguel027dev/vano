(()=>{
  const form=document.getElementById('settings');
  if(!form)return;

  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const details=[...form.querySelectorAll('details.profile-v72-detail')];
  const navLinks=[...document.querySelectorAll('.profile-v108-quicknav a[href^="#"]')];
  const save=document.getElementById('profileSaveBtn');
  const saveHint=document.getElementById('profileSaveHint');
  const invite=document.getElementById('createFamilyInvite');
  const copy=document.getElementById('copyInvite');

  const setCurrent=(id)=>navLinks.forEach(link=>{
    const active=link.getAttribute('href')===`#${id}`;
    link.classList.toggle('is-current',active);
    if(active)link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
  });

  details.forEach(detail=>{
    detail.addEventListener('toggle',()=>{
      if(detail.open)setCurrent(detail.id);
    });
    detail.querySelector('summary')?.addEventListener('click',event=>{
      if(event.detail===0)return;
      const icon=detail.querySelector('.profile-v72-detail-icon');
      icon?.classList.remove('profile-v343-pulse');
      requestAnimationFrame(()=>icon?.classList.add('profile-v343-pulse'));
    });
  });

  navLinks.forEach(link=>link.addEventListener('click',event=>{
    const target=document.querySelector(link.getAttribute('href'));
    if(!(target instanceof HTMLDetailsElement))return;
    event.preventDefault();
    target.open=true;
    setCurrent(target.id);
    requestAnimationFrame(()=>target.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'}));
    history.replaceState(null,'',`#${target.id}`);
  }));

  const firstOpen=details.find(item=>item.open);
  if(location.hash && document.querySelector(location.hash)?.matches?.('details.profile-v72-detail')) setCurrent(location.hash.slice(1));
  else if(firstOpen)setCurrent(firstOpen.id);

  form.addEventListener('input',event=>{
    const field=event.target.closest('.profile-v72-field,.profile-v72-place,.profile-v72-nav-pref,.profile-v72-map-style,.profile-v72-accent');
    if(!field)return;
    field.classList.remove('profile-v343-pulse');
    requestAnimationFrame(()=>field.classList.add('profile-v343-pulse'));
    setTimeout(()=>field.classList.remove('profile-v343-pulse'),420);
  },{passive:true});

  form.addEventListener('submit',()=>{
    form.setAttribute('aria-busy','true');
    save?.setAttribute('aria-busy','true');
    save?.setAttribute('disabled','');
    if(saveHint)saveHint.textContent='Salvando suas preferências…';
  });

  invite?.addEventListener('click',()=>{
    invite.setAttribute('aria-busy','true');
    const observer=new MutationObserver(()=>{
      if(!invite.disabled && !invite.classList.contains('is-busy')){
        invite.removeAttribute('aria-busy');
        observer.disconnect();
      }
    });
    observer.observe(invite,{attributes:true,attributeFilter:['disabled','class']});
    setTimeout(()=>{invite.removeAttribute('aria-busy');observer.disconnect()},13000);
  },{capture:true});

  copy?.addEventListener('click',()=>{
    const old=copy.textContent;
    copy.classList.add('profile-v343-pulse');
    setTimeout(()=>copy.classList.remove('profile-v343-pulse'),400);
    setTimeout(()=>{if(copy.textContent==='Copiado')copy.textContent=old||'Copiar'},1800);
  });

  window.addEventListener('pageshow',()=>{
    form.setAttribute('aria-busy','false');
    save?.removeAttribute('aria-busy');
    save?.removeAttribute('disabled');
  });
})();
