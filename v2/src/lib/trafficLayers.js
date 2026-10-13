/** VANO Traffic v1 — independent, GPU-rendered road-condition overlay.
 * Source: Mapbox Traffic v1 (updated approx. every 8 minutes by the provider).
 * NO guessed speeds, no traffic lines from static satellite images.
 * Custom/municipal GeoJSON can be normalized with trafficProviders.js separately.
 */
export const TRAFFIC_SOURCE_ID='vano-live-traffic';
export const TRAFFIC_TILESET='mapbox://mapbox.mapbox-traffic-v1';
export const TRAFFIC_PALETTE=Object.freeze({
 free:'#20B486',moderate:'#E8B04C',heavy:'#DF625C'
});
export const TRAFFIC_ZOOM_CATEGORIES=Object.freeze([
 {key:'major',id:'vano-traffic-major',minzoom:8.5,classes:['motorway','motorway_link','trunk','trunk_link','primary','primary_link']},
 {key:'connector',id:'vano-traffic-connectors',minzoom:11.5,classes:['secondary','tertiary','link']},
 {key:'street',id:'vano-traffic-streets',minzoom:14,classes:['street','service']}
]);
export const TRAFFIC_LAYER_IDS=TRAFFIC_ZOOM_CATEGORIES.map(x=>x.id);
// Low/free-flow segments are intentionally NOT drawn. Leave roads uncolored.
export const TRAFFIC_CONGESTION=['moderate','heavy','severe'];
export const trafficColor=[
 'match',['get','congestion'],
 'moderate',TRAFFIC_PALETTE.moderate,
 'heavy',TRAFFIC_PALETTE.heavy,
 'severe',TRAFFIC_PALETTE.heavy,
 'rgba(0,0,0,0)'
];
export function trafficLayerSpec({id,minzoom,classes}){
 return {
  id,type:'line',source:TRAFFIC_SOURCE_ID,'source-layer':'traffic',minzoom,
  filter:['all',
   ['in',['get','congestion'],['literal',TRAFFIC_CONGESTION]],
   ['in',['get','class'],['literal',classes]],
   ['!=',['get','closed'],'yes']
  ],
  layout:{visibility:'visible','line-cap':'round','line-join':'round'},
  paint:{
   'line-color':trafficColor,
   'line-width':['interpolate',['linear'],['zoom'],8,1.4,11,1.8,14,2.5,17,3.4,20,4],
   'line-opacity':['interpolate',['linear'],['zoom'],9,.75,14,.85,18,.88],
   // Delicate directional offset, not a second thick line on the road.
   'line-offset':['interpolate',['linear'],['zoom'],8,.35,12,.6,16,1.1,20,1.6]
  }
 };
}
export function firstLabelLayer(map){
 try{return map.getStyle()?.layers?.find(layer=>layer.type==='symbol')?.id;}catch{return undefined;}
}
export function ensureTrafficLayers(map,{enabled=true,onStatus}={}){
 if(!map||typeof map.getSource!=='function'||typeof map.addSource!=='function')return false;
 try{
  if(typeof map.isStyleLoaded==='function'&&!map.isStyleLoaded())return false;
  if(!map.getSource(TRAFFIC_SOURCE_ID))
   map.addSource(TRAFFIC_SOURCE_ID,{type:'vector',url:TRAFFIC_TILESET});
  const before=firstLabelLayer(map);
  for(const group of TRAFFIC_ZOOM_CATEGORIES){
   if(!map.getLayer(group.id)){
    const layer=trafficLayerSpec(group);
    // Text labels remain ABOVE road strokes, while orange route layers
    // are created separately after the traffic overlay.
    map.addLayer(layer,before&&map.getLayer(before)?before:undefined);
   }
  }
  setTrafficVisibility(map,enabled);
  onStatus?.('available');
  return true;
 }catch(error){
  // A missing tileset entitlement must not break roads, route layers or GPS.
  onStatus?.('unavailable');
  console.warn('VANO Traffic source unavailable:',error?.message||String(error));
  return false;
 }
}
export function setTrafficVisibility(map,enabled){
 if(!map||typeof map.getLayer!=='function')return;
 const visibility=enabled?'visible':'none';
 for(const id of TRAFFIC_LAYER_IDS){
  if(map.getLayer(id)&&typeof map.setLayoutProperty==='function')
   map.setLayoutProperty(id,'visibility',visibility);
 }
}
