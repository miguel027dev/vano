/**
 * One-time VANO V1 -> V2 PostgreSQL migration (dry-run by default).
 * Reads V1 tables, writes ONLY the isolated vano_v2_state row, and
 * refuses automatic email collisions to prevent account takeovers.
 * No secrets, passwords or email addresses are printed in logs.
 */
import { emptyData } from '../server/storage.mjs';

const supportedLocales = new Set(['pt-BR','pt-PT','fr-FR','en-US','es-ES','ru-RU']);
const scrub = (value, max=100) => String(value ?? '').trim().slice(0,max);
const validCoords = (lon,lat) => Number.isFinite(Number(lon)) && Number.isFinite(Number(lat)) && Number(lon) >= -180 && Number(lon) <= 180 && Number(lat) >= -90 && Number(lat) <= 90;
const date = v => !v || Number.isNaN(Date.parse(v)) ? new Date().toISOString() : new Date(v).toISOString();
const mode = v => /^(fast|fastest|quick|rapida)$/i.test(String(v||'')) ? 'fast' : 'safe';
const legId = x => 'v1:' + Number(x).toString(36);
const incident = x => ({traffic:'transito',congestion:'transito',roadworks:'obra',construction:'obra',accident:'acidente',hazard:'risco',danger:'risco',radar:'radar'})[String(x||'').toLowerCase()]||'risco';

export function transformLegacy(state, legacy) {
  const data = structuredClone(state);
  const original = JSON.stringify(state);
  const existing = new Map(data.users.map(u => [String(u.email||'').toLowerCase(),u]));
  const userMap = new Map();
  const result = {users:0,inactive:0,collisions:0,favorites:0,history:0,reports:0,routines:0,invalid:0};
  for (const u of legacy.users) {
    if (!u.is_active) { result.inactive++; continue; }
    const email = String(u.email||'').trim().toLowerCase();
    if (!email || !email.includes('@')) {result.invalid++;continue;}
    const v2Id = legId(u.id);
    const preexisting = existing.get(email);
    if (preexisting && preexisting.id!==v2Id) {result.collisions++;continue;}
    userMap.set(Number(u.id),v2Id);
    if (preexisting) continue;
    const linkedGoogle = Boolean(u.google_sub);
    const newUser = {
      id:v2Id,name:scrub(u.name,80)||'Usuário VANO',email,
      passwordHash:String(u.password_hash||''),
      createdAt:date(u.created_at),
      verifiedAt:linkedGoogle?date(u.last_login_at||u.created_at):null,
      verificationMethod:linkedGoogle?'google':'legacy_pending',
      ...(linkedGoogle?{googleSub:String(u.google_sub)}:{})
    };
    data.users.push(newUser);existing.set(email,newUser);result.users++;
    if (!data.preferences.some(p=>p.owner===v2Id)) {
      const language=supportedLocales.has(u.locale)?u.locale:'pt-BR';
      data.preferences.push({owner:v2Id,language,languageConfirmed:true,
        vehicle:'carro',preferredRoute:mode(u.route_preference),theme:'light',
        alerts:true,routineTags:[],onboardingComplete:Boolean(u.onboarding_completed_at)});
    }
  }
  const owner = item => userMap.get(Number(item.user_id));
  for (const x of legacy.places) {
    const id=owner(x);if(!id)continue;
    if (!validCoords(x.longitude,x.latitude)) {result.invalid++;continue;}
    const unique='legacy-place-'+x.id;
    if (data.favorites.some(f=>f.id===unique && f.owner===id))continue;
    data.favorites.push({id:unique,owner:id,name:scrub(x.name||x.label,90)||'Lugar salvo',
      address:scrub(x.label,180),category:'salvo',coords:[Number(x.longitude),Number(x.latitude)],createdAt:date(x.created_at)});
    result.favorites++;
  }
  for (const x of legacy.history) {
    const id=owner(x);if(!id)continue;
    if (!validCoords(x.destination_lon,x.destination_lat) || !Number.isFinite(Number(x.duration_s)) || !Number.isFinite(Number(x.distance_m))) {result.invalid++;continue;}
    const unique='legacy-trip-'+x.id;
    if (data.history.some(h=>h.id===unique && h.owner===id))continue;
    const duration=Math.max(1,Math.round(Number(x.duration_s)/60));
    const distance=Math.round(Number(x.distance_m)/100)/10;
    if(duration>10080 || distance<=0 || distance>3000){result.invalid++;continue;}
    data.history.push({id:unique,owner:id,destination:{name:scrub(x.destination_label,100)||'Destino',
      address:'',coords:[Number(x.destination_lon),Number(x.destination_lat)]},
      duration,distance,routeType:mode(x.mode),createdAt:date(x.created_at)});
    result.history++;
  }
  for (const x of legacy.reports) {
    const id=owner(x);if(!id)continue;
    if(!validCoords(x.longitude,x.latitude)){result.invalid++;continue;}
    const unique='legacy-report-'+x.id;
    if(data.reports.some(r=>r.id===unique && r.owner===id))continue;
    data.reports.push({id:unique,owner:id,type:incident(x.category),
      description:scrub(x.description||x.title,280),coords:[Number(x.longitude),Number(x.latitude)],
      status:'nao_verificado',createdAt:date(x.created_at)});
    result.reports++;
  }
  for(const x of legacy.routines){
    const id=owner(x);if(!id)continue;
    const unique='legacy-routine-'+x.id;
    if(data.routines.some(z=>z.id===unique && z.owner===id))continue;
    const time=String(x.departure_time||'').slice(0,5);
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){result.invalid++;continue;}
    data.routines.push({id:unique,owner:id,name:scrub('Dia '+x.weekday+' · '+x.label,80),
      destination:scrub(x.label,80)||'Local salvo',time,createdAt:date(x.created_at),
      legacyWeekday:Number(x.weekday),legacyCoords:validCoords(x.longitude,x.latitude)?[Number(x.longitude),Number(x.latitude)]:null});
    result.routines++;
  }
  if (Buffer.byteLength(JSON.stringify(data))>64*1024*1024) throw Error('Migration exceeds the V2 64MB state limit.');
  if (result.collisions) throw Error('Identity collision detected ('+result.collisions+'). No changes applied. Require manual verified account linking.');
  return {data,summary:result,changed:JSON.stringify(data)!==original};
}

async function run(){
  const apply=process.argv.includes('--apply');
  if(apply && process.env.VANO_IMPORT_V1_APPROVED!=='1')throw Error('Apply requires VANO_IMPORT_V1_APPROVED=1.');
  if(apply && process.env.VANO_PG_BACKUP_VERIFIED!=='1')throw Error('Apply requires a tested PostgreSQL backup: VANO_PG_BACKUP_VERIFIED=1.');
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL not configured.');
  const { Client } = await import('pg');
  const client = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:30000});
  await client.connect();
  try{
    await client.query('BEGIN'+(apply?'':' READ ONLY'));
    const sqls={
      users:'SELECT id,name,email,password_hash,google_sub,locale,is_active,created_at,last_login_at,route_preference,onboarding_completed_at FROM public.users ORDER BY id LIMIT 100000',
      places:'SELECT id,user_id,name,label,latitude,longitude,created_at FROM public.saved_places ORDER BY id LIMIT 100000',
      history:'SELECT id,user_id,destination_label,destination_lat,destination_lon,mode,distance_m,duration_s,created_at FROM public.route_history ORDER BY id LIMIT 100000',
      reports:'SELECT id,user_id,category,title,description,latitude,longitude,created_at FROM public.reports ORDER BY id LIMIT 100000',
      routines:'SELECT id,user_id,weekday,label,latitude,longitude,departure_time,created_at FROM public.weekly_routines ORDER BY id LIMIT 100000'
    };
    const legacy={};for(const [key,sql] of Object.entries(sqls))legacy[key]=(await client.query(sql)).rows;
    const table=await client.query("SELECT to_regclass('public.vano_v2_state') AS existing");
    let state=emptyData(),revision=0;
    if(table.rows[0]?.existing){
      const res=await client.query('SELECT state,revision FROM public.vano_v2_state WHERE id=1'+(apply?' FOR UPDATE':''));
      if(res.rows.length){state=res.rows[0].state;revision=Number(res.rows[0].revision);}
    }else if(apply)throw Error('V2 state table missing; start isolated V2 PostgreSQL once before importing.');
    const {data,summary,changed}=transformLegacy(state,legacy);
    console.log(JSON.stringify({dryRun:!apply,summary,changed},null,2));
    if(apply&&changed){
      const write=await client.query('UPDATE public.vano_v2_state SET state=$1::jsonb,revision=revision+1,updated_at=NOW() WHERE id=1 AND revision=$2 RETURNING revision',[JSON.stringify(data),revision]);
      if(write.rows.length!==1)throw Error('Concurrent migration: V2 state revision changed.');
    }
    await client.query(apply?'COMMIT':'ROLLBACK');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{await client.end();}
}
if(process.argv[1]?.endsWith('import-v1-to-v2.mjs')) run().catch(e=>{console.error('MIGRATION BLOCKED: '+e.message);process.exitCode=1;});
