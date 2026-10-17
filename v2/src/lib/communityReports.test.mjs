import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_TYPES,reportExpiration,publicReportsInBBox,metersApart,closeReports,reportQueryBBox,reportIconSvg} from './communityReports.js';
const time=Date.parse('2026-10-17T16:00:00Z');
const point=[-46.68,-23.58];
const record=(type='acidente',overrides={})=>({id:'a1',type,description:'Teste <b>rápido</b>',
  coords:point,createdAt:new Date(time-1000).toISOString(),status:'nao_verificado',owner:'private-user',...overrides});
test('exact six reporting categories arranged as two rows of three',()=>{
 assert.deepEqual(REPORT_TYPES.map(r=>r.id),['via_fechada','transito','fiscalizacao','acidente','alagamento','obstaculo']);
 assert.equal(new Set(REPORT_TYPES.map(r=>r.id)).size,6);
 for(const item of REPORT_TYPES) assert.match(reportIconSvg(item.id),/<svg/);
});
test('public API strips owner and rounds location; unverified reports are visible',()=>{
 const result=publicReportsInBBox([record()],[-46.7,-23.6,-46.6,-23.5],time);
 assert.equal(result.length,1);assert.equal(Object.hasOwn(result[0],'owner'),false);
 assert.equal(result[0].status,'nao_verificado');assert.equal(result[0].coords[0],-46.68);
});
test('nonexistent or expired occurrences never surface',()=>{
 const old=record('transito',{createdAt:new Date(time-121*60000).toISOString()});
 const out=publicReportsInBBox([old,record('acidente',{status:'removido'}),record('acidente',{coords:[10,10]})],[-46.7,-23.6,-46.6,-23.5],time);
 assert.equal(out.length,0);assert.ok(reportExpiration(old)<time);
});
test('GPS enter and exit use hysteresis without changing coordinates',()=>{
 const a=record();
 assert.equal(closeReports([a],point,new Set(),time).length,1);
 const about700m=[point[0]+.007,point[1]];
 assert.equal(closeReports([a],about700m,new Set(),time).length,0);
 assert.equal(closeReports([a],about700m,new Set(['a1']),time).length,1);
 assert.equal(closeReports([a],[point[0]+.02,point[1]],new Set(['a1']),time).length,0);
 assert.ok(metersApart(point,about700m)>600);
});
test('bbox is bounded and refuses polar / invalid coordinates',()=>{
 assert.equal(reportQueryBBox([200,0]),null);
 assert.equal(reportQueryBBox([0,82]),null);
 assert.equal(reportQueryBBox(point).split(',').length,4);
});
