import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../pages/AdminPage.jsx',import.meta.url),'utf8');
const glass=readFileSync(new URL('../admin-vanu-glass.css',import.meta.url),'utf8');
const trips=readFileSync(new URL('../components/AdminLiveTrips.jsx',import.meta.url),'utf8');
const atlas=readFileSync(new URL('../lib/mapLayers.js',import.meta.url),'utf8');

test('VANU admin preserves real metrics, sections, and admin permission gate',()=>{
 assert.match(admin,/user\?\.isAdmin/);
 assert.match(admin,/api\('\/admin'\)/);
 assert.match(admin,/<AdminEtaConsole\/>/);
 assert.match(admin,/<AdminInsights stats=\{stats\}/);
 assert.match(admin,/showLegacy/);
 assert.match(admin,/vanu-control-frame/);
 assert.match(admin,/vanu-control-sidebar/);
 assert.match(admin,/vanu-dashboard-panel" hidden=\{activeSection/);
});

test('route view reuses real monitored journeys and preserves the navigation sidebar',()=>{
 assert.match(admin,/Acompanhar rotas/);
 assert.match(admin,/<AdminLiveTrips embedded/);
 assert.match(trips,/embedded=false/);
 assert.match(trips,/alt-embedded/);
 assert.match(trips,/api\('\/admin\/live-trips'\)/);
 assert.match(trips,/setInterval\(refresh,5000\)/);
 assert.match(trips,/VANO_ATLAS_BLACK_STYLE/);
 assert.match(atlas,/VANO_ATLAS_BLACK_STYLE=/);
 assert.doesNotMatch(trips,/style:'mapbox:\/\/styles\/mapbox\/dark-v11'/);
});

test('dark glass styles honor brand amber and reduced-motion preferences',()=>{
 assert.match(glass,/#f59a62/i);
 assert.match(glass,/\.vanu-admin-hero/);
 assert.match(glass,/\.vanu-control-sidebar/);
 assert.match(glass,/prefers-reduced-motion:reduce/);
 assert.match(glass,/\.alt-overlay\.alt-embedded/);
});
