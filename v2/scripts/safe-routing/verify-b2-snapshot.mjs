import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {authorizeB2,readB2Object} from '../../server/safe-routing/b2-storage.mjs';
import {b2ConfigFromEnv} from './stage-geosampa-b2.mjs';
const snapshot=process.argv[2];
if(!/^[a-z0-9-]{6,90}$/.test(snapshot||''))throw Error('Snapshot inválido');
const config=b2ConfigFromEnv(),authorization=await authorizeB2(config);
const manifest=JSON.parse(await readB2Object({authorization,config,path:`snapshots/${snapshot}/manifest.json`}));
if(manifest.snapshotId!==snapshot||!Array.isArray(manifest.objects)||manifest.objects.length>300)throw Error('Manifest inválido');
let features=0,bytes=0;
for(const object of manifest.objects){
 if(!object.path.startsWith(`snapshots/${snapshot}/`))throw Error('Objeto fora do snapshot');
 const compressed=await readB2Object({authorization,config,path:object.path,maxBytes:25_000_000});
 if(compressed.length!==object.bytes||createHash('sha256').update(compressed).digest('hex')!==object.sha256)throw Error('Integridade SHA256 inválida');
 const page=JSON.parse(gunzipSync(compressed,{maxOutputLength:50_000_000}));
 if(page.type!=='FeatureCollection'||page.features.length!==object.features)throw Error('Contagem inválida');
 features+=page.features.length;bytes+=compressed.length;
}
console.log(JSON.stringify({snapshot,verified:true,objects:manifest.objects.length,features,compressedBytes:bytes,usedForRouting:manifest.usedForRouting},null,2));
