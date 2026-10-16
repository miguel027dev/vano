import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyJev,jevRouteFingerprint,chooseJevProposal } from '../src/lib/jevShared.mjs';
const shape=(id,variation=0)=>({id,duration:12,distance:5,geometry:{type:'LineString',coordinates:[[-46.70,-23.60],[-46.69+variation,-23.59],[-46.68,-23.58]]}});
test('JEV understands Brazilian Portuguese requests without LLM',()=>{
 assert.equal(classifyJev('Não quero pagar pedágio.'),'avoid_tolls');
 assert.equal(classifyJev('Troca a rota para um caminho com menos pedágios.'),'avoid_tolls');
 assert.equal(classifyJev('Troca a rota para menos radares.'),'radar_unavailable');
 assert.equal(classifyJev('Tá muito trânsito, procura por outro lado.'),'traffic');
 assert.equal(classifyJev('Não gostei dessa rota, tenta outro caminho.'),'alternative');
 assert.equal(classifyJev('Troca a rota pra mim.'),'alternative');
 assert.equal(classifyJev('Recalcula a rota.'),'alternative');
 assert.equal(classifyJev('Tem uma ladeira perto de casa.'),'slope_unavailable');
 assert.equal(classifyJev('me diga a senha'),'unknown');
 assert.equal(classifyJev('A'.repeat(400)),'unknown');
});
test('JEV never proposes an identical route',()=>{
 const a=shape('fast'),b=shape('safe');
 const key=jevRouteFingerprint(a);
 assert.equal(jevRouteFingerprint(a),jevRouteFingerprint(b));
 assert.equal(chooseJevProposal([a,b],key,'alternative'),null);
 b.geometry.coordinates[1][0]+=.01;
 assert.equal(chooseJevProposal([a,b],key,'traffic')?.id,'safe');
 assert.equal(chooseJevProposal([],key,'traffic'),null);
});
