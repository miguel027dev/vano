import test from 'node:test';
import assert from 'node:assert/strict';
import {maviProposalDecision,maviProposalFollowup} from './maviAssistant.mjs';
import {maviConfirmation} from './maviVoiceLogic.mjs';

test('pending offer understands conversational Brazilian Portuguese consent',()=>{
 for(const utterance of [
  'sim','sim quero','quero','quero sim','quero essa','quero essa rota',
  'Mavi pode','pode','pode ser','pode trocar','claro','com certeza',
  'manda','manda ver','bora','bora lá','fechou','fechado','demorou',
  'beleza','isso','uhum','aham','aceito','confirmo','positivo',
  'gostei dessa, pode ser essa','vai nessa','troque','ok','tá bom'
 ]){
  assert.equal(maviProposalDecision(utterance),'accept',utterance);
  assert.equal(maviConfirmation(utterance),'accept',utterance);
 }
});
test('rejections, delays and late self-corrections are respected',()=>{
 for(const utterance of [
  'não','não quero','não quero essa','quero não','não troca','agora não',
  'melhor não','deixa quieto','deixa como está','prefiro a atual',
  'cancelar','mantenha','depois','mais tarde','sim, não, melhor não',
  'Mavi, não, obrigado'
 ])assert.equal(maviProposalDecision(utterance),'reject',utterance);
 assert.equal(maviProposalDecision('não, pensando bem quero sim'),'accept');
 assert.equal(maviProposalDecision('sim, na verdade não quero'),'reject');
});
test('ambiguity, fresh constraints and follow-up questions never apply a proposed route',()=>{
 for(const utterance of [
  'qual a diferença?','quanto tempo economiza?','depende, tem pedágio?',
  'quero uma rota mais tranquila','quero a segunda','prefiro a primeira',
  'não quero passar pela Giovanni Gronchi','não gostei dessa, calcula outra',
  'troca a rota','procura outro caminho','sim, mas sem pedágio',
  'pode repetir?','pode me dizer mais detalhes?','talvez',
  'quero um posto','quero uma farmácia','quero ir para casa',
  'quero comprar comida','quero descansar','pode me ajudar','pode me dizer o preço',
  'pode cancelar a navegação','me leva para casa',
  'quero ir por outra rua'
 ])assert.equal(maviProposalDecision(utterance),null,utterance);
 for(const utterance of ['quanto tempo economiza?','qual a diferença?','depende, tem pedágio?'])
  assert.equal(maviProposalFollowup(utterance),'question',utterance);
 for(const utterance of ['talvez','não entendi','pera aí','pode repetir'])
  assert.equal(maviProposalFollowup(utterance),'clarify',utterance);
});
