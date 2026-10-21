/** Gentle, forward-moving highlights, private V2 only. Never rewrites geometry
 * or drives the GPS/camera. One bounded paint update per 40ms, static on reduce.
 */
export function v2RouteDashPattern(time){
 const phase=((time%4800)+4800)%4800/4800*14;
 return phase<=10?[0,phase,4,10-phase]:[phase-10,10,14-phase,0];
}
export function updateV2RouteFlow(map,backend,data,time,reduced=false){
 if(!map)return;
 const enabled=data.v2Experience&&data.vehicle!=='a-pe'&&data.routes?.some(r=>r.id===data.selectedRoute&&r.geometry?.coordinates?.length>1);
 const element=map._vanoFlowLine?.getElement?.();
 if(element){
  element.classList.toggle('v81-flow-motion',Boolean(enabled&&!reduced));
  element.style.animationPlayState=data.active&&!globalThis.document?.hidden?'running':'paused';
 }
 if(backend!=='mapbox'||!map.getLayer?.('vano-v2-flow'))return;
 if(!enabled){
  if(map._v81FlowPaintAt)map.setPaintProperty('vano-v2-flow','line-dasharray',[4,10]);
  map._v81FlowPaintAt=0;map._v81FlowReduced=null;return;
 }
 if(!data.active||globalThis.document?.hidden)return;
 if(reduced){
  if(map._v81FlowReduced!==true)map.setPaintProperty('vano-v2-flow','line-dasharray',[4,10]);
  map._v81FlowReduced=true;return;
 }
 if(map._v81FlowReduced!==false)map._v81FlowPaintAt=0;
 map._v81FlowReduced=false;
 if(time-(map._v81FlowPaintAt||0)<40)return;
 map._v81FlowPaintAt=time;
 map.setPaintProperty('vano-v2-flow','line-dasharray',v2RouteDashPattern(time));
}
