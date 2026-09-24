/* Readable VANO source; runtime eval/encoded wrapper removed. */
(()=>{
  'use strict';
  const BOOT=window.VANO_BOOT||{}, LOGGED_IN=!!BOOT.loggedIn, CSRF=String(BOOT.csrf||'');
  const DAYS=[['SEG','Segunda'],['TER','Terça'],['QUA','Quarta'],['QUI','Quinta'],['SEX','Sexta'],['SÁB','Sábado'],['DOM','Domingo']];
  const STORE='vano.weekly-routine.v229';
  const $=id=>document.getElementById(id);
  const sheet=$('vanoRoutineSheet'), list=$('vanoRoutineList'), quick=$('quickRoutine'), quickSub=$('routineQuickSub');
  if(!sheet||!list||!quick)return;
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const todayIndex=()=>((new Date().getDay()+6)%7);
  const empty=()=>Array.from({length:7},(_,weekday)=>({weekday,label:'',lat:null,lon:null,time:'',enabled:true}));
  let days=empty(), loaded=false, searchAbort=null, searchTimer=0, saving=false;

  function toast(msg){try{const el=$('toast');if(el){el.textContent=msg;el.classList.add('show');clearTimeout(el.__routineT);el.__routineT=setTimeout(()=>el.classList.remove('show'),2500);return}}catch{} console.info('[VANO routine]',msg)}
  function mapBridge(){return window.__VANO_MAP_BRIDGE||null}
  function normalize(items){const out=empty();for(const x of Array.isArray(items)?items:[]){const w=Number(x?.weekday);if(!Number.isInteger(w)||w<0||w>6)continue;out[w]={weekday:w,label:String(x.label||'').trim(),lat:Number.isFinite(+x.lat)?+x.lat:null,lon:Number.isFinite(+x.lon)?+x.lon:null,time:/^\d{2}:\d{2}$/.test(String(x.time||''))?String(x.time):'',enabled:x.enabled!==false}}return out}
  function localLoad(){try{return normalize(JSON.parse(localStorage.getItem(STORE)||'[]'))}catch{return empty()}}
  function localSave(value){try{localStorage.setItem(STORE,JSON.stringify(value))}catch{}}
  async function load(){
    if(loaded)return days; loaded=true;
    if(!LOGGED_IN){days=localLoad();renderAll();return days}
    try{const r=await fetch('/api/weekly-routine',{headers:{Accept:'application/json'}}),d=await r.json();if(!r.ok)throw new Error();days=normalize(d.items)}catch{days=localLoad()}
    localSave(days);renderAll();return days;
  }
  function dayTimeText(day){return day.time?`${day.time} · `:''}
  function renderQuick(){const d=days[todayIndex()], configured=d&&d.enabled&&d.label&&Number.isFinite(d.lat)&&Number.isFinite(d.lon);quick.classList.toggle('has-today',!!configured);if(quickSub)quickSub.textContent=configured?`Hoje · ${dayTimeText(d)}${d.label}`.slice(0,70):`${days.filter(x=>x.label).length}/7 dias configurados`;}
  function rowHtml(day,i){const selected=day.label&&Number.isFinite(day.lat)&&Number.isFinite(day.lon);return `<div class="vano-routine-day ${i===todayIndex()?'is-today':''}" data-routine-day="${i}" data-lat="${selected?day.lat:''}" data-lon="${selected?day.lon:''}">
    <div class="vano-routine-day-label"><b>${DAYS[i][0]}</b><small>${i===todayIndex()?'HOJE':DAYS[i][1].slice(0,3).toUpperCase()}</small></div>
    <div class="vano-routine-address-wrap ${selected?'selected':''}"><input class="vano-routine-address" data-routine-address="${i}" value="${esc(day.label)}" placeholder="Adicionar endereço" autocomplete="off" inputmode="search"><i class="vano-routine-selected-dot" aria-hidden="true"></i></div>
    <input class="vano-routine-time" data-routine-time="${i}" type="time" value="${esc(day.time)}" aria-label="Horário de ${DAYS[i][1]}">
    <button type="button" class="vano-routine-use ${selected?'ready':''}" data-routine-use="${i}" ${selected?'':'disabled'} aria-label="Usar destino de ${DAYS[i][1]}" title="Usar agora"><i data-lucide="navigation" width="16"></i></button>
    <div class="vano-routine-results" data-routine-results="${i}"></div>
  </div>`}
  function renderRows(){list.innerHTML=days.map(rowHtml).join('');if(window.lucide)lucide.createIcons();bindRows()}
  function renderToday(){const d=days[todayIndex()], ready=d&&d.enabled&&d.label&&Number.isFinite(d.lat)&&Number.isFinite(d.lon),copy=$('vanoRoutineTodayCopy'),go=$('vanoRoutineTodayGo');if(copy)copy.innerHTML=ready?`<small>HOJE · ${DAYS[todayIndex()][1].toUpperCase()}</small><b>${esc(d.label)}</b><span>${d.time?`Saída configurada para ${esc(d.time)}`:'Disponível o dia todo'}</span>`:`<small>HOJE · ${DAYS[todayIndex()][1].toUpperCase()}</small><b>Nenhum destino definido</b><span>Adicione um endereço para deixar sua rotina pronta.</span>`;if(go){go.hidden=!ready;go.onclick=()=>useDay(todayIndex())}}
  function renderAll(){renderQuick();if(sheet.classList.contains('show')){renderRows();renderToday()}}

  function open(){sheet.classList.add('show');sheet.setAttribute('aria-hidden','false');document.body.classList.add('vano-routine-open');renderRows();renderToday();requestAnimationFrame(()=>{try{window.lucide?.createIcons?.()}catch{}})}
  function close(){searchAbort?.abort();clearTimeout(searchTimer);sheet.classList.remove('show');sheet.setAttribute('aria-hidden','true');document.body.classList.remove('vano-routine-open');document.querySelectorAll('.vano-routine-results.show').forEach(x=>x.classList.remove('show'))}

  function row(i){return list.querySelector(`[data-routine-day="${i}"]`)}
  function setRowPlace(i,item){const r=row(i),input=r?.querySelector('[data-routine-address]'),wrap=r?.querySelector('.vano-routine-address-wrap'),use=r?.querySelector('[data-routine-use]'),results=r?.querySelector('[data-routine-results]');if(!r||!input)return;r.dataset.lat=String(+item.lat);r.dataset.lon=String(+item.lon);input.value=String(item.label||item.name||'Destino');wrap?.classList.add('selected');use?.classList.add('ready');if(use)use.disabled=false;results?.classList.remove('show');r.classList.remove('is-invalid')}
  function clearRowCoords(i){const r=row(i),wrap=r?.querySelector('.vano-routine-address-wrap'),use=r?.querySelector('[data-routine-use]');if(!r)return;r.dataset.lat='';r.dataset.lon='';wrap?.classList.remove('selected');use?.classList.remove('ready');if(use)use.disabled=true}
  async function searchAddress(i,q){
    q=String(q||'').trim();const box=row(i)?.querySelector('[data-routine-results]');if(!box)return;if(q.length<3){box.classList.remove('show');return}
    searchAbort?.abort();searchAbort=new AbortController();box.classList.add('show');box.innerHTML='<div class="vano-routine-search-state">Buscando endereço…</div>';
    const p=new URLSearchParams({q});const u=mapBridge()?.getUserLocation?.();if(u){p.set('proximity_lat',u.lat);p.set('proximity_lon',u.lon)}
    try{const r=await fetch('/api/geocode?'+p,{signal:searchAbort.signal,headers:{Accept:'application/json'}}),d=await r.json();if(!r.ok)throw new Error();const items=(d.results||[]).filter(x=>Number.isFinite(+x.lat)&&Number.isFinite(+x.lon)).slice(0,5);if(!items.length){box.innerHTML='<div class="vano-routine-search-state">Nenhum endereço encontrado.</div>';return}box.innerHTML=items.map((x,n)=>`<button type="button" class="vano-routine-result" data-routine-result="${n}"><span class="vano-routine-result-icon"><i data-lucide="map-pin" width="15"></i></span><span><b>${esc(x.name||String(x.label||'').split(',')[0]||'Destino')}</b><small>${esc(x.label||x.address||'')}</small></span></button>`).join('');if(window.lucide)lucide.createIcons();box.querySelectorAll('[data-routine-result]').forEach(btn=>btn.onclick=()=>setRowPlace(i,items[+btn.dataset.routineResult]))}catch(e){if(e?.name!=='AbortError')box.innerHTML='<div class="vano-routine-search-state">Busca indisponível agora.</div>'}
  }
  function bindRows(){
    list.querySelectorAll('[data-routine-address]').forEach(input=>{const i=+input.dataset.routineAddress;input.addEventListener('input',()=>{clearRowCoords(i);clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchAddress(i,input.value),220)});input.addEventListener('focus',()=>{if(input.value.trim().length>=3&&!row(i)?.dataset.lat)searchAddress(i,input.value)});input.addEventListener('keydown',e=>{if(e.key==='Escape')row(i)?.querySelector('[data-routine-results]')?.classList.remove('show')})});
    list.querySelectorAll('[data-routine-use]').forEach(btn=>btn.addEventListener('click',()=>useRow(+btn.dataset.routineUse)));
  }
  function placeFromRow(i){const r=row(i),input=r?.querySelector('[data-routine-address]'),time=r?.querySelector('[data-routine-time]');const lat=+r?.dataset.lat,lon=+r?.dataset.lon;return{weekday:i,label:String(input?.value||'').trim(),lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,time:String(time?.value||''),enabled:true}}
  function useRow(i){const p=placeFromRow(i);if(!p.label||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)){row(i)?.classList.add('is-invalid');toast('Escolha um endereço da lista primeiro.');return}usePlace(p)}
  function useDay(i){const p=days[i];if(p?.label&&Number.isFinite(p.lat)&&Number.isFinite(p.lon))usePlace(p)}
  async function usePlace(p){close();let bridge=mapBridge();for(let n=0;n<12&&!bridge?.openDestination;n++){await new Promise(r=>setTimeout(r,80));bridge=mapBridge()}if(bridge?.openDestination){await bridge.openDestination({label:p.label,name:String(p.label).split(',')[0],lat:+p.lat,lon:+p.lon,type:'routine'});return}const input=$('destinationInput');if(input){input.value=p.label;input.focus();input.dispatchEvent(new Event('input',{bubbles:true}))}else toast('Mapa ainda está carregando.')}

  function collect(){const out=[];let invalid=false;for(let i=0;i<7;i++){const p=placeFromRow(i);if(p.label&&(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))){row(i)?.classList.add('is-invalid');invalid=true}else if(p.label){out.push(p)}}return invalid?null:normalize(out)}
  async function save(){if(saving)return;const next=collect();if(!next){toast('Selecione os endereços sugeridos antes de salvar.');return}saving=true;const btn=$('vanoRoutineSave');btn?.classList.add('saving');if(btn)btn.textContent='Salvando…';try{if(LOGGED_IN){const payload={days:next.filter(x=>x.label)};const r=await fetch('/api/weekly-routine',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível salvar.')}days=next;localSave(days);renderQuick();renderToday();toast('Rotina semanal salva.');setTimeout(close,220)}catch(e){toast(e.message||'Não foi possível salvar a rotina.')}finally{saving=false;btn?.classList.remove('saving');if(btn)btn.textContent='Salvar rotina'}}

  quick.addEventListener('click',()=>{load().then(open)});
  $('vanoRoutineBackdrop')?.addEventListener('click',close);$('vanoRoutineClose')?.addEventListener('click',close);$('vanoRoutineSave')?.addEventListener('click',save);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet.classList.contains('show'))close()});
  document.addEventListener('click',e=>{if(!e.target.closest('.vano-routine-day'))document.querySelectorAll('.vano-routine-results.show').forEach(x=>x.classList.remove('show'))});
  load();
})();
