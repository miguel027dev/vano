/** Shared priority for spoken turn instructions vs conversational answers.
 * Navigation takes precedence. Each audio request releases its lease in finally.
 */
let navigationHolders=0;
const assistantInterrupts=new Set();
export function navigationAudioActive(){return navigationHolders>0;}
export function onNavigationAudioStart(listener){
 if(typeof listener!=='function')return()=>{};
 assistantInterrupts.add(listener);
 return()=>assistantInterrupts.delete(listener);
}
export function acquireNavigationAudioFocus(){
 navigationHolders++;
 if(navigationHolders===1){
  for(const listener of [...assistantInterrupts])try{listener()}catch{/* UI must remain navigable */}
 }
 let released=false;
 return()=>{
  if(released)return;
  released=true;navigationHolders=Math.max(0,navigationHolders-1);
 };
}
