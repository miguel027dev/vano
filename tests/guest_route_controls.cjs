'use strict';
// Regression: guests with trial credit must be able to choose route modes and
// vehicle types; exhausted trials must show the limit instead of redirecting.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/vano-map.js','utf8');
const begin=source.indexOf("document.querySelectorAll('[data-route-mode]').forEach(btn=>btn.onclick=");
const end=source.indexOf("const voiceSelect=",begin);
assert.ok(begin>=0&&end>begin,'Expected current map route/profile selector handlers');
const script=source.slice(begin,end);
const cls={remove(){},add(){},toggle(){}};
const modeButton={dataset:{routeMode:'fastest'},classList:cls};
const profileButton={dataset:{profile:'motorcycle'},classList:cls};
let limits=0, navigations=0, renders=0, parked=0;
const context={
  document:{querySelectorAll(selector){
    if(selector==='[data-route-mode]')return[modeButton];
    if(selector==='[data-profile]')return[profileButton];
    return[];
  }},
  $:()=>({classList:cls}),
  LOGGED_IN:false,guestRoutesRemaining:2,
  routeMode:'safest',profile:'driving',routes:[],
  destinationConfirmed:false,origin:null,destination:null,selectedRoute:null,
  animateRouteChoice(){},haptic(){},learnRouteChoice(){},
  showGuestLimit(){limits++},chooseByMode(){},renderRoute(){renders++},
  calculateRoutes(){},syncRouteProfileUi(){},
  isMotorizedProfile(){return false},
  showRouteLoading(){},renderParkingNearby(){parked++},loadParkingNearby(){},
  location:{assign(){navigations++}}
};
vm.createContext(context);
vm.runInContext(script,context);
assert.equal(typeof modeButton.onclick,'function');
assert.equal(typeof profileButton.onclick,'function');
modeButton.onclick();
assert.equal(context.routeMode,'fastest','Guest must be able to select fastest mode');
profileButton.onclick();
assert.equal(context.profile,'motorcycle','Guest must be able to select motorcycle');
assert.equal(navigations,0,'No login redirect before guest credit expires');
assert.equal(limits,0);
assert.ok(parked>=1,'Profile selection still synchronizes relevant UI');

context.guestRoutesRemaining=0;
context.routeMode='safest';
context.profile='driving';
modeButton.onclick();profileButton.onclick();
assert.equal(context.routeMode,'safest');
assert.equal(context.profile,'driving');
assert.equal(limits,2,'Exhausted trial shows guest limit for each action');
assert.equal(navigations,0);

context.LOGGED_IN=true;
modeButton.onclick();profileButton.onclick();
assert.equal(context.routeMode,'fastest');
assert.equal(context.profile,'motorcycle');
assert.equal(limits,2,'Logged-in users must not be blocked by guest balance');
console.log('PASS: guest route/profile controls and exhausted trial boundary');
