import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dynamicManeuverIsland} from './dynamicManeuverIsland.mjs';

test('compact V2 island on long, unambiguous straight segments',()=>{
 const straight={instruction:'Continue em frente por 800 metros',kind:'continue',modifier:'straight',distance:800};
 assert.deepEqual(dynamicManeuverIsland(straight),{compact:true,instruction:'Siga em frente'});
 assert.equal(dynamicManeuverIsland({...straight,distance:350}).compact,true);
 assert.equal(dynamicManeuverIsland({...straight,distance:150}).compact,false);
 assert.equal(dynamicManeuverIsland({...straight,distance:220},{vehicle:'a-pe'}).compact,true);
 assert.equal(dynamicManeuverIsland(straight,{language:'en-US'}).instruction,'Continue straight');
 assert.equal(dynamicManeuverIsland(straight,{language:'fr-FR'}).instruction,'Continuez tout droit');
});
test('approaching turns, road exits, lane changes and pedestrian crossings remain expanded',()=>{
 const cases=[
  {instruction:'Vire à direita na Avenida Giovanni Gronchi',kind:'turn',modifier:'right',distance:2000},
  {instruction:'Vire à esquerda para a Rua Ernest Renan',kind:'turn',modifier:'left',distance:1000},
  {instruction:'Na rotatória use a segunda saída',kind:'roundabout',modifier:'straight',distance:1600},
  {instruction:'Siga em frente até a saída 3',kind:'continue',modifier:'straight',distance:2500},
  {instruction:'Mantenha-se à direita para acesso',kind:'continue',modifier:'straight',distance:2400},
  {instruction:'Continue na faixa da esquerda',kind:'continue',modifier:'straight',distance:500},
  {instruction:'Chegou ao destino',kind:'arrive',distance:900},
  {instruction:'Continue',kind:'continue',distance:null}
 ];
 for(const step of cases){
  const result=dynamicManeuverIsland(step);
  assert.equal(result.compact,false,step.instruction);
  assert.equal(result.instruction,step.instruction);
 }
 const straight={instruction:'Siga reto',kind:'continue',modifier:'straight',distance:800};
 assert.equal(dynamicManeuverIsland(straight,{crossingNearby:true}).compact,false);
 assert.equal(dynamicManeuverIsland({...straight,following:{gapMeters:40}}).compact,false);
});
test('the compact island changes only private admin /v2 markup; map camera keeps measured viewport',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v80-dynamic-guidance.css',import.meta.url),'utf8');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 assert.match(page,/const compactIsland=adminV2RoadSigns&&islandPresentation\.compact/);
 assert.match(page,/v80-dynamic-island/);
 assert.match(page,/compactIsland\?islandPresentation\.instruction:nextTurnText\.instruction/);
 assert.match(page,/nextTurnText\.street&&!compactIsland/);
 assert.match(page,/!compactIsland&&visualLanes\.length>0/);
 assert.match(css,/\.v80-dynamic-island\.is-compact/);
 assert.match(css,/data-map-appearance="dark"/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(map,/observer\?\.observe\(x\.node\)/);
 assert.ok(main.indexOf("import './v80-dynamic-guidance.css';")<main.indexOf("import './v50-night-system.css';"));
});
test('screen stays awake during private navigation simulation, releases when route ends or is hidden',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const wake=readFileSync(new URL('./navigationWakeLock.mjs',import.meta.url),'utf8');
 assert.match(page,/notifyNative\(\{action:'wake',active:navMode\}\)/);
 assert.match(page,/navMode&&active\?startNavigationWakeLock\(\):undefined,\[navMode,active\]/);
 assert.match(page,/notifyNative\(\{action:'navigation',active:navMode&&!simActive\}\)/);
 assert.match(page,/if\(simActive\)return false; \/\/ Simulation must never request spoken directions/);
 assert.match(wake,/visibilitychange/);
 assert.match(wake,/function release\(\)/);
 assert.match(wake,/if \(stopped \|\| doc\.visibilityState !== 'visible'/);
});
