/** Minimal, geometry-first staging format for public GeoSampa WFS records.
 * Raw source properties are deliberately not stored in B2 snapshots. */
import {SAFE_ROUTING_DATASET_POLICY} from './dataset-policy.mjs';

const BOUNDS={minLon:-46.98,maxLon:-46.2,minLat:-24.11,maxLat:-23.23};
const geometryTypes=new Set(['Point','LineString','Polygon','MultiPoint','MultiLineString','MultiPolygon']);
// Public engineering attributes only. No residents, owners or demographics.
const FIELDS={
 'geoportal:segmento_logradouro':['codlog','cd_identificador_logradouro','nm_logradouro','cd_tipo_logradouro','qt_leito_carrocavel'],
 'geoportal:calcada':['cd_logradouro','cd_identificador_segmento_logradouro','qt_area_calcada','qt_largura_minima_trecho','qt_largura_media_trecho','pc_declividade_media_trecho','tx_situacao','dt_inicio','dt_termino'],
 'geoportal:faixa_onibus':['nm_denominacao_faixa_corredor','tx_horario_funcionamento','tx_sentido_faixa_corredor','nm_tipo_faixa_corredor','dt_implantacao_faixa'],
 'geoportal:risco_hidrologico':['tx_grau_risco_hidrologico','tx_tipo_processo','dt_vistoria'],
 'geoportal:risco_ocorrencia_alagamento':['dt_ocorrencia','dc_tipo_ocorrencia','dt_carga']
};
function publicAttributes(properties,layer){
 const result={};
 for(const key of FIELDS[layer]||[]){const value=properties?.[key];
  if(typeof value==='number'&&Number.isFinite(value))result[key]=value;
  else if(typeof value==='string')result[key]=value.replace(/[\x00-\x1f]/g,' ').slice(0,300);
 }
 return result;
}

function validPair(pair){return Array.isArray(pair)&&pair.length>=2&&Number.isFinite(pair[0])&&Number.isFinite(pair[1])&&
 pair[0]>=BOUNDS.minLon&&pair[0]<=BOUNDS.maxLon&&pair[1]>=BOUNDS.minLat&&pair[1]<=BOUNDS.maxLat;}
function validCoordinates(value){
 if(!Array.isArray(value)||!value.length)return false;
 if(typeof value[0]==='number')return validPair(value);
 return value.every(validCoordinates);
}
function featureId(feature){
 const raw=feature?.id??feature?.properties?.fid??feature?.properties?.FID??feature?.properties?.id??
  feature?.properties?.cd_identificador??feature?.properties?.cd_identificador_iluminacao_publica??
  feature?.properties?.cd_identificador_calcada??feature?.properties?.cd_identificador_risco_hidrologico;
 if(typeof raw!=='string'&&!Number.isSafeInteger(raw))return null;
 const id=String(raw);return /^[\w.:-]{1,160}$/.test(id)?id:null;
}
function updatedAt(properties){
 for(const key of ['dt_carga','dt_ocorrencia','dt_vistoria','dt_inicio','dt_implantacao_faixa']){
  const value=properties?.[key],ms=Date.parse(value);
  if(Number.isFinite(ms))return new Date(ms).toISOString();
 }
 return null;
}
export function sanitizeGeoSampaFeature(feature,{layer,snapshotId}={}){
 if(!Object.values(SAFE_ROUTING_DATASET_POLICY).some(rule=>rule.layer===layer))throw Error('Camada não registrada');
 if(typeof snapshotId!=='string'||!/^[\w.:-]{6,90}$/.test(snapshotId))throw Error('Snapshot inválido');
 const id=featureId(feature),geometry=feature?.geometry;
 if(!id||!geometryTypes.has(geometry?.type)||!validCoordinates(geometry.coordinates))return null;
 return {type:'Feature',id,geometry:{type:geometry.type,coordinates:geometry.coordinates},properties:{
  sourceLayer:layer,sourceFeatureId:id,snapshotId,sourceUpdatedAt:updatedAt(feature.properties),...publicAttributes(feature.properties,layer)
 }};
}
export function sanitizeGeoSampaPage(page,{layer,snapshotId,maxRejectedFraction=.02}={}){
 if(!page||!Array.isArray(page.features)||page.features.length>500)throw Error('Página WFS inválida');
 if(!Number.isFinite(maxRejectedFraction)||maxRejectedFraction<0||maxRejectedFraction>.1)throw Error('Limite de rejeição inválido');
 const features=[],seen=new Set();let rejected=0;
 for(const raw of page.features){
  const feature=sanitizeGeoSampaFeature(raw,{layer,snapshotId});
  if(!feature||seen.has(feature.id)){rejected++;continue;}
  seen.add(feature.id);features.push(feature);
 }
 if(!features.length||rejected>Math.max(5,Math.ceil(page.features.length*maxRejectedFraction)))throw Error('Qualidade da página insuficiente');
 return {type:'FeatureCollection',features,source:{layer,snapshotId,returned:page.features.length,rejected}};
}
