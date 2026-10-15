(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const sheet=$('vanoRoutineSheet'),consent=$('vanoSmartConsent'),status=$('vanoSmartStatus');
  const area=$('vanoSmartCandidates'),dialog=$('vanoSmartDialog'),form=$('vanoSmartForm');
  if(!sheet||!consent||!status||!area||!dialog||!form)return;
  const csrf=window.VANO_BOOT?.csrf||window.VANO?.csrf||'';
  const weekdays=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let enabled=false,candidate=null,saved=[],stop=null,stopTimer=0,stopAbort=null,refreshing=false;
  const body=(url,method='GET',data)=>fetch(url,{
    method,credentials:'same-origin',
    headers:{Accept:'application/json',...(method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf})},
    ...(data===undefined?{}:{body:JSON.stringify(data)})
  }).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Não foi possível concluir.');return d});

  function setStatus(t){status.textContent=t}
  async function initialize(){
    try{let d=await body('/api/personal-routes/settings');enabled=Boolean(d.history_enabled);consent.checked=enabled;
      setStatus(enabled?'Histórico autorizado. Você pode desligá-lo a qualquer momento.':'Histórico desativado. Nenhuma viagem nova será guardada.');
      if(enabled&&sheet.classList.contains('show'))refresh();
    }catch{enabled=false;consent.checked=false;setStatus('Não foi possível verificar seu consentimento.');}
  }
  consent.addEventListener('change',async()=>{
    const target=consent.checked;consent.disabled=true;
    try{
      const d=await body('/api/personal-routes/consent','PUT',{enabled:target});
      enabled=Boolean(d.history_enabled);
      setStatus(enabled?'Histórico ativado. Apenas próximas viagens concluídas contam.':'Histórico desativado, viagens analisadas apagadas.');
      if(enabled)await refresh();
      else{candidate=null;renderCards();}
    }catch(e){consent.checked=enabled;setStatus(e.message)}
    finally{consent.disabled=false}
  });

  function renderCards(){
    const cards=[];
    if(enabled&&candidate){
      const x=candidate;
      cards.push('<div class="vano-smart-card"><strong>✦ Identificamos uma rotina</strong>'+
        '<p>'+esc(x.origin.label||'Sua origem')+' → '+esc(x.destination.label||'Destino habitual')+'</p>'+
        '<p>'+x.count+' viagens parecidas · '+x.weekdays.map(d=>weekdays[d]).join(', ')+' · por volta de '+x.hour+'h</p>'+
        '<button type="button" id="vanoSmartCreate">Criar rotina</button></div>');
    }
    for(const x of saved){
      cards.push('<div class="vano-smart-card"><strong>'+esc(x.name)+'</strong><p>'+esc(x.destination.label||'Destino')+
        ' · '+x.weekdays.map(d=>weekdays[d]).join(', ')+' · '+x.hour+'h</p>'+
        (x.stops.length?'<p>Parada incluída no cálculo da rota.</p>':'')+
        '<button type="button" data-routine-use="'+Number(x.id)+'">Preparar rota</button>'+
        '<button type="button" data-routine-delete="'+Number(x.id)+'">Excluir rotina</button></div>');
    }
    area.innerHTML=cards.join('');
  }
  async function refresh(){
    if(refreshing)return;refreshing=true;
    try{
      const [all,sug]=await Promise.all([body('/api/personal-routes/routines'),enabled?body('/api/personal-routes/suggestion'):Promise.resolve(null)]);
      saved=all.items||[];candidate=sug?.suggestion||null;
      if(enabled)setStatus(candidate?'Encontramos um trajeto recorrente. Confirme antes de salvá-lo.':
        (Number(sug?.completed||0)<15?'Viagens concluídas: '+(sug?.completed||0)+'/15. Ainda estamos aprendendo seus hábitos.':'Ainda não identificamos um padrão consistente.'));
      renderCards();
    }catch(e){setStatus(e.message||'Rotinas indisponíveis.');}
    finally{refreshing=false}
  }
  new MutationObserver(()=>{if(sheet.classList.contains('show'))refresh()})
    .observe(sheet,{attributes:true,attributeFilter:['class']});
  window.addEventListener('vano:trip-completed',async e=>{
    if(!enabled)return;
    const d=e.detail||{};
    if(!d.trip_id||!d.origin||!d.destination)return;
    try{await body('/api/personal-routes/completions','POST',d)}
    catch(err){console.warn('[VANO:smart-routines]',err.message)}
  });

  function openDialog(){
    if(!candidate)return;
    stop=null;
    $('vanoSmartDialogError').textContent='';
    $('vanoSmartStop').value='';
    $('vanoSmartStopResults').replaceChildren();
    $('vanoSmartName').value='Rotina para '+String(candidate.destination.label||'meu destino').split(',')[0].slice(0,32);
    $('vanoSmartTime').value=String(candidate.hour).padStart(2,'0')+':00';
    $('vanoSmartDays').innerHTML='<legend>Dias da semana</legend>'+weekdays.map((v,i)=>
      '<label><input type="checkbox" name="weekday" value="'+i+'" '+(candidate.weekdays.includes(i)?'checked':'')+'> '+v+'</label>').join('');
    dialog.showModal();
    $('vanoSmartName').focus();
  }
  $('vanoSmartCancel')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  area.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.id==='vanoSmartCreate'){openDialog();return}
    if(b.hasAttribute('data-routine-delete')){
      const rid=Number(b.dataset.routineDelete);
      if(!window.confirm('Excluir esta rotina salva?'))return;
      try{await body('/api/personal-routes/routines/'+rid,'DELETE');await refresh()}
      catch(err){setStatus(err.message)}
      return;
    }
    if(b.hasAttribute('data-routine-use')){
      const x=saved.find(item=>Number(item.id)===Number(b.dataset.routineUse));
      if(!x)return;
      $('vanoRoutineClose')?.click();
      let mapBridge=window.__VANO_MAP_BRIDGE;
      for(let retry=0;retry<12&&!mapBridge?.openDestination;retry++){
        await new Promise(resolve=>setTimeout(resolve,80));
        mapBridge=window.__VANO_MAP_BRIDGE;
      }
      if(!mapBridge?.openDestination){
        setStatus('O mapa ainda está carregando. Tente abrir a rotina novamente.');
        return;
      }
      const result=await mapBridge.openDestination({
        ...x.destination,name:x.destination.label||x.name,type:'routine',
        via_stop:x.stops?.[0]||null
      });
      if(!result)setStatus('Não foi possível preparar o trajeto.');
      return;
    }
  });
  let seq=0;
  $('vanoSmartStop')?.addEventListener('input',e=>{
    stop=null;clearTimeout(stopTimer);stopAbort?.abort();
    const q=e.target.value.trim(),results=$('vanoSmartStopResults');
    results.replaceChildren();
    if(q.length<3)return;
    const current=++seq;
    stopTimer=setTimeout(async()=>{
      const controller=new AbortController();stopAbort=controller;
      try{
        const r=await fetch('/api/geocode?q='+encodeURIComponent(q),{signal:controller.signal,credentials:'same-origin'});
        const d=await r.json();if(!r.ok||current!==seq||dialog.open===false)return;
        for(const result of (d.results||[]).slice(0,5)){
          if(!Number.isFinite(+result.lat)||!Number.isFinite(+result.lon))continue;
          const button=document.createElement('button');
          button.type='button';button.textContent=result.label||result.name||'Endereço';
          button.addEventListener('click',()=>{
            stop={lat:+result.lat,lon:+result.lon,label:String(result.label||result.name||'').slice(0,140)};
            $('vanoSmartStop').value=stop.label;results.replaceChildren();
          });
          results.append(button);
        }
      }catch(e){if(e.name!=='AbortError')results.textContent='Busca indisponível.'}
    },300);
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!candidate)return;
    const name=$('vanoSmartName').value.trim();
    const hh=$('vanoSmartTime').value;
    const hour=Number(hh.slice(0,2));
    const days=[...form.querySelectorAll('[name="weekday"]:checked')].map(x=>Number(x.value));
    const typedStop=$('vanoSmartStop').value.trim();
    if(typedStop&&!stop){$('vanoSmartDialogError').textContent='Selecione a parada na lista ou limpe o campo.';return}
    if(!days.length){$('vanoSmartDialogError').textContent='Selecione pelo menos um dia.';return}
    if(!name||!hh){$('vanoSmartDialogError').textContent='Confira nome e horário.';return}
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{
      await body('/api/personal-routes/routines','POST',{name,hour,weekdays:days,stops:stop?[stop]:[]});
      dialog.close();candidate=null;await refresh();
    }catch(err){$('vanoSmartDialogError').textContent=err.message}
    finally{button.disabled=false}
  });
  $('vanoSmartErase')?.addEventListener('click',async()=>{
    if(!window.confirm('Apagar preferências textuais, viagens analisadas e rotinas inteligentes? Esta ação não pode ser desfeita.'))return;
    try{
      await body('/api/personal-routes/data','DELETE');
      enabled=false;consent.checked=false;candidate=null;saved=[];renderCards();
      setStatus('Seus dados de rotinas inteligentes foram apagados.');
    }catch(e){setStatus(e.message)}
  });
  initialize();
})();