/** Persistent national speed-camera snapshot. Coordinates are sourced from licensed
 * public datasets; absent/outdated points are never invented or called live.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseBBox} from './map-public-data.mjs';

const bundledFile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/radars-br.json');
let snapshotPath=bundledFile;
let loadedPath='',loadedMtime=-1,records=[],meta=null;
const clean=x=>typeof x==='string'?x.replace(/[\u0000-\u001f<>]/g,'').slice(0,90):'';
const valid=(lon,lat)=>Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=-75&&lon<=-34&&lat>=-35&&lat<=6;

/** Accept only geographic coordinates; never use road names to guess positions. */
export function parseRadarSnapshot(raw){
 const input=typeof raw==='string'?JSON.parse(raw):raw;
 if(!input||!Array.isArray(input.rows))throw Error('National radar snapshot format invalid');
 if(input.rows.length>120000)throw Error('National radar snapshot exceeds safe limit');
 const output=[],seen=new Set();
 for(const row of input.rows){
  if(!Array.isArray(row)||row.length<2)continue;
  const lon=Number(row[0]),lat=Number(row[1]);
  if(!valid(lon,lat))continue;
  const key=lon.toFixed(5)+':'+lat.toFixed(5);
  if(seen.has(key))continue;
  seen.add(key);
  const rawSpeed=Number(row[2]);
  const speed=Number.isInteger(rawSpeed)&&rawSpeed>=10&&rawSpeed<=150?rawSpeed:null;
  const sourceCode=row[3]==='A'?'ANTT':row[3]==='O'?'OpenStreetMap':'OSM/ANTT';
  output.push({
   id:'radar-catalog-'+key,type:'radar',coords:[lon,lat],priority:100,
   name:'Radar de velocidade',
   description:speed?'Limite registrado na fonte: '+speed+' km/h · confirme a sinalização local':'Localização cadastrada · confirme a sinalização local',
   source:sourceCode,verified:false,
   maxspeed:speed
  });
 }
 return {records:output,meta:{
  count:output.length,
  asOf:typeof input.asOf==='string'?input.asOf:null,
  downloadedAt:typeof input.downloadedAt==='string'?input.downloadedAt:null,
  origin:clean(input.origin||''),
  license:clean(input.license||'ODbL 1.0 / ANTT CC BY 4.0')
 }};
}
/** File path injection exists only for isolated tests. */
export function setRadarSnapshotFileForTests(file){
 snapshotPath=file||bundledFile;loadedPath='';loadedMtime=-1;records=[];meta=null;
}
function ensureLoaded(){
 let stat;
 try{stat=fs.statSync(snapshotPath);}catch{records=[];meta=null;loadedPath=snapshotPath;loadedMtime=-1;return;}
 if(loadedPath===snapshotPath&&loadedMtime===stat.mtimeMs)return;
 try{
  const parsed=parseRadarSnapshot(fs.readFileSync(snapshotPath,'utf8'));
  if(parsed.records.length<1)throw Error('Empty national snapshot');
  records=parsed.records;meta=parsed.meta;
  console.log('[VANO radar catalog] loaded',records.length,'coordinates',meta.asOf||'date unknown');
 }catch(error){console.warn('[VANO radar catalog]',error?.message||String(error));records=[];meta=null;}
 loadedPath=snapshotPath;loadedMtime=stat.mtimeMs;
}
export function queryRadarSnapshot(bbox){
 const b=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox,.3,.3);
 if(!b)throw new RangeError('Radar snapshot bbox invalid');
 ensureLoaded();
 if(!meta)return null;
 const [west,south,east,north]=b;
 const centerLng=(west+east)/2,centerLat=(north+south)/2;
 const filtered=[];
 for(const record of records){
  const [lon,lat]=record.coords;
  if(lon>=west&&lon<=east&&lat>=south&&lat<=north)filtered.push(record);
 }
 filtered.sort((a,b)=>{
  const ax=a.coords[0]-centerLng,ay=a.coords[1]-centerLat;
  const bx=b.coords[0]-centerLng,by=b.coords[1]-centerLat;
  return ax*ax+ay*ay-(bx*bx+by*by);
 });
 return {
  features:filtered.slice(0,160),source:'VANO Radar Catalog',
  datasetCount:meta.count,asOf:meta.asOf,downloadedAt:meta.downloadedAt,
  attribution:'© OpenStreetMap contributors · ANTT · ODbL 1.0 / CC BY 4.0',
  sourceUrl:meta.origin,license:meta.license,
  stale:false,coverage:'public-dataset-not-live'
 };
}
