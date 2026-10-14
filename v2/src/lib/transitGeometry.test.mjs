import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTransitPolyline,transitGeojson,transitStopsGeojson,transitBadgeGeojson,valid} from './transitGeometry.mjs';

const encoded='_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const shape='_p~iF~ps|U_ulLnnqC';
const start=[-120.2,38.5],stop=[-120.95,40.7],end=[-126.453,43.252];
const itinerary={legs:[
 {transit:false,mode:'walk',from:{coords:start,name:'A'},to:{coords:stop,name:'Parada'}},
 {transit:true,mode:'bus',line:'237',lineColor:'#FF6700',from:{coords:start,name:'Terminal'},
  to:{coords:stop,name:'Parada Central'},geometryEncoded:shape},
 {transit:true,mode:'metro',line:'Linha 4',lineColor:'#FFD600',from:{coords:stop,name:'Parada Central'},to:{coords:end,name:'Estação final'},geometryEncoded:null}
]};
test('polyline decoding uses provider-supplied geometry and rejects invalid coordinate data',()=>{
 const decoded=decodeTransitPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
 assert.deepEqual(decoded,[start,stop,end]);
 assert.deepEqual(decodeTransitPolyline('invalid&polyline'),[]);
 assert.deepEqual(decodeTransitPolyline(null),[]);
 assert.equal(valid([250,25]),false);
});
test('transit geometry does not fabricate straight lines when operator shape is unavailable',()=>{
 const geo=transitGeojson(itinerary);
 assert.equal(geo.features.length,1,'walking and second metro without actual geometry are excluded');
 assert.equal(geo.features[0].properties.color,'#FF6700');
 assert.equal(geo.features[0].properties.transit,true);
 assert.deepEqual(geo.features[0].geometry.coordinates,[start,stop]);
 const stops=transitStopsGeojson(itinerary,{coords:start},{coords:end});
 assert.ok(stops.features.some(f=>f.properties.kind==='start'));
 assert.ok(stops.features.some(f=>f.properties.kind==='transfer'));
 assert.ok(stops.features.some(f=>f.properties.kind==='finish'));
 assert.ok(stops.features.some(f=>f.properties.label==='Parada Central'));
});
test('route badges show operator line numbers only when leg geometry exists',()=>{
 const badges=transitBadgeGeojson(itinerary);
 assert.equal(badges.features.length,1);
 assert.equal(badges.features[0].properties.label,'237');
 assert.deepEqual(badges.features[0].geometry.coordinates,start);
 assert.equal(transitBadgeGeojson({legs:[{transit:true,mode:'bus',line:'999',geometryEncoded:null}]}).features.length,0);
});
