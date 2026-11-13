import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const transit=readFileSync(new URL('../pages/TransitPage.jsx',import.meta.url),'utf8');
const stage=readFileSync(new URL('../components/TransitJourneyPreview.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/TransitMap.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../transit-preview.css',import.meta.url),'utf8');

test('public transit remains inaccessible from the V2 public shell',()=>{
 assert.ok(app.includes('<Route path="/transporte" element={<Navigate to="/mapa" replace/>}'));
 assert.ok(app.includes('<Route path="/planejar-transporte" element={<Navigate to="/mapa" replace/>}'));
 assert.ok(!app.includes('<TransitPage/>'));
 // Archived implementation may remain for later development, but the public
 // routing mode selector contains only car, motorcycle and walking.
 const rail=readFileSync(new URL('../components/TransportModeRail.jsx',import.meta.url),'utf8');
 for(const mode of ["carro","moto","a-pe"])assert.ok(rail.includes("{id:'"+mode+"'"));
 assert.ok(!rail.includes("{id:'publico'"));
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
