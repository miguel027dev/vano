import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,ArrowLeft,CheckCircle2,Clock3,Copy,KeyRound,LockKeyhole,MessageSquareText,Plus,RefreshCw,ShieldCheck,Send,SquareKanban,TriangleAlert,Users,Wifi} from 'lucide-react';
import {api,post} from '../lib/api';
import {useVano} from '../context';
import '../devsync-console.css';

const AREA_LABEL={gps:'GPS',routing:'Rotas','map-ui':'Mapa e interface',mavi:'MAVI',backend:'Backend',android:'Android',infrastructure:'Infraestrutura',admin:'Painel administrativo',marketing:'Marketing',other:'Outro'};
const STATUS_LABEL={planned:'Aguardando',in_progress:'Em andamento',blocked:'Bloqueada',review:'Revisão',done:'Concluída',cancelled:'Cancelada'};
const KIND_LABEL={message:'Conversa',progress:'Progresso',decision:'Decisão',blocker:'Bloqueio',handoff:'Entrega',system:'Sistema'};
const when=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'};
const leaseKey=id=>'vano-devsync-lease-'+id;
const getLease=id=>{try{return sessionStorage.getItem(leaseKey(id))||''}catch{return''}};
const setLease=(id,v)=>{try{if(v)sessionStorage.setItem(leaseKey(id),v);else sessionStorage.removeItem(leaseKey(id))}catch{}};
const fresh={title:'',area:'gps',scope:'',branch:'',model:'',actor:'Console VANO',summary:''};

export default function DevSyncPage(){
 const {user,loading}=useVano();
 const [snapshot,setSnapshot]=useState(null),[keys,setKeys]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[working,setWorking]=useState(false);
 const [task,setTask]=useState(fresh),[event,setEvent]=useState({actor:'Console VANO',kind:'progress',taskId:'',body:''});
 const [newAgent,setNewAgent]=useState(''),[newToken,setNewToken]=useState('');
 const [lastSync,setLastSync]=useState(null),[tick,setTick]=useState(0);
 const tasks=snapshot?.tasks||[];
 const events=snapshot?.events||[];
 const statistics=snapshot?.stats||{};
 const refresh=useCallback(async()=>{
  const [a,b]=await Promise.all([api('/admin/dev-sync/handoff'),api('/admin/dev-sync/keys')]);
  setSnapshot(a);setKeys(b.keys||[]);setLastSync(new Date());
 },[]);
 useEffect(()=>{
  if(!user?.isAdmin)return;
  let active=true;
  refresh().catch(e=>{if(active)setError(e.message)});
  const timer=setInterval(()=>{if(active&&document.visibilityState==='visible')refresh().catch(()=>{})},6500);
  return()=>{active=false;clearInterval(timer)};
 },[user?.isAdmin,refresh]);
 useEffect(()=>{
  if(!user?.isAdmin)return;
  const timer=setInterval(()=>{
   if(document.visibilityState!=='visible')return;
   for(const t of tasks){
    if(t.status!=='in_progress'||!getLease(t.id))continue;
    post('/admin/dev-sync/tasks/'+t.id+'/pulse',{leaseToken:getLease(t.id)}).catch(()=>{setLease(t.id,'');setTick(x=>x+1)});
   }
  },4*60*1000);
  return()=>clearInterval(timer);
 },[user?.isAdmin,tasks]);
 const run=async(callback)=>{
  if(working)return;
  setWorking(true);setError('');setNotice('');
  try{await callback();await refresh()}catch(e){setError(e.message||'Não foi possível salvar.')}finally{setWorking(false)}
 };
 const createTask=e=>{e.preventDefault();run(async()=>{
  const r=await post('/admin/dev-sync/tasks',task);
  setTask(v=>({...v,title:'',summary:''}));
  setEvent(v=>({...v,taskId:String(r.taskId)}));
  setNotice('Tarefa #'+r.taskId+' criada. Assuma a área antes de começar.');
 })};
 const claim=t=>run(async()=>{
  const r=await post('/admin/dev-sync/tasks/'+t.id+'/claim',{actor:task.actor||'Console VANO',model:task.model,leaseToken:getLease(t.id)});
  setLease(t.id,r.leaseToken);setTick(v=>v+1);
  setNotice('Área '+AREA_LABEL[t.area]+' reservada com sucesso.');
 });
 const transition=(t,status)=>run(async()=>{
  const summary=window.prompt('Registre o resultado, commits/PR, testes e próximos passos:');
  if(summary===null)return;
  if(!summary.trim())throw Error('O resumo não pode ficar vazio.');
  await post('/admin/dev-sync/tasks/'+t.id+'/transition',{status,summary,leaseToken:getLease(t.id)});
  setLease(t.id,'');setTick(v=>v+1);setNotice('Status atualizado.');
 });
 const publish=e=>{e.preventDefault();run(async()=>{
  await post('/admin/dev-sync/events',{...event,taskId:event.taskId?Number(event.taskId):null,
   leaseToken:event.taskId?getLease(event.taskId):''});
  setEvent(v=>({...v,body:''}));setNotice('Atualização registrada no histórico.');
 })};
 const issue=e=>{e.preventDefault();run(async()=>{
  setNewToken('');
  const r=await post('/admin/dev-sync/keys',{name:newAgent.trim()});
  setNewToken(r.token);setNewAgent('');
  setNotice('Credencial criada; exibida somente desta vez.');
 })};
 const revoke=k=>run(async()=>{
  if(!window.confirm('Revogar permanentemente o acesso de '+k.name+'?'))return;
  await post('/admin/dev-sync/keys/'+k.id+'/revoke',{});
  setNotice('Credencial revogada.');
 });
 const copy=async(value)=>{
  try{await navigator.clipboard.writeText(value);setNotice('Copiado para a área de transferência.')}catch{setError('Não foi possível copiar.')}
 };
 const promptForAgent=useMemo(()=>`Argon: use a central VANO DevSync em https://vanu-73xu.onrender.com/admin/dev-sync. Leia GET /api/agent/dev-sync/handoff com seu token privado guardado no ambiente (Authorization: Bearer VANO_DEVSYNC_TOKEN); crie uma tarefa, assuma a área antes de editar, registre progress/decision/blocker via POST /api/agent/dev-sync/events e finalize com PR, testes e pendências. Não inicie mudanças se receber HTTP 409. Nunca inclua credenciais em logs ou conversas.`,[]);
 if(loading)return <main className="ds2-root"><p>Verificando acesso…</p></main>;
 if(!user?.isAdmin)return <main className="ds2-root ds2-locked"><LockKeyhole size={34}/><h1>Área administrativa</h1><p>Disponível somente para a conta administrativa verificada.</p><Link to="/admin">Voltar</Link></main>;
 return <main className="ds2-root" id="conteudo" data-testid="devsync-admin">
  <header className="ds2-top"><div>
   <div className="ds2-eyebrow"><span className="ds2-led"/> VANO OPERATIONS · PRIVADO</div>
   <h1>DevSync<span>.</span></h1>
   <p>A mesma linha do tempo para todos os chats e modelos. Cada alteração tem responsável, contexto e histórico auditável.</p>
  </div><div className="ds2-head-actions"><Link to="/admin"><ArrowLeft size={16}/> Administração</Link><button onClick={()=>run(async()=>{})} disabled={working}><RefreshCw size={16}/> Atualizar</button><button className="ds2-strong" onClick={()=>copy(promptForAgent)}><Copy size={16}/> Instrução para Argon</button></div></header>
  {error&&<div className="ds2-error" role="alert"><TriangleAlert size={17}/>{error}<button type="button" onClick={()=>setError('')} aria-label="Dispensar erro">×</button></div>}
  {notice&&<div className="ds2-notice" role="status"><CheckCircle2 size={17}/>{notice}</div>}
  <div className="ds2-stats">
   <div><Activity size={19}/><strong>{statistics.active??0}</strong><span>Em andamento</span></div>
   <div><Clock3 size={19}/><strong>{statistics.pending??0}</strong><span>Aguardando</span></div>
   <div><TriangleAlert size={19}/><strong>{statistics.blocked??0}</strong><span>Bloqueadas</span></div>
   <div><Wifi size={19}/><strong>{lastSync?lastSync.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—'}</strong><span>Última sincronização</span></div>
  </div>
  <div className="ds2-layout">
   <div className="ds2-stack">
    <section className="ds2-panel"><div className="ds2-panel-head"><div><span>PLANEJAMENTO</span><h2><Plus size={18}/> Nova tarefa</h2></div></div>
     <form onSubmit={createTask} className="ds2-form">
      <label>O que será feito?<input required maxLength="160" value={task.title} onChange={e=>setTask({...task,title:e.target.value})} placeholder="Corrigir orientação GPS na navegação"/></label>
      <div className="ds2-fields"><label>Área<select value={task.area} onChange={e=>setTask({...task,area:e.target.value})}>{Object.entries(AREA_LABEL).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label><label>Modelo<input value={task.model} maxLength="70" onChange={e=>setTask({...task,model:e.target.value})} placeholder="Argon / GPT-6"/></label></div>
      <label>Identificação do chat<input required maxLength="70" value={task.actor} onChange={e=>setTask({...task,actor:e.target.value})}/></label>
      <div className="ds2-fields"><label>Arquivo ou escopo<input maxLength="160" value={task.scope} onChange={e=>setTask({...task,scope:e.target.value})} placeholder="src/pages/MapPage"/></label><label>Branch<input maxLength="180" value={task.branch} onChange={e=>setTask({...task,branch:e.target.value})} placeholder="fix/gps"/></label></div>
      <label>Plano e riscos<textarea rows="3" maxLength="1000" value={task.summary} onChange={e=>setTask({...task,summary:e.target.value})} placeholder="Etapas, arquivos e o que não pode ser quebrado"/></label>
      <button type="submit" className="ds2-primary" disabled={working}><Plus size={16}/> Registrar tarefa</button>
     </form>
    </section>
    <section className="ds2-panel"><div className="ds2-panel-head"><div><span>WORKSPACE</span><h2><SquareKanban size={18}/> Tarefas & reservas</h2></div><small>Lease de 15 min</small></div>
     <div className="ds2-task-list" aria-live="polite">{tasks.length?tasks.map(t=>{
      const live=t.status==='in_progress'&&new Date(t.leaseExpiresAt).getTime()>Date.now();
      const owned=live&&Boolean(getLease(t.id));void tick;
      return <article key={t.id} className="ds2-task">
       <div className="ds2-task-title"><strong>#{t.id} · {t.title}</strong><span data-status={t.status}>{STATUS_LABEL[t.status]||t.status}</span></div>
       <small>{AREA_LABEL[t.area]||t.area} · {t.actor||'Não atribuído'}{t.model?' · '+t.model:''}</small>
       {t.scope&&<small>{t.scope}</small>}{t.branch&&<code>{t.branch}</code>}
       {t.summary&&<p>{t.summary}</p>}
       {live&&<small>Reservada até {when(t.leaseExpiresAt)}</small>}
       <div className="ds2-task-actions">{!live&&!['done','cancelled'].includes(t.status)&&<button type="button" onClick={()=>claim(t)} disabled={working}>Assumir área</button>}
       {owned&&<><button type="button" onClick={()=>transition(t,'review')} disabled={working}>Entregar</button><button type="button" onClick={()=>transition(t,'done')} disabled={working}>Concluir</button><button type="button" onClick={()=>transition(t,'blocked')} disabled={working}>Bloquear</button></>}</div>
      </article>;
     }):<p className="ds2-empty">Nenhuma tarefa registrada ainda.</p>}</div>
    </section>
   </div>
   <div className="ds2-stack">
    <section className="ds2-panel ds2-chat-panel"><div className="ds2-panel-head"><div><span>REGISTRO COMPARTILHADO</span><h2><MessageSquareText size={18}/> Chat, logs e progresso</h2></div><span className="ds2-live">Sincronização automática</span></div>
     <div className="ds2-feed" role="log" aria-label="Histórico DevSync" aria-live="polite">
      {events.length?events.map(item=><article key={item.id} className="ds2-msg" data-kind={item.kind}>
       <div className="ds2-msg-head"><strong>{item.actor}</strong><time>{when(item.createdAt)}</time></div>
       <small>{KIND_LABEL[item.kind]||item.kind}{item.taskId?' · Tarefa #'+item.taskId:' · Geral'}</small><p>{item.body}</p>
      </article>):<p className="ds2-empty">O primeiro registro aparecerá aqui. Nenhuma mensagem é enviada automaticamente por um modelo externo até ele se autenticar.</p>}
     </div>
     <form onSubmit={publish} className="ds2-form ds2-compose">
      <div className="ds2-fields"><label>Quem está falando<input required maxLength="70" value={event.actor} onChange={e=>setEvent({...event,actor:e.target.value})}/></label>
      <label>Tipo<select value={event.kind} onChange={e=>setEvent({...event,kind:e.target.value})}>{Object.entries(KIND_LABEL).filter(([k])=>k!=='system').map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label></div>
      <label>Vincular à tarefa<select value={event.taskId} onChange={e=>setEvent({...event,taskId:e.target.value})}><option value="">Mensagem geral</option>{tasks.map(t=><option value={String(t.id)} key={t.id}>#{t.id} · {t.title.slice(0,60)}</option>)}</select></label>
      <label>Atualização<textarea rows="3" required maxLength="1600" value={event.body} onChange={e=>setEvent({...event,body:e.target.value})} placeholder="O que foi feito? Quais arquivos, testes, commits, decisões?"/></label>
      <button className="ds2-primary" type="submit" disabled={working}><Send size={16}/> Publicar no histórico</button>
     </form>
    </section>
    <section className="ds2-panel"><div className="ds2-panel-head"><div><span>INTEGRAÇÕES</span><h2><KeyRound size={18}/> Agentes autorizados</h2></div><ShieldCheck size={18}/></div>
     <p className="ds2-muted">Crie um acesso restrito para Argon ou outro agente. Ele poderá ler o contexto e registrar o trabalho, sem acesso aos outros recursos administrativos.</p>
     <form onSubmit={issue} className="ds2-agent-form"><label>Nome do agente<input required maxLength="70" value={newAgent} onChange={e=>setNewAgent(e.target.value)} placeholder="Argon · manutenção GPS"/></label><button className="ds2-primary" type="submit" disabled={working}><KeyRound size={16}/> Gerar credencial</button></form>
     {newToken&&<div className="ds2-secret"><strong>Credencial gerada — mostrada uma única vez</strong><textarea readOnly aria-label="Token de agente" value={newToken} rows="2" spellCheck="false"/><button type="button" onClick={()=>copy(newToken)}><Copy size={15}/> Copiar credencial</button><small>Guarde como variável de ambiente privada do agente. Não envie em chat, repositório ou logs.</small></div>}
     <div className="ds2-agent-list">{keys.length?keys.map(k=><div key={k.id} className="ds2-agent-row"><div><strong>{k.name}</strong><small>{k.revokedAt?'Revogada':k.expiresAt&&new Date(k.expiresAt).getTime()<Date.now()?'Expirada':'Válida até '+when(k.expiresAt)}</small></div>{!k.revokedAt&&new Date(k.expiresAt).getTime()>Date.now()&&<button disabled={working} onClick={()=>revoke(k)}>Revogar</button>}</div>):<p className="ds2-empty">Nenhum agente autorizado.</p>}</div>
     <div className="ds2-help"><Users size={17}/><span>Protocolo para agentes: consultar <code>GET /api/agent/dev-sync/handoff</code>, reservar a área e registrar cada avanço. Uma reserva só evita conflitos entre agentes que usam o protocolo; não bloqueia commits diretos no GitHub.</span></div>
    </section>
   </div>
  </div>
 </main>;
}
