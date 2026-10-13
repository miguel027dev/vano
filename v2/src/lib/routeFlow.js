/** VANO static route markers — decorative highlights never move independently
 * of the route. Mapbox dash units are relative to the overlay line width.
 */
export const STATIC_ROUTE_DASH_PATTERN=Object.freeze([4,10]);
export const STATIC_LEAFLET_DASH='8 20';

export function sameRouteShapeReferences(previous,next){
  return Array.isArray(previous)&&Array.isArray(next)&&previous.length===next.length
    &&previous.every((geometry,index)=>geometry===next[index]);
}
