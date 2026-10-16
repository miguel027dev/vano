import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveMaviKnowledge} from './mavi-grounding.mjs';

const context={
 hasRoute:true,navigationActive:true,gpsReady:true,pendingStop:false,
 destination:'Destino selecionado',remainingMinutes:9,remainingKm:3.2,
 progress:0.6,nextInstruction:'Vire à direita',nextDistanceMeters:160
};
test('MAVI retrieves grounded travel context without external provider',()=>{
 const progress=retrieveMaviKnowledge('Mavi, como estamos?',context);
 assert.equal(progress?.intent,'route_summary');
 assert.match(progress.text,/Destino selecionado/);
 assert.equal(retrieveMaviKnowledge('e falta muito?',context)?.intent,'remaining_time');
 assert.equal(retrieveMaviKnowledge('e o GPS tá bom?',context)?.intent,'gps_status');
});
test('MAVI retrieval stays narrow and never fabricates stops or road conditions',()=>{
 assert.equal(retrieveMaviKnowledge('trocar a rota',context),null);
 assert.equal(retrieveMaviKnowledge('evitar Avenida Paulista',context),null);
 assert.equal(retrieveMaviKnowledge('e na rota?',context),null);
 assert.match(retrieveMaviKnowledge('tenho alguma parada marcada',context).text,/Não há nenhuma parada/i);
 assert.match(retrieveMaviKnowledge('tem parada ativa',{...context,pendingStop:true}).text,/parada temporária ativa/i);
});