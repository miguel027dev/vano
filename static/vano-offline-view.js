/* Biblioteca offline: somente a geometria previamente salva; sem dependências remotas. */
(()=>{
  'use strict';
  const api=window.VANO_OFFLINE_ROUTES,$=id=>document.getElementById(id);
  if(!api)return;
  const list=$('offlineList'),detail=$('offlineDetail'),status=$('offlineStatus'),toggle=$('offlineOptIn');
  const ns='http://www.w3.org/2000/svg';let selected=null,points=[],project=null,limits=null;
  const coordName=p=>String(p?.label||'Local').split(',')[0].trim()||'Local';
  const fmtDate=ts=>new Date(ts).toLocaleDateString('pt-BR');
  const line=(a,b)=>coordName(a)+' → '+coordName(b);
  function svg(tag,attrs={}){
    const node=document.createElementNS(ns,tag);
    Object.keys(attrs).forEach(k=>node.setAttribute(k,String(attrs[k])));
    return node;
  }
  function draw(route,location=null){
    const host=$('offlineDrawing');host.replaceChildren();
    points=(route?.geometry||[]).filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]));
    if(points.length<2)return;
    const lat0=points.reduce((acc,p)=>acc+p[1],0)/points.length;
    const scaleLon=Math.max(.01,Math.cos(lat0*Math.PI/180));
    const xs=points.map(p=>p[0]*scaleLon),ys=points.map(p=>p[1]);
    const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
    const spanX=Math.max(0.00015,xmax-xmin),spanY=Math.max(0.00015,ymax-ymin);
    const factor=Math.min(520/spanX,340/spanY),ox=300-(xmin+xmax)*factor/2,oy=210+(ymin+ymax)*factor/2;
    project=(lon,lat)=>[lon*scaleLon*factor+ox,oy-lat*factor];
    limits={xmin,xmax,ymin,ymax,scaleLon};
    const path=points.map((p,i)=>{const xy=project(p[0],p[1]);return(i?'L':'M')+xy.map(n=>n.toFixed(1)).join(' ')}).join(' ');
    host.append(svg('path',{d:path,fill:'none',stroke:'#ff914d','stroke-width':7,'stroke-linecap':'round','stroke-linejoin':'round'}));
    const start=project(points[0][0],points[0][1]),end=project(points[points.length-1][0],points[points.length-1][1]);
    host.append(svg('circle',{cx:start[0],cy:start[1],r:9,fill:'#e9f1ff',stroke:'#16283e','stroke-width':4}));
    host.append(svg('circle',{cx:end[0],cy:end[1],r:10,fill:'#ff914d',stroke:'#172638','stroke-width':4}));
    if(location){
      const [lon,lat]=location,close=lon*scaleLon>=xmin-spanX*.2&&lon*scaleLon<=xmax+spanX*.2&&lat>=ymin-spanY*.2&&lat<=ymax+spanY*.2;
      if(close){const [x,y]=project(lon,lat);host.append(svg('circle',{cx:x,cy:y,r:12,fill:'#60cfff',stroke:'#14233b','stroke-width':5}))}
      else $('offlineGpsStatus').textContent='Seu GPS está fora da área deste trajeto salvo.';
    }
  }
  function showRoute(route){
    selected=route;
    detail.classList.add('show');
    $('offlineRouteTitle').textContent=line(route.origin,route.destination);
    const distance=route.distance>0?(route.distance/1000).toFixed(1).replace('.',',')+' km · ':'';
    $('offlineRouteMeta').textContent=distance+'Usada '+route.useCount+' vez(es) · Último uso: '+fmtDate(route.lastUsedAt)+' · '+route.profile;
    $('offlineGpsStatus').textContent='';
    draw(route);
    const steps=(route.steps||[]).filter(s=>s.instruction).slice(0,60),stepsNode=$('offlineSteps');
    stepsNode.replaceChildren();
    $('offlineInstructions').hidden=!steps.length;
    steps.forEach(s=>{const li=document.createElement('li');li.textContent=s.instruction;stepsNode.appendChild(li)});
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function refresh(){
    toggle.checked=api.enabled();
    try{
      const items=await api.list();list.replaceChildren();
      $('offlineCounter').textContent=items.length+' / '+api.MAX_ROUTES;
      status.textContent=items.length?'Rotas mais repetidas aparecem primeiro.':'';
      if(!items.length){
        const empty=document.createElement('div');empty.className='empty';
        empty.textContent=api.enabled()?'Ainda não há rotas salvas. Inicie uma navegação com internet para guardar seu primeiro caminho.':'Ative o salvamento acima e inicie uma navegação com internet para guardar seu primeiro caminho.';
        list.appendChild(empty);
      }
      items.forEach(route=>{
        const btn=document.createElement('button');btn.type='button';btn.className='route';
        const name=document.createElement('b');name.textContent=line(route.origin,route.destination);
        const meta=document.createElement('small');meta.textContent='Usada '+route.useCount+' vez(es) · '+fmtDate(route.lastUsedAt);
        btn.append(name,meta);btn.addEventListener('click',()=>showRoute(route));list.appendChild(btn);
      });
      if(selected&&!items.some(r=>r.id===selected.id)){selected=null;detail.classList.remove('show')}
    }catch(e){status.textContent='O armazenamento offline não está disponível neste aparelho: '+(e?.message||'erro');toggle.disabled=true}
  }
  toggle.addEventListener('change',async()=>{
    const want=toggle.checked;
    if(!want&&!confirm('Desativar e apagar todas as rotas guardadas neste aparelho?')){toggle.checked=true;return}
    toggle.disabled=true;
    try{await api.setEnabled(want);selected=null;detail.classList.remove('show');await refresh()}
    catch(e){status.textContent='Não foi possível alterar o salvamento: '+(e?.message||'erro');toggle.checked=api.enabled()}
    finally{toggle.disabled=false}
  });
  $('offlineClear').addEventListener('click',async()=>{
    if(!confirm('Apagar permanentemente todas as rotas guardadas neste aparelho?'))return;
    try{await api.clear();selected=null;detail.classList.remove('show');await refresh()}
    catch(e){status.textContent='Falha ao apagar rotas: '+(e?.message||'erro')}
  });
  $('offlineDelete').addEventListener('click',async()=>{
    if(!selected||!confirm('Apagar este trajeto do dispositivo?'))return;
    try{await api.remove(selected.id);selected=null;detail.classList.remove('show');await refresh()}
    catch(e){status.textContent='Não foi possível apagar: '+(e?.message||'erro')}
  });
  $('offlineLocate').addEventListener('click',()=>{
    if(!selected||!navigator.geolocation){$('offlineGpsStatus').textContent='GPS indisponível.';return}
    $('offlineGpsStatus').textContent='Buscando posição do dispositivo…';
    navigator.geolocation.getCurrentPosition(
      pos=>{$('offlineGpsStatus').textContent='Posição aproximada do GPS (ponto azul).';draw(selected,[pos.coords.longitude,pos.coords.latitude])},
      ()=>{$('offlineGpsStatus').textContent='Não foi possível acessar o GPS. Confira a permissão de localização.'},
      {enableHighAccuracy:true,timeout:9000,maximumAge:20000}
    );
  });
  refresh();
})();
