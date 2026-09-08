(()=>{
  const root=document.querySelector('.admin86');
  if(!root) return;
  const $=id=>document.getElementById(id);
  const testBtn=$('testAllNodes');
  const modal=$('nodeConfigModal');
  const form=$('nodeConfigForm');
  const safeNum=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  const fmt=(v,suffix='')=>v==null||v===''?'—':`${v}${suffix}`;
  const statusLabel=s=>{const v=String(s||'pending');return v==='draining'?'DRAIN':v.toUpperCase()};
  const csrf=()=>window.VANO?.csrf||'';
  let lastPayload={nodes:[],summary:{}};
  let activeNodeFilter='all',nodeSearchTerm='',nodeSortMode='status';

  function setText(id,val){const el=$(id);if(el)el.textContent=val;}

  function updateHero(summary){
    if(!summary) return;
    const activeUsers=safeNum(summary.active_users);
    const capacity=safeNum(summary.capacity,0);
    const available=safeNum(summary.user_available_slots,Math.max(0,capacity-activeUsers));
    const occ=safeNum(summary.user_occupancy_pct,capacity?100*Math.min(activeUsers,capacity)/capacity:0);
    const active15=safeNum(summary.active_users_15m);
    const active60=safeNum(summary.active_users_60m);
    setText('heroConcurrentNow',activeUsers);
    setText('heroCapacity',capacity);
    setText('heroCapacityInline',capacity);
    setText('heroUsed',Math.min(activeUsers,capacity));
    setText('heroAvailable',available);
    setText('heroOccupancy',occ);
    setText('hero15m',active15);
    setText('hero60m',active60);
    setText('active15Kpi',active15);
    setText('active60Kpi',active60);
    setText('simNowKpi',activeUsers);
    setText('simOccKpi',`${occ}%`);
    setText('simFreeKpi',available);
    setText('infraCapacityTop',capacity);
    setText('infraLatencyTop',`${safeNum(summary.avg_latency_ms)} ms`);
    setText('avgLatencyKpi',`${safeNum(summary.avg_latency_ms)} ms`);
    setText('sumHealthyTop',safeNum(summary.healthy_nodes));
    const bar=$('heroOccupancyBar');if(bar)bar.style.width=`${Math.max(0,Math.min(100,occ))}%`;
  }

  function updateSummary(s){
    if(!s)return;
    const pairs={
      sumNodes:s.total_nodes,
      sumConfigured:s.configured_nodes,
      sumHealthy:s.healthy_nodes,
      sumTest:s.test_nodes,
      sumSlots:`${s.used_slots}/${s.capacity}`,
      sumAvailable:s.available_slots,
      heroHealthy:`${s.healthy_nodes}/${s.total_nodes}`,
    };
    Object.entries(pairs).forEach(([id,val])=>setText(id,val));
    updateHero(s);
    setText('topologyHealthyText',`${safeNum(s.healthy_nodes)}/${safeNum(s.total_nodes)} saudáveis`);
  }

  function rebuildRackSlots(card,capacity,active){
    const grid=card.querySelector('.server-slot-grid');
    if(!grid)return;
    const existing=grid.querySelectorAll('[data-slot-index]');
    if(existing.length!==capacity){
      grid.innerHTML='';
      grid.style.gridTemplateRows=`repeat(${Math.max(1,capacity)},1fr)`;
      for(let i=1;i<=capacity;i++){
        const slot=document.createElement('div');
        slot.className='server-slot';
        slot.dataset.slotIndex=String(i);
        slot.innerHTML='<span class="slot-led"></span><span class="slot-line"></span><span class="slot-line short"></span>';
        grid.appendChild(slot);
      }
    }
    grid.querySelectorAll('[data-slot-index]').forEach(slot=>{
      const idx=safeNum(slot.getAttribute('data-slot-index'));
      slot.classList.toggle('active',idx<=active);
    });
  }

  function updateNode(n){
    const card=root.querySelector(`[data-node-id="${CSS.escape(String(n.id))}"]`);
    if(!card)return;
    const set=(field,val)=>{const el=card.querySelector(`[data-field="${field}"]`);if(el)el.textContent=val;};
    const status=String(n.status||'pending');
    card.dataset.status=status;
    const badge=card.querySelector('[data-field="status"]');
    if(badge){badge.textContent=statusLabel(status);badge.className=`server-status status-${status}`;}
    const active=safeNum(n.active_jobs,n.active_users);
    const capacity=Math.max(1,safeNum(n.capacity,4));
    const available=Math.max(0,safeNum(n.available_slots,capacity-active));
    set('name',n.name||`VANO Node ${n.id}`);
    set('region',n.region||'Render');
    set('active_users',active);
    set('available_slots_text',available);
    const pct=Math.max(0,Math.min(100,safeNum(n.occupancy_pct,capacity?(100*active/capacity):0)));
    const bar=card.querySelector('[data-field="occupancy_bar"]');if(bar)bar.style.width=`${pct}%`;
    const rackFill=card.querySelector('[data-field="rack_fill"]');if(rackFill)rackFill.style.height=`${pct}%`;
    set('occupancy_pct_text',`${pct}%`);
    set('occupancy_label',active>=capacity?'Servidor cheio':active>0?'Em uso':'Disponível');
    rebuildRackSlots(card,capacity,active);
    set('latency_ms',fmt(n.latency_ms,' ms'));
    set('response_avg_ms',fmt(n.response_avg_ms,' ms'));
    set('response_p95_ms',fmt(n.response_p95_ms,' ms'));
    set('requests_min',fmt(n.requests_min));
    set('cpu_pct',fmt(n.cpu_pct,'%'));
    set('memory_pct',fmt(n.memory_pct,'%'));
    set('url',n.url||'Aguardando configuração');
    set('provider',n.provider||'Render');
    set('environment',n.environment||'production');
    set('health_path',n.health_path||'/healthz');
    set('mode',n.mode==='real'?'Real':'Teste');
    set('config_source',n.config_source||'default');
    set('priority',safeNum(n.priority,100));
    set('note',n.note||'');
    set('http_status',`HTTP ${n.http_status||'—'}`);
    const test=card.querySelector('.test-node');
    if(test){test.disabled=!n.configured;test.title=n.configured?'Testar este node':'Configure a URL primeiro';}
    const topo=root.querySelector(`[data-topology-node="${CSS.escape(String(n.id))}"]`);if(topo){topo.className=`topology-node ${status}`;const title=topo.querySelector('[data-topology-name]');if(title)title.textContent=n.name||n.id;const meta=topo.querySelector('[data-topology-meta]');if(meta)meta.textContent=`${active}/${capacity} · ${fmt(n.latency_ms,' ms')}`;const region=topo.querySelector('[data-topology-region]');if(region)region.textContent=n.region||'Render';}
  }

  function updateFilterCounts(){
    const nodes=lastPayload.nodes||[];
    const counts={all:nodes.length,online:0,degraded:0,offline:0};
    nodes.forEach(n=>{const s=String(n.status||'pending');if(s==='online')counts.online++;else if(s==='offline'||s==='disabled')counts.offline++;else counts.degraded++;});
    setText('filterCountAll',counts.all);setText('filterCountOnline',counts.online);setText('filterCountDegraded',counts.degraded);setText('filterCountOffline',counts.offline);
  }
  function sortNodeCards(){
    const grid=$('serverGrid');if(!grid)return;
    const rank={online:0,degraded:1,pending:1,draining:2,offline:3,disabled:4};
    const cards=[...grid.querySelectorAll('.server-card')];
    cards.sort((ca,cb)=>{
      const na=nodeByIndex(ca.querySelector('.configure-node')?.dataset.nodeIndex)||{},nb=nodeByIndex(cb.querySelector('.configure-node')?.dataset.nodeIndex)||{};
      if(nodeSortMode==='latency')return safeNum(na.latency_ms,999999)-safeNum(nb.latency_ms,999999);
      if(nodeSortMode==='occupancy')return safeNum(nb.occupancy_pct)-safeNum(na.occupancy_pct);
      if(nodeSortMode==='priority')return safeNum(na.priority,100)-safeNum(nb.priority,100)||safeNum(na.index)-safeNum(nb.index);
      return safeNum(rank[String(na.status||'pending')],9)-safeNum(rank[String(nb.status||'pending')],9)||safeNum(na.latency_ms,999999)-safeNum(nb.latency_ms,999999);
    });
    cards.forEach(c=>grid.appendChild(c));
  }

  function applyNodeFilters(){
    root.querySelectorAll('.server-card').forEach(card=>{
      const status=String(card.dataset.status||'pending');
      const filterOk=activeNodeFilter==='all'||(activeNodeFilter==='online'&&status==='online')||(activeNodeFilter==='offline'&&(status==='offline'||status==='disabled'))||(activeNodeFilter==='degraded'&&!['online','offline','disabled'].includes(status));
      const hay=(card.textContent||'').toLowerCase();
      const searchOk=!nodeSearchTerm||hay.includes(nodeSearchTerm);
      card.classList.toggle('is-filtered-out',!(filterOk&&searchOk));
    });
  }

  function apply(payload){
    if(!payload)return;
    lastPayload=payload;
    (payload.nodes||[]).forEach(updateNode);
    updateSummary(payload.summary||{});
    updateFilterCounts();sortNodeCards();applyNodeFilters();
    const up=$('infraUpdated');
    if(up){const d=new Date(payload.generated_at||Date.now());up.textContent=`Atualizado ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;}
  }

  async function refresh(force=true){
    if(testBtn){testBtn.disabled=true;testBtn.innerHTML='<span class="loading"></span>Testando…';}
    try{
      const r=await fetch(`/api/admin/servers/status?refresh=${force?1:0}`,{headers:{Accept:'application/json'}});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Falha ao consultar infraestrutura');
      apply(d);
    }catch(e){const up=$('infraUpdated');if(up)up.textContent='Falha ao atualizar nodes';console.warn('[VANO admin infra]',e);}
    finally{if(testBtn){testBtn.disabled=false;testBtn.innerHTML='<i data-lucide="activity" width="16"></i>Testar todos';if(window.lucide)window.lucide.createIcons();}}
  }

  function nodeByIndex(index){return (lastPayload.nodes||[]).find(n=>safeNum(n.index)===safeNum(index))||null;}

  function openModal(index){
    const n=nodeByIndex(index)||{};
    $('nodeConfigIndex').value=String(index);
    $('nodeConfigTitle').textContent=`Configurar Node ${String(index).padStart(2,'0')}`;
    $('nodeConfigName').value=n.name||`VANO Node ${String(index).padStart(2,'0')}`;
    $('nodeConfigProvider').value=n.provider||'Render';
    $('nodeConfigRegion').value=n.region||'Render';
    $('nodeConfigEnvironment').value=n.environment||'production';
    $('nodeConfigUrl').value=n.url||'';
    $('nodeConfigCapacity').value=String(safeNum(n.capacity,4));
    $('nodeConfigPriority').value=String(safeNum(n.priority,100));
    $('nodeConfigConnectTimeout').value=String(safeNum(n.connect_timeout_s,2.2));
    $('nodeConfigRouteTimeout').value=String(safeNum(n.route_timeout_s,10));
    $('nodeConfigCooldown').value=String(safeNum(n.cooldown_s,20));
    $('nodeConfigHealth').value=n.health_path||'/healthz';
    $('nodeConfigRoutePath').value=n.route_path||'/v1/route/calculate';
    $('nodeConfigPrecalcPath').value=n.precalc_path||'/v1/route/precalculate';
    $('nodeConfigNotes').value=n.notes||'';
    $('nodeConfigEnabled').checked=n.enabled!==false;
    $('nodeConfigDrain').checked=!!n.drain_mode;
    const msg=$('nodeConfigMessage');msg.textContent='';msg.className='node-config-message';
    modal.hidden=false;
    document.body.style.overflow='hidden';
    setTimeout(()=>$('nodeConfigUrl')?.focus(),50);
  }

  function closeModal(){modal.hidden=true;document.body.style.overflow='';}

  async function saveConfig(ev){
    ev.preventDefault();
    const index=safeNum($('nodeConfigIndex').value);
    const btn=$('saveNodeConfig');
    const msg=$('nodeConfigMessage');
    btn.disabled=true;msg.textContent='Salvando…';msg.className='node-config-message';
    const payload={
      name:$('nodeConfigName').value.trim(),
      provider:$('nodeConfigProvider').value,
      region:$('nodeConfigRegion').value.trim(),
      environment:$('nodeConfigEnvironment').value,
      url:$('nodeConfigUrl').value.trim(),
      capacity:safeNum($('nodeConfigCapacity').value,4),
      priority:safeNum($('nodeConfigPriority').value,100),
      connect_timeout_s:safeNum($('nodeConfigConnectTimeout').value,2.2),
      route_timeout_s:safeNum($('nodeConfigRouteTimeout').value,10),
      cooldown_s:safeNum($('nodeConfigCooldown').value,20),
      health_path:$('nodeConfigHealth').value.trim()||'/healthz',
      route_path:$('nodeConfigRoutePath').value.trim()||'/v1/route/calculate',
      precalc_path:$('nodeConfigPrecalcPath').value.trim()||'/v1/route/precalculate',
      notes:$('nodeConfigNotes').value.trim(),
      enabled:$('nodeConfigEnabled').checked,
      drain_mode:$('nodeConfigDrain').checked,
    };
    try{
      const r=await fetch(`/api/admin/servers/${index}/config`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify(payload)});
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'Não foi possível salvar.');
      msg.textContent='Servidor salvo. Testando conexão…';msg.className='node-config-message ok';
      await refresh(true);
      setTimeout(closeModal,500);
    }catch(e){msg.textContent=e.message||'Erro ao salvar servidor.';msg.className='node-config-message error';}
    finally{btn.disabled=false;}
  }

  async function testOne(index,button){
    const original=button.innerHTML;button.disabled=true;button.textContent='Testando…';
    try{
      const r=await fetch(`/api/admin/servers/${index}/test`,{method:'POST',headers:{Accept:'application/json','X-CSRF-Token':csrf()}});
      const d=await r.json();
      if(d.node)updateNode(d.node);
      if(!r.ok||!d.ok)throw new Error(d.error||'Node não respondeu.');
      button.textContent='Online ✓';
      setTimeout(()=>{button.innerHTML=original;button.disabled=false;if(window.lucide)window.lucide.createIcons();},1200);
    }catch(e){button.textContent='Falhou';button.title=e.message||'Falha';setTimeout(()=>{button.innerHTML=original;button.disabled=false;if(window.lucide)window.lucide.createIcons();},1600);}
  }

  try{apply(JSON.parse($('infraInitial')?.textContent||'{}'));}catch{}
  testBtn?.addEventListener('click',()=>refresh(true));
  root.addEventListener('click',ev=>{
    const cfg=ev.target.closest('.configure-node');if(cfg){openModal(cfg.dataset.nodeIndex);return;}
    const tst=ev.target.closest('.test-node');if(tst&&!tst.disabled){testOne(tst.dataset.nodeIndex,tst);}
  });
  modal?.addEventListener('click',ev=>{if(ev.target.closest('[data-close-node-modal]'))closeModal();});
  form?.addEventListener('submit',saveConfig);
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&modal&&!modal.hidden)closeModal();});
  root.querySelectorAll('[data-node-filter]').forEach(btn=>btn.addEventListener('click',()=>{root.querySelectorAll('[data-node-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');activeNodeFilter=btn.dataset.nodeFilter||'all';applyNodeFilters();}));
  $('nodeSearchInput')?.addEventListener('input',e=>{nodeSearchTerm=String(e.target.value||'').trim().toLowerCase();applyNodeFilters();});
  $('nodeSortSelect')?.addEventListener('change',e=>{nodeSortMode=String(e.target.value||'status');sortNodeCards();applyNodeFilters();});
  const timer=setInterval(()=>{if(!document.hidden)refresh(true);},12000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  setTimeout(()=>refresh(true),700);
})();
