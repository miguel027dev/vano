import test from 'node:test';
import assert from 'node:assert/strict';
import {locationSummary} from './locationSummary.mjs';
const now=100000,fix={coords:[-46.65,-23.56],receivedAt:now-1000,sourceAt:now-1000,accuracy:5};
test('GPS failures never tell the user that a request is still searching',()=>{
 for(const status of ['denied','timeout','error','unavailable','insecure','unsupported']){
  const state=locationSummary({status,fix,now});
  assert.equal(state.live,false);assert.equal(state.showRecovery,true);
  assert.doesNotMatch(state.title+' '+state.detail,/Buscando|Atualizando|Localizando/);
 }
});
test('permission revocation overrides a recent fix and labels the retained point honestly',()=>{
 const state=locationSummary({status:'denied',fix,displayCoords:fix.coords,now});
 assert.equal(state.title,'Último ponto conhecido');assert.equal(state.live,false);
 assert.match(state.detail,/desativada/);assert.equal(state.showRecovery,false);
});
test('current GPS, stale GPS, pending request and manual origin are distinct',()=>{
 assert.equal(locationSummary({status:'granted',fix,now}).live,true);
 assert.equal(locationSummary({status:'granted',fix,now:now+40000}).live,false);
 assert.match(locationSummary({status:'checking',now}).title,/Buscando/);
 const manual=locationSummary({status:'granted',fix,manualCoords:[0,0],manualLabel:'Praça escolhida',now});
 assert.equal(manual.live,false);assert.equal(manual.title,'Praça escolhida');assert.equal(manual.label,'Origem manual');
});
