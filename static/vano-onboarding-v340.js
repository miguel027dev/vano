(()=>{
  const form=document.getElementById('onboardingForm');
  if(!form)return;
  const steps=[...form.querySelectorAll('[data-ob-step]')];
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
  let current=1;

  const localeNames={'pt-BR':'Português','en-US':'English','ar-MA':'العربية','ru-RU':'Русский','es-ES':'Español'};
  const sexNames={female:'Feminino',male:'Masculino',intersex_other:'Outro / intersexo',prefer_not_say:'Prefere não informar'};
  const motion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const getSexValue=()=>sexInputs.find(i=>i.checked)?.value||'';
  const getLocaleValue=()=>localeInputs.find(i=>i.checked)?.value||'pt-BR';

  function clearErrors(){
    form.querySelectorAll('.ob-invalid-v340').forEach(x=>x.classList.remove('ob-invalid-v340'));
    form.querySelectorAll('.ob-inline-error-v340').forEach(x=>x.remove());
  }

  function invalidate(target,msg){
    const field=target?.closest('.ob-field-v340')||target?.closest('.ob-card-v340')||target;
    field?.classList.add('ob-invalid-v340');
    const host=target?.closest('.ob-field-v340')||target?.closest('.ob-card-v340')||target?.parentElement||field;
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
      const selectedSex=getSexValue();
      if(!selectedSex)return invalidate(document.getElementById('onboardingSexField'),'Escolha uma opção de sexo.');
    }
    if(step===2 && !form.querySelector('input[name="locale"]:checked')){
      return invalidate(form.querySelector('.ob-language-grid-v340')||form,'Escolha um idioma.');
    }
    return true;
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

  function setStep(next){
    current=Math.max(1,Math.min(3,next));
    steps.forEach(s=>{
      const active=Number(s.dataset.obStep)===current;
      s.classList.toggle('is-active',active);
      s.setAttribute('aria-hidden',String(!active));
    });
    if(label)label.textContent=`${current} de 3`;
    const pct=`${current/3*100}%`;
    if(bar)bar.style.width=pct;
    if(meter)meter.style.width=pct;
    if(previewTitle&&previewText){
      const copy=current===1
        ? ['Perfil bem resolvido.','Campos mais limpos, seleções mais intuitivas e menos cara de formulário bugado.']
        : current===2
        ? ['Idioma do seu jeito.','A escolha fica clara e visual para você configurar o VANO mais rápido.']
        : ['Pronto para o mapa.','Revise o essencial, use as ferramentas temporárias se precisar e abra o VANO MAPS.'];
      previewTitle.textContent=copy[0];
      previewText.textContent=copy[1];
    }
    if(current===3)updateSummary();
    const active=steps.find(s=>Number(s.dataset.obStep)===current);
    try{active?.scrollIntoView({behavior:motion()?'smooth':'auto',block:'start'})}catch{}
    window.scrollTo?.({top:0,behavior:'auto'});
  }

  form.querySelectorAll('[data-ob-next]').forEach(btn=>btn.addEventListener('click',()=>{
    if(validateStep(current))setStep(current+1);
  }));
  form.querySelectorAll('[data-ob-back]').forEach(btn=>btn.addEventListener('click',()=>setStep(current-1)));

  form.addEventListener('input',e=>{
    e.target.closest('.ob-invalid-v340')?.classList.remove('ob-invalid-v340');
    e.target.closest('.ob-field-v340,.ob-card-v340')?.querySelectorAll?.('.ob-inline-error-v340')?.forEach?.(x=>x.remove());
    if(current===3||e.target===name||e.target===age)updateSummary();
  });
  form.addEventListener('change',()=>{if(current===3||current===1||current===2)updateSummary()});
  form.addEventListener('submit',e=>{
    if(!validateStep(1)){e.preventDefault();setStep(1);return}
    if(!validateStep(2)){e.preventDefault();setStep(2);return}
    updateSummary();
    const submit=form.querySelector('.ob-finish-v340');
    if(submit){
      submit.disabled=true;
      submit.classList.add('is-loading');
      const label=submit.querySelector('span');
      if(label)label.textContent='Abrindo seu mapa…';
    }
  });



  setStep(1);
  updateSummary();
  if(window.lucide)lucide.createIcons();
})();
