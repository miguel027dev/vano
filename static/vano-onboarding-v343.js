(()=>{
  const form=document.getElementById('onboardingForm');
  if(!form)return;

  const steps=[...form.querySelectorAll('[data-ob-step]')];
  const progressSteps=[...document.querySelectorAll('[data-ob-progress-step]')];
  const label=document.getElementById('obStepLabel');
  const bar=document.getElementById('obProgressBar');
  const meter=document.getElementById('obPreviewMeter');
  const previewTitle=document.getElementById('obPreviewTitle');
  const previewText=document.getElementById('obPreviewText');
  const name=document.getElementById('onboardingName');
  const age=document.getElementById('onboardingAge');
  const sexInputs=[...form.querySelectorAll('input[name="sex"]')];
  const localeInputs=[...form.querySelectorAll('input[name="locale"]')];
  const summaryName=document.getElementById('obSummaryName');
  const summaryMeta=document.getElementById('obSummaryMeta');
  const summaryLocale=document.getElementById('obSummaryLocale');
  const summaryInitial=document.getElementById('obSummaryInitial');
  const profileStatus=document.getElementById('obProfileStatus');
  const liveInitial=document.getElementById('obLiveInitial');
  const liveGreeting=document.getElementById('obLiveGreeting');
  const languageCurrent=document.getElementById('obLanguageCurrent');
  const languageCurrentFlag=document.getElementById('obLanguageCurrentFlag');
  const languageCurrentName=document.getElementById('obLanguageCurrentName');
  let current=1;

  const localeNames={
    'pt-BR':'Português (Brasil)',
    'pt-PT':'Português (Portugal)',
    'en-US':'English',
    'fr-FR':'Français',
    'ar-MA':'العربية',
    'ru-RU':'Русский',
    'es-ES':'Español'
  };
  const localeFlags={'pt-BR':'🇧🇷','pt-PT':'🇵🇹','en-US':'🇺🇸','fr-FR':'🇫🇷','ar-MA':'🇲🇦','ru-RU':'🇷🇺','es-ES':'🇪🇸'};
  const sexNames={female:'Feminino',male:'Masculino',intersex_other:'Outro / intersexo',prefer_not_say:'Prefere não informar'};
  const motion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const getSexValue=()=>sexInputs.find(i=>i.checked)?.value||'';
  const getLocaleValue=()=>localeInputs.find(i=>i.checked)?.value||'pt-BR';

  const retrigger=(el,className,duration=380)=>{
    if(!el||!motion())return;
    el.classList.remove(className);
    requestAnimationFrame(()=>{
      el.classList.add(className);
      setTimeout(()=>el.classList.remove(className),duration);
    });
  };

  function clearErrors(){
    form.querySelectorAll('.ob-invalid-v340').forEach(x=>x.classList.remove('ob-invalid-v340'));
    form.querySelectorAll('.ob-inline-error-v340').forEach(x=>x.remove());
  }

  function invalidate(target,msg){
    const field=target?.closest?.('.ob-field-v340')||target?.closest?.('.ob-card-v340')||target;
    field?.classList.add('ob-invalid-v340');
    const host=target?.closest?.('.ob-field-v340')||target?.closest?.('.ob-card-v340')||target?.parentElement||field;
    if(host && !host.querySelector('.ob-inline-error-v340')){
      const e=document.createElement('div');
      e.className='ob-inline-error-v340';
      e.textContent=msg;
      host.appendChild(e);
    }
    const focusTarget=target?.focus?target:(target?.querySelector?.('input,button,select')||null);
    focusTarget?.focus?.({preventScroll:true});
    try{host?.scrollIntoView?.({behavior:motion()?'smooth':'auto',block:'center'})}catch{}
    return false;
  }

  function validateStep(step){
    clearErrors();
    if(step===1){
      const n=(name?.value||'').trim();
      if(n.length<2)return invalidate(name,'Digite um nome válido.');
      const a=Number(age?.value);
      if(!Number.isFinite(a)||a<13||a>100)return invalidate(age,'Informe uma idade entre 13 e 100 anos.');
      if(!getSexValue())return invalidate(document.getElementById('onboardingSexField'),'Escolha uma opção de sexo.');
    }
    if(step===2 && !form.querySelector('input[name="locale"]:checked')){
      return invalidate(form.querySelector('.ob-language-grid-v340')||form,'Escolha um idioma.');
    }
    return true;
  }

  function updateFieldStates(){
    name?.closest('.ob-field-v340')?.classList.toggle('is-filled',(name.value||'').trim().length>=2);
    const a=Number(age?.value);
    age?.closest('.ob-field-v340')?.classList.toggle('is-filled',Number.isFinite(a)&&a>=13&&a<=100);

    const completed=[
      (name?.value||'').trim().length>=2,
      Number.isFinite(a)&&a>=13&&a<=100,
      Boolean(getSexValue())
    ].filter(Boolean).length;

    if(liveInitial||liveGreeting){
      const n=(name?.value||'').trim();
      if(liveInitial)liveInitial.textContent=(n.slice(0,1)||'V').toUpperCase();
      if(liveGreeting)liveGreeting.textContent=n?`Olá, ${n.split(/\s+/)[0]}`:'Seu perfil VANO';
    }

    if(profileStatus){
      profileStatus.querySelector('b')?.replaceChildren(document.createTextNode(`${completed}/3`));
      const small=profileStatus.querySelector('small');
      if(small)small.textContent=completed===3?'pronto':'preenchidos';
      profileStatus.classList.toggle('is-complete',completed===3);
    }
  }

  function updateLanguageCurrent(animate=false){
    const loc=getLocaleValue();
    const checked=localeInputs.find(i=>i.checked);
    const holder=checked?.closest('.ob-language-v340');
    const displayName=holder?.dataset.languageLabel||localeNames[loc]||loc;
    const displayFlag=holder?.dataset.languageFlag||localeFlags[loc]||'🌐';
    if(languageCurrentFlag)languageCurrentFlag.textContent=displayFlag;
    if(languageCurrentName)languageCurrentName.textContent=displayName;
    if(animate)retrigger(languageCurrent,'is-changing',340);
  }

  function updateSummary(){
    const n=(name?.value||'').trim()||'Seu nome';
    const a=Number(age?.value);
    const sex=getSexValue();
    const loc=getLocaleValue();
    if(summaryName)summaryName.textContent=n;
    if(summaryInitial)summaryInitial.textContent=n.slice(0,1).toUpperCase();
    if(summaryMeta)summaryMeta.textContent=[Number.isFinite(a)&&a?`${a} anos`:'',sexNames[sex]||''].filter(Boolean).join(' · ')||'Conta pronta para navegar';
    if(summaryLocale)summaryLocale.textContent=localeNames[loc]||loc;
  }

  function updateProgress(){
    progressSteps.forEach(item=>{
      const step=Number(item.dataset.obProgressStep||0);
      item.classList.toggle('is-active',step===current);
      item.classList.toggle('is-done',step<current);
    });
  }

  function setStep(next){
    const previous=current;
    current=Math.max(1,Math.min(3,next));
    steps.forEach(s=>{
      const active=Number(s.dataset.obStep)===current;
      s.classList.toggle('is-active',active);
      s.setAttribute('aria-hidden',String(!active));
    });
    document.documentElement.dataset.obStep=String(current);
    if(label)label.textContent=`${current} de 3`;
    const pct=`${current/3*100}%`;
    if(bar)bar.style.width=pct;
    if(meter)meter.style.width=pct;
    updateProgress();

    if(previewTitle&&previewText){
      const copy=current===1
        ? ['Seu perfil, em poucos toques.','Preencha o essencial e avance direto para o mapa.']
        : current===2
        ? ['Seu idioma, seu VANO.','Escolha como o aplicativo fala com você.']
        : ['Pronto para a primeira rota.','Abra o mapa, pesquise um destino e comece a navegar.'];
      previewTitle.textContent=copy[0];
      previewText.textContent=copy[1];
    }
    if(current===3)updateSummary();
    const active=steps.find(s=>Number(s.dataset.obStep)===current);
    if(active&&current!==previous&&motion()){
      const cls=current>previous?'v351-step-forward':'v351-step-back';
      active.classList.remove('v351-step-forward','v351-step-back');
      requestAnimationFrame(()=>{active.classList.add(cls);setTimeout(()=>active.classList.remove(cls),460)});
    }
    try{active?.scrollIntoView({behavior:motion()?'smooth':'auto',block:'start'})}catch{}
    window.scrollTo?.({top:0,behavior:'auto'});
  }

  form.querySelectorAll('[data-ob-next]').forEach(btn=>btn.addEventListener('click',()=>{
    if(validateStep(current))setStep(current+1);
  }));
  form.querySelectorAll('[data-ob-back]').forEach(btn=>btn.addEventListener('click',()=>setStep(current-1)));

  form.addEventListener('input',e=>{
    e.target.closest?.('.ob-invalid-v340')?.classList.remove('ob-invalid-v340');
    e.target.closest?.('.ob-field-v340,.ob-card-v340')?.querySelectorAll?.('.ob-inline-error-v340')?.forEach?.(x=>x.remove());
    updateFieldStates();
    updateSummary();
  });

  form.addEventListener('change',e=>{
    e.target.closest?.('.ob-invalid-v340')?.classList.remove('ob-invalid-v340');
    if(e.target.matches('input[name="sex"]'))retrigger(e.target.closest('.ob-choice-v340'),'is-picked');
    if(e.target.matches('input[name="locale"]')){
      retrigger(e.target.closest('.ob-language-v340'),'is-picked');
      updateLanguageCurrent(true);
    }
    updateFieldStates();
    updateSummary();
  });

  form.addEventListener('submit',e=>{
    if(!validateStep(1)){e.preventDefault();setStep(1);return}
    if(!validateStep(2)){e.preventDefault();setStep(2);return}
    updateSummary();
    const submit=form.querySelector('.ob-finish-v340');
    if(submit){
      form.setAttribute('aria-busy','true');
      submit.disabled=true;
      submit.setAttribute('aria-busy','true');
      submit.classList.add('is-loading');
      const submitLabel=submit.querySelector('span');
      if(submitLabel)submitLabel.textContent='Abrindo o mapa…';
    }
  });

  window.addEventListener('pageshow',()=>{
    form.setAttribute('aria-busy','false');
    const submit=form.querySelector('.ob-finish-v340');
    if(submit){
      submit.disabled=false;
      submit.removeAttribute('aria-busy');
      submit.classList.remove('is-loading');
      const text=submit.querySelector('span');
      if(text)text.textContent='Abrir mapa e calcular uma rota';
    }
  });

  updateFieldStates();
  updateLanguageCurrent(false);
  updateSummary();
  setStep(1);
  window.lucide?.createIcons?.();
})();
