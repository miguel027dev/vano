/** Map layers. Never use volunteer-run OpenStreetMap tile servers for production imagery.
 * OSM data and OSM's tile hosting are separate products. Mapbox serves the
 * licensed static raster tiles if GL/WebGL cannot render; Esri is an emergency
 * fallback already used for satellite imagery in this project.
 */
export const MAPBOX_STYLES=Object.freeze({
  streets:'mapbox://styles/mapbox/streets-v12',
  satellite:'mapbox://styles/mapbox/satellite-streets-v12',
  dark:'mapbox://styles/mapbox/dark-v11',
});
const CREDITS_MAPBOX='© Mapbox © OpenStreetMap contributors';
const CREDITS_ESRI='Tiles © Esri — Sources: Esri and the GIS User Community';
export const LEAFLET_TILES=Object.freeze({
  streets:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',attribution:CREDITS_ESRI,tileSize:256,zoomOffset:0,maxNativeZoom:19},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attribution:CREDITS_ESRI,tileSize:256,zoomOffset:0,maxNativeZoom:19},
});
export const normalizedMapLayer=layer=>layer==='satellite'?'satellite':'streets';
// A local copy works before publication in Mapbox Studio.
export const VANO_ATLAS_STYLE='/mapbox/vano-atlas-light.json';
export const mapboxStyleFor=(layer,customStreetsStyle='',appearance='light')=>normalizedMapLayer(layer)==='satellite'
  ? MAPBOX_STYLES.satellite
  : appearance==='dark'?MAPBOX_STYLES.dark:customStreetsStyle || MAPBOX_STYLES.streets;
export const leafletBackupTilesFor=layer=>LEAFLET_TILES[normalizedMapLayer(layer)];
// 512px raster tiles require zoomOffset -1 in Leaflet's 256px coordinate scheme.
// Never expose anything except the existing public (pk.) token in the browser.
export function leafletTilesFor(layer,publicToken='',appearance='light'){
  const token=String(publicToken||'').trim();
  if(!token.startsWith('pk.'))return leafletBackupTilesFor(layer);
  const style=normalizedMapLayer(layer)==='satellite'?'satellite-streets-v12':appearance==='dark'?'dark-v11':'streets-v12';
  return {
    url:`https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`,
    attribution:CREDITS_MAPBOX,tileSize:512,zoomOffset:-1,maxNativeZoom:20
  };
}
