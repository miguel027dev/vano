/** Build a private query index from an already verified lighting archive. */
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {authorizeB2,readB2Object,uploadB2Object} from '../../server/safe-routing/b2-storage.mjs';
import {b2RuntimeConfig,validateSnapshotManifest,decodeSnapshotObject} from '../../server/safe-routing/b2-snapshot.mjs';
const sourceId=process.argv[2];
if(!/^geosampa-lights-[a-z0-9-]+$/.test(sourceId||'')||process.env.SAFE_ALLOW_B2_UPLOAD!=='1')throw Error('Indexação privada não autorizada/configurada');
const config=b2RuntimeConfig(),authorization=await authorizeB2(config);
async function retry(operation){
 for(let attempt=0;attempt<3;attempt++){
  try{return await operation();}catch(error){
   if(attempt===2||!/fetch failed|timeout|socket|\(5\d\d\)/i.test(error.message))throw error;
   await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
  }
 }
}
const source=JSON.parse(await readB2Object({authorization,config,path:`snapshots/${sourceId}/manifest.json`}));
validateSnapshotManifest(source,sourceId);
if(!source.complete||source.layer!=='geoportal:iluminacao_publica')throw Error('Exige arquivo completo de iluminação');
const tiles=new Map();let count=0;
for(const object of source.objects){
 const bytes=await retry(()=>readB2Object({authorization,config,path:object.path,maxBytes:25_000_000}));
 const page=decodeSnapshotObject(bytes,object);
 for(const feature of page.features){
  if(feature.geometry?.type!=='Point')throw Error('Geometria inesperada');
  const [lon,lat]=feature.geometry.coordinates,key=`${Math.floor(lon*50)}_${Math.floor(lat*50)}`;
  if(!tiles.has(key))tiles.set(key,[]);
  tiles.get(key).push({type:'Feature',id:feature.id,geometry:feature.geometry,properties:{}});count++;
 }
}
if(count!==source.accepted||tiles.size>800)throw Error('Reconciliação ou orçamento de tiles inválido');
const snapshotId=sourceId+'-grid';
const manifest={version:1,kind:'lighting-grid-v1',snapshotId,sourceSnapshot:sourceId,sourceLayer:source.layer,
 stage:'private-evaluation-unapproved',usedForRouting:false,licenseReviewed:false,gridScale:50,features:count,tiles:{}};
let bytes=0,done=0;
const resume=Number(process.env.SAFE_GRID_RESUME_TILES||0),entries=[...tiles];
if(!Number.isInteger(resume)||resume<0||resume>tiles.size)throw Error('Checkpoint inválido');
async function saveTile([key,features],index){
 const body=gzipSync(JSON.stringify({type:'FeatureCollection',features}),{level:9});
 const path=`snapshots/${snapshotId}/tiles/${key}.geojson.gz`;
 if(index<resume){
  const existing=await retry(()=>readB2Object({authorization,config,path,maxBytes:2_000_000}));
  if(createHash('sha256').update(existing).digest('hex')!==createHash('sha256').update(body).digest('hex'))throw Error('Checkpoint diverge do índice');
 }else await retry(()=>uploadB2Object({authorization,config,path,body,contentType:'application/gzip'}));
 manifest.tiles[key]={path,bytes:body.length,features:features.length,sha256:createHash('sha256').update(body).digest('hex')};
 bytes+=body.length;done++;
 if(done%25===0)console.log(JSON.stringify({tilesUploaded:done,tiles:tiles.size,bytes}));
}
for(let start=0;start<entries.length;start+=4)await Promise.all(entries.slice(start,start+4).map((entry,i)=>saveTile(entry,start+i)));
await retry(()=>uploadB2Object({authorization,config,path:`snapshots/${snapshotId}/index.json`,body:Buffer.from(JSON.stringify(manifest)),contentType:'application/json'}));
console.log(JSON.stringify({complete:true,snapshotId,features:count,tiles:tiles.size,compressedBytes:bytes}));
