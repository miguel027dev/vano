import React,{useCallback,useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,RefreshCcw,ChevronLeft,ChevronRight,ShieldCheck,Trash2,X} from 'lucide-react';
import {api} from '../lib/api';
import {REPORT_TYPES} from '../lib/communityReports.js';

const labels=new Map(REPORT_TYPES.map(({id,name})=>[id,name]));
const date=value=>{
 const d=new Date(value||'');
 return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
};
export default function AdminOccurrences({stats,onChanged}){
 const [status,setStatus]=useState('all'),[offset,setOffset]=useState(0);
 const [data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [confirmOpen,setConfirmOpen]=useState(false),[confirmation,setConfirmation]=useState('');
 const [clearing,setClearing]=useState(false),[message,setMessage]=useState('');
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
 async function clearAll(){
  if(clearing||confirmation!=='EXCLUIR TODAS')return;
  setClearing(true);setError('');setMessage('');
  try{
   const response=await api('/admin/reports/clear-all',{method:'POST',body:{confirmation}});
   setConfirmOpen(false);setConfirmation('');
   setStatus('all');setOffset(0);
   setData({items:[],total:0,offset:0,limit:25,status:'all'});
   setMessage(response.deleted?
     response.deleted+' ocorrência(s) excluída(s) do mapa.':
     'O mapa já está sem ocorrências cadastradas.');
   try{await onChanged?.();}catch{ /* deletion succeeded even if summary refresh fails */ }
  }catch(err){setError(err.message||'Não foi possível excluir as ocorrências.');}
  finally{setClearing(false);}
 }
 return <section className="vanu-occurrences" aria-labelledby="vanuOccurrencesTitle">
  <header className="vanu-module-heading">
   <div><span className="vanu-control-eyebrow">SEGURANÇA E COMUNIDADE</span><h2 id="vanuOccurrencesTitle">Central de ocorrências</h2>
    <p>Fila de leitura administrativa, sem dados dos autores nem coordenadas individuais. Relatos ainda não verificados não são confirmações oficiais.</p></div>
   <div className="vanu-occurrence-header-actions">
    <button type="button" onClick={()=>refresh()} disabled={busy||clearing}><RefreshCcw size={16}/> {busy?'Consultando…':'Atualizar'}</button>
    <button type="button" className="vanu-occurrences-delete" onClick={()=>{setConfirmOpen(true);setConfirmation('');setMessage('');}} disabled={clearing||busy}>
     <Trash2 size={16}/> Excluir todas as ocorrências
    </button>
   </div>
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
   {message&&<p className="vanu-occurrences-success" role="status">{message}</p>}
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
  <p className="vanu-incident-note"><ShieldCheck size={15}/> Esta ação elimina os relatos colaborativos cadastrados no VANO. Radares, pontos de interesse e informações de outros provedores permanecem intactos.</p>
  {confirmOpen&&<div className="vanu-occurrences-confirm-overlay" role="presentation">
    <section className="vanu-occurrences-confirm" role="alertdialog" aria-modal="true" aria-labelledby="vanuPurgeTitle" aria-describedby="vanuPurgeDescription">
     <div className="vanu-occurrences-confirm-top"><h3 id="vanuPurgeTitle"><AlertTriangle size={19}/> Excluir todas as ocorrências?</h3>
      <button type="button" aria-label="Cancelar exclusão" onClick={()=>{if(!clearing){setConfirmOpen(false);setConfirmation('');}}} disabled={clearing}><X size={18}/></button></div>
     <p id="vanuPurgeDescription">Esta operação apaga <strong>todos os relatos colaborativos</strong> do mapa, inclusive verificados e não verificados, e atualiza os mapas conectados. Não pode ser desfeita pelo painel. Radares e dados de outros provedores não serão excluídos.</p>
     <label htmlFor="vanuPurgeConfirmation">Digite <strong>EXCLUIR TODAS</strong> para confirmar:</label>
     <input id="vanuPurgeConfirmation" autoFocus autoComplete="off" spellCheck={false} value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={clearing} placeholder="EXCLUIR TODAS"/>
     <div className="vanu-occurrences-confirm-actions">
      <button type="button" onClick={()=>{setConfirmOpen(false);setConfirmation('');}} disabled={clearing}>Cancelar</button>
      <button type="button" className="vanu-occurrences-confirm-danger" disabled={clearing||confirmation!=='EXCLUIR TODAS'} onClick={clearAll}><Trash2 size={16}/>{clearing?'Excluindo…':'Excluir definitivamente'}</button>
     </div>
    </section>
   </div>}
 </section>;
}
