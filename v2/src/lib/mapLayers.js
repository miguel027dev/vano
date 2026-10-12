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
export const mapboxStyleFor=layer=>MAPBOX_STYLES[normalizedMapLayer(layer)];
export const leafletTilesFor=layer=>LEAFLET_TILES[normalizedMapLayer(layer)];
