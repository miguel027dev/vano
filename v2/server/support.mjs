import {randomBytes,createHash} from 'node:crypto';
import {isEmail} from './security.mjs';
export const SUPPORT_RETENTION_MS=90*24*60*60*1000;
export const SUPPORT_TOPICS=['acesso','mapa','conta','privacidade','outro'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const failure=(status,message)=>Object.assign(new Error(message),{status});
function text(value,max){return typeof value==='string'?value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max+1):'';}
export function pruneSupport(db,now=Date.now()){
 const before=db.supportTickets||[];db.supportTickets=before.filter(t=>Number.isFinite(Date.parse(t.createdAt))&&Date.parse(t.createdAt)>now-SUPPORT_RETENTION_MS);return before.length!==db.supportTickets.length;
}
export function createSupportTicket(db,input={},now=Date.now()){
 pruneSupport(db,now);
 if(db.supportTickets.length>=1000)throw failure(503,'A fila de suporte está cheia. Tente novamente mais tarde.');
 const message=text(input.message,2000),email=text(input.email,254).toLowerCase();
 if(!SUPPORT_TOPICS.includes(input.topic)||message.length<10||message.length>2000||email&&(!isEmail(email)||email.length>254))throw failure(400,'Escolha um assunto, escreva de 10 a 2000 caracteres e confira o e-mail opcional.');
 const receipt=randomBytes(32).toString('hex');
 const ticket={id:randomBytes(12).toString('hex'),receiptHash:hash(receipt),topic:input.topic,message,email,status:'aberto',reply:'',createdAt:new Date(now).toISOString(),repliedAt:null};
 db.supportTickets.push(ticket);
 return {receipt,topic:ticket.topic,status:ticket.status,createdAt:ticket.createdAt};
}
export function supportStatus(db,receipt,now=Date.now()){
 pruneSupport(db,now);
 if(typeof receipt!=='string'||!/^\w{64}$/.test(receipt)||!/^[a-f0-9]{64}$/i.test(receipt))throw failure(404,'Protocolo não encontrado ou expirado. Confira o código completo.');
 const ticket=db.supportTickets.find(t=>t.receiptHash===hash(receipt.toLowerCase()));
 if(!ticket)throw failure(404,'Protocolo não encontrado ou expirado. Confira o código completo.');
 return {topic:ticket.topic,status:ticket.status,reply:ticket.reply,createdAt:ticket.createdAt,repliedAt:ticket.repliedAt};
}
export function supportInbox(db,now=Date.now(),{offset=0,limit=50}={}){
 pruneSupport(db,now);
 const start=Math.max(0,Math.min(1000,Number.parseInt(offset,10)||0)),size=Math.max(1,Math.min(50,Number.parseInt(limit,10)||50));
 return [...db.supportTickets].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(start,start+size).map(({receiptHash,...ticket})=>ticket);
}
export function replySupport(db,id,reply,now=Date.now()){
 pruneSupport(db,now);
 const ticket=db.supportTickets.find(t=>t.id===id);if(!ticket)throw failure(404,'Solicitação não encontrada ou expirada.');
 const message=text(reply,2000);if(message.length<3||message.length>2000)throw failure(400,'Escreva uma resposta de 3 a 2000 caracteres.');
 ticket.reply=message;ticket.status='respondido';ticket.repliedAt=new Date(now).toISOString();
 return {ok:true};
}
