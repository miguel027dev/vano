import React,{useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {ArrowLeft,ArrowRight,ArrowRightLeft,BusFront,CalendarClock,ChevronDown,ChevronRight,Clock3,Wallet, Zap, Footprints,LocateFixed,MapPin,Search,TrainFront,TramFront,Ship,Route,RefreshCw} from 'lucide-react';
import {api,post} from '../lib/api.js';
import TransitMap from '../components/TransitMap.jsx';
import '../transit-preview.css';

const transportIcon={walk:Footprints,bus:BusFront,metro:TrainFront,train:TrainFront,tram:TramFront,ferry:Ship};
const modeLabel={walk:'Caminhada',bus:'Ônibus',metro:'Metrô',train:'Trem',tram:'VLT / Bonde',ferry:'Barco'};
const sorts=[['economy','Mais econômica','Evita cobranças extras e excesso de embarques.',Wallet],['fastest','Mais rápida','Prioriza chegar mais cedo, incluindo esperas.',Zap]];
const ptTime=iso=>iso?new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—';
const mins=n=>Number.isFinite(n)?Math.round(n)+' min':'—';
const meters=n=>Number.isFinite(n)?Math.round(n)+' m':'—';
const formatFare=fare=>{
 if(!fare?.verified||!Number.isFinite(fare.amount)||!fare.currency)return null;
 try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:fare.currency}).format(fare.amount);}
 catch{return null;}
};
const delayText=value=>Number.isFinite(value)?value>0?'+ '+value+' min de atraso':value<0?Math.abs(value)+' min adiantado':'No horário previsto':null;

function PlaceSearch({label,selected,onSelect,allowGps=false}){
 const [text,setText]=useState(selected?.name||''),[hits,setHits]=useState([]),[busy,setBusy]=useState(false),[focused,setFocused]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(selected?.name)setText(selected.name);},[selected?.name]);
 useEffect(()=>{
  if(!focused||selected||text.trim().length<2){setHits([]);return;}
  const timer=setTimeout(()=>{
   const controller=new AbortController();setBusy(true);
   api('/search?q='+encodeURIComponent(text.trim())+'&lang=pt-BR',{signal:controller.signal})
    .then(items=>{setHits(Array.isArray(items)?items.filter(x=>Array.isArray(x.coords)).slice(0,6):[]);setMessage('');})
    .catch(error=>{if(!controller.signal.aborted)setMessage(error.message||'Busca indisponível.');})
    .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
   activeController=controller;
  },300);
  let activeController=null;
  return()=>{clearTimeout(timer);activeController?.abort();};
 },[text,selected,focused]);
 const gps=()=>{
  if(!navigator.geolocation){setMessage('GPS indisponível neste navegador.');return;}
  setBusy(true);
  navigator.geolocation.getCurrentPosition(({coords})=>{
   onSelect({name:'Sua localização',coords:[coords.longitude,coords.latitude]});
   setText('Sua localização');setFocused(false);setHits([]);setMessage('');setBusy(false);
  },()=>{setMessage('Não foi possível obter sua localização.');setBusy(false);},{enableHighAccuracy:true,timeout:10000,maximumAge:10000});
 };
 return <div className="vt-place-box">
  <label className="vt-label">{label}</label>
  <div className="vt-location-input">
   <MapPin size={18} aria-hidden="true"/>
   <input value={text} autoComplete="off" placeholder={label==='Origem'?'De onde você sai?':'Para onde você vai?'}
     aria-label={label} onFocus={()=>setFocused(true)}
     onChange={e=>{setText(e.target.value);onSelect(null);setFocused(true);}}/>
   {allowGps&&<button type="button" title="Usar minha localização" aria-label="Usar minha localização" disabled={busy} onClick={gps}><LocateFixed size={20}/></button>}
   {busy&&<span className="vt-spinner" aria-label="Pesquisando"/>}
  </div>
  {focused&&hits.length>0&&<div className="vt-suggestions" role="listbox" aria-label={'Resultados de '+label}>
   {hits.map((p,i)=><button type="button" key={p.id||i} role="option" aria-selected={false} onClick={()=>{
    onSelect(p);setText(p.name);setHits([]);setFocused(false);
   }}><MapPin size={17}/><span><strong>{p.name}</strong><small>{p.address||'Localização encontrada'}</small></span></button>)}
  </div>}
  {message&&<small className="vt-input-error">{message}</small>}
 </div>;
}
function Segment({leg}){
 const Icon=transportIcon[leg.mode]||BusFront;
 const isWalk=leg.mode==='walk';
 return <div className={'vt-segment '+(isWalk?'is-walk':'is-transit')}>
  <div className="vt-segment-symbol" style={leg.lineColor?{'--vt-mode-color':leg.lineColor}:{}}><Icon size={19}/></div>
  <div className="vt-segment-detail">
   <div className="vt-segment-title"><strong>{isWalk?'Caminhe até '+(leg.to?.name||'a próxima parada'):(leg.line?'Linha '+leg.line:modeLabel[leg.mode]||'Transporte público')}</strong>
    <span>{mins(Math.round(leg.durationSeconds/60))}</span></div>
   <div className="vt-segment-desc">{isWalk?meters(leg.distanceMeters):[leg.from?.name,leg.headsign&&'sentido '+leg.headsign].filter(Boolean).join(' · ')}</div>
   {leg.transit&&<div className="vt-segment-sub">Desembarque: {leg.to?.name||'parada indicada'} · {ptTime(leg.arrival?.estimated||leg.arrival?.scheduled)}
    {Number.isFinite(leg.departure?.delayMinutes)&&<span className="vt-delay-note"> · {delayText(leg.departure.delayMinutes)} (estimativa)</span>}
   </div>}
  </div>
 </div>;
}
function ItineraryCard({item,selected,onSelect}){
 const fareLabel=formatFare(item.fare);
 return <article className={'vt-itinerary '+(selected?'is-selected':'')}>
  <button className="vt-itinerary-pick" onClick={onSelect} aria-expanded={selected} aria-label={'Ver detalhes da viagem de '+mins(item.durationMinutes)}>
   <div className="vt-itinerary-head"><div><strong>{mins(item.durationMinutes)}</strong><span>{ptTime(item.departure)} → {ptTime(item.arrival)}</span></div>
   <ChevronDown className={selected?'is-open':''} size={20}/></div>
   <div className="vt-route-pills">{item.legs.map((leg,i)=>{
    const Icon=transportIcon[leg.mode]||BusFront;
    return <span key={i} className={'vt-route-pill '+(leg.transit?'is-transit':'')} style={leg.lineColor?{'--vt-mode-color':leg.lineColor}:{}}><Icon size={16}/>{leg.transit&&<b>{leg.line||modeLabel[leg.mode]}</b>}</span>;
   })}</div>
   <div className="vt-itinerary-foot"><span>{item.transfers} {item.transfers===1?'baldeação':'baldeações'}</span><span>{item.boardings??item.legs.filter(l=>l.transit).length} embarques</span><span>{meters(item.walkMeters)} a pé</span></div>
   <div className="vt-trip-footer"><strong className={fareLabel?'is-verified':''}>{fareLabel||'Tarifa não informada'}</strong><span>{item.realtime?'Previsão da operadora · atualização não verificada':'Horários programados'}</span></div>
  </button>
  {selected&&<div className="vt-itinerary-details">
   <div className="vt-timeline-start"><MapPin size={16}/> Partida · {ptTime(item.departure)}</div>
   {item.legs.map((leg,i)=><Segment key={i} leg={leg}/>)}
   <div className="vt-timeline-start"><MapPin size={16}/> Chegada · {ptTime(item.arrival)}</div>
   <small className="vt-transit-disclaimer">Confira linha e plataforma antes de embarcar. Uma previsão da operadora não garante atualização recente nem pontualidade.</small>
  </div>}
 </article>;
}
export default function TransitPage(){
 const location=useLocation();
 const [from,setFrom]=useState(()=>location.state?.from||null),[to,setTo]=useState(()=>location.state?.to||null),[sort,setSort]=useState('economy');
 const [depart,setDepart]=useState(''),[coverage,setCoverage]=useState(null);
 const [result,setResult]=useState(null),[selected,setSelected]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{api('/transit/capabilities').then(setCoverage).catch(()=>setCoverage({enabled:false,coverage:[]}));},[]);
 useEffect(()=>{setResult(null);setSelected(0);},[from?.coords?.join(','),to?.coords?.join(','),depart]);
 const search=async(e)=>{
  e.preventDefault();if(!from||!to)return;
  setLoading(true);setError('');setResult(null);setSelected(0);
  try{
   const request={origin:from.coords,destination:to.coords,sort,...(depart?{departAt:new Date(depart).toISOString()}:{})};
   const response=await post('/transit/plan',request);setResult(response);
   if(!response.itineraries?.length)setError('Nenhuma viagem disponível neste horário. Experimente outra data ou estação.');
  }catch(e){setError(e.message||'Não foi possível calcular esta viagem.');}
  finally{setLoading(false);}
 };
 const itinerary=result?.itineraries?.[selected]||null;
 return <main className="vt-page">
  <header className="vt-header">
   <Link to="/mapa" className="vt-back" aria-label="Voltar ao mapa"><ArrowLeft size={21}/></Link>
   <div className="vt-brand">VANO<span>.</span></div>
   <span className="vt-header-tag">Transporte público <i>Beta</i></span>
  </header>
  <div className="vt-workspace">
   <section className="vt-panel" aria-label="Planejamento de transporte público">
    <div className="vt-intro"><span className="vt-eyebrow">VANO / TRANSIT</span><h1>O melhor caminho é o que funciona para você.</h1>
    <p>Compare o custo quando houver tarifa verificada, tempo total, integrações e caminhadas.</p></div>
    <form onSubmit={search} className="vt-search-form">
     <div className="vt-place-stack">
      <PlaceSearch label="Origem" selected={from} onSelect={setFrom} allowGps/>
      <button type="button" className="vt-swap" onClick={()=>{setFrom(to);setTo(from);}} aria-label="Inverter origem e destino" title="Inverter origem e destino"><ArrowRightLeft size={17}/></button>
      <PlaceSearch label="Destino" selected={to} onSelect={setTo}/>
     </div>
     <div className="vt-options">
      <label><CalendarClock size={17}/> Partida
       <input type="datetime-local" value={depart} onChange={e=>setDepart(e.target.value)}/>
       {!depart&&<span className="vt-now">Agora</span>}
      </label>
     </div>
     <div className="vt-preference" role="group" aria-label="Preferência da viagem">
      <span>O que é mais importante?</span>
      <div className="vt-preference-tabs">{sorts.map(([id,label,description,Icon])=><button type="button" key={id} className={sort===id?'is-selected':''} aria-pressed={sort===id} onClick={()=>{setSort(id);setResult(null);setSelected(0);}}>
        <Icon size={19}/><strong>{label}</strong><small>{description}</small>
      </button>)}</div>
     </div>
     <button className="vt-submit" type="submit" disabled={!from||!to||loading||coverage?.enabled!==true}>
       {loading?<RefreshCw size={18} className="vt-rotate"/>:<Route size={19}/>}
       {loading?'Calculando conexões…':'Encontrar viagens'} <ArrowRight size={18}/>
     </button>
    </form>
    {coverage?.enabled===false&&<div className="vt-notice" role="status">O mecanismo está preparado, mas as fontes regionais de horários ainda precisam ser ativadas. Nenhum horário será inventado.</div>}
    {coverage?.enabled&&<div className="vt-region-note">Cobertura atual: {coverage.coverage.map(x=>x.name).join(' · ')}</div>}
    {error&&<div className="vt-error" role="alert">{error}</div>}
    {result?.itineraries?.length>0&&<section className="vt-results" aria-label="Viagens encontradas">
     <div className="vt-results-heading"><h2>{result.itineraries.length} alternativas</h2><span>{result.coverage?.name}</span></div>
     {sort==='economy'&&<p className="vt-fare-explanation" role="status">{result.comparison==='verified_fares'?'Organizadas por tarifa informada pelas operadoras. Consulte as condições do bilhete.':'Sem preços comparáveis para todas as rotas: ordenamos por menos embarques, sem afirmar qual é mais barata.'}</p>}
     {result.itineraries.map((item,i)=><ItineraryCard item={item} key={item.id+i} selected={i===selected} onSelect={()=>setSelected(i)}/>)}
    </section>}
    {!result&&!error&&<div className="vt-empty-result"><Clock3 size={19}/> Resultados mostram apenas itinerários respaldados pelos horários disponíveis.</div>}
   </section>
   <section className="vt-map-panel" aria-label="Visualização do itinerário">
    <TransitMap itinerary={itinerary} origin={from} destination={to}/>
    <div className="vt-map-heading"><span>Visualização da viagem</span><small>{itinerary?'Trajeto selecionado':'Explore seu próximo destino'}</small></div>
   </section>
  </div>
 </main>;
}
