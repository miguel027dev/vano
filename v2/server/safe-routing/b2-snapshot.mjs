/** Private B2 snapshot diagnostics, isolated from route selection. */
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {authorizeB2,readB2Object} from './b2-storage.mjs';

export function b2RuntimeConfig(env=process.env){return {keyId:env.VANO_SAFE_B2_APPLICATION_KEY_ID,applicationKey:env.VANO_SAFE_B2_APPLICATION_KEY,
 bucketId:env.VANO_SAFE_B2_BUCKET_ID,bucketName:env.VANO_SAFE_B2_BUCKET,endpoint:env.VANO_SAFE_B2_ENDPOINT};}
export function validateSnapshotManifest(manifest,snapshotId){
 if(!manifest||manifest.version!==1||manifest.snapshotId!==snapshotId||manifest.usedForRouting!==false||
  !['unapproved-staging-sample','private-evaluation-unapproved'].includes(manifest.stage)||
  !Array.isArray(manifest.objects)||!manifest.objects.length||manifest.objects.length>300)throw Error('Manifest de staging inválido');
 let bytes=0,features=0;const paths=new Set();
 for(const item of manifest.objects){
  if(typeof item.path!=='string'||!item.path.startsWith(`snapshots/${snapshotId}/pages/`)||!item.path.endsWith('.geojson.gz')||paths.has(item.path)||
   !/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>25_000_000||
   !Number.isSafeInteger(item.features)||item.features<1||item.features>10000)throw Error('Objeto de snapshot inválido');
  paths.add(item.path);bytes+=item.bytes;features+=item.features;
 }
 if(bytes>500_000_000)throw Error('Snapshot excede orçamento');
 if(manifest.complete===true&&features!==manifest.accepted)throw Error('Contagem divergente');
 return {objects:manifest.objects.length,features,compressedBytes:bytes};
}
export function decodeSnapshotObject(compressed,item){
 if(compressed.length!==item.bytes||createHash('sha256').update(compressed).digest('hex')!==item.sha256)throw Error('Integridade do snapshot inválida');
 const page=JSON.parse(gunzipSync(compressed,{maxOutputLength:50_000_000}));
 if(page.type!=='FeatureCollection'||!Array.isArray(page.features)||page.features.length!==item.features)throw Error('GeoJSON do snapshot inválido');
 return page;
}
export async function inspectB2Snapshot(snapshotId,{env=process.env,fetcher=fetch}={}){
 if(!/^[a-z0-9-]{6,90}$/.test(snapshotId||''))throw Error('Snapshot inválido');
 const config=b2RuntimeConfig(env),authorization=await authorizeB2(config,{fetcher});
 const manifest=JSON.parse(await readB2Object({authorization,config,path:`snapshots/${snapshotId}/manifest.json`,fetcher}));
 const summary=validateSnapshotManifest(manifest,snapshotId),item=manifest.objects[0];
 const bytes=await readB2Object({authorization,config,path:item.path,maxBytes:25_000_000,fetcher});
 decodeSnapshotObject(bytes,item);
 return {snapshotId,...summary,layer:manifest.layer||manifest.source?.layer,complete:manifest.complete===true,
  firstObjectVerified:true,usedForRouting:false,licenseReviewed:manifest.licenseReviewed===true};
}
