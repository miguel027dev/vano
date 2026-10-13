import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');

test('a single GPS street pill is visible only during active navigation',()=>{
 assert.match(map,/navMode&&<div className="v36-nav-road-row"/);
 assert.match(map,/className="v36-nav-road-pill"/);
 assert.match(map,/navigationStreetLabel\(currentAddress,hasRecentGpsFix/);
 assert.doesNotMatch(map,/v36-nav-road-pill[^\n]*guidance\?\.street/);
});
test('existing report link and unchanged triangle icon moved to right of centered pill',()=>{
 assert.equal(map.split('to="/relatar" title="Registrar alerta"').length-1,1);
 assert.match(map,/className="circle-btn v36-nav-report" to="\/relatar"/);
 assert.match(map,/<AlertTriangle size=\{19\} strokeWidth=\{1\.9\}\/>/);
 const pill=map.indexOf('className="v36-nav-road-pill"');
 const report=map.indexOf('className="circle-btn v36-nav-report"');
 assert.ok(pill>0&&report>pill);
 const nextDock=map.indexOf('className="nav-bottom"',report);
 assert.ok(nextDock>report);
 assert.doesNotMatch(map.slice(report,nextDock),/v36-nav-left|speedometer|veloc[ií]metro/i);
});
test('real dock height and safe-area reserve room above the end navigation action',()=>{
 assert.match(map,/dock\.offsetHeight/);
 assert.match(map,/ResizeObserver\(measure\)/);
 assert.match(css,/var\(--v36-nav-dock-height,180px\)/);
 assert.match(css,/\.map-page\.in-navigation \.v36-nav-road-row/);
 assert.match(css,/left:50%;\s*transform:translateX\(-50%\)/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/\.map-page\.in-navigation \.v36-nav-report/);
 assert.match(css,/right:0;\s*top:50%/);
 assert.match(css,/env\(safe-area-inset-left,0px\)/);
});
