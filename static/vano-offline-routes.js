/* VANO MAPS — rotas usadas, locais e disponíveis sem rede (não é roteamento offline). */
(()=>{
  'use strict';
  const DB_NAME='vano-offline-routes-v1', STORE='routes', OPT_IN='vano.offline-routes.enabled.v1';
  const MAX_ROUTES=30, MAX_POINTS=1400, MAX_STEPS=60;
  function enabled(){try{return localStorage.getItem(OPT_IN)==='yes'}catch{return false}}
  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('Armazenamento offline indisponível'));return}
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Falha no armazenamento offline'));
      req.onblocked=()=>reject(new Error('Banco offline ocupado'));
    });
  }
  function all(db){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
      tx.oncomplete=()=>resolve(req.result||[]);
      tx.onerror=()=>reject(tx.error||new Error('Leitura offline indisponível'));
      tx.onabort=()=>reject(tx.error||new Error('Leitura offline cancelada'));
    });
  }
  function write(db,changes=[],removals=[]){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
      changes.forEach(item=>store.put(item));
      removals.forEach(id=>store.delete(id));
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Falha ao salvar rota'));
      tx.onabort=()=>reject(tx.error||new Error('Gravação offline cancelada'));
    });
  }
  function point(value){
    if(!value||value.lat==null||value.lon==null)return null;
    const lat=Number(value.lat),lon=Number(value.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
    return {lat,lon,label:String(value.label||value.name||'').slice(0,130)};
  }
  function geometry(route){
    const raw=route?.geometry?.coordinates;
    if(!Array.isArray(raw)||raw.length<2)return [];
    const count=Math.min(raw.length,MAX_POINTS),output=[];
    for(let i=0;i<count;i++){
      const pos=raw[Math.round(i*(raw.length-1)/(count-1))];
      if(!Array.isArray(pos)||pos.length<2)continue;
      const lon=Number(pos[0]),lat=Number(pos[1]);
      if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)output.push([+lon.toFixed(6),+lat.toFixed(6)]);
    }
    return output;
  }
  function routeId(start,end,profile){
    // ~110m latitude cells. Repetir o mesmo trajeto não cria centenas de cópias por ruído no GPS.
    return profile+':'+[start.lat,start.lon,end.lat,end.lon].map(n=>n.toFixed(3)).join(':');
  }
  async function list(){
    const db=await openDB();
    try{return (await all(db)).sort((a,b)=>(b.useCount||0)-(a.useCount||0)||(b.lastUsedAt||0)-(a.lastUsedAt||0))}
    finally{db.close()}
  }
  async function save(detail){
    if(!enabled())return false;
    const start=point(detail?.origin),end=point(detail?.destination),route=detail?.route;
    const profile=['driving','motorcycle','walking','cycling'].includes(detail?.profile)?detail.profile:'driving';
    const coords=geometry(route);
    if(!start||!end||coords.length<2)return false;
    const id=routeId(start,end,profile),db=await openDB();
    try{
      const items=await all(db),prior=items.find(x=>x.id===id);
      const steps=(Array.isArray(route.steps)?route.steps:[]).slice(0,MAX_STEPS).map(step=>({
        instruction:String(step.instruction||step.maneuver?.instruction||step.name||'').slice(0,180),
        distance:Math.max(0,Number(step.distance)||0)
      })).filter(s=>s.instruction);
      const row={id,origin:start,destination:end,profile,geometry:coords,steps,
        distance:Math.max(0,Number(route.distance)||0),
        duration:Math.max(0,Number(route.duration)||0),
        firstUsedAt:prior?.firstUsedAt||Date.now(),lastUsedAt:Date.now(),
        useCount:Math.min(99999,(Number(prior?.useCount)||0)+1)};
      const remaining=items.filter(x=>x.id!==id).concat(row);
      // Keep recently used journeys plus older frequent journeys, within 30 records.
      remaining.sort((a,b)=>(b.useCount||0)*0.35+(b.lastUsedAt||0)/86400000-((a.useCount||0)*0.35+(a.lastUsedAt||0)/86400000));
      const drop=remaining.slice(MAX_ROUTES).map(x=>x.id);
      await write(db,[row],drop);
      return true;
    }finally{db.close()}
  }
  async function remove(id){const db=await openDB();try{await write(db,[],[String(id)])}finally{db.close()}}
  async function clear(){const db=await openDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
  async function setEnabled(value){
    if(value){localStorage.setItem(OPT_IN,'yes');return}
    localStorage.removeItem(OPT_IN);
    await clear();
  }
  window.VANO_OFFLINE_ROUTES=Object.freeze({enabled,setEnabled,list,save,remove,clear,MAX_ROUTES});
  window.addEventListener('vano:offline-route-used',event=>{
    if(enabled())save(event.detail).catch(err=>console.warn('[VANO:offline-routes]',err?.message||err));
  });
})();
