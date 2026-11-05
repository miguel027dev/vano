import {createHash} from 'node:crypto';

// Ephemeral by design: no travel history, no shared application-state writes.
export function createAdminLiveTrips({now=Date.now,ttl=120000,maxTrips=5000}={}){
  const trips=new Map();
  const key=token=>createHash('sha256').update(token).digest('hex');
  const validToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
  const prune=()=>{const cutoff=now()-ttl;for(const [id,trip] of trips)if(trip.updatedAt<cutoff)trips.delete(id);};
  const cleanup=setInterval(prune,60000);cleanup.unref?.();
  return {
    update(body,user){
      const {token,coords,accuracy,meters}=body||{};
      if(!validToken(token)||!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[1])>90||!Number.isFinite(accuracy)||accuracy<0||accuracy>50||!Number.isFinite(meters)||meters<0||meters>10000000)return false;
      prune();const id=key(token);
      if(!trips.has(id)&&trips.size>=maxTrips)return false;
      const previous=trips.get(id),trail=previous?.trail||[];
      const last=trail.at(-1);
      if(!last||last[0]!==coords[0]||last[1]!==coords[1])trail.push(coords);
      if(trail.length>120)trail.shift();
      trips.set(id,{id:id.slice(0,16),coords,trail,accuracy,meters,updatedAt:now(),user:user?{name:String(user.name||'').slice(0,100)}:null});
      return true;
    },
    stop(token){if(!validToken(token))return false;trips.delete(key(token));return true;},
    list(){prune();return [...trips.values()].sort((a,b)=>b.updatedAt-a.updatedAt);}
  };
}
