(()=>{
  const trigger=document.getElementById('startupEmailTrigger');
  const panel=document.getElementById('startupEmailPanel');
  const password=document.getElementById('startupPassword');
  const toggle=document.getElementById('startupPasswordToggle');
  const google=document.getElementById('googleOAuthLink');
  const form=panel?.querySelector('form');
  const email=panel?.querySelector('input[name="email"]');

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
  google?.addEventListener('click',()=>{
    google.classList.add('is-loading');
    const text=google.querySelector('span');
    if(text)text.textContent='Abrindo Google…';
  });
  form?.addEventListener('submit',()=>{
    const button=form.querySelector('.startup-email-submit');
    if(button){button.disabled=true;button.style.opacity='.78';const text=button.querySelector('span');if(text)text.textContent='Entrando…'}
  });

  const hasAuthError=[...document.querySelectorAll('.startup-flash')].some(x=>x.classList.contains('danger'));
  if(hasAuthError)setEmailOpen(true);
})();
