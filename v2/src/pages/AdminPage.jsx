import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {
 Activity,AlertTriangle,ArrowLeft,ArrowUpRight,CalendarDays,CheckCircle2,
 ChevronLeft,ChevronRight,Clock3,Database,Globe2,LockKeyhole,Mail,
 RefreshCcw,Route,Search,ShieldCheck,Users,UserRoundCheck,X
} from 'lucide-react';
import {api} from '../lib/api';
import {useVano} from '../context';
import '../admin-console.css';
import SafeRoutingTestPanel from '../components/SafeRoutingTestPanel';
import AdminInsights from '../components/AdminInsights';

const num=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('pt-BR'):'—';
const shortDate=value=>{
 if(!value)return '—';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toLocaleDateString('pt-BR'):'—';
};
function GoogleMark(){
 return <svg className="v44-google-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
  <path fill="#4285F4" d="M21.35 12.22c0-.7-.06-1.37-.18-2.02H12v3.83h5.24a4.47 4.47 0 0 1-1.94 2.93v2.44h3.14c1.84-1.7 2.91-4.2 2.91-7.18z"/>
  <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.35l-3.14-2.44c-.87.58-1.99.93-3.29.93-2.54 0-4.69-1.72-5.46-4.04H3.3v2.49A9.75 9.75 0 0 0 12 21.75z"/>
  <path fill="#FBBC05" d="M6.54 13.85a5.85 5.85 0 0 1 0-3.7V7.66H3.3a9.75 9.75 0 0 0 0 8.68l3.24-2.49z"/>
  <path fill="#EA4335" d="M12 6.1c1.43 0 2.71.49 3.72 1.47l2.79-2.79A9.33 9.33 0 0 0 12 2.25 9.75 9.75 0 0 0 3.3 7.66l3.24 2.49C7.31 7.82 9.46 6.1 12 6.1z"/>
 </svg>;
}
function SignupSource({method}){
 const value=String(method||'');
 const google=value.startsWith('Google'),email=value.startsWith('E-mail');
 return <span className={`v44-signup-source ${google?'is-google':email?'is-email':'is-unknown'}`}
  title={value||'Origem não registrada'}>
  <span className="v44-signup-icon" aria-hidden="true">{google?<GoogleMark/>:email?<Mail size={17} strokeWidth={1.9}/>:<Clock3 size={16}/>}</span>
  <span>{google?'Google':email?'E-mail':'Não registrada'}</span>
 </span>;
}
function Stat({label,value,icon:Icon,foot}){
 return <div className="v3-kpi"><div className="v3-kpi-head"><span>{label}</span><span className="v44-kpi-icon"><Icon size={18} strokeWidth={1.9}/></span></div>
  <strong>{num(value)}</strong>{foot&&<small>{foot}</small>}</div>;
}
function SourceBreakdown({stats}){
 const google=Number(stats.signupsGoogle)||0,email=Number(stats.signupsEmail)||0,
  unknown=Math.max(0,(Number(stats.usersTotal)||0)-google-email),total=google+email+unknown;
 return <section className="v3-admin-panel v44-source-panel" aria-label="Origem dos cadastros">
  <div className="v3-admin-panel-head"><div><h2><Users size={19}/> Como as pessoas entram</h2><small>Origem registrada na criação da conta</small></div></div>
  <div className="v44-source-track" role="img" aria-label={`${google} pelo Google, ${email} por e-mail, ${unknown} sem origem identificada`}>
   {total>0&&<><span className="v44-source-google" style={{width:`${google/total*100}%`}}/><span className="v44-source-email" style={{width:`${email/total*100}%`}}/><span className="v44-source-unknown" style={{width:`${unknown/total*100}%`}}/></>}
  </div>
  <div className="v44-source-list">
   <p><SignupSource method="Google"/><strong>{num(google)}</strong></p>
   <p><SignupSource method="E-mail e senha"/><strong>{num(email)}</strong></p>
   {unknown>0&&<p><SignupSource method="Não registrado"/><strong>{num(unknown)}</strong></p>}
  </div>
  <small className="v44-panel-note">Contas antigas podem não ter a origem original registrada. Vincular o Google depois não altera o método de cadastro.</small>
 </section>;
}
export default function AdminPage(){
 const {user,loading}=useVano();
 const [showLegacy,setShowLegacy]=useState(false);
 const [stats,setStats]=useState(null),[users,setUsers]=useState(null),[failure,setFailure]=useState(''),
  [busy,setBusy]=useState(false),[offset,setOffset]=useState(0),[filter,setFilter]=useState('');
 async function refresh(page=offset){
  if(!user?.isAdmin)return;
  setBusy(true);setFailure('');
  try{
   const [overview,members]=await Promise.all([api('/admin'),api(`/admin/users?offset=${page}&limit=20`)]);
   setStats(overview);setUsers(members);setOffset(page);
  }catch(error){setFailure(error.message);setStats(null);setUsers(null);}
  finally{setBusy(false);}
 }
 useEffect(()=>{if(user?.isAdmin)refresh(0);else{setStats(null);setUsers(null);}},[user?.isAdmin]);
 const integration=stats?.integrations||{};
 const visibleUsers=useMemo(()=>{
  const q=filter.trim().toLocaleLowerCase('pt-BR');
  return (users?.items||[]).filter(member=>!q||[member.name,member.email,member.signupMethod]
   .some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q)));
 },[users,filter]);
 if(loading)return <main className="v3-admin"><div className="v44-admin-loading" role="status">Abrindo console VANO…</div></main>;
 if(!user?.isAdmin)return <main className="v3-admin"><div className="v3-admin-restricted">
  <LockKeyhole size={36}/><span>ÁREA RESTRITA</span><h1>Console VANO</h1>
  <p>Área exclusiva de administradores autorizados e verificados.</p>
  <Link to={user?'/perfil':'/entrar'}>{user?'Voltar ao perfil':'Entrar com minha conta'} <ArrowUpRight size={17}/></Link>
 </div></main>;
 return <main className="v3-admin" id="conteudo"><div className="v3-admin-inner">
  <header className="v3-admin-heading">
   <div><span className="v3-admin-overline"><ShieldCheck size={16}/> ADMINISTRAÇÃO · VANO MAPS</span>
    <h1>Painel de controle<span className="v44-head-dot">.</span></h1>
    <p>Contas, operação e atividade da plataforma — dados essenciais, sem localização individual.</p></div>
   <div className="v44-admin-header-actions"><Link to="/v2" className="v44-admin-back"><Route size={17}/> Entrar no mapa de administrador</Link><Link to="/perfil" className="v44-admin-back"><ArrowLeft size={17}/> Perfil</Link>
    <button onClick={()=>refresh(0)} type="button" disabled={busy}><RefreshCcw size={17} className={busy?'v44-refreshing':''}/>{busy?'Atualizando…':'Atualizar'}</button></div>
  </header>
  {failure&&<p className="v3-admin-error" role="alert">Não foi possível carregar o console: {failure}</p>}
  <SafeRoutingTestPanel/>
  {!stats&&!failure&&<div className="v44-admin-loading" role="status">Consultando os indicadores…</div>}
  {stats&&<>
   <AdminInsights stats={stats} users={users} offset={offset} busy={busy} filter={filter} setFilter={setFilter} refresh={refresh}/>
   <div className="v90-classic-toggle"><button type="button" onClick={()=>setShowLegacy(v=>!v)} aria-expanded={showLegacy}>{showLegacy?'Ocultar console anterior':'Abrir console clássico'}</button><span>O painel anterior continua disponível para diagnóstico e rollback visual.</span></div>
   {showLegacy&&<>
   <section className="v3-kpi-grid" aria-label="Indicadores gerais">
    <Stat label="Contas criadas" value={stats.usersTotal} icon={Users} foot={`${num(stats.signups7d)} nos últimos 7 dias`}/>
    <Stat label="Pessoas que voltaram (30d)" value={stats.engagement?.returningAccounts30} icon={RefreshCcw} foot="Dois ou mais dias diferentes"/>
    <Stat label="Taxa de retorno (30d)" value={stats.engagement?.returnRate30} icon={Activity} foot="Percentual entre contas ativas; valor em %"/>
    <Stat label="Acessos médios por conta" value={stats.engagement?.avgVisitsPerTrackedAccount} icon={CalendarDays} foot="Apenas contas acompanhadas"/>
    <Stat label="Contas ativas (30d)" value={stats.engagement?.activeAccounts30} icon={UserRoundCheck} foot="Pelo menos um dia registrado"/>
    <Stat label="Novos cadastros (30 dias)" value={stats.signups30d} icon={CalendarDays} foot="Contas novas, não instalações"/>
    <Stat label="Contas verificadas" value={stats.usersVerified} icon={UserRoundCheck} foot={stats.verificationRate===null?'Sem cadastros':`${stats.verificationRate}% do total`}/>
    <Stat label="Rotas registradas" value={stats.routesTotal} icon={Route} foot={`${num(stats.routes7d)} nos últimos 7 dias`}/>
    <Stat label="Ocorrências" value={stats.reportsTotal} icon={AlertTriangle} foot={`${num(stats.reports24h)} nas últimas 24 h`}/>
    <Stat label="Visualizações públicas" value={stats.pageViewsTotal} icon={Globe2} foot="Nesta instância"/>
    <Stat label="Consultas de rota" value={stats.routeRequests} icon={Activity} foot={`${num(stats.routeErrors)} erros registrados`}/>
    <Stat label="Latência média das rotas" value={stats.avgApiRouteMs} icon={Clock3} foot="Milissegundos · nesta instância"/>
   </section>
   <section className="v55-engagement-panel" aria-label="Retenção e frequência de uso">
     <div className="v55-engagement-head"><div><span className="v55-mini-label">ENGAJAMENTO · ÚLTIMOS 30 DIAS</span><h2>Quem está voltando ao VANO</h2><p>Contas autenticadas, sem rastrear localização, aparelho ou histórico de navegação.</p></div><div className="v55-engagement-orb" aria-hidden="true"><Activity size={29}/></div></div>
     <div className="v55-engagement-grid">
      <div><small>Taxa de retorno</small><strong>{stats.engagement?.returnRate30===null?'—':num(stats.engagement?.returnRate30)+'%'}</strong><div className="v55-progress" role="meter" aria-label="Porcentagem de contas que retornaram" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.engagement?.returnRate30??0}><span style={{width:(stats.engagement?.returnRate30??0)+'%'}}/></div></div>
      <div><small>Voltaram em dias diferentes</small><strong>{num(stats.engagement?.returningAccounts30)}</strong><em>de {num(stats.engagement?.activeAccounts30)} contas ativas</em></div>
      <div><small>Acessos repetidos</small><strong>{num(stats.engagement?.repeatVisitAccounts)}</strong><em>{stats.engagement?.repeatVisitRate===null?'—':num(stats.engagement?.repeatVisitRate)+'%'} das contas acompanhadas</em></div>
     </div>
     <p className="v55-engagement-foot">{stats.engagement?.definition||'Indicadores disponíveis após o primeiro acesso acompanhado.'}</p>
    </section>
   <div className="v3-admin-panels">
    <SourceBreakdown stats={stats}/>
    <section className="v3-admin-panel"><div className="v3-admin-panel-head"><div><h2><Activity size={19}/> Operação</h2><small>Leituras da instância atual</small></div></div>
     <div className="v3-admin-ops">
      <p><span>Tempo ativo do servidor</span><strong>{num(Math.floor(stats.uptimeSeconds/60))} min</strong></p>
      <p><span>Rotas nas últimas 24 horas</span><strong>{num(stats.routes24h)}</strong></p>
      <p><span>Duração média das rotas (24 h)</span><strong>{stats.avgDuration24h===null?'—':`${num(stats.avgDuration24h)} min`}</strong></p>
      <p><span>Rotas seguras / rápidas</span><strong>{num(stats.modes?.safe)} / {num(stats.modes?.fast)}</strong></p>
      <p><span>Ocorrências aguardando verificação</span><strong>{num(stats.reportsUnverified)}</strong></p>
      <p><span>Favoritos / rotinas</span><strong>{num(stats.favoritesTotal)} / {num(stats.routinesTotal)}</strong></p>
     </div><small className="v44-panel-note">Contadores de requisições podem reiniciar com o servidor. Nenhum desses números representa usuários online.</small>
    </section>
   </div>
   <div className="v3-admin-panels v44-secondary-panels">
    <section className="v3-admin-panel"><div className="v3-admin-panel-head"><div><h2><Database size={19}/> Infraestrutura</h2><small>Configuração disponível, não teste de conectividade</small></div></div>
     <div className="v3-admin-integrations">{[
      ['Mapbox',integration.mapbox],['Motor de rotas V1',integration.v1Router],
      ['Google OAuth',integration.google],['E-mail de recuperação',integration.email],
      ['Banco persistente',integration.persistentDb]
     ].map(([name,ok])=><div key={name}><span className={ok?'v3-state-on':'v3-state-off'}/><strong>{name}</strong><em>{ok?'Configurado':'Pendente'}</em></div>)}</div>
     <p className="v3-admin-hint"><Database size={17}/>{stats.storage}</p>
    </section>
    <section className="v3-admin-panel"><div className="v3-admin-panel-head"><div><h2><Globe2 size={19}/> Páginas consultadas</h2><small>Visualizações agregadas · sem IP ou GPS</small></div></div>
     {stats.popularPages?.length?<div className="v3-admin-ops v44-pages-list">{stats.popularPages.map(page=><p key={page.path}><span title={page.path}>{page.path}</span><strong>{num(page.views)}</strong></p>)}</div>
     :<p className="v3-admin-empty">Ainda não há visualizações registradas nesta instância.</p>}
    </section>
   </div>
   <section className="v3-admin-panel v3-admin-users" aria-label="Contas cadastradas">
    <div className="v3-admin-panel-head v44-users-head">
     <div><h2><Users size={19}/> Contas cadastradas</h2><small>{num(users?.total)} contas · acesso = entrada separada por 30 minutos · contagem iniciada nesta atualização</small></div>
     <label className="v44-users-search"><Search size={17}/><input type="search" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Buscar nesta página" aria-label="Buscar nas contas desta página"/>{filter&&<button type="button" onClick={()=>setFilter('')} title="Limpar busca" aria-label="Limpar busca"><X size={16}/></button>}</label>
    </div>
    <div className="v3-users-table-wrap" role="region" aria-label="Tabela de contas" tabIndex={0}>
     <table className="v3-users-table"><thead><tr><th>Conta</th><th>E-mail</th><th>Cadastro</th><th>Acessos</th><th>Sequência atual</th><th>Último acesso</th><th>Situação</th><th>Data</th></tr></thead>
      <tbody>{visibleUsers.map(member=><tr key={member.id}>
       <td><div className="v44-member"><span className="v44-member-avatar" aria-hidden="true">{String(member.name||member.email||'?').trim().slice(0,1).toUpperCase()}</span><strong>{member.name||'Sem nome'}</strong></div></td>
       <td><span className="v44-member-email" title={member.email||''}>{member.email||'—'}</span></td>
       <td><SignupSource method={member.signupMethod}/></td>
       <td><span className="v55-account-counter">{num(member.activity?.visits)}</span><small className="v55-table-sub">{num(member.activity?.uniqueDays)} dia(s)</small></td>
       <td><span className="v55-streak">↗ {num(member.activity?.currentStreak)} dias</span><small className="v55-table-sub">Recorde {num(member.activity?.longestStreak)}</small></td>
       <td><time dateTime={member.activity?.lastVisitAt||undefined}>{shortDate(member.activity?.lastVisitAt)}</time></td>
       <td><span className={`v44-verification ${member.verified?'is-verified':'is-pending'}`}>{member.verified?<CheckCircle2 size={15}/>:<Clock3 size={15}/>} {member.verified?'Verificada':'Pendente'}</span></td>
       <td><time dateTime={member.createdAt||undefined}>{shortDate(member.createdAt)}</time></td>
      </tr>)}</tbody></table>
    </div>
    {!visibleUsers.length&&<p className="v3-admin-empty">{filter?'Nenhuma conta corresponde à busca nesta página.':'Nenhum usuário registrado nesta instância.'}</p>}
    <div className="v3-admin-pagination"><span>{num(users?.total)} contas · página {Math.floor(offset/20)+1} · {visibleUsers.length} exibidas</span>
     <div><button type="button" disabled={!offset||busy} onClick={()=>refresh(Math.max(0,offset-20))}><ChevronLeft size={16}/> Anterior</button>
      <button type="button" disabled={busy||offset+20>=(users?.total||0)} onClick={()=>refresh(offset+20)}>Próxima <ChevronRight size={16}/></button></div>
    </div>
   </section>
  </>}
  </>}
 </div></main>;
}
