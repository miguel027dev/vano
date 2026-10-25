import React from 'react';
import {ArrowLeft,CarFront,Footprints,Navigation,ShieldCheck,Zap} from 'lucide-react';
import MotorcycleIcon from './MotorcycleIcon';
import {fmtKm,fmtTime} from '../lib/api';
import '../b1-route-sheet.css';

function arrivalLabel(seconds){
  const duration=Number(seconds);
  if(!Number.isFinite(duration)||duration<0)return '';
  const clock=new Date(Date.now()+duration*1000);
  return 'Chegada '+clock.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

// This only displays the choices. The parent MapPage remains the single
// authority for GPS, route requests, preferred mode and navigation.
export default function B1RouteSheet({step,vehicle,routeData,choice,loading,error,language,onVehicle,onChoice,onStart,onBack,onRetry}){
  const options=Array.isArray(routeData?.routes)?routeData.routes:[];
  const selected=options.find(item=>item.id===choice)||options[0]||null;
  const fastest=options.find(item=>item.id==='fast')||options[0]||null;
  const safest=options.find(item=>item.id==='safe')||null;
  return <section className="b1-route-sheet" aria-label={step==='transport'?'Selecionar transporte':'Escolher prioridade da rota'}>
    <div className="b1-grab" aria-hidden="true"/>
    {step==='transport'?<>
      <div className="b1-sheet-heading">
        <div><h2>Como você vai?</h2><p>Escolha seu meio de transporte</p></div>
        <button type="button" className="b1-back" onClick={onBack} aria-label="Alterar endereço"><ArrowLeft size={20}/></button>
      </div>
      <div className="b1-transport-grid" role="group" aria-label="Como você vai">
        <button type="button" onClick={()=>onVehicle('carro')}><CarFront size={34} strokeWidth={1.9}/><span>Carro</span></button>
        <button type="button" onClick={()=>onVehicle('moto')}><MotorcycleIcon size={35}/><span>Moto</span></button>
        <button type="button" onClick={()=>onVehicle('a-pe')}><Footprints size={33} strokeWidth={1.9}/><span>A pé</span></button>
      </div>
    </>:<>
      <div className="b1-sheet-heading"><div><h2>Escolha sua prioridade</h2><p>{vehicle==='a-pe'?'Trajeto para caminhada':'Como prefere chegar?'}</p></div>
        <button className="b1-back" type="button" onClick={onBack} aria-label="Escolher outro transporte"><ArrowLeft size={20}/></button>
      </div>
      {loading?<div className="b1-route-wait" role="status"><span className="b1-spinner"/>Preparando seu trajeto…</div>:error&&!selected?<div className="b1-route-error" role="status" aria-label="Trajeto ainda não disponível"><button type="button" onClick={onRetry}>Tentar novamente</button></div>:selected?<div className="b1-preview-details">
        <div className="b1-priority-grid" role="group" aria-label="Prioridade de rota">
          <button type="button" className={choice===fastest?.id?'is-active':''} onClick={()=>fastest&&onChoice(fastest.id)} disabled={!fastest}
            aria-pressed={choice===fastest?.id}><Zap size={19} strokeWidth={2.2}/><span>{vehicle==='a-pe'?'Caminhada':'Mais rápida'}</span></button>
          {vehicle!=='a-pe'&&<button type="button" className={choice==='safe'?'is-active':''} onClick={()=>safest&&onChoice(safest.id)} disabled={!safest}
            aria-pressed={choice==='safe'} title={safest&&!safest.verifiedSafety?'Dados de segurança limitados':'Priorizar segurança'}><ShieldCheck size={19} strokeWidth={2.1}/><span>Mais segura</span></button>}
        </div>
        <div className="b1-trip-facts"><div><strong>{fmtTime(selected.duration)}</strong><small>{fmtKm(selected.distance,language)}</small></div><span>{arrivalLabel(selected.duration)}</span></div>
        <button type="button" className="b1-start-navigation" onClick={onStart}><Navigation size={20} fill="currentColor" strokeWidth={1.5}/><span>Iniciar navegação</span></button>
      </div>:null}
    </>}
  </section>;
}
