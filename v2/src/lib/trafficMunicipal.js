/** Optional second live source: vetted public GeoJSON returned by VANO server.
 * No feed is active until VANO_TRAFFIC_OFFICIAL_GEOJSON_URL is configured.
 * Only timestamp-validated road LINE geometry is accepted by the backend.
 */
import {trafficColor,firstLabelLayer} from './trafficLayers.js';
const SOURCE='vano-official-live-traffic';
const LAYER='vano-official-live-traffic-line';
const empty=()=>({type:'FeatureCollection',features:[]});
export function municipalTrafficBBox(map){
 try{
  if(map.getZoom()<11.5)return null;
  const c=map.getCenter(),bounds=map.getBounds();
  const dx=Math.min(.08,(bounds.getEast()-bounds.getWest())/2+.005);
  const dy=Math.min(.065,(bounds.getNorth()-bounds.getSouth())/2+.005);
  if(!(dx>0&&dy>0))return null;
  const b=[c.lng-dx,c.lat-dy,c.lng+dx,c.lat+dy].map(x=>+x.toFixed(5));
  if(b[0]< -180||b[2]>180||b[1]< -85||b[3]>85)return null;
  return b;
 }catch{return null;}
}
export function attachMunicipalTrafficOverlay(map,{enabled=true,request=fetch}={}){
 if(!map||typeof map.addSource!=='function')return {setEnabled:()=>{},dispose:()=>{}};
 let active=Boolean(enabled),disposed=false,configured=null,timer=null,controller=null,lastKey='',lastRead=0;
 let data=empty();
 function install(){
  if(disposed||!configured||!map.isStyleLoaded?.())return;
  try{
   if(!map.getSource(SOURCE))map.addSource(SOURCE,{type:'geojson',data});
   if(!map.getLayer(LAYER)){
    const before=map.getLayer('vano-v2-other')?'vano-v2-other':firstLabelLayer(map);
    map.addLayer({id:LAYER,type:'line',source:SOURCE,
     layout:{'line-join':'round','line-cap':'round'},
     paint:{'line-color':trafficColor,'line-width':['interpolate',['linear'],['zoom'],11,1.5,14,2.5,18,3.5],
      'line-opacity':.86,'line-offset':1.2}},before&&map.getLayer(before)?before:undefined);
   }
   map.setLayoutProperty(LAYER,'visibility',active?'visible':'none');
   map.getSource(SOURCE)?.setData(data);
  }catch(error){console.warn('VANO official traffic layer:',error?.message||String(error));}
 }
 function schedule(){
  if(disposed||!active||configured===false||typeof document!=='undefined'&&document.hidden)return;
  if(timer!==null)clearTimeout(timer);
  timer=setTimeout(refresh,880);
 }
 async function refresh(){
  timer=null;
  if(disposed||!active||configured===false)return;
  const bbox=municipalTrafficBBox(map);
  if(!bbox)return;
  const key=bbox.map(x=>x.toFixed(3)).join(',');
  if(key===lastKey&&Date.now()-lastRead<80000)return;
  controller?.abort();
  const requestAbort=new AbortController();controller=requestAbort;
  try{
   const response=await request('/api/traffic/public?bbox='+encodeURIComponent(bbox.join(',')),{
    signal:requestAbort.signal,headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('traffic-source-http-'+response.status);
   const payload=await response.json();
   if(disposed||requestAbort.signal.aborted)return;
   configured=payload?.enabled===true;
   if(!configured){
    data=empty();lastRead=Date.now();lastKey=key;
    return;
   }
   const features=Array.isArray(payload.features)?payload.features:[];
   data={type:'FeatureCollection',features:features.slice(0,260)};
   lastKey=key;lastRead=Date.now();
   install();
  }catch(error){
   if(!requestAbort.signal.aborted)console.warn('VANO public traffic unavailable:',error?.message||String(error));
  }
 }
 function setEnabled(next){
  active=Boolean(next);
  if(!active){controller?.abort();if(timer!==null)clearTimeout(timer);timer=null;}
  if(map.getLayer?.(LAYER))map.setLayoutProperty(LAYER,'visibility',active?'visible':'none');
  if(active)schedule();
 }
 const showAgain=()=>{if(!document.hidden)schedule();};
 map.on('style.load',install);
 map.on('moveend',schedule);
 map.on('zoomend',schedule);
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',showAgain);
 schedule();
 return {setEnabled,dispose(){
  disposed=true;controller?.abort();if(timer!==null)clearTimeout(timer);
  map.off('style.load',install);map.off('moveend',schedule);map.off('zoomend',schedule);
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',showAgain);
 }};
}
