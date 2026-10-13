/** Read already-loaded Mapbox Streets v8 POI and road-point vector tiles.
 * Uses existing style sources; never fabricates signage or radar locations.
 * Mapbox Streets v8 road class includes traffic_signals, level_crossing,
 * roundabout, and mini_roundabout as POINT geometries (Mapbox Tileset docs).
 */
const MAKI_TYPES=Object.freeze({
  hospital:['hospital',58,'Hospital'],doctor:['saude',48,'Serviço de saúde'],
  pharmacy:['saude',46,'Farmácia'],dentist:['saude',44,'Atendimento de saúde'],
  'fire-station':['bombeiros',56,'Bombeiros'],police:['policia-base',50,'Base policial'],
  fuel:['combustivel',37,'Posto de combustível'],parking:['estacionamento',30,'Estacionamento'],
  'charging-station':['eletroposto',38,'Eletroposto']
});
const clean=x=>typeof x==='string'?x.replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,96):'';
export function classifyMapboxPoi(properties={}){
  const maki=String(properties.maki||properties.maki_beta||'').toLowerCase().trim();
  if(MAKI_TYPES[maki])return MAKI_TYPES[maki];
  const type=String(properties.type||'').toLowerCase().trim();
  const cls=String(properties.class||'').toLowerCase().trim();
  if(type==='hospital')return MAKI_TYPES.hospital;
  if(type==='fuel'||type==='petrol station')return MAKI_TYPES.fuel;
  if(type==='police')return MAKI_TYPES.police;
  if(type==='fire station')return MAKI_TYPES['fire-station'];
  if(type==='parking')return MAKI_TYPES.parking;
  if(type==='pharmacy'||type==='clinic'||type==='doctor')return MAKI_TYPES.doctor;
  if(cls==='medical'&&/hospital|clinic|doctor|health|emergency/.test(type))
    return MAKI_TYPES.doctor;
  return null;
}
export function normalizeMapboxPois(features=[],max=360){
  const result=[],seen=new Set();
  for(const feature of features){
    if(feature?.geometry?.type!=='Point')continue;
    const coords=feature.geometry.coordinates;
    if(!Array.isArray(coords)||coords.length<2||!coords.slice(0,2).every(Number.isFinite))continue;
    const [lng,lat]=coords;if(Math.abs(lng)>180||Math.abs(lat)>85)continue;
    const kind=classifyMapboxPoi(feature.properties);
    if(!kind)continue;
    const title=clean(feature.properties?.name)||kind[2];
    const id='mapbox-poi-'+kind[0]+'-'+lng.toFixed(5)+'-'+lat.toFixed(5);
    if(seen.has(id))continue;seen.add(id);
    result.push({id,type:kind[0],coords:[lng,lat],priority:kind[1],
      name:title,description:'Ponto de interesse no mapa',source:'Mapbox Streets',
      sourceId:String(feature.id||'').slice(0,32),verified:false});
    if(result.length>=max)break;
  }
  return result.sort((a,b)=>b.priority-a.priority);
}
const ROAD_POINT_TYPES=Object.freeze({
 traffic_signals:['semaforo',88,'Semáforo'],
 level_crossing:['ferrovia',78,'Passagem de nível'],
 roundabout:['rotatoria',59,'Rotatória'],
 mini_roundabout:['rotatoria',59,'Mini-rotatória']
});
export function classifyMapboxRoadPoint(properties={}){
 const roadClass=String(properties.class||'').toLowerCase().trim();
 const roadType=String(properties.type||'').toLowerCase().trim();
 return ROAD_POINT_TYPES[roadClass]||ROAD_POINT_TYPES[roadType]||null;
}
export function normalizeMapboxRoadSignals(features=[],max=460){
 const items=[],seen=new Set();
 for(const feature of features){
  if(feature?.geometry?.type!=='Point')continue; // Never mark a whole road line as a signal.
  const coords=feature.geometry.coordinates;
  if(!Array.isArray(coords)||coords.length<2||!coords.slice(0,2).every(Number.isFinite))continue;
  const [lon,lat]=coords;
  if(Math.abs(lon)>180||Math.abs(lat)>85)continue;
  const kind=classifyMapboxRoadPoint(feature.properties||{});
  if(!kind)continue;
  const id='mapbox-road-'+kind[0]+'-'+lon.toFixed(5)+'-'+lat.toFixed(5);
  if(seen.has(id))continue;seen.add(id);
  items.push({id,type:kind[0],coords:[lon,lat],priority:kind[1],
   name:kind[2],description:'Sinalização cadastrada no mapa',source:'Mapbox Streets',
   sourceId:String(feature.id||'').slice(0,32),verified:false});
  if(items.length>=max)break;
 }
 return items.sort((a,b)=>b.priority-a.priority);
}
export function readMapboxPoiFeatures(map){
  if(typeof map?.querySourceFeatures!=='function'||typeof map?.getStyle!=='function')return [];
  try{
    const sources=map.getStyle()?.sources||{};
    const names=Object.entries(sources).filter(([_,value])=>
      value?.type==='vector'&&/mapbox-streets-v8/i.test(String(value.url||''))).map(([name])=>name);
    const poiFeatures=[],roadFeatures=[];
    for(const source of names){
      try{
        const matches=map.querySourceFeatures(source,{
          sourceLayer:'road',
          filter:['in',['get','class'],['literal',['traffic_signals','level_crossing','roundabout','mini_roundabout']]]
        });
        roadFeatures.push(...matches.slice(0,1300));
      }catch{
        // Some style versions reject expression filters on source queries;
        // fall back to locally classifying actual Point features, never
        // silently dropping all the traffic lights.
        try{
          const all=map.querySourceFeatures(source,{sourceLayer:'road'});
          for(const feature of all){
            if(feature?.geometry?.type==='Point'&&classifyMapboxRoadPoint(feature.properties)){
              roadFeatures.push(feature);
              if(roadFeatures.length>=1300)break;
            }
          }
        }catch{/* Source tile not loaded yet; idle event retries. */}
      }
      try{poiFeatures.push(...map.querySourceFeatures(source,{sourceLayer:'poi_label'}).slice(0,1600));}
      catch{/* POI vector tiles may not have loaded yet. Retry on camera idle. */}
    }
    // Important road signage goes first; POIs remain available even when
    // external Overpass is down.
    return [...normalizeMapboxRoadSignals(roadFeatures),...normalizeMapboxPois(poiFeatures)];
  }catch{return [];}
}
