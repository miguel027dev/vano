/** Private, bounded infrastructure index. Publish index only after reconciliation. */
import {gzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {authorizeB2,uploadB2Object,readB2Object} from '../../server/safe-routing/b2-storage.mjs';
import {b2RuntimeConfig} from '../../server/safe-routing/b2-snapshot.mjs';
import {fetchGeoSampaRecoveringPage} from '../../server/safe-routing/geosampa-wfs.mjs';
import {sanitizeGeoSampaPage} from '../../server/safe-routing/ingestion.mjs';
import {SAFE_ROUTING_DATASET_POLICY} from '../../server/safe-routing/dataset-policy.mjs';
import {geometryBounds,geometryTiles} from '../../server/safe-routing/spatial-context.mjs';
const selected=process.argv.slice(2);
if(process.env.SAFE_ALLOW_B2_UPLOAD!=='1'||!selected.length||selected.some(k=>!['roads','sidewalks','busLanes','hydrologicalRisk','floodHistory'].includes(k)))throw Error('Carga privada não autorizada');
const config=b2RuntimeConfig(),authorization=await authorizeB2(config);
async function retry(fn){for(let i=0;;i++){try{return await fn();}catch(e){if(i===3||!/fetch failed|timeout|socket|\(5\d\d\)/i.test(e.message))throw e;await new Promise(r=>setTimeout(r,500*(i+1)));}}}
for(const key of selected){
 const layer=SAFE_ROUTING_DATASET_POLICY[key].layer,snapshotId=`geosampa-${key.toLowerCase()}-${Date.now()}-${randomUUID().slice(0,8)}-context`;
 const tiles=new Map(),seen=new Set();let total,processed=0,rejected=0,attributeFeatures=0;
 const first=await retry(()=>fetchGeoSampaRecoveringPage({layer,count:500}));total=first.numberMatched;
 if(!Number.isSafeInteger(total)||total<1||total>2000000)throw Error('Contagem inválida');
 for(let offset=0;offset<total;offset+=2000){
  const replies=await Promise.all(Array.from({length:Math.min(4,Math.ceil((total-offset)/500))},(_,i)=>offset+i*500).map(startIndex=>startIndex===0?first:retry(()=>fetchGeoSampaRecoveringPage({layer,startIndex,count:500}))));
  for(const page of replies){
   if(page.numberMatched!==total||page.returned!==Math.min(500,total-page.startIndex))throw Error('Paginação mudou');
   const clean=sanitizeGeoSampaPage(page,{layer,snapshotId});rejected+=clean.source.rejected;processed+=page.returned;
   for(const f of clean.features){
    if(seen.has(f.id))throw Error('ID duplicado');seen.add(f.id);
    const {sourceLayer,sourceFeatureId,snapshotId:ignored,...properties}=f.properties;
    if(Object.keys(properties).some(k=>k!=='sourceUpdatedAt'))attributeFeatures++;
    const feature={type:'Feature',id:f.id,geometry:f.geometry,bbox:geometryBounds(f.geometry),properties};
    for(const tile of geometryTiles(f.geometry)){if(!tiles.has(tile))tiles.set(tile,[]);tiles.get(tile).push(feature);}
   }
  }
  if(offset%20000===0)console.log(JSON.stringify({key,processed,total,accepted:seen.size,rejected,tiles:tiles.size}));
 }
 if(processed!==total||seen.size+rejected!==total||tiles.size>1800)throw Error('Reconciliação incompleta');
 const index={version:1,kind:'context-grid-v1',snapshotId,key,sourceLayer:layer,gridScale:50,complete:true,stage:'private-evaluation-unapproved',usedForRouting:false,licenseReviewed:false,collectedAt:new Date().toISOString(),features:seen.size,rejected,reportedTotal:total,attributeFeatures,tiles:{}};
 let parts=[],size=0,bundle=0,bytes=0;
 async function flush(){
  if(!parts.length)return;
  const path=`snapshots/${snapshotId}/bundles/${bundle++}.bin`,body=Buffer.concat(parts.map(p=>p.body));
  await retry(()=>uploadB2Object({authorization,config,path,body,contentType:'application/octet-stream'}));
  // Verify the complete upload once, including every tile checksum.
  const stored=await retry(()=>readB2Object({authorization,config,path,maxBytes:25000000}));
  if(!stored.equals(body))throw Error('Upload não reconciliado');
  let offset=0;for(const p of parts){index.tiles[p.key]={path,offset,bytes:p.body.length,features:p.count,sha256:createHash('sha256').update(p.body).digest('hex')};offset+=p.body.length;}
  bytes+=body.length;if(bytes>500000000)throw Error('Orçamento de 500MB excedido');parts=[];size=0;
 }
 for(const [tile,features] of tiles){
  const body=gzipSync(JSON.stringify({type:'FeatureCollection',features}),{level:9});
  if(body.length>5000000||features.length>100000)throw Error('Tile excessivo');
  if(size+body.length>20000000||parts.length>=10)await flush();
  parts.push({key:tile,body,count:features.length});size+=body.length;
 }
 await flush();
 await retry(()=>uploadB2Object({authorization,config,path:`snapshots/${snapshotId}/index.json`,body:Buffer.from(JSON.stringify(index)),contentType:'application/json'}));
 console.log(JSON.stringify({complete:true,key,snapshotId,features:seen.size,rejected,attributeFeatures,tiles:tiles.size,bundles:bundle,compressedBytes:bytes}));
}
