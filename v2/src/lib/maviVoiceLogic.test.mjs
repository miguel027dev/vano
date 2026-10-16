import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMaviSpeech,extractMaviCommand,maviConfirmation,maviRearmDelay} from './maviVoiceLogic.mjs';

test('MAVI wake word is required at the start of every utterance',()=>{
 assert.equal(extractMaviCommand('Mavi, troca a rota'),'troca a rota');
 assert.equal(extractMaviCommand('Ei Mavi, não gostei dessa rota, calcula outra'),'nao gostei dessa rota calcula outra');
 assert.equal(extractMaviCommand('Mavy recalcula a rota'),'recalcula a rota');
 assert.equal(extractMaviCommand('Marvi, gostei dessa, pode ser essa'),'gostei dessa pode ser essa');
 assert.equal(extractMaviCommand('Mavi'), '');
 assert.equal(extractMaviCommand('Me avisa qual é a rota'),null);
 assert.equal(extractMaviCommand('Gostei dessa, pode ser essa'),null);
 assert.equal(extractMaviCommand('O rádio disse Mavi, troca a rota'),null);
 assert.equal(extractMaviCommand('A conversa mavi foi legal'),null);
});
test('confirmation is explicit and cannot approve new-route commands',()=>{
 assert.equal(maviConfirmation('gostei dessa pode ser essa'),'accept');
 assert.equal(maviConfirmation('sim, pode trocar'),'accept');
 assert.equal(maviConfirmation('troca a rota'),'accept');
 assert.equal(maviConfirmation('não, deixa como está'),'reject');
 assert.equal(maviConfirmation('não gostei dessa, calcula outra'),null);
 assert.equal(maviConfirmation('procura outro caminho'),null);
 assert.equal(maviConfirmation('voce esta ai'),null);
});
test('restarts are throttled and capped on hard errors',()=>{
 assert.ok(maviRearmDelay({silentCount:8})>=5000);
 assert.ok(maviRearmDelay({hardCount:2})>=3000);
 assert.equal(maviRearmDelay({hardCount:3}),null);
 assert.equal(normalizeMaviSpeech('MÁVI?!'), 'mavi');
});
