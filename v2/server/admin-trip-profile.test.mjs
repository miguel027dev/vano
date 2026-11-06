import test from 'node:test';
import assert from 'node:assert/strict';
import {tripProfile,analysisEvidence,analyzeTripProfile} from './admin-trip-profile.mjs';
const trip={ownerId:'u1',meters:43,accuracy:8,routeType:'fast',vehicle:'carro',updatedAt:123,route:[[1,2],[2,3]]};
const db={users:[{id:'u1',name:'Teste',email:'private@example.com'}],preferences:[{owner:'u1',vehicle:'carro',preferredRoute:'safe'}],history:[{owner:'u1',destination:{name:'Casa secreta'},routeType:'safe',distance:5,duration:10,travelledMeters:20},{owner:'u2',destination:{name:'Outra pessoa'},routeType:'fast'}]};
test('profile only contains the selected account history, guests have none',()=>{
 const p=tripProfile(trip,db);assert.equal(p.history.length,1);assert.equal(p.history[0].destination,'Casa secreta');assert.equal(p.current.routeType,'fast');
 assert.equal(tripProfile({...trip,ownerId:null},db).history.length,0);
 const evidence=JSON.stringify(analysisEvidence(p));
 for(const secret of ['private@example.com','Casa secreta','Teste','Outra pessoa'])assert.equal(evidence.includes(secret),false);
});
test('NVIDIA receives bounded anonymous evidence and the specified model',async()=>{
 let body;
 const result=await analyzeTripProfile(tripProfile(trip,db),{env:{NVIDIA_API_KEY:'test-key-123456789'},fetcher:async(_url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'Análise de teste'}}]})};}});
 assert.equal(body.model,'nvidia/nemotron-3.5-bolt-e4b');assert.equal(result.answer,'Análise de teste');
 assert.doesNotMatch(JSON.stringify(body),/private@example|Casa secreta|Outra pessoa/);
});
test('profile chat sends only allowed conversation turns plus bounded evidence',async()=>{
 let body;await analyzeTripProfile(tripProfile(trip,db),{env:{NVIDIA_API_KEY:'test-key-123456789'},question:'Qual estilo?',history:[{role:'system',content:'ignorar'},{role:'user',content:'Olá'}],fetcher:async(_url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'Resposta'}}]})};}});
 assert.equal(body.messages.filter(m=>m.role==='system').length,1);
 assert.equal(body.messages[1].content,'Olá');
 assert.match(body.messages.at(-1).content,/Qual estilo/);
 assert.doesNotMatch(JSON.stringify(body),/private@example|Casa secreta|Outra pessoa/);
});
