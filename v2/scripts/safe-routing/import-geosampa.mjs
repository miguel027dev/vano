/**
 * One-page GeoSampa WFS ingestion (staging only).
 * RUN: cd v2 && node scripts/safe-routing/import-geosampa.mjs
 * WRITE: SAFE_ALLOW_IMPORT=1 VANO_SAFE_DB_URL=postgresql://... node scripts/safe-routing/import-geosampa.mjs --apply
 * Never use the VANO production DATABASE_URL. Writes require a dedicated safe database.
 */
import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspectGeoSampaLighting,fetchGeoSampaLightPage,normalizeWfsLightingPage} from '../../server/safe-routing/geosampa-wfs.mjs';

export function assertDedicatedSafeDatabase(dbUrl,mainUrl){
 let uri;try{uri=new URL(dbUrl)}catch{throw Error('Banco isolado inválido')}
 if(!['postgres:','postgresql:'].includes(uri.protocol))throw Error('Banco isolado exige PostgreSQL');
 if(!/(safe|routing|geospatial|geosampa)/i.test(decodeURIComponent(uri.pathname)))
  throw Error('Banco isolado deve ter nome exclusivo de Safe Routing');
 if(mainUrl&&String(mainUrl).replace(/\?.*$/,'')===String(dbUrl).replace(/\?.*$/,''))
  throw Error('Banco de produção não pode ser reutilizado');
 if(!uri.hostname||!uri.pathname||uri.password.length<10)throw Error('Credenciais isoladas incompletas');
 return true;
}
export async function stageSamplePage({fetcher=fetch,dbUrl=null,apply=false,ClientClass=Client}={}){
 const inspected=await inspectGeoSampaLighting({fetcher});
 const page=await fetchGeoSampaLightPage({layer:inspected.layer,count:250,startIndex:0,fetcher});
 const snapshotId='geosampa-lights-'+Date.now()+'-'+randomUUID().slice(0,8);
 const norm=normalizeWfsLightingPage(page,snapshotId);
 if(!norm.count||norm.rejectedCount>Math.max(2,Math.ceil(norm.count*.02)))
  throw Error('Amostra GeoSampa falhou nos testes de integridade; nada foi gravado');
 const summary={
  snapshotId,stage:apply?'staging-unapproved':'dry-run',service:inspected.endpoint,
  metadataUrl:inspected.metadataUrl,layer:inspected.layer,
  rows:page.returned,accepted:norm.accepted.length,rejected:norm.rejectedCount,
  capabilitySha256:inspected.capabilitySha256,pageSha256:page.sha256,
  matched:page.numberMatched,complete:false,usedForRouting:false
 };
 if(!apply)return summary;
 if(process.env.SAFE_ALLOW_IMPORT!=='1')throw Error('SAFE_ALLOW_IMPORT não autorizado');
 assertDedicatedSafeDatabase(dbUrl,process.env.DATABASE_URL);
 const client=new ClientClass({connectionString:dbUrl,connectionTimeoutMillis:9000,
  query_timeout:12000,application_name:'vano-safe-staging'});
 await client.connect();
 try{
  const test=await client.query("SELECT current_database() AS name");
  if(!/(safe|routing|geospatial|geosampa)/i.test(String(test.rows[0]?.name||'')))
   throw Error('Banco não foi identificado como dedicado ao Safe Routing');
  const script=resolve(dirname(fileURLToPath(import.meta.url)),'../../server/safe-routing/schema.sql');
  const ddl=await readFile(script,'utf8');
  // DDL on dedicated instance only, not main VANO database.
  await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await client.query('BEGIN');
  try{
   await client.query(ddl);
   await client.query(
    'INSERT INTO vano_safe.source_snapshots (snapshot_id,source_name,source_url,sha256,status) VALUES ($1,$2,$3,$4,$5)',
    [snapshotId,'geosampa-lighting',inspected.endpoint,page.sha256,'staging']);
   await client.query('INSERT INTO vano_safe.source_pages(snapshot_id,page_offset,feature_count,raw_data,sha256) VALUES($1,$2,$3,$4,$5)',
    [snapshotId,0,page.returned,page.raw,page.sha256]);
   for(const point of norm.accepted){
    await client.query(
     'INSERT INTO vano_safe.public_lights_staging(snapshot_id,source_feature_id,geom) VALUES($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326))',
     [snapshotId,point.sourceFeatureId,point.lon,point.lat]
    );
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}
  return summary;
 }finally{await client.end()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const apply=process.argv.includes('--apply');
 try{
  const report=await stageSamplePage({dbUrl:apply?process.env.VANO_SAFE_DB_URL:null,apply});
  console.log(JSON.stringify(report,null,2));
 }catch(e){console.error('Safe Routing staging:',e?.message||'Falha desconhecida');process.exitCode=1}
}
