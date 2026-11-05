import React,{useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,Search,Route} from 'lucide-react';
import {groupedHistory,historyDistanceLabel} from '../lib/historyPresentation.mjs';
import {fmtTime,timeAgo} from '../lib/api';
import {useVano} from '../context';
import './HistoryList.css';

export default function HistoryList({records=[]}){
  const {language='pt-BR'}=useVano();
  const [query,setQuery]=useState(''),[limit,setLimit]=useState(10);
  const groups=useMemo(()=>groupedHistory(records,{query}),[records,query]);
  const shown=groups.slice(0,limit);
  return <div className="trip-history">
    {records.length>0&&<label className="trip-history-search"><Search size={18}/><span className="trip-sr-only">Buscar no histórico</span><input type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(10);}} placeholder="Buscar um destino no histórico"/></label>}
    <p className="trip-history-note">Inícios repetidos para o mesmo lugar no mesmo dia aparecem juntos. O tempo é uma estimativa da rota; a distância percorrida depende do GPS.</p>
    <div className="trip-history-list">{shown.map(({key,latest:item,count,distanceKm})=><article key={key} className="trip-history-row">
      <Route size={19} aria-hidden="true"/>
      <div className="trip-history-place"><strong>{item.destination?.name||'Destino'}</strong><p>{item.destination?.address}</p><small>{timeAgo(item.createdAt,language)}{count>1?` · ${count} inícios neste dia`:''}</small></div>
      <div className="trip-history-facts"><span>{fmtTime(item.duration)} estimados{count>1?' na última rota':''}</span><small>{count>1&&distanceKm>0?new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(distanceKm)+' km percorridos no grupo':historyDistanceLabel(item,language)}</small></div>
      <Link className="trip-history-open" to={'/mapa?trip='+encodeURIComponent(item.id)} aria-label={'Ver rota para '+(item.destination?.name||'destino')}>Ver rota <ArrowRight size={16}/></Link>
    </article>)}</div>
    {!groups.length&&<p role="status">{query?'Nenhum destino encontrado. Tente outro nome.':'Seu histórico aparecerá aqui quando iniciar uma rota.'}</p>}
    {groups.length>0&&<div className="trip-history-more"><span role="status">{shown.length} de {groups.length} destinos por dia</span>{groups.length>limit&&<button type="button" className="btn btn-muted" onClick={()=>setLimit(value=>value+10)}>Mostrar mais 10</button>}</div>}
  </div>;
}
