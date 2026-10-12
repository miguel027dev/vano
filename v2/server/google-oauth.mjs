/** Google OAuth Authorization Code + PKCE integration for the isolated VANO V2. */
import { createHash, randomBytes } from 'node:crypto';
/** Public-safe diagnostics; never include client secret, authorization codes or tokens. */
export function googleOAuthStatus(env) {
  const client=String(env.GOOGLE_CLIENT_ID||'').trim(),secret=String(env.GOOGLE_CLIENT_SECRET||'').trim();
  if(!client||!secret||client.startsWith('REPLACE_')||secret.startsWith('REPLACE_'))return {ready:false,reason:'credentials-missing'};
  if(!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(client))return {ready:false,reason:'invalid-client-id'};
  let uri;
  try {uri=new URL(googleRedirectUri(env));}catch{return {ready:false,reason:'invalid-callback'};}
  if(uri.pathname!=='/api/auth/google/callback'||uri.search||uri.hash)return {ready:false,reason:'invalid-callback-path'};
  return {ready:true,reason:null,callbackOrigin:uri.origin};
}
export const googleConfigured = env => googleOAuthStatus(env).ready;

/** Force Google OAuth to begin on the same exact origin that receives its callback.
 * Otherwise OAuth's SameSite=Lax state cookie can be missing on custom domains.
 * Never reflect Host into the redirect destination: use only configured trusted URI.
 */
export function canonicalGoogleStart(host,env){
  const callback=googleRedirectUri(env);
  const canonical=new URL(callback);
  if(String(host||'').toLowerCase()===canonical.host.toLowerCase())return null;
  return new URL('/api/auth/google/start',canonical.origin).toString();
}
export const newOAuthToken = (length=32) => randomBytes(length).toString('base64url');
export const hashState = state => createHash('sha256').update(String(state)).digest('hex');
export const challenge = verifier => createHash('sha256').update(verifier).digest('base64url');
export function googleRedirectUri(env) {
  const explicit=env.GOOGLE_REDIRECT_URI;
  if(explicit){const uri=new URL(explicit);if(uri.protocol!=='https:' && !(uri.protocol==='http:'&&['localhost','127.0.0.1'].includes(uri.hostname)))throw Error('OAuth callback inseguro.');return uri.toString();}
  const base=new URL(env.VANO_PUBLIC_ORIGIN);
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('OAuth origem insegura.');
  return new URL('/api/auth/google/callback',base).toString();
}
export function googleAuthUrl(env,state,verifier) {
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [key,value] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:googleRedirectUri(env),response_type:'code',scope:'openid email profile',state,code_challenge:challenge(verifier),code_challenge_method:'S256',prompt:'select_account'})) url.searchParams.set(key,value);
  return url.toString();
}
export async function fetchGoogleIdentity(env,code,verifier,fetcher=fetch) {
  if(typeof code!=='string'||code.length<8||code.length>4096)throw Error('Código OAuth inválido.');
  const response=await fetcher('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:googleRedirectUri(env),grant_type:'authorization_code',code_verifier:verifier}),
    signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw Error('Google não confirmou a autorização.');
  const token=await response.json();
  if(typeof token.access_token!=='string'||!token.access_token)throw Error('Resposta de autenticação inválida.');
  const person=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(10000)});
  if(!person.ok)throw Error('Google não confirmou a identidade.');
  const identity=await person.json();
  if(typeof identity.sub!=='string'||!identity.sub||typeof identity.email!=='string'||identity.email_verified!==true)throw Error('Conta Google sem e-mail confirmado.');
  return {googleSub:identity.sub,email:identity.email.toLowerCase().trim(),name:String(identity.name||identity.given_name||'Usuário VANO').slice(0,80)};
}
