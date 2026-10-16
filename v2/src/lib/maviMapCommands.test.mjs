import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMaviIntent,answerMaviInformation} from './maviAssistant.mjs';

test('MAVI map controls are fast local intents without touching route calculation',()=>{
 const samples={
  'Mavi centraliza o mapa':'recenter_map',
  'Mavi mostra a rota inteira':'route_overview',
  'Mavi liga o trânsito':'show_traffic',
  'Mavi desliga o trânsito':'hide_traffic',
  'Mavi recalcula a rota':'alternative',
  'Mavi como está o trânsito':'traffic_info'
 };
 for(const [phrase,expected] of Object.entries(samples))
  assert.equal(classifyMaviIntent(phrase),expected,phrase);
});
test('MAVI avoids zooming out during moving navigation',()=>{
 const moving={navigationActive:true,hasRoute:true,gpsReady:true,speedKmh:35};
 const stopped={...moving,speedKmh:0};
 assert.equal(answerMaviInformation('route_overview',moving).mode,'information');
 assert.equal(answerMaviInformation('route_overview',stopped).action,'route_overview');
 assert.equal(answerMaviInformation('show_traffic',moving).action,'show_traffic');
 assert.equal(answerMaviInformation('recenter_map',{gpsReady:false}).mode,'information');
});
test('proposed route is drawn separately and only applied through existing accept',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const mic=readFileSync(new URL('../components/JevVoiceButton.jsx',import.meta.url),'utf8');
 assert.match(map,/vano-mavi-route-preview/);
 assert.match(map,/previewFocus/);
 assert.match(map,/motion\.current\?\.suspend\(\)/);
 assert.match(page,/jevMode&&maviPreview\?\.sourceKey===jevKey/);
 assert.match(page,/previewRoute=\{visibleMaviPreview\?\.route\|\|null\}/);
 assert.match(mic,/handlersRef\.current\.onPreview\?\.\(response\)/);
 assert.match(mic,/handlersRef\.current\.onDismissPreview\?\.\(\)/);
 assert.match(page,/function applyJev\(proposal\)/);
});
