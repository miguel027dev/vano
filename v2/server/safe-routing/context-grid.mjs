/** Private infrastructure context, never an automatic safety score. */
import {authorizeB2,readB2Object} from './b2-storage.mjs';
import {b2RuntimeConfig,decodeSnapshotObject} from './b2-snapshot.mjs';
import {tilesForRoute} from './lighting-grid.mjs';
import {inspectLayer} from './spatial-context.mjs';
import {SAFE_ROUTING_DATASET_POLICY} from './dataset-policy.mjs';
export const CONTEXT_LAYERS=Object.freeze({roads:25,sidewalks:20,busLanes:12,hydrologicalRisk:0,floodHistory:50});
const cache=new Map();let cacheBytes=0;
async function cached(key,loader){
 const prior=cache.get(key);if(prior&&prior.expires>Date.now())return prior.body;
 if(prior){cacheBytes-=prior.body.length;cache.delete(key);}
 const body=await loader();
 while(cache.size&&(cacheBytes+body.length>40000000||cache.size>=150)){
  const first=cache.keys().next().value;cacheBytes-=cache.get(first).body.length;cache.delete(first);
 }
 if(body.length<=5000000){cache.set(key,{body,expires:Date.now()+300000});cacheBytes+=body.length;}
 return body;
}
export function validateContextIndex(index,key,snapshot){
 if(index.kind!=='context-grid-v1'||index.key!==key||index.sourceLayer!==SAFE_ROUTING_DATASET_POLICY[key]?.layer||index.snapshotId!==snapshot||index.complete!==true||index.gridScale!==50||index.usedForRouting!==false||index.stage!=='private-evaluation-unapproved'||!index.tiles||Object.keys(index.tiles).length>1800||index.features<1||index.features+index.rejected!==index.reportedTotal)throw Error('Índice de contexto inválido');
 for(const [tile,o] of Object.entries(index.tiles)){
  if(!/^-?\d+_-?\d+$/.test(tile)||!o.path?.startsWith(`snapshots/${snapshot}/bundles/`)||!/^\d+\.bin$/.test(o.path.split('/').at(-1))||!Number.isSafeInteger(o.offset)||o.offset<0||!Number.isSafeInteger(o.bytes)||o.bytes<1||o.bytes>5000000||o.offset+o.bytes>25000000||!Number.isSafeInteger(o.features)||o.features<1||o.features>100000||!/^[a-f0-9]{64}$/.test(o.sha256))throw Error('Tile de contexto inválido');
 }
 return index;
}
export async function compareInfrastructure(routes,{env=process.env,fetcher=fetch}={}){
 if(!Array.isArray(routes)||!routes.length||routes.length>4)throw Error('Candidatos inválidos');
 const ids=JSON.parse(env.VANO_SAFE_B2_CONTEXT_GRIDS||'{}'),keys=[...new Set(routes.flatMap(tilesForRoute))];
 if(keys.length>25)throw Error('Área excessiva');
 const originalFetcher=fetcher,deadline=AbortSignal.timeout(25000);
 fetcher=(url,options={})=>originalFetcher(url,{...options,signal:options.signal?AbortSignal.any([deadline,options.signal]):deadline});
 const config=b2RuntimeConfig(env),authorization=await authorizeB2(config,{fetcher});
 const layers={};let totalBytes=0,totalFeatures=0;
 for(const [key,radius] of Object.entries(CONTEXT_LAYERS)){
  const snapshot=ids[key];if(!/^geosampa-[a-z0-9-]+-context$/.test(snapshot||''))throw Error(`Camada não configurada: ${key}`);
 const index=validateContextIndex(JSON.parse(await cached(`${config.bucketName}:${snapshot}:index`,()=>readB2Object({authorization,config,path:`snapshots/${snapshot}/index.json`,fetcher}))),key,snapshot);
  const features=new Map();
  for(let start=0;start<keys.length;start+=4){
   const pages=await Promise.all(keys.slice(start,start+4).map(async tile=>{
    const o=index.tiles[tile];if(!o)return [];
    totalBytes+=o.bytes;if(totalBytes>50000000)throw Error('Orçamento de consulta excedido');
    const body=await cached(`${config.bucketName}:${snapshot}:${tile}:${o.sha256}`,()=>readB2Object({authorization,config,path:o.path,range:{offset:o.offset,length:o.bytes},maxBytes:5000000,fetcher}));
    return decodeSnapshotObject(body,o).features;
   }));
   for(const page of pages)for(const feature of page){if(!features.has(feature.id))totalFeatures++;features.set(feature.id,feature);}
   if(totalFeatures>150000)throw Error('Feições excedem o limite');
  }
  layers[key]={snapshotId:snapshot,sourceFeatures:index.features,rejected:index.rejected,attributeFeatures:index.attributeFeatures,collectedAt:index.collectedAt,queriedFeatures:features.size,comparisons:routes.map(r=>({id:r.id,...inspectLayer(r,[...features.values()],{radius,key})}))};
 }
 return {complete:true,queriedTiles:keys.length,queriedBytes:totalBytes,layers,usedForRouting:false,licenseReviewed:false,requestedAt:new Date().toISOString(),timeZone:'America/Sao_Paulo',warning:'Amostragem a cada 50 m, não uma inspeção contínua. Dados cadastrais e históricos não confirmam condições atuais nem ausência de perigo. Horários de faixas são informativos e não alteram restrições do provedor.'};
}
