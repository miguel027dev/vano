/** Narrow Backblaze B2 native API client for non-routing Safe Routing snapshots. */
import {createHash} from 'node:crypto';

const AUTH_URL='https://api.backblazeb2.com/b2api/v4/b2_authorize_account';
const validValue=value=>typeof value==='string'&&value.length>=8&&value.length<=500&&!/[\s\x00]/.test(value);
export function assertB2Config(config={}){
 const {keyId,applicationKey,bucketId,bucketName,endpoint}=config;
 if(!validValue(keyId)||!validValue(applicationKey)||!validValue(bucketId)||!/^vano-safe-routing-sp-staging-[0-9]{8}$/.test(String(bucketName||'')))throw Error('Configuração B2 de staging inválida');
 if(endpoint!==undefined&&!/^s3\.[a-z0-9-]+\.backblazeb2\.com$/i.test(endpoint))throw Error('Endpoint B2 inválido');
 return true;
}
export async function authorizeB2(config,{fetcher=fetch}={}){
 assertB2Config(config);
 const basic=Buffer.from(`${config.keyId}:${config.applicationKey}`).toString('base64');
 const response=await fetcher(AUTH_URL,{headers:{Authorization:`Basic ${basic}`},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error(`B2 autorização recusada (${response.status})`);
 const body=await response.json();
 const storage=body?.apiInfo?.storageApi;
 const allowed=storage?.allowed;
 const buckets=allowed?.buckets;
 if(typeof body?.authorizationToken!=='string'||!/^https:\/\/api[0-9]+\.backblazeb2\.com$/.test(storage?.apiUrl||'')||
  !Array.isArray(buckets)||buckets.length!==1||buckets[0].id!==config.bucketId||
  (buckets[0].name!==null&&buckets[0].name!==config.bucketName)||allowed.namePrefix!=='snapshots/'||
  !allowed.capabilities?.includes('writeFiles'))throw Error('B2 não concedeu acesso ao bucket e prefixo dedicados');
 return {...body,apiUrl:storage.apiUrl,downloadUrl:storage.downloadUrl,allowed};
}
export function b2FileName(path){
 if(typeof path!=='string'||!/^snapshots\/[a-z0-9][a-z0-9._/-]{5,800}$/i.test(path)||path.includes('..'))throw Error('Caminho B2 inválido');
 return encodeURIComponent(path).replace(/%2F/gi,'/');
}
/** Bounded authenticated reads; never returns a public download token or URL. */
export async function readB2Object({authorization,config,path,maxBytes=2_000_000,range,fetcher=fetch}={}){
 assertB2Config(config);
 if(!/^https:\/\/f[0-9]+\.backblazeb2\.com$/.test(authorization?.downloadUrl||'')||!authorization?.authorizationToken)throw Error('Download B2 inválido');
 if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>25_000_000)throw Error('Limite B2 inválido');
 const url=`${authorization.downloadUrl}/file/${config.bucketName}/${b2FileName(path)}`;
 if(range&&(!Number.isSafeInteger(range.offset)||range.offset<0||!Number.isSafeInteger(range.length)||range.length<1||range.length>maxBytes))throw Error('Intervalo B2 inválido');
 const reply=await fetcher(url,{headers:{Authorization:authorization.authorizationToken,...(range?{Range:`bytes=${range.offset}-${range.offset+range.length-1}`}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!reply.ok)throw Error(`B2 leitura recusada (${reply.status})`);
 if(range&&(reply.status!==206||!reply.headers.get('content-range')?.startsWith(`bytes ${range.offset}-${range.offset+range.length-1}/`)))throw Error('B2 não confirmou intervalo');
 if(Number(reply.headers.get('content-length'))>maxBytes)throw Error('Objeto B2 excede limite');
 const chunks=[];let size=0;
 for await(const chunk of reply.body){size+=chunk.byteLength;if(size>maxBytes)throw Error('Objeto B2 excede limite');chunks.push(chunk);}
 if(range&&size!==range.length)throw Error('Intervalo B2 incompleto');
 return Buffer.concat(chunks,size);
}
export async function uploadB2Object({authorization,config,path,body,contentType='application/octet-stream',fetcher=fetch}={}){
 if(!authorization?.apiUrl||!authorization?.authorizationToken)throw Error('Autorização B2 ausente');
 if(!Buffer.isBuffer(body)||body.length<1||body.length>25_000_000)throw Error('Objeto B2 fora do limite');
 const target=`${authorization.apiUrl}/b2api/v3/b2_get_upload_url`;
 const uploadUrlResponse=await fetcher(target,{method:'POST',headers:{Authorization:authorization.authorizationToken,'content-type':'application/json'},body:JSON.stringify({bucketId:config.bucketId}),redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!uploadUrlResponse.ok)throw Error(`B2 upload URL recusada (${uploadUrlResponse.status})`);
 const upload=await uploadUrlResponse.json();
 if(!upload?.uploadUrl||!upload?.authorizationToken)throw Error('B2 upload URL inválida');
 const sha1=createHash('sha1').update(body).digest('hex');
 const response=await fetcher(upload.uploadUrl,{method:'POST',headers:{Authorization:upload.authorizationToken,'X-Bz-File-Name':b2FileName(path),'Content-Type':contentType,'Content-Length':String(body.length),'X-Bz-Content-Sha1':sha1},body,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`B2 upload recusado (${response.status})`);
 const saved=await response.json();
 if(saved?.fileName!==path||saved?.contentSha1!==sha1)throw Error('B2 não confirmou integridade do objeto');
 return {fileId:saved.fileId,fileName:saved.fileName,contentSha1:sha1,bytes:body.length};
}
