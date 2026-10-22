import React,{useMemo,useRef,useState} from 'react';
import TrafficPipelineHealth from './TrafficPipelineHealth.jsx';
import {Search,X,UploadCloud,AlertTriangle,CheckCircle2,MapPinned} from 'lucide-react';
import {parseRoadAuditCsv,SP_ROAD_AUDIT_BASELINE} from '../lib/roadAuditCsv.mjs';
import './RoadAuditPanel.css';

/** Administrator-only diagnostic overlay. Never touches VanoMap, route state or API. */
export default function RoadAuditPanel({onClose}){
 const input=useRef(null),[audit,setAudit]=useState(null),[error,setError]=useState(''),[filter,setFilter]=useState(''),[onlyIssues,setOnlyIssues]=useState(false);
 const matches=useMemo(()=>{
  if(!audit)return [];
  const q=filter.trim().toLocaleLowerCase('pt-BR');
  return audit.rows.filter(r=>(!onlyIssues||r.status!=='INTERNAL_CARTOGRAPHY_MATCH')&&(!q||(r.name+' '+r.district+' '+r.id).toLocaleLowerCase('pt-BR').includes(q))).slice(0,100);
 },[audit,filter,onlyIssues]);
 async function receiveFile(file){
  if(!file)return;
  setError('');setAudit(null);
  if(file.size>8_000_000){setError('Arquivo maior que 8 MB.');return;}
  try{const loaded=parseRoadAuditCsv(await file.text());setAudit(loaded);}
  catch(e){setError(e.message||'Falha ao abrir a auditoria.');}
 }
 return <section className="v2-road-audit" role="dialog" aria-modal="true" aria-label="Auditoria de ruas da rota V2">
  <header className="v2-road-audit-head">
   <div><small>V2 ADMIN · SOMENTE LEITURA</small><h2><MapPinned size={19}/> Auditoria de ruas SP</h2></div>
   <button aria-label="Fechar auditoria" className="v2-road-audit-close" onClick={onClose}><X size={20}/></button>
  </header>
  <div className="v2-road-audit-content">
   <p className="v2-road-audit-description">Catálogo CEM/USP 2025 · verificação <strong>interna</strong> de geometria. Não altera GPS, rotas, ETA ou tráfego ao vivo.</p>
   <div className="v2-road-audit-stats">
    <div><strong>{SP_ROAD_AUDIT_BASELINE.total.toLocaleString('pt-BR')}</strong><small>ruas no lote</small></div>
    <div><strong>{SP_ROAD_AUDIT_BASELINE.consistent.toLocaleString('pt-BR')}</strong><small>coerentes CEM</small></div>
    <div><strong>{SP_ROAD_AUDIT_BASELINE.review}</strong><small>a revisar</small></div>
    <div><strong>0</strong><small>picos comprovados</small></div>
   </div>
   <p className="v2-road-audit-description"><b>Avenidas:</b> {SP_ROAD_AUDIT_BASELINE.avenueLabels.toLocaleString("pt-BR")} etiquetas e {SP_ROAD_AUDIT_BASELINE.avenueSegments.toLocaleString("pt-BR")} segmentos rechecados no CEM/USP. Os dados de avenida também não são velocidades.</p>
   <p className="v2-road-audit-warning"><AlertTriangle size={16}/><span><b>Não liberado para roteamento.</b> Falta checagem externa CET/GeoSampa, sentido legal, conexão, aclive e horários com medições reais. O modo Traffic Memory permanece isolado.</span></p>
   <TrafficPipelineHealth/>
   <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={e=>{const file=e.target.files?.[0];void receiveFile(file);e.target.value='';}}/>
   <button className="v2-road-audit-upload" onClick={()=>input.current?.click()}><UploadCloud size={18}/> Abrir CSV da auditoria (7.500 ruas)</button>
   {error&&<p className="v2-road-audit-file-error" role="alert">{error}</p>}
   {audit&&<>
    <p className="v2-road-audit-loaded"><CheckCircle2 size={15}/> Arquivo carregado localmente: {audit.total.toLocaleString('pt-BR')} ruas, {audit.review} para revisão. {audit.peakClaims>0?'Há alegações de picos ainda sem homologação.':'Nenhum pico medido no arquivo.'}</p>
    <label className="v2-road-audit-search"><Search size={17}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Pesquisar rua, distrito ou código"/></label>
    <label className="v2-road-audit-toggle"><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/> Mostrar só divergências</label>
    <div className="v2-road-audit-results" role="list">
     {matches.map(r=><div className="v2-road-audit-item" role="listitem" key={r.id}>
      <span><strong>{r.name}</strong><small>{r.id} · {r.district}</small></span>
      <span className={r.status==='INTERNAL_CARTOGRAPHY_MATCH'?'v2-road-audit-ok':'v2-road-audit-fail'}>{r.status==='INTERNAL_CARTOGRAPHY_MATCH'?'Base confere':'Revisar'}</span>
      {r.flags&&<small className="v2-road-audit-issue">{r.flags.replaceAll(';',' · ')}</small>}
     </div>)}
     {!matches.length&&<p>Nenhuma rua encontrada.</p>}
    </div>
    <small className="v2-road-audit-foot">Até 100 registros exibidos por pesquisa; {audit.total.toLocaleString('pt-BR')} inspecionados no arquivo. Nenhum dado é enviado ao servidor.</small>
   </>}
  </div>
 </section>;
}
