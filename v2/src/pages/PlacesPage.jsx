import React,{useEffect,useState} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin,Home,BriefcaseBusiness,Plus,Trash2,Search, Navigation, CalendarDays,Clock3, Route,ArrowRight } from 'lucide-react';
import { api,remove,post,fmtKm,fmtTime,timeAgo } from '../lib/api';
import { useVano } from '../context';
import { PageHeader,Section,Empty,CTA,Notice } from '../components/Ui';
import { BottomNav } from '../components/Navigation';
import {useSearchLocation} from '../lib/useSearchLocation.js';
import HistoryList from '../components/HistoryList.jsx';
import {measuredKilometers} from '../lib/travelDistance';
export function PlacesPage(){
 const {favorites,saveFavorite,deleteFavorite,setToast}=useVano(),[params]=useSearchParams();
 const [creating,setCreating]=useState(Boolean(params.get('new'))),[name,setName]=useState(params.get('new')||''),[query,setQuery]=useState(''),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[category,setCategory]=useState(params.get('new')||'Outro');
 const [searchBusy,setSearchBusy]=useState(false),[searchError,setSearchError]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 const searchBias=useSearchLocation(creating);
 useEffect(()=>{
  const controller=new AbortController();setResults([]);setSearchError('');setSearchBusy(false);
  if(!creating||query.trim().length<2||selected)return()=>controller.abort();
  setSearchBusy(true);
  const timer=setTimeout(()=>{
   api(`/search?q=${encodeURIComponent(query)}${searchBias}`,{signal:controller.signal})
    .then(items=>{if(!controller.signal.aborted)setResults(Array.isArray(items)?items:[]);})
    .catch(error=>{if(!controller.signal.aborted)setSearchError(error.message||'Não foi possível buscar. Tente novamente.');})
    .finally(()=>{if(!controller.signal.aborted)setSearchBusy(false);});
  },260);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query,searchBias,selected,creating]);
 async function save(event){
  event.preventDefault();if(saving)return;
  if(!selected){setSaveError('Selecione um endereço nos resultados da busca.');return;}
  setSaving(true);setSaveError('');
  try{await saveFavorite({name:name||selected.name,address:selected.address,coords:selected.coords,category});setCreating(false);setName('');setQuery('');setSelected(null);}
  catch(error){setSaveError(error.message||'Não foi possível salvar. Seus campos foram mantidos para tentar novamente.');}
  finally{setSaving(false);}
 }
 async function removePlace(item){try{await deleteFavorite(item.id);}catch(error){setToast(error.message||'Não foi possível remover o lugar. Tente novamente.');}}
 return <main className="content-page"><PageHeader title="Lugares salvos" subtitle="Seus endereços sempre à mão."/>
  <div className="page-toolbar"><span>{favorites.length} {favorites.length===1?'lugar salvo':'lugares salvos'}</span><button className="btn btn-primary btn-sm" onClick={()=>setCreating(!creating)}><Plus size={17}/> Adicionar lugar</button></div>
  {creating&&<form className="form-panel" onSubmit={save} aria-busy={saving}><h2>Novo lugar</h2>
   <label>Nome do lugar<input required value={name} onChange={event=>setName(event.target.value)} placeholder="Ex.: Academia"/></label>
   <label>Categoria<select value={category} onChange={event=>setCategory(event.target.value)}>{['Outro','Casa','Trabalho','Academia','Escola','Hospital'].map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Endereço ou ponto de interesse<input value={query} onChange={event=>{setQuery(event.target.value);setSelected(null);setSaveError('');}} placeholder="Busque um endereço" aria-describedby="saved-place-search-status"/></label>
   <p id="saved-place-search-status" role="status">{searchBusy?'Buscando endereços…':searchError?searchError:!selected&&query.trim().length>=2&&!results.length?'Nenhum endereço encontrado. Tente incluir a cidade ou o bairro.':searchBias?'Resultados priorizados próximos da localização autorizada.':'Você pode incluir a cidade ou o país para direcionar a busca.'}</p>
   {results.length>0&&<div className="lookup-list">{results.map(item=><button type="button" key={item.id} onClick={()=>{setSelected(item);setQuery(item.name);setResults([]);setSaveError('');}}><MapPin size={17}/><span><strong>{item.name}</strong><small>{item.address}</small></span></button>)}</div>}
   {selected&&<div className="form-selected">Endereço selecionado: {selected.address}</div>}
   {saveError&&<p role="alert">{saveError}</p>}
   <div className="form-actions"><button type="button" className="btn btn-muted" disabled={saving} onClick={()=>setCreating(false)}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving?'Salvando…':'Salvar lugar'}</button></div>
  </form>}
  {favorites.length?<div className="place-grid">{favorites.map(item=><div className="place-item" key={item.id}><div className="place-item-icon"><MapPin size={21}/></div><div><strong>{item.name}</strong><p>{item.address}</p><small>{item.category}</small></div><div className="place-actions"><button onClick={()=>removePlace(item)} aria-label={`Remover ${item.name}`} title="Remover"><Trash2 size={18}/></button></div></div>)}</div>:!creating&&<Empty icon={MapPin} title="Seus lugares começam aqui" subtitle="Salve casa, trabalho e seus destinos frequentes para chegar a eles em poucos toques." action={<button className="btn btn-primary" onClick={()=>setCreating(true)}>Salvar meu primeiro lugar</button>}/>}
  <BottomNav/>
 </main>;
}
export function RoutesPage(){
 const {history=[],favorites=[],routines=[]}=useVano();
 return <main className="content-page"><PageHeader title="Suas rotas" subtitle="Seus destinos e sua rotina, sem precisar procurar no histórico."/>
  <Section title="Seus favoritos" action={<Link className="text-link" to="/favoritos">Gerenciar <ArrowRight size={16}/></Link>}>{favorites.length?<div className="favorite-chips">{favorites.map(x=><Link to={`/mapa?destination=${encodeURIComponent(x.id)}`} className="favorite-pill" key={x.id}><MapPin size={17}/>{x.name}</Link>)}</div>:<div className="inline-empty">Você ainda não salvou locais. <Link to="/favoritos">Adicionar lugar</Link></div>}</Section>
  <Section title="Sua rotina" action={<Link className="text-link" to="/rotinas">Editar <ArrowRight size={16}/></Link>}>{routines.length?<div className="list-card">{routines.map(x=><div className="history-row" key={x.id}><Clock3 size={20}/><span><strong>{x.name}</strong><p>{x.destination} · {x.time}</p></span></div>)}</div>:<div className="inline-empty">Configure horários de saídas frequentes. <Link to="/rotinas">Criar rotina</Link></div>}</Section>
  <Section title="Rotas recentes" subtitle={`${history.length} ${history.length===1?'início registrado':'inícios registrados'}`} action={<Link className="text-link" to="/atividade">Ver atividade <ArrowRight size={16}/></Link>}>{history.length?<HistoryList records={history}/>:<Empty icon={Route} title="Sem rotas por enquanto" subtitle="Busque um destino no mapa e inicie uma navegação para vê-la aqui." action={<CTA to="/mapa">Explorar mapa</CTA>}/>}</Section><BottomNav/>
 </main>;
}
export function ActivityPage(){
 const {history=[]}=useVano();
 const totalDistance=history.reduce((sum,item)=>sum+measuredKilometers(item),0);
 const durations=history.map(item=>item.duration).filter(value=>Number.isFinite(value)&&value>0);
 const avg=durations.length?durations.reduce((sum,value)=>sum+value,0)/durations.length:0;
 return <main className="content-page"><PageHeader title="Atividade" subtitle="Um resumo do seu histórico local."/>
 <div className="activity-hero"><div><small>ROTAS INICIADAS</small><strong>{history.length}</strong></div><div><small>DISTÂNCIA PERCORRIDA</small><strong>{fmtKm(totalDistance)}</strong></div><div><small>TEMPO MÉDIO PREVISTO</small><strong>{fmtTime(avg)}</strong></div></div>
 <Notice>Distância registrada pelo GPS durante a navegação. Rotas antigas sem medição não entram nesse total. A duração é uma previsão, não o tempo efetivamente viajado.</Notice>
 <Section title="Histórico">{history.length?<HistoryList records={history}/>:<Empty icon={Route} title="Sua jornada começa no mapa" subtitle="Inicie uma rota e seu histórico aparecerá aqui." action={<CTA to="/mapa">Abrir mapa</CTA>}/>}</Section><BottomNav/></main>;
}
export function RoutinesPage(){const {routines,refresh,setToast}=useVano(),[name,setName]=useState('Ida ao trabalho'),[destination,setDestination]=useState('Trabalho'),[time,setTime]=useState('08:00');async function create(e){e.preventDefault();await post('/routines',{name,destination,time});await refresh();setToast('Rotina adicionada');}async function del(id){await remove(`/routines/${id}`);await refresh()}return <main className="content-page"><PageHeader title="Rotinas" subtitle="Organize seus deslocamentos habituais."/><form className="form-panel" onSubmit={create}><h2>Criar rotina</h2><label>Nome<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Destino<input required value={destination} onChange={e=>setDestination(e.target.value)}/></label><label>Horário<input type="time" required value={time} onChange={e=>setTime(e.target.value)}/></label><button type="submit" className="btn btn-primary"><Plus size={18}/> Salvar rotina</button></form><Section title="Rotinas cadastradas">{routines.length?<div className="list-card">{routines.map(x=><div key={x.id} className="history-row"><Clock3 size={20}/><div><strong>{x.name}</strong><p>{x.destination} · {x.time}</p></div><button className="icon-button" title="Remover" onClick={()=>del(x.id)}><Trash2 size={18}/></button></div>)}</div>:<Empty icon={CalendarDays} title="Nenhuma rotina criada" subtitle="Adicione seus horários mais comuns acima."/>}</Section><BottomNav/></main>}
