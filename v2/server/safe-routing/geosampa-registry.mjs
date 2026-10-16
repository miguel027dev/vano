/** Read-only audit of additional official GeoSampa WFS collections. */
import {getBytes,requestUrl,inspectGeoSampaCatalog} from './geosampa-wfs.mjs';
export const SAO_PAULO_PILOT_LAYERS=Object.freeze({
 roads:'geoportal:segmento_logradouro',
 lights:'geoportal:iluminacao_publica',
 signals:'geoportal:semaforo',
 sidewalks:'geoportal:calcada',
 structures:'geoportal:obra_arte',
 busLanes:'geoportal:faixa_onibus',
 hydrologicalRisk:'geoportal:risco_hidrologico',
 floodHistory:'geoportal:risco_ocorrencia_alagamento'
});
export async function samplePilotSources({fetcher=fetch,limit=3}={}){
 if(!Number.isInteger(limit)||limit<1||limit>5)throw Error('Probe limit inválido');
 const catalog=await inspectGeoSampaCatalog({fetcher});
 const registered=new Set(catalog.candidates);
 const datasets=[];
 for(const [key,layer] of Object.entries(SAO_PAULO_PILOT_LAYERS)){
  if(!registered.has(layer)){datasets.push({key,layer,status:'missing-in-catalog'});continue}
  try{
   const url=requestUrl({service:'WFS',version:'2.0.0',request:'GetFeature',
    typeNames:layer,outputFormat:'application/json',srsName:'EPSG:4326',startIndex:0,count:limit});
   const raw=await getBytes(url,{fetcher,timeoutMs:14000,maxBytes:1_600_000});
   const doc=JSON.parse(raw.bytes.toString('utf8'));
   if(doc?.type!=='FeatureCollection'||!Array.isArray(doc.features)||doc.features.length>limit)
    throw Error('Resposta não é FeatureCollection compatível');
   const geometryTypes=[...new Set(doc.features.map(f=>f?.geometry?.type).filter(Boolean))];
   const attributes=[...new Set(doc.features.flatMap(f=>Object.keys(f?.properties||{})))].slice(0,20);
   const count=Number(doc.numberMatched??doc.totalFeatures);
   datasets.push({key,layer,status:'sampled',returned:doc.features.length,
    matched:Number.isFinite(count)&&count>=0?count:null,geometryTypes,attributes,
    sha256:raw.sha256});
  }catch(error){
   datasets.push({key,layer,status:'unavailable',reason:String(error?.message||'unknown').slice(0,120)});
  }
 }
 return {catalogCount:catalog.count,catalogSha256:catalog.sha256,
  datasets,sourceState:'public-wfs-samples-not-approved'};
}
