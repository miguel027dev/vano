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
  <p>Consulta o inventário GeoSampa armazenado no B2 para cada alternativa. Funcionamento da iluminação e associação à rua precisam de validação.</p>
  {error&&<p role="alert">{error}</p>}
  {result&&<div aria-live="polite">
   <p>{result.queriedTiles} áreas consultadas · {result.inventoryPoints.toLocaleString('pt-BR')} pontos cadastrados disponíveis.</p>
   {result.comparisons.map(item=>{
    const route=result.routes.find(r=>r.id===item.id);
    return <p key={item.id}><strong>Alternativa {item.id}</strong>: {route?.duration} min · {route?.distance} km · {Math.round(item.fixtureProximityFraction*100)}% das amostras próximas a pontos cadastrados.</p>;
   })}
   <small>Resultado experimental para conferência. A navegação atual continua com a seleção original do provedor.</small>
  </div>}
 </section>;
}
