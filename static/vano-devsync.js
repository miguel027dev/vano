(()=>{
'use strict';
const root=document.querySelector('[data-devsync]');if(!root)return;
const $=id=>document.getElementById(id);
const API='/api/admin/dev-sync';
const csrf=()=>window.VANO?.csrf||'';
let current={tasks:[],events:[],audit:[],conflicts:[],stats:{}},loading=false;
let lastVersion='',lastFeedVersion='';
const storeKey=id=>'vano.devsync.lease.'+id;
const getLease=id=>{try{return sessionStorage.getItem(storeKey(id))||''}catch{return''}};
const setLease=(id,token)=>{try{if(token)sessionStorage.setItem(storeKey(id),token);else sessionStorage.removeItem(storeKey(id))}catch{}};
const message=(s,ok=false)=>{const el=$('dsNotice');el.textContent=s||'';el.classList.toggle('ds-ok',!!ok)};
const date=v=>{try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v))}catch{return v||''}};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined&&text!==null)node.textContent=String(text);return node};
const field=(form,name)=>String(new FormData(form).get(name)||'').trim();
const stateLabel=s=>({planned:'Planejada',in_progress:'Em andamento',blocked:'Bloqueada',review:'Revisão',done:'Concluída',cancelled:'Cancelada'})[s]||s;
const kindLabel=s=>({message:'Mensagem',progress:'Progresso',decision:'Decisão',blocker:'Bloqueio',handoff:'Entrega',system:'Sistema'})[s]||s;
async function request(path,method='GET',body){
  const headers={'Accept':'application/json'};
  if(method!=='GET'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=csrf()}
  const response=await fetch(API+path,{method,credentials:'same-origin',cache:'no-store',headers,body:method==='GET'?undefined:JSON.stringify(body||{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok){const err=new Error(data?.error||'Falha de comunicação.');err.conflict=data?.conflict;throw err}
  return data
}
function safeSubmit(button,action){
  if(button.disabled)return;
  button.disabled=true;
  Promise.resolve().then(action).catch(e=>{
    const extra=e.conflict?' Tarefa #'+e.conflict.task_id+' por '+e.conflict.actor+'.':'';
    message(e.message+extra,false)
  }).finally(()=>{button.disabled=false})
}
function renderTasks(tasks){
  const list=$('dsTasks');list.replaceChildren();
  if(!tasks.length){list.appendChild(el('div','ds-empty','Ainda não há tarefas registradas.'));return}
  for(const item of tasks){
    const card=el('article','ds-task'),head=el('div','ds-task-top'),left=el('div');
    left.appendChild(el('b','',item.title+' · #'+item.id));
    left.appendChild(el('small','',item.area+(item.scope?' · '+item.scope:'')+(item.branch?' · '+item.branch:'')));
    left.appendChild(el('small','',(item.actor||'Sem responsável')+(item.model?' / '+item.model:'')+' · '+date(item.updated_at)));
    const tag=el('span','ds-tag',stateLabel(item.status));tag.dataset.state=item.status;
    head.append(left,tag);card.appendChild(head);
    if(item.summary)card.appendChild(el('p','',item.summary));
    const active=item.status==='in_progress'&&item.lease_expires_at&&new Date(item.lease_expires_at)>new Date();
    if(active)card.appendChild(el('small','', 'Reserva até '+date(item.lease_expires_at)));
    const actions=el('div','ds-buttons');
    const token=getLease(item.id);
    const own=active&&!!token;
    const btn=(name,run,primary=false)=>{
      const b=el('button',primary?'ds-primary':'',name);b.type='button';
      b.addEventListener('click',()=>safeSubmit(b,run));actions.appendChild(b)
    };
    if(!active&&!['done','cancelled'].includes(item.status))btn('Assumir área',async()=>{
      const actor=$('dsMessageActor').value.trim()||$('dsTaskActor').value.trim()||'Administrador';
      const model=$('dsTaskForm').elements.namedItem('model').value.trim();
      const r=await request('/tasks/'+item.id+'/claim','POST',{actor,model});
      setLease(item.id,r.lease_token);message('Área '+item.area+' reservada para '+actor+'.',true);await refresh()
    },true);
    if(own){
      btn('Renovar reserva',async()=>{
        await request('/tasks/'+item.id+'/pulse','POST',{lease_token:token});message('Reserva renovada.',true);await refresh()
      });
      for(const [title,status] of [['Concluir','done'],['Revisão / handoff','review'],['Bloquear','blocked'],['Cancelar','cancelled']]){
        btn(title,async()=>{
          const summary=window.prompt('Registre o que foi feito, links de commit/PR, riscos e próximos passos:');
          if(summary===null)return;
          if(!summary.trim()){message('O resumo é obrigatório.');return}
          await request('/tasks/'+item.id+'/transition','POST',{lease_token:token,status,summary:summary.trim()});
          setLease(item.id,'');message('Status atualizado.',true);await refresh()
        },status==='done')
      }
    }
    card.appendChild(actions);list.appendChild(card)
  }
}
function renderMessages(events){
  const feed=$('dsFeed');feed.replaceChildren();
  if(!events.length){feed.appendChild(el('div','ds-empty','Nenhum registro ainda. Comece contando o que será feito.'));return}
  for(const entry of events){
    const item=el('article','ds-event');item.dataset.kind=entry.kind;
    const header=el('header'),left=el('div');
    left.appendChild(el('b','',entry.actor));
    left.appendChild(el('small','',kindLabel(entry.kind)+(entry.task_id?' · tarefa #'+entry.task_id:' · geral')));
    header.append(left,el('time','',date(entry.created_at)));
    item.appendChild(header);item.appendChild(el('p','',entry.body));feed.appendChild(item)
  }
}
function renderAudit(rows){
  const feed=$('dsAudit');feed.replaceChildren();
  if(!rows.length){feed.appendChild(el('div','ds-empty','Nenhum registro disponível.'));return}
  for(const row of rows){
    const item=el('div','ds-log'),left=el('div');
    left.append(el('span','',row.action),el('small','',row.actor));
    item.append(left,el('time','',date(row.created_at)));feed.appendChild(item)
  }
}
function renderOptions(tasks){
  const select=$('dsTaskSelect'),prev=select.value;
  select.replaceChildren(new Option('Mensagem geral',''));
  for(const t of tasks){select.add(new Option('#'+t.id+' · '+t.title.slice(0,60),String(t.id)))}
  if([...select.options].some(o=>o.value===prev))select.value=prev
}
function render(state){
  const signature=JSON.stringify(state.tasks.map(t=>[t.id,t.version,t.status,t.lease_expires_at]));
  const feedSignature=state.events.length?state.events[0].id+':'+state.events.length:'none';
  $('dsActive').textContent=state.stats.active??0;
  $('dsPlanned').textContent=state.stats.pending??0;
  $('dsBlocked').textContent=state.stats.blocked??0;
  $('dsUpdated').textContent='Sincronizado · '+new Date().toLocaleTimeString('pt-BR');
  const conflicts=$('dsConflicts');
  conflicts.textContent=state.conflicts?.length?state.conflicts.length+' trabalho(s) aguardam uma área ocupada. Verifique as reservas antes de agir.':'';
  if(signature!==lastVersion){lastVersion=signature;renderTasks(state.tasks);renderOptions(state.tasks)}
  if(feedSignature!==lastFeedVersion){lastFeedVersion=feedSignature;renderMessages(state.events)}
  renderAudit(state.audit);
}
async function refresh(){
  if(loading)return;
  loading=true;
  try{current=await request('/snapshot');render(current)}
  catch(e){message('Não foi possível sincronizar: '+e.message)}
  finally{loading=false}
}
function preserveActor(){
  const actor=$('dsTaskActor').value.trim()||$('dsMessageActor').value.trim();
  if(actor){$('dsTaskActor').value=actor;$('dsMessageActor').value=actor;try{sessionStorage.setItem('vano.devsync.actor',actor)}catch{}}
}
$('dsTaskForm').addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');preserveActor();
  safeSubmit(button,async()=>{
    const payload={title:field(form,'title'),area:field(form,'area'),scope:field(form,'scope'),branch:field(form,'branch'),model:field(form,'model'),actor:field(form,'actor'),summary:field(form,'summary')};
    const r=await request('/tasks','POST',payload);
    message('Tarefa #'+r.task_id+' registrada. Agora clique em “Assumir área”.',true);
    form.elements.namedItem('title').value='';form.elements.namedItem('summary').value='';
    await refresh();$('dsTaskSelect').value=String(r.task_id)
  })
});
$('dsMessageForm').addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');preserveActor();
  safeSubmit(button,async()=>{
    await request('/events','POST',{actor:field(form,'actor'),kind:field(form,'kind'),task_id:field(form,'task_id')||null,body:field(form,'body')});
    form.elements.namedItem('body').value='';
    message('Registro publicado na timeline.',true);await refresh()
  })
});
$('dsCopy').addEventListener('click',()=>{
  const button=$('dsCopy');
  safeSubmit(button,async()=>{
    const json=await request('/handoff');
    const summary=JSON.stringify(json,null,2);
    await navigator.clipboard.writeText('Contexto compartilhado de desenvolvimento VANO (admin):\n'+summary+'\nAntes de editar, consulte a central e reivindique uma área.');
    message('Resumo de handoff copiado. Cole no chat autorizado.',true)
  })
});
$('dsRefresh').addEventListener('click',()=>refresh());
const initialActor=(()=>{try{return sessionStorage.getItem('vano.devsync.actor')||''}catch{return''}})();
if(initialActor){$('dsTaskActor').value=initialActor;$('dsMessageActor').value=initialActor}
window.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setInterval(()=>{if(!document.hidden)refresh()},7000);
setInterval(async()=>{
  if(document.hidden)return;
  for(const task of current.tasks||[]){
    if(task.status!=='in_progress'||!getLease(task.id))continue;
    try{await request('/tasks/'+task.id+'/pulse','POST',{lease_token:getLease(task.id)})}
    catch(e){setLease(task.id,'');message('Reserva perdida para a tarefa #'+task.id+': '+e.message)}
  }
},4*60*1000);
refresh();
})();