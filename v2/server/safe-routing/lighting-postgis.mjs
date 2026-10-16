/** Read-only PostGIS inspection of approved GeoSampa inventory.
 * Informational ONLY: proximity of a fixture != lit street or a safe route.
 */
import {pointOK} from '../routing.mjs';
const MAX_VERTICES=6500,MAX_ROUTES=4;
export function routeLineJson(route){
 const coords=route?.geometry?.coordinates;
 if(route?.geometry?.type!=='LineString'||!Array.isArray(coords)||
    coords.length<2||coords.length>MAX_VERTICES)throw Error('Geometria de rota inválida');
 if(coords.some(point=>!pointOK(point)||point[0]<-46.98||point[0]>-46.2||
  point[1]<-24.11||point[1]>-23.23))throw Error('Trajeto fora da área piloto');
 return JSON.stringify({type:'LineString',coordinates:coords});
}
export async function inspectApprovedRouteLighting(routes,{client,limitMs=800}={}){
 if(!client||typeof client.query!=='function')throw Error('Cliente espacial não configurado');
 if(!Array.isArray(routes)||!routes.length||routes.length>MAX_ROUTES)throw Error('Limite de rotas inválido');
 if(!Number.isInteger(limitMs)||limitMs<50||limitMs>2000)throw Error('Limite de consulta inválido');
 const descriptions=routes.map(r=>({id:String(r.id),geometry:routeLineJson(r)}));
 const approved=await client.query({text:
  `SELECT a.snapshot_id,s.source_updated_at,s.collected_at
   FROM vano_safe.approved_dataset a
   JOIN vano_safe.source_snapshots s ON s.snapshot_id=a.snapshot_id
   WHERE a.dataset_name='geosampa-lighting'
    AND s.status='approved' AND s.license_reviewed=true AND s.approved_at IS NOT NULL`,query_timeout:limitMs
 });
 if(approved.rowCount!==1)return {available:false,reason:'no-fully-approved-snapshot',results:[]};
 const snapshot=approved.rows[0];
 const results=[];
 for(const r of descriptions){
  // PostGIS runs in a transaction with a time cap set on the dedicated read-only role.
  const sql=`
   WITH line AS (
    SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),31983) AS geom
   ), sample AS (
    SELECT ST_LineInterpolatePoint(line.geom,
      LEAST(1.0,i::float/GREATEST(1,LEAST(200,CEIL(ST_Length(line.geom)/40.0)))))
      AS p
    FROM line
    CROSS JOIN LATERAL generate_series(0,
      LEAST(200,CEIL(ST_Length(line.geom)/40.0)::integer)) AS i
   )
   SELECT COUNT(*)::int AS samples,
     COALESCE(SUM(CASE WHEN EXISTS (
      SELECT 1 FROM vano_safe.public_lights_staging l
      WHERE l.snapshot_id=$2
       AND ST_DWithin(l.geom::geography,ST_Transform(sample.p,4326)::geography,35)
     ) THEN 1 ELSE 0 END),0)::int AS near_points
   FROM sample`;
  const query=await client.query({text:sql,values:[r.geometry,snapshot.snapshot_id],query_timeout:limitMs});
  const row=query.rows[0]||{};
  const samples=Number(row.samples)||0,near=Number(row.near_points)||0;
  results.push({id:r.id,fixtureProximityFraction:samples>0?+(near/samples).toFixed(4):null,
   assessedSampleCount:samples,sourceSnapshot:snapshot.snapshot_id,
   evidenceType:'public-light-fixture-inventory',verifiedSafety:false,
   functioningLightsConfirmed:false,visibilityConfirmed:false,
   suitableForAutomaticRanking:false});
 }
 return {available:true,results,sourceDate:snapshot.source_updated_at??null,
  collectedAt:snapshot.collected_at??null,
  warning:'Inventário cadastral de postes; associação à rua e funcionamento NÃO confirmados.'};
}
