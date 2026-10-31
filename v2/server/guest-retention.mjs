/** Bound abandoned guest data without touching members' records.
 * A guest cookie expires after seven days; we retain orphaned records for 30.
 * Untimestamped legacy guest preferences get a timestamp before any deletion.
 */
export const GUEST_RETENTION_MS=30*86400000;
export const GUEST_OWNER_CAP=2000;
const isGuest=owner=>/^guest:[a-f0-9]{32}$/.test(String(owner||""));
export function pruneGuestRecords(db,time=Date.now(),retention=GUEST_RETENTION_MS){
  const cutoff=time-retention,markedAt=new Date(time).toISOString();
  let removed=0;
  for(const key of ['preferences','favorites','routines','history']){
    db[key]=db[key].filter(record=>{
      if(!/^guest:[a-f0-9]{32}$/.test(String(record?.owner||'')))return true;
      const date=Date.parse(record.updatedAt||record.createdAt||'');
      if(!Number.isFinite(date)){record.createdAt=markedAt;return true;}
      if(date>=cutoff)return true;
      removed++;return false;
    });
  }
  // Count distinct owners across collections, not records. Retain the most
  // recently active guests, and always preserve registered members' data.
  const lastSeen=new Map();
  for(const key of ['preferences','favorites','routines','history']){
    for(const record of db[key]){
      if(!isGuest(record?.owner))continue;
      const seen=Date.parse(record.updatedAt||record.createdAt||"");
      const age=Number.isFinite(seen)?seen:time;
      lastSeen.set(record.owner,Math.max(age,lastSeen.get(record.owner)??-Infinity));
    }
  }
  if(lastSeen.size>GUEST_OWNER_CAP){
    const allowed=new Set([...lastSeen].sort((a,b)=>b[1]-a[1]).slice(0,GUEST_OWNER_CAP).map(([owner])=>owner));
    for(const key of ['preferences','favorites','routines','history']){
      const before=db[key].length;
      db[key]=db[key].filter(record=>!isGuest(record?.owner)||allowed.has(record.owner));
      removed+=before-db[key].length;
    }
  }
  return removed;
}
