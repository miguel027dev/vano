import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const field=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(v);
const hash=v=>createHash('sha256').update(v).digest('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function readMobileRequest(params){
  if(!params.has('native_state')&&!params.has('native_challenge'))return null;
  const state=params.get('native_state'),challenge=params.get('native_challenge');
  if(!field(state)||typeof challenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw Error('Solicitação de login do aplicativo inválida.');
  return {state,challenge};
}
/** Short-lived, one-use grants. No session or Google token appears in a deep link. */
export function mobileGrants(clock=Date.now){
  const grants=new Map();
  const clean=()=>{for(const [key,r] of grants)if(r.expires<=clock())grants.delete(key);};
  return {
    issue(userId,request){clean();if(grants.size>=200)throw Error('Aguarde antes de tentar novamente.');const code=randomBytes(32).toString('base64url');grants.set(hash(code),{userId,...request,expires:clock()+120000});return code;},
    redeem({code,state,verifier}={}){clean();if(!field(code)||!field(state)||!field(verifier))return null;const key=hash(code),r=grants.get(key);if(!r||!equal(r.state,state)||!equal(r.challenge,hash(verifier)))return null;grants.delete(key);return r.userId;},
  };
}
export function mobileCallback(state,code,error){const u=new URL('vano-vanu://auth/callback');u.searchParams.set('state',state);if(code)u.searchParams.set('code',code);else u.searchParams.set('error',error||'erro');return u.toString();}
