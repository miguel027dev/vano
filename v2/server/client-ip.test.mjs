import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveClientIP,trustedProxyPeer} from './client-ip.mjs';
const req=(socket,forwarded)=>({socket:{remoteAddress:socket},headers:{'x-forwarded-for':forwarded}});
test('Rate limiter honors trusted Render ingress but never trusts spoofed leftmost XFF',()=>{
  const spoof=req('10.2.3.4','203.0.113.250, 198.51.100.42');
  assert.equal(resolveClientIP(spoof,{trustProxy:true}),'198.51.100.42');
  assert.equal(resolveClientIP(spoof,{trustProxy:true,hops:2}),'203.0.113.250');
  assert.equal(resolveClientIP(spoof,{trustProxy:false}),'10.2.3.4');
  assert.equal(resolveClientIP(req('198.51.100.1','8.8.8.8'),{trustProxy:true}),'198.51.100.1');
  assert.equal(resolveClientIP(req('::ffff:172.22.5.1','192.0.2.5'),{trustProxy:true}),'192.0.2.5');
  assert.equal(resolveClientIP(req('127.0.0.1','garbage'),{trustProxy:true}),'127.0.0.1');
  assert.equal(trustedProxyPeer('172.32.0.1'),false);
});
