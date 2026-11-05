/** Server-side only. Node 22+. Never import this file into a browser bundle. */
export class VanoPartnerClient {
 constructor({baseURL='https://vanomaps.online/api/partner/v1',apiKey=process.env.VANO_API_KEY}={}){
  const url=new URL(baseURL);
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Use HTTPS.');
  if(!apiKey)throw Error('Configure VANO_API_KEY no backend.');
  this.baseURL=baseURL.replace(/\/$/,'');this.apiKey=apiKey;
 }
 async request(path,{method='GET',body,idempotencyKey}={}){
  const response=await fetch(this.baseURL+path,{method,signal:AbortSignal.timeout(35000),headers:{Authorization:'Bearer '+this.apiKey,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json();
  if(!response.ok){const error=new Error(payload.error?.message||'Falha na API VANO');error.status=response.status;error.code=payload.error?.code;error.requestId=payload.meta?.request_id;error.retryAfter=response.headers.get('retry-after');throw error;}
  return payload.data;
 }
 capabilities(){return this.request('/capabilities');}
 search(q){return this.request('/places/search?q='+encodeURIComponent(q));}
 routes(input){return this.request('/routes',{method:'POST',body:input});}
 mapSession(input){return this.request('/map-sessions',{method:'POST',body:input});}
}
