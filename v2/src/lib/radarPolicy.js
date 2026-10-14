/** Country-level speed-camera display controls.
 * The polygons are simplified Natural Earth 1:110m public-domain outlines.
 * Conservative policy: exact camera pins are withheld in FR, DE and CH until
 * a country-specific legally reviewed product mode exists.
 * This is NOT a complete legal database or a road-border enforcement engine.
 *
 * Official references:
 * https://www.service-public.fr/particuliers/vosdroits/F19459
 * https://www.gesetze-im-internet.de/stvo_2013/__23.html
 * https://www.bazg.admin.ch/en/radar-detectors-banned-switzerland
 */
const RESTRICTED={
 FR:[
 [[-51.658,4.156],[-52.556,2.505],[-52.940,2.125],[-53.418,2.053],[-53.555,2.335],[-53.779,2.377],[-54.088,2.106],[-54.525,2.312],[-54.007,3.620],[-54.400,4.213],[-54.479,4.897],[-53.958,5.757],[-52.882,5.410],[-51.823,4.566],[-51.658,4.156]],
 [[5.898,49.443],[6.658,49.202],[8.099,49.018],[7.594,48.333],[7.467,47.621],[7.192,47.450],[6.737,47.542],[6.769,47.288],[6.037,46.726],[6.023,46.273],[6.500,46.430],[6.844,45.991],[6.802,45.709],[7.097,45.333],[6.750,45.029],[7.008,44.255],[7.550,44.128],[7.435,43.694],[6.529,43.129],[4.557,43.400],[3.100,43.075],[2.986,42.473],[1.827,42.343],[0.702,42.796],[0.338,42.580],[-1.503,43.034],[-1.901,43.423],[-1.384,44.023],[-1.194,46.015],[-2.963,47.570],[-4.492,47.955],[-4.592,48.684],[-3.296,48.902],[-1.617,48.644],[-1.933,49.776],[-0.989,49.347],[1.339,50.127],[1.639,50.947],[2.514,51.149],[2.658,50.797],[3.123,50.780],[4.286,49.907],[4.799,49.985],[5.898,49.443]],
 [[8.746,42.628],[9.390,43.010],[9.560,42.152],[9.230,41.380],[8.776,41.584],[8.544,42.257],[8.746,42.628]]
 ],
 DE:[
 [[14.120,53.757],[14.353,53.248],[14.075,52.981],[14.438,52.625],[14.685,52.090],[14.607,51.745],[15.017,51.107],[14.571,51.002],[14.307,51.117],[12.240,50.266],[12.521,49.547],[13.596,48.877],[13.243,48.416],[12.884,48.289],[12.933,47.468],[12.141,47.703],[11.426,47.524],[10.545,47.566],[10.402,47.302],[9.896,47.580],[8.523,47.831],[8.317,47.614],[7.467,47.621],[7.594,48.333],[8.099,49.018],[6.658,49.202],[6.186,49.464],[6.243,49.902],[6.043,50.128],[6.157,50.804],[5.989,51.852],[6.589,51.852],[6.843,52.228],[7.092,53.144],[6.905,53.482],[7.100,53.694],[7.936,53.748],[8.122,53.528],[8.801,54.021],[8.572,54.396],[8.526,54.963],[9.282,54.831],[9.922,54.983],[9.940,54.597],[10.950,54.364],[10.939,54.009],[12.518,54.470],[14.120,53.757]]
 ],
 CH:[
 [[9.594,47.525],[9.480,47.103],[10.443,46.894],[10.363,46.484],[9.923,46.315],[9.183,46.440],[8.966,46.037],[8.490,46.005],[8.317,46.164],[7.756,45.824],[7.274,45.777],[6.844,45.991],[6.500,46.430],[6.023,46.273],[6.037,46.726],[6.769,47.288],[6.737,47.542],[7.192,47.450],[7.467,47.621],[8.317,47.614],[8.523,47.831],[9.594,47.525]]
 ]
};
function inPolygon(lon,lat,points){
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])
   inside=!inside;
 }
 return inside;
}
export function radarRestrictedRegion(coords){
 if(!Array.isArray(coords)||!coords.every(Number.isFinite))return null;
 const [lon,lat]=coords;
 for(const [country,polygons]of Object.entries(RESTRICTED)){
  if(polygons.some(poly=>inPolygon(lon,lat,poly)))return country;
 }
 return null;
}
export function radarDisplayAllowed(coords){return !radarRestrictedRegion(coords);}
export function radarFullyRestrictedBBox([w,s,e,n]){
 const corners=[[w,s],[e,s],[w,n],[e,n],[(w+e)/2,(s+n)/2]];
 const c=radarRestrictedRegion(corners[0]);
 return Boolean(c)&&corners.every(coords=>radarRestrictedRegion(coords)===c);
}
