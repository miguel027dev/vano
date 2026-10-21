import React from 'react';
import {Car,Construction,TriangleAlert,ShieldX,X,ChevronRight} from 'lucide-react';
import '../route-traffic.css';

export const trafficDistance=meters=>meters<1000?`${Math.max(0,Math.round(meters/50)*50)} m`:`${(meters/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km`;
export function TrafficIcon({category,...props}){
 const Icon=category==='roadworks'?Construction:category==='roadclosed'||category==='laneclosed'?ShieldX:category==='jam'?Car:TriangleAlert;
 return <Icon {...props}/>;
}
export function RouteTrafficBubble({event,selected,onSelect}){
 return <button type="button" className={`v81-traffic-bubble is-${event.severity} ${selected?'is-selected':''}`}
  aria-pressed={selected} aria-label={`${event.name}. Ver detalhes do trecho.`}
  onClick={e=>{e.stopPropagation();onSelect(event.id);}}>
  <TrafficIcon category={event.category} size={18} strokeWidth={1.9} aria-hidden="true"/>
  {event.delaySeconds>0&&<span>+{Math.max(1,Math.round(event.delaySeconds/60))} min</span>}
 </button>;
}
export function RouteTrafficCard({traffic,compact=false,etaIncludesTraffic=false}){
 if(!traffic?.index)return null;
 const event=traffic.selected;
 const unavailable=['unavailable','unconfigured','stale'].includes(traffic.status);
 const legend=<span className="v81-traffic-legend" aria-label="Amarelo: fluindo. Laranja: lento. Vermelho: intenso. Cinza: sem dados."><i/><i/><i/><i/></span>;
 if(!event)return <button type="button" className="v81-traffic-summary" disabled={!traffic.events.length}
  onClick={()=>traffic.select(traffic.events[0]?.id)} aria-label={traffic.events.length?'Ver ocorrências no trajeto':undefined}>
  {legend}<span>{traffic.status==='loading'?'Consultando trânsito…':unavailable?'Trânsito indisponível':traffic.hasFlow?'Trânsito por trechos':'Cobertura de trânsito parcial'}
  {!compact&&traffic.events.length>0&&<small>{traffic.events.length} {traffic.events.length===1?'ocorrência à frente':'ocorrências à frente'}</small>}
  {!traffic.hasFlow&&traffic.status!=='loading'&&!compact&&<small>Trechos sem informação ficam em cinza</small>}</span>
  {traffic.events.length>0&&<ChevronRight size={17} aria-hidden="true"/>}
 </button>;
 const ahead=Math.max(0,event.startMeters-traffic.progress);
 return <section className="v81-traffic-detail" aria-label="Ocorrência no trajeto">
  <div className={`v81-event-icon is-${event.severity}`}><TrafficIcon category={event.category} size={21} aria-hidden="true"/></div>
  <div className="v81-event-copy" aria-live="polite">
   <strong>{event.name} · {ahead>30?`a ${trafficDistance(ahead)}`:'neste trecho'}</strong>
   {!compact&&<span>{trafficDistance(event.lengthMeters)} afetados{Number.isFinite(event.currentKmh)?` · fluxo de ${Math.round(event.currentKmh)} km/h`:''}</span>}
   {event.delaySeconds>0?<small>+{Math.max(1,Math.round(event.delaySeconds/60))} min{etaIncludesTraffic?' · consulte a chegada estimada':' · estimativa do provedor'}</small>:<small>{event.category==='jam'?'Velocidade observada · atraso não estimado':'Impacto no tempo indisponível'}</small>}
   {!compact&&<small className="v81-event-source">{event.source} · informação por trecho</small>}
  </div>
  <button type="button" className="v81-traffic-close" aria-label="Recolher detalhes do trânsito" onClick={()=>traffic.select(null)}><X size={18}/></button>
 </section>;
}
