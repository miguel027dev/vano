import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,ArrowUpRight,BookOpen,CalendarClock,CheckCircle2,ChevronLeft,ChevronRight,Clock3,Download,ExternalLink,FileJson,MapPin,Route,ShieldCheck,SlidersHorizontal,TrendingUp} from 'lucide-react';
import '../benchmark-results.css';

const categories=[['','Todas as categorias'],['centro','Centro e áreas densas'],['residencial','Bairros residenciais'],['avenidas','Grandes avenidas'],['travessias','Pontes e túneis'],['congestionamento','Trânsito intenso']];
const sources=[['vano_fastest','Rota padrão do VANO'],['google_maps','Google Maps (verificado)'],['all','Todas as fontes']];
const periods=[['7d','Últimos 7 dias'],['30d','Últimos 30 dias'],['all','Todo o histórico']];
const isNum=n=>typeof n==='number'&&Number.isFinite(n);
const fmt=(n,d=1)=>isNum(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const date=t=>{if(!t)return 'Não informado';const v=new Date(t);return Number.isNaN(v.getTime())?'Não informado':v.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'})+' (São Paulo)'};
const categoryLabel=k=>categories.find(c=>c[0]===k)?.[1]||k;
const sourceLabel=k=>sources.find(s=>s[0]===k)?.[1]||'Referência';
const Metric=({icon:Icon,label,value,helper})=><div className="pbr-metric"><span className="pbr-metric-icon"><Icon size={19}/></span><span className="pbr-metric-label">{label}</span><strong>{value}</strong><small>{helper}</small></div>;
const Delta=({value,unit=''})=>!isNum(value)?<span className="pbr-dim">—</span>:<strong className={value>0?'pbr-positive':value<0?'pbr-negative':'pbr-neutral'}>{value>0?'+':''}{fmt(value,1)}{unit}</strong>;

export default function BenchmarkResultsPage(){
 const [filters,setFilters]=useState({category:'',source:'vano_fastest',period:'30d',page:1});
 const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
   const controller=new AbortController();
   setLoading(true);setError('');
   const params=new URLSearchParams({source:filters.source,period:filters.period,page:String(filters.page)});
   if(filters.category)params.set('category',filters.category);
   fetch('/api/benchmark/v1/results?'+params,{signal:controller.signal,headers:{Accept:'application/json'}})
    .then(async r=>{if(!r.ok)throw Error('O servidor não retornou os dados do benchmark.');return r.json()})
    .then(data=>{setReport(data);setLoading(false)})
    .catch(e=>{if(e.name!=='AbortError'){setError(e.message||'Erro ao carregar');setLoading(false)}});
   return()=>controller.abort();
 },[filters]);
 useEffect(()=>{document.title='Resultados de benchmark | VANO Maps';},[]);
 const change=(name,value)=>setFilters(x=>({...x,[name]:value,page:1}));
 const params=new URLSearchParams({source:filters.source,period:filters.period,page:String(filters.page)});if(filters.category)params.set('category',filters.category);
 const jsonUrl='/api/benchmark/v1/results?'+params.toString();
 return <main className="pbr-page" id="conteudo">
   <div className="pbr-container">
     <header className="pbr-nav"><Link to="/mapa" className="pbr-brand"><span className="pbr-brand-symbol">↗</span><span>VANO<span className="pbr-brand-muted">MAPS</span></span></Link><div className="pbr-nav-actions"><Link to="/benchmark-de-rotas">Laboratório de testes <ArrowUpRight size={15}/></Link><Link to="/mapa" className="pbr-nav-map"><ArrowLeft size={15}/> Voltar ao mapa</Link></div></header>
     <nav className="pbr-crumb" aria-label="Você está aqui"><Link to="/mapa">Início</Link><span>/</span><Link to="/benchmark-de-rotas">Benchmark</Link><span>/</span><span aria-current="page">Resultados públicos</span></nav>
     <section className="pbr-hero"><div className="pbr-eyebrow"><span className="pbr-pulse"/> VANO PERFORMANCE LAB / TRANSPARÊNCIA</div><h1>Uma rota melhor precisa de <em>dados.</em><br/> Não de promessas.</h1><p>Compare a rota padrão de referência com a alternativa selecionada pelo VANO. Veja distância, tempo estimado, metodologia e a origem de cada medição. Nenhum resultado é fabricado.</p><div className="pbr-hero-actions"><a className="pbr-primary" href="#historico">Explorar resultados <ArrowUpRight size={18}/></a><Link className="pbr-secondary" to="/benchmark-de-rotas">Executar um teste <Route size={18}/></Link></div></section>
     <section className="pbr-section-heading" aria-label="Resumo de resultados"><div><div className="pbr-overline">VISÃO GERAL</div><h2>O desempenho, em números.</h2></div><a href={jsonUrl} className="pbr-json"><FileJson size={17}/> Dados em JSON <ExternalLink size={13}/></a></section>
     <section className="pbr-stats" aria-busy={loading}>
       <Metric icon={Route} label="TESTES PUBLICADOS" value={loading?'…':report?.total??'—'} helper="Apenas medições validadas"/>
       <Metric icon={Clock3} label="DIFERENÇA MÉDIA DE ETA" value={fmt(report?.statistics?.meanEtaDifferenceMin)+' min'} helper="Referência − VANO; positivo favorece VANO"/>
       <Metric icon={TrendingUp} label="DIFERENÇA MEDIANA DE ETA" value={fmt(report?.statistics?.medianEtaDifferenceMin)+' min'} helper="Mais robusta a valores extremos"/>
       <Metric icon={CalendarClock} label="LATÊNCIA P95" value={fmt(report?.statistics?.p95LatencyMs,0)+' ms'} helper="Somente medições disponíveis"/>
     </section>
     <section className="pbr-maincard" id="historico">
       <div className="pbr-card-heading"><div><div className="pbr-overline">HISTÓRICO PÚBLICO</div><h2>Comparações de rota</h2><p>Cada linha representa um teste publicado e identificado por fonte, período e veículo.</p></div><span className="pbr-status"><CheckCircle2 size={14}/> Dados auditáveis</span></div>
       <div className="pbr-filters"><label>Categoria<select aria-label="Filtrar categoria" value={filters.category} onChange={e=>change('category',e.target.value)}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Referência<select aria-label="Filtrar referência" value={filters.source} onChange={e=>change('source',e.target.value)}>{sources.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Período<select aria-label="Filtrar período" value={filters.period} onChange={e=>change('period',e.target.value)}>{periods.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><a className="pbr-export" href={jsonUrl} download="vano-benchmark-results.json"><Download size={17}/> JSON</a></div>
       {filters.source==='all'&&<p className="pbr-disclaimer">Fontes diferentes não são agregadas como se fossem equivalentes. Selecione uma fonte para consultar diferenças médias.</p>}
       {error?<div className="pbr-empty" role="alert"><h3>Não foi possível consultar os resultados.</h3><p>{error}</p></div>:loading?<div className="pbr-empty" role="status">Consultando resultados publicados…</div>:!report?.records?.length?<div className="pbr-empty" role="status"><span className="pbr-empty-icon"><SlidersHorizontal size={28}/></span><h3>Nenhum teste publicado neste filtro</h3><p>O laboratório atual permite executar testes, mas não grava automaticamente um histórico público. Quando medições reais forem verificadas e publicadas, elas aparecerão aqui com data e referência.</p><Link to="/benchmark-de-rotas">Abrir laboratório <ArrowUpRight size={17}/></Link></div>:<div className="pbr-table-scroll"><table><caption className="pbr-sr">Testes públicos VANO comparando referência e rota selecionada</caption><thead><tr><th>DATA / TRAJETO</th><th>CATEGORIA</th><th>ROTA PADRÃO</th><th>VANO</th><th>DIFERENÇA ETA</th><th>DIFERENÇA KM</th><th>DETALHES</th></tr></thead><tbody>{report.records.map(r=><tr key={r.id}><td><strong>{r.origin} → {r.destination}</strong><small>{date(r.measuredAt)} · {r.profile==='motorcycle'?'Moto':'Carro'}</small></td><td>{categoryLabel(r.category)}</td><td><strong>{fmt(r.reference.etaMin)} min</strong><small>{fmt(r.reference.distanceKm)} km · {sourceLabel(r.reference.source)}</small></td><td><strong>{fmt(r.vano.etaMin)} min</strong><small>{fmt(r.vano.distanceKm)} km · {r.vano.mode}</small></td><td><Delta value={r.delta.etaMin} unit=" min"/><small>{fmt(r.delta.etaPercent)}%</small></td><td><Delta value={r.delta.distanceKm} unit=" km"/><small>{fmt(r.delta.distancePercent)}%</small></td><td><details><summary>Ver origem</summary><p><b>Referência:</b> {sourceLabel(r.reference.source)}<br/><b>Medida em:</b> {date(r.reference.measuredAt)}<br/><b>VANO em:</b> {date(r.vano.measuredAt)}<br/><b>Provedor:</b> {r.vano.provider||'Não informado'}<br/><b>Rota:</b> {r.vano.routeId||'Não identificada'}<br/><b>Latência:</b> {fmt(r.vano.latencyMs,0)} ms<br/><b>Trânsito:</b> {fmt(r.vano.trafficScore)}<br/><b>Segurança:</b> {fmt(r.vano.safetyScore)}</p>{r.reference.evidenceUrl&&<a href={r.reference.evidenceUrl} rel="noopener noreferrer nofollow" target="_blank">Evidência <ExternalLink size={13}/></a>}</details></td></tr>)}</tbody></table></div>}
       {(report?.total||0)>25&&<nav className="pbr-pages" aria-label="Paginação"><button disabled={filters.page<=1} onClick={()=>setFilters(x=>({...x,page:x.page-1}))}><ChevronLeft size={16}/> Anterior</button><span>Página {filters.page}</span><button disabled={filters.page*25>=report.total} onClick={()=>setFilters(x=>({...x,page:x.page+1}))}>Próxima <ChevronRight size={16}/></button></nav>}
     </section>
     <section className="pbr-method"><article><div className="pbr-overline">METODOLOGIA</div><h2>Como interpretamos os números.</h2><p>As comparações usam origem, destino, veículo e horários identificados. ETA e distância são estimativas do momento da consulta, não tempos observados em viagens reais.</p><p><b>Diferença = referência − VANO.</b> Valor positivo significa menor ETA previsto para o VANO. O modo “fastest” é uma referência interna do próprio VANO — não é o Google Maps.</p></article><article><div className="pbr-overline">INTELIGÊNCIA ARTIFICIAL E DADOS</div><h2>Um relatório legível por máquinas.</h2><p>Disponibilizamos HTML indexável e um endpoint JSON com campos explícitos, data, fonte, unidades, registros paginados e limitações para pesquisadores e modelos de IA.</p><a href={jsonUrl}>Explorar API JSON <ArrowUpRight size={17}/></a><small>Os resultados exigem revisão antes da publicação; não publicamos trajetos privados.</small></article></section>
     <footer className="pbr-footer"><span>VANO <b>MAPS</b> <small>© 2026 · Rotas com contexto.</small></span><div><Link to="/mapa">Mapa</Link><Link to="/benchmark-de-rotas">Laboratório</Link><Link to="/sobre">Sobre</Link></div></footer>
   </div>
 </main>;
}
