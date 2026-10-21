/** Bound abandoned guest data without touching members' records.
 * A guest cookie expires after seven days; we retain orphaned records for 30.
 * Untimestamped legacy guest preferences get a timestamp before any deletion.
 */
export const GUEST_RETENTION_MS=30*86400000;
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
  return removed;
}
