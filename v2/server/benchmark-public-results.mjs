/**
 * Public benchmark results contract — curated, non-personal measurements.
 * This does NOT execute, mutate or auto-publish the route benchmark endpoint.
 * Publication requires changing the audited public dataset in a reviewed commit.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const dataPath=fileURLToPath(new URL('../seo/public-benchmark-records.json',import.meta.url));
const CATEGORIES=new Set(['centro','residencial','avenidas','travessias','congestionamento']);
const SOURCES=new Set(['vano_fastest','google_maps']);
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?x:null;
const label=x=>typeof x==='string'?x.trim().slice(0,140):'';
const median=xs=>{const sorted=[...xs].sort((a,b)=>a-b);const n=sorted.length;if(!n)return null;return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2};
const quantile=(xs,q)=>{const a=[...xs].sort((x,y)=>x-y);if(!a.length)return null;const pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return a[lo]+(a[hi]-a[lo])*(pos-lo)};
const mean=xs=>xs.length?xs.reduce((s,n)=>s+n,0)/xs.length:null;

export function validatedPublicBenchmarks(raw){
  if(!Array.isArray(raw)||raw.length>2000)throw Error('Invalid published benchmark dataset');
  const seen=new Set();
  return raw.map(r=>{
    if(!r||r.published!==true||r.publicPlacesOnly!==true) return null;
    const id=label(r.id),origin=label(r.origin),destination=label(r.destination);
    const category=label(r.category),source=label(r.reference?.source);
    if(!/^[\w.:--]{4,90}$/.test(id)||seen.has(id)||!origin||!destination||!CATEGORIES.has(category)||!SOURCES.has(source))return null;
    const at=stamp(r.measuredAt),referenceAt=stamp(r.reference?.measuredAt),vanoAt=stamp(r.vano?.measuredAt);
    if(!at||!referenceAt||!vanoAt||Math.abs(Date.parse(referenceAt)-Date.parse(vanoAt))>900000)return null;
    const refEta=numeric(r.reference?.etaMin),vanoEta=numeric(r.vano?.etaMin);
    const refKm=numeric(r.reference?.distanceKm),vanoKm=numeric(r.vano?.distanceKm);
    const evidence=label(r.reference?.evidenceUrl);
    if((refEta===null&&refKm===null)||(vanoEta===null&&vanoKm===null))return null;
    if(source==='google_maps'&&!/^https:\/\/[^/\s]+/.test(evidence))return null;
    seen.add(id);
    return {
      id,measuredAt:at,origin,destination,category,profile:r.profile==='motorcycle'?'motorcycle':'driving',
      reference:{source,etaMin:refEta,distanceKm:refKm,measuredAt:referenceAt,routeId:label(r.reference?.routeId),evidenceUrl:evidence},
      vano:{mode:label(r.vano?.mode)||'fastest',etaMin:vanoEta,distanceKm:vanoKm,measuredAt:vanoAt,routeId:label(r.vano?.routeId),provider:label(r.vano?.provider),latencyMs:numeric(r.vano?.latencyMs),trafficScore:numeric(r.vano?.trafficScore),safetyScore:numeric(r.vano?.safetyScore)},
      delta:{etaMin:refEta!==null&&vanoEta!==null?refEta-vanoEta:null,
        etaPercent:refEta!==null&&vanoEta!==null&&refEta>0?100*(refEta-vanoEta)/refEta:null,
        distanceKm:refKm!==null&&vanoKm!==null?refKm-vanoKm:null,
        distancePercent:refKm!==null&&vanoKm!==null&&refKm>0?100*(refKm-vanoKm)/refKm:null}
    };
  }).filter(Boolean).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt)||a.id.localeCompare(b.id));
}
export function publicBenchmarkPayload({query=new URLSearchParams(),now=new Date()}={}){
  let source=query.get('source')||'vano_fastest',category=query.get('category')||'',period=query.get('period')||'30d',page=Number(query.get('page')||1);
  if(!SOURCES.has(source)&&source!=='all')source='vano_fastest';
  if(!CATEGORIES.has(category))category='';
  if(!['7d','30d','all'].includes(period))period='30d';
  if(!Number.isSafeInteger(page)||page<1)page=1;
  page=Math.min(10000,page);
  const raw=JSON.parse(fs.readFileSync(dataPath,'utf8'));
  const rows=validatedPublicBenchmarks(raw?.records||[]);
  const cutoff=period==='all'?null:now.getTime()-(period==='7d'?7:30)*86400000;
  const filtered=rows.filter(r=>(source==='all'||r.reference.source===source)&&(!category||r.category===category)&&(!cutoff||Date.parse(r.measuredAt)>=cutoff));
  const eta=filtered.map(r=>r.delta.etaMin).filter(n=>n!==null),pct=filtered.map(r=>r.delta.etaPercent).filter(n=>n!==null);
  const latency=filtered.map(r=>r.vano.latencyMs).filter(n=>n!==null);
  const homogeneous=source!=='all';
  return {protocol:'vano-public-benchmark-results',version:'1.0',generatedAt:now.toISOString(),total:filtered.length,page,pageSize:25,
    filters:{source,category,period},dataStatus:filtered.length?'published':'no_published_results',
    statistics:{etaSampleSize:eta.length,meanEtaDifferenceMin:homogeneous?mean(eta):null,
      medianEtaDifferenceMin:homogeneous?median(eta):null,meanEtaDifferencePercent:homogeneous?mean(pct):null,
      medianLatencyMs:median(latency),p95LatencyMs:quantile(latency,.95)},
    records:filtered.slice((page-1)*25,page*25),
    units:{eta:'minutes',distance:'kilometers',latency:'milliseconds'},
    interpretation:'Delta equals reference minus VANO. Positive means lower predicted ETA or shorter distance for VANO, not proven real-world arrival.',
    provenance:'Only reviewed, explicitly published, non-personal runs. VANO fastest is an internal baseline, not Google Maps.',
    limitations:['Benchmark endpoint does not store history automatically.','Estimated arrival times are not observed travel times.',
      'Traffic and safety signals are not safety guarantees.','Different reference providers are not pooled into one ETA average.']
  };
}
