import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const map = readFileSync(new URL('../pages/MapPage.jsx', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../components/B1RouteSheet.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../route-mode-detail.css', import.meta.url), 'utf8');

test('V1 maneuver header does not show verbose secondary lane explanations', () => {
  assert.match(map, /!b1User&&!compactIsland&&modeManeuverDetail/);
  assert.match(map, /!b1User&&!compactIsland&&mappedCrossing/);
  assert.match(map, /aria-label="Instrução da próxima manobra"/);
  assert.match(map, /className="v28-lane-guidance"/);
});
test('V1 bottom navigation does not render technical errors and keeps GPS visible above', () => {
  for(const marker of ['voiceProblem','storageReady===false','recalculating','!hasLiveGPS&&!simActive']){
    assert.ok(map.includes('!b1User&&'+marker), 'bottom notice must be gated from V1: '+marker);
  }
  assert.match(map, /b1User&&!hasLiveGPS&&!simActive&&<span className="v1-gps-status"/);
  assert.match(css, /\.v1-gps-status\{/);
});
test('V1 does not expose route-provider errors to users', () => {
  assert.match(map, /setRouteError\('retry'\)/);
  assert.match(map, /console\.warn\('\[VANO V1:route-calculation\]'/);
  assert.ok(!sheet.includes('{error}<button'), 'B1 route sheet should not show raw provider errors');
  assert.match(sheet, /role="status" aria-label="Trajeto ainda não disponível"/);
  assert.match(map, /console\.warn\('\[VANO:navigation-reroute\]'/);
});
