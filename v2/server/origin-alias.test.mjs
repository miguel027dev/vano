import test from 'node:test';
import assert from 'node:assert/strict';
import {correctOrigin} from './security.mjs';
const canonical='https://vanomaps.online', alias='https://vanu-73xu.onrender.com';
const request=(origin,site='same-origin',host='vanu-73xu.onrender.com')=>({headers:{origin,'sec-fetch-site':site,host}});
test('canonical website and explicitly configured Android origin are accepted',()=>{
  assert.equal(correctOrigin(request(canonical),canonical,[alias]),true);
  assert.equal(correctOrigin(request(alias),canonical,[alias]),true);
  assert.equal(correctOrigin(request(alias),canonical),false);
});
test('aliases do not admit opaque, spoofed, unrelated or cross-site origins',()=>{
  for(const origin of ['null','https://evil.example',alias+'.evil.example',alias+'/',alias+':444','http://vanu-73xu.onrender.com'])
    assert.equal(correctOrigin(request(origin),canonical,[alias]),false,origin);
  assert.equal(correctOrigin(request(alias,'cross-site'),canonical,[alias]),false);
  assert.equal(correctOrigin(request('https://evil.example','same-origin','evil.example'),canonical,[alias]),false);
});
