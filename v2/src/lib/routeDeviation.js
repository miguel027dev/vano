/** Re-route only on coherent, fresh GPS fixes. No 25s lockout after missed turns. */
export function evaluateRouteDeviation(previous,{distance,accuracy,speed=0,sourceAt=Date.now(),now=Date.now(),fresh=true}={}){
 const state={outsideSince:0,outsideCount:0,lastFixAt:0,lastAttempt:0,...previous};
 if(!fresh||!Number.isFinite(distance)||!Number.isFinite(accuracy)||accuracy>35||accuracy<0||
    !Number.isFinite(sourceAt)||now-sourceAt>12000||sourceAt>now+3000){
  return {state:{...state,outsideSince:0,outsideCount:0},reroute:false,reason:'unreliable'};
 }
 // Avoid false detours under trees, beneath elevated roads and at parallel lanes.
 const threshold=Math.max(26,Math.min(75,accuracy*2+16));
 if(distance<=threshold){
  return {state:{...state,outsideSince:0,outsideCount:0,lastFixAt:sourceAt},reroute:false,reason:'on-route'};
 }
 if(sourceAt<=state.lastFixAt)return {state,reroute:false,reason:'duplicate-fix'};
 const start=state.outsideSince||sourceAt;
 const count=state.outsideSince?state.outsideCount+1:1;
 const next={...state,outsideSince:start,outsideCount:count,lastFixAt:sourceAt};
 // Two distinct fixes plus half a second of deviation is faster than the
 // previous 2.2s + 75m gate while avoiding a reroute on one GPS glitch.
 const corroborated=count>=2&&sourceAt-start>=500;
 // Huge off-road distance is not enough by itself: a lone multipath GPS jump
 // can be over 100m. Heading and speed are kept for later confidence scoring.
 if(!corroborated)return {state:next,reroute:false,reason:'confirming'};
 const cooldown=state.lastAttempt?now-state.lastAttempt:Infinity;
 if(cooldown<4500)return {state:next,reroute:false,reason:'cooldown'};
 return {state:{...next,lastAttempt:now,outsideSince:0,outsideCount:0},reroute:true,reason:'confirmed'};
}
