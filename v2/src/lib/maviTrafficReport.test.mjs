import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMaviTrafficReport,classifyMaviRoadReport} from './maviTrafficReport.mjs';
test('MAVI recognizes concise local road observations and explicit reports',()=>{
 const cases={
  'Mavi tá muito trânsito':'transito',
  'Ô, tá muito trânsito!':'transito',
  'MAVI, tá tendo trânsito aqui nessa rua!':'transito',
  'Ô Mavi, tá tendo muito trânsito aqui. Faz uma ocorrência.':'transito',
  'Mavi estou pegando engarrafamento aqui':'transito',
  'Mavi registra uma ocorrência de trânsito':'transito',
  'Mavi tem muito trânsito nessa rua':'transito',
  'Mavi, tem alagamento aqui':'alagamento',
  'Mavi, tá alagado aqui':'alagamento',
  'Mavi, registra um alagamento':'alagamento',
  'Mavi tem obstáculo na pista aqui':'obstaculo',
  'Mavi, registra uma ocorrência de obstáculo aqui':'obstaculo',
  'Mavi, tem um objeto na pista':'obstaculo',
  'Mavi, essa rua tá fechada':'via_fechada',
  'Mavi, a avenida está interditada':'via_fechada',
  'Mavi, registra rua fechada aqui':'via_fechada'
 };
 for(const [speech,want] of Object.entries(cases))assert.equal(classifyMaviRoadReport(speech),want,speech);
});
test('questions, hypothetical, remote and no-problem sentences never submit',()=>{
 for(const speech of [
  'Mavi, como está o trânsito?',
  'Mavi tem trânsito na minha rota?',
  'Mavi liga o trânsito no mapa',
  'Mavi mostra o trânsito',
  'Mavi está previsto trânsito amanhã?',
  'Mavi, qual a situação do trânsito aqui?',
  'Mavi, não tem trânsito aqui',
  'Mavi, sem alagamento aqui',
  'Mavi, nenhum obstáculo aqui',
  'Mavi, a rua não está fechada',
  'Mavi, tá tendo trânsito lá no centro',
  'Mavi ontem teve alagamento',
  'Mavi, tem blitz aqui',
  'Mavi como está o alagamento nessa rua?'
 ])assert.equal(classifyMaviRoadReport(speech),null,speech);
});
test('traffic compatibility, incident prioritization and untrusted inputs',()=>{
 assert.equal(classifyMaviTrafficReport('Mavi tá tendo muito trânsito aqui'),'transito');
 assert.equal(classifyMaviTrafficReport('Mavi tá alagado aqui'),null);
 assert.equal(classifyMaviRoadReport('Mavi tá tendo trânsito por causa do alagamento aqui'),'alagamento');
 assert.equal(classifyMaviRoadReport(null),null);
 assert.equal(classifyMaviRoadReport('x'.repeat(400)),null);
});
