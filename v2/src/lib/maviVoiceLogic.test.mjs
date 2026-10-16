import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMaviSpeech,extractMaviCommand,consumeMaviTranscript,maviConfirmation,maviRearmDelay} from './maviVoiceLogic.mjs';

test('spoken wake-word and commands are accepted as one or two browser results',()=>{
 assert.equal(extractMaviCommand('Mavi, troca a rota pra mim'),'troca a rota pra mim');
 assert.equal(extractMaviCommand('Ei Mavi, não gostei dessa rota, calcula outra'),'nao gostei dessa rota calcula outra');
 assert.equal(extractMaviCommand('Mavy recalcula a rota'),'recalcula a rota');
 assert.equal(extractMaviCommand('Marvi, gostei dessa, pode ser essa'),'gostei dessa pode ser essa');
 assert.equal(extractMaviCommand('Mavi'), '');
 assert.equal(extractMaviCommand('Me avisa qual é a rota'),null);
 assert.equal(extractMaviCommand('Gostei dessa, pode ser essa'),null);
 assert.equal(extractMaviCommand('O rádio disse Mavi, troca a rota'),null);
 const first=consumeMaviTranscript('Mavi',{now:1000});
 assert.equal(first.kind,'wake');
 const second=consumeMaviTranscript('troca a rota pra mim',{now:2200,wakeUntil:first.wakeUntil});
 assert.deepEqual(second,{kind:'command',command:'troca a rota pra mim',wakeUntil:0});
 assert.equal(consumeMaviTranscript('troca a rota pra mim',{now:9000,wakeUntil:first.wakeUntil}).kind,'ignore');
 assert.equal(consumeMaviTranscript('calcula outra rota',{now:1000}).kind,'ignore');
 assert.equal(consumeMaviTranscript('Mave recalcula',{now:1000}).command,'recalcula');
});
test('confirmation requires a previously accepted wake word',()=>{
 const wake=consumeMaviTranscript('Mavi',{now:1000});
 const confirmed=consumeMaviTranscript('gostei dessa pode ser essa',{now:4000,wakeUntil:wake.wakeUntil});
 assert.equal(maviConfirmation(confirmed.command),'accept');
 assert.equal(maviConfirmation('sim, pode trocar'),'accept');
 assert.equal(maviConfirmation('troca a rota'),'accept');
 assert.equal(maviConfirmation('não, deixa como está'),'reject');
 assert.equal(maviConfirmation('não gostei dessa, calcula outra'),null);
 assert.equal(maviConfirmation('procura outro caminho'),null);
});
test('bounded fast wake continuation and capped error retries',()=>{
 assert.ok(maviRearmDelay({silentCount:8})>=3000);
 assert.ok(maviRearmDelay({wakePending:true})<600);
 assert.ok(maviRearmDelay({hardCount:2})>=3000);
 assert.equal(maviRearmDelay({hardCount:3}),null);
 assert.equal(normalizeMaviSpeech('MÁVI?!'),'mavi');
});
