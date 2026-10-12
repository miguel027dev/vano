import test from 'node:test';
import assert from 'node:assert/strict';
import { googleConfigured, googleOAuthStatus, canonicalGoogleStart, googleRedirectUri, googleAuthUrl, newOAuthToken, hashState, challenge, fetchGoogleIdentity } from './google-oauth.mjs';
const config={GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-only',GOOGLE_REDIRECT_URI:'https://v2.example.com/api/auth/google/callback'};
test('OAuth só fica disponível quando client id e secret estão definidos',()=>{
  assert.equal(googleConfigured(config),true);
  assert.equal(googleConfigured({...config,GOOGLE_CLIENT_SECRET:''}),false);
});
test('redirecionamento seguro usa PKCE, state e callback da prévia',()=>{
  const state=newOAuthToken(),verifier=newOAuthToken(48);
  const url=new URL(googleAuthUrl(config,state,verifier));
  assert.equal(url.hostname,'accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'),config.GOOGLE_REDIRECT_URI);
  assert.equal(url.searchParams.get('state'),state);
  assert.equal(url.searchParams.get('code_challenge'),challenge(verifier));
  assert.notEqual(hashState(state),state);
  assert.throws(()=>googleRedirectUri({...config,GOOGLE_REDIRECT_URI:'http://insecure.example.com/callback'}));
});
test('Google identity requer e-mail verificado e nunca devolve token',async()=>{
  const fetcher=async (url,opts)=>{
    if(url.includes('/token')){const b=new URLSearchParams(opts.body);assert.equal(b.get('grant_type'),'authorization_code');assert.equal(b.get('client_secret'),'test-only');return {ok:true,json:async()=>({access_token:'temporary',id_token:'jwt'})};}
    assert.equal(opts.headers.Authorization,'Bearer temporary');
    return {ok:true,json:async()=>({sub:'12345',email:'User@Example.com',email_verified:true,name:'João'})};
  };
  const id=await fetchGoogleIdentity(config,'fake-code-123456','verifier',fetcher);
  assert.deepEqual(id,{googleSub:'12345',email:'user@example.com',name:'João'});
  assert.equal(JSON.stringify(id).includes('temporary'),false);
});
test('Google identity rejeita e-mail não confirmado',async()=>{
  const fetcher=async url=>url.includes('/token')?{ok:true,json:async()=>({access_token:'fake'})}:{ok:true,json:async()=>({sub:'1',email:'fake@example.com',email_verified:false})};
  await assert.rejects(fetchGoogleIdentity(config,'fake-code-123456','verifier',fetcher),/confirmado/);
});

test('Google readiness reports missing credentials without exposing secrets',()=>{
  const missing=googleOAuthStatus({GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_REDIRECT_URI:config.GOOGLE_REDIRECT_URI});
  assert.deepEqual(missing,{ready:false,reason:'credentials-missing'});
  const invalid=googleOAuthStatus({...config,GOOGLE_CLIENT_ID:'wrong-client'});
  assert.equal(invalid.ready,false);assert.equal(invalid.reason,'invalid-client-id');
  const badPath=googleOAuthStatus({...config,GOOGLE_REDIRECT_URI:'https://v2.example.com/login/google/callback'});
  assert.equal(badPath.reason,'invalid-callback-path');
  assert.deepEqual(googleOAuthStatus(config),{ready:true,reason:null,callbackOrigin:'https://v2.example.com'});
});
test('Google starts on its callback origin, not a separate domain with missing state cookie',()=>{
  const other='vanu-test.onrender.com', trusted='v2.example.com';
  assert.equal(canonicalGoogleStart(trusted,config),null);
  assert.equal(canonicalGoogleStart(other,config),'https://v2.example.com/api/auth/google/start');
  assert.equal(canonicalGoogleStart('attacker.invalid',config),'https://v2.example.com/api/auth/google/start');
  assert.equal(canonicalGoogleStart('v2.example.com.evil.test',config),'https://v2.example.com/api/auth/google/start');
  assert.equal(canonicalGoogleStart('V2.EXAMPLE.COM',config),null);
});
test('Google login refuses insecure or malformed redirect paths',()=>{
  assert.equal(googleOAuthStatus({...config,GOOGLE_REDIRECT_URI:'http://evil.example.com/api/auth/google/callback'}).reason,'invalid-callback');
  assert.equal(googleOAuthStatus({...config,GOOGLE_REDIRECT_URI:'https://v2.example.com/api/auth/google/callback?next=https://evil.example.com'}).reason,'invalid-callback-path');
});
