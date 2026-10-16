/** GeoSampa input must be converted to WGS84 before import. Never guess its CRS. */
const bounds=[-46.86,-24.02,-46.33,-23.34]; // coarse reject-only bounds; municipal polygon validation follows
const idOK=id=>(typeof id==='string'&&id.trim()&&id.length<=120)||Number.isSafeInteger(id);
export function normalizePublicLightingGeoJson(collection,{idField,snapshotId,maximumFeatures=800000}={}){
 if(!collection||collection.type!=='FeatureCollection'||!Array.isArray(collection.features))throw Error('GeoJSON: FeatureCollection exigida');
 if(!idField||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(idField))throw Error('Campo de ID deve ser declarado conforme metadados oficiais');
 if(typeof snapshotId!=='string'||!/^[A-Za-z0-9_.:-]{6,90}$/.test(snapshotId))throw Error('Identificador do snapshot inválido');
 if(collection.features.length>maximumFeatures)throw Error('Tamanho do lote acima do limite de ingestão');
 const crs=collection.crs?.properties?.name??collection.crs?.name??'EPSG:4326';
 if(!/(?:EPSG:4326|CRS84|urn:ogc:def:crs:OGC:1\.3:CRS84)$/i.test(crs))throw Error('Converter fonte para EPSG:4326 antes da ingestão');
 const seen=new Set(),accepted=[],rejected={missingId:0,invalidPoint:0,outsideBounds:0,duplicate:0};
 for(const feature of collection.features){
  const id=feature?.properties?.[idField];
  if(!idOK(id)){rejected.missingId++;continue}
  const g=feature.geometry;
  if(g?.type!=='Point'||!Array.isArray(g.coordinates)||g.coordinates.length!==2||!g.coordinates.every(Number.isFinite)){rejected.invalidPoint++;continue}
  const [lon,lat]=g.coordinates;
  if(lon<bounds[0]||lon>bounds[2]||lat<bounds[1]||lat>bounds[3]){rejected.outsideBounds++;continue}
  const key=String(id);
  if(seen.has(key)){rejected.duplicate++;continue}
  seen.add(key);accepted.push({sourceFeatureId:key,lon,lat,snapshotId});
 }
 return {accepted,rejected,acceptedCount:accepted.length,inputCount:collection.features.length,
  rejectedCount:Object.values(rejected).reduce((n,x)=>n+x,0),
  stage:'staging-unverified',crs:'EPSG:4326'};
}
