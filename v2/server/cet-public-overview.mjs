/** Official CET São Paulo aggregated congestion viewer (administrator only).
 * Does NOT scrape Waze traffic segments or infer any per-road speeds.
 * Published municipal totals are only a background plausibility check.
 * Fetch is on-demand with cache; no storage, no ETA penalty.
 */
const OFFICIAL='https://www.cetsp.com.br/transito-agora/transito-nas-principais-vias.aspx';
const ttl=15*60*1000;let saved=null;let lastAttempt=0;
export const CET_SP_SOURCE=Object.freeze({name:'CET São Paulo — Trânsito Agora',
 url:OFFICIAL,coverage:'Município de São Paulo',
 granularity:'Agregado por região, não por rua',reuse:'Somente referência no painel administrativo; licença de redistribuição pendente',
 affectsEta:false});
function strip(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/\s+/g,' ').trim();
}
export function parseCetOverview(html){
 if(typeof html!=='string'||html.length>1300000)return null;
 const body=strip(html),areas=['Norte','Oeste','Centro','Leste','Sul'];
 const out=[];
 for(const area of areas){
  // Exact section name, km and percentage must be present; no extrapolation.
  const match=body.match(new RegExp('(?:^|\\s)'+area+'\\s+Lentid[aã]o\\s*:\\s*(\\d{1,4})\\s*km\\s*\\(\\s*(\\d{1,3})\\s*%\\s*\\)','i'));
  if(!match)return null;
  const km=Number(match[1]),pct=Number(match[2]);
  if(km>2000||pct>100)return null;
  out.push({region:area,congestionKm:km,reportedPercent:pct});
 }
 return out;
}
export async function cetPublicOverview({fetcher=fetch,now=Date.now}={}){
 const t=now();
 if(saved&&t-saved.at<ttl)return {...saved.value,cached:true};
 if(t-lastAttempt<60000)return {status:'unavailable',source:CET_SP_SOURCE,
  note:'Consulta recente sem resultados; veja diretamente a fonte CET.'};
 lastAttempt=t;
 let value;
 try{
  const res=await fetcher(OFFICIAL,{signal:AbortSignal.timeout(5000),headers:{Accept:'text/html'}});
  if(!res.ok||Number(res.headers?.get?.('content-length')||0)>1300000)throw Error('unavailable');
  const html=await res.text();
  const regions=parseCetOverview(html);
  if(!regions)throw Error('unexpected-site-format');
  value={status:'available',source:CET_SP_SOURCE,
    retrievedAt:new Date(t).toISOString(),observedAt:null,
    regions,affectsEta:false,
    note:'Indicador municipal agregado da CET; não comprova velocidade ou lentidão da rota consultada.'};
 }catch{value={status:'unavailable',source:CET_SP_SOURCE,affectsEta:false,
   note:'Não foi possível ler o resumo público agora. Consulte a página oficial.'};}
 saved={at:t,value};
 return value;
}
