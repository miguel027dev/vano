/** Auth and CSRF are injected from the existing HTTP server. No new UI. */
export const ANALYTICS_POLICY='2026-11-v1';
export function analyticsConsent(user){return user?.analyticsConsent?.policy===ANALYTICS_POLICY&&user.analyticsConsent.allowed===true;}
export async function handleAnalyticsHTTP({pathname,req,res,runtime,userSession,isAdminAccount,protectedWrite,limits,limitAccount,getBody,persist,json,err}){
 if(!['/api/observability/consent','/api/observability/events','/api/admin/observability'].includes(pathname))return false;
 const respond=(...args)=>{json(res,...args);return true;};
 const fail=(status,message)=>{err(res,status,message);return true;};
 if(!runtime.enabled)return fail(404,'Observabilidade não ativada.');
 const session=userSession(req);
 if(!session)return fail(401,'Autenticação necessária.');
 if(!limits(req,res,'observability',30,60000))return true;
 const headers={'Cache-Control':'private, no-store'};
 if(pathname==='/api/observability/consent'){
  if(req.method==='GET')return respond(200,{policy:ANALYTICS_POLICY,allowed:analyticsConsent(session.user)},headers);
  if(req.method!=='POST')return fail(405,'Método não permitido.');
  if(!protectedWrite(req,res))return true;
  const body=await getBody(req);
  if(body?.policy!==ANALYTICS_POLICY||typeof body.allowed!=='boolean')return fail(400,'Escolha de privacidade inválida.');
  const previous=session.user.analyticsConsent;
  session.user.analyticsConsent={policy:ANALYTICS_POLICY,allowed:body.allowed,updated_at:new Date().toISOString()};
  try{await persist();}catch{session.user.analyticsConsent=previous;return fail(503,'Não foi possível salvar sua escolha.');}
  return respond(200,{policy:ANALYTICS_POLICY,allowed:body.allowed},headers);
 }
 if(pathname==='/api/admin/observability'){
  if(req.method!=='GET')return fail(405,'Método não permitido.');
  if(!isAdminAccount(session.user))return fail(403,'Acesso administrativo necessário.');
  const queue=await runtime.ready;
  if(!queue)return fail(503,'Observabilidade indisponível.');
  try{return respond(200,await queue.snapshot(),headers);}catch{return fail(503,'Observabilidade indisponível.');}
 }
 if(req.method!=='POST')return fail(405,'Método não permitido.');
 if(!protectedWrite(req,res)||!limitAccount(res,'observability-events',String(session.user.id),12,60000)||
  !limitAccount(res,'observability-daily',String(session.user.id),250,86400000))return true;
 if(!analyticsConsent(session.user))return fail(403,'Consentimento analítico ausente.');
 const queue=await runtime.ready;
 if(!queue)return fail(503,'Observabilidade indisponível.');
 try{
  const result=await queue.ingest(await getBody(req));
  return respond(result.status,result,{...headers,...(result.retry_after?{'Retry-After':String(result.retry_after)}:{})});
 }catch{return fail(503,'Não foi possível receber os eventos.');}
}
