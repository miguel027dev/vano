
import React,{useMemo,useState} from 'react';
import {
  Activity,AlertTriangle,BarChart3,CheckCircle2,Clock3,Database,Globe2,
  LockKeyhole,MousePointerClick,RefreshCw,Route,Server,ShieldCheck,Smartphone,Users
} from 'lucide-react';
import SafeRoutingTestPanel from './SafeRoutingTestPanel';
import '../admin-insights.css';

const sections=[
 {id:'overview',label:'Visão geral',help:'Indicadores essenciais',icon:BarChart3},
 {id:'audience',label:'Público e aparelhos',help:'Contas e plataformas',icon:Smartphone},
 {id:'routes',label:'Rotas e trajetos',help:'Histórico e cálculo',icon:Route},
 {id:'events',label:'Interações',help:'Eventos do produto',icon:MousePointerClick},
 {id:'system',label:'Erros e sistema',help:'Saúde operacional',icon:Server},
];
const format=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined?Number(v).toLocaleString('pt-BR'):'—';
const when=x=>{const d=new Date(x||'');return Number.isFinite(+d)?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'};
function Card({label,value,note,icon:Icon}){return <article className="vai-metric">
  <div><span>{label}</span><Icon size={18}/></div><strong>{format(value)}</strong><small>{note}</small>
 </article>}
function Box({title,eyebrow,info,children,className=''}){return <section className={'vai-card '+className}>
 <header><small>{eyebrow}</small><h2>{title}</h2>{info&&<p>{info}</p>}</header><div className="vai-card-body">{children}</div>
 </section>}
function Split({rows,empty='Ainda não há registros neste intervalo.'}){return rows?.length?<div className="vai-stat-rows">
 {rows.map((row,i)=><div className="vai-stat-row" key={i}><span>{row[0]}</span><strong>{row[1]}</strong></div>)}
 </div>:<p className="vai-empty">{empty}</p>}
function EmptyList({children}){return <p className="vai-empty">{children||'Nenhum registro disponível.'}</p>}
export default function AdminInsights({stats,users,offset,busy,filter,setFilter,refresh}){
 const [active,setActive]=useState('overview');
 const matching=useMemo(()=>{
  const q=String(filter||'').trim().toLocaleLowerCase('pt-BR');
  return (users?.items||[]).filter(u=>!q||[u.name,u.email,u.signupMethod].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q)));
 },[filter,users]);
 const routes=stats.recentRoutes||[];
 const ops=stats.operationCounts||[];
 const platforms=stats.platformPageLoads||[];
 const peak=Math.max(1,...(stats.routesByDay||[]).map(x=>x.total||0));
 return <div className="vai-insights">
   <nav className="vai-tabs" aria-label="Seções do administrador">
    {sections.map(s=>{const Icon=s.icon;return <button key={s.id} type="button" className={active===s.id?'active':''}
      aria-current={active===s.id?'page':undefined} onClick={()=>setActive(s.id)}>
      <Icon size={18}/><span><b>{s.label}</b><small>{s.help}</small></span>
    </button>})}
   </nav>
   {active==='overview'&&<>
    <div className="vai-metrics">
     <Card label="Contas cadastradas" value={stats.usersTotal} note="Total de cadastros" icon={Users}/>
     <Card label="Contas ativas · 30d" value={stats.engagement?.activeAccounts30} note="Dias de visita registrados" icon={Activity}/>
     <Card label="Rotas salvas" value={stats.routesTotal} note="Histórico persistido" icon={Route}/>
     <Card label="Chamadas de rota" value={stats.routeRequests} note="Desde o início desta instância" icon={Globe2}/>
    </div>
    <div className="vai-layout">
     <Box title="Atividade de trajetos" eyebrow="ÚLTIMOS SETE DIAS" info="Viagens gravadas no histórico, não cada solicitação de cálculo.">
       {(stats.routesByDay||[]).length?<div className="vai-bars" role="img" aria-label="Gráfico de rotas salvas por dia">
         {(stats.routesByDay||[]).map(r=><div key={r.day} title={r.day+': '+r.total+' rotas'}>
          <b>{format(r.total)}</b><span style={{height:Math.max(3,Math.round((r.total||0)/peak*120))+'px'}}/><small>{r.day.slice(5)}</small>
         </div>)}
        </div>:<EmptyList/>}
     </Box>
     <Box title="Pulso do produto" eyebrow="USO E RETENÇÃO" info="Números reais extraídos dos dados já armazenados.">
       <Split rows={[
        ['Novos usuários · 7 dias',format(stats.signups7d)],
        ['Contas que retornaram · 30 dias',format(stats.engagement?.returningAccounts30)],
        ['Consultas com erro',format(stats.routeErrors)],
        ['Relatos da comunidade',format(stats.reportsTotal)],
       ]}/>
     </Box>
    </div>
   </>}
   {active==='audience'&&<>
    <div className="vai-metrics">
     <Card label="Contas verificadas" value={stats.usersVerified} note="Identidades confirmadas" icon={CheckCircle2}/>
     <Card label="Atividade recente" value={stats.recentlySeenAccounts} note="Último acesso registrado há até 30 min" icon={Activity}/>
     <Card label="Sessões válidas" value={stats.validSessions} note="Não representa pessoas online" icon={LockKeyhole}/>
     <Card label="Novos cadastros · 30d" value={stats.signups30d} note="Pessoas cadastradas, não dispositivos" icon={Users}/>
    </div>
    <div className="vai-layout">
     <Box title="Carregamentos por plataforma" eyebrow="APARELHOS · ESTIMATIVA" info="Total de páginas abertas em cada sistema desde o reinício, sem IP nem rastreamento individual.">
      <Split rows={platforms.map(x=>[x.platform,format(x.count)])} empty="Ainda não há carregamentos de página suficientes para classificar as plataformas."/>
     </Box>
     <Box title="Relacionamento e frequência" eyebrow="ENGAJAMENTO" info="Sessões e contas são medidas diferentes.">
      <Split rows={[
       ['Cadastros via Google',format(stats.signupsGoogle)],
       ['Cadastros via e-mail',format(stats.signupsEmail)],
       ['Contas que retornaram em dias diferentes',format(stats.engagement?.returningAccounts30)],
       ['Acessos médios por conta',format(stats.engagement?.avgVisitsPerTrackedAccount)],
      ]}/>
     </Box>
    </div>
    <Box className="vai-full" title="Contas cadastradas" eyebrow="USUÁRIOS" info="Busca na página atual, histórico de visitas e sequência de acesso.">
      <div className="vai-tools"><label htmlFor="vai-account-search">Buscar conta</label><input id="vai-account-search" type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nome ou e-mail" autoComplete="off"/>
       <span>{format(users?.total)} contas registradas</span></div>
      <div className="vai-table-wrap" tabIndex={0} role="region" aria-label="Contas da plataforma">
       <table><thead><tr><th>Usuário</th><th>Cadastro</th><th>Acessos</th><th>Última visita</th><th>Verificação</th></tr></thead>
       <tbody>{matching.map(u=><tr key={u.id}>
         <td><b>{u.name||'Sem nome'}</b><small>{u.email||'—'}</small></td>
         <td>{u.signupMethod||'Não informado'}</td>
         <td>{format(u.activity?.visits)}<small>{format(u.activity?.uniqueDays)} dias distintos</small></td>
         <td>{when(u.activity?.lastVisitAt)}</td>
         <td>{u.verified?'Verificada':'Pendente'}</td>
       </tr>)}</tbody></table>
      </div>
      {!matching.length&&<EmptyList>Sem contas correspondentes nesta página.</EmptyList>}
      <div className="vai-pagination"><span>Página {Math.floor(offset/20)+1}</span><div>
        <button type="button" disabled={!offset||busy} onClick={()=>refresh(Math.max(0,offset-20))}>Anterior</button>
        <button type="button" disabled={busy||offset+20>=(users?.total||0)} onClick={()=>refresh(offset+20)}>Próxima</button>
      </div></div>
    </Box>
    <div className="vai-explain"><ShieldCheck size={18}/><span>Um IP pode corresponder a vários aparelhos e uma pessoa pode criar várias sessões. Este painel não tenta identificar dispositivos físicos, porque o VANO V2 não mantém essa informação.</span></div>
   </>}
   {active==='routes'&&<>
    <div className="vai-metrics">
     <Card label="Históricos de rota" value={stats.routesTotal} note="Total de viagens salvas" icon={Route}/>
     <Card label="Salvas · 24 horas" value={stats.routes24h} note="Históricos criados no último dia" icon={Clock3}/>
     <Card label="Solicitações à API" value={stats.routeRequests} note="Desde o início desta instância" icon={Activity}/>
     <Card label="Falhas de cálculo" value={stats.routeErrors} note="Desde o início da instância" icon={AlertTriangle}/>
    </div>
    <Box title="Origens e destinos registrados" eyebrow="HISTÓRICO RECENTE" info="A versão V2 salva o destino, mas não guarda a origem no histórico. Nenhuma coordenada adicional é capturada.">
      <div className="vai-table-wrap" role="region" tabIndex={0} aria-label="Histórico de rotas">
       <table><thead><tr><th>Quando</th><th>Origem</th><th>Destino</th><th>Perfil</th><th>Distância</th><th>Previsão</th></tr></thead>
       <tbody>{routes.map((r,i)=><tr key={(r.createdAt||'rota')+'-'+i}>
          <td>{when(r.createdAt)}</td><td>{r.origin||'Não registrada'}</td><td><b>{r.destination||'Não informado'}</b></td>
          <td>{r.routeType||'—'}</td><td>{Number.isFinite(r.distance)?r.distance.toFixed(1)+' km':'—'}</td>
          <td>{Number.isFinite(r.duration)?Math.round(r.duration)+' min':'—'}</td>
       </tr>)}</tbody></table>
      </div>
      {!routes.length&&<EmptyList>Nenhuma rota salva até o momento.</EmptyList>}
    </Box>
    <div className="vai-layout">
     <Box title="Modalidades de rota" eyebrow="PREFERÊNCIAS" info="Proporção observada entre trajetos persistidos.">
       <Split rows={[[ 'Rotas seguras',format(stats.modes?.safe)],['Rotas rápidas',format(stats.modes?.fast)]]}/>
     </Box>
     <Box title="Duração e latência" eyebrow="QUALIDADE" info="Tempo de viagem salvo não é tempo de resposta da API.">
       <Split rows={[
        ['Duração média das viagens (24 h)',stats.avgDuration24h===null?'—':format(stats.avgDuration24h)+' min'],
        ['Latência média de cálculo',stats.avgApiRouteMs===null?'—':format(stats.avgApiRouteMs)+' ms'],
       ]}/>
     </Box>
    </div>
   </>}
   {active==='events'&&<>
    <div className="vai-metrics">
     <Card label="Requisições da API" value={stats.requests} note="Desde o reinício" icon={Activity}/>
     <Card label="Cálculos solicitados" value={stats.routeRequests} note="Inclui solicitações que falharam" icon={Route}/>
     <Card label="Visualizações públicas" value={stats.pageViewsTotal} note="Contador desta instância" icon={Globe2}/>
     <Card label="Relatos no histórico" value={stats.reportsTotal} note="Salvos pelos usuários" icon={AlertTriangle}/>
    </div>
    <div className="vai-layout">
     <Box title="Interações por funcionalidade" eyebrow="EVENTOS AGREGADOS" info="Contagem por tipo de chamada de API, sem coletar um histórico individual.">
      <Split rows={ops.map(x=>[x.label,format(x.count)])} empty="Nenhuma chamada instrumentada foi observada desde o início desta instância."/>
     </Box>
     <Box title="Páginas mais consultadas" eyebrow="VISITAS AGREGADAS" info="Carregamentos de páginas públicos durante a vida desta instância.">
      <Split rows={(stats.popularPages||[]).map(x=>[x.path,format(x.views)])} empty="Nenhuma página pública contabilizada."/>
     </Box>
    </div>
    <div className="vai-explain"><ShieldCheck size={18}/><span>Ainda não existe instrumentação de todos os cliques locais do aplicativo. A central mostra as interações de API disponíveis, sem fabricar números.</span></div>
   </>}
   {active==='system'&&<>
    <div className="vai-metrics">
     <Card label="Tempo ativo · min" value={Math.floor((stats.uptimeSeconds||0)/60)} note="Uptime da instância" icon={Clock3}/>
     <Card label="Requisições de API" value={stats.requests} note="Nesta instância" icon={Activity}/>
     <Card label="Falhas de rota" value={stats.routeErrors} note="Desde o reinício" icon={AlertTriangle}/>
     <Card label="Tempo médio · rota" value={stats.avgApiRouteMs} note="Milissegundos" icon={Clock3}/>
    </div>
    <div className="vai-layout">
     <Box title="Serviços e dependências" eyebrow="INFRAESTRUTURA" info="Indicadores de configuração — não substituem teste real de conectividade.">
      <Split rows={Object.entries(stats.integrations||{}).map(([name,ok])=>[{
        google:'Google OAuth',mapbox:'Mapbox',v1Router:'Motor V1',email:'E-mail',persistentDb:'Banco persistente'
      }[name]||name,ok?'Configurado':'Não configurado'])}/>
      <p className="vai-muted">{stats.storage||'Armazenamento não informado'}</p>
     </Box>
     <Box title="Diagnóstico operacional" eyebrow="SERVIDOR" info="Falhas de outros endpoints e erros de interface exigem logs operacionais.">
      <Split rows={[
       ['Requisições desde o reinício',format(stats.requests)],
       ['Falhas de cálculo de rota',format(stats.routeErrors)],
       ['Uptime do servidor',format(Math.floor((stats.uptimeSeconds||0)/60))+' minutos'],
       ['Latência média de rota',stats.avgApiRouteMs===null?'—':format(stats.avgApiRouteMs)+' ms'],
      ]}/>
     </Box>
    </div>
    <section className="vai-safe-test"><SafeRoutingTestPanel/></section>
   </>}
  </div>;
}
