/** Dedicated community overlay. It never modifies map style, routing, or POI layers. */
import L from 'leaflet';
import mapboxgl from 'mapbox-gl';
import {closeReports,metersApart,reportExpiration,reportIconSvg,reportQueryBBox,reportType,validReportCoords} from './communityReports.js';

function popupNode(report){
  const root=document.createElement('div');
  root.className='vano-community-popup';
  const title=document.createElement('strong');title.textContent=reportType(report.type)?.name||'Ocorrência';
  const note=document.createElement('small');note.textContent=report.status==='verificado'?'Confirmado pela comunidade':'Relato não verificado';
  root.append(title,note);
  if(report.description){const p=document.createElement('p');p.textContent=report.description;root.append(p);}
  const date=document.createElement('small');
  date.textContent='Informação colaborativa · local aproximado';
  root.append(date);
  return root;
}
function pinNode(report){
  const root=document.createElement('div');
  root.className='vano-community-pin';
  root.dataset.kind=report.type;
  root.style.setProperty('--community-pin-color',reportType(report.type)?.color||'#d97751');
  root.setAttribute('aria-label',(reportType(report.type)?.name||'Ocorrência')+' · relato da comunidade');
  root.title=(reportType(report.type)?.name||'Ocorrência')+' · local aproximado';
  const symbol=document.createElement('span');
  symbol.className='vano-community-symbol';
  symbol.innerHTML=reportIconSvg(report.type); // closed catalog: no user-supplied HTML
  root.append(symbol);
  return root;
}
export function attachCommunityReportOverlay(map,backend,getGPS=()=>null,isActive=()=>true){
  if(!map||!['mapbox','leaflet'].includes(backend))return ()=>{};
  let disposed=false,lastRead=0,lastCoords=null,request=null,items=[];
  const markers=new Map();
  function clear(){
    for(const marker of markers.values())marker.remove();
    markers.clear();
  }
  function render(){
    if(disposed)return;
    const gps=getGPS();
    if(!validReportCoords(gps)||!isActive()){clear();return;}
    const previous=new Set(markers.keys());
    const visible=closeReports(items,gps,previous);
    const ids=new Set(visible.map(item=>item.id));
    for(const [id,marker] of markers)if(!ids.has(id)){marker.remove();markers.delete(id);}
    for(const report of visible){
      if(markers.has(report.id))continue;
      const point=report.coords,element=pinNode(report);
      let marker;
      if(backend==='mapbox'){
        marker=new mapboxgl.Marker({element,anchor:'bottom'})
          .setLngLat(point).setPopup(new mapboxgl.Popup({offset:22,maxWidth:'240px'}).setDOMContent(popupNode(report)))
          .addTo(map);
      }else{
        marker=L.marker([point[1],point[0]],{icon:L.divIcon({
          className:'vano-community-leaflet-wrap',html:element.outerHTML,iconSize:[40,46],iconAnchor:[20,46]
        })}).bindPopup(popupNode(report)).addTo(map);
      }
      markers.set(report.id,marker);
    }
  }
  async function refresh(force=false){
    if(disposed)return;
    const gps=getGPS();
    if(!validReportCoords(gps)||!isActive()){clear();return;}
    render();
    if(request)return;
    if(!force&&Date.now()-lastRead<25_000&&metersApart(gps,lastCoords)<250)return;
    const bbox=reportQueryBBox(gps);
    if(!bbox)return;
    const controller=new AbortController();
    request=controller;lastRead=Date.now();lastCoords=[...gps];
    try{
      const response=await fetch('/api/reports/nearby?bbox='+encodeURIComponent(bbox),{
        credentials:'include',cache:'no-store',signal:controller.signal
      });
      if(!response.ok)throw Error('community_feed_unavailable');
      const payload=await response.json();
      if(!disposed&&Array.isArray(payload.reports)){items=payload.reports;render();}
    }catch{
      // Keep still-valid markers when temporarily offline; retry later.
      if(!disposed)lastRead=0;
    }finally{if(request===controller)request=null;}
  }
  function onReport(event){
    if(event?.detail&&reportType(event.detail.type)){
      items=[event.detail,...items.filter(item=>item.id!==event.detail.id)];
      render();
    }
    lastRead=0;refresh(true);
  }
  map._vanoSyncCommunityReports=()=>refresh(false);
  const interval=setInterval(()=>refresh(),12_000);
  window.addEventListener('vano:report-created',onReport);
  refresh(true);
  return ()=>{
    disposed=true;clearInterval(interval);request?.abort();
    window.removeEventListener('vano:report-created',onReport);
    delete map._vanoSyncCommunityReports;
    clear();items=[];
  };
}
