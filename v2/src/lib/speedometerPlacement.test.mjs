import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v43-speed-arrival.css',import.meta.url),'utf8');
const layout=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');

test('a single real-GPS speedometer moves left of the street pill in navigation',()=>{
 assert.equal(page.split('className="v43-speedometer"').length-1,1,
  'speedometer JSX and speed source must be shared, not duplicated');
 assert.match(page,/const speedometer=<output className="v43-speedometer"/);
 assert.match(page,/smoothGpsSpeedSample\(speedSampleRef\.current,result\.speed,/);
 assert.doesNotMatch(page,/<div className="map-controls">\{!navMode&&speedometer\}/);
 assert.match(page,/<div className="map-controls">/);
 const row=page.indexOf('navMode&&<div className="v36-nav-road-row"');
 const dial=page.indexOf('{speedometer}',row);
 const street=page.indexOf('className="v36-nav-road-pill"',row);
 const report=page.indexOf('className="circle-btn v36-nav-report"',row);
 const dock=page.indexOf('className="nav-bottom v37-nav-bottom"',row);
 assert.ok(0<row&&row<dial&&dial<street&&street<dock&&dock<report);
 assert.match(page,/to="\/relatar" title="Registrar alerta"/);
});
test('speedometer and controls clear the viewport-centered street address and safe areas',()=>{
 assert.match(layout,/\.map-page\.in-navigation \.v36-nav-road-row\{/);
 assert.match(layout,/left:50%;\s*transform:translateX\(-50%\)/);
 assert.match(layout,/env\(safe-area-inset-left,0px\)/);
 assert.match(layout,/\.map-page\.in-navigation \.v36-nav-report\{\s*justify-self:end;/);
 assert.match(css,/\.map-page\.in-navigation \.v36-nav-road-row \.v43-speedometer\{\s*position:absolute;\s*left:0;\s*top:50%;\s*transform:translateY\(-50%\);/);
 assert.match(css,/width:min\(420px,calc\(100% - 166px\)\)/);
 assert.match(css,/width:min\(420px,calc\(100% - 148px\)\)/);
 for(const screen of [320,360,375,390,391,393,412,430,600,768]){
  const rowWidth=Math.min(700,screen-28);
  const narrow=screen<=390;
  const dialWidth=narrow?60:66;
  const pillWidth=Math.min(420,rowWidth-(narrow?148:166));
  assert.ok((rowWidth-pillWidth)/2-dialWidth>=13,
   'street pill must clear the left dial at '+screen+'px');
  assert.ok((rowWidth-pillWidth)/2-45>=25,
   'street pill must clear the right map control at '+screen+'px');
 }
});
test('do not change physical speedometer size, style or speed-reading behavior',()=>{
 assert.match(css,/\.map-page \.v43-speedometer\{[\s\S]*?flex:0 0 66px;[\s\S]*?width:66px;[\s\S]*?min-width:66px;[\s\S]*?height:66px;/);
 assert.match(css,/@media\(max-width:390px\)\{[\s\S]*?width:60px;min-width:60px;height:60px;flex-basis:60px/);
 assert.match(css,/@media\(max-height:540px\) and \(orientation:landscape\)/);
 assert.match(css,/font-variant-numeric:tabular-nums lining-nums/);
 assert.doesNotMatch(css,/conic-gradient|stroke-dasharray|@keyframes|progress-ring|orange-ring/i);
 assert.match(page,/speedKmh===null\?'—':speedKmh/);
 assert.match(page,/<small>km\/h<\/small>/);
 assert.match(page,/Date\.now\(\)-speedSample\.sourceAt<18000/);
});
