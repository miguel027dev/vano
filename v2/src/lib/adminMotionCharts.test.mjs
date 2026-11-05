import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dashboard=readFileSync(new URL('../components/AdminInsights.jsx',import.meta.url),'utf8');
const charts=readFileSync(new URL('../components/AdminMotionCharts.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin-insights.css',import.meta.url),'utf8');
const admin=readFileSync(new URL('../pages/AdminPage.jsx',import.meta.url),'utf8');

test('dashboard charts use real route history instead of a fabricated dataset',()=>{
 assert.match(dashboard,/stats\.routesByDay/);
 assert.match(dashboard,/<DailyRouteTrend days=\{stats\.routesByDay\|\|\[\]\}/);
 assert.match(dashboard,/stats\.routesTotal/);
 assert.match(charts,/rows\.map\(row=>/);
 assert.match(charts,/Evolução de rotas registradas por dia/);
 assert.match(charts,/Históricos realmente salvos/);
 assert.doesNotMatch(charts,/Math\.random\(/);
});
test('KPI counts animate only once per visible view and expose the actual value',()=>{
 assert.match(dashboard,/playedSections\.current\.has\(active\)/);
 assert.match(dashboard,/visible &&/);
 assert.match(dashboard,/1450/);
 assert.match(charts,/played\.current=true/);
 assert.match(charts,/aria-hidden="true"/);
 assert.match(charts,/className="sr-only"/);
 assert.match(charts,/cancelAnimationFrame\(raf\)/);
 assert.match(admin,/visible=\{activeSection==='dashboard'\|\|activeSection==='indicators'\}/);
});
test('visual motion is compositor-first and respects reduced motion',()=>{
 assert.match(css,/@keyframes vaiBarRise/);
 assert.match(css,/@keyframes vaiTrendDraw/);
 assert.match(css,/transform:scaleY/);
 assert.match(css,/stroke-dashoffset/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(dashboard,/prefers-reduced-motion: reduce/);
 assert.doesNotMatch(css,/@keyframes[^}]+height\s*:/);
});
