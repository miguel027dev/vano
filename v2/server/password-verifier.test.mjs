import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, scryptSync } from 'node:crypto';
import { verifyVanoPassword, isLegacyHash } from './password-verifier.mjs';

test('VANO V1 PBKDF2 password remains valid until safe upgrade', async()=>{
  const salt='a'.repeat(32),password='ExamplePassword123';
  const digest=pbkdf2Sync(password,Buffer.from(salt,'hex'),10000,32,'sha256').toString('hex');
  const hash='pbkdf2_sha256$10000$'+salt+'$'+digest;
  assert.equal(isLegacyHash(hash),true);
  assert.equal(await verifyVanoPassword(password,hash),true);
  assert.equal(await verifyVanoPassword('wrong',hash),false);
});
test('VANO V2 scrypt passwords remain compatible',async()=>{
  const salt='b'.repeat(32),password='ExamplePassword123';
  const digest=scryptSync(password,salt,64).toString('hex');
  assert.equal(await verifyVanoPassword(password,salt+':'+digest),true);
  assert.equal(await verifyVanoPassword('wrong',salt+':'+digest),false);
});
test('Untrusted hashes and malformed inputs are rejected',async()=>{
  assert.equal(await verifyVanoPassword('password','unknown'),false);
  assert.equal(await verifyVanoPassword('password','pbkdf2_sha256$9000000000$a$b'),false);
  assert.equal(await verifyVanoPassword(null,'foo'),false);
});
