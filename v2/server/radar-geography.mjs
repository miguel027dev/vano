/** Conservative Brazil interior for radar query routing.
 * Based on Natural Earth 1:110m public-domain country outlines, inset ~20 km,
 * then simplified. Border/coastal areas deliberately fall through to OSM so
 * a rough boundary NEVER prevents foreign radar discovery.
 * This is only an optimization: it is not a legal country classifier.
 */
const BRAZIL_CORE=[
[-64.182,3.868],[-63.036,3.579],[-60.868,4.363],[-60.289,5.037],[-59.773,3.983],[-60.175,2.755],[-59.827,1.701],[-58.541,1.068],[-57.278,1.737],[-55.908,1.638],[-55.842,2.277],[-52.869,1.938],[-51.438,3.985],[-50.684,1.805],[-50.168,1.587],[-50.874,0.125],[-48.814,-0.419],[-48.690,-1.407],[-47.776,-0.804],[-45.025,-1.721],[-44.644,-2.881],[-43.419,-2.590],[-40.028,-3.074],[-37.326,-4.993],[-35.413,-5.576],[-34.936,-7.346],[-35.313,-8.908],[-38.853,-12.969],[-39.456,-17.784],[-41.126,-21.808],[-42.125,-22.770],[-44.716,-23.164],[-47.789,-24.742],[-48.687,-25.819],[-49.050,-28.547],[-53.308,-33.447],[-53.014,-32.684],[-53.647,-31.905],[-57.055,-29.920],[-53.509,-27.067],[-53.429,-26.111],[-54.298,-25.398],[-54.118,-23.925],[-55.247,-23.774],[-55.654,-22.218],[-57.729,-21.925],[-57.904,-20.243],[-57.299,-18.160],[-58.111,-17.134],[-58.082,-16.179],[-60.013,-16.061],[-60.378,-13.620],[-64.232,-12.272],[-65.191,-11.482],[-65.234,-9.591],[-66.711,-9.742],[-68.375,-10.819],[-70.099,-10.916],[-70.347,-9.342],[-72.079,-9.857],[-72.918,-9.288],[-73.735,-7.592],[-72.938,-6.712],[-72.709,-5.398],[-69.714,-4.386],[-69.221,-1.112],[-69.817,0.391],[-69.139,0.438],[-69.019,0.988],[-69.613,1.512],[-67.545,1.741],[-66.419,0.547],[-65.472,0.604],[-63.186,2.119],[-63.326,2.586],[-64.106,2.681],[-64.182,3.868]
];
const BR_BOUNDS=[-74.1,-33.9,-34.6,5.4];
export function overlapsBrazilBounds([w,s,e,n]){
 return e>BR_BOUNDS[0]&&w<BR_BOUNDS[2]&&n>BR_BOUNDS[1]&&s<BR_BOUNDS[3];
}
function insideCore(x,y){
 let inside=false;
 for(let i=0,j=BRAZIL_CORE.length-1;i<BRAZIL_CORE.length;j=i++){
  const a=BRAZIL_CORE[i],b=BRAZIL_CORE[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])
   inside=!inside;
 }
 return inside;
}
/** Skip external queries only where the entire viewport is safely in Brazil. */
export function entirelyBrazilCore([w,s,e,n]){
 if(!overlapsBrazilBounds([w,s,e,n]))return false;
 // The viewport is small (validated by parseBBox); sample the center and edges.
 return [[w,s],[e,s],[w,n],[e,n],[(w+e)/2,(s+n)/2],
  [(w+e)/2,s],[(w+e)/2,n],[w,(s+n)/2],[e,(s+n)/2]]
  .every(([x,y])=>insideCore(x,y));
}
