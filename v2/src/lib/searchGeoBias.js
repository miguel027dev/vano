/** A search hint ranks real provider results; it never filters countries.
 * Only a fresh authorized fix describes the device. A deliberately selected
 * map area/manual origin may guide search without pretending to be GPS.
 */
const pointOK=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
export function searchGeoBias(coords,{gpsGranted=false,manual=false,fixAt,now=Date.now(),viewport=null,manualCoords=null}={}){
 const fresh=Number.isFinite(fixAt)&&fixAt>0&&now>=fixAt&&now-fixAt<=60000;
 const point=gpsGranted&&!manual&&fresh&&pointOK(coords)?coords:
  pointOK(manualCoords)?manualCoords:pointOK(viewport)?viewport:null;
 if(!point)return '';
 const [lon,lat]=point;
 return '&lng='+encodeURIComponent((Math.round(lon*100)/100).toFixed(2))+
  '&lat='+encodeURIComponent((Math.round(lat*100)/100).toFixed(2));
}
