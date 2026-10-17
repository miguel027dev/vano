import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../motion-polish.css', import.meta.url), 'utf8');
const mapPage = readFileSync(new URL('../pages/MapPage.jsx', import.meta.url), 'utf8');
const voice = readFileSync(new URL('../jev-voice.css', import.meta.url), 'utf8');

test('isolated motion layer loads last without replacing existing theme or navigation styles', () => {
  assert.ok(entry.indexOf("import './motion-polish.css';") > entry.indexOf("import './v50-night-system.css';"));
  assert.match(entry, /import '\.\/styles\.css';/);
  assert.match(entry, /import '\.\/v28-navigation\.css';/);
  assert.match(entry, /import '\.\/v49-map-appearance\.css';/);
});

test('motion rules address real UI components without overriding the Mapbox camera or GPS', () => {
  for(const name of ['route-sheet','search-results v32-results','collapsed-route','vano-quick-report-shell']){
    assert.ok(mapPage.includes(name) || name === 'vano-quick-report-shell', `Missing real UI component: ${name}`);
  }
  assert.match(css, /\.map-page \.route-sheet/);
  assert.match(css, /\.map-page \.search-results\.v32-results/);
  assert.match(css, /\.map-page \.collapsed-route/);
  assert.match(css, /\.map-page \.vano-quick-report-shell/);
  assert.doesNotMatch(css, /\.mapboxgl-(?:canvas|map)|\.map-container\s*\{/);
  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
});

test('anchored sheets and results preserve the horizontal center during animated entry', () => {
  for(const name of ['vano-motion-sheet-in','vano-motion-search-in','vano-motion-collapsed-in']){
    const start = css.indexOf(`@keyframes ${name}`);
    const end = css.indexOf('}',css.indexOf('to ',start));
    const rule=css.slice(start,end+1);
    assert.match(rule,/translate\(-50%,/,`Anchoring lost in ${name}`);
    assert.match(rule,/opacity:/);
  }
});

test('reduced motion and low refresh-rate devices keep essential controls without decorative animations', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /update:\s*slow/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
});

test('MAVI uses the existing transform and opacity mic ring instead of animating shadows', () => {
  assert.match(voice, /\.mavi-mic-pulse/);
  assert.match(voice, /@keyframes mavi-mic-breathe/);
  assert.match(css, /\.jev-control-wrap \.jev-mic\.jev-listening\s*\{\s*animation:\s*none/);
});
