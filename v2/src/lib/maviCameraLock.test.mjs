import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('MAVI overlay cannot take the camera away from active navigation at any speed',()=>{
 const map=file('../components/VanoMap.jsx');
 const preview=file('./maviPreview.mjs');
 const effect=map.slice(map.indexOf('// The MAVI candidate is separate'),map.indexOf('// Render route only when route changes'));
 assert.ok(effect.includes('if(navigation){'));
 assert.ok(effect.indexOf('if(navigation){')<effect.indexOf('map.fitBounds'));
 assert.match(effect,/if\(navigation\)\{[\s\S]*?return;\s*\}/);
 assert.match(effect,/\[previewRoute,previewFocus,navigation\]/);
 assert.match(preview,/return !navigation;/);
});
test('MAVI route reports cannot reset route, destination or map camera',()=>{
 const page=file('../pages/MapPage.jsx');
 const start=page.indexOf('const incidentType=navMode?classifyMaviRoadReport(text):null');
 const end=page.indexOf('// Informational commands work even before planning a route.',start);
 assert.ok(start>0&&end>start);
 const reportBlock=page.slice(start,end);
 assert.match(reportBlock,/await report\(\{type:incidentType,coords:gps\.coords,description:''\}\)/);
 assert.doesNotMatch(reportBlock,/setRouteData|setNavMode|setGuidance|fitBounds|mapControl\.current/);
 const apply=page.slice(page.indexOf('function applyJev(proposal)'),page.indexOf('cachePosition.current=userCoords'));
 assert.match(apply,/setRouteData\(proposal\.routeData\);setChoice\(proposal\.routeId\)/);
 assert.doesNotMatch(apply,/setNavMode\(false\)|mapControl\.current\?\.overview/);
});
test('stale audio promises cannot restart mic or abort just-approved speech',()=>{
 const mic=file('../components/JevVoiceButton.jsx');
 assert.match(mic,/voiceTurnRef=useRef\(0\),justAcceptedRouteRef=useRef\(false\)/);
 assert.match(mic,/if\(finished\|\|voiceTurnRef\.current!==turn\)return/);
 assert.match(mic,/if\(applied\)justAcceptedRouteRef\.current=true/);
 assert.match(mic,/if\(!accepted\)\{[\s\S]*?voiceTurnRef\.current\+\+;/);
 assert.match(mic,/if\(!wasSpeaking\)return;[\s\S]*?voiceTurnRef\.current\+\+;/);
 assert.match(mic,/if\(answer==='clarify'\)\{/);
 assert.match(mic,/if\(answer==='accept'\)\{/);
 assert.match(mic,/if\(answer==='reject'\)\{/);
});
test('MAVI offer is compact and does not cover the driving map center',()=>{
 const css=file('../jev-voice.css');
 assert.match(css,/\.map-page\.in-navigation \.mavi-offer-card\{/);
 assert.match(css,/max-height:min\(27dvh,170px\)/);
 assert.match(css,/\.map-page\.in-navigation \.mavi-offer-voice-hint\{display:none\}/);
});
