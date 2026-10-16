import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJevStreetRequest,roadNameMatches,routeRoadEvidence,excludedRoadPoints,findStreetCandidate} from './jevStreetRouting.mjs';
import {chooseJevProposal,jevRouteFingerprint} from './jevShared.mjs';

test('MAVI understands natural named-road avoidance in Brazilian Portuguese',()=>{
 const samples=[
  'Mavi, não quero ir pela Giovanni Gronchi',
  'Mavi, tem outro caminho que não pega a Giovanni?',
  'Mavi, tem outro caminho sem passar pela Avenida Giovanni Gronchi?',
  'Mavi, evita a Giovanni Gronchi',
  'Mavi, não passa pela rua Giovanni Gronchi',
  'Mavi, desvia da avenida Giovanni Gronchi',
 ];
 for(const input of samples){
   const actual=extractJevStreetRequest(input);
   assert.ok(actual,'named road recognized: '+input);
   assert.equal(actual.kind,'avoid',input);
   assert.match(actual.road,/giovanni/,input);
 }
});
test('MAVI distinguishes via-street requests from generic commands and toll avoidance',()=>{
 for(const input of ['Mavi, quero ir pela Avenida Morumbi','Mavi, prefiro passar pela Avenida Morumbi','Mavi, sentido Avenida Morumbi']){
   const x=extractJevStreetRequest(input);
   assert.equal(x?.kind,'via',input);
   assert.equal(x?.road,'morumbi',input);
 }
 for(const input of ['Mavi, troca a rota','Mavi, recalcula a rota','Mavi, evita pedágio','Mavi, evita trânsito','Mavi, me ajuda']){
   assert.equal(extractJevStreetRequest(input),null,input);
 }
});
test('matches STT mispronunciation but not unrelated road names',()=>{
 assert.equal(roadNameMatches('Avenida Giovanni Gronchi','Giovanni Gronk'),true);
 assert.equal(roadNameMatches('Av. Giovanni Gronchi','Giovanni Gronchi'),true);
 assert.equal(roadNameMatches('Av. Giovanni Gronchi','Avenida Morumbi'),false);
 assert.equal(roadNameMatches('Rua Barão de Duprat','Avenida Morumbi'),false);
});
const base=[[-46.72,-23.61],[-46.719,-23.609],[-46.718,-23.608],[-46.717,-23.607],[-46.716,-23.606],[-46.715,-23.605]];
const make=(id,street,shift=0)=>({
 id,duration:18,distance:4,
 geometry:{type:'LineString',coordinates:base.map(([lon,lat],i)=>[lon,lat+ (i===0||i===5?0:shift)])},
 steps:[{street,location:base[0]},{street:'Rua José',location:base[5]}]
});
test('only alternative with real named-road evidence may be offered',()=>{
 const current=make('fast','Avenida Giovanni Gronchi');
 const sameStreet=make('safe','Avenida Giovanni Gronchi',.002);
 const clean=make('fast','Avenida Morumbi',.005);
 const source=jevRouteFingerprint(current);
 assert.equal(routeRoadEvidence(current,'Giovanni Gronk').uses,true);
 assert.equal(routeRoadEvidence(clean,'Giovanni Gronk').uses,false);
 assert.equal(findStreetCandidate([sameStreet,clean],source,'Giovanni Gronk','avoid').length,1);
 assert.equal(chooseJevProposal(findStreetCandidate([sameStreet,clean],source,'Giovanni Gronk','avoid'),source,'avoid_street'),clean);
 assert.equal(findStreetCandidate([sameStreet,clean],source,'Avenida Morumbi','via').length,1);
 assert.equal(findStreetCandidate([{...clean,steps:[]}],source,'Giovanni Gronk','avoid').length,0);
 assert.equal(chooseJevProposal(findStreetCandidate([sameStreet],source,'Giovanni Gronchi','avoid'),source,'avoid_street'),null);
});
test('point exclusion samples the interior of the named road, not other steps',()=>{
 const route=make('safe','Avenida Giovanni Gronchi');
 const points=excludedRoadPoints([route],'Giovanni Gronk');
 assert.ok(points.length>0);
 assert.ok(points.length<=5);
 assert.ok(points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
 assert.equal(excludedRoadPoints([route],'Avenida Morumbi').length,0);
});
