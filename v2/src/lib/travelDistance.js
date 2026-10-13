/** Conservative GPS odometer. No route ETA, planned distance or map animation. */
export function measuredKilometers(record){return record?.measurementVersion===1&&Number.isFinite(record.travelledMeters)&&record.travelledMeters>=0?record.travelledMeters/1000:0;}
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function distance(a,b){const rad=Math.PI/180,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));}
export function advanceTravelDistance(previous,fix,{active=false,simulated=false,speed=null,vehicle='carro',now=Date.now()}={}){
 const state=previous||{meters:0,anchor:null,lastSeenAt:null};
 if(!active||simulated)return state;
 const stamp=fix?.sourceAt,accuracy=fix?.accuracy;
 if(!point(fix?.coords)||!Number.isFinite(stamp)||stamp<=0||stamp>now+2000||now-stamp>15000
   ||!Number.isFinite(accuracy)||accuracy<0||accuracy>30)return {...state,anchor:null,lastSeenAt:null};
 if(state.lastSeenAt!==null&&stamp<=state.lastSeenAt)return state;
 const current={coords:fix.coords,sourceAt:stamp,accuracy};
 if(!state.anchor||stamp-state.lastSeenAt>15000)return {...state,anchor:current,lastSeenAt:stamp};
 const elapsed=(stamp-state.anchor.sourceAt)/1000,metres=distance(state.anchor.coords,fix.coords);
 const maximumSpeed=vehicle==='a-pe'?8:75;
 if(metres/Math.max(.1,elapsed)>maximumSpeed)return {...state,anchor:null,lastSeenAt:stamp};
 if(speed===0)return {...state,anchor:current,lastSeenAt:stamp};
 if(metres<Math.max(5,accuracy*.5,state.anchor.accuracy*.5))return {...state,lastSeenAt:stamp};
 return {meters:state.meters+metres,anchor:current,lastSeenAt:stamp};
}
