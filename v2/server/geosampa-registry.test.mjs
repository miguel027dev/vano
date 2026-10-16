import test from 'node:test';
import assert from 'node:assert/strict';
import {SAO_PAULO_PILOT_LAYERS,samplePilotSources} from './safe-routing/geosampa-registry.mjs';
const xml='<?xml version="1.0"?><WFS_Capabilities><FeatureTypeList>'+
Object.values(SAO_PAULO_PILOT_LAYERS).map(n=>'<FeatureType><Name>'+n+'</Name></FeatureType>').join('')+'</FeatureTypeList></WFS_Capabilities>';
const sample={type:'FeatureCollection',numberMatched:200,features:[{id:'1',type:'Feature',
 geometry:{type:'Point',coordinates:[-46.64,-23.55]},properties:{name:'example'}}]};
test('GeoSampa pilot WFS registry probes only known capabilities',async()=>{
 const calls=[];
 const fetcher=async u=>{
  const url=new URL(u);calls.push(url.searchParams.get('request'));
  return new Response(url.searchParams.get('request')==='GetCapabilities'?xml:JSON.stringify(sample),{status:200});
 };
 const out=await samplePilotSources({fetcher});
 assert.equal(out.catalogCount,8);
 assert.equal(out.datasets.length,8);
 assert.ok(out.datasets.every(x=>x.status==='sampled'));
 assert.equal(calls.length,9);
});
test('catalog unlisted layer is never queried',async()=>{
 const fetcher=async u=>new Response('<?xml version="1.0"?><WFS_Capabilities><FeatureTypeList><FeatureType><Name>geoportal:iluminacao_publica</Name></FeatureType></FeatureTypeList></WFS_Capabilities>',{status:200});
 const out=await samplePilotSources({fetcher});
 assert.equal(out.datasets.filter(x=>x.status==='missing-in-catalog').length,7);
});
