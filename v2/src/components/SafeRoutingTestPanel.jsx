import React,{useState} from 'react';
import {api} from '../lib/api';
export default function SafeRoutingTestPanel(){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState('');
 async function compare(){
  setBusy(true);setError('');
  try{setResult(await api('/admin/safe-routing/compare',{method:'POST',body:{origin:[-46.6557,-23.5615],destination:[-46.6597,-23.5874]}}));}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="v3-admin-panel" aria-label="Teste privado de contexto urbano">
  <div className="v3-admin-panel-head"><div><h2>Teste de contexto urbano</h2><small>MASP → Parque Ibirapuera · carro · alternativas reais do provedor</small></div>
   <button type="button" onClick={compare} disabled={busy}>{busy?'Comparando…':'Comparar rotas de teste'}</button></div>
  <p>Consulta iluminação, vias, calçadas, faixas de ônibus, risco hidrológico e histórico de alagamentos no B2. Dados cadastrais não confirmam condições atuais.</p>
  {error&&<p role="alert">{error}</p>}
  {result&&<div aria-live="polite">
   <p>{result.queriedTiles} áreas consultadas · {result.inventoryPoints.toLocaleString('pt-BR')} pontos cadastrados disponíveis.</p>
   {result.comparisons.map(item=>{
    const route=result.routes.find(r=>r.id===item.id);
    return <p key={item.id}><strong>Alternativa {item.id}</strong>: {route?.duration} min · {route?.distance} km · {Math.round(item.fixtureProximityFraction*100)}% das amostras próximas a pontos cadastrados.</p>;
   })}
   {result.infrastructure&&<>
    <p>Consulta: {new Date(result.infrastructure.requestedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · São Paulo</p>
    {Object.entries(result.infrastructure.layers).map(([key,layer])=><div key={key}>
     <h3>{{roads:'Vias cadastradas',sidewalks:'Calçadas cadastradas',busLanes:'Faixas de ônibus',hydrologicalRisk:'Risco hidrológico cadastrado',floodHistory:'Ocorrências históricas de alagamento'}[key]}</h3>
     <small>{layer.sourceFeatures.toLocaleString('pt-BR')} registros na fonte · {layer.queriedFeatures.toLocaleString('pt-BR')} na área consultada · {layer.rejected} rejeitados</small>
     {layer.comparisons.map(c=><div key={c.id}>
      <p>Alternativa {c.id}: {c.matchedFeatures} feições próximas/intersectadas · {c.nearSamples}/{c.assessedSamples} amostras ({c.radiusMeters} m).</p>
      {c.details.length>0&&<details><summary>Atributos públicos encontrados (até 12)</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(c.details,null,2)}</pre></details>}
     </div>)}
    </div>)}
    <p>{result.infrastructure.warning}</p>
   </>}
   <small>Resultado experimental para conferência. A navegação atual continua com a seleção original do provedor.</small>
  </div>}
 </section>;
}
