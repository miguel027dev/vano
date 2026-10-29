/** Private VANO V2 DevSync, backed by the existing persisted app_state JSONB store.
 * Cooperative area leases stop participating agents from overlapping edits.
 * They cannot block uncooperative direct GitHub pushes.
 */
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const AREAS=['gps','routing','map-ui','mavi','backend','android','infrastructure','admin','marketing','other'];
const STATUSES=['planned','in_progress','blocked','review','done','cancelled'];
const KINDS=['message','progress','decision','blocker','handoff'];
const LEASE_MS=15*60*1000,KEY_MS=30*24*60*60*1000;
const hash=v=>createHash('sha256').update(v).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 return timingSafeEqual(Buffer.from(a),Buffer.from(b));
};
const iso=ms=>new Date(ms).toISOString();
function field(value,max=160,required=false){
 if(typeof value!=='string')throw Error('Campo de texto inválido.');
 const result=value.replace(/[\u0000-\u001f\u007f]/g,'').trim();
 if(result.length>max||required&&!result)throw Error('Verifique os campos obrigatórios e seus limites.');
 return result;
}
function validArea(area){if(!AREAS.includes(area))throw Error('Área inválida.');return area;}
function taskId(value){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<1)return null;
 return n;
}
function initial(data){
 if(!data.devSync||typeof data.devSync!=='object'||Array.isArray(data.devSync))
   data.devSync={seq:0,tasks:[],events:[],keys:[]};
 const state=data.devSync;
 for(const k of ['tasks','events','keys'])if(!Array.isArray(state[k]))throw Error('Dados DevSync inválidos.');
 if(!Number.isSafeInteger(state.seq)||state.seq<0)state.seq=0;
 return state;
}
export function createDevSync({db,persist,json,err,getBody,protectedWrite,userSession,isAdminAccount,limits,now=Date.now,persistent=true}){
 const state=initial(db);
 const next=()=>++state.seq;
 const log=(task,actor,kind,body)=>{
   state.events.push({id:next(),taskId:task?.id??null,actor,kind,body,createdAt:iso(now())});
   if(state.events.length>2500)state.events.splice(0,state.events.length-2500);
 };
 const cleanTask=t=>({id:t.id,title:t.title,area:t.area,scope:t.scope,branch:t.branch,model:t.model,actor:t.actor,
   status:t.status,summary:t.summary,createdAt:t.createdAt,updatedAt:t.updatedAt,
   leaseExpiresAt:t.leaseExpiresAt||null,version:t.version});
 const find=id=>state.tasks.find(x=>x.id===taskId(id));
 const active=t=>t?.status==='in_progress'&&Number(t.leaseExpiresAt)>now();
 const owns=(t,claim)=>active(t)&&typeof claim==='string'&&claim.length>=40&&claim.length<200&&equal(t.leaseHash||'',hash(claim));
 const snapshot=()=>({
   ok:true,protocol:'vano-devsync/2',at:iso(now()),areas:AREAS,
   tasks:state.tasks.slice(-200).reverse().map(cleanTask),
   events:state.events.slice(-200).reverse(),
   stats:{active:state.tasks.filter(active).length,pending:state.tasks.filter(t=>t.status==='planned').length,
     blocked:state.tasks.filter(t=>t.status==='blocked').length},
   rules:{leaseMinutes:15,cooperative:true,beforeEdit:'Consult handoff, create task and claim its area; 409 means stop.',
     progress:'Post progress and decisions while working; renew lease before 15 minutes.',
     handoff:'Finish with branch, PR/commit, tests and pending issues.'}
 });
 const save=async(res,status,payload)=>{
   try{await persist();json(res,status,payload);}
   catch{err(res,503,'Não foi possível persistir o registro DevSync.');}
 };
 async function handle(req,res,pathname){
   const isAdmin=pathname==='/api/admin/dev-sync'||pathname.startsWith('/api/admin/dev-sync/');
   const isAgent=pathname==='/api/agent/dev-sync'||pathname.startsWith('/api/agent/dev-sync/');
   if(!isAdmin&&!isAgent)return false;
   if(!persistent){err(res,503,'DevSync exige armazenamento PostgreSQL persistente.');return true;}
   if(!limits(req,res,'devsync-requests',80,60000))return true;
   let identity='';
   if(isAdmin){
     const session=userSession(req);
     if(!session){err(res,401,'Autenticação necessária.');return true;}
     if(!isAdminAccount(session.user)){err(res,403,'Área restrita ao administrador.');return true;}
     identity='Administrador';
   }else{
     const auth=String(req.headers.authorization||'');
     if(!auth.startsWith('Bearer ')||auth.length>180){err(res,401,'Credencial de agente necessária.');return true;}
     const digest=hash(auth.slice(7).trim());
     const key=state.keys.find(k=>!k.revokedAt&&k.expiresAt>now()&&equal(k.hash,digest));
     if(!key){err(res,401,'Credencial inválida ou expirada.');return true;}
     identity=key.name;
   }
   const method=req.method;
   if(method!=='GET'&&method!=='POST'){err(res,405,'Método não permitido.');return true;}
   if(method==='POST'&&isAdmin&&!protectedWrite(req,res))return true;
   let sub=pathname.replace(/^\/api\/(?:admin|agent)\/dev-sync/,'')||'/';
   try{
     if((sub==='/'||sub==='/handoff'||sub==='/snapshot')&&method==='GET'){
       if(isAgent&&sub==='/snapshot'){err(res,404,'Use o endpoint handoff.');return true;}
       const s=snapshot();
       if(sub==='/handoff'){s.events=s.events.slice(0,100);s.tasks=s.tasks.slice(0,100);}
       json(res,200,s);return true;
     }
     if(sub==='/keys'&&isAdmin&&method==='GET'){
       json(res,200,{ok:true,keys:state.keys.slice(-30).reverse().map(({id,name,createdAt,expiresAt,revokedAt})=>
         ({id,name,createdAt,expiresAt,revokedAt:revokedAt||null}))});return true;
     }
     if(sub==='/keys'&&isAdmin&&method==='POST'){
       const body=await getBody(req);
       const name=field(body.name,70,true);
       if(state.keys.filter(k=>!k.revokedAt&&k.expiresAt>now()).length>=12)
         {err(res,409,'Limite de agentes ativos. Revogue uma credencial antiga.');return true;}
       const raw='vano_ds_'+token(),t=now();
       state.keys.push({id:next(),name,hash:hash(raw),createdAt:iso(t),expiresAt:t+KEY_MS,revokedAt:null});
       if(state.keys.length>80)state.keys=state.keys.filter(k=>!k.revokedAt&&k.expiresAt>now()).slice(-80);
       log(null,'Administrador','system','Credencial restrita criada para '+name);
       await save(res,201,{ok:true,id:state.keys[state.keys.length-1].id,name,token:raw,expiresAt:iso(t+KEY_MS)});
       return true;
     }
     const revoke=sub.match(/^\/keys\/([0-9]+)\/revoke$/);
     if(isAdmin&&revoke&&method==='POST'){
       const key=state.keys.find(k=>k.id===taskId(revoke[1])&&!k.revokedAt);
       if(!key){err(res,404,'Credencial não encontrada.');return true;}
       key.revokedAt=iso(now());log(null,'Administrador','system','Credencial revogada: '+key.name);
       await save(res,200,{ok:true});return true;
     }
     if(sub==='/tasks'&&method==='POST'){
       const body=await getBody(req);
       const title=field(body.title,160,true),area=validArea(body.area);
       const t=now(),task={id:next(),title,area,scope:field(body.scope||'',160),
         branch:field(body.branch||'',180),model:field(body.model||'',70),
         actor:isAgent?identity:field(body.actor||identity,70,true),
         status:'planned',summary:field(body.summary||'',1000),leaseHash:null,
         leaseExpiresAt:0,version:1,createdAt:iso(t),updatedAt:iso(t)};
       state.tasks.push(task);
       if(state.tasks.length>600){
         const older=state.tasks.filter(x=>['done','cancelled'].includes(x.status));
         for(const x of older.slice(0,Math.max(0,state.tasks.length-600))){
           state.tasks.splice(state.tasks.indexOf(x),1);
         }
       }
       log(task,task.actor,'system','Tarefa registrada: '+title);
       await save(res,201,{ok:true,taskId:task.id});return true;
     }
     const claim=sub.match(/^\/tasks\/([0-9]+)\/(claim|pulse|transition)$/);
     if(claim&&method==='POST'){
       const task=find(claim[1]);if(!task){err(res,404,'Tarefa inexistente.');return true;}
       const body=await getBody(req),action=claim[2];
       if(action==='claim'){
         if(['done','cancelled'].includes(task.status)){err(res,409,'Tarefa encerrada.');return true;}
         const existing=state.tasks.find(t=>t.id!==task.id&&t.area===task.area&&active(t));
         if(existing){json(res,409,{error:'Área ocupada por outra tarefa.',conflict:{taskId:existing.id,actor:existing.actor,until:iso(existing.leaseExpiresAt)}});return true;}
         if(active(task)&&!owns(task,body.leaseToken)){err(res,409,'Esta tarefa já tem uma reserva ativa.');return true;}
         const actor=isAgent?identity:field(body.actor||identity,70,true);
         const lease=owns(task,body.leaseToken)?body.leaseToken:token();
         task.actor=actor;task.model=field(body.model||task.model||'',70);
         task.status='in_progress';task.leaseHash=hash(lease);
         task.leaseExpiresAt=now()+LEASE_MS;task.version++;task.updatedAt=iso(now());
         log(task,actor,'system','Assumiu a área '+task.area);
         await save(res,200,{ok:true,taskId:task.id,leaseToken:lease,leaseExpiresAt:iso(task.leaseExpiresAt)});return true;
       }
       if(!owns(task,body.leaseToken)){err(res,409,'Reserva inválida ou expirada.');return true;}
       if(action==='pulse'){
         task.leaseExpiresAt=now()+LEASE_MS;
         await save(res,200,{ok:true,leaseExpiresAt:iso(task.leaseExpiresAt)});return true;
       }
       const status=body.status;
       if(!['done','review','blocked','cancelled'].includes(status)){err(res,400,'Status inválido.');return true;}
       const summary=field(body.summary,1000,true);
       task.status=status;task.summary=summary;task.leaseExpiresAt=0;task.leaseHash=null;
       task.updatedAt=iso(now());task.version++;
       log(task,identity,'handoff',status+': '+summary);
       await save(res,200,{ok:true,status});return true;
     }
     if(sub==='/events'&&method==='POST'){
       const body=await getBody(req);
       if(!KINDS.includes(body.kind)){err(res,400,'Tipo inválido.');return true;}
       const task=body.taskId===undefined||body.taskId===null||body.taskId===''?null:find(body.taskId);
       if(body.taskId!==undefined&&body.taskId!==null&&body.taskId!==''&&!task){err(res,404,'Tarefa não encontrada.');return true;}
       if(isAgent&&task&&active(task)&&!owns(task,body.leaseToken)){
         err(res,409,'Para registrar progresso numa tarefa ativa, o agente precisa possuir sua reserva.');return true;
       }
       const bodyText=field(body.body,1600,true);
       const actor=isAgent?identity:field(body.actor||identity,70,true);
       log(task,actor,body.kind,bodyText);
       await save(res,201,{ok:true});return true;
     }
     err(res,404,'Rota DevSync desconhecida.');return true;
   }catch(e){
     if(e instanceof Error&&/^(Campo|Verifique|Área inválida)/.test(e.message)){err(res,400,e.message);return true;}
     throw e;
   }
 }
 return {handle,snapshot};
}
