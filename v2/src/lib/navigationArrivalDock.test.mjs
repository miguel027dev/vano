import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const view=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');

test('navigation dock displays centered arrival clock over two remaining measurements',()=>{
 assert.match(view,/className="nav-bottom v37-nav-bottom"/);
 assert.match(view,/className="v37-nav-center"/);
 assert.match(view,/className="v37-nav-arrival"/);
 assert.match(view,/navigationStats\.remainingMinutes/);
 assert.match(view,/navigationStats\.remainingKm/);
 assert.match(view,/className="v37-nav-bullet"/);
 assert.match(view,/navigationSummary\(route,guidance,Date\.now\(\)\)/);
});
test('the only end-navigation control is an accessible X on the left of the ETA',()=>{
 const start=view.indexOf('className="nav-bottom v37-nav-bottom"');
 const end=view.indexOf('{recalculating&&',start);
 const segment=view.slice(start,end);
 assert.ok(start>0&&end>start);
 const close=segment.indexOf('className="circle-btn v37-nav-end"');
 const center=segment.indexOf('className="v37-nav-center"');
 const report=segment.indexOf('className="circle-btn v36-nav-report vano-quick-report-trigger"');
 assert.ok(close>0&&center>close&&report>center);
 assert.match(segment,/onClick=\{reset\} aria-label="Encerrar navegação"/);
 assert.match(segment,/onClick=\{\(\)=>setQuickReportOpen\(true\)\}/);
 assert.doesNotMatch(segment,/to="\/relatar"/);
 assert.equal(view.split('aria-label="Encerrar navegação"').length-1,1);
 assert.ok(!segment.includes('btn btn-primary'));
});
test('balanced columns keep centered ETA; dock remains white and respects safe areas',()=>{
 assert.match(css,/grid-template-columns:48px minmax\(0,1fr\) 48px/);
 assert.match(css,/\.map-page\.in-navigation \.nav-bottom\.v37-nav-bottom/);
 assert.match(css,/background:#fff/);
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/\.v37-nav-end:focus-visible/);
 assert.match(css,/@media\(max-width:360px\)/);
});
