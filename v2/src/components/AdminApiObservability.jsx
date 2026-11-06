import React,{useEffect,useMemo,useState} from 'react';
import {Activity,ArrowDownUp,Clock3,Database,RefreshCcw,Network,Plug,AlertTriangle} from 'lucide-react';
import {api} from '../lib/api';
import '../admin-api-observability.css';

const compact=n=>Number.isFinite(n)?new Intl.NumberFormat('pt-BR').format(n):'—';
const percent=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—';
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:5}).format(n):'Não configurado';
const bytes=n=>!Number.isFinite(n)?'Não medido':n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';
const date=n=>n&&Number.isFinite(new Date(n).getTime())?new Date(n).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}):'Sem amostras';
function Kpi({label,value,detail}){return <div className="obs-kpi"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;}
function Badged({metric}){
 let label='Sem medições',css='empty';
 if(metric.status==='medido'){label='Com dados';css='ok';}
 if(metric.status==='degradado'){label='Erros elevados';css='bad';}
 if(metric.configured===false&&!metric.requests){label='Não configurado';css='warn';}
 return <span className={'obs-status '+css}>{label}</span>;
}
function TrafficChart({trend,field,range}){
 const bars=useMemo(()=>{
  if(range==='24h')return trend;
  const daily=new Map();
  for(const p of trend){
   const day=String(p.bucket||'').slice(0,10);
   daily.set(day,(daily.get(day)||0)+(p[field]||0));
  }
  return [...daily.entries()].map(([bucket,n])=>({bucket,[field]:n}));
 },[trend,range,field]);
 const peak=Math.max(1,...bars.map(p=>p[field]||0));
 return <div className="obs-chart-wrap">
  <div className="obs-chart" role="img" aria-label={'Volume de chamadas observadas: '+bars.map(p=>p.bucket+': '+p[field]).join(', ')}>
   {bars.map(p=><div className="obs-chart-column" key={p.bucket} title={p.bucket+' · '+compact(p[field])+' chamadas'}>
    <div className={'obs-chart-bar '+(field==='partners'?'is-partner':'')} style={{height:(100*(p[field]||0)/peak)+'%'}}/>
   </div>)}
  </div>
  <div className="obs-chart-labels"><span>{bars[0]?.bucket.slice(0,16).replace('T',' ')||''}</span><span>{bars.at(-1)?.bucket.slice(0,16).replace('T',' ')||''}</span></div>
 </div>;
}
function SourceRows({items=[]}){
 return <div className="obs-table-wrap"><table className="obs-table">
 <thead><tr><th>Fonte externa</th><th>Situação</th><th>Chamadas</th><th>Sucesso</th><th>p95 aprox.</th><th>429</th><th>Última chamada</th><th>Custo estimado</th></tr></thead>
 <tbody>{items.map(m=><tr key={m.id}>
  <td><b>{m.label}</b><small>{m.description}</small></td>
  <td><Badged metric={m}/></td>
  <td>{compact(m.requests)}</td><td>{percent(m.success_pct)}<small>{m.requests?compact(m.errors)+' falhas':'Sem amostra'}</small></td>
  <td>{m.p95_ms_upper_bound===null?'—':'≤ '+compact(m.p95_ms_upper_bound)+' ms'}</td>
  <td>{compact(m.rate_limits)}</td><td>{date(m.last_at)}</td><td>{money(m.estimated_cost_brl)}</td>
 </tr>)}</tbody>
 </table></div>;
}
function PartnerRows({items=[]}){
 return <div className="obs-table-wrap"><table className="obs-table">
 <thead><tr><th>Parceiro</th><th>Chamadas</th><th>Sucesso</th><th>Erros</th><th>p95 aprox.</th><th>Dados enviados</th><th>Última chamada</th><th>Custo estimado</th></tr></thead>
 <tbody>{items.map(m=><tr key={m.id}>
  <td><b>{m.label}</b><small>{m.operations.map(op=>op.name+' · '+compact(op.count)).slice(0,2).join(' / ')||'Ainda sem consumo'}</small></td>
  <td>{compact(m.requests)}</td><td>{percent(m.success_pct)}</td><td>{compact(m.errors)}</td>
  <td>{m.p95_ms_upper_bound===null?'—':'≤ '+compact(m.p95_ms_upper_bound)+' ms'}</td>
  <td>{bytes(m.response_bytes)}</td><td>{date(m.last_at)}</td><td>{money(m.estimated_cost_brl)}</td>
 </tr>)}</tbody>
 </table></div>;
}

export default function AdminApiObservability({type='providers'}){
 const [range,setRange]=useState('24h'),[data,setData]=useState(null),[pending,setPending]=useState(false),[failure,setFailure]=useState('');
 const partner=type==='partners';
 const refresh=async()=>{
  setPending(true);setFailure('');
  try{
   const result=await api('/admin/api-observability?range='+encodeURIComponent(range));
   if(!result?.ok)throw new Error('Dados indisponíveis.');
   setData(result);
  }catch(err){setFailure(err?.message||'Não foi possível carregar o monitoramento.');}
  finally{setPending(false);}
 };
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{const result=await api('/admin/api-observability?range='+encodeURIComponent(range));if(active){setData(result);setFailure('');}}
   catch(err){if(active)setFailure(err?.message||'Não foi possível consultar as métricas.');}
  };
  void load();
  const id=setInterval(()=>{if(!document.hidden)void load()},60000);
  return()=>{active=false;clearInterval(id)};
 },[range]);
 const list=partner?data?.partners||[]:data?.sources||[];
 const total=list.reduce((s,m)=>s+(m.requests||0),0);
 const failures=list.reduce((s,m)=>s+(m.errors||0),0);
 const limits=list.reduce((s,m)=>s+(m.rate_limits||0),0);
 const active=list.filter(m=>m.requests>0).length;
 return <section className="obs-panel vanu-section-mount" aria-label={partner?'Consumo de APIs de parceiros':'Qualidade das APIs consumidas'}>
  <div className="obs-top">
   <div><span className="obs-kicker">{partner?'API GATEWAY · PARCEIROS':'DEPENDÊNCIAS · SAÚDE E QUALIDADE'}</span>
    <h2>{partner?'Consumo das APIs VANO':'APIs externas consumidas'}</h2>
    <p>{partner?'Tráfego real por credencial validada no gateway VANO.':'Requisições de saída observadas pelo servidor e taxas de erro por fonte.'}</p></div>
   <div className="obs-controls"><label htmlFor={'obs-range-'+type}>Período</label><select id={'obs-range-'+type} value={range} onChange={e=>setRange(e.target.value)}><option value="24h">24 horas</option><option value="7d">7 dias</option><option value="30d">30 dias</option></select><button type="button" disabled={pending} onClick={refresh}><RefreshCcw size={15}/>{pending?'Atualizando':'Atualizar'}</button></div>
  </div>
  {failure&&<div className="obs-error" role="alert"><AlertTriangle size={17}/>{failure}</div>}
  <div className="obs-kpis">
   <Kpi label="Chamadas" value={data?compact(total):'—'} detail={partner?'Autenticadas por parceiro':'Tentativas reais no backend'}/>
   <Kpi label={partner?'Parceiros registrados':'Fontes observadas'} value={data?compact(partner?list.length:active):'—'} detail="No período selecionado"/>
   <Kpi label="Falhas" value={data?compact(failures):'—'} detail="HTTP 4xx/5xx e falhas de rede"/>
   <Kpi label={partner?'Respostas limitadas':'Rate limits 429'} value={data?compact(limits):'—'} detail="Chamadas bloqueadas com HTTP 429"/>
  </div>
  <div className="obs-card"><div className="obs-card-title"><div><h3><Activity size={18}/> Volume de chamadas</h3><p>{range==='24h'?'Por hora UTC':'Por dia UTC'} · sem simulação</p></div></div>
    {data?<TrafficChart trend={data.trend||[]} field={partner?'partners':'providers'} range={range}/>:<div className="obs-empty">Aguardando medições…</div>}
  </div>
  <div className="obs-card"><div className="obs-card-title"><div><h3>{partner?<Plug size={18}/>:<Network size={18}/>} {partner?'Consumo por parceiro':'Fontes e qualidade'}</h3><p>{partner?'Somente identidades verificadas pelo servidor':'Status, latência, falhas e última resposta'}</p></div></div>
   {list.length?(partner?<PartnerRows items={list}/>:<SourceRows items={list}/>):<div className="obs-empty">{partner?'Nenhum parceiro autenticado medido neste período.':'Ainda não há fontes de API configuradas.'}</div>}
  </div>
  <div className="obs-disclosure"><Database size={17}/><div>
   <strong>{data?.persistent?'Persistência configurada':'Persistência não confirmada'}</strong>
   <p>As medições começam após a implantação; sem amostras não significa serviço fora do ar. Latência p95 é aproximada por faixas. O tráfego Mapbox direto no celular não aparece nesta contagem. Custos exigem tarifas reais configuradas e não representam a fatura.</p>
  </div></div>
  <div className="obs-timestamp"><Clock3 size={13}/> {data?.generated_at?'Atualizado em '+date(data.generated_at):'Aguardando primeira atualização'}</div>
 </section>;
}
