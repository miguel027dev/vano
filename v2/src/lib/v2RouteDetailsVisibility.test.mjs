import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');

test('route chooser hides bulky pre-navigation directions for public and admin maps',()=>{
  assert.match(page,/const adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
  assert.doesNotMatch(page,/className="v70-route-details"/);
  assert.doesNotMatch(page,/previewDetails\.map\(/);
  assert.match(page,/className="route-options"/);
  assert.match(page,/className="btn btn-primary start-btn" onClick=\{begin\}/);
  assert.match(page,/choice==='safe'&&routeVehicle!=='a-pe'/);
});

test('maneuver directions stay available once navigation is underway',()=>{
  assert.match(page,/className=\{\x60nav-instruction v28-nav-instruction/);
  assert.match(page,/displayManeuverDistance\(shownGuidance\?\.distance,language\)/);
  assert.match(page,/maneuverVariant\(shownGuidance\)/);
  assert.match(page,/const nextTurnText=maneuverText\(shownGuidance/);
});
