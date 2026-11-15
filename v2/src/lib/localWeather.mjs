/** Native Mapbox precipitation, tied to the user's GPS rather than map center. */
const valid=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
export function weatherEffect(weather,now=Date.now()){
 if(!weather||Date.parse(weather.expiresAt)<=now||!Number.isFinite(Date.parse(weather.expiresAt)))return 'none';
 const at=Date.parse(weather.observedAt);
 if(!Number.isFinite(at)||now-at>30*60_000||at-now>5*60_000)return 'none';
 return ['rain','snow'].includes(weather.effect)?weather.effect:'none';
}
export function applyMapWeather(map,weather,{now=Date.now(),reduced=false}={}){
 if(!map.isStyleLoaded?.())return false;
 const effect=reduced?'none':weatherEffect(weather,now);
 const strength=Math.max(.1,Math.min(.65,Number(weather?.strength)||.35));
 const reveal=v=>['interpolate',['linear'],['zoom'],10,0,13,v];
 try{
  map.setRain?.(effect==='rain'?{density:reveal(strength),intensity:.65,color:'#a8adbc',opacity:.45,
   'center-thinning':.65,'droplet-size':[1.3,10],'distortion-strength':0,vignette:0,direction:[0,10]}:null);
  map.setSnow?.(effect==='snow'?{density:reveal(strength),intensity:.55,color:'#ffffff',opacity:.65,
   'center-thinning':.65,'flake-size':.55,vignette:0,direction:[0,10]}:null);
  return true;
 }catch{return false;}
}
export function attachLocalWeather(map,{getPoint,isActive=()=>true,fetcher=fetch,
 clock=Date.now,documentRef=globalThis.document,media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
 schedule=setInterval,cancel=clearInterval}={}){
 let disposed=false,weather=null,cell=null,nextFetch=0,lastRequest=-Infinity,busy=false,abort=null,applied='';
 const render=(force=false)=>{
  const current=getPoint();
  const same=valid(current)&&cell===current.slice(0,2).map(x=>x.toFixed(2)).join(',');
  const selected=!documentRef?.hidden&&isActive()&&same?weather:null;
  const key=JSON.stringify([weatherEffect(selected,clock()),selected?.strength,!!media?.matches]);
  if(force||key!==applied){if(applyMapWeather(map,selected,{now:clock(),reduced:!!media?.matches}))applied=key;}
 };
 const tick=async()=>{
  if(disposed)return;
  render();
  const point=getPoint(),now=clock();
  if(documentRef?.hidden||!isActive()||!valid(point)||busy)return;
  const key=point.slice(0,2).map(x=>x.toFixed(2)).join(',');
  if((key===cell&&now<nextFetch)||now-lastRequest<60_000)return;
  busy=true;lastRequest=now;abort=new AbortController();
  const timeout=setTimeout(()=>abort?.abort(),5000);
  try{
   const [lng,lat]=key.split(',');
   const response=await fetcher(`/api/weather/current?lng=${encodeURIComponent(lng)}&lat=${encodeURIComponent(lat)}`,{signal:abort.signal,credentials:'same-origin'});
   if(!response.ok)throw Error('weather unavailable');
   const body=await response.json();if(disposed)return;
   cell=key;weather=body.weather||null;nextFetch=clock()+(weather?10*60_000:60_000);
  }catch{if(!disposed){weather=null;cell=key;nextFetch=clock()+60_000;}}
  finally{clearTimeout(timeout);busy=false;abort=null;if(!disposed)render();}
 };
 const style=()=>render(true),visibility=()=>{void tick();};
 map.on?.('style.load',style);documentRef?.addEventListener?.('visibilitychange',visibility);
 media?.addEventListener?.('change',style);
 const timer=schedule(()=>void tick(),15000);void tick();
 return ()=>{disposed=true;abort?.abort();cancel(timer);map.off?.('style.load',style);
  documentRef?.removeEventListener?.('visibilitychange',visibility);media?.removeEventListener?.('change',style);};
}
