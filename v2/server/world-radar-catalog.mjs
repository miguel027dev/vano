/** Snapshot-backed speed camera coverage. Source: OSM/ODbL, never live enforcement.
 * HTTPS exports are downloaded once per service (then periodically refreshed)
 * rather than invoking public Overpass for every map pan.
 * Dataset snapshot age is UNKNOWN, and records must never be called verified.
 */
import {parseBBox} from './map-public-data.mjs';
import {radarDisplayAllowed} from '../src/lib/radarPolicy.js';

export const WORLD_CAMERA_EXPORT='https://speedcams.world/downloads/world/world-all.csv';
export const UK_CAMERA_EXPORT='https://speedcameramap.uk/data/cameras.json';
const REFRESH_MS=12*60*60*1000;
const ERROR_RETRY_MS=10*60*1000;
const MAX_EXPORT_BYTES=18*1024*1024;
const MAX_RECORDS=120000;
const GRID_SCALE=10; // 0.1 degree cells; only nearby cells are queried
const EMPTY=Object.freeze({features:[],source:'VANO World Radar Catalog',coverage:'snapshot-not-live'});
const sourceStates=[
 {id:'world',url:WORLD_CAMERA_EXPORT,records:[],index:new Map(),updatedAt:0,nextRetryAt:0,pending:null,error:null},
 {id:'uk',url:UK_CAMERA_EXPORT,records:[],index:new Map(),updatedAt:0,nextRetryAt:0,pending:null,error:null}
];
const clean=s=>String(s??'').trim().toLowerCase().replace(/[\s_\-/]+/g,'');
const inRange=(lon,lat)=>Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=85;
const keyFor=(lon,lat)=>Math.floor(lon*GRID_SCALE)+':'+Math.floor(lat*GRID_SCALE);
const headerIndex=(columns,names)=>columns.findIndex(x=>names.includes(clean(x)));
const mkRecord=(lon,lat,id='',speed=null,country='')=>{
 if(lon==null||lat==null||String(lon).trim()===''||String(lat).trim()==='')return null;
 lon=Number(lon);lat=Number(lat);
 if(!inRange(lon,lat))return null;
 if(!radarDisplayAllowed([lon,lat]))return null;
 // The Brazilian snapshot is authoritative. Global data is an additional
 // source outside Brazil, and near international borders.
 const safeSpeed=typeof speed==='string'?speed.trim():String(speed??'').trim();
 const safeId=String(id||'').replace(/[^a-zA-Z0-9_:-]/g,'').slice(0,42);
 const stableId=safeId?'osm-world-'+safeId:
  'osm-world-'+lon.toFixed(5)+':'+lat.toFixed(5);
 return {lon,lat,id:stableId,speed:/^\d{1,3}(?:\s?mph)?$/i.test(safeSpeed)?safeSpeed:null,
  country:String(country||'').trim().slice(0,2).toUpperCase()};
};
function readCsvLine(line){
 const fields=[];let value='',quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){
   if(quoted&&line[i+1]==='"'){value+='"';i++;}
   else quoted=!quoted;
  }else if(ch===','&&!quoted){fields.push(value);value='';}
  else value+=ch;
 }
 fields.push(value);
 return fields;
}
export function parseWorldCameraCsv(csv){
 if(typeof csv!=='string'||csv.length>MAX_EXPORT_BYTES)throw Error('Invalid world camera CSV');
 // The published worldwide CSV starts with "# dataset: ..." metadata.
 // The previous parser expected a header on line 1, so all ~72k real rows
 // were discarded and the global map appeared to have no cameras.
 const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/);
 const headerLine=lines.findIndex(line=>line.trim()&&!line.trimStart().startsWith('#'));
 const header=readCsvLine(lines[headerLine]||'');
 const lonI=headerIndex(header,['lon','lng','long','longitude','x']);
 const latI=headerIndex(header,['lat','latitude','y']);
 const idI=headerIndex(header,['osmid','osmnodeid','nodeid','sourceid','id','osmidnumber']);
 const speedI=headerIndex(header,['maxspeed','speed','speedlimit','maxspeedkmh','limit']);
 const countryI=headerIndex(header,['country','countrycode','isocountry','iso2','isocode','countryiso2']);
 if(lonI<0||latI<0)throw Error('World camera CSV missing coordinates: '+header.slice(0,12).join(','));
 const out=[];
 for(let i=headerLine+1;i<lines.length&&out.length<MAX_RECORDS;i++){
  if(!lines[i]||lines[i].trimStart().startsWith('#'))continue;
  const f=readCsvLine(lines[i]);
  const record=mkRecord(f[lonI],f[latI],idI>=0?f[idI]:'',speedI>=0?f[speedI]:null,countryI>=0?f[countryI]:'');
  if(record)out.push(record);
 }
 return out;
}
export function parseUkCameraJson(data){
 // Accept GeoJSON FeatureCollection, arrays, and {cameras:[...]} exports.
 const arr=Array.isArray(data)?data:
  Array.isArray(data?.features)?data.features:
  Array.isArray(data?.cameras)?data.cameras:
  Array.isArray(data?.data)?data.data:
  Array.isArray(data?.points)?data.points:
  Array.isArray(data?.items)?data.items:
  Array.isArray(data?.results)?data.results:
  Array.isArray(data?.cameras?.features)?data.cameras.features:
  Array.isArray(data?.cameras?.data)?data.cameras.data:[];
 const out=[];
 for(const item of arr.slice(0,MAX_RECORDS)){
  const props=item?.properties||item?.attributes||item||{};
  const coords=item?.geometry?.coordinates||item?.coordinates||item?.coords;
  const lon=Array.isArray(coords)?coords[0]:
    props.lon??props.lng??props.longitude??props.location?.lon??props.location?.lng??
    item?.geometry?.x;
  const lat=Array.isArray(coords)?coords[1]:
    props.lat??props.latitude??props.location?.lat??item?.geometry?.y;
  const record=mkRecord(lon,lat,props.osm_id??props.osmid??props.osmId??props.id??item?.id,
   props.speed_limit??props.maxspeed??props.speed,'GB');
  if(record)out.push(record);
 }
 return out;
}
function makeIndex(rows){
 const index=new Map();
 for(const r of rows){
  const key=keyFor(r.lon,r.lat);
  let cell=index.get(key);
  if(!cell){cell=[];index.set(key,cell);}
  cell.push(r);
 }
 return index;
}
async function fetchSnapshot(state,{fetcher=fetch,now=Date.now}={}){
 const moment=now();
 if(state.pending)return state.pending;
 if(state.updatedAt&&moment-state.updatedAt<REFRESH_MS)return;
 if(moment<state.nextRetryAt)return;
 state.pending=(async()=>{
  try{
   const response=await fetcher(state.url,{method:'GET',
    signal:AbortSignal.timeout(12000),
    headers:{'Accept':state.id==='uk'?'application/json':'text/csv',
      'User-Agent':'VANO Maps public OpenStreetMap camera catalog (https://vanomaps.online)'}});
   if(!response.ok)throw Error('HTTP '+response.status);
   const length=Number(response.headers?.get?.('content-length')||0);
   if(length>MAX_EXPORT_BYTES)throw Error('World radar export exceeds maximum size');
   const body=await response.text();
   if(body.length>MAX_EXPORT_BYTES)throw Error('World radar export exceeds maximum size');
   const rows=state.id==='world'?parseWorldCameraCsv(body):parseUkCameraJson(JSON.parse(body));
   // Reject malformed or truncated feeds; never overwrite a good old snapshot.
   if(rows.length<(state.id==='world'?1000:300))throw Error('Too few mapped cameras: '+rows.length);
   state.index=makeIndex(rows);state.records=rows;
   state.updatedAt=now();state.nextRetryAt=state.updatedAt+REFRESH_MS;
   state.error=null;
   console.log('[VANO world radar catalog]',state.id,'loaded',rows.length,'OSM records');
  }catch(error){
   state.error=error?.message||String(error);
   state.nextRetryAt=now()+ERROR_RETRY_MS;
   console.warn('[VANO world radar catalog]',state.id,state.error);
  }
 })().finally(()=>{state.pending=null;});
 return state.pending;
}
export function resetWorldRadarCatalogForTests(){
 for(const state of sourceStates){
  state.index=new Map();state.records=[];state.updatedAt=0;
  state.nextRetryAt=0;state.pending=null;state.error=null;
 }
}
export async function queryWorldRadarCatalog(bbox,opts={}){
 const b=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox,.3,.3);
 if(!b)throw RangeError('Invalid camera catalog bbox');
 await Promise.all(sourceStates.map(state=>fetchSnapshot(state,opts)));
 const [w,s,e,n]=b,features=[],seen=new Set(),cx=(w+e)/2,cy=(s+n)/2;
 for(const state of sourceStates){
  for(let lon=Math.floor(w*GRID_SCALE);lon<=Math.floor(e*GRID_SCALE);lon++){
   for(let lat=Math.floor(s*GRID_SCALE);lat<=Math.floor(n*GRID_SCALE);lat++){
    for(const row of state.index.get(lon+':'+lat)||[]){
     if(row.lon<w||row.lon>e||row.lat<s||row.lat>n)continue;
     const position=row.lon.toFixed(5)+':'+row.lat.toFixed(5);
     if(seen.has(position))continue;
     seen.add(position);
     features.push({id:row.id,type:'radar',coords:[row.lon,row.lat],priority:100,
      name:'Radar cadastrado',description:row.speed
       ?'Limite registrado: '+row.speed+' · confirme a sinalização local'
       :'Registro público OSM · confirme a sinalização local',
      source:'OpenStreetMap',verified:false});
    }
   }
  }
 }
 features.sort((a,b)=>((a.coords[0]-cx)**2+(a.coords[1]-cy)**2)-
  ((b.coords[0]-cx)**2+(b.coords[1]-cy)**2)||a.id.localeCompare(b.id));
 return {...EMPTY,features:features.slice(0,160),datasetCount:sourceStates.reduce((sum,x)=>sum+x.records.length,0),
  available:sourceStates.some(x=>x.records.length>0),
  sourceUrl:'https://speedcams.world/data-sources',
  licenseUrl:'https://www.openstreetmap.org/copyright',
  attribution:'© OpenStreetMap contributors (ODbL)',
  stale:true,sourceAsOf:null,coverage:'mapped-snapshot-not-live',
  sourceStatus:sourceStates.map(x=>({id:x.id,loaded:x.records.length>0,count:x.records.length}))};
}
