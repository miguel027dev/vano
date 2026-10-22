/** Export VANO V2 PostGIS aggregated directional profiles as a validated JSON
 * snapshot. Execute as a scheduled, restricted job; never on route requests.
 * Usage: DATABASE_URL=... node scripts/traffic-memory-export-pg.mjs /path/to/snapshot.json
 */
import {Client} from 'pg';
import {writeFile,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildTrafficMemory} from '../server/traffic-memory.mjs';
const output=process.argv[2];
if(!output||!process.env.DATABASE_URL){
 console.error('DATABASE_URL and output path required.');
 process.exit(2);
}
const raw=process.env.DATABASE_URL.replace(/^postgres(?:ql)?\+[a-z0-9_-]+:\/\//i,'postgresql://');
if(!/^postgres(?:ql)?:\/\//i.test(raw))throw Error('Expected PostgreSQL connection URL.');
const uri=new URL(raw);
if(uri.searchParams.get('sslmode')==='require'&&!uri.searchParams.has('uselibpqcompat'))
 uri.searchParams.set('uselibpqcompat','true');
const client=new Client({connectionString:uri.toString(),connectionTimeoutMillis:8000,
 query_timeout:15000,application_name:'vano-v2-traffic-export'});
let records=[];
try{
 await client.connect();
 const result=await client.query(`
  SELECT p.segment_id AS id,
   (ST_AsGeoJSON(e.geometry)::jsonb -> 'coordinates') AS coordinates,
   p.weekday AS weekday,p.quarter AS quarter,
   p.speed_kmh AS speed,p.free_flow_kmh AS free_flow,p.samples AS samples,
   p.last_observed_at AS observed,p.source AS source,
   p.license_verified AS license_verified
  FROM vano_v2.traffic_profiles p
  JOIN vano_v2.traffic_edges e ON e.id=p.segment_id
  WHERE p.license_verified=TRUE
    AND p.last_observed_at > now()-interval '60 days'
  ORDER BY p.last_observed_at DESC LIMIT 20001`);
 if(result.rows.length>20000)throw Error('Profile limit exceeded. Partition the export by region.');
 records=result.rows.map(r=>({
  id:r.id,coordinates:r.coordinates,weekday:Number(r.weekday),quarter:Number(r.quarter),
  speedKmh:Number(r.speed),freeFlowKmh:Number(r.free_flow),samples:Number(r.samples),
  lastObservedAt:new Date(r.observed).toISOString(),source:r.source,
  licenseVerified:r.license_verified===true,directionVerified:true
 }));
}finally{try{await client.end();}catch{}}
const validated=buildTrafficMemory({records});
if(validated.recordCount!==records.length)throw Error('Rejected malformed or stale profile. Snapshot not replaced.');
const target=resolve(output),tmp=target+'.tmp-'+process.pid;
try{
 await writeFile(tmp,JSON.stringify({records}),{mode:0o600,flag:'wx'});
 await rename(tmp,target);
 console.log(JSON.stringify({ok:true,profiles:validated.recordCount,sources:validated.sourceCount}));
}catch(e){await unlink(tmp).catch(()=>{});throw e;}
