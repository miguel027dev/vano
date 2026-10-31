/** NVIDIA Riva Whisper ASR using the existing NVIDIA_API_KEY.
 * Official hosted gRPC method: nvidia.riva.asr.RivaSpeechRecognition/Recognize.
 * No extra STT API key or dependency; restricted to the V2 admin endpoint.
 * Proto field IDs from nvidia-riva/common (MIT).
 */
import http2 from 'node:http2';

const HOST='https://grpc.nvcf.nvidia.com:443';
const METHOD='/nvidia.riva.asr.RivaSpeechRecognition/Recognize';
const WHISPER_FUNCTION_ID='b702f636-f60c-4a3d-a6f4-f3568c13bd7d';
const LIMIT=1_500_000;
const varint=n=>{
 const out=[];
 do{const byte=n&127;n=Math.floor(n/128);out.push(n?byte|128:byte);}while(n);
 return Buffer.from(out);
};
const scalar=(num,value)=>Buffer.concat([varint(num*8),varint(value)]);
const bytesField=(num,value)=>{const b=Buffer.isBuffer(value)?value:Buffer.from(value);return Buffer.concat([varint(num*8+2),varint(b.length),b]);};

export function pcmFromWav(input){
 const data=Buffer.from(input);
 if(data.length<46||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')throw Error('asr_wav_invalid');
 let pos=12,format=null,pcm=null;
 while(pos+8<=data.length){
  const name=data.toString('ascii',pos,pos+4),size=data.readUInt32LE(pos+4);
  pos+=8;
  if(size>data.length-pos)throw Error('asr_wav_invalid');
  if(name==='fmt '){
   if(size<16)throw Error('asr_wav_invalid');
   format={encoding:data.readUInt16LE(pos),channels:data.readUInt16LE(pos+2),
    sampleRate:data.readUInt32LE(pos+4),bits:data.readUInt16LE(pos+14)};
  }else if(name==='data')pcm=data.subarray(pos,pos+size);
  pos+=size+(size&1);
 }
 if(!format||format.encoding!==1||format.channels!==1||format.bits!==16||
    format.sampleRate!==16000||!pcm||pcm.length<1600||pcm.length>LIMIT-64||
    pcm.length%2)throw Error('asr_wav_invalid');
 return pcm;
}
export function encodeRivaRecognize(pcm){
 const config=Buffer.concat([
  scalar(1,1), // nvidia.riva.AudioEncoding.LINEAR_PCM
  scalar(2,16000),
  bytesField(3,'pt-BR'),
  scalar(4,1),
  scalar(11,1) // automatic punctuation
 ]);
 return Buffer.concat([bytesField(1,config),bytesField(2,pcm)]);
}
const parseFields=(buf,callback)=>{
 let i=0;
 const nextVar=()=>{
  let value=0,mul=1,steps=0;
  while(i<buf.length&&steps++<10){
   const b=buf[i++];value+=(b&127)*mul;
   if(!(b&128))return value;
   mul*=128;
  }
  throw Error('asr_proto_invalid');
 };
 while(i<buf.length){
  const tag=nextVar(),field=Math.floor(tag/8),wire=tag&7;
  if(!field)throw Error('asr_proto_invalid');
  if(wire===0){callback(field,wire,nextVar());continue;}
  if(wire===2){
   const n=nextVar();
   if(!Number.isSafeInteger(n)||n<0||n>buf.length-i)throw Error('asr_proto_invalid');
   callback(field,wire,buf.subarray(i,i+n));i+=n;continue;
  }
  if(wire===1){i+=8;}else if(wire===5){i+=4;}
  else throw Error('asr_proto_invalid');
  if(i>buf.length)throw Error('asr_proto_invalid');
 }
};
export function decodeRivaRecognize(payload){
 const texts=[];
 parseFields(Buffer.from(payload),(field,wire,result)=>{
  if(field!==1||wire!==2)return;
  parseFields(result,(subField,subWire,alternative)=>{
   if(subField!==1||subWire!==2)return;
   let best='';
   parseFields(alternative,(f,w,value)=>{
    if(f===1&&w===2&&!best)best=value.toString('utf8');
   });
   if(best)texts.push(best);
  });
 });
 return texts.join(' ').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,360);
}
export function makeGrpcFrame(protobuf){
 const result=Buffer.alloc(5+protobuf.length);
 result[0]=0;result.writeUInt32BE(protobuf.length,1);protobuf.copy(result,5);
 return result;
}
export function decodeGrpcFrames(bytes){
 const input=Buffer.from(bytes),parts=[];
 let offset=0;
 while(offset<input.length){
  if(input.length-offset<5||input[offset]!==0)throw Error('asr_grpc_invalid');
  const size=input.readUInt32BE(offset+1);offset+=5;
  if(size>262144||offset+size>input.length)throw Error('asr_grpc_invalid');
  parts.push(input.subarray(offset,offset+size));offset+=size;
 }
 return parts.map(decodeRivaRecognize).filter(Boolean).join(' ').slice(0,360);
}
export async function callNvidiaRivaGrpc(frame,key,{connect=http2.connect}={}){
 if(typeof key!=='string'||key.length<13)throw Error('stt_not_configured');
 return new Promise((resolve,reject)=>{
  let done=false,session,stream,statusCode=0,grpcStatus='';
  const chunks=[];let length=0;
  const finish=(error,text)=>{
   if(done)return;
   done=true;clearTimeout(timer);
   try{stream?.close();}catch{}
   try{session?.close();}catch{}
   if(error)reject(error);else resolve(text);
  };
  const timer=setTimeout(()=>finish(Error('asr_provider_timeout')),15000);
  try{
   session=connect(HOST);
   session.on('error',()=>finish(Error('asr_provider_unavailable')));
   stream=session.request({
    ':method':'POST',':path':METHOD,
    'content-type':'application/grpc','te':'trailers',
    'authorization':'Bearer '+key,
    'function-id':WHISPER_FUNCTION_ID,
    'grpc-timeout':'14000m'
   });
   stream.on('response',headers=>{statusCode=headers[':status'];if(headers['grpc-status']!==undefined)grpcStatus=String(headers['grpc-status']);});
   stream.on('trailers',headers=>{if(headers['grpc-status']!==undefined)grpcStatus=String(headers['grpc-status']);});
   stream.on('data',chunk=>{
    length+=chunk.length;
    if(length>262144)return finish(Error('asr_grpc_too_large'));
    chunks.push(chunk);
   });
   stream.on('error',()=>finish(Error('asr_provider_unavailable')));
   stream.on('end',()=>{
    if(statusCode!==200||grpcStatus&&grpcStatus!=='0')return finish(Error('asr_provider_unavailable'));
    try{
     const text=decodeGrpcFrames(Buffer.concat(chunks));
     finish(text?null:Error('stt_no_speech'),text);
    }catch{finish(Error('asr_provider_unavailable'));}
   });
   stream.end(frame);
  }catch{finish(Error('asr_provider_unavailable'));}
 });
}
export async function nvidiaTranscribeWav(wav,key,{grpc=callNvidiaRivaGrpc}={}){
 const pcm=pcmFromWav(wav);
 const frame=makeGrpcFrame(encodeRivaRecognize(pcm));
 return grpc(frame,key);
}
