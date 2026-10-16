import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaviPlaceIntent,detectMaviResume,contextualMaviIntent} from './maviFlexible.mjs';
import {classifyMaviIntent} from './maviAssistant.mjs';

test('MAVI detects flexible Portuguese local-place and route-corridor questions',()=>{
 const examples=[
  ['Mavi, onde tem um mercado perto de mim?','grocery','nearby'],
  ['Qual é o supermercado mais próximo?','grocery','nearby'],
  ['MAVI acha um mercado no caminho pra mim','grocery','route'],
  ['Você pode encontrar um mercado na minha rota?','grocery','route'],
  ['Mavi, tem alguma farmácia na rota?','pharmacy','route'],
  ['Ei Mavi, preciso de uma farmácia','pharmacy','nearby'],
  ['Mostra a drogaria mais próxima','pharmacy','nearby'],
  ['Mavi, o mercado, quer dizer, a farmácia mais próxima','pharmacy','nearby'],
  ['Mavi, qual a farmácia que fica no meu caminho?','pharmacy','route'],
  ['Tem um hospital mais perto?','hospital','nearby'],
  ['Onde encontro um restaurante no trajeto?','restaurant','route'],
  ['Mavi, uma cafeteria perto daqui','cafe','nearby'],
  ['Preciso de um estacionamento no meu caminho','parking','route'],
  ['Mavi, me leva para o hospital mais próximo','hospital','nearby'],
  ['Mavi, mercado no caminho sem desviar muito','grocery','route']
 ];
 for(const [phrase,category,scope] of examples){
  assert.deepEqual(parseMaviPlaceIntent(phrase),{type:'poi',category,scope},phrase);
 }
 assert.equal(parseMaviPlaceIntent('Mavi, qual a próxima curva?'),null);
 assert.equal(parseMaviPlaceIntent('Mavi, qual é minha velocidade?'),null);
 assert.equal(parseMaviPlaceIntent('O mercado é complicado de chegar'),null);
});
test('MAVI understands many rephrasings of continue-to-original intent',()=>{
 const examples=['Mavi, continuar viagem','Mavi, continua a viagem','Seguir viagem',
  'Mavi, voltar ao destino original','Volta para meu destino',
  'Mavi, já terminei a parada','Mavi, retomar trajeto',
  'Mavi, seguir para o destino final','Mavi, voltar para o destino anterior'];
 for(const phrase of examples)assert.equal(detectMaviResume(phrase),true,phrase);
 assert.equal(detectMaviResume('Mavi, outra rota'),false);
});
test('MAVI help and navigation Q&A tolerate changed word order and STT greeting',()=>{
 const cases=[
  ['Mavi, o que você consegue fazer?','help'],
  ['Mas viu que você consegue fazer?','help'],
  ['Me explica em que você consegue me ajudar','help'],
  ['Ei Mavi, quais coisas você sabe fazer','help'],
  ['Mavi, quanto tempo ainda falta?','remaining_time'],
  ['Mavi, me diz em quantos quilômetros falta chegar','remaining_distance'],
  ['Que horas eu chego lá?','arrival'],
  ['Mavi, qual a próxima instrução?','next_maneuver'],
  ['Pra onde eu vou virar agora?','next_maneuver']
 ];
 for(const [phrase,intent] of cases){
  assert.equal(contextualMaviIntent(phrase)||classifyMaviIntent(phrase),intent,phrase);
 }
});
