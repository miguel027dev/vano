import test from 'node:test';
import assert from 'node:assert/strict';
import {previewManeuvers,modeManeuverDetail,nextMappedCrossing,crossingLabel,crossingSafetyNote,crossingVoiceCue} from './routeModeDetails.mjs';
const steps=[
 {instruction:'Comece sua caminhada',type:'depart',distance:20},
 {instruction:'Vire à direita na Rua A',type:'turn',modifier:'right',street:'Rua A',distance:100},
 {instruction:'Siga em frente pela avenida',type:'continue',distance:120},
 {instruction:'Chegou',type:'arrive',distance:0}
];
test('real walking guidance remains provider-derived and never imagines crosswalks',()=>{
 const list=previewManeuvers({steps},'a-pe');
 assert.equal(list.length,2);
 assert.equal(list[0].instruction,'Vire à direita na Rua A');
 assert.equal(list[0].detail,null);
 assert.equal(modeManeuverDetail('a-pe',{instruction:'Atravesse na faixa de pedestres'}).includes('Travessia'),true);
});
test('each mode receives only confirmed useful contextual details',()=>{
 assert.match(modeManeuverDetail('moto',{type:'roundabout'}),/rotatória/);
 assert.match(modeManeuverDetail('moto',{type:'off ramp'}),/Acesso/);
 assert.match(modeManeuverDetail('carro',{lanes:[{valid:true}]}),/Faixas/);
 assert.equal(modeManeuverDetail('carro',{type:'turn'}),null);
});
test('only explicitly mapped OSM features appear ahead on GPS-confirmed route progress',()=>{
 const features=[{id:'crossing-1',source:'OpenStreetMap',type:'marked',routeMeters:100},
 {id:'crossing-2',source:'OpenStreetMap',type:'signals',routeMeters:170},
 {id:'unknown',type:'marked',routeMeters:102}];
 const first=nextMappedCrossing(features,83);
 assert.equal(first.distance,17);assert.equal(first.id,'crossing-1');
 assert.equal(nextMappedCrossing(features,130).id,'crossing-2');
 assert.equal(nextMappedCrossing(features,220),null);
 assert.equal(nextMappedCrossing(features,null),null);
 assert.match(crossingLabel(first),/Faixa/);
 assert.match(crossingSafetyNote(),/sinalização/);
});
test('walk crossing voice follows safe GPS and never interrupts an imminent turn',()=>{
 const feature={id:'osm-crossing-20',source:'OpenStreetMap',type:'marked',routeMeters:150,distance:30};
 assert.equal(crossingVoiceCue(feature),null);
 assert.equal(crossingVoiceCue(feature,{navigation:true,liveGps:true,muted:true}),null);
 assert.equal(crossingVoiceCue(feature,{navigation:true,liveGps:true,maneuverDistance:28}),null);
 const cue=crossingVoiceCue(feature,{navigation:true,liveGps:true,maneuverDistance:120});
 assert.match(cue.text,/Confira a sinalização/);
 assert.match(cue.text,/Aproxime-se/);
 assert.equal(cue.key,'walk-feature:'+feature.id);
});
