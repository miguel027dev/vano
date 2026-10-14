import React,{useRef,useState} from 'react';
import {ArrowRight,BusFront,ChevronDown,ChevronUp,Clock3,Footprints,Layers3,LocateFixed,MapPin,Ship,TrainFront,TramFront,Wallet,Zap,Pencil,ArrowLeft} from 'lucide-react';
import {Link} from 'react-router-dom';
import TransitMap from './TransitMap.jsx';

const modeIcons={walk:Footprints,bus:BusFront,metro:TrainFront,train:TrainFront,tram:TramFront,ferry:Ship};
const categoryName={walk:'Caminhada',bus:'Ônibus',metro:'Metrô',train:'Trem',tram:'VLT',ferry:'Barco'};
const tripTime=iso=>iso?new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—';
const mins=n=>Number.isFinite(n)?n>=60?Math.floor(n/60)+' h '+String(Math.round(n%60)).padStart(2,'0')+' min':Math.round(n)+' min':'—';
const number=n=>Number.isFinite(n)?Math.round(n):0;
const fare=f=>{if(!f?.verified||!Number.isFinite(f.amount))return null;try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:f.currency}).format(f.amount);}catch{return null;}};

function LegChip({leg,index}){
 const Icon=modeIcons[leg.mode]||BusFront;
 const label=leg.transit?[categoryName[leg.mode]||'Transporte',leg.line].filter(Boolean).join(' '):'A pé';
 return <div className="vt-preview-chip" aria-label={label} style={leg.lineColor?{'--vt-chip':leg.lineColor}:undefined}>
  <span className="vt-preview-chip-icon"><Icon size={16}/></span>
  <span className="vt-preview-chip-label"><strong>{label}</strong><small>{mins(Math.round((leg.durationSeconds||0)/60))}</small></span>
 </div>;
}
function LegDetail({leg}){
 const Icon=modeIcons[leg.mode]||BusFront;
 return <div className="vt-preview-leg" style={leg.lineColor?{'--vt-chip':leg.lineColor}:undefined}>
   <span className="vt-preview-leg-icon"><Icon size={17}/></span>
   <div><strong>{leg.transit?[categoryName[leg.mode]||'Transporte público',leg.line].filter(Boolean).join(' '):'Caminhada'}</strong>
    <small>{leg.from?.name||'Origem do trecho'} → {leg.to?.name||'Destino do trecho'}</small>
    <small>{tripTime(leg.departure?.estimated||leg.departure?.scheduled)} – {tripTime(leg.arrival?.estimated||leg.arrival?.scheduled)} · {mins(Math.round((leg.durationSeconds||0)/60))}</small>
   </div>
 </div>;
}
export default function TransitJourneyPreview({itinerary,alternatives=[],selected=0,onSelect,onEdit,from,to,sort}){
 const [expanded,setExpanded]=useState(false),[style,setStyle]=useState('satellite');
 const mapControl=useRef(null);
 const segments=itinerary.legs||[];
 const price=fare(itinerary.fare);
 return <section className="vt-preview-stage" aria-label="Prévia da viagem em transporte público">
  <TransitMap itinerary={itinerary} origin={from} destination={to} overview style={style} controller={mapControl}/>
  <div className="vt-preview-top">
   <div className="vt-preview-location" aria-label="Origem e destino">
    <div><span className="vt-preview-marker is-a">A</span><strong>{from?.name||'Origem'}</strong></div>
    <div><span className="vt-preview-marker is-b">B</span><strong>{to?.name||'Destino'}</strong></div>
   </div>
   <button type="button" className="vt-preview-edit" aria-label="Editar origem, destino ou horário" onClick={onEdit}><Pencil size={18}/><span>Editar</span></button>
   <div className="vt-preview-top-metrics">
    <span><Clock3 size={15}/><strong>{mins(itinerary.durationMinutes)}</strong> duração</span>
    <span><ArrowRight size={15}/><strong>{number(itinerary.transfers)}</strong> baldeações</span>
    <span><Footprints size={15}/><strong>{number(itinerary.walkMeters)} m</strong> a pé</span>
   </div>
  </div>
  <div className="vt-preview-map-actions" aria-label="Controles do mapa">
   <button type="button" aria-label="Enquadrar toda a viagem" title="Enquadrar trajeto" onClick={()=>mapControl.current?.recenter?.()}><LocateFixed size={20}/></button>
   <button type="button" aria-label={style==='satellite'?'Ver mapa de ruas':'Ver satélite'} title="Trocar estilo do mapa" onClick={()=>setStyle(s=>s==='satellite'?'streets':'satellite')}><Layers3 size={20}/></button>
  </div>
  <div className={'vt-preview-dock '+(expanded?'is-expanded':'')}>
   <div className="vt-preview-dock-handle" aria-hidden="true"/>
   <div className="vt-preview-dock-top">
     <div><strong>{tripTime(itinerary.arrival)}</strong><small>Chegada</small></div>
     <div><strong>{mins(itinerary.durationMinutes)}</strong><small>Tempo total</small></div>
     <div><strong>{number(itinerary.transfers)}</strong><small>Integrações</small></div>
     <button className="vt-preview-details-btn" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
       {expanded?<ChevronDown size={18}/>:<ChevronUp size={18}/>}<span>{expanded?'Menos':'Detalhes'}</span>
     </button>
   </div>
   <div className="vt-preview-sequence" aria-label="Sequência de transportes">
    {segments.map((leg,i)=><React.Fragment key={i}><LegChip leg={leg} index={i}/>{i<segments.length-1&&<ArrowRight size={14} className="vt-preview-seq-arrow" aria-hidden="true"/>}</React.Fragment>)}
   </div>
   <div className="vt-preview-footer-note">
     <span>{price?price+' · tarifa informada':'Tarifa não informada'}</span>
     <span>{sort==='economy'?'Prioridade: econômica':'Prioridade: mais rápida'}</span>
   </div>
   {expanded&&<div className="vt-preview-expanded" aria-label="Etapas e alternativas">
     <h2>Etapas da viagem</h2>
     {segments.map((leg,i)=><LegDetail leg={leg} key={i}/>)}
     <p>Horários e trajetos vêm das operadoras integradas. Consulte placas e plataformas ao embarcar.</p>
     {alternatives.length>1&&<div className="vt-preview-alternatives">
       <h2>Outras viagens</h2>
       {alternatives.map((item,i)=><button type="button" key={item.id||i} className={selected===i?'is-selected':''} aria-pressed={selected===i} onClick={()=>onSelect(i)}>
          <span>Opção {i+1}</span><strong>{mins(item.durationMinutes)}</strong><small>{number(item.transfers)} baldeações</small>
        </button>)}
     </div>}
   </div>}
  </div>
 </section>;
}
