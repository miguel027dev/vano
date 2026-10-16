import test from 'node:test';
import assert from 'node:assert/strict';
import {mayUseNavigationVoiceProof,renewedNavigationProofPayload,NAVIGATION_VOICE_PROOF_GRACE_MS} from './navigation-voice-proof.mjs';
const now=1_800_000_000_000;
const proof={type:'trip',nonce:'a'.repeat(24),user:'guest1',kind:'safe',dest:[-46.7,-23.6],mins:27,km:11,expires:now+600000};
test('normal and expired history-proof still authorize MAVI during the same journey',()=>{
 assert.equal(mayUseNavigationVoiceProof(proof,'guest1',now),true);
 const old={...proof,expires:now-45*60000};
 assert.equal(mayUseNavigationVoiceProof(old,'guest1',now),true);
 const refreshed=renewedNavigationProofPayload(old,now);
 assert.equal(refreshed.expires,now+600000);
 assert.equal(refreshed.user,proof.user);
 assert.equal(refreshed.nonce,proof.nonce);
});
test('reject foreign identity, malformed proof, extremely old and future proofs',()=>{
 for(const corrupt of [
  {...proof,user:'other'}, {...proof,nonce:'wrong'}, {...proof,dest:[Infinity,0]},
  {...proof,expires:now-NAVIGATION_VOICE_PROOF_GRACE_MS-1},
  {...proof,expires:now+601001},{...proof,kind:'unknown'},
 ]){
  assert.equal(mayUseNavigationVoiceProof(corrupt,'guest1',now),false);
 }
 assert.equal(mayUseNavigationVoiceProof(proof,'anotherUser',now),false);
});
test('reroute is accepted only through the nested routeOptions API contract',async()=>{
 const {readFileSync}=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 const {dirname,join}=await import('node:path');
 const source=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'index.mjs'),'utf8');
 const page=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../src/pages/MapPage.jsx'),'utf8');
 assert.match(source,/const provided=body\.routeOptions/);
 assert.match(page,/routeOptions:\{reroute:true/);
 assert.match(source,/skipCandidateProbes:provided\.reroute===true/);
 assert.match(source,/options\.reroute===true\?3500/);
});
