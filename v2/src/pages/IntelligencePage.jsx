import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,ArrowLeft,ArrowUpRight,BrainCircuit,CheckCircle2,Clock3,Database,RefreshCcw,Route,ShieldCheck,TriangleAlert,LockKeyhole,Send,Layers3,Copy,RotateCcw} from 'lucide-react';
import {api,post} from '../lib/api';
import {useVano} from '../context';
import '../intelligence-console.css';

const fmt=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1});
const day=v=>String(v||'').slice(5);
function Stat({title,value,subtitle,icon:Icon}){return <article className="vint-stat">
 <div className="vint-stat-title"><span>{title}</span><Icon size={17}/></div>
 <strong>{fmt(value)}</strong><small>{subtitle}</small>
 </article>}
function Bars({daily=[]}){
 const max=Math.max(1,...daily.map(x=>x.count||0));
 return <div className="vint-chart" role="img" aria-label="Cálculos de rota por dia">
  {daily.length?daily.map((x,i)=><div className="vint-bar-cell" key={x.name+'-'+i} title={x.name+': '+x.count+' cálculos'}>
    <span className="vint-bar-number">{fmt(x.count)}</span><span className="vint-bar" style={{height:Math.max(3,Math.round(x.count/max*160))+'px'}}/>
    <small>{day(x.name)}</small>
  </div>):<div className="vint-empty">Nenhuma decisão de rota monitorada neste intervalo.</div>}
 </div>;
}
function Rows({rows=[],title='Sem dados no período.'}){
 return <div className="vint-rows">
  {rows.length?rows.map(x=><div className="vint-row" key={x.name}><span>{x.name}</span><strong>{fmt(x.count)}</strong></div>):<p className="vint-empty">{title}</p>}
 </div>;
}
export default function IntelligencePage(){
 const {user,loading}=useVano();
 const [days,setDays]=useState(7),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [question,setQuestion]=useState(''),[asking,setAsking]=useState(false);
 const [mode,setMode]=useState('fast'),[copied,setCopied]=useState(-1);
 const [historyPeriod,setHistoryPeriod]=useState('all');
 const [conversation,setConversation]=useState(()=>{
  try{const stored=JSON.parse(sessionStorage.getItem('vano-intelligence-chat-v2')||'[]');return Array.isArray(stored)?stored.slice(-24):[];}
  catch{return [];}
 });
 const chatBottom=useRef(null);
 useEffect(()=>{try{sessionStorage.setItem('vano-intelligence-chat-v2',JSON.stringify(conversation.slice(-24)));}catch{}},[conversation]);
 useEffect(()=>{chatBottom.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[conversation,asking]);
 const [view,setView]=useState('routes');
 async function refresh(){
  setBusy(true);setError('');
  try{setSnapshot(await api('/admin/intelligence/overview?days='+days));}
  catch(e){setError(e.message||'Não foi possível carregar os dados.');setSnapshot(null);}
  finally{setBusy(false);}
 }
 useEffect(()=>{if(user?.isAdmin)refresh();},[user?.isAdmin,days]);
 const route=snapshot?.route_decisions||{},infra=snapshot?.infrastructure||{},quality=snapshot?.route_quality||{};
 const findings=snapshot?.findings||[];
 const suggestions=useMemo(()=>[
  'Quais sinais mais importantes sugerem problemas de roteamento?',
  'Analise falhas, contingências e mudanças que devo priorizar.',
  'Quais dados precisamos coletar para medir congestionamento real?',
 ],[]);
 async function submit(e){
  e?.preventDefault?.();
  const userQuestion=question.trim();
  if(asking||userQuestion.length<2)return;
  const prior=conversation.filter(turn=>turn.role==='user'||turn.role==='assistant').slice(-12)
   .map(({role,content})=>({role,content}));
  setConversation(turns=>[...turns.slice(-23),{role:'user',content:userQuestion}]);
  setQuestion('');setAsking(true);
  try{
   const result=await post('/admin/intelligence/ask',{
    question:userQuestion,days,historyPeriod,mode,history:prior
   });
   setConversation(turns=>[...turns.slice(-23),{
    role:'assistant',content:result.answer||'O modelo não retornou conteúdo.',
    model:result.model||'',latencyMs:result.latencyMs||0,fallbackUsed:result.fallbackUsed===true,
   }]);
  }catch(err){
   setConversation(turns=>[...turns.slice(-23),{
    role:'error',content:'Não foi possível concluir a análise: '+(err.message||'Serviço indisponível')+'.',
    question:userQuestion,
   }]);
  }finally{setAsking(false);}
 }
 async function copyAnswer(value,index){
  try{await navigator.clipboard.writeText(value);setCopied(index);}
  catch{setCopied(-1);}
 }
 if(loading)return <main className="vint-wrap">Verificando acesso…</main>;
 if(!user?.isAdmin)return <main className="vint-wrap vint-restricted"><LockKeyhole size={35}/><h1>Área administrativa</h1><p>Somente administradores autenticados podem acessar os diagnósticos.</p><Link to="/admin">Voltar ao painel</Link></main>;
 return <main className="vint-wrap" id="conteudo">
  <header className="vint-heading"><div>
   <div className="vint-eyebrow"><BrainCircuit size={16}/> VANO MAPS · INTELLIGENCE</div>
   <h1>Inteligência de rotas<span>.</span></h1>
   <p>Decisões auditáveis, sinais operacionais e investigação por IA — sem expor localização pessoal.</p>
  </div><div className="vint-toolbar">
   <Link to="/admin" className="vint-back"><ArrowLeft size={16}/> Administração</Link>
   <select aria-label="Intervalo de análise" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={1}>24 horas</option><option value={7}>7 dias</option><option value={30}>30 dias</option></select><select aria-label="Período do acervo histórico" value={historyPeriod} onChange={e=>setHistoryPeriod(e.target.value)}>
    <option value="all">Histórico completo</option><option value="30">Histórico · 30 dias</option><option value="90">Histórico · 90 dias</option><option value="365">Histórico · 1 ano</option>
   </select>
   <button disabled={busy} onClick={refresh} type="button"><RefreshCcw size={16}/>{busy?'Consultando…':'Atualizar'}</button>
  </div></header>
  {error&&<div className="vint-alert" role="alert">{error}</div>}
  <div className="vint-stats">
   <Stat title="Cálculos monitorados" value={route.total} subtitle="Janela selecionada" icon={Route}/>
   <Stat title="Alternativas por cálculo" value={route.avgCandidateCount} subtitle="Média das decisões" icon={Layers3}/>
   <Stat title="Cálculos degradados" value={route.degradedCount} subtitle="Contingências registradas" icon={TriangleAlert}/>
   <Stat title="Falhas de cálculo" value={route.failed} subtitle="Janela selecionada" icon={Activity}/>
  </div>
  <section className="vint-panel vint-archive" aria-label="Base histórica existente">
   <div className="vint-panel-title"><div><small>ACERVO JÁ EXISTENTE</small><h2>Fontes históricas conectadas</h2></div><span className="vint-neutral"><Database size={13}/> V2 · leitura segura</span></div>
   <div className="vint-archive-stats">
    <div><strong>{fmt(snapshot?.historical?.inventory?.existingCollections?.accounts)}</strong><span>Contas</span></div>
    <div><strong>{fmt(snapshot?.historical?.inventory?.existingCollections?.savedRoutes)}</strong><span>Rotas salvas</span></div>
    <div><strong>{fmt(snapshot?.historical?.inventory?.existingCollections?.reports)}</strong><span>Relatos</span></div>
    <div><strong>{fmt(snapshot?.historical?.inventory?.existingCollections?.routines)}</strong><span>Rotinas</span></div>
   </div>
   <p className="vint-foot">Disponível desde {snapshot?.historical?.inventory?.firstKnownRecordDate||'o primeiro registro encontrado'}. O assistente consulta essas coleções agregadas em cada pergunta; não possui acesso ao banco V1 remoto nem a dados pessoais.</p>
  </section>
  <div className="vint-columns"><section className="vint-left">
   <div className="vint-panel"><div className="vint-panel-title"><div><small>OBSERVABILIDADE</small><h2>Atividade do roteador</h2></div><span className="vint-neutral">Dados reais</span></div>
    <Bars daily={route.daily}/><p className="vint-foot">Contagens de cálculo não representam necessariamente viagens concluídas.</p></div>
   <div className="vint-tabs" role="group" aria-label="Dimensão de análise">
    {[['routes','Modos'],['providers','Motores'],['alerts','Relatos'],['outcomes','ETA observado']].map(([key,name])=>
     <button key={key} type="button" className={view===key?'active':''} onClick={()=>setView(key)}>{name}</button>)}
   </div>
   <div className="vint-panel">
    {view==='routes'&&<><h2>Modais monitorados</h2><Rows rows={route.byVehicle}/><h3>Objetivo da rota</h3><Rows rows={route.byMode}/></>}
    {view==='providers'&&<><h2>Motores utilizados</h2><Rows rows={route.byEngine}/></>}
    {view==='alerts'&&<><h2>Ocorrências recebidas</h2><p className="vint-foot">{fmt(snapshot?.incidents?.count)} relatos no intervalo — não necessariamente confirmados.</p><Rows rows={snapshot?.incidents?.categories}/></>}
    {view==='outcomes'&&<><h2>Precisão do ETA observado</h2><p className="vint-foot">Apenas eventos consentidos e com duração prevista e observada.</p>
      <div className="vint-outcomes"><Stat title="Amostras válidas" value={snapshot?.navigation?.pairedEtaReports} subtitle="Relatos voluntários" icon={CheckCircle2}/>
       <Stat title="Erro médio absoluto · min" value={snapshot?.navigation?.meanAbsoluteEtaErrorMinutes} subtitle="Ainda não mede causas por rua" icon={Clock3}/></div></>}
   </div>
   <div className="vint-panel"><div className="vint-panel-title"><div><small>AVALIAÇÃO</small><h2>Sinais para investigar</h2></div></div>
    {findings.length?<div className="vint-findings">{findings.map(x=><article key={x.code}><span>{x.priority}</span><div><strong>{x.code.replaceAll('_',' ')}</strong><p>{x.recommendation}</p><small>{fmt(x.count)} ocorrência(s) ou amostra(s)</small></div></article>)}</div>:<p className="vint-empty">Nenhuma regra de alerta foi acionada.</p>}
    <p className="vint-foot">A ausência de um alerta não demonstra ausência de problemas.</p>
   </div>
  </section>
  <aside className="vint-panel vint-ai">
   <div className="vint-panel-title"><div><small>ANALISTA ADMINISTRATIVO</small><h2><BrainCircuit size={20}/> VAI · Intelligence</h2></div><span className="vint-neutral"><ShieldCheck size={13}/> Leitura</span></div>
   <p>Seu copiloto administrativo. Pergunte sobre rotas, falhas, uso do app e melhorias com dados reais, preservando a privacidade.</p>
   <div className="vint-suggestions">{suggestions.map(x=><button type="button" key={x} onClick={()=>setQuestion(x)}>{x}<ArrowUpRight size={14}/></button>)}</div>
   <div className="vint-mode-row" role="group" aria-label="Escolha o modo de inteligência">
    <button type="button" aria-pressed={mode==='fast'} className={mode==='fast'?'selected':''} onClick={()=>setMode('fast')} disabled={asking}><Clock3 size={15}/> Rápido <small>20B · menos espera</small></button>
    <button type="button" aria-pressed={mode==='deep'} className={mode==='deep'?'selected':''} onClick={()=>setMode('deep')} disabled={asking}><BrainCircuit size={15}/> Profundo <small>120B · com alternativa</small></button>
   </div>
   <form onSubmit={submit}><label htmlFor="vint-prompt">Pergunta para a inteligência</label>
    <textarea id="vint-prompt" value={question} maxLength={1500} rows={3} required minLength={2} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} placeholder="Pergunte sobre o desempenho do VANO, falhas ou próximos passos…"/>
    <div className="vint-chat-controls"><span><Database size={14}/> Todas as fontes agregadas são consultadas automaticamente.</span>
      <button type="button" onClick={()=>setConversation([])} disabled={!conversation.length||asking}>Limpar conversa</button>
    </div>
    <button className="vint-submit" type="submit" disabled={asking||question.trim().length<2}><Send size={16}/>{asking?'Gerando análise…':'Enviar pergunta'} <small>Ctrl+Enter</small></button>
   </form>
   <div className="vint-response vint-chat" aria-live="polite" role="log" aria-label="Conversa com o VAI">
    {conversation.length?conversation.map((turn,index)=><div key={index} className={'vint-chat-turn '+(turn.role==='user'?'vint-chat-user':turn.role==='error'?'vint-chat-error':'vint-chat-ai')}>
      <div className="vint-chat-meta"><strong>{turn.role==='user'?'Você':turn.role==='error'?'Falha de conexão':'VANO Intelligence'}</strong>
       {turn.role==='assistant'&&<span>{turn.model?.split('/').pop()}{turn.latencyMs?' · '+(turn.latencyMs/1000).toFixed(1)+'s':''}{turn.fallbackUsed?' · modo alternativo':''}</span>}
       {turn.role==='assistant'&&<button type="button" aria-label="Copiar resposta" onClick={()=>copyAnswer(turn.content,index)}><Copy size={13}/>{copied===index?'Copiado':'Copiar'}</button>}
       {turn.role==='error'&&<button type="button" onClick={()=>setQuestion(turn.question||'')}><RotateCcw size={13}/> Tentar novamente</button>}
      </div><p>{turn.content}</p></div>):
      <p className="vint-empty">Sua conversa começa aqui. Escolha uma sugestão ou faça uma pergunta para investigar o VANO.</p>}
    {asking&&<p className="vint-chat-loading"><span className="vint-chat-dots"/> Analisando dados e preparando a resposta…</p>}
    <div ref={chatBottom}/>
   </div>
   <p className="vint-foot"><Database size={13}/> {snapshot?.aiConfigured?'Conector NVIDIA detectado no servidor (a disponibilidade do modelo é verificada em cada mensagem).':'A chave administrativa NVIDIA ainda não foi detectada.'} Nenhuma proposta executa alterações automaticamente.</p>
  </aside></div>
 </main>;
}
