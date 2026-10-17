import test from 'node:test';
import assert from 'node:assert/strict';
import {maviIncidentFollowupDecision,maviIncidentOffer} from './maviIncidentFollowup.mjs';
test('offer names match four supported occurrences and only those',()=>{
 const cases={
  transito:['Registrei o trânsito aqui. Quer que eu procure uma rota mais rápida?','rota mais rápida'],
  alagamento:['Registrei o alagamento aqui. Quer que eu procure outra rota?','procura outra rota'],
  obstaculo:['Registrei o obstáculo aqui. Quer que eu procure outro caminho?','procura outra rota'],
  via_fechada:['Registrei a rua fechada aqui. Quer que eu procure outra rota?','procura outra rota']
 };
 for(const [type,[question,command]] of Object.entries(cases)){
  const offer=maviIncidentOffer(type);
  assert.equal(offer.question,question);
  assert.ok(offer.command.includes(command));
 }
 assert.equal(maviIncidentOffer('fiscalizacao'),null);
 assert.equal(maviIncidentOffer('acidente'),null);
});
test('accept and decline are intentional, not questions or unrelated speech',()=>{
 for(const value of ['Sim','Pode procurar','Mavi pode recalcular','Quero outra rota','Quero uma rota mais rápida','Bora','pode sim'])
  assert.equal(maviIncidentFollowupDecision(value),'accept',value);
 for(const value of ['Não','Não, obrigado','Agora não','Deixa quieto','Mantenha a rota'])
  assert.equal(maviIncidentFollowupDecision(value),'reject',value);
 for(const value of ['Como é essa rota?','Pode me dizer quanto falta?','Sim, mas só se não tiver pedágio','Quero um hospital','Talvez','Não sei','Quero ver o mapa'])
  assert.equal(maviIncidentFollowupDecision(value),null,value);
});
