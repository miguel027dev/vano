import React,{useState} from 'react';
import {MapPin,Flag,CheckCircle2} from 'lucide-react';
import {useVano} from '../context';
import {PageHeader,Section,Notice,Empty} from '../components/Ui';
import {timeAgo} from '../lib/api';
import {REPORT_TYPES,reportIconSvg,reportType} from '../lib/communityReports.js';
import '../community-reports.css';

export function ReportsPage(){
  const {reports=[],report}=useVano();
  const [type,setType]=useState('via_fechada');
  const [description,setDescription]=useState('');
  const [coords,setCoords]=useState(null);
  const [done,setDone]=useState(false);
  const [locating,setLocating]=useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  function locate(){
    setLocating(true);setDone(false);setError('');
    if(!navigator.geolocation){setLocating(false);setError('GPS não disponível neste dispositivo.');return;}
    navigator.geolocation.getCurrentPosition(
      position=>{setCoords([position.coords.longitude,position.coords.latitude]);setLocating(false);},
      ()=>{setLocating(false);setError('Permita o acesso à localização para registrar uma ocorrência.');},
      {enableHighAccuracy:true,timeout:10000,maximumAge:5000}
    );
  }
  async function send(event){
    event.preventDefault();
    if(!coords||sending)return;
    setSending(true);setError('');setDone(false);
    try{
      await report({type,description,coords});
      setDone(true);setDescription('');setCoords(null);
    }catch(cause){
      setError(cause?.message||'Não foi possível registrar. Tente novamente.');
    }finally{setSending(false);}
  }
  return <main className="content-page">
    <PageHeader title="Ocorrências" subtitle="Ajude a comunidade com informações sobre as vias."/>
    <Notice kind="warning">Relatos aparecem como não verificados e podem estar desatualizados. Registre somente quando estiver parado e em segurança, sem incluir dados pessoais.</Notice>
    <div className="report-split">
      <form className="form-panel" onSubmit={send}>
        <h2>Registrar ocorrência</h2>
        <p>O alerta aparecerá no mapa de quem se aproximar do local.</p>
        <div className="report-kinds vano-report-grid" role="group" aria-label="Tipo de ocorrência">
          {REPORT_TYPES.map(item=><button type="button" key={item.id}
            className={type===item.id?'active':''}
            style={{'--community-pin-color':item.color}}
            aria-pressed={type===item.id} onClick={()=>{setType(item.id);setDone(false);}}>
            <span className="report-glyph" dangerouslySetInnerHTML={{__html:reportIconSvg(item.id)}}/>
            <span>{item.name}</span>
          </button>)}
        </div>
        <label>Descrição (opcional)
          <textarea rows={3} maxLength={150} value={description} onChange={e=>setDescription(e.target.value)}
            placeholder="Descreva a condição da via, sem informações pessoais."/>
        </label>
        <button type="button" className="btn btn-muted" disabled={locating||sending} onClick={locate}>
          <MapPin size={18}/>{locating?'Localizando…':coords?'Localização selecionada':'Usar minha localização'}
        </button>
        <p className="vano-report-help">A localização exibida aos demais será aproximada. O alerta expira automaticamente conforme o tipo e desaparece do seu mapa quando você se afasta.</p>
        <button type="submit" className="btn btn-primary" disabled={!coords||locating||sending}>
          <Flag size={18}/>{sending?'Enviando…':'Publicar ocorrência'}
        </button>
        {error&&<p className="vano-report-error" role="alert">{error}</p>}
        {done&&<div className="form-success" role="status"><CheckCircle2 size={18}/>Ocorrência publicada como não verificada.</div>}
      </form>
      <Section title="Seus alertas recentes" subtitle="Relatos desta conta e ocorrências verificadas">
        {reports.length?<div className="list-card">{reports.map(item=>{
          const kind=reportType(item.type);
          return <div key={item.id} className="report-row">
            <span className="report-row-icon" style={{'--community-pin-color':kind?.color||'#a08a80'}}
              dangerouslySetInnerHTML={{__html:reportIconSvg(item.type)}}/>
            <div>
              <strong>{kind?.name||'Ocorrência'}</strong>
              <p>{item.description||'Sem descrição.'}</p>
              <small>{timeAgo(item.createdAt)} · {item.status==='verificado'?'Verificado':'Não verificado'}</small>
            </div>
          </div>;
        })}</div>:<Empty icon={Flag} title="Nenhum alerta registrado" subtitle="Seus relatos aparecerão aqui depois de publicados."/>}
      </Section>
    </div>
  </main>;
}
