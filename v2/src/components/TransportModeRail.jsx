import React from 'react';
import {CarFront,Footprints} from 'lucide-react';
import MotorcycleIcon from './MotorcycleIcon.jsx';
import {fmtTime} from '../lib/api';

const MODES=[
  {id:'carro',name:'Carro',Icon:CarFront},
  {id:'moto',name:'Moto',Icon:MotorcycleIcon},
  {id:'a-pe',name:'A pé',Icon:Footprints}
];

function etaText(estimate,isPublic){
  if(isPublic)return 'Ver opções';
  if(estimate?.status==='loading')return 'Calculando…';
  if(estimate?.status==='unavailable')return 'Indisponível';
  if(Number.isFinite(estimate?.seconds)&&estimate.seconds>0)return fmtTime(estimate.seconds);
  return 'Consultar';
}

export default function TransportModeRail({selected,onSelect,onPublic,estimates={},disabled=false,compact=false}){
  return <div className={'v3-mode-rail'+(compact?' is-compact':'')} role="group" aria-label="Como você vai?">
    {MODES.map(({id,name,Icon})=>{
      const isPublic=id==='publico',active=selected===id;
      return <button key={id} type="button" className={'v3-mode-option'+(active?' is-active':'')}
        onClick={()=>isPublic?onPublic?.():onSelect?.(id)} disabled={disabled}
        aria-pressed={active} aria-label={isPublic?'Ver rotas de transporte público':`Calcular rota de ${name}`}>
        <Icon size={compact?23:28} strokeWidth={1.85} aria-hidden="true"/>
        <strong>{name}</strong>
        <small aria-live="off">{etaText(estimates[id],isPublic)}</small>
      </button>;
    })}
  </div>;
}
