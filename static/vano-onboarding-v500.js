(()=>{
  'use strict';
  const form=document.getElementById('onboardingForm');
  const root=document.querySelector('[data-ob500-root]');
  if(!form||!root)return;

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
  let current=1;
  let launching=false;

  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canMotion=()=>!reduced();
  const vibrate=(ms=8)=>{try{navigator.vibrate?.(ms)}catch(_){}};
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

  function retrigger(el,cls,duration=430){
    if(!el||!canMotion())return;
    el.classList.remove(cls);
    requestAnimationFrame(()=>{
      el.classList.add(cls);
      window.setTimeout(()=>el.classList.remove(cls),duration);
    });
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
      e.textContent=msg;
      host.appendChild(e);
    }
    const focusTarget=target?.matches?.('input,button,select')?target:$('input,button,select',target||document);
    try{focusTarget?.focus?.({preventScroll:true})}catch(_){focusTarget?.focus?.()}
    window.setTimeout(()=>{try{host?.scrollIntoView?.({behavior:canMotion()?'smooth':'auto',block:'center'})}catch(_){}},40);
    vibrate(18);
    return false;
  }

  function validateStep(step){
    clearErrors();
    if(step===1){
      const n=(name?.value||'').trim();
      const a=Number(age?.value);
      if(n.length<2)return invalidate(name,'Digite um nome válido.');
      if(!Number.isFinite(a)||a<13||a>100)return invalidate(age,'Informe uma idade entre 13 e 100 anos.');
      if(!selected(sexInputs))return invalidate($('#onboardingSexField'),'Escolha uma opção para seu perfil.');
    }
    if(step===2){
      if(!selected(routeInputs))return invalidate($('.ob500-route-section'),'Escolha como o VANO deve priorizar suas rotas.');
      if(!selected(mapInputs))return invalidate($('.ob500-map-section'),'Escolha um visual para o mapa.');
    }
    if(step===3&&!selected(localeInputs))return invalidate($('.ob500-language-section'),'Escolha o idioma principal.');
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
    if(routeTag)routeTag.innerHTML=`<i data-lucide="${d.icon}" width="12"></i> ${d.name}`;
    if(animate&&preview)retrigger(preview,'is-route-changing',720);
    window.lucide?.createIcons?.();
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
    if(nightTag)nightTag.innerHTML=`<i data-lucide="${on?'moon-star':'moon'}" width="12"></i> ${on?'Noite ON':'Noite padrão'}`;
    if(animate)retrigger(night?.closest('.ob500-power-toggle'),'is-picked',500);
    window.lucide?.createIcons?.();
  }

  function updateSummary(){
    const n=(name?.value||'').trim()||'Seu nome';
    const a=Number(age?.value);
    const sex=selected(sexInputs);
    if(summaryInitial)summaryInitial.textContent=(n[0]||'V').toUpperCase();
    if(summaryName)summaryName.textContent=n;
    if(summaryMeta){
      const bits=[];
      if(Number.isFinite(a)&&a)bits.push(`${a} anos`);
      if(sex)bits.push(sexNames[sex]);
      const avoidCount=avoidInputs.filter(i=>i.checked).length;
      if(avoidCount)bits.push(`${avoidCount} filtro${avoidCount>1?'s':''}`);
      summaryMeta.textContent=bits.join(' · ')||'Conta pronta para navegar';
    }
    updateLanguage(false);
    updateRoute(false);
    updateMap(false);
    updateNight(false);
  }

  function updateProgress(){
    const pct=current/3*100;
    progressSteps.forEach(item=>{
      const step=Number(item.dataset.obProgressStep||0);
      item.classList.toggle('is-active',step===current);
      item.classList.toggle('is-done',step<current);
    });
    if(label)label.textContent=`${current} de 3`;
    if(bar)bar.style.width=`${pct}%`;
    if(spark)spark.style.left=`${pct}%`;
    if(xp)xp.textContent=`${Math.round(pct)}%`;
    if(previewMeter)previewMeter.style.width=`${pct}%`;
    if(previewProgress)previewProgress.textContent=`${Math.round(pct)}%`;
    if(previewState)previewState.textContent=current===1?'IDENTIDADE':current===2?'CORE DE ROTA':'PRONTO PARA LAUNCH';
    document.documentElement.dataset.obStep=String(current);
  }

  function scrollStepTop(){
    const target=root.getBoundingClientRect().top+window.scrollY;
    const top=Math.max(0,target);
    try{window.scrollTo({top,behavior:canMotion()?'smooth':'auto'})}catch(_){window.scrollTo(0,top)}
  }

  function setStep(next){
    const prev=current;
    current=Math.max(1,Math.min(3,next));
    steps.forEach(step=>{
      const active=Number(step.dataset.obStep)===current;
      step.classList.toggle('is-active',active);
      step.classList.toggle('is-back',active&&current<prev);
      step.setAttribute('aria-hidden',String(!active));
    });
    updateProgress();
    if(current===3)updateSummary();
    if(current!==prev){
      vibrate(7);
      requestAnimationFrame(scrollStepTop);
    }
  }

  function removeErrorNear(target){
    target?.closest?.('.ob-invalid-v340')?.classList.remove('ob-invalid-v340');
    target?.closest?.('.ob500-field,.ob500-section-card,.ob-card-v340')?.querySelectorAll?.('.ob-inline-error-v340')?.forEach?.(x=>x.remove());
  }

  form.addEventListener('input',e=>{
    removeErrorNear(e.target);
    updateProfile();
    updateSummary();
  });

  form.addEventListener('change',e=>{
    removeErrorNear(e.target);
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
      retrigger(e.target.closest('.ob500-map-card'),'is-picked');
      updateMap(true);
      vibrate(7);
    }
    if(e.target===night){updateNight(true);vibrate(8)}
    if(avoidInputs.includes(e.target)){retrigger(e.target.parentElement,'is-picked',350);vibrate(5)}
    updateProfile();
    updateSummary();
  });

  $$('[data-ob-next]',form).forEach(btn=>btn.addEventListener('click',()=>{
    if(validateStep(current))setStep(current+1);
  }));
  $$('[data-ob-back]',form).forEach(btn=>btn.addEventListener('click',()=>setStep(current-1)));

  function createLaunchScreen(){
    if(reduced())return null;
    const layer=document.createElement('div');
    layer.className='ob500-launch-screen';
    layer.innerHTML='<div class="ob500-launch-core"><span><i data-lucide="navigation" width="30"></i></span><b>VANO ONLINE</b><small>Carregando seu mapa…</small></div><i class="ring r1"></i><i class="ring r2"></i><i class="ring r3"></i>';
    document.body.appendChild(layer);
    window.lucide?.createIcons?.();
    requestAnimationFrame(()=>layer.classList.add('is-visible'));
    return layer;
  }

  form.addEventListener('submit',e=>{
    if(launching){e.preventDefault();return}
    if(!validateStep(1)){e.preventDefault();setStep(1);return}
    if(!validateStep(2)){e.preventDefault();setStep(2);return}
    if(!validateStep(3)){e.preventDefault();setStep(3);return}
    e.preventDefault();
    launching=true;
    updateSummary();
    form.setAttribute('aria-busy','true');
    if(finishBtn){
      finishBtn.disabled=true;
      finishBtn.classList.add('is-loading');
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
      const t=$('span',finishBtn); if(t)t.textContent='Ativar meu VANO';
    }
  });

  updateProfile();
  updateLanguage(false);
  updateRoute(false);
  updateMap(false);
  updateNight(false);
  updateSummary();
  setStep(1);
  window.lucide?.createIcons?.();
})();
