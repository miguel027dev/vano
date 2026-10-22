/** Offline adapter: reviewed, directional speed GeoJSON -> bounded VANO V2 snapshot.
 * It deliberately does NOT download SPTrans KMZ or assume GeoSampa has live speeds.
 * Usage: node scripts/traffic-memory-import.mjs input.geojson output.json --license-reviewed
 */
import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildTrafficMemory} from '../server/traffic-memory.mjs';

const [input,output,confirmation]=process.argv.slice(2);
if(!input||!output||confirmation!=='--license-reviewed'){
 console.error('Usage: node scripts/traffic-memory-import.mjs input.geojson output.json --license-reviewed');
 process.exit(2);
}
const ALLOWED=new Set(['sptrans-olhovivo','vano-consented-aggregate','municipal-verified-speed']);
const inPath=resolve(input),outPath=resolve(output);
if(inPath===outPath)throw Error('Input and output must be different files.');
const file=await stat(inPath);
if(file.size>8_000_000)throw Error('Input too large.');
const geo=JSON.parse(await readFile(inPath,'utf8'));
if(geo?.type!=='FeatureCollection'||!Array.isArray(geo.features)||geo.features.length>20000)
 throw Error('Expected a bounded GeoJSON FeatureCollection.');
const records=[],now=Date.now(),seen=new Set();
for(const feature of geo.features){
 const p=feature?.properties||{},coords=feature?.geometry?.coordinates;
 if(feature?.type!=='Feature'||feature?.geometry?.type!=='LineString'||
  !Array.isArray(coords)||coords.length<2||coords.length>500)continue;
 const source=String(p.source||'').trim();
 if(!ALLOWED.has(source)||p.licenseVerified!==true||p.directionVerified!==true)continue;
 const id=String(p.edgeId||p.id||'').replace(/[^a-z0-9:._-]/gi,'').slice(0,60);
 if(!id||String(p.edgeId||p.id||'')!==id)continue;
 // Long centerlines must be split and direction-verified upstream; never guess
 // carriageway orientation from GeoJSON name or road proximity.
 if(coords.length!==2)continue;
 const item={id,coordinates:coords,weekday:p.weekday,quarter:p.quarter,
  speedKmh:p.speedKmh,freeFlowKmh:p.freeFlowKmh,samples:p.samples,
  lastObservedAt:p.lastObservedAt,source,licenseVerified:true};
 const fingerprint=[id,item.weekday,item.quarter].join(':');
 if(seen.has(fingerprint))continue;
 seen.add(fingerprint);
 records.push(item);
}
const snapshot={records};
const verified=buildTrafficMemory(snapshot,{now});
if(verified.recordCount!==records.length||records.length===0)
 throw Error('Some observations were invalid, outdated or unlicensed; nothing written.');
const tmp=outPath+'.tmp-'+process.pid;
try{
 await writeFile(tmp,JSON.stringify(snapshot),{mode:0o600,flag:'wx'});
 await rename(tmp,outPath);
 console.log(JSON.stringify({sourceRows:geo.features.length,accepted:verified.recordCount,
  sources:verified.sourceCount,output:outPath}));
}catch(error){
 try{await (await import('node:fs/promises')).unlink(tmp);}catch{}
 throw error;
}
