import test from 'node:test';
import assert from 'node:assert/strict';
import {movedDistanceMeters,shouldRefreshAddress,navigationStreetLabel} from './addressCard.js';
test('first valid location can be geocoded, false coordinates never are',()=>{
 assert.equal(shouldRefreshAddress(null,[-46.7,-23.6],100000),true);
 assert.equal(shouldRefreshAddress(null,[NaN,-23.6],100000),false);
});
test('GPS jitter does not trigger endless reverse searches',()=>{
 const prev={point:[-46.7,-23.6],at:100000};
 assert.equal(movedDistanceMeters(prev.point,[-46.70001,-23.6])<3,true);
 assert.equal(shouldRefreshAddress(prev,[-46.70001,-23.6],110000),false);
 assert.equal(shouldRefreshAddress(prev,[-46.70001,-23.6],135000),false);
 assert.equal(shouldRefreshAddress(prev,[-46.70001,-23.6],290000),true);
});
test('real movement triggers after cooling window, navigation uses higher threshold',()=>{
 const prev={point:[-46.7,-23.6],at:100000};
 assert.equal(shouldRefreshAddress(prev,[-46.699,-23.6],131000),true);
 assert.equal(shouldRefreshAddress(prev,[-46.699,-23.6],131000,true),false);
 assert.equal(shouldRefreshAddress(prev,[-46.698,-23.6],140000,true),true);
});

test('navigation road pill only uses a recently resolved GPS street, never a guessed destination',()=>{
 assert.equal(navigationStreetLabel({street:'Av. Giovanni Gronchi'},true),'Av. Giovanni Gronchi');
 assert.equal(navigationStreetLabel({street:'Rua 25 de Março, 300'},true),'Rua 25 de Março, 300');
 assert.equal(navigationStreetLabel({street:'Av. Giovanni Gronchi'},false),'Aguardando localização…');
 assert.equal(navigationStreetLabel(null,true),'Identificando rua…');
 assert.equal(navigationStreetLabel({street:'Endereço não encontrado'},true),'Identificando rua…');
 assert.equal(navigationStreetLabel({street:'Localização identificada'},true),'Identificando rua…');
});
