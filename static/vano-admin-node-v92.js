/* Readable VANO source; runtime eval/encoded wrapper removed. */
(()=>{
  const root=document.querySelector('.admin-server-page');
  if(!root)return;
  const idx=Number(window.VANO_NODE_DETAIL_INDEX||0);
  const $=id=>document.getElementById(id);
  const csrf=()=>window.VANO?.csrf||'';
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const text=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  let logFilter='all',logSearch='';

  function statusLabel(s){s=String(s||'pending');return s==='draining'?'DRAIN':s.toUpperCase()}
  function rebuildSlots(capacity,active){
    const grid=$('nodeDetailSlots');if(!grid)return;
    capacity=Math.max(1,Math.min(32,num(capacity,4)));active=Math.max(0,num(active,0));
    if(grid.children.length!==capacity){grid.innerHTML='';grid.style.gridTemplateRows=`repeat(${capacity},1fr)`;for(let i=1;i<=capacity;i++){const d=document.createElement('div');d.className='server-slot';d.dataset.slotIndex=String(i);d.innerHTML='<span class="slot-led"></span><span class="slot-line"></span><span class="slot-line short"></span>';grid.appendChild(d)}}
    grid.querySelectorAll('[data-slot-index]').forEach(s=>s.classList.toggle('active',num(s.dataset.slotIndex)<=active));
  }
  function applyStatus(s){
    if(!s)return;
    const status=String(s.status||'pending');const badge=$('nodeDetailStatus');if(badge){badge.textContent=statusLabel(status);badge.className=`server-status status-${status}`}
    const active=num(s.active_jobs,s.active_users||0),cap=Math.max(1,num(s.capacity,4)),available=Math.max(0,num(s.available_slots,cap-active)),occ=Math.max(0,Math.min(100,num(s.occupancy_pct,100*active/cap)));
    text('nodeDetailActive',active);text('nodeDetailCapacity',cap);text('nodeDetailAvailable',available);text('nodeDetailLatency',`${num(s.latency_ms)} ms`);text('nodeDetailResponse',`${num(s.response_avg_ms)} ms`);text('nodeDetailCpu',s.cpu_pct==null?'—':`${s.cpu_pct}%`);text('nodeDetailMemory',s.memory_pct==null?'—':`${s.memory_pct}%`);text('nodeDetailRpm',num(s.requests_min));text('nodeDetailCache',`${num(s.cache_hit_pct)}%`);text('nodeDetailHttp',s.http_status||'—');text('nodeDetailNote',s.note||'');const fill=$('nodeDetailRackFill');if(fill)fill.style.height=`${occ}%`;rebuildSlots(cap,active);
  }
  function applyStats(s){if(!s)return;text('nodeStatTotal',num(s.total));text('nodeStatSuccess',`${num(s.success_pct)}%`);text('nodeStatUsers',num(s.unique_users));text('nodeStatAvg',`${num(s.avg_latency_ms)} ms`);text('nodeStatP95',`${num(s.p95_latency_ms)} ms`);text('nodeStatFailures',num(s.failures))}
  function rowForLog(l){
    const tr=document.createElement('tr');tr.dataset.success=l.success?'1':'0';tr.dataset.prefetch=l.prefetch?'1':'0';
    const values=[];
    const dt=document.createElement('td');dt.textContent=String(l.created_at||'').replace('T',' ').slice(0,19);values.push(dt);
    const user=document.createElement('td');user.className='log-user';const b=document.createElement('b');b.textContent=l.user_name||'Visitante';const sm=document.createElement('small');sm.textContent=l.user_email||'Visitante';user.append(b,sm);values.push(user);
    const req=document.createElement('td');const reqD=document.createElement('div');reqD.className='log-request';reqD.textContent=l.request_id||'—';reqD.title=l.request_id||'';req.append(reqD);values.push(req);
    const mode=document.createElement('td');mode.textContent=l.mode||'—';values.push(mode);
    const type=document.createElement('td');type.textContent=l.prefetch?'Prefetch':'Rota';if(l.prefetch)type.className='log-prefetch';values.push(type);
    const result=document.createElement('td');const pill=document.createElement('span');pill.className=`log-result ${l.success?'ok':'fail'}`;pill.textContent=l.success?'OK':'Falha';result.append(pill);values.push(result);
    const http=document.createElement('td');http.textContent=l.http_status||'—';values.push(http);
    const lat=document.createElement('td');lat.textContent=`${num(l.latency_ms)} ms`;values.push(lat);
    const err=document.createElement('td');err.textContent=l.error||'—';values.push(err);
    tr.append(...values);return tr;
  }
  function applyLogs(logs){const body=$('nodeLogBody');if(!body)return;body.innerHTML='';if(!(logs||[]).length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.className='empty-state';td.textContent='Ainda não há logs para este node.';tr.append(td);body.append(tr)}else{logs.forEach(l=>body.append(rowForLog(l)))}filterLogs()}
  function filterLogs(){document.querySelectorAll('#nodeLogBody tr[data-success]').forEach(tr=>{const hay=(tr.textContent||'').toLowerCase();const okFilter=logFilter==='all'||(logFilter==='success'&&tr.dataset.success==='1')||(logFilter==='failure'&&tr.dataset.success==='0')||(logFilter==='prefetch'&&tr.dataset.prefetch==='1');tr.hidden=!(okFilter&&(!logSearch||hay.includes(logSearch)))})}
  async function refresh(force=false){try{const r=await fetch(`/api/admin/servers/${idx}/details?refresh=${force?1:0}&limit=250`,{headers:{Accept:'application/json'}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao atualizar');applyStatus(d.status);applyStats(d.stats);applyLogs(d.logs)}catch(e){text('nodeDetailNote',e.message||'Falha ao atualizar node')}}
  async function saveConfig(ev){ev.preventDefault();const btn=$('detailSave'),msg=$('detailConfigMessage');btn.disabled=true;msg.textContent='Salvando…';msg.className='node-config-message';const payload={name:$('detailName').value.trim(),provider:$('detailProvider').value,region:$('detailRegion').value.trim(),environment:$('detailEnvironment').value,url:$('detailUrl').value.trim(),capacity:num($('detailCapacity').value,4),priority:num($('detailPriority').value,100),connect_timeout_s:num($('detailConnectTimeout').value,2.2),route_timeout_s:num($('detailRouteTimeout').value,10),cooldown_s:num($('detailCooldown').value,20),health_path:$('detailHealth').value.trim()||'/healthz',route_path:$('detailRoutePath').value.trim()||'/v1/route/calculate',precalc_path:$('detailPrecalcPath').value.trim()||'/v1/route/precalculate',notes:$('detailNotes').value.trim(),enabled:$('detailEnabled').checked,drain_mode:$('detailDrain').checked};try{const r=await fetch(`/api/admin/servers/${idx}/config`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao salvar');msg.textContent='Configuração salva.';msg.className='node-config-message ok';await refresh(true)}catch(e){msg.textContent=e.message||'Falha ao salvar';msg.className='node-config-message error'}finally{btn.disabled=false}}
  async function testNow(){const b=$('nodeDetailTest');const old=b.innerHTML;b.disabled=true;b.textContent='Testando…';try{const r=await fetch(`/api/admin/servers/${idx}/test`,{method:'POST',headers:{Accept:'application/json','X-CSRF-Token':csrf()}});const d=await r.json();if(d.node)applyStatus(d.node);if(!r.ok)throw new Error(d.error||'Node não respondeu');b.textContent='Online ✓';setTimeout(()=>{b.innerHTML=old;b.disabled=false;if(window.lucide)lucide.createIcons()},1000)}catch(e){b.textContent='Falhou';setTimeout(()=>{b.innerHTML=old;b.disabled=false;if(window.lucide)lucide.createIcons()},1300)}}
  async function clearLogs(){const ok=await (window.VANO_RUNTIME?.confirm?.({title:'Limpar logs',message:'Limpar todos os logs deste node? Essa ação não pode ser desfeita.',confirmText:'Limpar',danger:true})??Promise.resolve(false));if(!ok)return;const b=$('nodeClearLogs');b.disabled=true;try{const out=window.VANO_RUNTIME?.fetchJSON?await window.VANO_RUNTIME.fetchJSON(`/api/admin/servers/${idx}/logs/clear`,{method:'POST',headers:{Accept:'application/json','X-CSRF-Token':csrf()}},12000):null;if(out&&!out.data?.ok)throw new Error(out.data?.error||'Falha ao limpar');if(!out){const r=await fetch(`/api/admin/servers/${idx}/logs/clear`,{method:'POST',headers:{Accept:'application/json','X-CSRF-Token':csrf()}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao limpar')}await refresh(false);window.VANO_RUNTIME?.toast?.('Logs removidos.','success')}catch(e){window.VANO_RUNTIME?.toast?.(e.message||'Falha ao limpar logs','error')}finally{b.disabled=false}}

  $('serverDetailConfigForm')?.addEventListener('submit',saveConfig);$('nodeDetailTest')?.addEventListener('click',testNow);$('nodeClearLogs')?.addEventListener('click',clearLogs);document.querySelectorAll('[data-log-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-log-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');logFilter=b.dataset.logFilter||'all';filterLogs()}));$('nodeLogSearch')?.addEventListener('input',e=>{logSearch=String(e.target.value||'').trim().toLowerCase();filterLogs()});
  try{const d=JSON.parse($('nodeDetailInitial')?.textContent||'{}');applyStatus(d.status);applyStats(d.stats)}catch{}
  const timer=setInterval(()=>{if(!document.hidden)refresh(false)},10000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});setTimeout(()=>refresh(true),500);
})();
