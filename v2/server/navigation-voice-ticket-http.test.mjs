import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {signedToken,openSignedToken} from './security.mjs';
const folder=mkdtempSync(path.join(tmpdir(),'vano-navigation-proof-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(folder,'store.json');
process.env.VANO_SECURITY_SECRET='reliable-navigation-signature-test-12345678';
process.env.VANO_MAVI_CARTESIA_ENABLED='1';
process.env.CARTESIA_API_KEY='sk_car_test_secret_not_real_123456';
process.env.CARTESIA_MAVI_VOICE_ID='8a6d0b8e-8cd8-4952-a41e-b7af18662135';
const {server}=await import('./index.mjs');

test('a real active guest navigation receives a new Cartesia proof after ten minutes',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const bootstrap=await fetch(base+'/api/bootstrap');
  const data=await bootstrap.json();
  const cookie=(bootstrap.headers.get('set-cookie')||'').split(';')[0];
  assert.match(cookie,/^vano_guest=[a-f0-9]{32}$/);
  const owner='guest:'+cookie.slice('vano_guest='.length);
  const sign=(overrides={})=>signedToken(process.env.VANO_SECURITY_SECRET,{
   type:'trip',nonce:'a'.repeat(24),user:owner,kind:'safe',
   dest:[-46.7,-23.6],mins:15,km:8,
   expires:Date.now()-15*60000,...overrides
  });
  const headers={Cookie:cookie,'Content-Type':'application/json','X-VANO-CSRF':data.csrfToken};
  async function call(proof){
   return fetch(base+'/api/v2/navigation/voice-ticket',{
    method:'POST',headers,body:JSON.stringify({proof,language:'pt-BR',text:'Em 150 metros, vire à direita.'})
   });
  }
  const allowed=await call(sign());
  assert.equal(allowed.status,200);
  const reply=await allowed.json();
  assert.ok(reply.voiceTicket);
  assert.ok(reply.refreshedProof,'a once-expired trip proof is renewed');
  const updated=openSignedToken(process.env.VANO_SECURITY_SECRET,reply.refreshedProof);
  assert.ok(updated.expires>Date.now()+9*60000);
  assert.equal(updated.user,owner);
  assert.equal((await call(sign({user:'guest:somebody-else'}))).status,403);
  assert.equal((await call(sign({expires:Date.now()-25*60*60000}))).status,403);
 }finally{
  await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true});
 }
});
