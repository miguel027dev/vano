import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./communityReportOverlay.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../community-reports.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
const context=readFileSync(new URL('../context.jsx',import.meta.url),'utf8');

test('creator message is separated from confirmation UI, never showing question to creator',()=>{
 assert.match(source,/if\(report\.isOwn\)\{[\s\S]*?Seu alerta foi publicado\./);
 assert.match(source,/\}else if\(report\.viewerVote\)\{/);
 assert.match(source,/Essa blitz ainda está aqui\?/);
 assert.match(source,/choices=\[\['present','Ainda está'\],\['gone','Não está mais'\]\]/);
 assert.match(context,/detail:\{\.\.\.saved,isOwn:true,viewerVote:null\}/);
});
test('both Mapbox and Leaflet popup DOM use same theme-scoped component',()=>{
 assert.match(source,/mapboxgl\.Popup\(\{offset:22,maxWidth:'290px',className:'vano-community-map-popup'\}\)/);
 assert.match(source,/L\.popup\(\{className:'vano-community-map-popup',maxWidth:290\}\)/);
 assert.match(style,/\.map-page\[data-map-appearance="dark"\] \.vano-community-map-popup\{/);
 assert.match(style,/--cr-bg:#18242d;--cr-ink:#fff/);
 assert.match(style,/\.map-page \.mapboxgl-popup\.vano-community-map-popup \.mapboxgl-popup-content/);
 assert.match(style,/\.map-page \.leaflet-popup\.vano-community-map-popup \.leaflet-popup-content-wrapper/);
 assert.match(style,/\.leaflet-popup-tip\{background:var\(--cr-bg\)\}/);
 assert.match(style,/\.mapboxgl-popup-tip\{border-top-color:var\(--cr-bg\)\}/);
 assert.match(style,/min-height:44px/);
 assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
});
test('server derives private self-authorship, enforces csrf and persists votes without broadcasting identities',()=>{
 assert.match(server,/publicReportsInBBox\(db\.reports,bbox,Date\.now\(\),viewerOwner,viewerKey\)/);
 assert.match(server,/\/api\\\/reports\\\/\(\[a-f0-9\]\{16\}\)\\\/feedback/);
 assert.match(server,/protectedWrite\(req,res\)/);
 assert.match(server,/recordReportFeedback\(record,actor,key,body\.choice,now\(\)\)/);
 assert.match(server,/if\(result\.status==='own'\)return err\(res,403/);
 assert.match(server,/await persist\(\);\s*\/\/ A single negative/);
 assert.match(server,/for \(const key of \['favorites', 'history', 'routines', 'preferences', 'reports'\]\)/);
 assert.doesNotMatch(source,/innerHTML=report\.description/);
});
