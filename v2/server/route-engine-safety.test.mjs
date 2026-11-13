import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateVanuRoutes} from './route-engine.mjs';

function route(duration,notificationType=null){
  const coordinates=Array.from({length:10},(_,i)=>[-46.70+i*.001,-23.60]);
  return {duration,distance:1800,
    geometry:{type:'LineString',coordinates},
    legs:[{annotation:{distance:Array(9).fill(200),congestion:Array(9).fill('low')},
      steps:[],notifications:notificationType?[{type:notificationType}]:[]}]};
}
const provider=routes=>async()=>({ok:true,json:async()=>({code:'Ok',routes})});
const start=[-46.7,-23.6],destination=[-46.691,-23.6],options={adaptive:false,variantBudget:2};

test('native V2 ignores fastest provider route if it has an access violation',async()=>{
 const r=await calculateVanuRoutes(start,destination,'carro',{},'pt-BR',options,'native-safety-a',
   provider([route(600,'violation'),route(980)]));
 assert.equal(r.candidateEngine.candidateCount,1);
 assert.equal(r.candidateEngine.additionalRequests,0);
 assert.equal(r.routes.find(x=>x.id==='fast').duration,Math.round(980/60));
 assert.equal(r.routes.find(x=>x.id==='fast').verifiedSafety,false);
});
test('native V2 fails safely if every profile returns a restricted route',async()=>{
 await assert.rejects(
   calculateVanuRoutes(start,destination,'carro',{},'pt-BR',options,'native-safety-b',
     provider([route(600,'violation')])),
   /sem violação de acesso/
 );
});
test('native V2 does not invent restrictions from ordinary provider warnings',async()=>{
 const r=await calculateVanuRoutes(start,destination,'carro',{},'pt-BR',options,'native-safety-c',
   provider([route(725,'warning')]));
 assert.equal(r.routes.find(x=>x.id==='fast').duration,Math.round(725/60));
});
