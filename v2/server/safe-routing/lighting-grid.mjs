/** Bounded private lighting inventory inspection of actual provider geometries. */
import {authorizeB2,readB2Object} from './b2-storage.mjs';
import {b2RuntimeConfig,decodeSnapshotObject} from './b2-snapshot.mjs';
import {routeLineJson} from './lighting-postgis.mjs';

export function tilesForRoute(route){
 const coordinates=JSON.parse(routeLineJson(route)).coordinates;
 const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
 const minX=Math.floor((Math.min(...xs)-.0005)*50),maxX=Math.floor((Math.max(...xs)+.0005)*50);
 const minY=Math.floor((Math.min(...ys)-.0005)*50),maxY=Math.floor((Math.max(...ys)+.0005)*50);
 if((maxX-minX+1)*(maxY-minY+1)>25)throw Error('Área da rota excede o limite de teste');
 const keys=[];for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)keys.push(`${x}_${y}`);
 return keys;
}
const distance=(a,b)=>Math.hypot((a[0]-b[0])*102000,(a[1]-b[1])*111320);
export function inspectFixtureProximity(route,points){
 const coordinates=JSON.parse(routeLineJson(route)).coordinates;
 if(!Array.isArray(points)||points.length>200000||points.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Inventário inválido');
 const samples=[];let total=0,next=0;
 for(let i=1;i<coordinates.length;i++){
  const a=coordinates[i-1],b=coordinates[i],length=distance(a,b);
  if(length>10000)throw Error('Segmento de rota excessivo');
  while(next<=total+length&&samples.length<401){
   const t=length?Math.max(0,Math.min(1,(next-total)/length)):0;
   samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);next+=50;
  }
  total+=length;
 }
 if(total>20000||!samples.length)throw Error('Extensão da rota excede teste');
 // Small spatial buckets keep the scan bounded instead of samples × all points.
 const cells=new Map(),key=p=>`${Math.floor(p[0]*2000)}_${Math.floor(p[1]*2000)}`;
 for(const p of points){const k=key(p);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);}
 let near=0;
 for(const sample of samples){
  const x=Math.floor(sample[0]*2000),y=Math.floor(sample[1]*2000);let found=false;
  for(let dx=-1;dx<=1&&!found;dx++)for(let dy=-1;dy<=1&&!found;dy++)
   found=(cells.get(`${x+dx}_${y+dy}`)||[]).some(p=>distance(p,sample)<=35);
  if(found)near++;
 }
 return {assessedSampleCount:samples.length,nearFixtureSamples:near,fixtureProximityFraction:+(near/samples.length).toFixed(4),
  assessedMeters:Math.round(total),lampFunctionConfirmed:false,roadAssociationConfirmed:false,suitableForAutomaticRanking:false};
}
export async function compareLightingInventory(routes,{env=process.env,fetcher=fetch}={}){
 if(!Array.isArray(routes)||!routes.length||routes.length>4)throw Error('Limite de candidatos inválido');
 const snapshot=env.VANO_SAFE_B2_LIGHTING_GRID;
 if(!/^geosampa-lights-[a-z0-9-]+-grid$/.test(snapshot||''))throw Error('Índice espacial não configurado');
 const config=b2RuntimeConfig(env),authorization=await authorizeB2(config,{fetcher});
 const manifest=JSON.parse(await readB2Object({authorization,config,path:`snapshots/${snapshot}/index.json`,fetcher}));
 if(manifest.kind!=='lighting-grid-v1'||manifest.snapshotId!==snapshot||manifest.gridScale!==50||manifest.usedForRouting!==false||
  !manifest.tiles||Object.keys(manifest.tiles).length>800)throw Error('Índice espacial inválido');
 const keys=[...new Set(routes.flatMap(tilesForRoute))];
 if(keys.length>25)throw Error('Área dos candidatos excede o limite de teste');
 const points=[];
 for(let start=0;start<keys.length;start+=4){
  const pages=await Promise.all(keys.slice(start,start+4).map(async key=>{
   const object=manifest.tiles[key];if(!object)return [];
   if(object.path!==`snapshots/${snapshot}/tiles/${key}.geojson.gz`||object.bytes>2_000_000||object.features>50000)throw Error('Tile inválido');
   const bytes=await readB2Object({authorization,config,path:object.path,maxBytes:2_000_000,fetcher});
   return decodeSnapshotObject(bytes,object).features.map(f=>f.geometry?.type==='Point'?f.geometry.coordinates:null);
  }));
  points.push(...pages.flat());
  if(points.length>200000)throw Error('Inventário excede limite');
 }
 return {snapshotId:snapshot,sourceSnapshot:manifest.sourceSnapshot,queriedTiles:keys.length,inventoryPoints:points.length,
  comparisons:routes.map(route=>({id:route.id,...inspectFixtureProximity(route,points)})),
  forTestingOnly:true,usedForRouting:false,warning:'Proximidade de pontos cadastrados; funcionamento e associação à via não confirmados.'};
}
