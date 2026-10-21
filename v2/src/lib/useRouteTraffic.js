import {useEffect,useMemo,useState} from 'react';
import {api} from './api.js';
import {trafficRouteIndex,simplifyTrafficGeometry,projectTrafficPoint,routeTrafficEvidence,routeTrafficStops,routeTrafficGradient,upcomingTrafficEvents,TRAFFIC_MAX_AGE} from './routeTraffic.mjs';

/** One feed for the selected route. No requests from /mapa, walking, hidden
 * tabs or inactive retained WebViews; route switches abort and discard old data.
 */
export function useRouteTraffic({enabled,active,geometry,vehicle,position,navigation}){
 const index=useMemo(()=>trafficRouteIndex(geometry),[geometry]);
 const requestGeometry=useMemo(()=>simplifyTrafficGeometry(index),[index]);
 const progress=useMemo(()=>navigation?(projectTrafficPoint(index,position)?.at||0):0,[index,position?.[0],position?.[1],navigation]);
 const windowStart=Math.max(0,Math.floor(progress/2000)*2000);
 const [snapshot,setSnapshot]=useState({geometry:null,payload:null,status:'loading'});
 const [clock,setClock]=useState(Date.now());
 const [selectedId,setSelectedId]=useState(null);
 useEffect(()=>{
  setSelectedId(null);setSnapshot({geometry,payload:null,status:'loading'});
  if(!enabled||!active||!requestGeometry||vehicle==='a-pe')return;
  let disposed=false,timer=null,controller=null,running=false;
  async function refresh(){
   if(disposed||document.hidden||running)return;
   running=true;controller=new AbortController();
   try{
    const payload=await api('/admin/route-traffic',{method:'POST',signal:controller.signal,
     body:{geometry:requestGeometry,vehicle,fromMeters:Math.min(windowStart,index.total)}});
    if(!disposed){setSnapshot({geometry,payload,status:payload.status});setClock(Date.now());}
   }catch{if(!disposed){setSnapshot({geometry,payload:null,status:'unavailable'});setClock(Date.now());}}
   finally{running=false;if(!disposed){clearTimeout(timer);timer=setTimeout(refresh,90000);}}
  }
  const visibility=()=>{
   if(document.hidden){controller?.abort();clearTimeout(timer);}
   else{setClock(Date.now());clearTimeout(timer);void refresh();}
  };
  void refresh();document.addEventListener('visibilitychange',visibility);
  const expiry=setInterval(()=>setClock(Date.now()),15000);
  return()=>{disposed=true;controller?.abort();clearTimeout(timer);clearInterval(expiry);document.removeEventListener('visibilitychange',visibility);};
 },[enabled,active,geometry,requestGeometry,vehicle,windowStart]);
 const evidence=useMemo(()=>routeTrafficEvidence(index,snapshot.geometry===geometry?snapshot.payload:null,clock),[index,snapshot,geometry,clock]);
 const stops=useMemo(()=>routeTrafficStops(index,evidence.segments),[index,evidence]);
 const gradient=useMemo(()=>routeTrafficGradient(stops),[stops]);
 const status=snapshot.geometry!==geometry?'loading':snapshot.payload&&clock-snapshot.payload.sampledAt>=TRAFFIC_MAX_AGE?'stale':snapshot.status;
 const events=useMemo(()=>upcomingTrafficEvents(evidence.events,progress,{limit:12}),[evidence,progress]);
 const selected=events.find(e=>e.id===selectedId)||null;
 return useMemo(()=>({index,stops,gradient,events,progress,status,selected,select:setSelectedId,
  incidentIds:evidence.incidentIds,hasFlow:evidence.segments.length>0,hasData:evidence.segments.length>0||events.length>0}),
 [index,stops,gradient,events,progress,status,selected,evidence]);
}
