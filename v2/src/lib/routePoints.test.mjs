import test from 'node:test';
import assert from 'node:assert/strict';
import {swapJourney} from './routePoints.js';
test('trocar origem e destino troca coordenadas, preserva nomes e não altera entrada',()=>{
  const from=[-46.68,-23.57],to={id:'a',name:'Avenida Paulista',coords:[-46.65,-23.56]};
  const result=swapJourney(from,to,'Casa');
  assert.deepEqual(result.manualCoords,to.coords);
  assert.deepEqual(result.destination.coords,from);
  assert.equal(result.manualLabel,'Avenida Paulista');
  assert.equal(result.destination.name,'Casa');
  assert.deepEqual(from,[-46.68,-23.57]);assert.deepEqual(to.coords,[-46.65,-23.56]);
});
test('troca bloqueia coordenadas inválidas',()=>{
  assert.equal(swapJourney(null,{coords:[0,0]}),null);
  assert.equal(swapJourney([181,0],{coords:[0,0]}),null);
  assert.equal(swapJourney([0,0],{coords:[0,100]}),null);
});
