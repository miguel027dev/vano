import React,{useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,Copy,Database,Play,Route,ShieldCheck} from 'lucide-react';
import {api} from '../lib/api';
import './AdminEtaConsole.css';

const fmt=(n,d=1)=>typeof n==='number'&&Number.isFinite(n)?
 n.toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
const initial={startLat:'-23.6223',startLon:'-46.6987',endLat:'-23.5615',endLon:'-46.6557'};
const presets=[
 {label:'Morumbi → Paulista',startLat:'-23.6223',startLon:'-46.6987',endLat:'-23.5615',endLon:'-46.6557'},
 {label:'Congonhas → Faria Lima',startLat:'-23.6263',startLon:'-46.6566',endLat:'-23.5731',endLon:'-46.6883'}
];
function Item({label,children}){return <div className="eta-admin-metric"><small>{label}</small><strong>{children}</strong></div>;}
function State({value}){
 const verified=value==='traffic-aware',degraded=value==='degraded';
 return <span className={'eta-admin-state '+(verified?'traffic':degraded?'degraded':'unknown')}>
  {verified?'Perfil com trânsito':degraded?'Trânsito indisponível':'Trânsito não verificado'}
 </span>;
}
function OneRoute({route}){
 const ev=route.evidence;
 return <article className="eta-admin-route" aria-label={'Auditoria de ETA: '+route.label}>
  <div className="eta-admin-route-head"><div><span>{route.id}</span><h3>{route.label}</h3></div><State value={route.trafficDataStatus}/></div>
  <div className="eta-admin-kpis">
   <Item label="Tempo do provedor">{fmt(route.etaMinutes,2)} min</Item>
   <Item label="Distância">{fmt(route.distanceKm,2)} km</Item>
   <Item label="Média implícita">{fmt(route.impliedSpeedKmh)} km/h</Item>
   <Item label="Perfil efetivo">{route.profile}</Item>
   <Item label="Provedor">{route.provider}</Item>
   <Item label="Congestionamento coberto">{ev?fmt(ev.congestionCoveragePct)+'%':'Sem dados'}</Item>
  </div>
  {route.warnings.length>0&&<div className="eta-admin-warnings"><strong><AlertTriangle size={15}/> Pontos que exigem atenção</strong>
    <ul>{route.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></div>}
  <div className="eta-admin-evidence">
   <h4><Activity size={17}/> Evidências de trânsito e duração</h4>
   <div className="eta-admin-kpis">
    <Item label="Amostras anotadas">{ev?fmt(ev.segmentCount,0):'Não disponível'}</Item>
    <Item label="Cobertura do tempo por segmento">{ev?fmt(ev.durationCoveragePct)+'%':'Não disponível'}</Item>
    <Item label="Km com congestionamento pesado">{ev?fmt(ev.heavyDistanceKm,2):'Não disponível'}</Item>
    <Item label="Km sem nível informado">{ev?fmt(ev.unknownDistanceKm,2):'Não disponível'}</Item>
    <Item label="Cobertura dos passos">{fmt(route.stepDurationCoveragePct)}%</Item>
    <Item label="Diferença contra duração típica">{ev?.trafficDelaySeconds==null?'Não fornecida':fmt(ev.trafficDelaySeconds/60,1)+' min'}</Item>
   </div>
   {ev?.segmentsKm&&<div className="eta-admin-levels">
     {Object.entries(ev.segmentsKm).map(([level,distance])=><span key={level}><b>{level}</b> {fmt(distance,2)} km</span>)}
   </div>}
  </div>
  {!!ev?.congestionHotspots?.length&&<details className="eta-admin-details"><summary>Trechos anotados com trânsito pesado ({ev.congestionHotspots.length})</summary>
   <div className="eta-admin-table-wrap"><table><thead><tr><th>Trecho</th><th>Início</th><th>Extensão</th><th>Nível</th><th>Tempo</th><th>Velocidade derivada</th></tr></thead><tbody>
   {ev.congestionHotspots.map((s,i)=><tr key={i}><td>#{s.section}</td><td>{fmt(s.startKm,2)} km</td><td>{fmt(s.lengthKm,3)} km</td><td>{s.congestion}</td><td>{s.seconds==null?'—':fmt(s.seconds,1)+' s'}</td><td>{s.speedKmh==null?'Sem duração':fmt(s.speedKmh)+' km/h'}</td></tr>)}
   </tbody></table></div>
  </details>}
  {!!route.worstSteps?.length&&<details className="eta-admin-details"><summary>Tempos por rua/manobra ({route.worstSteps.length} trechos mais demorados)</summary>
   <div className="eta-admin-table-wrap"><table><thead><tr><th>Rua ou instrução</th><th>Extensão</th><th>Tempo</th><th>Velocidade média derivada</th></tr></thead><tbody>
   {route.worstSteps.map((step,i)=><tr key={i}><td>{step.street}</td><td>{fmt(step.distanceKm,2)} km</td><td>{fmt(step.durationMin)} min</td><td>{fmt(step.avgKmh)} km/h</td></tr>)}
   </tbody></table></div>
  </details>}
 </article>;
}
export default function AdminEtaConsole(){
 const [values,setValues]=useState(initial),[vehicle,setVehicle]=useState('carro'),
  [adaptive,setAdaptive]=useState(true),[running,setRunning]=useState(false),
  [error,setError]=useState(''),[report,setReport]=useState(null),[copied,setCopied]=useState(false);
 function field(key,label){
  return <label className="eta-admin-field"><span>{label}</span><input
   inputMode="decimal" type="text" autoComplete="off" value={values[key]}
   onChange={e=>setValues(prev=>({...prev,[key]:e.target.value}))}/></label>;
 }
 async function execute(e){
  e.preventDefault();if(running)return;
  setError('');setCopied(false);setReport(null);
  const parsed=Object.fromEntries(Object.entries(values).map(([key,val])=>[key,Number(String(val).trim())]));
  const valid=Object.values(values).every(x=>x.trim()!==''&&/^-?\d+(?:\.\d+)?$/.test(x.trim()))&&
   Object.values(parsed).every(Number.isFinite)&&
   Math.abs(parsed.startLat)<=90&&Math.abs(parsed.endLat)<=90&&
   Math.abs(parsed.startLon)<=180&&Math.abs(parsed.endLon)<=180;
  if(!valid){setError('Use coordenadas numéricas válidas, com ponto decimal.');return;}
  setRunning(true);
  try{
   const data=await api('/admin/route-eta-console',{method:'POST',
    body:{origin:[parsed.startLon,parsed.startLat],destination:[parsed.endLon,parsed.endLat],vehicle,adaptive}});
   setReport(data);
  }catch(e){setError(e?.message||'Não foi possível calcular o diagnóstico.');}
  finally{setRunning(false);}
 }
 async function copyReport(){
  if(!report)return;
  try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));setCopied(true);}
  catch{setError('Cópia bloqueada pelo navegador. Abra o JSON abaixo e copie manualmente.');}
 }
 return <section className="eta-admin-console" aria-label="Console de auditoria de rotas e ETA">
  <div className="eta-admin-header"><div><span className="eta-admin-eyebrow"><ShieldCheck size={15}/> DIAGNÓSTICO PRIVADO · ETA</span>
   <h2>Console de rotas</h2>
   <p>Audite a previsão das rotas rápida e alternativa com dados reais do motor. Nenhum tempo é alterado por este painel.</p>
  </div><span className="eta-admin-readonly"><Database size={15}/> Consulta sem armazenamento</span></div>
  <form onSubmit={execute} className="eta-admin-form">
   <div className="eta-admin-presets">{presets.map((p,i)=><button type="button" key={i}
    disabled={running} onClick={()=>{setValues({startLat:p.startLat,startLon:p.startLon,endLat:p.endLat,endLon:p.endLon});setReport(null);setError('');}}>{p.label}</button>)}</div>
   <div className="eta-admin-inputs">
    {field('startLat','Origem · latitude')}{field('startLon','Origem · longitude')}
    {field('endLat','Destino · latitude')}{field('endLon','Destino · longitude')}
   </div>
   <div className="eta-admin-actions"><label>Veículo <select value={vehicle} onChange={e=>setVehicle(e.target.value)} disabled={running}>
    <option value="carro">Carro</option><option value="moto">Moto</option></select></label>
    <label className="eta-admin-check"><input type="checkbox" checked={adaptive} disabled={running} onChange={e=>setAdaptive(e.target.checked)}/> Testar microdesvios</label>
    <button type="submit" className="eta-admin-run" disabled={running}><Play size={16}/>{running?'Calculando diagnóstico…':'Analisar rotas'}</button></div>
   {error&&<p className="eta-admin-error" role="alert">{error}</p>}
  </form>
  {report&&<div className="eta-admin-results" aria-live="polite">
   <div className="eta-admin-results-head"><div><strong><CheckCircle2 size={18}/> Diagnóstico concluído</strong>
    <small>{new Date(report.calculatedAt).toLocaleString('pt-BR')} · {fmt(report.runtimeMs,0)} ms · {report.source}</small></div>
    <button type="button" onClick={copyReport}><Copy size={16}/>{copied?'Copiado':'Copiar relatório JSON'}</button></div>
   <div className="eta-admin-kpis">
    <Item label="Perfil global">{report.engine?.profile}</Item>
    <Item label="Candidatas calculadas">{fmt(report.engine?.candidateCount,0)}</Item>
    <Item label="Sondagens adicionais">{fmt(report.engine?.additionalRequests,0)}</Item>
    <Item label="Micro-rotas encontradas">{report.engine?.microRoutingActive?'Sim':'Não / não informado'}</Item>
    <Item label="TomTom influenciou a escolha?">{report.tomtomRoutingImpact?'Sim':'Não / não informado'}</Item>
   </div>
   {report.routes?.map(r=><OneRoute key={r.id} route={r}/>)}
   <p className="eta-admin-footnote">A pontuação de congestionamento não é um atraso em minutos. Sem duração típica do provedor, o console não inventa penalidades. Acurácia real requer horário efetivo de chegada.</p>
   <details className="eta-admin-details"><summary>Dados técnicos completos (JSON)</summary><pre>{JSON.stringify(report,null,2)}</pre></details>
  </div>}
 </section>;
}
