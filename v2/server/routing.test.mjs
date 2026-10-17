import test from 'node:test';
import assert from 'node:assert/strict';
import { places, demoRoutes, pointOK } from './routing.mjs';
test('todos os destinos demo têm coordenadas', () => { for(const x of places) assert.equal(pointOK(x.coords), true); });
test('rota demo tem exatamente dois modos', () => { const result=demoRoutes([-46.67,-23.58],places[0].coords); assert.deepEqual(result.routes.map(x=>x.id),['safe','fast']); assert.ok(result.routes[0].duration >= result.routes[1].duration); });
test('coordenadas inválidas são recusadas',()=> { assert.equal(pointOK(['1','2']),false); assert.equal(pointOK([200,-23]),false); });
