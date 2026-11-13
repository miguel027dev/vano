import React,{useEffect,useMemo,useState} from 'react';
import {Activity,ArrowLeft,ArrowRight,CalendarDays,Clock3,Download,Ellipsis,RefreshCcw,Route,Search,Users,X} from 'lucide-react';
import {api} from '../lib/api';
import '../admin-retention.css';

const fmt=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:1}):'—';
const date=d=>{if(!d)return 'Não medido';const time=new Date(d);return Number.isNaN(time.getTime())?'Não medido':time.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});};
const pct=c=>c?.rate===null||c?.rate===undefined?'—':fmt(c.rate)+'%';
function Metric({icon:Icon,title,value,note}){return <article className="ret-metric"><div className="ret-metric-head"><span>{title}</span><Icon size={19} aria-hidden="true"/></div><strong>{value}</strong><small>{note}</small></article>}
function RetentionTrend({daily=[]}){
 const [series,setSeries]=useState('activeAccounts');
 const options=[['activeAccounts','Contas ativas'],['firstOpens','Primeiras aberturas'],['routeStarts','Rotas iniciadas']];
 const max=Math.max(1,...daily.map(d=>Number(d[series])||0));
 const points=daily.map((d,i)=>[22+i*(Math.max(0,700-44)/Math.max(1,daily.length-1)),194-168*(Number(d[series])||0)/max]);
 const path=points.map((p,i)=>(i?'L':'M')+p.map(n=>n.toFixed(1)).join(',')).join(' ');
 return <section className="ret-panel" aria-label="Evolução diária de retenção">
  <div className="ret-panel-head"><div><h3>Atividade ao longo do tempo</h3><p>Eventos reais medidos desde a ativação do módulo.</p></div><div className="ret-series" role="group" aria-label="Tipo de gráfico">
   {options.map(([key,title])=><button type="button" key={key} className={series===key?'selected':''} aria-pressed={series===key} onClick={()=>setSeries(key)}>{title}</button>)}
  </div></div>
  {daily.length?<><div className="ret-graph"><svg viewBox="0 0 700 224" role="img" aria-label={options.find(x=>x[0]===series)?.[1]+': série dos últimos '+daily.length+' dias. Maior valor '+max}>
   {[26,68,110,152,194].map(y=><line key={y} x1="22" x2="678" y1={y} y2={y} stroke="currentColor" strokeOpacity=".11" strokeDasharray="4 5"/>)}
   <path d={path} fill="none" stroke="#F28C28" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"/>
   {points.map((p,i)=><circle key={daily[i].day} cx={p[0]} cy={p[1]} r="3.2" fill="#F28C28"><title>{daily[i].day}: {daily[i][series]}</title></circle>)}
  </svg></div><div className="ret-axis"><span>{daily[0]?.day}</span><span>{daily[daily.length-1]?.day}</span></div></>
  :<p className="ret-empty">Ainda não há dados medidos neste período.</p>}
 </section>;
}
function Cohorts({cohorts={}}){return <section className="ret-panel">
 <div className="ret-panel-head"><div><h3>Retenção por coorte</h3><p>Volta exatamente no dia D1, D7 ou D30 após a primeira abertura medida.</p></div></div>
 <div className="ret-cohorts">{[1,7,30].map(n=>{const c=cohorts['d'+n];return <div className="ret-cohort" key={n}>
   <div><strong>D{n}</strong><span>{pct(c)}</span></div><div className="ret-bar"><span style={{width:Math.min(100,Math.max(0,c?.rate||0))+'%'}}/></div>
   <small>{fmt(c?.returning)} de {fmt(c?.eligible)} contas elegíveis</small>
  </div>})}</div>
 </section>}
function UserDetails({id,onClose}){
 const [record,setRecord]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setRecord(null);setError('');api('/admin/retention/users/'+encodeURIComponent(id)).then(r=>{if(alive)setRecord(r.user)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false};},[id]);
 useEffect(()=>{const press=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',press);return()=>window.removeEventListener('keydown',press)},[onClose]);
 return <div className="ret-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <aside className="ret-drawer" role="dialog" aria-modal="true" aria-labelledby="ret-user-title">
   <header><div><span className="ret-eyebrow">JORNADA INDIVIDUAL</span><h2 id="ret-user-title">{record?.name||'Perfil do usuário'}</h2><p>{record?.email||'Carregando os dados…'}</p></div><button type="button" aria-label="Fechar ficha" onClick={onClose}><X size={20}/></button></header>
   {error&&<p role="alert" className="ret-error">{error}</p>}
   {record&&<><div className="ret-profile-grid">
    <div><small>Primeira abertura medida</small><strong>{date(record.firstOpenAt)}</strong></div>
    <div><small>Primeira rota</small><strong>{date(record.firstRouteAt)}</strong></div>
    <div><small>Rotas iniciadas</small><strong>{fmt(record.routeStarts)}</strong></div>
    <div><small>Rotas concluídas</small><strong>Não medido</strong></div>
    <div><small>Tempo ativo medido</small><strong>{record.activeMinutes===null?'—':fmt(record.activeMinutes)+' min'}</strong></div>
    <div><small>Média por sessão</small><strong>{record.avgSessionMinutes===null?'—':fmt(record.avgSessionMinutes)+' min'}</strong></div>
    <div><small>Sessões medidas</small><strong>{fmt(record.sessionCount)}</strong></div>
    <div><small>Dias com atividade</small><strong>{fmt(record.activeDays)}</strong></div>
   </div><h3>Rotas iniciadas recentemente</h3>
    {record.recentRoutes?.length?<ol className="ret-timeline">{record.recentRoutes.map((r,i)=><li key={i}><strong>{date(r.createdAt)}</strong><span>{r.mode==='fast'?'Rápida':r.mode==='safe'?'Segura':r.mode||'Rota'} · {r.distanceKm===null?'Distância indisponível':fmt(r.distanceKm)+' km'} · ETA previsto {r.etaMinutes===null?'—':fmt(r.etaMinutes)+' min'}</span></li>)}</ol>
    :<p className="ret-empty">Nenhuma rota salva para esta conta.</p>}
    <p className="ret-disclaimer">Somente dados da conta, sem origem, destino, histórico de localização ou identificador de aparelho. Datas anteriores à instrumentação podem estar indisponíveis.</p>
   </>}
  </aside>
 </div>;
}
export default function AdminRetention(){
 const [days,setDays]=useState(30),[data,setData]=useState(null),[list,setList]=useState({items:[],total:0});
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[selected,setSelected]=useState(null);
 const [menu,setMenu]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{const handle=setTimeout(()=>{setOffset(0);setQuery(search.trim())},300);return()=>clearTimeout(handle)},[search]);
 useEffect(()=>{let alive=true;setPending(true);setError('');
  Promise.all([api('/admin/retention?days='+days),api('/admin/retention/users?offset='+offset+'&limit=20&search='+encodeURIComponent(query))])
   .then(([overview,users])=>{if(alive){setData(overview);setList(users);}}).catch(e=>{if(alive)setError(e.message)})
   .finally(()=>{if(alive)setPending(false)});return()=>{alive=false};
 },[days,offset,query,reload]);
 const heading=useMemo(()=>data?.retention||{},[data]);
 return <section className="ret-root" aria-label="Retenção e jornada dos usuários">
  <header className="ret-top"><div><span className="ret-eyebrow">VANO CONTROL · ANALYTICS</span><h2>Retenção e jornada</h2><p>Primeira abertura, sessões observadas, atividade recorrente e rotas salvas por conta.</p></div>
  <div className="ret-controls"><label htmlFor="ret-period">Período</label><select id="ret-period" value={days} onChange={e=>setDays(Number(e.target.value))}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select>
   <button type="button" disabled={pending} onClick={()=>setReload(v=>v+1)}><RefreshCcw size={16}/> Atualizar</button></div></header>
  {error&&<p className="ret-error" role="alert">{error}</p>}
  <div className="ret-metrics">
   <Metric title="Contas cadastradas" icon={Users} value={fmt(data?.accountsTotal)} note="Não equivale a downloads"/>
   <Metric title="Contas ativas · 30d" icon={Activity} value={fmt(data?.active30d)} note="Autenticadas e com atividade medida"/>
   <Metric title="Retenção D1" icon={CalendarDays} value={pct(heading.d1)} note={fmt(heading.d1?.eligible)+' contas elegíveis'}/>
   <Metric title="Retenção D7" icon={Route} value={pct(heading.d7)} note={fmt(heading.d7?.eligible)+' contas elegíveis'}/>
   <Metric title="Retenção D30" icon={CalendarDays} value={pct(heading.d30)} note={fmt(heading.d30?.eligible)+' contas elegíveis'}/>
   <Metric title="Permanência por sessão" icon={Clock3} value={data?.avgSessionMinutes===null||!data? '—':fmt(data.avgSessionMinutes)+' min'} note="Tempo observado em primeiro plano"/>
  </div>
  <div className="ret-charts"><RetentionTrend daily={data?.daily||[]}/><Cohorts cohorts={heading}/></div>
  <div className="ret-panel ret-users">
   <header className="ret-panel-head"><div><h3>Jornada por usuário</h3><p>{fmt(list.total)} contas encontradas · 20 por página</p></div>
    <label className="ret-search"><Search size={17}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Buscar usuários por nome ou e-mail" placeholder="Buscar nome ou e-mail…"/></label>
   </header>
   <div className="ret-table-scroll"><table><thead><tr><th>Usuário</th><th>Primeira abertura</th><th>Primeira rota</th><th>Rotas iniciadas</th><th>Tempo médio ativo</th><th>Última atividade</th><th>Ações</th></tr></thead>
    <tbody>{list.items.map(u=><tr key={u.id}><td><strong>{u.name||'Sem nome'}</strong><small>{u.email}</small></td><td>{date(u.firstOpenAt)}</td><td>{date(u.firstRouteAt)}</td><td>{fmt(u.routeStarts)}</td><td>{u.avgSessionMinutes===null?'—':fmt(u.avgSessionMinutes)+' min'}</td><td>{date(u.lastActivityAt)}</td><td>
     <div className="ret-menu-wrap"><button type="button" aria-label={'Ações do usuário '+(u.name||'sem nome')} aria-haspopup="menu" aria-expanded={menu===u.id} onClick={()=>setMenu(old=>old===u.id?null:u.id)}><Ellipsis size={20}/></button>
     {menu===u.id&&<div className="ret-menu" role="menu"><button type="button" role="menuitem" onClick={()=>{setSelected(u.id);setMenu(null)}}>Ver jornada completa <ArrowRight size={16}/></button></div>}</div>
    </td></tr>)}</tbody></table></div>
   {!pending&&!list.items.length&&<p className="ret-empty">Nenhuma conta encontrada.</p>}
   <footer className="ret-pager"><span>Exibindo {list.items.length?offset+1:0}–{Math.min(list.total,offset+list.items.length)} de {fmt(list.total)}</span><div>
    <button type="button" disabled={pending||offset<=0} onClick={()=>setOffset(v=>Math.max(0,v-20))}><ArrowLeft size={15}/> Anterior</button>
    <button type="button" disabled={pending||offset+20>=list.total} onClick={()=>setOffset(v=>v+20)}>Próxima <ArrowRight size={15}/></button>
   </div></footer>
  </div>
  <div className="ret-footnote"><Download size={17}/><span>Instalações reais exigem integração oficial com o Google Play Console. A coleta de atividade começa após a publicação e não reconstrói aberturas anteriores. Dados ausentes aparecem como “Não medido”, nunca como zero inventado.</span></div>
  {selected&&<UserDetails id={selected} onClose={()=>setSelected(null)}/>}
 </section>;
}
