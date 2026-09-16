(()=>{
  const trigger=document.getElementById('startupEmailTrigger');
  const panel=document.getElementById('startupEmailPanel');
  const password=document.getElementById('startupPassword');
  const toggle=document.getElementById('startupPasswordToggle');
  const google=document.getElementById('googleOAuthLink');
  const form=panel?.querySelector('form');
  const email=panel?.querySelector('input[name="email"]');
  const brand=document.getElementById('startupBrandImage');

  const syncBrand=()=>{
    if(!brand)return;
    // light = dark lettering; black = white lettering. Keep this mapping explicit:
    // the filenames describe the surface they belong to, not the text color.
    const mode=String(document.documentElement.dataset.vanoTheme||document.documentElement.dataset.vanoThemeMode||'light').toLowerCase();
    const next=mode==='black'?brand.dataset.darkSrc:brand.dataset.lightSrc;
    if(next&&brand.getAttribute('src')!==next)brand.setAttribute('src',next);
    const reveal=()=>brand.classList.add('is-ready');
    if(brand.complete)reveal();else brand.addEventListener('load',reveal,{once:true});
  };
  syncBrand();
  const themeObserver=new MutationObserver(syncBrand);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-vano-theme','data-vano-theme-mode']});
  window.addEventListener('vano:themechange',()=>requestAnimationFrame(syncBrand));
  document.addEventListener('DOMContentLoaded',syncBrand,{once:true});
  document.querySelector('[data-vano-theme-toggle]')?.addEventListener('click',()=>requestAnimationFrame(()=>requestAnimationFrame(syncBrand)));

  const setEmailOpen=(open)=>{
    if(!trigger||!panel)return;
    trigger.setAttribute('aria-expanded',String(open));
    panel.setAttribute('aria-hidden',String(!open));
    panel.classList.toggle('is-open',open);
    if(open)setTimeout(()=>email?.focus({preventScroll:true}),180);
  };
  trigger?.addEventListener('click',()=>setEmailOpen(trigger.getAttribute('aria-expanded')!=='true'));
  toggle?.addEventListener('click',()=>{
    if(!password)return;
    const show=password.type==='password';
    password.type=show?'text':'password';
    toggle.textContent=show?'Ocultar':'Mostrar';
    toggle.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');
    password.focus({preventScroll:true});
  });

  const setLinkLoading=(loading)=>{
    if(!google)return;
    google.classList.toggle('is-loading',loading);
    google.setAttribute('aria-busy',String(loading));
    const text=google.querySelector('span');
    if(text)text.textContent=loading?'Abrindo Google…':'Continuar com Google';
  };
  google?.addEventListener('click',()=>setLinkLoading(true));

  form?.addEventListener('submit',()=>{
    const button=form.querySelector('.startup-email-submit');
    form.setAttribute('aria-busy','true');
    if(button){
      button.disabled=true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy','true');
      const text=button.querySelector('span');
      if(text)text.textContent='Entrando…';
    }
  });

  window.addEventListener('pageshow',()=>{
    setLinkLoading(false);
    form?.setAttribute('aria-busy','false');
    const button=form?.querySelector('.startup-email-submit');
    if(button){button.disabled=false;button.classList.remove('is-loading');button.removeAttribute('aria-busy');const text=button.querySelector('span');if(text)text.textContent='Entrar'}
    syncBrand();
  });

  const hasAuthError=[...document.querySelectorAll('.startup-flash')].some(x=>x.classList.contains('danger'));
  if(hasAuthError)setEmailOpen(true);
})();
