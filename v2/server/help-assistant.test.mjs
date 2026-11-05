import test from 'node:test';
import assert from 'node:assert/strict';
import {createHelpAssistant} from './help-assistant.mjs';
test('local help answers known subjects with internal links',async()=>{
 const ask=createHelpAssistant();
 for(const [question,id] of [['Meu GPS falhou','location'],['Como recuperar senha?','password'],['Como confirmar o cadastro?','verify'],['Onde estão favoritos?','saved']]){
  const answer=await ask({question});assert.equal(answer.id,id);assert.equal(answer.source,'local');
  assert.ok(answer.links.every(link=>link.href.startsWith('/')&&!link.href.startsWith('//')));
 }
});
test('unknown questions stay within the documented help scope',async()=>{
 const answer=await createHelpAssistant()({question:'Qual é o resultado do campeonato?'});
 assert.equal(answer.id,'unknown');assert.equal(answer.source,'local');
});
test('invalid and personal inputs are handled without a provider',async()=>{
 const ask=createHelpAssistant();
 await assert.rejects(()=>ask({question:'x'}),{status:400});await assert.rejects(()=>ask({question:'x'.repeat(601)}),{status:400});
 assert.equal((await ask({question:'conta pessoa@example.test'})).id,'private');
 const answer=await ask({question:'Como recuperar senha?',useAI:true,user:{email:'private@example.test'}});
 assert.equal(answer.source,'local');assert.doesNotMatch(JSON.stringify(answer),/private@example/);
});
