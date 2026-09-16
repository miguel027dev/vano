(()=>{
  const root=document.documentElement;
  const flow=document.getElementById('startupFlow');
  const choiceStage=document.getElementById('startupChoiceStage');
  const emailStage=document.getElementById('startupEmailStage');
  const emailTrigger=document.getElementById('startupEmailTrigger');
  const backButton=document.getElementById('startupBackButton');
  const emailInput=document.getElementById('startupEmail');
  const passwordInput=document.getElementById('startupPassword');
  const passwordToggle=document.getElementById('startupPasswordToggle');
  const emailForm=document.getElementById('startupEmailForm');
  const emailSubmit=document.getElementById('startupEmailSubmit');
  const googleLink=document.getElementById('googleOAuthLink');
  const brand=document.getElementById('startupBrandImage');
  const visualMap=document.getElementById('visualMap');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

  let currentStep='choice';
  let pushedEmailState=false;

  const syncBrand=()=>{
    if(!brand)return;
    const mode=String(root.dataset.vanoTheme||root.dataset.vanoThemeMode||'light').toLowerCase();
    const next=mode==='black'?brand.dataset.darkSrc:brand.dataset.lightSrc;
    if(next&&brand.getAttribute('src')!==next){
      brand.classList.remove('is-ready');
      brand.setAttribute('src',next);
    }
    const reveal=()=>brand.classList.add('is-ready');
    if(brand.complete)requestAnimationFrame(reveal);
    else brand.addEventListener('load',reveal,{once:true});
  };

  const performTransition=(update)=>{
    if(!reducedMotion.matches&&typeof document.startViewTransition==='function'){
      document.startViewTransition(update);
    }else update();
  };

  const renderStep=(step,{focus=true,pushHistory=false}={})=>{
    if(step===currentStep&&((step==='choice'&&!choiceStage.hidden)||(step==='email'&&!emailStage.hidden)))return;
    performTransition(()=>{
      currentStep=step;
      flow.dataset.step=step;
      const isEmail=step==='email';
      choiceStage.hidden=isEmail;
      emailStage.hidden=!isEmail;
      document.body.classList.toggle('is-email-step',isEmail);
    });

    if(step==='email'){
      if(pushHistory&&history.state?.vanoAuthStep!=='email'){
        history.pushState({...history.state,vanoAuthStep:'email'},'',location.href);
        pushedEmailState=true;
      }
      if(focus)setTimeout(()=>emailInput?.focus({preventScroll:true}),220);
    }else{
      pushedEmailState=false;
      if(focus)setTimeout(()=>emailTrigger?.focus({preventScroll:true}),160);
    }
  };

  const openEmail=()=>renderStep('email',{focus:true,pushHistory:true});
  const closeEmail=()=>{
    if(history.state?.vanoAuthStep==='email'){
      history.back();
      return;
    }
    renderStep('choice',{focus:true});
  };

  emailTrigger?.addEventListener('click',openEmail);
  backButton?.addEventListener('click',closeEmail);

  window.addEventListener('popstate',event=>{
    const wantsEmail=event.state?.vanoAuthStep==='email';
    renderStep(wantsEmail?'email':'choice',{focus:false,pushHistory:false});
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&currentStep==='email'){
      event.preventDefault();
      closeEmail();
    }
  });

  passwordToggle?.addEventListener('click',()=>{
    if(!passwordInput)return;
    const show=passwordInput.type==='password';
    passwordInput.type=show?'text':'password';
    passwordToggle.classList.toggle('is-visible',show);
    passwordToggle.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');
    passwordInput.focus({preventScroll:true});
  });

  const setGoogleLoading=loading=>{
    if(!googleLink)return;
    googleLink.classList.toggle('is-loading',loading);
    googleLink.setAttribute('aria-busy',String(loading));
    const label=googleLink.querySelector('.startup-primary-label');
    if(label)label.textContent=loading?'Abrindo Google…':'Continuar com Google';
  };
  googleLink?.addEventListener('click',()=>setGoogleLoading(true));

  emailForm?.addEventListener('submit',()=>{
    emailForm.setAttribute('aria-busy','true');
    if(emailSubmit){
      emailSubmit.disabled=true;
      emailSubmit.classList.add('is-loading');
      emailSubmit.setAttribute('aria-busy','true');
      const label=emailSubmit.querySelector('span:first-child');
      if(label)label.textContent='Entrando…';
    }
  });

  const resetLoading=()=>{
    setGoogleLoading(false);
    emailForm?.setAttribute('aria-busy','false');
    if(emailSubmit){
      emailSubmit.disabled=false;
      emailSubmit.classList.remove('is-loading');
      emailSubmit.removeAttribute('aria-busy');
      const label=emailSubmit.querySelector('span:first-child');
      if(label)label.textContent='Entrar no VANO';
    }
  };

  const onPointerMove=event=>{
    if(!visualMap||reducedMotion.matches||window.innerWidth<960)return;
    const x=(event.clientX/window.innerWidth-.5)*2;
    const y=(event.clientY/window.innerHeight-.5)*2;
    visualMap.style.transform=`perspective(900px) rotateX(${2-y*1.1}deg) rotateZ(${-2+x*.8}deg) translate3d(${x*3}px,${y*3}px,0)`;
  };
  window.addEventListener('pointermove',onPointerMove,{passive:true});
  window.addEventListener('pointerleave',()=>visualMap?.style.removeProperty('transform'));

  syncBrand();
  new MutationObserver(syncBrand).observe(root,{attributes:true,attributeFilter:['data-vano-theme','data-vano-theme-mode']});
  window.addEventListener('vano:themechange',()=>requestAnimationFrame(syncBrand));
  document.querySelector('[data-vano-theme-toggle]')?.addEventListener('click',()=>requestAnimationFrame(()=>requestAnimationFrame(syncBrand)));

  const hasAuthError=[...document.querySelectorAll('.startup-flash')].some(item=>item.classList.contains('danger'));
  if(hasAuthError){
    currentStep='choice';
    renderStep('email',{focus:false,pushHistory:false});
    setTimeout(()=>emailInput?.focus({preventScroll:true}),260);
  }else if(history.state?.vanoAuthStep==='email'){
    currentStep='choice';
    renderStep('email',{focus:false,pushHistory:false});
  }

  window.addEventListener('pageshow',()=>{
    resetLoading();
    syncBrand();
  });
})();
