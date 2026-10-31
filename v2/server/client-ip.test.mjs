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

test('Cloudflare IP headers are ignored without verified-origin opt-in',()=>{
  const base={socket:{remoteAddress:'10.2.3.4'},headers:{'x-forwarded-for':'203.0.113.9, 192.0.2.20, 192.0.2.21','cf-ray':'8bad3d2e4a21-GRU','cf-connecting-ip':'198.51.100.17'}};
  const previous=process.env.VANO_TRUST_CF_HEADERS;
  try{
    delete process.env.VANO_TRUST_CF_HEADERS;
    assert.equal(resolveClientIP(base,{trustProxy:true}),'192.0.2.21');
    assert.equal(resolveClientIP({...base,headers:{...base.headers,'cf-connecting-ip':'198.51.100.18'}},{trustProxy:true}),'192.0.2.21');
    process.env.VANO_TRUST_CF_HEADERS='1';
    assert.equal(resolveClientIP(base,{trustProxy:true}),'198.51.100.17');
    assert.equal(resolveClientIP({...base,socket:{remoteAddress:'198.51.100.1'}},{trustProxy:true}),'198.51.100.1');
  }finally{
    if(previous===undefined)delete process.env.VANO_TRUST_CF_HEADERS;
    else process.env.VANO_TRUST_CF_HEADERS=previous;
  }
});
