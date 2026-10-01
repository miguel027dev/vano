(()=>{
  'use strict';
  const form=document.getElementById('onboardingForm');
  const root=document.querySelector('[data-ob500-root]');
  if(!form||!root||root.dataset.ob500Ready==='1')return;
  root.dataset.ob500Ready='1';

  const $=(s,p=document)=>p.querySelector(s);
  const $$=(s,p=document)=>[...p.querySelectorAll(s)];
  const steps=$$('[data-ob-step]',form);
  const progressSteps=$$('[data-ob-progress-step]');
  const name=$('#onboardingName');
  const age=$('#onboardingAge');
  const sexInputs=$$('input[name="sex"]',form);
  const localeInputs=$$('input[name="locale"]',form);
  const routeInputs=$$('input[name="route_preference"]',form);
  const mapInputs=$$('input[name="map_style"]',form);
  const night=$('#nightSafetyMode');
  const avoidInputs=$$('input[name="avoid_tolls"],input[name="avoid_unpaved"],input[name="avoid_ferries"]',form);
  const label=$('#obStepLabel');
  const bar=$('#obProgressBar');
  const spark=$('#ob500ProgressSpark');
  const xp=$('#ob500Xp');
  const previewMeter=$('#obPreviewMeter');
  const previewProgress=$('#ob500PreviewProgress');
  const preview=$('.ob500-preview');
  const profileMeter=$('#ob500ProfileMeter');
  const profileLevel=$('#ob500ProfileLevel');
  const liveInitial=$('#obLiveInitial');
  const liveGreeting=$('#obLiveGreeting');
  const idMeta=$('#ob500IdMeta');
  const previewInitial=$('#ob500PreviewInitial');
  const previewName=$('#ob500PreviewName');
  const previewState=$('#ob500PreviewState');
  const coreBadge=$('#ob500CoreBadge');
  const hudMode=$('#ob500HudMode');
  const hudCopy=$('#ob500HudCopy');
  const safetyValue=$('#ob500SafetyValue');
  const etaValue=$('#ob500EtaValue');
  const routeTag=$('#ob500PreviewRouteTag');
  const nightTag=$('#ob500PreviewNightTag');
  const mapSelected=$('#ob500MapSelected');
  const languageCurrent=$('#obLanguageCurrent');
  const languageCurrentFlag=$('#obLanguageCurrentFlag');
  const languageCurrentName=$('#obLanguageCurrentName');
  const summaryInitial=$('#obSummaryInitial');
  const summaryName=$('#obSummaryName');
  const summaryMeta=$('#obSummaryMeta');
  const summaryLocale=$('#obSummaryLocale');
  const summaryRoute=$('#ob500SummaryRoute');
  const summaryMap=$('#ob500SummaryMap');
  const summaryNight=$('#ob500SummaryNight');
  const finishBtn=$('.ob500-launch',form);
  const animationTimers=new WeakMap();
  let current=1;
  let launching=false;
  let lucideFrame=0;
  let keyboardTimer=0;

  const reduced=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const canMotion=()=>!reduced();
  const isMobile=()=>window.matchMedia?.('(max-width: 900px)').matches ?? window.innerWidth<=900;
  const vibrate=(ms=8)=>{try{if(!reduced())navigator.vibrate?.(ms)}catch(_){}};
  const selected=(inputs,fallback='')=>inputs.find(i=>i.checked)?.value||fallback;
  const firstName=()=>((name?.value||'').trim().split(/\s+/)[0]||'').slice(0,28);

  const localeNames={
    'pt-BR':'Português (Brasil)','pt-PT':'Português (Portugal)','en-US':'English',
    'fr-FR':'Français','ar-MA':'العربية','ru-RU':'Русский','es-ES':'Español'
  };
  const localeFlags={'pt-BR':'🇧🇷','pt-PT':'🇵🇹','en-US':'🇺🇸','fr-FR':'🇫🇷','ar-MA':'🇲🇦','ru-RU':'🇷🇺','es-ES':'🇪🇸'};
  const sexNames={female:'Feminino',male:'Masculino',intersex_other:'Outro / intersexo',prefer_not_say:'Privacidade'};
  const routeData={
    safety_first:{name:'Mais seguro',code:'GUARD',copy:'Segurança com prioridade maior',safety:'88%',eta:'21 min',icon:'shield-check'},
    balanced:{name:'Equilibrado',code:'SMART',copy:'Equilíbrio entre tempo e segurança',safety:'76%',eta:'18 min',icon:'sparkles'},
    fast_first:{name:'Mais rápido',code:'BOOST',copy:'Tempo e trânsito com peso maior',safety:'61%',eta:'15 min',icon:'gauge'}
  };
  const mapNames={auto:'Automático',day:'Dia',afternoon:'Tarde',night:'Escuro',rain:'Chuva'};

  function refreshIcons(){
    if(lucideFrame)return;
    lucideFrame=requestAnimationFrame(()=>{
      lucideFrame=0;
      try{window.lucide?.createIcons?.()}catch(_){}
    });
  }

  function retrigger(el,cls,duration=430){
    if(!el||!canMotion())return;
    const previous=animationTimers.get(el);
    if(previous)window.clearTimeout(previous);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const timer=window.setTimeout(()=>{
      el.classList.remove(cls);
      animationTimers.delete(el);
    },duration);
    animationTimers.set(el,timer);
  }

  function syncSelectionClasses(){
    sexInputs.forEach(input=>input.closest('.ob500-choice')?.classList.toggle('is-selected',input.checked));
    localeInputs.forEach(input=>input.closest('.ob500-language')?.classList.toggle('is-selected',input.checked));
    routeInputs.forEach(input=>input.closest('.ob500-route-card')?.classList.toggle('is-selected',input.checked));
    mapInputs.forEach(input=>input.closest('.ob500-map-card')?.classList.toggle('is-selected',input.checked));
    avoidInputs.forEach(input=>input.closest('label')?.classList.toggle('is-selected',input.checked));
    night?.closest('.ob500-power-toggle')?.classList.toggle('is-selected',Boolean(night.checked));
  }

  function clearErrors(){
    $$('.ob-invalid-v340',form).forEach(x=>x.classList.remove('ob-invalid-v340'));
    $$('.ob-inline-error-v340',form).forEach(x=>x.remove());
  }

  function invalidate(target,msg){
    const field=target?.closest?.('.ob500-field,.ob500-section-card,.ob-card-v340')||target;
    field?.classList.add('ob-invalid-v340');
    const host=field||target?.parentElement;
    if(host&&!$('.ob-inline-error-v340',host)){
      const e=document.createElement('div');
      e.className='ob-inline-error-v340';
      e.setAttribute('role','alert');
      e.textContent=msg;
      host.appendChild(e);
    }
    const focusTarget=target?.matches?.('input,button,select')?target:$('input,button,select',target||document);
    requestAnimationFrame(()=>{
      try{focusTarget?.focus?.({preventScroll:true})}catch(_){focusTarget?.focus?.()}
      window.setTimeout(()=>{
        try{host?.scrollIntoView?.({behavior:canMotion()?'smooth':'auto',block:'center',inline:'nearest'})}catch(_){}
      },50);
    });
    vibrate(18);
    return false;
  }

  function validateStep(step,{focus=true}={}){
    if(focus)clearErrors();
    if(step===1){
      const n=(name?.value||'').trim();
      const a=Number(age?.value);
      if(n.length<2)return focus?invalidate(name,'Digite um nome válido.'):false;
      if(!Number.isFinite(a)||a<13||a>100)return focus?invalidate(age,'Informe uma idade entre 13 e 100 anos.'):false;
      if(!selected(sexInputs))return focus?invalidate($('#onboardingSexField'),'Escolha uma opção para seu perfil.'):false;
    }
    if(step===2){
      if(!selected(routeInputs))return focus?invalidate($('.ob500-route-section'),'Escolha como o VANO deve priorizar suas rotas.'):false;
      if(!selected(mapInputs))return focus?invalidate($('.ob500-map-section'),'Escolha um visual para o mapa.'):false;
    }
    if(step===3&&!selected(localeInputs))return focus?invalidate($('.ob500-language-section'),'Escolha o idioma principal.'):false;
    return true;
  }

  function updateProfile(){
    const n=(name?.value||'').trim();
    const a=Number(age?.value);
    const sex=selected(sexInputs);
    const validName=n.length>=2;
    const validAge=Number.isFinite(a)&&a>=13&&a<=100;
    const done=[validName,validAge,Boolean(sex)].filter(Boolean).length;
    name?.closest('.ob500-field')?.classList.toggle('is-filled',validName);
    age?.closest('.ob500-field')?.classList.toggle('is-filled',validAge);
    if(profileLevel)profileLevel.textContent=`${done}/3`;
    if(profileMeter)profileMeter.style.width=`${done/3*100}%`;
    const initial=(n[0]||'V').toUpperCase();
    if(liveInitial)liveInitial.textContent=initial;
    if(previewInitial)previewInitial.textContent=initial;
    if(liveGreeting)liveGreeting.textContent=n?`Olá, ${firstName()}`:'Seu perfil VANO';
    if(previewName)previewName.textContent=n?firstName():'Seu VANO';
    if(idMeta){
      const bits=[];
      if(validAge)bits.push(`${a} anos`);
      if(sex)bits.push(sexNames[sex]);
      idMeta.textContent=bits.join(' · ')||'Novo explorador';
    }
  }

  function updateLanguage(animate=false){
    const loc=selected(localeInputs,'pt-BR');
    const checked=localeInputs.find(i=>i.checked);
    const holder=checked?.closest('.ob500-language');
    const text=holder?.dataset.languageLabel||localeNames[loc]||loc;
    const flag=holder?.dataset.languageFlag||localeFlags[loc]||'🌐';
    if(languageCurrentFlag)languageCurrentFlag.textContent=flag;
    if(languageCurrentName)languageCurrentName.textContent=text;
    if(summaryLocale)summaryLocale.textContent=text;
    if(animate)retrigger(languageCurrent,'is-changing',340);
  }

  function updateRoute(animate=false){
    const value=selected(routeInputs,'balanced');
    const d=routeData[value]||routeData.balanced;
    if(coreBadge){
      const b=$('b',coreBadge); if(b)b.textContent=d.name;
      if(animate)retrigger(coreBadge,'is-pulsing',480);
    }
    if(hudMode)hudMode.textContent=d.code;
    if(hudCopy)hudCopy.textContent=d.copy;
    if(safetyValue)safetyValue.textContent=d.safety;
    if(etaValue)etaValue.textContent=d.eta;
    if(summaryRoute)summaryRoute.textContent=d.name;
    if(routeTag){
      routeTag.innerHTML=`<i data-lucide="${d.icon}" width="12"></i> ${d.name}`;
      refreshIcons();
    }
    if(animate&&preview)retrigger(preview,'is-route-changing',720);
  }

  function updateMap(animate=false){
    const value=selected(mapInputs,'auto');
    const text=mapNames[value]||'Automático';
    if(mapSelected)mapSelected.textContent=text;
    if(summaryMap)summaryMap.textContent=text;
    if(preview){
      preview.dataset.mapSkin=value;
      if(animate)retrigger(preview,'is-map-changing',450);
    }
  }

  function updateNight(animate=false){
    const on=Boolean(night?.checked);
    if(summaryNight)summaryNight.textContent=on?'Proteção ativa':'Padrão';
    if(nightTag){
      nightTag.innerHTML=`<i data-lucide="${on?'moon-star':'moon'}" width="12"></i> ${on?'Noite ON':'Noite padrão'}`;
      refreshIcons();
    }
    if(animate)retrigger(night?.closest('.ob500-power-toggle'),'is-picked',500);
  }

  function updateSummary(){
    const n=(name?.value||'').trim()||'Seu nome';
    const a=Number(age?.value);
    const sex=selected(sexInputs);
    if(summaryInitial)summaryInitial.textContent=(n[0]||'V').toUpperCase();
    if(summaryName)summaryName.textContent=n;
    if(summaryMeta){
      const bits=[];
      if(Number.isFinite(a)&&a>=13&&a<=100)bits.push(`${a} anos`);
      if(sex)bits.push(sexNames[sex]);
      const avoidCount=avoidInputs.filter(i=>i.checked).length;
      if(avoidCount)bits.push(`${avoidCount} filtro${avoidCount>1?'s':''}`);
      summaryMeta.textContent=bits.join(' · ')||'Conta pronta para navegar';
    }
  }

  function renderAll({animate=false}={}){
    syncSelectionClasses();
    updateProfile();
    updateLanguage(animate);
    updateRoute(animate);
    updateMap(animate);
    updateNight(animate);
    updateSummary();
  }

  function updateProgress(){
    const pct=current/3*100;
    progressSteps.forEach(item=>{
      const step=Number(item.dataset.obProgressStep||0);
      const active=step===current;
      item.classList.toggle('is-active',active);
      item.classList.toggle('is-done',step<current);
      if(active)item.setAttribute('aria-current','step');
      else item.removeAttribute('aria-current');
    });
    if(label)label.textContent=`${current} de 3`;
    if(bar)bar.style.width=`${pct}%`;
    if(spark)spark.style.left=current===3?'calc(100% - 4px)':`${pct}%`;
    if(xp)xp.textContent=`${Math.round(pct)}%`;
    if(previewMeter)previewMeter.style.width=`${pct}%`;
    if(previewProgress)previewProgress.textContent=`${Math.round(pct)}%`;
    if(previewState)previewState.textContent=current===1?'IDENTIDADE':current===2?'CORE DE ROTA':'PRONTO PARA LAUNCH';
    document.documentElement.dataset.obStep=String(current);
  }

  function scrollStepTop(){
    const top=Math.max(0,root.getBoundingClientRect().top+window.scrollY);
    try{window.scrollTo({top,behavior:canMotion()?'smooth':'auto'})}catch(_){window.scrollTo(0,top)}
  }

  function setStep(next,{scroll=true}={}){
    const prev=current;
    current=Math.max(1,Math.min(3,next));
    steps.forEach(step=>{
      const active=Number(step.dataset.obStep)===current;
      step.classList.toggle('is-active',active);
      step.classList.toggle('is-back',active&&current<prev);
      step.setAttribute('aria-hidden',String(!active));
      if(active)step.removeAttribute('inert');
      else step.setAttribute('inert','');
    });
    updateProgress();
    if(current===3)updateSummary();
    if(current!==prev){
      vibrate(7);
      if(scroll)requestAnimationFrame(scrollStepTop);
    }
  }

  function removeErrorNear(target){
    target?.closest?.('.ob-invalid-v340')?.classList.remove('ob-invalid-v340');
    target?.closest?.('.ob500-field,.ob500-section-card,.ob-card-v340')?.querySelectorAll?.('.ob-inline-error-v340')?.forEach?.(x=>x.remove());
  }

  function updateKeyboardState(){
    window.clearTimeout(keyboardTimer);
    keyboardTimer=window.setTimeout(()=>{
      const active=document.activeElement;
      const textEntry=active&&form.contains(active)&&active.matches('input[type="text"],input[type="number"],input[type="email"],input[type="tel"],textarea');
      root.classList.toggle('is-input-focused',Boolean(isMobile()&&textEntry));
    },30);
  }

  form.addEventListener('focusin',updateKeyboardState);
  form.addEventListener('focusout',updateKeyboardState);
  window.visualViewport?.addEventListener('resize',updateKeyboardState,{passive:true});
  window.addEventListener('resize',updateKeyboardState,{passive:true});

  form.addEventListener('input',e=>{
    removeErrorNear(e.target);
    updateProfile();
    updateSummary();
  });

  form.addEventListener('change',e=>{
    removeErrorNear(e.target);
    syncSelectionClasses();
    if(e.target.matches('input[name="sex"]')){
      retrigger(e.target.closest('.ob500-choice'),'is-picked');
      vibrate(6);
    }
    if(e.target.matches('input[name="locale"]')){
      retrigger(e.target.closest('.ob500-language'),'is-picked');
      updateLanguage(true);
      vibrate(6);
    }
    if(e.target.matches('input[name="route_preference"]')){
      retrigger(e.target.closest('.ob500-route-card'),'is-picked');
      updateRoute(true);
      vibrate(10);
    }
    if(e.target.matches('input[name="map_style"]')){
      const card=e.target.closest('.ob500-map-card');
      retrigger(card,'is-picked');
      updateMap(true);
      if(isMobile()){
        window.setTimeout(()=>{try{card?.scrollIntoView?.({behavior:canMotion()?'smooth':'auto',block:'nearest',inline:'center'})}catch(_){}},40);
      }
      vibrate(7);
    }
    if(e.target===night){updateNight(true);vibrate(8)}
    if(avoidInputs.includes(e.target)){retrigger(e.target.closest('label'),'is-picked',350);vibrate(5)}
    updateProfile();
    updateSummary();
  });

  form.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.isComposing)return;
    if(e.target===name){
      e.preventDefault();
      try{age?.focus?.({preventScroll:false})}catch(_){age?.focus?.()}
      return;
    }
    if(e.target===age){
      e.preventDefault();
      age.blur();
      if(validateStep(1))setStep(2);
    }
  });

  $$('[data-ob-next]',form).forEach(btn=>btn.addEventListener('click',()=>{
    if(validateStep(current))setStep(current+1);
  }));
  $$('[data-ob-back]',form).forEach(btn=>btn.addEventListener('click',()=>setStep(current-1)));

  function createLaunchScreen(){
    if(reduced())return null;
    const layer=document.createElement('div');
    layer.className='ob500-launch-screen';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML='<div class="ob500-launch-core"><span><i data-lucide="navigation" width="30"></i></span><b>VANO ONLINE</b><small>Carregando seu mapa…</small></div><i class="ring r1"></i><i class="ring r2"></i><i class="ring r3"></i>';
    document.body.appendChild(layer);
    refreshIcons();
    requestAnimationFrame(()=>layer.classList.add('is-visible'));
    return layer;
  }

  function revealInvalidStep(step){
    setStep(step);
    window.setTimeout(()=>validateStep(step,{focus:true}),canMotion()?320:20);
  }

  form.addEventListener('submit',e=>{
    if(launching){e.preventDefault();return}
    for(const step of [1,2,3]){
      if(!validateStep(step,{focus:false})){
        e.preventDefault();
        clearErrors();
        revealInvalidStep(step);
        return;
      }
    }
    e.preventDefault();
    launching=true;
    renderAll();
    form.setAttribute('aria-busy','true');
    if(finishBtn){
      finishBtn.disabled=true;
      finishBtn.classList.add('is-loading');
      finishBtn.dataset.originalLabel=$('span',finishBtn)?.textContent||'Ativar meu VANO';
      const t=$('span',finishBtn); if(t)t.textContent='Ativando VANO…';
    }
    vibrate(16);
    const layer=createLaunchScreen();
    const delay=layer?680:20;
    window.setTimeout(()=>HTMLFormElement.prototype.submit.call(form),delay);
  });

  window.addEventListener('pageshow',()=>{
    launching=false;
    form.setAttribute('aria-busy','false');
    $$('.ob500-launch-screen').forEach(x=>x.remove());
    if(finishBtn){
      finishBtn.disabled=false;
      finishBtn.classList.remove('is-loading');
      const t=$('span',finishBtn); if(t)t.textContent=finishBtn.dataset.originalLabel||'Ativar meu VANO';
    }
    updateKeyboardState();
  });

  renderAll();
  setStep(1,{scroll:false});
  updateKeyboardState();
  refreshIcons();
})();
