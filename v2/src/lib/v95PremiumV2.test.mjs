import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arrivalCalendarDate} from './navigationSummary.js';

const load=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');
const page=load('../pages/MapPage.jsx');
const css=load('../v95-v2-premium.css');
const entry=load('../main.jsx');

test('V2 arrival calendar is grounded in a real Date and safe on invalid inputs',()=>{
  assert.equal(arrivalCalendarDate(null),'Data indisponível');
  assert.equal(arrivalCalendarDate(new Date(NaN)),'Data indisponível');
  const valid=new Date(2026,9,25,19,40);
  const pt=arrivalCalendarDate(valid,'pt-BR');
  assert.match(pt,/25/);
  assert.match(pt,/outubro/);
  assert.match(pt,/2026/);
  assert.match(arrivalCalendarDate(valid,'invalid_locale_!'),/2026/);
});

test('V2 premium screens never alter the public map styles or its camera',()=>{
  assert.match(page,/adminV2RoadSigns\?'v95-premium-v2':''/);
  assert.match(css,/\.map-page\.v95-premium-v2/);
  assert.match(entry,/import '\.\/v95-v2-premium\.css';/);
  const i=entry.indexOf("import './v50-night-system.css';");
  assert.ok(i>entry.indexOf("import './v95-v2-premium.css';"));
  assert.ok(!entry.slice(i+32).includes("import './"));
});

test('V2 arrival shows real ETA clock, full date, remaining time and distance',()=>{
  assert.match(page,/const v2ArrivalDate=arrivalCalendarDate\(navigationStats\?\.arrivalAt,language\)/);
  assert.match(page,/CHEGADA PREVISTA/);
  assert.match(page,/className="v95-arrival-date"/);
  assert.match(page,/Tempo restante/);
  assert.match(page,/Distância restante/);
  assert.match(page,/className="v95-preview-arrival"/);
  assert.match(page,/route\.duration\*60000/);
  assert.match(page,/dateTime=\{navigationStats\?\.arrivalAt\?\.toISOString\(\)\}/);
});

test('admin utilities stay available behind an accessible reversible tool menu',()=>{
  assert.match(page,/const \[v2ToolsOpen,setV2ToolsOpen\]=useState\(false\)/);
  assert.match(page,/adminV2RoadSigns&&<div className=\{\x60v95-tools-panel/);
  assert.match(page,/aria-controls="v95-v2-tools"/);
  assert.match(page,/aria-expanded=\{v2ToolsOpen\}/);
  assert.match(page,/v2-admin-road-audit-toggle/);
  assert.match(page,/v81-drone-sim-toggle/);
  assert.match(page,/v76-sim-toggle/);
  assert.match(css,/\.map-page\.v95-premium-v2 \.map-controls \.v95-tools-panel\.is-open/);
  assert.match(page,/aria-label="Encerrar navegação"/);
});
