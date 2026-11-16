import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlayStoreDownload,PLAY_STORE_URL} from './play-store-download.mjs';

const response=()=>({
  status:undefined,headers:undefined,ended:false,
  writeHead(status,headers){this.status=status;this.headers=headers;},
  end(){this.ended=true;}
});

test('public /baixar redirects directly to the verified Google Play package',()=>{
  const res=response();
  assert.equal(handlePlayStoreDownload({method:'GET',headers:{host:'vanomaps.online'}},res,'/baixar',{'X-Content-Type-Options':'nosniff'}),true);
  assert.equal(res.status,302);
  assert.equal(res.headers.Location,PLAY_STORE_URL);
  assert.equal(res.headers['X-Robots-Tag'],'noindex, nofollow');
  assert.equal(res.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
  assert.equal(res.ended,true);
});

test('the future dedicated download host redirects its root and ignores query strings',()=>{
  for(const hostname of ['baixar.vanomaps.online','BAIXAR.VANOMAPS.ONLINE:443']){
    const res=response();
    assert.equal(handlePlayStoreDownload({method:'GET',headers:{host:hostname}},res,'/'),true);
    assert.equal(res.status,302);
    assert.equal(res.headers.Location,PLAY_STORE_URL);
  }
});

test('HEAD requests redirect without a response body',()=>{
  const res=response();
  assert.equal(handlePlayStoreDownload({method:'HEAD',headers:{host:'vanomaps.online'}},res,'/baixar/'),true);
  assert.equal(res.status,302);
  assert.equal(res.ended,true);
});

test('other public paths and similar-looking hosts are untouched',()=>{
  const res=response();
  assert.equal(handlePlayStoreDownload({method:'GET',headers:{host:'naobaixar.vanomaps.online'}},res,'/'),false);
  assert.equal(handlePlayStoreDownload({method:'GET',headers:{host:'vanomaps.online'}},res,'/mapa'),false);
  assert.equal(res.ended,false);
});

test('download route does not accept state-changing HTTP methods',()=>{
  const res=response();
  assert.equal(handlePlayStoreDownload({method:'POST',headers:{host:'baixar.vanomaps.online'}},res,'/'),true);
  assert.equal(res.status,405);
  assert.equal(res.headers.Allow,'GET, HEAD');
});
