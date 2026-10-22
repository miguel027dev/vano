import test from 'node:test';
import assert from 'node:assert/strict';
import {createSptransOlhoVivo,inspectSptransKml,unzipSptransKml} from './sptrans-olhovivo.mjs';

const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
 '<Placemark><ExtendedData><Data name="velocidade"><value>19</value></Data>'+
 '<Data name="sentido"><value>BC</value></Data></ExtendedData>'+
 '<LineString><coordinates>-46.7,-23.6 -46.699,-23.6</coordinates></LineString></Placemark>'+
 '</Document></kml>';
function mockKmz(text=xml){
 // Minimal standards-compliant ZIP/KMZ with a single uncompressed doc.kml.
 const data=Buffer.from(text),name=Buffer.from('doc.kml');
 const local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
 local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 const center=Buffer.alloc(46);
 center.writeUInt32LE(0x02014b50,0);center.writeUInt16LE(20,4);center.writeUInt16LE(20,6);
 center.writeUInt32LE(data.length,20);center.writeUInt32LE(data.length,24);center.writeUInt16LE(name.length,28);
 const offset=local.length+name.length+data.length;
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
 end.writeUInt32LE(center.length+name.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,name,data,center,name,end]);
}
test('KMZ parser only reports sanitized structure, not raw speed or coordinates',()=>{
 const info=inspectSptransKml(unzipSptransKml(mockKmz()));
 assert.deepEqual(info,{placemarks:1,lines:1,speedFields:1,directionFields:1});
 assert.ok(!JSON.stringify(info).includes('-46.'));
 assert.throws(()=>unzipSptransKml(Buffer.from('not a zip')),/invalid-kmz/);
 assert.throws(()=>inspectSptransKml('<!DOCTYPE kml><kml/>'),/invalid-kml/);
});
test('SPTrans client authenticates with secret token and a session cookie on server only',async()=>{
 const calls=[];
 const fetcher=async (url,options)=>{
  calls.push({url,options});
  if(url.includes('Autenticar'))return new Response('true',{status:200,headers:{'set-cookie':'ASP.NET_SessionId=sample123; Path=/; Secure'}});
  return new Response(mockKmz(),{status:200,headers:{'content-type':'application/vnd.google-earth.kmz'}});
 };
 const client=createSptransOlhoVivo({token:'test-secret-never-disclose',fetcher,clock:()=>1000000});
 const response=await client.refresh();
 assert.equal(response.online,true);
 assert.equal(response.affectsRouting,false);
 assert.equal(response.persistsTraffic,false);
 assert.equal(response.kmz.lines,1);
 assert.equal(calls.length,2);
 assert.equal(calls[1].options.headers.Cookie,'ASP.NET_SessionId=sample123');
 assert.ok(!JSON.stringify(client.status()).includes('test-secret'));
 await client.refresh();
 assert.equal(calls.length,2,'cooldown prevents repeated provider calls');
});
test('missing token and failed authentication never request KMZ or affect routing',async()=>{
 const disabled=createSptransOlhoVivo();
 assert.equal((await disabled.refresh()).configured,false);
 let count=0;
 const denied=createSptransOlhoVivo({token:'bogus',fetcher:async()=>{
  count++;return new Response('false',{status:200});
 }});
 const result=await denied.refresh();
 assert.equal(count,1);assert.equal(result.online,false);
 assert.equal(result.error,'auth-denied');
 assert.equal(result.kmz,null);
 assert.equal(result.affectsRouting,false);
});
test('SPTrans adapter is never coupled directly into the router engine',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('./sptrans-olhovivo.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/process\.env\.(?:MAPBOX|TOMTOM|DATABASE_URL)/);
 assert.doesNotMatch(src,/writeFile|INSERT INTO|fetch\(.+api\/route/);
});
