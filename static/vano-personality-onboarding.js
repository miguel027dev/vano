(()=>{
  'use strict';
  const form=document.getElementById('onboardingForm');
  const textarea=document.getElementById('routeStyleText');
  const analyze=document.getElementById('routeStyleAnalyze');
  const preview=document.getElementById('routeStylePreview');
  const confirm=document.getElementById('routeStyleConfirm');
  const confirmed=document.getElementById('routeStyleConfirmed');
  const skip=document.getElementById('routeStyleSkip');
  const skipped=document.getElementById('routeStyleSkipped');
  if(!form||!textarea||!analyze||!preview||!confirm||!confirmed)return;
  let interpretation=null,loading=false,revision=0;

  const csrf=form.querySelector('input[name="csrf_token"]')?.value||'';
  function reset(){
    revision++;interpretation=null;confirmed.value='0';
    if(skipped)skipped.value='0';
    confirm.hidden=true;preview.hidden=true;preview.textContent='';
    confirm.textContent='✓ É isso que eu quero';
  }
  textarea.addEventListener('input',reset);

  analyze.addEventListener('click',async()=>{
    if(loading)return;
    const text=textarea.value.trim();
    if(text.length<8){preview.textContent='Conte um pouco mais sobre como gosta de navegar.';preview.hidden=false;textarea.focus();return}
    if(text.length>500)return;
    loading=true;const current=++revision;analyze.disabled=true;analyze.textContent='Interpretando…';
    try{
      const r=await fetch('/api/personal-routes/interpret',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({text})
      });
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'Não conseguimos analisar essa descrição.');
      if(current!==revision)return;
      interpretation=data;
      const lines=['Entendemos sua preferência:'];
      for(const item of data.understood||[])lines.push('✓ '+item);
      if(data.requires_more_data?.length)lines.push('Ainda não aplicável: '+data.requires_more_data.join('; '));
      if(data.needs_review)lines.push('Não identificamos um critério aplicável. Tente reformular.');
      lines.push('As rotas continuam baseadas nos dados e restrições realmente disponíveis.');
      preview.textContent=lines.join('\n');
      preview.hidden=false;
      confirm.hidden=Boolean(data.needs_review);
      if(!data.needs_review)confirm.focus();
    }catch(e){
      if(current===revision){preview.hidden=false;preview.textContent=e.message||'Falha de conexão. Tente novamente.';}
    }finally{
      loading=false;analyze.disabled=false;analyze.textContent='Interpretar minha preferência →';
    }
  });

  confirm.addEventListener('click',()=>{
    if(!interpretation)return;
    const chosen=form.querySelector('input[name="route_preference"][value="'+interpretation.route_preference+'"]');
    if(chosen){chosen.checked=true;chosen.dispatchEvent(new Event('change',{bubbles:true}));}
    for(const key of ['avoid_tolls','avoid_unpaved','avoid_ferries']){
      if(interpretation[key]){const x=form.querySelector('input[name="'+key+'"]');if(x){x.checked=true;x.dispatchEvent(new Event('change',{bubbles:true}));}}
    }
    confirmed.value='1';
    confirm.textContent='✓ Preferência confirmada';
    preview.textContent+='\n\nTudo certo. Continue para finalizar seu perfil.';
  });

  skip?.addEventListener('click',()=>{
    // Skipping is explicit and never interpreted as consent or route preference.
    revision++;interpretation=null;textarea.value='';textarea.required=false;
    confirmed.value='0';skipped.value='1';confirm.hidden=true;preview.hidden=true;
    const balanced=form.querySelector('input[name="route_preference"][value="balanced"]');
    if(balanced){balanced.checked=true;balanced.dispatchEvent(new Event('change',{bubbles:true}));}
    for(const key of ['avoid_tolls','avoid_unpaved','avoid_ferries']){
      const input=form.querySelector('input[name="'+key+'"]');
      if(input){input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    const next=form.querySelector('[data-ob-step="2"] [data-ob-next]');
    next?.click();
  });
  function guard(e){
    const active=form.querySelector('[data-ob-step="2"].is-active');
    const next=e.target.closest('[data-ob-next]');
    const finishing=e.type==='submit';
    if(!active&&!finishing)return;
    if(!finishing&&!next)return;
    if(skipped?.value==='1'&&textarea.value.trim()==='')return;
    if(confirmed.value==='1'&&interpretation&&textarea.value.trim()===interpretation.text)return;
    e.preventDefault();e.stopImmediatePropagation();
    preview.textContent='Primeiro, toque em “Interpretar minha preferência” e confirme o resultado.';
    preview.hidden=false;
    textarea.focus();
  }
  form.addEventListener('click',guard,true);
  form.addEventListener('submit',guard,true);
})();