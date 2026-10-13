import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeftRight,ArrowRight,Bot,CarFront,Check,Download,FileJson,MapPin,Play,Route as RouteIcon,Search,ShieldCheck,SlidersHorizontal,X,Zap} from 'lucide-react';
import '../benchmark-page.css';

const API='/api/benchmark/v1';
const PRESETS=[
 {id:'morumbi-paulista',title:'Morumbi → Paulista',from:{label:'Shopping Morumbi, São Paulo',coords:[-46.6987,-23.6223]},to:{label:'MASP, Av. Paulista, São Paulo',coords:[-46.6557,-23.5615]}},
 {id:'congonhas-paulista',title:'Congonhas → Paulista',from:{label:'Aeroporto de Congonhas',coords:[-46.6566,-23.6263]},to:{label:'MASP, Av. Paulista, São Paulo',coords:[-46.6557,-23.5615]}},
 {id:'faria-ibirapuera',title:'Faria Lima → Ibirapuera',from:{label:'Avenida Faria Lima, São Paulo',coords:[-46.6883,-23.5731]},to:{label:'Parque Ibirapuera, São Paulo',coords:[-46.6597,-23.5874]}}
];
const MODELS=[{id:'fastest',name:'Mais rápida',description:'Menor tempo previsto',icon:Zap,color:'#287add'},
 {id:'safest',name:'Segura / alternativa',description:'Segurança depende de evidências',icon:ShieldCheck,color:'#149c82'},
 {id:'smart',name:'VANO inteligente',description:'Roteamento avançado',icon:RouteIcon,color:'#f07136'},
 {id:'quietest',name:'Mais tranquila',description:'Outra prioridade de rota',icon:SlidersHorizontal,color:'#936be7'}];
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
const fmt=(n,d=1)=>finite(n)===null?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d});
const median=arr=>{const x=arr.filter(n=>finite(n)!==null).sort((a,b)=>a-b);if(!x.length)return null;const mid=Math.floor(x.length/2);return x.length%2?x[mid]:(x[mid-1]+x[mid])/2;};
const percentile=(arr,p)=>{const x=arr.filter(n=>finite(n)!==null).sort((a,b)=>a-b);if(!x.length)return null;const n=(x.length-1)*p,a=Math.floor(n),b=Math.ceil(n);return x[a]+(x[b]-x[a])*(n-a);};
function parseCoordinates(raw){
 const match=String(raw||'').trim().match(/^(-?\d{1,2}(?:\.\d{1,7})?)\s*[,;]\s*(-?\d{1,3}(?:\.\d{1,7})?)$/);
 if(!match)return null;
 const lat=Number(match[1]),lon=Number(match[2]);
 return lat>=-90&&lat<=90&&lon>=-180&&lon<=180?[lon,lat]:null;
}
async function getJson(url,{signal}={}){
 const response=await fetch(url,{headers:{Accept:'application/json'},credentials:'same-origin',signal});
 let data;try{data=await response.json();}catch{throw Error('O servidor não retornou JSON válido.');}
 if(!response.ok||data?.ok===false){const e=new Error(data?.message||data?.error||'Serviço indisponível.');e.status=response.status;throw e;}
 return data;
}
function PointField({kind,title,value,onChange,chosen,onChoose,disabled}){
 const [suggestions,setSuggestions]=useState([]),[loading,setLoading]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{
  if(!open||chosen||value.trim().length<3||parseCoordinates(value)){setSuggestions([]);setLoading(false);return;}
  const controller=new AbortController(),timer=setTimeout(()=>{
   setLoading(true);
   getJson('/api/search?'+new URLSearchParams({q:value.trim(),lang:'pt-BR'}),{signal:controller.signal})
    .then(data=>setSuggestions(Array.isArray(data)?data.filter(x=>Array.isArray(x.coords)).slice(0,6):[]))
    .catch(()=>{if(!controller.signal.aborted)setSuggestions([]);})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },300);
  return()=>{clearTimeout(timer);controller.abort();};
 },[value,open,chosen]);
 return <div className="vb-field vb-location">
  <label htmlFor={'benchmark-'+kind}>{title}</label>
  <div className="vb-search-wrap">
   <MapPin size={17} aria-hidden="true" className={kind==='destination'?'vb-dest-pin':''}/>
   <input id={'benchmark-'+kind} data-testid={'benchmark-'+kind} type="text" placeholder={kind==='origin'?'Digite o ponto de partida':'Digite para onde você vai'} value={value} disabled={disabled} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open&&suggestions.length>0} aria-controls={'benchmark-'+kind+'-options'} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
    onKeyDown={e=>{if(e.key==='Escape')setOpen(false);if(e.key==='Enter'&&suggestions[0]){e.preventDefault();onChoose(suggestions[0]);setOpen(false);}}}/>
   {loading?<span className="vb-search-spinner" role="status" aria-label="Pesquisando locais"/>:<Search size={17} aria-hidden="true" className="vb-search-muted"/>}
  </div>
  {chosen&&<small className="vb-resolved"><Check size={13}/> Local identificado</small>}
  {open&&suggestions.length>0&&!disabled&&<ul id={'benchmark-'+kind+'-options'} className="vb-suggestions" role="listbox">
   {suggestions.map((place,i)=><li key={place.id||i} role="option" aria-selected="false"><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{onChoose(place);setOpen(false);}}><MapPin size={16}/><span><strong>{place.name}</strong><small>{place.address}</small></span></button></li>)}
  </ul>}
 </div>;
}
function BenchmarkMap({rows}){
 const root=useRef(null),instance=useRef(null);const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  import('leaflet').then(module=>{
   if(cancelled||!root.current)return;
   const L=module.default||module;
   const map=L.map(root.current,{zoomControl:true,scrollWheelZoom:false,attributionControl:true}).setView([-23.586,-46.675],11);
   const publicToken=import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
   const mapTiles=publicToken?'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token='+encodeURIComponent(publicToken):'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
   L.tileLayer(mapTiles,{maxZoom:19,...(publicToken?{tileSize:512,zoomOffset:-1}:{}),attribution:publicToken?'&copy; Mapbox &copy; OpenStreetMap contributors':'&copy; OpenStreetMap contributors'}).addTo(map);
   const layer=L.featureGroup().addTo(map);
   instance.current={L,map,layer};setReady(true);
  }).catch(()=>{if(!cancelled)setFailed(true);});
  return()=>{cancelled=true;instance.current?.map.remove();instance.current=null;};
 },[]);
 useEffect(()=>{
  if(!ready||!instance.current)return;
  const {L,map,layer}=instance.current;layer.clearLayers();
  const seen=new Set();
  for(const row of [...rows].reverse()){
   if(!row.ok||!row.data?.geometry||seen.has(row.mode))continue;
   const geometry=row.data.geometry;
   if(geometry.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2)continue;
   seen.add(row.mode);
   const color=MODELS.find(x=>x.id===row.mode)?.color||'#f07136';
   L.geoJSON({type:'Feature',properties:{},geometry},{style:{color,weight:row.mode==='fastest'?6:4,opacity:.85}}).addTo(layer);
  }
  const first=rows.find(r=>r.ok)?.data?.request;
  if(first){for(const [point,color] of [[first.origin,'#18a37a'],[first.destination,'#ec6835']]){
   L.circleMarker([point[1],point[0]],{radius:7,color:'#fff',weight:3,fillColor:color,fillOpacity:1}).addTo(layer);
  }}
  if(layer.getLayers().length){const bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds.pad(.2),{animate:false,maxZoom:14});}
  setTimeout(()=>{if(instance.current?.map===map)map.invalidateSize();},80);
 },[rows,ready]);
 return <div className="vb-map-box" data-testid="benchmark-map"><div ref={root} className="vb-map-canvas"/>
  {(!rows.some(x=>x.ok)||failed)&&<div className="vb-map-hint">{failed?'Mapa indisponível neste dispositivo. Os cálculos continuam funcionando.':'Os trajetos calculados aparecerão no mapa.'}</div>}
 </div>;
}
function exportFile(filename,mimetype,body){
 const url=URL.createObjectURL(new Blob([body],{type:mimetype})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const csvValue=value=>{let s=String(value??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export default function BenchmarkPage(){
 const [origin,setOrigin]=useState(PRESETS[0].from.label),[destination,setDestination]=useState(PRESETS[0].to.label);
 const [from,setFrom]=useState(PRESETS[0].from),[to,setTo]=useState(PRESETS[0].to),[vehicle,setVehicle]=useState('driving');
 const [modes,setModes]=useState(['fastest','safest']),[rounds,setRounds]=useState(2),[adaptive,setAdaptive]=useState(false);
 const [avoids,setAvoids]=useState({tolls:false,ferries:false,unpaved:false});
 const [capabilities,setCapabilities]=useState(null),[apiError,setApiError]=useState('');
 const [rows,setRows]=useState([]),[running,setRunning]=useState(false),[progress,setProgress]=useState([0,0]);
 const [notice,setNotice]=useState(''),controller=useRef(null);
 const available=capabilities?.modes||['fastest','safest'];
 useEffect(()=>{document.title='Benchmark de rotas | VANO Maps';getJson(API+'/capabilities').then(setCapabilities).catch(e=>setApiError(e.message));return()=>controller.current?.abort();},[]);
 const metrics=useMemo(()=>{
  const successful=rows.filter(r=>r.ok),lat=successful.map(r=>r.browserLatencyMs),eta=successful.map(r=>r.data.metrics.etaMin);
  return {successful:successful.length,p50:median(lat),p95:percentile(lat,.95),eta:eta.length?Math.min(...eta):null};
 },[rows]);
 function setPoint(kind,place){
  const selected={label:place.label||[place.name,place.address].filter(Boolean).join(' · '),coords:place.coords};
  if(kind==='origin'){setOrigin(selected.label);setFrom(selected);}
  else{setDestination(selected.label);setTo(selected);}
 }
 const changeOrigin=value=>{setOrigin(value);setFrom(null);};
 const changeDestination=value=>{setDestination(value);setTo(null);};
 async function resolvePoint(value,selected,signal){
  if(selected?.label===value&&Array.isArray(selected.coords))return selected;
  const coordinates=parseCoordinates(value);
  if(coordinates)return {label:value,coords:coordinates};
  if(value.trim().length<3)throw Error('Preencha origem e destino.');
  const results=await getJson('/api/search?'+new URLSearchParams({q:value.trim(),lang:'pt-BR'}),{signal});
  if(!Array.isArray(results)||!results.length||!Array.isArray(results[0].coords))throw Error('Endereço não encontrado: '+value);
  return {label:[results[0].name,results[0].address].filter(Boolean).join(' · '),coords:results[0].coords};
 }
 async function execute(event){
  event?.preventDefault();if(running)return;
  setRunning(true);setNotice('');setRows([]);setProgress([0,0]);
  const ctl=new AbortController();controller.current=ctl;
  try{
   const caps=await getJson(API+'/capabilities',{signal:ctl.signal});setCapabilities(caps);setApiError('');
   const active=modes.filter(m=>caps.modes.includes(m));
   if(!active.length)throw Error('Selecione pelo menos um modo disponível.');
   const total=rounds*active.length;
   if(total>(caps.limits?.requestsPerMinutePerIp||6))throw Error('Reduza modos ou execuções para respeitar o limite da API.');
   const a=await resolvePoint(origin,from,ctl.signal),b=await resolvePoint(destination,to,ctl.signal);
   if(a.coords.join(',')===b.coords.join(','))throw Error('Origem e destino precisam ser diferentes.');
   setPoint('origin',a);setPoint('destination',b);setProgress([0,total]);
   let done=0;
   for(let round=1;round<=rounds;round++){
    for(const mode of active){
     if(ctl.signal.aborted)throw new DOMException('Cancelado','AbortError');
     const query=new URLSearchParams({
      start_lon:String(a.coords[0]),start_lat:String(a.coords[1]),end_lon:String(b.coords[0]),end_lat:String(b.coords[1]),
      profile:vehicle,mode,adaptive:adaptive?'1':'0',variant_budget:'2',include_geometry:'1',
      avoid_tolls:avoids.tolls?'1':'0',avoid_ferries:avoids.ferries?'1':'0',avoid_unpaved:avoids.unpaved?'1':'0'
     });
     const start=performance.now();
     try{
      const data=await getJson(API+'/route?'+query,{signal:ctl.signal});
      setRows(prev=>[...prev,{ok:true,mode,round,data,browserLatencyMs:Math.round(performance.now()-start)}]);
     }catch(e){
      if(ctl.signal.aborted)throw e;
      setRows(prev=>[...prev,{ok:false,mode,round,error:e.message,status:e.status||0}]);
      if(e.status===429)throw Error('Limite de requisições atingido. Aguarde antes de testar novamente.');
     }
     done++;setProgress([done,total]);
    }
   }
   setNotice('Benchmark concluído. Resultados medidos pelo motor VANO.');
  }catch(e){setNotice(ctl.signal.aborted?'Execução cancelada. Resultados anteriores preservados.':e.message||'Não foi possível concluir.');}
  finally{setRunning(false);controller.current=null;}
 }
 function toggleMode(m){setModes(current=>current.includes(m)?current.filter(x=>x!==m):[...current,m]);}
 function exportJson(){
  exportFile('vano-benchmark-'+Date.now()+'.json','application/json',JSON.stringify({protocol:'vano-route-benchmark',version:'2.0',exportedAt:new Date().toISOString(),inputs:{origin,destination,vehicle,modes,rounds,adaptive,avoids},results:rows},null,2));
 }
 function exportCsv(){
  const cols=['mode','round','ok','browser_latency_ms','server_latency_ms','eta_min','distance_km','candidate_count','traffic_score','safety_score','verified_safety','provider','error'];
  const lines=[cols.join(',')];
  for(const row of rows){const m=row.data?.metrics||{};const values=[row.mode,row.round,row.ok,row.browserLatencyMs,m.serverLatencyMs,m.etaMin,m.distanceKm,m.candidateCount,m.trafficScore,m.safetyScore,m.verifiedSafety,m.provider,row.error];lines.push(values.map(csvValue).join(','));}
  exportFile('vano-benchmark-'+Date.now()+'.csv','text/csv;charset=utf-8','\ufeff'+lines.join('\n'));
 }
 return <main className="vb-page" role="main" id="benchmark-page">
  <div className="vb-container">
   <header className="vb-header"><Link to="/mapa" className="vb-back"><ArrowRight size={16}/> Voltar ao mapa</Link><div className="vb-brand"><img className="vb-logo-img" src="/vano-logo-original.webp" width="33" height="33" alt=""/> VANO <b>LAB</b></div><div className="vb-public"><span/> Público · sem login</div></header>
   <section className="vb-hero"><div><span className="vb-eyebrow"><RouteIcon size={15}/> LABORATÓRIO DE ROTAS</span><h1>Compare caminhos.<br/><em>Meça resultados.</em></h1><p>Defina origem e destino, escolha carro ou moto e execute cálculos reais do VANO. Uma interface para pessoas e agentes de IA.</p></div><div className="vb-agent-chip"><Bot size={22}/><div><strong>Agent ready</strong><span>Interface + API JSON pública</span></div></div></section>
   <div className="vb-workspace">
    <form className="vb-config" onSubmit={execute} data-testid="benchmark-form">
     <div className="vb-panel-head"><span>01 / CONFIGURAÇÃO</span><h2>Monte seu cenário</h2><p>Selecione um trajeto para começar.</p></div>
     <div className="vb-presets">{PRESETS.map(p=><button type="button" key={p.id} disabled={running} onClick={()=>{setPoint('origin',p.from);setPoint('destination',p.to);}}>{p.title}</button>)}</div>
     <div className="vb-point-grid">
      <PointField kind="origin" title="Origem" value={origin} chosen={from} onChange={changeOrigin} onChoose={p=>setPoint('origin',p)} disabled={running}/>
      <button className="vb-swap" type="button" title="Inverter origem e destino" aria-label="Inverter origem e destino" data-testid="benchmark-swap" disabled={running} onClick={()=>{const o=origin,d=destination,a=from,b=to;setOrigin(d);setDestination(o);setFrom(b);setTo(a);}}><ArrowLeftRight size={17}/></button>
      <PointField kind="destination" title="Destino" value={destination} chosen={to} onChange={changeDestination} onChoose={p=>setPoint('destination',p)} disabled={running}/>
     </div>
     <fieldset className="vb-fieldset"><legend>Tipo de veículo</legend><div className="vb-vehicles">
      <button type="button" className={vehicle==='driving'?'active':''} aria-pressed={vehicle==='driving'} data-testid="benchmark-car" disabled={running} onClick={()=>setVehicle('driving')}><CarFront size={21}/> Carro</button>
      <button type="button" className={vehicle==='motorcycle'?'active':''} aria-pressed={vehicle==='motorcycle'} data-testid="benchmark-motorcycle" disabled={running} onClick={()=>setVehicle('motorcycle')}><span className="vb-moto">🏍</span> Moto</button>
     </div></fieldset>
     <fieldset className="vb-fieldset"><legend>Modos de rota <small>Selecione para comparar</small></legend><div className="vb-modes">
       {MODELS.map(m=><label key={m.id} className={'vb-mode '+(modes.includes(m.id)?'selected':'')+(available.includes(m.id)?'':' disabled')}>
        <input type="checkbox" name="benchmark-mode" data-testid={'benchmark-mode-'+m.id} disabled={running||!available.includes(m.id)} checked={modes.includes(m.id)&&available.includes(m.id)} onChange={()=>toggleMode(m.id)}/>
        <m.icon size={19} style={{color:m.color}}/><span><b>{m.name}</b><small>{!available.includes(m.id)?'Exige motor avançado':m.description}</small></span>
       </label>)}
     </div></fieldset>
     <div className="vb-options">
      <label className="vb-select"><span>Execuções por modo</span><select data-testid="benchmark-rounds" value={rounds} disabled={running} onChange={e=>setRounds(Number(e.target.value))}><option value="1">1 execução</option><option value="2">2 execuções</option><option value="3">3 execuções</option></select></label>
      <label className="vb-toggle"><input type="checkbox" checked={adaptive} disabled={running} onChange={e=>setAdaptive(e.target.checked)}/><span>Roteamento adaptativo</span></label>
     </div>
     <details className="vb-advanced"><summary><SlidersHorizontal size={16}/> Evitar vias específicas</summary><div>{[['tolls','Pedágios'],['ferries','Balsas'],['unpaved','Não pavimentadas']].map(([key,label])=><label key={key}><input type="checkbox" checked={avoids[key]} disabled={running} onChange={e=>setAvoids(prev=>({...prev,[key]:e.target.checked}))}/>{label}</label>)}</div></details>
     <button type="submit" className="vb-run" data-testid="benchmark-run" disabled={running}>{running?'Calculando trajetos…':'Executar benchmark'}<Play size={17}/></button>
     {running&&<button type="button" className="vb-cancel" data-testid="benchmark-cancel" onClick={()=>controller.current?.abort()}><X size={15}/> Cancelar execução</button>}
     {running&&<progress className="vb-progress" max={Math.max(1,progress[1])} value={progress[0]} aria-label="Progresso dos testes"/>}
     <div className="vb-status" data-testid="benchmark-status" role="status" aria-live="polite">{apiError?'API indisponível: '+apiError:notice|| (running?progress[0]+' de '+progress[1]+' cálculos':'Selecione os modos e inicie o teste.')}</div>
    </form>
    <div className="vb-right">
     <section className="vb-map-panel"><div className="vb-section-head"><div><span>02 / MAPA</span><h2>Visualização de trajetos</h2></div><div className="vb-legend">{MODELS.filter(m=>modes.includes(m.id)).map(m=><span key={m.id}><i style={{background:m.color}}/>{m.name}</span>)}</div></div><BenchmarkMap rows={rows}/></section>
     <section className="vb-stat-grid" aria-label="Resumo dos resultados">
      <article><span>LATÊNCIA MEDIANA</span><strong>{metrics.p50===null?'—':fmt(metrics.p50,0)+' ms'}</strong><small>Tempo no navegador</small></article>
      <article><span>MELHOR ETA</span><strong>{metrics.eta===null?'—':fmt(metrics.eta,0)+' min'}</strong><small>Estimativa do provedor</small></article>
      <article><span>EXECUÇÕES VÁLIDAS</span><strong>{metrics.successful}/{rows.length}</strong><small>Respostas reais</small></article>
      <article><span>LATÊNCIA P95</span><strong>{metrics.p95===null?'—':fmt(metrics.p95,0)+' ms'}</strong><small>{metrics.successful} amostra(s)</small></article>
     </section>
     <section className="vb-results" data-testid="benchmark-results"><div className="vb-section-head"><div><span>03 / RESULTADOS</span><h2>Comparativo medido</h2></div><div className="vb-export"><button type="button" disabled={!rows.length} onClick={exportJson}><FileJson size={16}/> JSON</button><button type="button" disabled={!rows.length} onClick={exportCsv}><Download size={16}/> CSV</button></div></div>
       <div className="vb-table-scroll"><table><caption>Resultados do benchmark por modo e execução</caption><thead><tr><th>Modo</th><th>Teste</th><th>Latência</th><th>ETA</th><th>Distância</th><th>Trânsito</th><th>Segurança</th><th>Fonte</th><th>Status</th></tr></thead><tbody>
        {!rows.length&&<tr><td colSpan="9" className="vb-empty">Nenhum teste executado. Os dados aparecerão aqui após o cálculo.</td></tr>}
        {rows.map((row,i)=>{const m=row.data?.metrics;return <tr key={i}><td><b>{MODELS.find(x=>x.id===row.mode)?.name||row.mode}</b></td><td>#{row.round}</td><td>{finite(row.browserLatencyMs)!==null?fmt(row.browserLatencyMs,0)+' ms':'—'}</td><td>{m?fmt(m.etaMin,0)+' min':'—'}</td><td>{m?fmt(m.distanceKm,1)+' km':'—'}</td><td>{m?fmt(m.trafficScore):'—'}</td><td>{m?fmt(m.safetyScore):'—'}</td><td>{m?.provider||'—'}</td><td className={row.ok?'vb-ok':'vb-error'}>{row.ok?'OK':row.error}</td></tr>;})}
        </tbody></table></div>
       <p className="vb-caution"><ShieldCheck size={15}/> Indicadores ausentes aparecem como “—”. Uma rota alternativa não comprova maior segurança.</p>
     </section>
    </div>
   </div>
   <section className="vb-agent-docs"><div><span className="vb-eyebrow"><Bot size={16}/> ACESSO POR AGENTES</span><h2>O mesmo laboratório,<br/>também via API.</h2><p>Agentes podem preencher esta página ou usar o contrato JSON público. Não precisam de conta administrativa.</p></div><div className="vb-links"><a href={API+'/capabilities'} target="_blank" rel="noreferrer">Descobrir capacidades <ArrowRight size={16}/></a><a href={API+'/scenarios'} target="_blank" rel="noreferrer">Consultar cenários <ArrowRight size={16}/></a><a href="/.well-known/vano-benchmark.json" target="_blank" rel="noreferrer">Contrato de descoberta <ArrowRight size={16}/></a></div></section>
   <footer className="vb-footer"><strong>VANO MAPS</strong><span>Resultados medidos, sem promessas inventadas.</span><Link to="/mapa">Abrir navegação <ArrowRight size={15}/></Link></footer>
  </div>
 </main>;
}
