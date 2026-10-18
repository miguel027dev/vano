/** Incremental, bounded NDJSON parser for the opt-in conversational audio stream. */
export async function* readMaviTalkStream(body,{signal,maxBytes=100000}={}){
 if(!body?.getReader)throw Error('mavi_stream_unsupported');
 const reader=body.getReader(),decoder=new TextDecoder();
 let pending='',bytes=0,parts=0,done=false;
 try{
  while(!signal?.aborted){
   const next=await reader.read();
   if(next.done)break;
   bytes+=next.value?.byteLength||0;
   if(bytes>maxBytes)throw Error('mavi_stream_oversize');
   pending+=decoder.decode(next.value,{stream:true});
   let end;
   while((end=pending.indexOf('\n'))>=0){
    const line=pending.slice(0,end).trim();pending=pending.slice(end+1);
    if(!line)continue;
    let part;
    try{part=JSON.parse(line);}catch{throw Error('mavi_stream_invalid_json');}
    if(part.type==='chunk'){
     if(parts>=8)throw Error('mavi_stream_too_many_chunks');
     if(typeof part.text!=='string'||!part.text||part.text.length>400)throw Error('mavi_stream_invalid_chunk');
     const ticket=typeof part.voiceTicket==='string'&&part.voiceTicket.length<2200?part.voiceTicket:null;
     parts++;
     yield {type:'chunk',text:part.text,voiceTicket:ticket};
    }else if(part.type==='done'){done=true;yield {type:'done',text:typeof part.text==='string'?part.text.slice(0,340):'',fallback:part.fallback===true};return;}
   }
   if(pending.length>10000)throw Error('mavi_stream_invalid_frame');
  }
  if(!signal?.aborted&&!done)throw Error('mavi_stream_truncated');
 }finally{try{await reader.cancel();}catch{/* disconnect */}reader.releaseLock();}
}
