/**
 * VANO V2 API observability.
 *
 * Stores bounded hourly aggregate metrics rather than raw trips/addresses.
 * Never persist endpoint URLs, query strings, tokens, precise coordinates,
 * request bodies or response bodies. Retry attempts count as real HTTP calls.
 */
const HOUR_MS=3600000;
const KEEP_HOURS=24*40;
const DURATION_BUCKETS=[100,250,500,1000,2000,5000,10000,30000,60000];
const SOURCE_CATALOG=[
 ['mapbox','Mapbox','Rotas e geocodificação'],
 ['tomtom','TomTom','Trânsito e incidentes'],
 ['open-meteo','Open-Meteo','Meteorologia'],
 ['overpass','OpenStreetMap / Overpass','Dados viários'],
 ['viacep','ViaCEP','Consultas de CEP'],
 ['brasilapi','BrasilAPI','Consultas de CEP'],
 ['openrouteservice','OpenRouteService','Rotas alternativas'],
 ['v1-router','Motor de rotas V1','Integração com motor legado']
];
const DEFAULT_RANGES=new Set(['24h','7d','30d']);
const SOURCE_NAMES=new Map(SOURCE_CATALOG.map(([id,label,description])=>[id,{label,description}]));
const num=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const cap=v=>Math.min(1e12,num(v));
const int=v=>Math.trunc(cap(v));
const hourly=ms=>Math.floor(ms/HOUR_MS);
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x)?x:null;
const safeOperation=x=>typeof x==='string'&&/^[A-Za-z0-9_:/.-]{1,80}$/.test(x)?x:'other';

export function sourceForUrl(input,env=process.env){
 let url;
 try{url=new URL(typeof input==='string'||input instanceof URL?input:input?.url);}catch{return null;}
 const host=url.hostname.toLowerCase();
 const path=url.pathname.toLowerCase();
 if(host==='api.mapbox.com')return {id:'mapbox',operation:path.startsWith('/directions/')?'directions':path.includes('geocoding')?'geocoding':path.includes('/styles/')?'styles':'other'};
 if(host==='api.tomtom.com'||host.endsWith('.api.tomtom.com'))return {id:'tomtom',operation:'traffic'};
 if(host==='api.open-meteo.com')return {id:'open-meteo',operation:'weather'};
 if(host==='overpass-api.de'||host==='overpass.kumi.systems'||host==='overpass.nchc.org.tw')return {id:'overpass',operation:'road-data'};
 if(host==='viacep.com.br'||host==='www.viacep.com.br')return {id:'viacep',operation:'cep'};
 if(host==='brasilapi.com.br'||host==='brasilapi.com')return {id:'brasilapi',operation:'cep'};
 if(host==='api.openrouteservice.org')return {id:'openrouteservice',operation:'route'};
 try{
  const v1=new URL(env.VANO_V1_API_URL||'');
  if(url.origin===v1.origin&&v1.hostname&&v1.protocol.startsWith('http'))return {id:'v1-router',operation:'route'};
 }catch{}
 return null;
}
function defaultMetric(){
 return {count:0,success:0,errors:0,rateLimits:0,sumMs:0,maxMs:0,hist:Array(DURATION_BUCKETS.length+1).fill(0),bytesOut:0,bytesKnown:0,lastAt:null,lastStatus:null,operations:{}};
}
function cleanMetric(raw){
 const fresh=defaultMetric(),v=raw&&typeof raw==='object'?raw:{};
 for(const key of ['count','success','errors','rateLimits','sumMs','maxMs','bytesOut','bytesKnown'])fresh[key]=cap(v[key]);
 fresh.hist=Array.from({length:DURATION_BUCKETS.length+1},(_,i)=>cap(v.hist?.[i]));
 fresh.lastAt=typeof v.lastAt==='string'&&v.lastAt.length<=40?v.lastAt:null;
 fresh.lastStatus=Number.isInteger(v.lastStatus)?v.lastStatus:null;
 if(v.operations&&typeof v.operations==='object')for(const [name,value]of Object.entries(v.operations).slice(0,60)){
  if(safeOperation(name)===name)fresh.operations[name]=cap(value);
 }
 return fresh;
}
function add(metric,{status=599,elapsedMs=0,operation='other',responseBytes=null,stamp}={}){
 const s=Number(status)||599,ms=Math.min(60000,int(elapsedMs));
 metric.count++;metric.success+=Number(s>=200&&s<400);
 metric.errors+=Number(s<200||s>=400);metric.rateLimits+=Number(s===429);
 metric.sumMs+=ms;metric.maxMs=Math.max(metric.maxMs,ms);
 const b=DURATION_BUCKETS.findIndex(v=>ms<=v);
 metric.hist[b<0?DURATION_BUCKETS.length:b]++;
 const op=safeOperation(operation);
 if(Object.keys(metric.operations).length<60||Object.hasOwn(metric.operations,op))metric.operations[op]=(metric.operations[op]||0)+1;
 if(responseBytes!==null&&responseBytes!==undefined&&Number.isFinite(Number(responseBytes))){
  metric.bytesOut+=cap(responseBytes);metric.bytesKnown++;
 }
 metric.lastStatus=s;metric.lastAt=new Date(stamp).toISOString();
}
function sumMetrics(rows){
 const result=defaultMetric();
 for(const metric of rows){
  for(const key of ['count','success','errors','rateLimits','sumMs','bytesOut','bytesKnown'])result[key]+=num(metric[key]);
  result.maxMs=Math.max(result.maxMs,num(metric.maxMs));
  metric.hist?.forEach((n,i)=>{if(i<result.hist.length)result.hist[i]+=num(n)});
  if(metric.lastAt&&(!result.lastAt||metric.lastAt>result.lastAt)){
   result.lastAt=metric.lastAt;result.lastStatus=metric.lastStatus;
  }
  for(const [name,count]of Object.entries(metric.operations||{}))result.operations[name]=(result.operations[name]||0)+num(count);
 }
 return result;
}
function displayMetric(metric,{id,label,description,configured=null,tariff=null}={}){
 const n=metric.count||0,threshold=n*.95;
 let p95=null,cumulative=0;
 if(n>0)for(let i=0;i<metric.hist.length;i++){
  cumulative+=metric.hist[i]||0;
  if(cumulative>=threshold){p95=i<DURATION_BUCKETS.length?DURATION_BUCKETS[i]:60000;break}
 }
 const status=n===0?'sem-dados':metric.success===0||n>=5&&metric.errors/n>=.1?'degradado':'medido';
 return {
  id,label,description,configured,status,requests:n,successes:metric.success,errors:metric.errors,
  rate_limits:metric.rateLimits,success_pct:n?Math.round(metric.success/n*1000)/10:null,
  avg_ms:n?Math.round(metric.sumMs/n):null,p95_ms_upper_bound:p95,
  last_at:metric.lastAt,last_http_status:metric.lastStatus,
  response_bytes:metric.bytesKnown?metric.bytesOut:null,
  bytes_measured_requests:metric.bytesKnown,
  estimated_cost_brl:tariff===null?null:Math.round(n*tariff/1000*1e5)/1e5,
  operations:Object.entries(metric.operations).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count}))
 };
}
function tariffs(env){
 try{const v=JSON.parse(env.VANO_API_TARIFFS_JSON||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}
}
function tariffFor(prices,kind,id){
 const n=Number(prices?.[kind]?.[id]);
 return typeof prices?.[kind]?.[id]!=='undefined'&&Number.isFinite(n)&&n>=0&&n<=1000000?n:null;
}

export function createApiObservability({db,persist=async()=>{},clock=Date.now,env=process.env}={}){
 if(!db||typeof db!=='object')throw Error('VANO observability requires a state object');
 db.apiObservability??={hours:{},version:1};
 if(!db.apiObservability.hours||typeof db.apiObservability.hours!=='object')db.apiObservability.hours={};
 const hours=db.apiObservability.hours;
 let dirty=false,saveTimer=null;
 function scheduleSave(){
  dirty=true;
  if(saveTimer)return;
  saveTimer=setTimeout(async()=>{
   saveTimer=null;if(!dirty)return;
   dirty=false;
   try{await persist({backup:false});}catch{dirty=true;}
  },30000);
  saveTimer.unref?.();
 }
 function prune(){
  const min=hourly(clock())-KEEP_HOURS;
  for(const key of Object.keys(hours)){
   const timestamp=Number(key.split('|',1)[0]);
   if(!Number.isInteger(timestamp)||timestamp<min||timestamp>hourly(clock())+1||Object.keys(hours).length>25000&&timestamp<hourly(clock())-24*30)delete hours[key];
  }
 }
 function record(kind,id,operation,status,elapsedMs,responseBytes=null){
  if(!['providers','partners'].includes(kind)||!safeId(id))return;
  const now=clock(),bucket=hourly(now),key=bucket+'|'+kind+'|'+id;
  if(Object.keys(hours).length>30000)prune();
  if(!Object.hasOwn(hours,key))hours[key]=defaultMetric();
  add(hours[key],{status,elapsedMs,operation,responseBytes,stamp:now});
  scheduleSave();
 }
 function recordPartner(req,res,started){
  const id=safeId(req.vanoVerifiedPartnerId);
  if(!id)return;
  let op='other';
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(!path.startsWith('/api/partner/v1/'))return;
   const segment=path.slice('/api/partner/v1/'.length).split('/').filter(Boolean);
   if(segment.length){
    // Avoid persisting opaque route/place IDs and any user-supplied path.
    const base=safeOperation(segment[0]);
    op=(req.method||'GET')+':'+base;
   }
  }catch{return}
  const bytes=Number.isFinite(res.vanoResponseBytes)?res.vanoResponseBytes:(Number.isFinite(req.vanoResponseBytes)?req.vanoResponseBytes:null);
  record('partners',id,op,res.statusCode||599,clock()-started,bytes);
 }
 function installFetchMeter(){
  const original=globalThis.fetch;
  if(typeof original!=='function')return()=>{};
  const wrapped=async function(input,options){
   const source=sourceForUrl(input,env);
   if(!source)return original.call(globalThis,input,options);
   const started=clock();let code=599;
   try{
    const result=await original.call(globalThis,input,options);
    code=result?.status||599;return result;
   }finally{record('providers',source.id,source.operation,code,clock()-started);}
  };
  globalThis.fetch=wrapped;
  return()=>{if(globalThis.fetch===wrapped)globalThis.fetch=original};
 }
 function report(range='24h'){
  const period=DEFAULT_RANGES.has(range)?range:'24h';
  const duration=period==='24h'?24:period==='7d'?168:720;
  const last=hourly(clock()),first=last-duration+1;
  const bySource=new Map(),byPartner=new Map(),counts={};
  for(const [key,raw]of Object.entries(hours)){
   const [bucket,kind,id]=key.split('|'),hour=Number(bucket);
   if(!Number.isInteger(hour)||hour<first||hour>last||!safeId(id))continue;
   const target=kind==='providers'?bySource:kind==='partners'?byPartner:null;
   if(!target)continue;
   const m=cleanMetric(raw);
   if(!target.has(id))target.set(id,[]);
   target.get(id).push(m);
   const aggregateKey=kind+'|'+bucket;
   counts[aggregateKey]=(counts[aggregateKey]||0)+m.count;
  }
  const prices=tariffs(env);
  const configured={
   mapbox:Boolean(env.MAPBOX_SECRET_TOKEN||env.VITE_MAPBOX_PUBLIC_TOKEN),
   tomtom:Boolean(env.VANO_TOMTOM_API_KEY||env.TOMTOM_API_KEY),
   'open-meteo':true,overpass:true,viacep:true,brasilapi:true,
   openrouteservice:Boolean(env.OPENROUTESERVICE_API_KEY),
   'v1-router':Boolean(env.VANO_V1_API_URL)
  };
  const sources=SOURCE_CATALOG.map(([id,label,description])=>displayMetric(sumMetrics(bySource.get(id)||[]),{id,label,description,configured:configured[id]??null,tariff:tariffFor(prices,'providers',id)}));
  for(const [id,entries]of bySource)if(!SOURCE_NAMES.has(id))sources.push(displayMetric(sumMetrics(entries),{id,label:id,tariff:tariffFor(prices,'providers',id)}));
  const partnerNames=new Map((db.partnerKeys||[]).map(k=>[k.id,k.name]));
  const partners=[...new Set([...partnerNames.keys(),...byPartner.keys()])].map(id=>displayMetric(sumMetrics(byPartner.get(id)||[]),{
   id,label:partnerNames.get(id)||'Parceiro '+id.slice(0,6),tariff:tariffFor(prices,'partners',id)
  }));
  sources.sort((a,b)=>b.requests-a.requests);
  partners.sort((a,b)=>b.requests-a.requests);
  const trend=[];
  for(let h=first;h<=last;h++){
   const when=new Date(h*HOUR_MS);
   trend.push({bucket:when.toISOString(),providers:counts['providers|'+h]||0,partners:counts['partners|'+h]||0});
  }
  return {
   range:period,generated_at:new Date(clock()).toISOString(),
   persistent:env.DATABASE_URL?true:false,
   sources,partners,trend,
   summary:{providerRequests:sources.reduce((n,x)=>n+x.requests,0),partnerRequests:partners.reduce((n,x)=>n+x.requests,0)},
   caveats:[
    'Dados reais coletados desde a ativação, sem retroatividade.',
    'p95 é limite superior aproximado por faixas de latência.',
    'Chamadas Mapbox feitas diretamente no navegador e solicitações fora de fetch não entram nesta medição.',
    'Custos são estimativas por tarifa configurada, não a fatura do fornecedor.',
    'Sem amostras não significa fonte indisponível.'
   ]
  };
 }
 function stop(){if(saveTimer)clearTimeout(saveTimer);saveTimer=null;}
 return {record,recordPartner,report,installFetchMeter,prune,stop};
}
