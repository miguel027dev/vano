(()=>{
  const root=document.querySelector('[data-profile-root]');
  if(!root)return;
  const form=document.getElementById('settings');
  const runtime=window.VANO_RUNTIME||{};
  const csrf=window.VANO?.csrf||'';
  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const saveBtn=document.getElementById('profileSaveBtn');
  const saveTitle=document.getElementById('profileSaveTitle');
  const saveHint=document.getElementById('profileSaveHint');
  const nav=[...root.querySelectorAll('.profile350-nav a[href^="#"]')];
  const sections=[...root.querySelectorAll('[data-profile-section]')];
  let dirty=false,submitting=false;

  const setSaveState=(state)=>{
    root.dataset.saveState=state;
    if(state==='dirty'){
      if(saveTitle)saveTitle.textContent='Alterações pendentes';
      if(saveHint)saveHint.textContent='Revise e salve quando terminar.';
      if(saveBtn)saveBtn.disabled=false;
    }else if(state==='saving'){
      if(saveTitle)saveTitle.textContent='Salvando…';
      if(saveHint)saveHint.textContent='Aplicando suas preferências.';
      if(saveBtn){saveBtn.disabled=true;saveBtn.setAttribute('aria-busy','true');}
    }else{
      if(saveTitle)saveTitle.textContent='Tudo salvo';
      if(saveHint)saveHint.textContent='Suas preferências estão atualizadas.';
      if(saveBtn){saveBtn.disabled=true;saveBtn.removeAttribute('aria-busy');}
    }
  };
  const markDirty=()=>{if(submitting)return;dirty=true;setSaveState('dirty');};
  form?.querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.type==='hidden'||el.readOnly)return;
    el.addEventListener('input',markDirty,{passive:true});
    el.addEventListener('change',markDirty,{passive:true});
  });
  form?.addEventListener('submit',()=>{submitting=true;setSaveState('saving');form.setAttribute('aria-busy','true');});

  const languageSummary=root.querySelector('[data-selected-language]');
  const updateLanguage=(card)=>{
    root.querySelectorAll('[data-language-card]').forEach(item=>item.classList.toggle('is-selected',item===card));
    if(!card||!languageSummary)return;
    languageSummary.innerHTML=`<span>${card.dataset.flag||''}</span><b>${card.dataset.name||''}</b><small>${card.dataset.region||''}</small>`;
    languageSummary.classList.remove('is-pop');
    requestAnimationFrame(()=>languageSummary.classList.add('is-pop'));
  };
  root.querySelectorAll('[data-language-card] input').forEach(input=>input.addEventListener('change',()=>updateLanguage(input.closest('[data-language-card]'))));

  const setActiveNav=(id)=>nav.forEach(a=>a.classList.toggle('is-active',a.getAttribute('href')===`#${id}`));
  nav.forEach(a=>a.addEventListener('click',event=>{
    const target=document.querySelector(a.getAttribute('href'));
    if(!target)return;
    event.preventDefault();
    setActiveNav(target.id);
    target.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'});
    history.replaceState(null,'',`#${target.id}`);
  }));
  if('IntersectionObserver' in window){
    const spy=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible)setActiveNav(visible.target.id);
    },{rootMargin:'-18% 0px -62% 0px',threshold:[0,.15,.35,.6]});
    sections.forEach(s=>spy.observe(s));
    const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');reveal.unobserve(entry.target)}}),{rootMargin:'0px 0px -8% 0px',threshold:.08});
    root.querySelectorAll('.profile350-reveal').forEach(el=>reveal.observe(el));
  }else root.querySelectorAll('.profile350-reveal').forEach(el=>el.classList.add('is-visible'));

  if(location.hash){const target=document.querySelector(location.hash);if(target)setTimeout(()=>target.scrollIntoView({behavior:'auto',block:'start'}),30);}

  const inviteBtn=document.getElementById('createFamilyInvite');
  const inviteBox=document.getElementById('inviteBox');
  const inviteUrl=document.getElementById('inviteUrl');
  const copyInvite=document.getElementById('copyInvite');
  inviteBtn?.addEventListener('click',async()=>{
    runtime.setBusy?.(inviteBtn,true,'Criando convite…');
    try{
      const {data}=await runtime.fetchJSON('/api/family-invite',{method:'POST',headers:{'X-CSRF-Token':csrf}},12000);
      inviteUrl.value=data.url||'';
      inviteBox?.classList.add('show');
      inviteBox?.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'nearest'});
      inviteUrl?.focus();inviteUrl?.select();
    }catch(e){runtime.toast?.(e.message||'Não foi possível criar o convite.','error')}
    finally{runtime.setBusy?.(inviteBtn,false)}
  });
  copyInvite?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(inviteUrl?.value||'');copyInvite.textContent='Copiado';runtime.toast?.('Link copiado.','success',2200);setTimeout(()=>copyInvite.textContent='Copiar',1600)}
    catch{inviteUrl?.select();document.execCommand('copy')}
  });
  root.querySelectorAll('[data-remove-link]').forEach(btn=>btn.addEventListener('click',async()=>{
    const ok=await (runtime.confirm?.({title:'Remover vínculo?',message:'Essa conta deixará de receber os avisos vinculados ao seu perfil.',confirmText:'Remover',danger:true})??Promise.resolve(false));
    if(!ok)return;
    runtime.setBusy?.(btn,true);
    try{await runtime.fetchJSON(`/api/family-link/${btn.dataset.removeLink}/remove`,{method:'POST',headers:{'X-CSRF-Token':csrf}},12000);location.reload()}
    catch(e){runtime.setBusy?.(btn,false);runtime.toast?.(e.message||'Não foi possível remover o vínculo.','error')}
  }));

  const deleteForm=document.getElementById('accountDeleteForm');
  deleteForm?.addEventListener('submit',async event=>{
    if(deleteForm.dataset.confirmed==='1')return;
    event.preventDefault();
    const ok=await (runtime.confirm?.({title:'Excluir sua conta permanentemente?',message:'Essa ação não pode ser desfeita. Confirme somente se deseja remover sua conta VANO MAPS.',confirmText:'Excluir conta',danger:true})??Promise.resolve(false));
    if(ok){deleteForm.dataset.confirmed='1';deleteForm.requestSubmit();}
  });
  window.addEventListener('beforeunload',event=>{if(dirty&&!submitting){event.preventDefault();event.returnValue=''}});
  window.addEventListener('pageshow',()=>{if(!submitting)setSaveState(dirty?'dirty':'saved')});
  setSaveState('saved');
})();
