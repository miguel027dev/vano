/** Read already-loaded Mapbox Streets v8 POI vector tiles for IN-MAP fallback.
 * Uses existing style sources, sends no location to an additional endpoint,
 * and never invents radar/traffic-control points not present in the dataset.
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
export function normalizeMapboxPois(features=[],max=125){
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
export function readMapboxPoiFeatures(map){
  if(typeof map?.querySourceFeatures!=='function'||typeof map?.getStyle!=='function')return [];
  try{
    if(typeof map.isStyleLoaded==='function'&&!map.isStyleLoaded())return [];
    const sources=map.getStyle()?.sources||{};
    const names=Object.entries(sources).filter(([_,value])=>
      value?.type==='vector'&&/mapbox-streets-v8/i.test(String(value.url||''))).map(([name])=>name);
    const features=[];
    for(const source of names){
      try{features.push(...map.querySourceFeatures(source,{sourceLayer:'poi_label'}).slice(0,900));}
      catch{/* Style source may not have loaded its POI tiles yet. */}
    }
    return normalizeMapboxPois(features);
  }catch{return [];}
}
