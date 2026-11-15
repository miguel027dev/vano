/** Current regional model conditions, never a street-level sensor observation. */
const TTL=10*60_000,MAX_AGE=30*60_000;
export function weatherPoint(params){
 const lng=params.get('lng'),lat=params.get('lat');
 if(lng===null||lat===null||!lng.trim()||!lat.trim())return null;
 const p=[Number(lng),Number(lat)];
 return p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85?p.map(x=>+x.toFixed(2)):null;
}
export function normalizeWeather(body,now=Date.now()){
 const c=body?.current,at=c?.time*1000;
 if(!Number.isFinite(at)||now-at>MAX_AGE||at-now>5*60_000||!Number.isInteger(c?.weather_code))return null;
 const code=c.weather_code;
 const snow=[71,73,75,77,85,86].includes(code),rain=[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code);
 if(![0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code))return null;
 const heavy=[55,65,67,75,82,86,95,96,99].includes(code);
 return {effect:snow?'snow':rain?'rain':'none',strength:heavy?.65:.35,
  code,observedAt:new Date(at).toISOString(),expiresAt:new Date(Math.min(now+TTL,at+MAX_AGE)).toISOString(),
  source:'Open-Meteo',kind:'model-current',attribution:'Weather data by Open-Meteo'};
}
export function createLocalWeather({fetcher=fetch,clock=Date.now}={}){
 const cache=new Map();let cooldown=0;
 return async point=>{
  const key=point.join(','),now=clock(),hit=cache.get(key);
  if(hit?.until>now)return hit.pending||hit.value;
  if(cooldown>now)return null;
  const pending=(async()=>{
   try{
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('longitude',point[0]);url.searchParams.set('latitude',point[1]);
    url.searchParams.set('current','weather_code');url.searchParams.set('timeformat','unixtime');
    const response=await fetcher(url,{signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('weather unavailable');
    const raw=await response.text();if(raw.length>20000)throw Error('weather payload');
    const value=normalizeWeather(JSON.parse(raw),clock());
    cache.set(key,{value,until:clock()+(value?TTL:60_000)});return value;
   }catch{cooldown=clock()+60_000;cache.delete(key);return null;}
  })();
  cache.set(key,{pending,until:now+5000});
  while(cache.size>128)cache.delete(cache.keys().next().value);
  return pending;
 };
}
