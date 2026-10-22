import React,{useEffect,useState} from 'react';
import {api} from '../lib/api.js';

/** Dedicated authenticated source diagnostics; no route or audit catalog mutation. */
export default function TrafficPipelineHealth(){
 const [pipeline,setPipeline]=useState(null),[pipelineError,setPipelineError]=useState(''),[pipelineBusy,setPipelineBusy]=useState(false);
 async function refreshPipeline(){
  if(pipelineBusy)return;
  setPipelineBusy(true);setPipelineError('');
  try{setPipeline(await api('/admin/traffic-pipeline-status'));}
  catch{setPipelineError('Não foi possível atualizar os provedores.');}
  finally{setPipelineBusy(false);}
 }
 useEffect(()=>{
  let cancelled=false;
  api('/admin/traffic-pipeline-status').then(data=>{if(!cancelled)setPipeline(data);})
   .catch(()=>{if(!cancelled)setPipelineError('Status do pipeline indisponível.');});
  return()=>{cancelled=true;};
 },[]);

 return <React.Fragment>
   <div className="v2-road-pipeline" aria-label="Estado do pipeline de trânsito">
    <div className="v2-road-pipeline-head"><strong>Fontes de trânsito · diagnóstico</strong>
     <button type="button" disabled={pipelineBusy} onClick={()=>void refreshPipeline()}>{pipelineBusy?'Atualizando…':'Atualizar'}</button>
    </div>
    {pipelineError&&<small role="status">{pipelineError}</small>}
    {pipeline&&<div className="v2-road-pipeline-grid">
     <div><b>TomTom (trechos ao vivo)</b><span>{pipeline.sources.tomtom.configured?
       pipeline.sources.tomtom.circuitOpen?'Em espera por erro/cota':
       pipeline.sources.tomtom.lastSuccessAt?'Última coleta aceita':'Configurado · sem leitura aceita':
       'Não configurado'}</span>
      <small>{pipeline.sources.tomtom.callsToday}/{pipeline.sources.tomtom.dailyLimit} consultas hoje ·
        cache {pipeline.sources.tomtom.cacheEntries} · sucesso {pipeline.sources.tomtom.providerSuccesses}</small>
     </div>
     <div><b>Mapbox Traffic</b><span>Camada visual · atualização do provedor ~8 min</span>
      <small>Não existe medição bruta própria neste servidor</small>
     </div>
     <div><b>SPTrans</b><span>{pipeline.sources.sptrans.online?'Disponível':
       pipeline.sources.sptrans.error||'Sem observações'}</span>
      <small>Somente diagnóstico; não altera rotas</small>
     </div>
     <div><b>Histórico de velocidade</b><span>{pipeline.sources.historical.verifiedProfiles} perfis verificados</span>
      <small>Modo {pipeline.sources.historical.mode} · sem extrapolar horários ausentes</small>
     </div>
    </div>}
    <p className="v2-road-audit-foot">Status agregado, sem armazenar GPS de usuários. Dados de fluxo TomTom não são gravados para treinamento ou histórico. Previsões futuras dependem de dados licenciados e validação.</p>
   </div>

 </React.Fragment>;
}
