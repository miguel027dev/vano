/** Mapbox Geocoding v6 reverse results, stripped to user-facing address fields.
 * Nothing is stored: do not log raw coordinates or share navigation traces.
 */
export function normalizedReverseAddress(payload){
  const features=Array.isArray(payload?.features)?payload.features:[];
  const first=features.find(f=>f?.properties?.feature_type==='address')||features.find(f=>f?.properties?.feature_type==='street')||features[0];
  if(!first)return null;
  const props=first.properties||{},context=props.context||{};
  const primary=String(props.name||props.name_preferred||context.street?.name||'').trim();
  const number=String(props.address_number||'').trim();
  let street=primary;
  if(number&&!street.includes(number))street=street?street+', '+number:number;
  const district=String(context.neighborhood?.name||context.locality?.name||'').trim();
  const city=String(context.place?.name||context.region?.name||'').trim();
  const detail=[district,city].filter((x,i,a)=>x && a.indexOf(x)===i).join(' · ');
  const full=String(props.full_address||props.place_formatted||'').trim();
  if(!street)street=full.split(',').slice(0,2).join(',').trim();
  if(!street)return null;
  return {street:street.slice(0,110),detail:detail.slice(0,105),provider:'mapbox'};
}
export function parseReverseCoords(searchParams){
  const rawLon=searchParams.get('longitude'),rawLat=searchParams.get('latitude');
  if(rawLon===null||rawLat===null||rawLon===''||rawLat==='')return null;
  const lon=Number(rawLon),lat=Number(rawLat);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon < -180||lon > 180||lat < -90||lat > 90)return null;
  return {lon:Math.round(lon*100000)/100000,lat:Math.round(lat*100000)/100000};
}
