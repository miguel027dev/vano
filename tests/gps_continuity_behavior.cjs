const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const code=fs.readFileSync('static/vano-map.js','utf8');
const start=code.indexOf('function gpsFixScore(');
const end=code.indexOf('function requestPosition(',start);
assert.ok(start>=0&&end>start,'GPS acceptance helpers must remain available');

let now=1_700_000_000_000;
const context={
  Date:{now:()=>now},
  Math,
  hav:(a,b)=>Math.hypot((a[0]-b[0])*111000,(a[1]-b[1])*111000),
  lastAcceptedGpsTimestamp:0,lastAcceptedGpsKey:'',lastAcceptedGpsRaw:null,
  navGpsPending:null,navGpsFlushTimer:null,
  setTimeout:()=>1,clearTimeout:()=>{},
  activeNav:{classList:{contains:()=>true}},adminSimulation:false,
};
vm.createContext(context);
vm.runInContext(code.slice(start,end),context);

const fix=(lon,lat,accuracy=8,speed=12,ts=now)=>({lon,lat,accuracy,speed,ts});
assert.equal(context.acceptGpsRaw(fix(-46.63,-23.55)),true,'accepts a valid first fix');
now+=100;
assert.equal(context.acceptGpsRaw(fix(-46.63,-23.55)),false,'deduplicates repeated watch callbacks');
// A slow vehicle can legitimately report very small, noisy movements.
now+=1000;
assert.equal(context.acceptGpsRaw(fix(-46.629995,-23.550001,11,.4,now)),true,'keeps a low-speed jitter sample for filtering instead of freezing');
// A curved drive produces successive points whose straight-line displacement is
// modest even though heading changes rapidly; none must be discarded.
for(const [lon,lat] of [[-46.62990,-23.54999],[-46.62983,-23.54994],[-46.62980,-23.54986]]){
  now+=1000;
  assert.equal(context.acceptGpsRaw(fix(lon,lat,7,11,now)),true,'keeps continuous curve samples');
}
now+=1000;
assert.equal(context.acceptGpsRaw(fix(-46.6298,-23.55,8,12,now-20000)),false,'rejects a stale callback');
assert.equal(context.acceptGpsRaw(fix(-46.50,-23.20,8,12,now)),false,'rejects an implausible short-interval teleport');
now+=16000;
assert.equal(context.acceptGpsRaw(fix(-46.6289,-23.5492,18,9,now)),true,'recovers after an intermittent signal gap without permanently pinning the puck');

const olderAccurate=fix(-46.63,-23.55,4,10,now-100);
const newerNoisy=fix(-46.63,-23.55,80,10,now);
assert.equal(context.chooseNavigationGpsFix(olderAccurate,newerNoisy),olderAccurate,'keeps a materially better fix inside the coalescing window');
const newerGood=fix(-46.63,-23.55,7,10,now+300);
assert.equal(context.chooseNavigationGpsFix(olderAccurate,newerGood),newerGood,'takes a genuinely newer good fix');

const fallback=fs.readFileSync('static/vano-map-fallback.js','utf8');
assert.match(fallback,/queueFallbackNavigationGps/,'fallback keeps the same callback coalescing guard');
assert.match(code,/queueNavigationGps\(g/,'main map coalesces watch and heartbeat callbacks');
console.log('PASS: GPS rejects stale/duplicate/teleport samples and coalesces competing fixes without preferring noisy data.');
