import React,{useCallback,useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,RefreshCcw,ChevronLeft,ChevronRight,ShieldCheck} from 'lucide-react';
import {api} from '../lib/api';
import {REPORT_TYPES} from '../lib/communityReports.js';

const labels=new Map(REPORT_TYPES.map(({id,name})=>[id,name]));
const date=value=>{
 const d=new Date(value||'');
 return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
};
export default function AdminOccurrences({stats}){
 const [status,setStatus]=useState('all'),[offset,setOffset]=useState(0);
 const [data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async(signal)=>{
  setBusy(true);setError('');
  try{
   const query=new URLSearchParams({status,offset:String(offset),limit:'25'});
   const list=await api('/admin/reports?'+query.toString(),{signal});
   if(!signal?.aborted)setData(list);
  }catch(err){if(!signal?.aborted)setError(err.message||'Não foi possível consultar ocorrências.');}
  finally{if(!signal?.aborted)setBusy(false);}
 },[status,offset]);
 useEffect(()=>{
  const controller=new AbortController();
  void refresh(controller.signal);
  return()=>controller.abort();
 },[refresh]);
 const select=value=>{setStatus(value);setOffset(0);};
 return <section className="vanu-occurrences" aria-labelledby="vanuOccurrencesTitle">
  <header className="vanu-module-heading">
   <div><span className="vanu-control-eyebrow">SEGURANÇA E COMUNIDADE</span><h2 id="vanuOccurrencesTitle">Central de ocorrências</h2>
    <p>Fila de leitura administrativa, sem dados dos autores nem coordenadas individuais. Relatos ainda não verificados não são confirmações oficiais.</p></div>
   <button type="button" onClick={()=>refresh()} disabled={busy}><RefreshCcw size={16}/> {busy?'Consultando…':'Atualizar'}</button>
  </header>
  <div className="vanu-incident-kpis" aria-label="Totais de ocorrências">
   <article><AlertTriangle size={20}/><small>Relatos registrados</small><strong>{Number.isFinite(stats?.reportsTotal)?stats.reportsTotal.toLocaleString('pt-BR'):'—'}</strong></article>
   <article><Clock3 size={20}/><small>Aguardando confirmação</small><strong>{Number.isFinite(stats?.reportsUnverified)?stats.reportsUnverified.toLocaleString('pt-BR'):'—'}</strong></article>
   <article><CheckCircle2 size={20}/><small>Recebidos em 24h</small><strong>{Number.isFinite(stats?.reports24h)?stats.reports24h.toLocaleString('pt-BR'):'—'}</strong></article>
  </div>
  <div className="vanu-glass-module">
   <div className="vanu-module-toolbar">
    <div className="vanu-incident-tabs" role="group" aria-label="Filtrar relatos pela verificação">
     {[['all','Todos'],['nao_verificado','Não verificados'],['verificado','Verificados']].map(([value,label])=>
      <button key={value} type="button" aria-pressed={status===value} className={status===value?'is-selected':''} onClick={()=>select(value)}>{label}</button>)}
    </div>
    <span className="vanu-incident-count">{Number.isFinite(data?.total)?data.total+' resultados':'—'}</span>
   </div>
   {error&&<p className="vanu-module-error" role="alert">{error}</p>}
   {busy&&<p className="vanu-module-empty" role="status">Carregando ocorrências…</p>}
   {!busy&&!error&&!data?.items?.length&&<p className="vanu-module-empty">Não há relatos nessa categoria.</p>}
   {!busy&&!error&&Boolean(data?.items?.length)&&<div className="vanu-incident-list" role="list">
    {data.items.map(item=><article key={item.id} className="vanu-incident-row" role="listitem">
     <span className="vanu-incident-icon"><AlertTriangle size={18}/></span>
     <div className="vanu-incident-body"><strong>{labels.get(item.type)||item.type||'Ocorrência'}</strong>
      <p>{item.description||'Sem observações adicionais.'}</p>
      <small>Recebida {date(item.createdAt)}{item.expiresAt?' · validade até '+date(item.expiresAt):''}</small>
     </div>
     <span className={'vanu-incident-state'+(item.status==='verificado'?' is-verified':'')}>
      {item.status==='verificado'?<CheckCircle2 size={13}/>:<Clock3 size={13}/>}
      {item.status==='verificado'?'Verificado':'Não verificado'}</span>
    </article>)}
   </div>}
   <footer className="vanu-incident-footer">
    <span>Exibindo {data?.items?.length||0} de {data?.total||0} relatos no filtro escolhido.</span>
    <div><button disabled={busy||offset===0} onClick={()=>setOffset(x=>Math.max(0,x-25))} type="button"><ChevronLeft size={15}/> Anterior</button>
     <button disabled={busy||offset+25>=(data?.total||0)} onClick={()=>setOffset(x=>x+25)} type="button">Próxima <ChevronRight size={15}/></button></div>
   </footer>
  </div>
  <p className="vanu-incident-note"><ShieldCheck size={15}/> A central é somente leitura. Aprovações e exclusões exigem um fluxo de moderação auditável, que não está habilitado nesta versão.</p>
 </section>;
}
