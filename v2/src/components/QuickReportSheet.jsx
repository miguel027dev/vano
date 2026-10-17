import React,{useEffect,useRef,useState} from 'react';
import {AlertTriangle,Check,CheckCircle2,ChevronLeft,LocateFixed,MapPin,X} from 'lucide-react';
import {REPORT_TYPES,reportIconSvg,reportType} from '../lib/communityReports.js';
import '../community-reports.css';

export default function QuickReportSheet({onClose,onSubmit,readPosition,onRetryLocation,moving=false}){
  const [type,setType]=useState(null),[sending,setSending]=useState(false);
  const [done,setDone]=useState(false),[error,setError]=useState('');
  const panel=useRef(null),firstChoice=useRef(null),confirmation=useRef(null),closeTimer=useRef(null),busy=useRef(false);
  const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
  const location=readPosition();
  useEffect(()=>{
    firstChoice.current?.focus({preventScroll:true});
    const key=event=>{
      if(event.key==='Escape'){event.preventDefault();if(!busy.current)onCloseRef.current();}
      if(event.key!=='Tab'||!panel.current)return;
      const focusable=[...panel.current.querySelectorAll('button:not([disabled])')];
      const index=focusable.indexOf(document.activeElement);
      if(event.shiftKey&&index<=0){event.preventDefault();focusable.at(-1)?.focus();}
      else if(!event.shiftKey&&index===focusable.length-1){event.preventDefault();focusable[0]?.focus();}
    };
    window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('keydown',key);clearTimeout(closeTimer.current);};
  },[]);
  useEffect(()=>{if(type&&!done)confirmation.current?.focus({preventScroll:true});},[type]);
  async function confirm(){
    if(busy.current||!type||done||moving)return;
    const latest=readPosition();
    if(!latest.coords){setError(latest.reason||'GPS indisponível.');return;}
    busy.current=true;setSending(true);setError('');
    try{
      await onSubmit({type,coords:latest.coords,description:''});
      setDone(true);
      closeTimer.current=setTimeout(()=>onCloseRef.current(),1900);
    }catch(failure){setError(failure?.message||'Não foi possível enviar a ocorrência.');}
    finally{busy.current=false;setSending(false);}
  }
  return <div className="vano-quick-report-shell" onPointerDown={event=>{if(event.target===event.currentTarget&&!busy.current)onClose();}}>
    <section ref={panel} className="vano-quick-report-card" role="dialog" aria-modal="true" aria-labelledby="vano-quick-report-title" aria-describedby="vano-quick-report-description">
      <header className="vano-quick-report-head">
        <div className="vano-quick-report-head-icon" aria-hidden="true"><AlertTriangle size={19} strokeWidth={2.1}/></div>
        <div><small>ALERTA COLABORATIVO</small><h2 id="vano-quick-report-title">{done?'Ocorrência enviada':type?'Confirmar ocorrência':'O que está acontecendo?'}</h2></div>
        <button type="button" className="vano-quick-report-close" aria-label="Fechar ocorrências" disabled={sending} onClick={onClose}><X size={21}/></button>
      </header>
      <p id="vano-quick-report-description" className="vano-quick-report-intro">
        {done?'Obrigado por colaborar com a comunidade.':
          type?'Confira o tipo selecionado e publique usando sua localização atual.':
          'Selecione a ocorrência que você deseja informar.'}
      </p>
      {done?<div className="vano-quick-report-success" role="status"><CheckCircle2 size={36}/><strong>Relato publicado!</strong><span>Outros usuários próximos poderão visualizar o alerta como não verificado.</span></div>:
      !type?<div className="vano-quick-report-options" role="group" aria-label="Escolha o tipo de ocorrência">
        {REPORT_TYPES.map((item,index)=><button type="button" key={item.id} ref={index===0?firstChoice:null}
          className="vano-quick-report-option" style={{'--community-pin-color':item.color}}
          onClick={()=>{setType(item.id);setError('');}}>
          <span className="vano-quick-report-option-icon" dangerouslySetInnerHTML={{__html:reportIconSvg(item.id)}}/>
          <span>{item.name}</span>
        </button>)}
      </div>:
      <>
        <div className="vano-quick-report-selected" style={{'--community-pin-color':reportType(type)?.color}}>
          <span className="vano-quick-report-selected-icon" dangerouslySetInnerHTML={{__html:reportIconSvg(type)}}/>
          <strong>{reportType(type)?.name}</strong><Check size={18}/>
        </div>
        <div className="vano-quick-report-location">
          <MapPin size={19} aria-hidden="true"/>
          <div><strong>Sua localização atual</strong><span>{location.coords?'GPS pronto · ponto capturado ao confirmar':location.reason}</span></div>
          {location.coords?<CheckCircle2 className="vano-quick-report-gps-ok" size={20}/>:<button type="button" className="vano-quick-report-retry" onClick={onRetryLocation}><LocateFixed size={17}/>Atualizar</button>}
        </div>
        <p className="vano-quick-report-safety"><AlertTriangle size={15} aria-hidden="true"/>
          {moving?'Você está em movimento. Pare em segurança antes de publicar.':
           'Registre somente quando estiver parado e em segurança. Local aproximado para a comunidade.'}
        </p>
        {error&&<p className="vano-quick-report-error" role="alert">{error}</p>}
        <div className="vano-quick-report-actions">
          <button type="button" className="vano-quick-report-back" disabled={sending} onClick={()=>{setType(null);setError('');}}><ChevronLeft size={18}/> Voltar</button>
          <button ref={confirmation} type="button" className="vano-quick-report-confirm" disabled={sending||!location.coords||moving} onClick={()=>void confirm()}>
            <Check size={19}/> {sending?'Publicando…':'Confirmar e publicar'}
          </button>
        </div>
      </>}
    </section>
  </div>;
}
