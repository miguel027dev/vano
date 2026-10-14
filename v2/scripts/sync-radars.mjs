/** Fetch, validate and stage nationally mapped radar coordinates at build/sync time.
 * The result is a portable snapshot, not a network dependency at map runtime.
 * Only use sources explicitly permitting download/reuse with attribution.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outPath=path.resolve(base,'data/radars-br.json');
const datasets=[
 {url:'https://www.radarnobrasil.com/data/radares-map.geojson',format:'geojson',
  asOf:'2026-03-15',origin:'Radar no Brasil · OpenStreetMap / ANTT',license:'OSM ODbL 1.0; ANTT CC BY 4.0'},
 {url:'https://speedcams.world/downloads/br/br-all.csv',format:'csv',
  asOf:null,origin:'SpeedCams.world · OpenStreetMap (snapshot date unknown)',license:'OSM ODbL 1.0'}
];
const asNum=v=>{
 if(typeof v==='number')return v;
 if(typeof v==='string')return Number(v.trim().replace(',','.'));
 return NaN;
};
const ok=(lng,lat)=>Number.isFinite(lng)&&Number.isFinite(lat)&&lng>=-75&&lng<=-34&&lat>=-35&&lat<=6;
const speedVal=v=>{
 const n=asNum(v);
 return Number.isInteger(n)&&n>=10&&n<=150?n:null;
};
function normalizePoint(lng,lat,speed,source){
 const x=asNum(lng),y=asNum(lat);
 if(!ok(x,y))return null;
 return [Number(x.toFixed(6)),Number(y.toFixed(6)),speedVal(speed),source];
}
export function geojsonRows(data){
 let features=Array.isArray(data?.features)?data.features:Array.isArray(data)?data:[];
 const result=[];
 for(const item of features){
  const p=item?.properties||item?.tags||{};
  const coords=item?.geometry?.type==='Point'?item.geometry.coordinates:null;
  const point=normalizePoint(coords?.[0]??p.longitude??item?.longitude,
   coords?.[1]??p.latitude??item?.latitude,
   p.maxspeed??p.speed??p.speed_limit??p.limite_velocidade??p.velocidade,
   /ANTT/i.test(String(p.source||p.fonte||p.origem||''))?'A':
   /openstreetmap|osm/i.test(String(p.source||p.fonte||p.origem||''))?'O':'M');
  if(point&& !/inativ|desativ|removed|inactive/i.test(String(p.situacao||p.status||'')))result.push(point);
 }
 return result;
}
function csvCells(line){
 const sep=line.includes(';')?';':',',parts=[];
 let val='',quoted=false;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(c==='"'){if(quoted&&line[i+1]==='"'){val+='"';i++;}else quoted=!quoted;}
  else if(c===sep&&!quoted){parts.push(val.trim());val='';}
  else val+=c;
 }
 parts.push(val.trim());
 return parts;
}
export function csvRows(contents){
 const lines=contents.split(/\r?\n/).filter(x=>x.trim());
 if(!lines.length)return [];
 let columns=csvCells(lines[0].replace(/^\uFEFF/,''));
 const normalized=columns.map(x=>x.toLowerCase().replace(/[^a-z0-9_]/g,''));
 const position=(re)=>normalized.findIndex(c=>re.test(c));
 let lonIdx=position(/^(longitude|lon|lng|long|x)$/),latIdx=position(/^(latitude|lat|y)$/);
 let speedIdx=position(/^(maxspeed|speed|speed_limit|velocidade|limit)$/);
 let countryIdx=position(/^(country|country_code|iso_country)$/);
 const header=lonIdx>=0&&latIdx>=0;
 // Other OSM export layouts: name,longitude,latitude,maxspeed,country.
 if(!header){latIdx=1;lonIdx=0;speedIdx=3;countryIdx=-1;}
 const rows=[];
 for(const line of lines.slice(header?1:0)){
  const c=csvCells(line);
  if(countryIdx>=0&&c[countryIdx]&&!/^(BR|BRA|Brazil)$/i.test(c[countryIdx]))continue;
  const p=normalizePoint(c[lonIdx],c[latIdx],c[speedIdx], 'O');
  if(p)rows.push(p);
 }
 return rows;
}
export function dedupeRadarRows(rows){
 const points=[],used=new Set();
 for(const r of rows){
  const point=normalizePoint(r?.[0],r?.[1],r?.[2],r?.[3]||'M');
  if(!point)continue;
  const key=point[0].toFixed(5)+':'+point[1].toFixed(5);
  if(used.has(key))continue;
  used.add(key);points.push(point);
 }
 return points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
export async function syncRadarCatalog({fetcher=fetch,output=outPath,sources=datasets}={}){
 const errors=[];
 for(const ds of sources){
  try{
   const response=await fetcher(ds.url,{
    signal:AbortSignal.timeout(25000),headers:{Accept:'application/json,text/csv,*/*'}
   });
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=await response.text();
   if(body.length>20000000)throw Error('Dataset exceeds 20MB limit');
   const rows=dedupeRadarRows(ds.format==='geojson'?geojsonRows(JSON.parse(body)):csvRows(body));
   if(rows.length<5000)throw Error('Too few valid radar coordinates: '+rows.length);
   const snapshot={
    version:1,asOf:ds.asOf,downloadedAt:new Date().toISOString().slice(0,10),
    origin:ds.origin,sourceUrl:ds.url,license:ds.license,rows
   };
   fs.mkdirSync(path.dirname(output),{recursive:true});
   fs.writeFileSync(output,JSON.stringify(snapshot)+'\n','utf8');
   console.log('[VANO radar import]',rows.length,'mapped radar coordinates from',ds.url,'saved',output);
   return snapshot;
  }catch(error){errors.push(ds.url+': '+(error?.message||String(error)));console.warn('[VANO radar import]',errors.at(-1));}
 }
 throw Error('No sufficiently large licensed radar snapshot available. '+errors.join(' | '));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 syncRadarCatalog().catch(error=>{console.error(error);process.exitCode=1;});
}
