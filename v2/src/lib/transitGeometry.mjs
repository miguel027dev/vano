/** Transit GeoJSON: do not invent line geometries without operator-provided shapes. */
export const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const collection=(features=[])=>({type:'FeatureCollection',features});
const feature=(coordinates,properties)=>({type:'Feature',properties,geometry:{type:'Point',coordinates}});
export function decodeTransitPolyline(encoded){
 if(typeof encoded!=='string'||encoded.length>50000)return [];
 let lat=0,lon=0,index=0;const points=[];
 const next=()=>{let result=0,shift=0,b;do{if(index>=encoded.length||shift>30)throw Error('Invalid polyline');b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):(result>>1);};
 try{while(index<encoded.length&&points.length<10000){lat+=next();lon+=next();const p=[lon/1e5,lat/1e5];if(!valid(p))return [];points.push(p);}return points;}catch{return [];}
}
export function transitGeojson(itinerary){
 const features=(itinerary?.legs||[]).flatMap((leg,i)=>{
  const coords=decodeTransitPolyline(leg.geometryEncoded);
  // Route geometry MUST originate with the provider. A straight segment from
  // stop A to stop B is not a transit route and must never be fabricated.
  if(coords.length<2)return [];
  const lineColor=leg.transit?leg.lineColor||'#EA6229':'#83909C';
  return [{type:'Feature',properties:{order:i,transit:leg.transit===true,color:lineColor},
    geometry:{type:'LineString',coordinates:coords}}];
 });
 return collection(features);
}
export function transitStopsGeojson(itinerary,origin,destination){
 const stops=[];
 const add=(coordinates,label,kind,color='#FFFFFF')=>{
  if(!valid(coordinates)||stops.some(s=>s.geometry.coordinates.every((v,i)=>Math.abs(v-coordinates[i])<0.000005)&&s.properties.kind===kind))return;
  stops.push(feature(coordinates,{label:String(label||'').slice(0,60),kind,color}));
 };
 const first=itinerary?.legs?.[0]?.from;
 const last=itinerary?.legs?.at(-1)?.to;
 add(origin?.coords||first?.coords,'A','start','#EA6229');
 for(const leg of itinerary?.legs||[]){
  if(!leg?.transit)continue;
  if(valid(leg.from?.coords))add(leg.from.coords,leg.from.name,'transfer',leg.lineColor||'#EA6229');
  if(valid(leg.to?.coords))add(leg.to.coords,leg.to.name,'transfer',leg.lineColor||'#EA6229');
 }
 add(destination?.coords||last?.coords,'B','finish','#EA6229');
 return collection(stops);
}
export function transitBadgeGeojson(itinerary){
 const features=[];
 for(const leg of itinerary?.legs||[]){
  if(!leg.transit)continue;
  const geometry=decodeTransitPolyline(leg.geometryEncoded);
  if(geometry.length<2||!leg.line)continue;
  const point=geometry[Math.floor((geometry.length-1)*0.5)];
  features.push(feature(point,{label:String(leg.line).slice(0,9),color:leg.lineColor||'#EA6229'}));
 }
 return collection(features);
}
