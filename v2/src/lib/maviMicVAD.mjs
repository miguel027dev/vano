/** Microphone-only voice activity heuristics. Never infer speech from TTS output.
 * The mic's AEC/NS/AGC is requested at getUserMedia creation.
 */
export function micRms(bytes){
 if(!bytes?.length)return 0;
 let sum=0;
 for(let i=0;i<bytes.length;i++){
  const sample=(bytes[i]-128)/128;
  sum+=sample*sample;
 }
 return Math.sqrt(sum/bytes.length);
}
export function voiceThreshold(noiseFloor){
 return Math.min(.11,Math.max(.023,Number(noiseFloor||0)*3.4));
}
export function shouldStartVoice(level,noiseFloor,frames){
 return frames>=3&&level>=voiceThreshold(noiseFloor);
}
