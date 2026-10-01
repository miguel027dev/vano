(()=>{
  const form=document.querySelector('[data-admin-reset-form]');
  if(!form)return;
  form.addEventListener('submit',e=>{
    const value=window.prompt('Digite RESETAR para remover todas as outras contas e manter apenas o admin principal.');
    if((value||'').trim().toUpperCase()!=='RESETAR'){
      e.preventDefault();
      return;
    }
    const confirmation=form.querySelector('[data-admin-reset-confirmation]');
    if(confirmation)confirmation.value='RESETAR';
    const button=form.querySelector('button[type="submit"]');
    if(button){button.disabled=true;const span=button.querySelector('span');if(span)span.textContent='Resetando…'}
  });
})();
