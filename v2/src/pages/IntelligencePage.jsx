import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,ArrowLeft,ArrowUpRight,BrainCircuit,CheckCircle2,Clock3,Database,RefreshCcw,Route,ShieldCheck,TriangleAlert,LockKeyhole,Send,Layers3} from 'lucide-react';
import {api,post} from '../lib/api';
import {useVano} from '../context';
import '../intelligence-console.css';

const fmt=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1});
const day=v=>String(v||'').slice(5);
const tools=[
 {key:'route_decisions',name:'Decisões de rota'},
 {key:'route_quality',name:'Qualidade'},
 {key:'incidents',name:'Relatos'},
 {key:'history',name:'Histórico'},
 {key:'infrastructure',name:'Infraestrutura'},
 {key:'navigation',name:'Viagens concluídas'},
 {key:'findings',name:'Diagnósticos'},
];
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
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[asking,setAsking]=useState(false);
 const [selected,setSelected]=useState(tools.map(x=>x.key));
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
  e.preventDefault();
  if(asking||question.trim().length<5)return;
  setAsking(true);setAnswer('');
  try{
   const result=await post('/admin/intelligence/ask',{question:question.trim(),days,tools:selected});
   setAnswer(result.answer||'A resposta não trouxe diagnóstico.');
  }catch(e){setAnswer('A análise não foi concluída: '+(e.message||'serviço indisponível')+'. Os gráficos continuam disponíveis.');}
  finally{setAsking(false);}
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
   <select aria-label="Intervalo de análise" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={1}>24 horas</option><option value={7}>7 dias</option><option value={30}>30 dias</option></select>
   <button disabled={busy} onClick={refresh} type="button"><RefreshCcw size={16}/>{busy?'Consultando…':'Atualizar'}</button>
  </div></header>
  {error&&<div className="vint-alert" role="alert">{error}</div>}
  <div className="vint-stats">
   <Stat title="Cálculos monitorados" value={route.total} subtitle="Janela selecionada" icon={Route}/>
   <Stat title="Alternativas por cálculo" value={route.avgCandidateCount} subtitle="Média das decisões" icon={Layers3}/>
   <Stat title="Cálculos degradados" value={route.degradedCount} subtitle="Contingências registradas" icon={TriangleAlert}/>
   <Stat title="Falhas de cálculo" value={route.failed} subtitle="Janela selecionada" icon={Activity}/>
  </div>
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
   <div className="vint-panel-title"><div><small>ANALISTA ADMINISTRATIVO</small><h2><BrainCircuit size={20}/> VAI · GPT-OSS-120B</h2></div><span className="vint-neutral"><ShieldCheck size={13}/> Leitura</span></div>
   <p>Investigue evidências operacionais sem enviar trajetos, endereços ou dados pessoais para a NVIDIA.</p>
   <div className="vint-suggestions">{suggestions.map(x=><button type="button" key={x} onClick={()=>setQuestion(x)}>{x}<ArrowUpRight size={14}/></button>)}</div>
   <form onSubmit={submit}><label htmlFor="vint-prompt">Pergunta para a inteligência</label>
    <textarea id="vint-prompt" value={question} maxLength={1500} rows={4} required minLength={5} onChange={e=>setQuestion(e.target.value)} placeholder="Analise os dados e me diga como melhorar o roteamento…"/>
    <fieldset><legend>Fontes autorizadas para esta investigação</legend>
     <div className="vint-sources">{tools.map(x=><label key={x.key}><input type="checkbox" checked={selected.includes(x.key)} onChange={e=>setSelected(current=>e.target.checked?[...current,x.key]:current.filter(k=>k!==x.key))}/>{x.name}</label>)}</div>
    </fieldset>
    <button className="vint-submit" type="submit" disabled={asking||question.trim().length<5||selected.length===0}><Send size={16}/>{asking?'Consultando NVIDIA…':'Investigar'}</button>
   </form>
   <div className="vint-response" aria-live="polite" role="status">{asking?'Analisando as métricas disponíveis…':answer||'Escolha uma investigação. A resposta identificará hipóteses, limitações e próximos testes, com base apenas nos dados que o servidor realmente possui.'}</div>
   <p className="vint-foot"><Database size={13}/> {snapshot?.aiConfigured?'Conector NVIDIA configurado.':'A chave administrativa NVIDIA ainda não foi detectada.'} Nenhuma proposta executa alterações automaticamente.</p>
  </aside></div>
 </main>;
}
