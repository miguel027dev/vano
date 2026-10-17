/** Historical PRF accident density. Never mislabeled as active incidents. */
import fs from 'node:fs';
import {parseBBox} from './map-public-data.mjs';
const clean=s=>typeof s==='string'?s.slice(0,100):null;
export function normalizePrfRiskGrid(raw,bbox){
 if(!raw||raw.historical!==true||raw.live!==false||!Array.isArray(raw.rows))return [];
 const rows=[];
 for(const cell of raw.rows.slice(0,80000)){
  if(!Array.isArray(cell)||cell.length<3)continue;
  const [lon,lat,count]=cell;
  if(![lon,lat,count].every(Number.isFinite)||count<3||count>100000||
   lon<bbox[0]||lon>bbox[2]||lat<bbox[1]||lat>bbox[3])continue;
  rows.push({coords:[lon,lat],incidents:count,historical:true,
   source:'PRF',timeframe:'base histórica',live:false});
  if(rows.length===120)break;
 }
 return rows;
}
let knownPath='',knownStamp=-1,catalog=null;
export function prfHistoricalSnapshot(bbox,filePath=''){
 const b=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox,.3,.3);
 if(!b)throw new RangeError('Invalid PRF historical bbox');
 if(!filePath||typeof filePath!=='string')return {enabled:false,historical:true,live:false,
  cells:[],affectsRouting:false,source:'PRF'};
 let stat;
 try{stat=fs.statSync(filePath);if(stat.size>8*1024*1024)throw Error('too-large');}
 catch{return {enabled:false,historical:true,live:false,cells:[],affectsRouting:false,source:'PRF'};}
 if(filePath!==knownPath||stat.mtimeMs!==knownStamp){
  knownPath=filePath;knownStamp=stat.mtimeMs;
  try{
   const parsed=JSON.parse(fs.readFileSync(filePath,'utf8'));
   if(parsed.historical!==true||parsed.live!==false||!Array.isArray(parsed.rows))throw Error('invalid-prf-grid');
   catalog=parsed;
  }catch{catalog=null;}
 }
 return {enabled:!!catalog,historical:true,live:false,asOf:clean(catalog?.importedAt),
  cells:catalog?normalizePrfRiskGrid(catalog,b):[],affectsRouting:false,
  source:'Polícia Rodoviária Federal',
  disclaimer:'Densidade histórica; não indica acidente em andamento nem bloqueio atual.'};
}
