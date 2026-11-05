/** A map camera moving is not evidence of a person's location. Notify only
 * after a deliberate pan/zoom; GPS following and route framing stay silent. */
export function attachSearchMapArea(map,element,{leaflet=false,getState,onArea}={}){
 let chosen=false;
 const allowed=()=>{const state=getState?.()||{};return !state.navigation&&!state.simulationPreview&&!state.droneSimulation;};
 const start=event=>{if(allowed()&&(leaflet||event?.originalEvent))chosen=true;};
 const wheel=()=>{if(leaflet&&allowed())chosen=true;};
 const finish=event=>{
  const intentional=chosen||Boolean(!leaflet&&event?.originalEvent);
  chosen=false;
  if(!intentional||!allowed())return;
  const center=map.getCenter(),point=[center.lng,center.lat];
  if(point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90)onArea?.(point);
 };
 map.on('dragstart',start);
 // Mapbox preserves originalEvent for keyboard, wheel and pinch gestures.
 if(!leaflet)map.on('zoomstart',start);
 map.on('moveend',finish);
 element?.addEventListener('wheel',wheel,{passive:true});
 return()=>{
  map.off('dragstart',start);if(!leaflet)map.off('zoomstart',start);
  map.off('moveend',finish);element?.removeEventListener('wheel',wheel);
 };
}
