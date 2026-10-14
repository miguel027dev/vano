import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {geojsonRows,csvRows,dedupeRadarRows,syncRadarCatalog} from '../scripts/sync-radars.mjs';
import {parseRadarSnapshot,setRadarSnapshotFileForTests,queryRadarSnapshot} from './radar-catalog.mjs';

test('strict geographic normalization, no fabricated coordinates or inactive radars',()=>{
 const data={type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[-46.6552,-23.5622]},properties:{maxspeed:'50',source:'OpenStreetMap'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-46.656,-23.563]},properties:{status:'inativo'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[14.1,44.9]},properties:{}},
  {type:'Feature',geometry:{type:'LineString',coordinates:[[1,2],[3,4]]},properties:{}}
 ]};
 assert.deepEqual(geojsonRows(data),[[-46.6552,-23.5622,50,'O']]);
 assert.equal(dedupeRadarRows([...geojsonRows(data),...geojsonRows(data)]).length,1);
});
test('geographic bbox lookup works fully offline, respects source & metadata',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vano-radar-'));
 const filename=path.join(dir,'radars.json');
 const input={asOf:'2026-03-15',origin:'Radar no Brasil',license:'ODbL 1.0',rows:[
  [-46.6552,-23.5622,50,'O'],[-46.642,-23.57,null,'A'],[-43.21,-22.91,60,'O'],
  [999,-10,50,'A']
 ]};
 fs.writeFileSync(filename,JSON.stringify(input),'utf8');
 try{
  setRadarSnapshotFileForTests(filename);
  const result=queryRadarSnapshot([-46.67,-23.58,-46.63,-23.55]);
  assert.equal(result.datasetCount,3);
  assert.equal(result.features.length,2);
  assert.equal(result.features[0].type,'radar');
  assert.equal(result.features[0].priority,100);
  assert.match(result.attribution,/OpenStreetMap/);
  assert.match(result.features[0].description,/sinalização local/);
  assert.equal(result.asOf,'2026-03-15');
 }finally{setRadarSnapshotFileForTests(null);fs.rmSync(dir,{recursive:true,force:true});}
});
test('CSV backup can read long/lat headers and ISO-BR points',()=>{
 const csv='longitude,latitude,maxspeed,country\n-46.641,-23.566,60,BR\n-46.623,-23.55,50,BR\n-14.0,42.3,70,IT\n';
 assert.deepEqual(csvRows(csv),[[-46.641,-23.566,60,'O'],[-46.623,-23.55,50,'O']]);
});
test('a failed first source switches to the next validated provider',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vano-radar-'));
 const filename=path.join(dir,'radars.json');
 const fetcher=async url=>url.includes('bad')
  ?{ok:false,status:503}
  :{ok:true,text:async()=>[
    'longitude,latitude,maxspeed,country',
    ...Array.from({length:5100},(_,i)=>[-70+i*.003,-27.1+i*.0013,80,'BR'].join(','))
   ].join('\n')};
 try{
  const result=await syncRadarCatalog({output:filename,fetcher,sources:[
   {url:'https://bad.example/',format:'geojson'},
   {url:'https://good.example/',format:'csv',asOf:null,origin:'OSM',license:'ODbL 1.0'}
  ]});
  assert.ok(result.rows.length>=5000);
  assert.equal(parseRadarSnapshot(fs.readFileSync(filename,'utf8')).records.length,result.rows.length);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('source snapshot integration does not require Overpass on every map request',()=>{
 const server=fs.readFileSync(new URL('./map-radars.mjs',import.meta.url),'utf8');
 assert.match(server,/queryRadarSnapshot\(b\)/);
 assert.match(server,/if\(snapshot&&entirelyBrazilCore\(b\)\)/);
 assert.match(server,/mergeRadarSources\(national,result\)/);
 assert.match(server,/coverage/);
});
