/**
 * Developer-only VANO animation diagnostics.
 * No GPS coordinates, route details, identifiers, network or persistence.
 * Activated only via ?vanoMotionDebug=1.
 */
export function summarizeFrameIntervals(intervals) {
  const values=(Array.isArray(intervals)?intervals:[])
    .filter(ms=>Number.isFinite(ms)&&ms>0&&ms<=250)
    .sort((a,b)=>a-b);
  if(!values.length) return {frames:0,fps:0,p95Ms:null,p99Ms:null,maxMs:null,jankRate:0};
  const percentile=p=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
  const elapsed=values.reduce((sum,ms)=>sum+ms,0);
  const janky=values.filter(ms=>ms>34).length;
  return {
    frames:values.length,
    fps:Math.round(1000*values.length/elapsed*10)/10,
    p95Ms:Math.round(percentile(.95)*10)/10,
    p99Ms:Math.round(percentile(.99)*10)/10,
    maxMs:Math.round(values[values.length-1]*10)/10,
    jankRate:Math.round(1000*janky/values.length)/10,
  };
}

export function recordMotionFrames({durationMs=6000,raf,cancel,hidden=()=>false}={}) {
  const runFrame=raf||globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame=cancel||globalThis.cancelAnimationFrame?.bind(globalThis);
  if(typeof runFrame!=='function')return Promise.resolve({...summarizeFrameIntervals([]),reason:'unsupported'});
  const duration=Math.min(15000,Math.max(500,Number.isFinite(durationMs)?durationMs:6000));
  return new Promise(resolve=>{
    const samples=[];
    let previous=null,start=null,frameId=null,finished=false;
    const finish=(reason)=>{
      if(finished)return;
      finished=true;
      if(frameId!=null&&typeof cancelFrame==='function')cancelFrame(frameId);
      resolve({...summarizeFrameIntervals(samples),reason});
    };
    const frame=(time)=>{
      if(hidden()){finish('background');return;}
      if(start===null)start=time;
      if(previous!==null){
        const delta=time-previous;
        if(delta>0&&delta<=250)samples.push(delta);
      }
      previous=time;
      if(time-start>=duration){finish('complete');return;}
      frameId=runFrame(frame);
    };
    frameId=runFrame(frame);
  });
}
