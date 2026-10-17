/** Short-lived SSE subscriptions for VANO community reports.
 * No GPS, report coordinates, account information or descriptions are pushed.
 * Clients refetch nearby reports with their existing public API after an event.
 * Single Render Node instance; clients automatically fall back to HTTP polling.
 */
export const REPORT_STREAM_CAP=150;
export const pointInsideBBox=(point,bbox)=>
  Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&
  Array.isArray(bbox)&&bbox.length===4&&bbox.every(Number.isFinite)&&
  point[0]>=bbox[0]&&point[0]<=bbox[2]&&point[1]>=bbox[1]&&point[1]<=bbox[3];

export function createReportStreamHub({capacity=REPORT_STREAM_CAP,heartbeatMs=20000}={}){
  const peers=new Set();
  function subscribe(req,res,bbox,securityHeaders={}){
    if(peers.size>=capacity)return false;
    res.writeHead(200,{
      ...securityHeaders,
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-store, no-transform',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no'
    });
    res.flushHeaders?.();
    res.write('retry: 5000\n: connected\n\n');
    const peer={res,bbox};
    peers.add(peer);
    const heartbeat=setInterval(()=>{
      if(res.destroyed||res.writableEnded){close();return;}
      try{res.write(': alive\n\n');}catch{close();}
    },heartbeatMs);
    heartbeat.unref?.();
    function close(){
      clearInterval(heartbeat);
      peers.delete(peer);
    }
    res.once('close',close);
    res.once('error',close);
    req.once('aborted',close);
    return true;
  }
  function publish(record){
    if(!Array.isArray(record?.coords))return 0;
    let count=0;
    for(const peer of peers){
      if(!pointInsideBBox(record.coords,peer.bbox))continue;
      if(peer.res.destroyed||peer.res.writableEnded){peers.delete(peer);continue;}
      try{
        // Send only an invalidation signal, not individual report details.
        peer.res.write('event: reports-changed\ndata: {}\n\n');
        count++;
      }catch{peers.delete(peer);}
    }
    return count;
  }
  return {subscribe,publish,subscriberCount:()=>peers.size};
}
