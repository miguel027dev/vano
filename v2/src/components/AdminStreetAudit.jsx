import React,{useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api.js';
import './AdminStreetAudit.css';

// RFC 4180-style quoted CSV parser; the file never leaves the browser.
// Limit inputs to the admin's 7,500-row audit, not arbitrary uploaded data.
export function parseStreetAuditCsv(text){
 if(typeof text!=='string'||text.length>5_000_000)throw Error('Arquivo inválido ou grande demais.');
 const rows=[];let cells=[],part='',quoted=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(char==='"'){
   if(quoted&&text[i+1]==='"'){part+='"';i++;}else quoted=!quoted;
  }else if(!quoted&&char===','){cells.push(part);part='';}
  else if(!quoted&&(char==='\n'||char==='\r')){
   if(char==='\r'&&text[i+1]==='\n')i++;
   cells.push(part);part='';if(cells.some(x=>x.length))rows.push(cells);cells=[];
   if(rows.length>7501)throw Error('Arquivo excede 7.500 ruas.');
  }else part+=char;
 }
 if(quoted)throw Error('CSV malformado: aspas não fechadas.');
 if(part||cells.length){cells.push(part);rows.push(cells);}
 const header=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim())||[];
 const required=['id','name','district','cartography_internal_status','peak_measured','eligible_for_v2_routing'];
 if(required.some(x=>!header.includes(x)))throw Error('Use o CSV de auditoria VANO SP7500, não a lista bruta.');
 if(rows.length!==7500)throw Error('Arquivo incompleto: a auditoria exige exatamente 7.500 registros.');
 const indices=Object.fromEntries(header.map((h,i)=>[h,i]));
 const mapped=rows.map(cols=>({
  id:(cols[indices.id]||'').trim(),
  name:(cols[indices.name]||'').trim().slice(0,140),
  district:(cols[indices.district]||'').trim().slice(0,80),
  status:(cols[indices.cartography_internal_status]||'').trim(),
  flags:(cols[indices.flags]||'').trim().slice(0,250),
  peak:(cols[indices.peak_measured]||'').trim().toLowerCase(),
  eligible:(cols[indices.eligible_for_v2_routing]||'').trim().toLowerCase()
 }));
 if(new Set(mapped.map(x=>x.id)).size!==7500)throw Error('Há IDs repetidos no CSV.');
 if(mapped.some(x=>!/^SP-RUA-\d{5}$/.test(x.id)||!x.name||!x.district))throw Error('IDs, nomes ou distritos inválidos.');
 if(mapped.some(x=>x.peak!=='false'||x.eligible!=='false'))
  throw Error('O arquivo declara tráfego ou rotas habilitadas sem evidência.');
 if(mapped.filter(x=>x.status==='INTERNAL_CARTOGRAPHY_MATCH').length!==7421||
  mapped.filter(x=>x.status==='REVIEW_REQUIRED').length!==79)
  throw Error('Contagens de auditoria diferentes do relatório de referência.');
 return mapped;
}

export default function AdminStreetAudit(){
 const [open,setOpen]=useState(false),[report,setReport]=useState(null);
 const [error,setError]=useState(''),[records,setRecords]=useState(null);
 const [query,setQuery]=useState(''),[onlyIssues,setOnlyIssues]=useState(false);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!open||report)return;
  let cancelled=false;
  api('/admin/sp-street-audit').then(x=>{if(!cancelled)setReport(x);})
   .catch(()=>{if(!cancelled)setError('Não foi possível carregar a auditoria administrativa.');});
  return()=>{cancelled=true;};
 },[open,report]);
 const filtered=useMemo(()=>{
  if(!records)return [];
  const needle=query.trim().toLocaleLowerCase('pt-BR');
  return records.filter(x=>(!onlyIssues||x.status==='REVIEW_REQUIRED')&&
   (!needle||[x.id,x.name,x.district,x.flags].some(v=>v.toLocaleLowerCase('pt-BR').includes(needle)))).slice(0,70);
 },[records,query,onlyIssues]);
 async function onFile(event){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  setBusy(true);setError('');
  try{
   if(file.size>5_000_000)throw Error('O arquivo é grande demais.');
   const value=parseStreetAuditCsv(await file.text());
   setRecords(value);setOnlyIssues(true);
  }catch(e){setRecords(null);setError(e.message||'CSV inválido.');}
  finally{setBusy(false);}
 }
 return <div className="v-sp-audit">
  <button type="button" className="v-sp-audit-trigger" aria-expanded={open}
    aria-controls="v-sp-audit-panel" onClick={()=>setOpen(x=>!x)}>
    <span aria-hidden="true">◈</span> QA SP
  </button>
  {open&&<section id="v-sp-audit-panel" className="v-sp-audit-panel"
    aria-label="Auditoria do trânsito de São Paulo">
    <header><div><small>V2 ADMIN · SOMENTE AUDITORIA</small><h3>Trânsito SP — 7.500 ruas</h3></div>
    <button type="button" onClick={()=>setOpen(false)} aria-label="Fechar auditoria">×</button></header>
    {report?<div className="v-sp-audit-stats">
       <div><strong>{report.records?.toLocaleString('pt-BR')}</strong><small>ruas registradas</small></div>
       <div><strong>{report.internallyConsistent?.toLocaleString('pt-BR')}</strong><small>consistência interna</small></div>
       <div><strong>{report.reviewRequired}</strong><small>pendentes</small></div>
       <div><strong>0</strong><small>picos medidos</small></div>
     </div>:<p>Consultando relatório do servidor…</p>}
    <p className="v-sp-audit-warning">Sem amostras históricas verificadas, sentidos ou desvios autorizados.
      <strong> Nenhuma rua influencia a rota ou o ETA.</strong></p>
    {report&&<p className="v-sp-audit-meta">Base CEM/USP 2025; revisão interna, não validação externa CET/GeoSampa.
      Modo: {report.mode}. Dados individuais disponíveis no arquivo de auditoria.</p>}
    <label className="v-sp-audit-upload">
      {busy?'Verificando CSV…':records?'Recarregar arquivo de auditoria':'Abrir auditoria CSV das 7.500 ruas'}
      <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy}/>
    </label>
    {error&&<p className="v-sp-audit-error" role="alert">{error}</p>}
    {records&&<div className="v-sp-audit-browser">
      <div className="v-sp-audit-filter">
       <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
         placeholder="Buscar rua, ID ou distrito" aria-label="Pesquisar ruas auditadas"/>
       <label><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/> Só pendências</label>
      </div>
      <p className="v-sp-audit-meta">Arquivo validado localmente · até 70 resultados por busca · nunca enviado ao servidor.</p>
      <ul>{filtered.map(road=><li key={road.id}>
       <strong>{road.name}</strong><small>{road.id} · {road.district}</small>
       <span>{road.status==='REVIEW_REQUIRED'?'Revisão: '+(road.flags||'pendente'):'Cadastro consistente com a fonte — horários não medidos'}</span>
      </li>)}</ul>
     </div>}
    <footer>Dados de 2025 · Referência de auditoria, não de navegação. Bloqueado para roteamento.</footer>
   </section>}
 </div>;
}
