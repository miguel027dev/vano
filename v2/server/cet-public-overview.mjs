/** CET São Paulo public congestion totals, administrator-only observational
 * context. No segment speeds, no route-wide corrections, no trip tracking.
 * Public CET HTML is not a versioned API: accept only audited formats and
 * explicitly report an unavailable source rather than fabricating a reading.
 */
const OFFICIAL='https://www.cetsp.com.br/transito-agora/transito-nas-principais-vias.aspx';
const OFFICIAL_ENDPOINTS=Object.freeze([
 'https://ssl.cetsp.com.br/transito-agora/transito-nas-principais-vias.aspx',
 OFFICIAL,
 'https://www.cetsp.com.br/',
 'https://ssl.cetsp.com.br/'
]);
const SUCCESS_TTL=2*60_000,RETRY_AFTER_FAILURE=45_000,MAX_BYTES=1_300_000;
const REGIONS=Object.freeze(['Norte','Oeste','Centro','Leste','Sul']);
export const CET_SP_SOURCE=Object.freeze({
 name:'CET São Paulo — Trânsito Agora',url:OFFICIAL,
 coverage:'Município de São Paulo',granularity:'Agregado por região, não por rua',
 reuse:'Somente referência no painel administrativo; licença de redistribuição pendente',
 affectsEta:false
});
function strip(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&(?:nbsp|#160|#xA0);/gi,' ')
  .replace(/&atilde;/gi,'ã')
  .replace(/&ccedil;/gi,'ç')
  .replace(/\s+/g,' ').trim();
}
export function parseCetOverview(html){
 if(typeof html!=='string'||!html||html.length>MAX_BYTES)return null;
 const body=strip(html),out=[];
 for(const area of REGIONS){
  // CET publishes at least two distinct templates:
  // 1: "Norte Lentidão: 64 km(18%)"
  // 2: "Norte 88 km de lentidão (16%)"
  // A tight anchored pattern avoids reading unrelated figures from navigation.
  const prefix='(?:^|\\s)'+area+'\\s+';
  const slowdown='lentid[aãá�]o';
  const suffix='\\s*\\(\\s*(\\d{1,3})\\s*%\\s*\\)';
  const patterns=[
   new RegExp(prefix+slowdown+'\\s*:\\s*(\\d{1,4}(?:[.,]\\d)?)\\s*km'+suffix,'i'),
   new RegExp(prefix+'(\\d{1,4}(?:[.,]\\d)?)\\s*km\\s+de\\s+'+slowdown+suffix,'i')
  ];
  const match=patterns.map(re=>body.match(re)).find(Boolean);
  if(!match)return null;
  const km=Number(match[1].replace(',','.')),pct=Number(match[2]);
  if(!Number.isFinite(km)||km<0||km>2000||!Number.isInteger(pct)||pct<0||pct>100)return null;
  out.push({region:area,congestionKm:km,reportedPercent:pct});
 }
 return out.length===REGIONS.length?out:null;
}
function classifyFailure(e){
 const detail=String(e?.message||'');
 if(detail==='site-format-unrecognized')return 'site-format-unrecognized';
 if(detail==='payload-too-large')return 'payload-too-large';
 if(detail==='http-rejected')return 'http-rejected';
 if(e?.name==='TimeoutError'||e?.name==='AbortError')return 'request-timeout';
 return 'network-or-provider-failure';
}
export function createCetGateway({fetcher=fetch,now=Date.now}={}){
 let saved=null,lastFailure=0,pending=null;
 async function lookup(){
  const t=now(),attempts=[];
  for(const url of OFFICIAL_ENDPOINTS){
   try{
    const res=await fetcher(url,{
     signal:AbortSignal.timeout(3300),
     headers:{Accept:'text/html,application/xhtml+xml',
      'Accept-Language':'pt-BR,pt;q=0.9',
      'User-Agent':'VANO-Maps/1.0 (+https://vanomaps.online)'}
    });
    if(!res?.ok)throw Error('http-rejected');
    if(Number(res.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('payload-too-large');
    const html=await res.text();
    if(typeof html!=='string'||html.length>MAX_BYTES)throw Error('payload-too-large');
    const regions=parseCetOverview(html);
    if(!regions)throw Error('site-format-unrecognized');
    return {
     status:'available',source:CET_SP_SOURCE,sourceUrl:url,
     retrievedAt:new Date(t).toISOString(),observedAt:null,
     freshness:'not-provided-by-cet',regions,affectsEta:false,
     attemptedSources:attempts.length+1,
     note:'CET por região. Horário da observação não informado nesta página; consulta não comprova a velocidade do percurso.'
    };
   }catch(error){
    attempts.push({host:new URL(url).host,reason:classifyFailure(error)});
   }
  }
  lastFailure=now();
  return {status:'unavailable',source:CET_SP_SOURCE,affectsEta:false,
   failureReason:attempts.at(-1)?.reason||'unknown',
   attemptedSources:attempts.length,
   // No raw provider exceptions, tokens or upstream HTML in responses/logs.
   note:'Nenhum endereço oficial da CET retornou todos os cinco índices em formato verificável. Consulte a página oficial.'};
 }
 return async function overview(){
  const t=now();
  if(saved&&t-saved.at<SUCCESS_TTL)return {...saved.value,cached:true};
  if(pending)return pending;
  if(lastFailure&&t-lastFailure<RETRY_AFTER_FAILURE)
   return {status:'unavailable',source:CET_SP_SOURCE,affectsEta:false,
    retryAfterSeconds:Math.ceil((RETRY_AFTER_FAILURE-(t-lastFailure))/1000),
    failureReason:'cooldown-after-failure',attemptedSources:0,
    note:'A CET não respondeu na tentativa recente. Nova consulta poderá ser feita após o intervalo de proteção.'};
  pending=lookup();
  try{
   const value=await pending;
   if(value.status==='available')saved={at:now(),value};
   return value;
  }finally{pending=null;}
 };
}
const gateway=createCetGateway();
export async function cetPublicOverview({fetcher,now}={}){
 // Test injectability retained without ever using client-supplied endpoints.
 if(fetcher||now){
  return testGateway({fetcher,now});
 }
 return gateway();
}
let injected=null,injectedFetcher=null,injectedNow=null;
function testGateway({fetcher=fetch,now=Date.now}={}){
 if(!injected||injectedFetcher!==fetcher||injectedNow!==now){
  injected=createCetGateway({fetcher,now});injectedFetcher=fetcher;injectedNow=now;
 }
 return injected();
}
