/** Strict allowlisted download; returns RAW unapproved bytes, never changes live data. */
import {createHash} from 'node:crypto';
const allow=new Set(['download.geosampa.prefeitura.sp.gov.br','geosampa.prefeitura.sp.gov.br']);
export function validateGeoSampaUrl(raw){
 let u;try{u=new URL(raw)}catch{throw Error('URL da fonte inválida')}
 if(u.protocol!=='https:'||!allow.has(u.hostname.toLowerCase())||u.username||u.password||u.port)
  throw Error('Apenas origem HTTPS GeoSampa verificada é permitida');
 return u;
}
export async function fetchGeoSampaSnapshot(raw,{fetcher=fetch,maxBytes=75000000,timeoutMs=30000}={}){
 const url=validateGeoSampaUrl(raw);
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1000||maxBytes>150000000)throw Error('Limite de bytes inválido');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('Tempo limite inválido');
 const response=await fetcher(url,{headers:{Accept:'application/geo+json,application/json,application/zip,application/octet-stream'},
  redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok||response.status>=300)throw Error('Falha ao baixar camada, status '+response.status);
 if(!response.body)throw Error('Download sem corpo');
 const declared=Number(response.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)throw Error('Fonte excede tamanho máximo');
 if((response.headers.get('content-type')||'').toLowerCase().includes('text/html'))throw Error('Servidor retornou HTML em vez de dados');
 let size=0;const parts=[];
 for await(const part of response.body){
  size+=part.byteLength;
  if(size>maxBytes)throw Error('Download excede limite durante transferência');
  parts.push(part);
 }
 if(!size)throw Error('Fonte vazia');
 const bytes=Buffer.concat(parts,size);
 if(bytes.subarray(0,32).toString('utf8').toLowerCase().includes('<!doctype html'))throw Error('Arquivo inesperado HTML');
 return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:size,
  origin:url.origin,downloadedAt:new Date().toISOString(),stage:'raw-unapproved'};
}
