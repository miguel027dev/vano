/**
 * Uploads only a sanitized, unapproved GeoSampa lighting sample to the dedicated
 * B2 staging bucket. Default is dry-run. Full ingestion remains blocked pending
 * layer-specific license, CRS and geometry review.
 */
import {gzipSync} from 'node:zlib';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inspectGeoSampaLighting,fetchGeoSampaLightPage,normalizeWfsLightingPage} from '../../server/safe-routing/geosampa-wfs.mjs';
import {authorizeB2,uploadB2Object,assertB2Config} from '../../server/safe-routing/b2-storage.mjs';
import {sanitizeGeoSampaPage} from '../../server/safe-routing/ingestion.mjs';

export function b2ConfigFromEnv(env=process.env){return {keyId:env.VANO_SAFE_B2_APPLICATION_KEY_ID,applicationKey:env.VANO_SAFE_B2_APPLICATION_KEY,bucketId:env.VANO_SAFE_B2_BUCKET_ID,bucketName:env.VANO_SAFE_B2_BUCKET,endpoint:env.VANO_SAFE_B2_ENDPOINT};}
export async function stageGeoSampaLightsToB2({apply=false,env=process.env,fetcher=fetch,upload=uploadB2Object}={}){
 const inspected=await inspectGeoSampaLighting({fetcher});
 const snapshotId=`geosampa-lights-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8)}`;
 const page=await fetchGeoSampaLightPage({layer:inspected.layer,count:500,fetcher});
 const normalized=normalizeWfsLightingPage(page,snapshotId);
 if(!normalized.count||normalized.rejectedCount>Math.max(5,Math.ceil(normalized.count*.02)))throw Error('Amostra reprovada; nada enviado ao B2');
 const sanitized=sanitizeGeoSampaPage(page,{layer:inspected.layer,snapshotId});
 const features=sanitized.features;
 const payload=Buffer.from(JSON.stringify({type:'FeatureCollection',features}));
 const compressed=gzipSync(payload,{level:9});
 const manifest={version:1,snapshotId,stage:'unapproved-staging-sample',usedForRouting:false,licenseReviewed:false,source:{endpoint:inspected.endpoint,layer:inspected.layer,metadataUrl:inspected.metadataUrl,capabilitySha256:inspected.capabilitySha256,pageSha256:page.sha256,reportedTotal:page.numberMatched},objects:[{path:`snapshots/${snapshotId}/pages/000000.geojson.gz`,sha256:createHash('sha256').update(compressed).digest('hex'),bytes:compressed.length,features:features.length}]};
 if(env.SAFE_STAGING_OUTPUT_DIR){
  const root=resolve(env.SAFE_STAGING_OUTPUT_DIR),pagePath=resolve(root,manifest.objects[0].path),manifestPath=resolve(root,`snapshots/${snapshotId}/manifest.json`);
  if(!pagePath.startsWith(root+'/')||!manifestPath.startsWith(root+'/'))throw Error('Diretório de saída inválido');
  await mkdir(resolve(pagePath,'..'),{recursive:true});await writeFile(pagePath,compressed);await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  manifest.localFiles={pagePath,manifestPath};
 }
 if(!apply)return {dryRun:true,snapshotId,manifest,compressedBytes:compressed.length};
 if(env.SAFE_ALLOW_B2_UPLOAD!=='1')throw Error('SAFE_ALLOW_B2_UPLOAD=1 obrigatório');
 const config=b2ConfigFromEnv(env);assertB2Config(config);
 const authorization=await authorizeB2(config,{fetcher});
 const object=manifest.objects[0];
 await upload({authorization,config,path:object.path,body:compressed,contentType:'application/geo+json',fetcher});
 await upload({authorization,config,path:`snapshots/${snapshotId}/manifest.json`,body:Buffer.from(JSON.stringify(manifest)),contentType:'application/json',fetcher});
 return {dryRun:false,snapshotId,manifest};
}
if(import.meta.url===`file://${process.argv[1]}`){
 stageGeoSampaLightsToB2({apply:process.argv.includes('--apply')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error('B2 staging:',e.message);process.exitCode=1});
}
