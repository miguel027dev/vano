import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');

test('private V2 route chooser hides the bulky pre-navigation directions panel',()=>{
  assert.match(page,/const adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
  assert.match(page,/\{!adminV2RoadSigns&&<section className="v70-route-details"/);
  assert.match(page,/<\/section>\}\s*<span className="sr-only" role="status"/);
  assert.match(page,/className="route-options"/);
  assert.match(page,/className="btn btn-primary start-btn" onClick=\{begin\}/);
});

test('maneuver directions stay available once navigation is underway',()=>{
  assert.match(page,/className=\{\x60nav-instruction v28-nav-instruction/);
  assert.match(page,/displayManeuverDistance\(shownGuidance\?\.distance,language\)/);
  assert.match(page,/maneuverVariant\(shownGuidance\)/);
  assert.match(page,/const nextTurnText=maneuverText\(shownGuidance/);
});
