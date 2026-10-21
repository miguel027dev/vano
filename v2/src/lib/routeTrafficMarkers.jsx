import React from 'react';
import {createRoot} from 'react-dom/client';
import {RouteTrafficBubble} from '../components/RouteTraffic.jsx';
import {upcomingTrafficEvents,trafficColorAt,trafficPointAt} from './routeTraffic.mjs';

export function clearRouteTrafficMarkers(map){
 for(const item of map._vanoRouteTrafficMarkers?.values()||[]){item.root.unmount();item.marker.remove();}
 map._vanoRouteTrafficMarkers?.clear();
 delete map._vanoRouteTrafficHiddenIds;
 map._vanoRouteTrafficCredit?.remove();delete map._vanoRouteTrafficCredit;
}
export function syncRouteTrafficMarkers(map,backend,engine,data){
 const traffic=data.v2Experience&&data.active?data.routeTraffic:null;
 const selected=(data.routes||[]).find(r=>r.id===data.selectedRoute)||data.routes?.[0];
 const valid=Boolean(traffic?.index&&selected?.geometry&&traffic.index.points===selected.geometry.coordinates);
 const candidates=valid?upcomingTrafficEvents(traffic.events,traffic.progress,{zoom:map.getZoom(),limit:3}):[];
 const events=[];
 for(const event of candidates){
  const point=backend==='mapbox'?map.project(event.coords):map.latLngToContainerPoint([event.coords[1],event.coords[0]]);
  if(events.some(e=>Math.hypot(point.x-e.screen.x,point.y-e.screen.y)<54))continue;
  events.push({...event,screen:point,sourceEvent:event});
 }
 const ids=valid?traffic.incidentIds||[]:[],idKey=ids.join('|');
 if(map._vanoRouteTrafficHiddenKey!==idKey){
  map._vanoRouteTrafficHiddenKey=idKey;map._vanoRouteTrafficHiddenIds=new Set(ids);
  map._vanoRefreshPublicPins?.();
 }
 const items=map._vanoRouteTrafficMarkers??=new Map(),wanted=new Set(events.map(e=>e.id));
 for(const [id,item] of items)if(!wanted.has(id)){item.root.unmount();item.marker.remove();items.delete(id);}
 for(const event of events){
  let item=items.get(event.id);
  if(!item){
   const element=document.createElement('div');element.className='v81-traffic-marker';
   const marker=backend==='mapbox'?new engine.Marker({element,anchor:'bottom',offset:[0,-12],occludedOpacity:1}).setLngLat(event.coords).addTo(map):
    engine.marker([event.coords[1],event.coords[0]],{icon:engine.divIcon({html:element,className:'v81-traffic-leaflet',iconSize:[44,44],iconAnchor:[22,54]}),keyboard:false}).addTo(map);
   item={marker,root:createRoot(element),event:null,selected:null};items.set(event.id,item);
  }
  const isSelected=traffic.selected?.id===event.id;
  if(item.event!==event.sourceEvent||item.selected!==isSelected||item.select!==traffic.select){
   item.root.render(<RouteTrafficBubble event={event} selected={isSelected} onSelect={traffic.select}/>);
   if(backend==='mapbox')item.marker.setLngLat(event.coords);else item.marker.setLatLng([event.coords[1],event.coords[0]]);
   item.event=event.sourceEvent;item.selected=isSelected;item.select=traffic.select;
  }
 }
 // Persistent attribution remains available when only flow data is present.
 const container=map.getContainer();
 let credit=map._vanoRouteTrafficCredit;
 if(!credit){credit=document.createElement('a');credit.className='v81-traffic-credit';credit.href='https://www.tomtom.com/legal/';credit.target='_blank';credit.rel='noopener noreferrer';credit.textContent='© TomTom';(container.closest('.map-page')||container).append(credit);map._vanoRouteTrafficCredit=credit;}
 credit.hidden=!valid||!traffic.hasData;
}
/** Leaflet fallback draws the same bounded stops and actual intervening vertices. */
export function syncLeafletRouteTraffic(map,L,data){
 const traffic=data.v2Experience?data.routeTraffic:null;
 if(map._vanoLeafletTraffic===traffic?.stops&&map._vanoLeafletTrafficEnabled===data.v2Experience)return;
 map._vanoLeafletTrafficLayer?.remove();map._vanoLeafletTrafficLayer=null;
 map._vanoLeafletTraffic=traffic?.stops;map._vanoLeafletTrafficEnabled=data.v2Experience;
 if(!traffic?.index)return;
 const {index,stops}=traffic,group=L.layerGroup().addTo(map);
 const fractionAt=i=>index.units[i]/index.totalUnits;
 for(let i=1;i<stops.length;i++){
  const [start]=stops[i-1],[end]=stops[i];
  const meterAt=t=>{let j=1;while(j<index.units.length-1&&fractionAt(j)<t)j++;
   const ratio=(t-fractionAt(j-1))/Math.max(.00000001,fractionAt(j)-fractionAt(j-1));return index.meters[j-1]+ratio*(index.meters[j]-index.meters[j-1]);};
  // Subdivide blend bands so the raster fallback remains smooth.
  const pieces=stops[i][1]===stops[i-1][1]?1:8;
  for(let k=0;k<pieces;k++){
   const a=start+(end-start)*k/pieces,b=start+(end-start)*(k+1)/pieces;
   const points=[trafficPointAt(index,meterAt(a)),...index.points.filter((_,j)=>fractionAt(j)>a&&fractionAt(j)<b),trafficPointAt(index,meterAt(b))];
   L.polyline(points.map(p=>[p[1],p[0]]),{color:trafficColorAt(stops,(a+b)/2),weight:8,opacity:1,interactive:false,lineCap:'round'}).addTo(group);
  }
 }
 map._vanoLeafletTrafficLayer=group;
}
