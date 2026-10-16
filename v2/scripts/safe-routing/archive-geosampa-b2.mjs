/** Private evaluation archive. No approval or route-selection flags are changed. */
import {gzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {fetchGeoSampaLayerPage,inspectGeoSampaCatalog} from '../../server/safe-routing/geosampa-wfs.mjs';
import {sanitizeGeoSampaPage} from '../../server/safe-routing/ingestion.mjs';
import {authorizeB2,uploadB2Object} from '../../server/safe-routing/b2-storage.mjs';
import {b2ConfigFromEnv} from './stage-geosampa-b2.mjs';
import {SAFE_ROUTING_DATASET_POLICY} from '../../server/safe-routing/dataset-policy.mjs';

if(process.env.SAFE_ALLOW_B2_UPLOAD!=='1'||!process.argv.includes('--apply'))throw Error('Carga privada exige --apply e SAFE_ALLOW_B2_UPLOAD=1');
const selected=process.argv.slice(2).filter(x=>x!=='--apply');
if(!selected.length||selected.some(x=>!['lights','roads','sidewalks','busLanes','hydrologicalRisk','floodHistory'].includes(x)))throw Error('Selecione camadas piloto disponíveis');
const catalog=await inspectGeoSampaCatalog(),config=b2ConfigFromEnv(),authorization=await authorizeB2(config);
let totalBytes=0;
for(const key of selected){
 const layer=SAFE_ROUTING_DATASET_POLICY[key].layer;
 if(!catalog.candidates.includes(layer))throw Error('Camada ausente no catálogo');
 const snapshotId=`geosampa-${key.toLowerCase()}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8)}`;
 const first=await fetchGeoSampaLayerPage({layer,count:500});
 const total=first.numberMatched;
 if(!Number.isSafeInteger(total)||total<1||total>2_000_000)throw Error('Contagem de origem inválida');
 const pages=Math.ceil(total/500),seen=new Set(),objects=[];
 let processed=0,rejected=0;
 const manifest={version:1,snapshotId,layer,stage:'private-evaluation-unapproved',usedForRouting:false,licenseReviewed:false,
  collectedAt:new Date().toISOString(),source:{endpoint:first.endpoint,layer,catalogSha256:catalog.sha256,reportedTotal:total},objects};
 // Fetch at most four pages simultaneously; group twenty pages into one B2 object.
 for(let start=0;start<pages;start+=20){
  const features=[],pageHashes=[];
  for(let offset=start;offset<Math.min(start+20,pages);offset+=4){
   const indices=Array.from({length:Math.min(4,Math.min(start+20,pages)-offset)},(_,i)=>offset+i);
   const replies=await Promise.all(indices.map(i=>i===0?first:fetchGeoSampaLayerPage({layer,startIndex:i*500,count:500})));
   for(const page of replies){
    if(page.numberMatched!==total||page.returned!==Math.min(500,total-page.startIndex))throw Error('Origem mudou ou paginação incompleta; snapshot não publicado');
    const sanitized=sanitizeGeoSampaPage(page,{layer,snapshotId});
    rejected+=sanitized.source.rejected;
    for(const feature of sanitized.features){if(seen.has(feature.id))throw Error('ID repetido entre páginas; snapshot não publicado');seen.add(feature.id);features.push(feature);}
    processed+=page.returned;pageHashes.push({startIndex:page.startIndex,sha256:page.sha256});
   }
  }
  const compressed=gzipSync(Buffer.from(JSON.stringify({type:'FeatureCollection',features})),{level:9});
  totalBytes+=compressed.length;
  if(totalBytes>500_000_000)throw Error('Limite conservador de 500 MB por execução atingido');
  const path=`snapshots/${snapshotId}/pages/${String(start).padStart(6,'0')}.geojson.gz`;
  await uploadB2Object({authorization,config,path,body:compressed,contentType:'application/gzip'});
  objects.push({path,sha256:createHash('sha256').update(compressed).digest('hex'),bytes:compressed.length,features:features.length,pageHashes});
  console.log(JSON.stringify({layer,snapshotId,processed,total,accepted:seen.size,rejected,compressedBytes:totalBytes}));
 }
 if(processed!==total||seen.size+rejected!==total)throw Error('Reconciliação incompleta');
 manifest.accepted=seen.size;manifest.rejected=rejected;manifest.complete=true;
 await uploadB2Object({authorization,config,path:`snapshots/${snapshotId}/manifest.json`,body:Buffer.from(JSON.stringify(manifest)),contentType:'application/json'});
 console.log(JSON.stringify({complete:true,layer,snapshotId,accepted:seen.size,rejected,objects:objects.length,compressedBytes:objects.reduce((n,o)=>n+o.bytes,0)}));
}
