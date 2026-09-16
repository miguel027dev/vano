(()=>{
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pulse=(el,cls)=>{if(!el||reduced())return;el.classList.remove(cls);requestAnimationFrame(()=>{el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),460)})};

  // Login direction-aware animation + mobile keyboard stability.
  const emailTrigger=document.getElementById('startupEmailTrigger');
  const back=document.getElementById('startupBackButton');
  const emailStage=document.getElementById('startupEmailStage');
  const choiceStage=document.getElementById('startupChoiceStage');
  emailTrigger?.addEventListener('click',()=>setTimeout(()=>pulse(emailStage,'v351-enter-forward'),0));
  back?.addEventListener('click',()=>setTimeout(()=>pulse(choiceStage,'v351-enter-back'),0));
  if(window.visualViewport){
    const syncViewport=()=>document.documentElement.style.setProperty('--v351-vh',`${window.visualViewport.height}px`);
    visualViewport.addEventListener('resize',syncViewport,{passive:true});syncViewport();
  }

  // Registration: lightweight validation states and submit feedback.
  const reg=document.getElementById('registerEmailForm');
  if(reg){
    const update=(input)=>{
      const field=input.closest('.register-field');if(!field)return;
      const filled=String(input.value||'').trim().length>0;
      field.classList.toggle('is-valid',filled&&input.checkValidity());
      field.classList.toggle('is-invalid',filled&&!input.checkValidity());
    };
    reg.querySelectorAll('input').forEach(input=>{input.addEventListener('input',()=>update(input));input.addEventListener('blur',()=>update(input));update(input)});
    reg.addEventListener('submit',()=>{const btn=reg.querySelector('.register-email-submit');if(btn&&reg.checkValidity()){btn.classList.add('is-loading');btn.setAttribute('aria-busy','true');const icon=btn.querySelector('i');if(icon)icon.setAttribute('data-lucide','loader-circle');window.lucide?.createIcons?.()}});
  }
})();
