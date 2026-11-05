import test from 'node:test';
import assert from 'node:assert/strict';
import {groupedHistory,historyDistanceLabel,historyDestination} from './historyPresentation.mjs';
const trip=(id,createdAt,coords=[-46.6557,-23.5615],extra={})=>({id,createdAt,destination:{name:'MASP',address:'São Paulo',coords},...extra});
test('recent history groups repeat starts on the same day without losing distances or changing source records',()=>{
 const input=[trip('a','2026-11-04T12:00:00Z',undefined,{measurementVersion:1,travelledMeters:100}),trip('b','2026-11-04T13:00:00Z',undefined,{measurementVersion:1,travelledMeters:200}),trip('c','2026-11-03T12:00:00Z')];
 const before=JSON.stringify(input),groups=groupedHistory(input);
 assert.equal(groups.length,2);assert.equal(groups[0].count,2);assert.equal(groups[0].latest.id,'b');assert.ok(Math.abs(groups[0].distanceKm-.3)<1e-9);
 assert.equal(JSON.stringify(input),before);
});
test('same name in another city stays separate and filtering ignores accent differences',()=>{
 const input=[trip('a','2026-11-04T12:00:00Z'),trip('b','2026-11-04T12:00:00Z',[-9.14,38.72])];
 assert.equal(groupedHistory(input).length,2);assert.equal(groupedHistory(input,{query:'sao paulo'}).length,2);
 assert.equal(groupedHistory(input,{query:'not present'}).length,0);
});
test('legacy history never presents planned distance or ETA as measured travel',()=>{
 assert.equal(historyDistanceLabel({distance:22,duration:30}),'Distância não registrada');
 assert.equal(historyDistanceLabel({measurementVersion:1,travelledMeters:0}),'Sem deslocamento registrado');
 assert.equal(historyDistanceLabel({measurementVersion:1,travelledMeters:1234}),'1,2 km percorridos');
});
test('resuming resolves only a saved destination with valid coordinates',()=>{
 const records=[trip('a','2026-11-04T12:00:00Z'),trip('bad','2026-11-04T12:00:00Z',[999,0])];
 assert.deepEqual(historyDestination(records,'a').coords,[-46.6557,-23.5615]);
 assert.equal(historyDestination(records,'bad'),null);assert.equal(historyDestination(records,'missing'),null);
});

test('different destinations sharing a building coordinate are not merged',()=>{
 const a=trip('a','2026-11-04T12:00:00Z'),b=trip('b','2026-11-04T13:00:00Z');
 b.destination={...b.destination,name:'Loja no museu'};
 assert.equal(groupedHistory([a,b]).length,2);
});
