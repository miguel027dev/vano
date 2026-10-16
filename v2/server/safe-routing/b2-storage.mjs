/** Narrow Backblaze B2 native API client for non-routing Safe Routing snapshots. */
import {createHash} from 'node:crypto';

const AUTH_URL='https://api.backblazeb2.com/b2api/v3/b2_authorize_account';
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
 if(typeof body?.authorizationToken!=='string'||typeof body?.apiUrl!=='string'||body?.allowed?.bucketId!==config.bucketId)throw Error('B2 não concedeu acesso ao bucket dedicado');
 return body;
}
export function b2FileName(path){
 if(typeof path!=='string'||!/^snapshots\/[a-z0-9][a-z0-9._/-]{5,800}$/i.test(path)||path.includes('..'))throw Error('Caminho B2 inválido');
 return encodeURIComponent(path).replace(/%2F/gi,'/');
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
