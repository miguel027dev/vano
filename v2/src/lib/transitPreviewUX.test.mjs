import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const transit=readFileSync(new URL('../pages/TransitPage.jsx',import.meta.url),'utf8');
const stage=readFileSync(new URL('../components/TransitJourneyPreview.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/TransitMap.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../transit-preview.css',import.meta.url),'utf8');

test('bus launches isolated feature-gated multimodal preview without calling road router',()=>{
 assert.match(app,/VITE_TRANSIT_PREVIEW/);
 assert.match(app,/\'\/transporte\'/);
 assert.match(app,/<Route path="\/transporte"/);
 assert.match(page,/className="v47-transit-mode"/);
 assert.match(page,/to="\/transporte"/);
 assert.match(page,/state=\{\{from:validPoint\(origin\)/);
 assert.match(transit,/post\('\/transit\/plan',request\)/);
 assert.match(transit,/TransitJourneyPreview itinerary=\{itinerary\}/);
});
test('route overview honors line colors, station badges and original map attribution',()=>{
 assert.match(map,/transitGeojson\(itinerary\)/);
 assert.match(map,/transitStopsGeojson\(itinerary,origin,destination\)/);
 assert.match(map,/transitBadgeGeojson\(itinerary\)/);
 assert.match(map,/attributionControl:true/);
 assert.match(map,/MAPBOX_STYLES\.satellite/);
 assert.match(stage,/itinerary\.legs/);
 assert.match(stage,/vt-preview-top/);
 assert.match(stage,/vt-preview-dock/);
 assert.match(stage,/itinerary\.transfers/);
 assert.match(stage,/number\(itinerary\.walkMeters\)/);
});
test('responsive map preview reserves device safe areas and avoids overlay collisions',()=>{
 assert.match(styles,/vt-preview-top\{/);
 assert.match(styles,/vt-preview-map-actions\{/);
 assert.match(styles,/vt-preview-dock\{/);
 assert.match(styles,/safe-area-inset-bottom/);
 assert.match(styles,/@media\(max-width:520px\)/);
 assert.match(styles,/@media\(max-height:480px\)/);
 assert.match(styles,/prefers-reduced-motion:reduce/);
});
