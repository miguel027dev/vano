/**
 * GeoSampa import gate. This is deliberately OFFLINE: never request external
 * URLs while serving a navigation request. Transform SIRGAS 2000 / UTM
 * zone 23S (EPSG:31983) to EPSG:4326 before passing features here.
 */
import {createHash} from 'node:crypto';

const validDate=value=>typeof value==='string' && !Number.isNaN(Date.parse(value));
const validSpCoordinate=p=>Array.isArray(p)&&p.length===2 &&
  p.every(x=>typeof x==='number'&&Number.isFinite(x)) &&
  p[0]>=-47.5&&p[0]<=-46.1&&p[1]>=-24.2&&p[1]<=-23.1;

export function validateSourceMetadata(meta) {
  if (!meta || meta.sourceId!=='geosampa_sp_iluminacao' ||
      typeof meta.publisher!=='string' || !meta.publisher.trim() ||
      typeof meta.downloadUrl!=='string' || !meta.downloadUrl.startsWith('https://') ||
      typeof meta.license!=='string' || !meta.license.trim() || /^(TO_VERIFY|TBD|UNKNOWN)/i.test(meta.license) ||
      typeof meta.datasetVersion!=='string' || !meta.datasetVersion.trim() ||
      !validDate(meta.downloadedAt) || !validDate(meta.updatedAt) ||
      meta.crs!=='EPSG:4326') {
    throw new TypeError('Invalid source metadata; verify publisher, license, dates, HTTPS URL and EPSG:4326');
  }
  const url=new URL(meta.downloadUrl);
  if(url.username || url.password || url.hostname!=='download.geosampa.prefeitura.sp.gov.br')
    throw new TypeError('Source download host not allowlisted');
  return {
    sourceId:meta.sourceId,publisher:meta.publisher.trim(),
    downloadUrl:meta.downloadUrl,license:meta.license.trim(),
    datasetVersion:meta.datasetVersion,updatedAt:new Date(meta.updatedAt).toISOString(),
    downloadedAt:new Date(meta.downloadedAt).toISOString(),crs:meta.crs
  };
}

export function validateGeoSampaLights(collection, metadata, {maxFeatures=1_000_000,maxInvalidFraction=0.02}={}) {
  const source=validateSourceMetadata(metadata);
  if (!collection || collection.type!=='FeatureCollection' ||
      !Array.isArray(collection.features) || collection.features.length===0 ||
      collection.features.length>maxFeatures) throw new TypeError('Invalid GeoJSON FeatureCollection');
  // GeoJSON convention is WGS84; refuse an explicit projected CRS.
  const crs=collection.crs?.properties?.name;
  if (crs && !/^(EPSG:4326|urn:ogc:def:crs:OGC:1.3:CRS84)$/i.test(crs))
    throw new TypeError('Projected GeoJSON must be transformed to EPSG:4326 first');
  const accepted=[],seen=new Set();let rejected=0;
  for (const feature of collection.features) {
    const id=feature?.id ?? feature?.properties?.id ?? feature?.properties?.ID;
    const point=feature?.geometry?.coordinates;
    if (feature?.type!=='Feature'||feature?.geometry?.type!=='Point'||
      (typeof id!=='string'&&typeof id!=='number')||String(id).length>100||
      !validSpCoordinate(point)||seen.has(String(id))) {rejected++;continue;}
    seen.add(String(id));
    // Do not import arbitrary properties such as owner/user data.
    accepted.push({sourceId:String(id),longitude:point[0],latitude:point[1],sourceVersion:source.datasetVersion});
  }
  const invalidFraction=rejected/collection.features.length;
  if (!accepted.length||invalidFraction>maxInvalidFraction)
    throw new Error('Import quarantined: excessive invalid or duplicate records ('+rejected+')');
  const checksum=createHash('sha256').update(JSON.stringify(accepted)).digest('hex');
  return {source,accepted,rejected,checksum,quality:{accepted:accepted.length,total:collection.features.length,invalidFraction}};
}
