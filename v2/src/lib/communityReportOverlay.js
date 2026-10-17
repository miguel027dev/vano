/** Dedicated community overlay: stable, modern map pins and live updates.
 * Mapbox and Leaflet keep their route/GPS/POI layers untouched.
 */
import L from 'leaflet';
import {post} from './api.js';
import mapboxgl from 'mapbox-gl';
import {closeReports,metersApart,reportIconSvg,reportQueryBBox,reportType,validReportCoords} from './communityReports.js';

const REPORT_QUESTIONS={
  via_fechada:'A rua continua fechada?',
  transito:'O trânsito continua intenso?',
  fiscalizacao:'Essa blitz ainda está aqui?',
  acidente:'O acidente ainda está aqui?',
  alagamento:'Ainda há alagamento aqui?',
  obstaculo:'O obstáculo continua na via?'
};
const popupSignature=report=>[report.status,report.isOwn?'self':'other',
  report.viewerVote||'',report.description||''].join('|');

function popupNode(report,onVote){
  const root=document.createElement('section');
  root.className='vano-community-popup';
  const header=document.createElement('div');
  header.className='vano-community-popup-header';
  const icon=document.createElement('span');
  icon.className='vano-community-popup-icon';
  icon.style.setProperty('--community-pin-color',reportType(report.type)?.color||'#d97751');
  icon.innerHTML=reportIconSvg(report.type); // Static catalog SVG, no user-provided markup.
  const heading=document.createElement('div');
  heading.className='vano-community-popup-heading';
  const title=document.createElement('strong');
  title.textContent=reportType(report.type)?.name||'Ocorrência';
  const note=document.createElement('small');
  note.textContent=report.status==='verificado'?'Relato verificado':'Relato colaborativo';
  heading.append(title,note);
  header.append(icon,heading);
  root.append(header);
  if(report.description){
    const description=document.createElement('p');
    description.className='vano-community-popup-description';
    description.textContent=report.description;
    root.append(description);
  }
  const info=document.createElement('small');
  info.className='vano-community-popup-meta';
  info.textContent='Localização aproximada · informação da comunidade';
  root.append(info);
  const footer=document.createElement('div');
  footer.className='vano-community-popup-footer';
  if(report.isOwn){
    footer.textContent='Seu alerta foi publicado.';
  }else if(report.viewerVote){
    footer.textContent='Você já confirmou esta ocorrência. Obrigado!';
  }else{
    const question=document.createElement('p');
    question.className='vano-community-popup-question';
    question.textContent=REPORT_QUESTIONS[report.type]||'Essa ocorrência ainda está aqui?';
    const actions=document.createElement('div');
    actions.className='vano-community-popup-actions';
    const message=document.createElement('small');
    message.className='vano-community-popup-feedback';
    message.setAttribute('role','status');
    message.setAttribute('aria-live','polite');
    const choices=[['present','Ainda está'],['gone','Não está mais']];
    const buttons=choices.map(([choice,label])=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='vano-community-popup-choice'+(choice==='present'?' is-present':'');
      button.textContent=label;
      button.addEventListener('click',async event=>{
        event.preventDefault();
        event.stopPropagation();
        for(const item of buttons)item.disabled=true;
        message.textContent='Registrando…';
        try{
          const result=await post('/reports/'+encodeURIComponent(report.id)+'/feedback',{choice});
          onVote(report.id,result.choice);
          actions.remove();
          question.remove();
          footer.textContent='Obrigado! Sua confirmação foi registrada.';
        }catch(error){
          message.textContent=error?.message||'Não foi possível confirmar. Tente novamente.';
          for(const item of buttons)item.disabled=false;
        }
      });
      return button;
    });
    actions.append(...buttons);
    footer.append(question,actions,message);
  }
  root.append(footer);
  return root;
}
function pinNode(report){
  const kind=reportType(report.type);
  const root=document.createElement('div');
  root.className='vano-community-pin';
  root.dataset.kind=report.type;
  root.dataset.verified=report.status==='verificado'?'1':'0';
  root.style.setProperty('--community-pin-color',kind?.color||'#d97751');
  root.setAttribute('aria-label',(kind?.name||'Ocorrência')+' · alerta colaborativo');
  root.title=(kind?.name||'Ocorrência')+' · local aproximado';
  const symbol=document.createElement('span');symbol.className='vano-community-symbol';
  // Six static SVG paths in the closed catalog. User text is never inserted as markup.
  symbol.innerHTML=reportIconSvg(report.type);
  const label=document.createElement('span');label.className='vano-community-map-label';
  label.textContent=kind?.name||'Ocorrência';
  root.append(symbol,label);
  return root;
}
export function attachCommunityReportOverlay(map,backend,getGPS=()=>null,isActive=()=>true){
  if(!map||!['mapbox','leaflet'].includes(backend))return ()=>{};
  let disposed=false,lastRead=0,lastCoords=null,request=null,items=[],pendingRefresh=false;
  let stream=null,streamOrigin=null;
  const markers=new Map();
  const onVote=(id,choice)=>{
    items=items.map(item=>item.id===id?{...item,viewerVote:choice}:item);
    const marker=markers.get(id);
    if(marker)marker._vanoPayloadSignature=popupSignature(items.find(item=>item.id===id)||{});
  };
  function clear(){
    for(const marker of markers.values())marker.remove();
    markers.clear();
  }
  function render(){
    if(disposed)return;
    const gps=getGPS();
    if(!validReportCoords(gps)||!isActive()){clear();return;}
    const visible=closeReports(items,gps,new Set(markers.keys()));
    const ids=new Set(visible.map(item=>item.id));
    for(const [id,marker] of markers){
      if(!ids.has(id)){marker.remove();markers.delete(id);}
    }
    for(const report of visible){
      const signature=popupSignature(report);
      const existing=markers.get(report.id);
      if(existing&&existing._vanoPayloadSignature===signature)continue;
      if(existing){existing.remove();markers.delete(report.id);}
      const point=report.coords,element=pinNode(report);
      let marker;
      if(backend==='mapbox'){
        marker=new mapboxgl.Marker({element,anchor:'bottom'})
          .setLngLat(point)
          .setPopup(new mapboxgl.Popup({offset:22,maxWidth:'290px',className:'vano-community-map-popup'}).setDOMContent(popupNode(report,onVote)))
          .addTo(map);
      }else{
        marker=L.marker([point[1],point[0]],{icon:L.divIcon({
          className:'vano-community-leaflet-wrap',html:element.outerHTML,
          iconSize:[52,62],iconAnchor:[26,62],popupAnchor:[0,-42]
        })}).bindPopup(L.popup({className:'vano-community-map-popup',maxWidth:290}).setContent(popupNode(report,onVote))).addTo(map);
      }
      marker._vanoPayloadSignature=signature;
      markers.set(report.id,marker);
    }
  }
  function closeStream(){
    stream?.close();stream=null;streamOrigin=null;
  }
  function syncStream(){
    const gps=getGPS();
    if(!isActive()||!validReportCoords(gps)||typeof EventSource!=='function'){
      closeStream();return;
    }
    // Reconnect only when sufficiently far from the subscribed GPS viewport.
    if(stream&&metersApart(gps,streamOrigin)<350)return;
    const bbox=reportQueryBBox(gps);
    if(!bbox){closeStream();return;}
    closeStream();
    try{
      const source=new EventSource('/api/reports/stream?bbox='+encodeURIComponent(bbox),{withCredentials:true});
      stream=source;streamOrigin=[...gps];
      source.addEventListener('reports-changed',()=>{if(!disposed&&stream===source)refresh(true);});
      // Native EventSource reconnects automatically; HTTP polling remains the fallback.
    }catch{closeStream();}
  }
  async function refresh(force=false){
    if(disposed)return;
    const gps=getGPS();
    if(!validReportCoords(gps)||!isActive()){
      clear();closeStream();return;
    }
    render();syncStream();
    if(request){
      if(force||metersApart(gps,lastCoords)>250)pendingRefresh=true;
      return;
    }
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
      // Offline/network errors never erase valid local pins or interrupt navigation.
      if(!disposed)lastRead=0;
    }finally{
      if(request===controller)request=null;
      if(pendingRefresh&&!disposed){
        pendingRefresh=false;
        void refresh(true);
      }
    }
  }
  function onReport(event){
    if(event?.detail&&reportType(event.detail.type)){
      items=[event.detail,...items.filter(item=>item.id!==event.detail.id)];
      render();
    }
    lastRead=0;void refresh(true);
  }
  function onVisibility(){if(!document.hidden)void refresh(true);}
  function onOnline(){lastRead=0;void refresh(true);}
  map._vanoSyncCommunityReports=()=>{void refresh(false);};
  const interval=setInterval(()=>{void refresh();},12_000);
  window.addEventListener('vano:report-created',onReport);
  window.addEventListener('online',onOnline);
  document.addEventListener('visibilitychange',onVisibility);
  void refresh(true);
  return ()=>{
    disposed=true;clearInterval(interval);request?.abort();closeStream();
    window.removeEventListener('vano:report-created',onReport);
    window.removeEventListener('online',onOnline);
    document.removeEventListener('visibilitychange',onVisibility);
    delete map._vanoSyncCommunityReports;
    clear();items=[];
  };
}
