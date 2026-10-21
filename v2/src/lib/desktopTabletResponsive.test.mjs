import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../v81-desktop-tablet.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const map = readFileSync(new URL('../pages/MapPage.jsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../components/Navigation.jsx', import.meta.url), 'utf8');

test('wide-screen layer loads before the dark theme so its colours win', () => {
  assert.match(main, /import '\.\/v81-desktop-tablet\.css'/);
  assert.ok(main.indexOf("import './v81-desktop-tablet.css'") < main.indexOf("import './v50-night-system.css'"));
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.doesNotMatch(css, /@media \(max-width: 767px\)/);
});

test('desktop and tablet map keep search results, routes and map controls in separate workspaces', () => {
  for (const className of [
    'map-top.v31-map-top', 'search-results.v32-results', 'route-sheet',
    'collapsed-route', 'map-controls', 'v31-location-card'
  ]) {
    assert.ok(css.includes(className), 'missing responsive rule for ' + className);
  }
  assert.match(css, /has-sheet:not\(\.in-navigation\) \.map-controls/);
  assert.match(css, /has-collapsed-route \.v31-location-card\s*\{\s*display:\s*none/);
  assert.match(css, /max-height:\s*min\(52dvh,\s*535px\)/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(map, /className="search-results v32-results"/);
  assert.match(map, /className="route-sheet"/);
});

test('tablet navigation is accessible and reserves main content width', () => {
  assert.match(css, /@media \(min-width: 900px\) and \(max-width: 1109px\)/);
  assert.match(css, /\.bottom-nav\.v5-bottom-nav\s*\{\s*display:\s*none !important/);
  assert.match(css, /width:\s*192px/);
  assert.match(css, /width:\s*calc\(100vw - 240px\)/);
  assert.match(css, /margin-left:\s*216px/);
  assert.match(nav, /aria-label="Menu lateral"/);
  for (const viewport of [900, 960, 1024, 1109]) {
    const content = viewport - 240;
    assert.ok(content >= 660);
    assert.ok(content + 216 + 24 <= viewport, 'tablet content overflows: ' + viewport);
  }
});

test('compact landscape and reduced-motion layouts are accounted for', () => {
  assert.match(css, /@media \(min-width: 768px\) and \(max-height: 620px\)/);
  assert.match(css, /@media \(min-width: 768px\) and \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation:\s*none/);
  assert.doesNotMatch(css, /\.mapboxgl-ctrl-bottom|\.leaflet-bottom/);
});
