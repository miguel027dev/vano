import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupportTicket,supportStatus,supportInbox,replySupport,pruneSupport,SUPPORT_RETENTION_MS} from './support.mjs';
const input={topic:'acesso',message:'Não consigo abrir minha conta.'};
test('support receipt is random, stored only as hash and lookup returns minimal data',()=>{
 const db={supportTickets:[]};const first=createSupportTicket(db,{...input,email:'person@example.test'}),second=createSupportTicket(db,input);
 assert.match(first.receipt,/^[a-f0-9]{64}$/);assert.notEqual(first.receipt,second.receipt);
 assert.notEqual(db.supportTickets[0].receiptHash,first.receipt);assert.equal(JSON.stringify(db).includes(first.receipt),false);
 const status=supportStatus(db,first.receipt);assert.deepEqual(Object.keys(status).sort(),['createdAt','repliedAt','reply','status','topic']);assert.equal(status.status,'aberto');assert.equal(supportStatus(db,first.receipt.toUpperCase()).status,'aberto');assert.equal(JSON.stringify(status).includes('person@example.test'),false);
 assert.equal(supportInbox(db)[0].receiptHash,undefined);assert.throws(()=>supportStatus(db,'0'.repeat(64)),{status:404});
 replySupport(db,db.supportTickets[0].id,'Abra Recuperar senha e confira a pasta de spam.');assert.equal(supportStatus(db,first.receipt).status,'respondido');assert.match(supportStatus(db,first.receipt).reply,/Recuperar/);
});
test('support validates limits, optional email and does not execute account actions',()=>{
 const db={supportTickets:[],users:[{id:'unchanged'}]};for(const body of [{...input,topic:'admin'},{...input,message:'x'},{...input,message:'x'.repeat(2001)},{...input,email:'bad'}])assert.throws(()=>createSupportTicket(db,body),{status:400});
 createSupportTicket(db,{...input,topic:'privacidade',message:'Solicito a exclusão da minha conta.'});assert.deepEqual(db.users,[{id:'unchanged'}]);assert.throws(()=>replySupport(db,db.supportTickets[0].id,'x'),{status:400});
});
test('retention removes expired tickets and replies and queue size is capped',()=>{
 const db={supportTickets:[]},now=Date.now();const old=createSupportTicket(db,input,now-SUPPORT_RETENTION_MS-1);const current=createSupportTicket(db,input,now);
 assert.equal(db.supportTickets.length,1);assert.throws(()=>supportStatus(db,old.receipt,now),{status:404});assert.equal(supportStatus(db,current.receipt,now).status,'aberto');
 assert.equal(pruneSupport(db,now+SUPPORT_RETENTION_MS+1),true);assert.equal(db.supportTickets.length,0);
 const full={supportTickets:Array.from({length:1000},()=>({createdAt:new Date(now).toISOString()}))};assert.throws(()=>createSupportTicket(full,input,now),{status:503});
});

test('admin inbox pagination never returns more than 50 tickets or receipt hashes',()=>{
 const now=Date.now(),db={supportTickets:Array.from({length:120},(_,i)=>({id:String(i),createdAt:new Date(now+i).toISOString(),receiptHash:'secret'}))};
 const first=supportInbox(db,now,{limit:200});assert.equal(first.length,50);assert.equal(first[0].id,'119');assert.equal(first[0].receiptHash,undefined);
 const second=supportInbox(db,now,{offset:50});assert.equal(second[0].id,'69');assert.equal(supportInbox(db,now,{offset:100}).length,20);
});
