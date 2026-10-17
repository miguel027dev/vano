/** Map layers are explicit and never confuse contour/topographic maps with satellite imagery. */
export const MAPBOX_STYLES=Object.freeze({
  streets:'mapbox://styles/mapbox/streets-v12',
  satellite:'mapbox://styles/mapbox/satellite-streets-v12',
});
export const LEAFLET_TILES=Object.freeze({
  streets:{url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors'},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles © Esri, Maxar, Earthstar Geographics and GIS User Community'},
});
export const normalizedMapLayer=layer=>layer==='satellite'?'satellite':'streets';
// A local copy works before publication in Mapbox Studio.
export const VANO_ATLAS_STYLE='/mapbox/vano-atlas-light.json';
export const mapboxStyleFor=(layer,customStreetsStyle='')=>normalizedMapLayer(layer)==='satellite'
  ? MAPBOX_STYLES.satellite
  : customStreetsStyle || MAPBOX_STYLES.streets;
export const leafletTilesFor=layer=>LEAFLET_TILES[normalizedMapLayer(layer)];
