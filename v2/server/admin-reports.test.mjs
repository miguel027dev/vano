import test from 'node:test';
import assert from 'node:assert/strict';
import {adminReportList} from './admin.mjs';

test('admin occurrence queue filters and paginates newest first',()=>{
 const reports=[
  {id:'a',type:'acidente',status:'nao_verificado',createdAt:'2026-10-01T13:00:00Z',description:'Obstáculo'},
  {id:'b',type:'transito',status:'verificado',createdAt:'2026-11-01T13:00:00Z',description:'Congestionamento'},
  {id:'c',type:'alagamento',status:'nao_verificado',createdAt:'2026-10-02T13:00:00Z',description:'Chuva'}
 ];
 const all=adminReportList({reports},{offset:0,limit:2});
 assert.equal(all.total,3);
 assert.deepEqual(all.items.map(x=>x.id),['b','c']);
 const notVerified=adminReportList({reports},{status:'nao_verificado'});
 assert.equal(notVerified.total,2);
 assert.deepEqual(notVerified.items.map(x=>x.id),['c','a']);
 assert.deepEqual(adminReportList({reports},{offset:2,limit:1}).items.map(x=>x.id),['a']);
});
test('admin occurrence responses exclude identity, voting and exact location',()=>{
 const rows=[{id:'a',type:'acidente',status:'nao_verificado',createdAt:'2026-11-01T13:00:00Z',
   coords:[-46.601234,-23.555423],owner:'private-user-secret',feedback:{'private-token':'present'},
   description:'Trecho\ncom atraso',extra:{device:'secret'}}];
 const response=adminReportList({reports:rows});
 assert.equal(response.items.length,1);
 assert.equal(response.items[0].description,'Trechocom atraso');
 const result=JSON.stringify(response);
 for(const secret of ['coords','owner','feedback','private-user-secret','private-token','-46.601234','device']){
   assert.ok(!result.includes(secret),secret);
 }
});
test('admin occurrence query bounds limit and offset, rejects unknown status',()=>{
 const rows=[{id:'1',type:'transito',status:'nao_verificado',createdAt:'2026-11-01T13:00:00Z'}];
 assert.equal(adminReportList({reports:rows},{limit:'999',offset:'-12'}).limit,50);
 assert.equal(adminReportList({reports:rows},{status:'invalid'}).status,'all');
 assert.equal(adminReportList({reports:rows},{limit:'0'}).limit,1);
 assert.equal(adminReportList({reports:rows},{offset:'200000'}).offset,100000);
});