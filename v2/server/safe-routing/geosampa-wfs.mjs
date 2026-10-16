/** Official São Paulo GeoSampa WFS interface. Read-only, bounded, strict origin. */
import {createHash} from 'node:crypto';
import {SAFE_ROUTING_DATASET_POLICY} from './dataset-policy.mjs';
export const GEOSAMPA_WFS='https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs';
export const GEOSAMPA_LIGHTING_METADATA='https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/intranet/api/records/1a0c8fd5-9273-4d71-8e20-440f9ccc7b5e';
const maxReply=4_000_000;
export function requestUrl(params){
 const u=new URL(GEOSAMPA_WFS);
 for(const [key,value] of Object.entries(params))u.searchParams.set(key,String(value));
 return u;
}
export async function getBytes(url,{fetcher=fetch,timeoutMs=14000,maxBytes=maxReply}={}){
 if(url.origin!==new URL(GEOSAMPA_WFS).origin||url.pathname!=='/geoserver/geoportal/wfs')throw Error('GeoSampa WFS: origem inesperada');
 const reply=await fetcher(url,{method:'GET',redirect:'error',headers:{Accept:'application/json,application/xml,text/xml'},signal:AbortSignal.timeout(timeoutMs)});
 if(!reply.ok)throw Error('GeoSampa WFS HTTP '+reply.status);
 const declared=Number(reply.headers.get('content-length')||0);
 if(declared>maxBytes)throw Error('GeoSampa WFS: resposta grande');
 if(!reply.body)throw Error('GeoSampa WFS: resposta vazia');
 const pieces=[];let total=0;
 for await(const chunk of reply.body){
  total+=chunk.byteLength;
  if(total>maxBytes)throw Error('GeoSampa WFS: limite excedido');
  pieces.push(chunk);
 }
 if(total===0)throw Error('GeoSampa WFS: resposta vazia');
 const bytes=Buffer.concat(pieces,total);
 return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),
  contentType:reply.headers.get('content-type')||''};
}
export function readLightingFeatureType(xml){
 if(typeof xml!=='string'||xml.length>4_000_000||!xml.includes('FeatureType'))throw Error('Capacidades WFS inválidas');
 const found=[];
 for(const block of xml.matchAll(/<(?:\w+:)?FeatureType(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?FeatureType>/g)){
  const match=block[1].match(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/);
  if(!match)continue;
  const name=match[1].trim();
  if(/^(?:[a-z][\w.-]*:)?iluminacao_publica$/i.test(name))found.push(name);
 }
 if(found.length!==1)throw Error('Camada iluminacao_publica indisponível ou ambígua no WFS');
 return found[0];
}
/** Performs a capability check before any feature query; never guesses typename. */
export async function inspectGeoSampaLighting({fetcher=fetch}={}){
 const u=requestUrl({service:'WFS',request:'GetCapabilities',version:'2.0.0'});
 const raw=await getBytes(u,{fetcher});
 const text=raw.bytes.toString('utf8');
 const layer=readLightingFeatureType(text);
 return {endpoint:GEOSAMPA_WFS,layer,capabilitySha256:raw.sha256,
  metadataUrl:GEOSAMPA_LIGHTING_METADATA,serviceVersion:'2.0.0'};
}
export async function fetchGeoSampaLightPage({layer,startIndex=0,count=250,fetcher=fetch}={}){
 if(!/^(?:[a-z][\w.-]*:)?iluminacao_publica$/i.test(String(layer||'')))throw Error('WFS layer not verified');
 return fetchGeoSampaLayerPage({layer,startIndex,count,fetcher});
}
/** Bounded page fetch for the explicitly reviewed pilot inventory only. */
export async function fetchGeoSampaLayerPage({layer,startIndex=0,count=250,fetcher=fetch}={}){
 const approvedNames=new Set(Object.values(SAFE_ROUTING_DATASET_POLICY).map(rule=>rule.layer));
 if(!approvedNames.has(layer))throw Error('WFS layer not registered for Safe Routing discovery');
 if(!Number.isInteger(startIndex)||startIndex<0||startIndex>5000000||
    !Number.isInteger(count)||count<1||count>500)throw Error('Paginação WFS fora dos limites');
 // No BBOX until confirmed axis-order/DescribeFeatureType: avoids geographic mix-ups.
 const u=requestUrl({service:'WFS',request:'GetFeature',version:'2.0.0',
  typeNames:layer,outputFormat:'application/json',srsName:'EPSG:4326',
  startIndex,count});
 const raw=await getBytes(u,{fetcher,maxBytes:6_000_000,timeoutMs:18000});
 let body;
 try{body=JSON.parse(raw.bytes.toString('utf8'))}catch{throw Error('GeoSampa WFS: GeoJSON inválido')}
 if(body?.type!=='FeatureCollection'||!Array.isArray(body.features)||body.features.length>count)
  throw Error('GeoSampa WFS: resposta não é FeatureCollection válida');
 if(body.features.some(f=>f?.type!=='Feature'))throw Error('GeoSampa WFS: feature inválida');
 const matched=Number(body.numberMatched??body.totalFeatures);
 return {features:body.features,returned:body.features.length,
  numberMatched:Number.isFinite(matched)&&matched>=0?matched:null,
  count,startIndex,sha256:raw.sha256,bytes:raw.bytes.length,
  endpoint:GEOSAMPA_WFS,layer,raw:raw.bytes};
}
export function normalizeWfsLightingPage(page,snapshotId){
 if(!page||!Array.isArray(page.features)||!Number.isInteger(page.startIndex))throw Error('WFS page missing');
 if(typeof snapshotId!=='string'||!/^[\w.:-]{6,90}$/.test(snapshotId))throw Error('Identificador inválido');
 const rejected={noId:0,notPoint:0,invalidCoords:0,duplicate:0},seen=new Set(),accepted=[];
 for(const f of page.features){
  const fid=f?.id??f?.properties?.fid??f?.properties?.FID??f?.properties?.id;
  if(typeof fid!=='string'&&!(Number.isSafeInteger(fid))){rejected.noId++;continue}
  const id=String(fid);
  if(id.length>160||!id.length){rejected.noId++;continue}
  if(f.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates)||
   f.geometry.coordinates.length<2){rejected.notPoint++;continue}
  // GeoJSON uses lon,lat even when WFS native layer is EPSG:31983.
  const [lon,lat]=f.geometry.coordinates;
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||
   lon<-46.95||lon>-46.2||lat<-24.1||lat>-23.25){rejected.invalidCoords++;continue}
  if(seen.has(id)){rejected.duplicate++;continue}
  seen.add(id);accepted.push({sourceFeatureId:id,lon,lat,snapshotId});
 }
 return {accepted,rejected,rejectedCount:Object.values(rejected).reduce((a,b)=>a+b,0),
  count:page.features.length,snapshotId,stage:'staging-unverified'};
}


/** Public layer catalog for engineering discovery; never substitutes license/schema review. */
export function parseGeoSampaFeatureCatalog(xml){
 if(typeof xml!=='string'||xml.length>4_000_000||!xml.includes('FeatureTypeList'))
  throw Error('Catálogo de layers inválido');
 const all=[];
 for(const block of xml.matchAll(/<(?:\w+:)?FeatureType(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?FeatureType>/g)){
  const match=block[1].match(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/);
  if(match&&/^[\w.:-]{1,130}$/.test(match[1]))all.push(match[1]);
 }
 const useful=all.filter(name=>/ilumina|logradouro|semafor|cruzamento|pontes?|viadut|tuneis?|t[uú]neis?|passarela|cal[cç]ada|alagamento|risco|faixa.*onibus|infraestrutura|obra|rotat[oó]ria|ciclovia|pedestre/i.test(name));
 return {count:all.length,candidates:[...new Set(useful)].sort().slice(0,160),snapshotIsApproved:false};
}
export async function inspectGeoSampaCatalog({fetcher=fetch}={}){
 const url=requestUrl({service:'WFS',request:'GetCapabilities',version:'2.0.0'});
 const raw=await getBytes(url,{fetcher});
 return {...parseGeoSampaFeatureCatalog(raw.bytes.toString('utf8')),sha256:raw.sha256};
}
