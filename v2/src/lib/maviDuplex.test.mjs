import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaviBargeInGate} from './maviDuplex.mjs';

test('barge-in detector calibrates to ambient noise and respects the grace period',()=>{
 const gate=createMaviBargeInGate();
 for(let t=0;t<1000;t+=60)assert.equal(gate.sample(0.014,0.6,t),false);
 gate.arm(true,1000,700);
 for(let t=1050;t<1700;t+=50)assert.equal(gate.sample(0.15,0.9,t),false);
 for(let t=1750;t<2200;t+=50)assert.equal(gate.sample(0.15,0.75,t),false);
 assert.equal(gate.sample(0.15,0.75,2200),true);
 assert.equal(gate.sample(0.15,0.75,2300),false);
});

test('brief noises, low-frequency road noise, and quiet cabin do not interrupt',()=>{
 const gate=createMaviBargeInGate();
 for(let t=0;t<1000;t+=60)gate.sample(0.05,0.15,t);
 gate.arm(true,1000,0);
 for(let t=1000;t<2400;t+=60)assert.equal(gate.sample(0.15,0.08,t),false);
 for(let t=2400;t<2600;t+=60)assert.equal(gate.sample(0.4,0.85,t),false);
 assert.equal(gate.sample(0.008,0.7,2600),false);
 for(let t=2650;t<3060;t+=60)assert.equal(gate.sample(0.12,0.8,t),false);
 assert.equal(gate.sample(0.12,0.8,3190),true);
});

test('disarming clears a pending interruption and allows a new spoken turn',()=>{
 const gate=createMaviBargeInGate();
 gate.arm(true,0,0);
 gate.sample(0.2,0.8,0);
 gate.sample(0.2,0.8,250);
 gate.arm(false,300,0);
 assert.equal(gate.sample(0.2,0.8,900),false);
 gate.arm(true,950,0);
 assert.equal(gate.sample(0.2,0.8,950),false);
 assert.equal(gate.sample(0.2,0.8,1401),true);
});
