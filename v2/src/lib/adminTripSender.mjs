import {createAdminTripProgress} from './adminTripProgress.mjs';

// Keep at most one request in flight and one newest unsent fix. Navigation
// never awaits these requests; failed or obsolete positions are discarded.
export function createAdminTripSender({post,random=globalThis.crypto,interval=5000}={}){
  const bytes=new Uint8Array(32);random.getRandomValues(bytes);
  const token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  const progress=createAdminTripProgress();
  let latest=null,busy=false,closed=false,lastSent=0,timer=null;
  function flush(){
    if(closed||busy||!latest)return;
    const wait=interval-(Date.now()-lastSent);
    if(wait>0){if(!timer)timer=setTimeout(()=>{timer=null;flush();},wait);return;}
    const payload=latest;latest=null;busy=true;lastSent=Date.now();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    Promise.resolve().then(()=>post('/live-navigation/update',{token,...payload},{signal:controller.signal}))
      .catch(()=>{}).finally(()=>{clearTimeout(timeout);busy=false;if(closed)finish();else flush();});
  }
  function finish(){Promise.resolve().then(()=>post('/live-navigation/stop',{token},{keepalive:true})).catch(()=>{});}
  return {
    add(fix){if(closed)return;const result=progress.add(fix);if(result?.eligible){latest=result;flush();}},
    stop(){if(closed)return;closed=true;latest=null;if(timer)clearTimeout(timer);if(!busy)finish();}
  };
}
