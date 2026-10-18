import React from 'react';

/**
 * Lightweight illustration for the public entry page.
 * No Mapbox instance, location request, remote assets or live-routing claims.
 */
const point=(x,y,z=0)=>[408+(x-y)*.94,72+(x+y)*.49-z];
const pair=(x,y,z=0)=>point(x,y,z).map(n=>Number(n.toFixed(1))).join(',');
const diamond=(x,y,w,d,z=0)=>[
  pair(x,y,z),pair(x+w,y,z),pair(x+w,y+d,z),pair(x,y+d,z)
].join(' ');
const blocks=Array.from({length:16},(_,i)=>({
  x:(i%4)*90+7,y:Math.floor(i/4)*90+7,
  park:[2,5,8,14].includes(i),height:[30,45,18,50,26,0,58,25,0,52,32,46,31,30,0,43][i],
  tree:[0,1,2].includes(i%4)?i%4:3
}));
const routeStops=[[80,337],[80,263],[171,263],[171,173],[261,173],[261,81],[344,81]];
const routePoints=routeStops.map(([x,y])=>point(x,y,5));
function routeLine(points,radius=14){
  if(points.length<2)return '';
  let d='M '+points[0].join(' ');
  for(let i=1;i<points.length-1;i++){
    const prev=points[i-1],now=points[i],next=points[i+1];
    const a=Math.hypot(now[0]-prev[0],now[1]-prev[1]);
    const b=Math.hypot(next[0]-now[0],next[1]-now[1]);
    const r=Math.min(radius,a/3,b/3);
    const entry=[now[0]-(now[0]-prev[0])/a*r,now[1]-(now[1]-prev[1])/a*r];
    const exit=[now[0]+(next[0]-now[0])/b*r,now[1]+(next[1]-now[1])/b*r];
    d+=' L '+entry.join(' ')+' Q '+now.join(' ')+' '+exit.join(' ');
  }
  return d+' L '+points[points.length-1].join(' ');
}
function Tree({x,y,small=false}){
  const [px,py]=point(x,y,3);
  const r=small?7:10;
  return <g>
    <ellipse cx={px+4} cy={py+3} rx={r*.82} ry={r*.42} fill="#748a61" opacity=".23"/>
    <path d={'M '+px+' '+py+' v -8'} stroke="#7d936c" strokeWidth="2"/>
    <circle cx={px} cy={py-10} r={r} fill="url(#vhome-foliage)"/>
    <circle cx={px-3} cy={py-14} r={r*.38} fill="#bbd5a2" opacity=".65"/>
  </g>;
}
function Building({x,y,height,width=32,depth=32}){
  const h=height;
  const roof=[pair(x,y,h),pair(x+width,y,h),pair(x+width,y+depth,h),pair(x,y+depth,h)].join(' ');
  return <g>
    <polygon points={[pair(x,y+depth,0),pair(x+width,y+depth,0),pair(x+width,y+depth,h),pair(x,y+depth,h)].join(' ')} fill="#d8d3c8"/>
    <polygon points={[pair(x+width,y,0),pair(x+width,y+depth,0),pair(x+width,y+depth,h),pair(x+width,y,h)].join(' ')} fill="#c4c3b9"/>
    <polygon points={roof} fill="url(#vhome-roof)" stroke="#f9f5ed" strokeWidth="1.4" strokeLinejoin="round"/>
    <polygon points={diamond(x+8,y+8,Math.max(8,width-17),Math.max(8,depth-17),h+.8)} fill="#f8f4e9" opacity=".55"/>
    {[.35,.7].map((n,i)=>{
      const a=point(x+width,y+depth*n,h*.5);
      return <path key={i} d={'M '+a[0]+' '+a[1]+' v 8'} stroke="#a8aea6" strokeWidth="2.2" opacity=".55"/>;
    })}
  </g>;
}
function CityTile({block,i}){
  const {x,y,park,height}=block;
  const w=74;
  const greenery=park?'#bed4af':'#e8e5d9';
  return <g>
    <polygon points={diamond(x,y,w,w,-5)} fill="#dbd9cc"/>
    <polygon points={diamond(x,y,w,w,0)} fill={greenery} stroke="#fdfaf1" strokeWidth="3" strokeLinejoin="round"/>
    {park
      ? <g>
          <polygon points={diamond(x+9,y+9,56,56,1)} fill="#a6c69b" opacity=".55"/>
          <Tree x={x+22} y={y+20}/>
          <Tree x={x+52} y={y+45}/>
          <Tree x={x+21} y={y+53} small/>
        </g>
      : <g>
          <polygon points={diamond(x+7,y+8,60,59,1)} fill={i%3===0?'#b6cda9':'#d7d6c4'}/>
          <Building x={x+19} y={y+17} height={height} width={i%3===0?36:32} depth={i%4===0?35:30}/>
          <Tree x={x+12} y={y+58} small/>
          <Tree x={x+58} y={y+13} small/>
        </g>
    }
  </g>;
}
export default function CityMapIntro(){
  const route=routeLine(routePoints);
  const start=routePoints[0],end=routePoints[routePoints.length-1];
  return <figure className="vhome-city" aria-label="Cidade isométrica ilustrativa com trajeto em laranja">
    <div className="vhome-city-glow" aria-hidden="true"/>
    <svg className="vhome-city-svg" viewBox="0 0 816 510" role="img"
      aria-label="Maquete urbana tridimensional com casas, árvores, ruas e uma rota laranja ilustrativa">
      <defs>
        <linearGradient id="vhome-roof" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#fffcf4"/><stop offset=".98" stopColor="#e8e4d9"/>
        </linearGradient>
        <radialGradient id="vhome-foliage" cx=".25" cy=".2">
          <stop stopColor="#a9d38b"/><stop offset=".72" stopColor="#6e9a67"/><stop offset="1" stopColor="#538456"/>
        </radialGradient>
        <filter id="vhome-shadow" x="-35%" y="-35%" width="170%" height="190%">
          <feGaussianBlur stdDeviation="14"/>
        </filter>
      </defs>
      <g className="vhome-city-scene">
        <polygon points={diamond(-12,-12,392,392,-19)} fill="#485e49" opacity=".14" transform="translate(0 24)" filter="url(#vhome-shadow)"/>
        <polygon points={diamond(-12,-12,392,392,-13)} fill="#dfddd1"/>
        <polygon points={diamond(-12,-12,392,392,0)} fill="#f8f4e9" stroke="#ebe7db" strokeWidth="6"/>
        {[0,1,2,3,4].map(i=><g key={'road-'+i}>
          <path d={'M '+pair(i*90,-10,1)+' L '+pair(i*90,380,1)} stroke="#fffdf8" strokeWidth="15" opacity=".96"/>
          <path d={'M '+pair(-10,i*90,1)+' L '+pair(380,i*90,1)} stroke="#fffdf8" strokeWidth="15" opacity=".96"/>
          <path d={'M '+pair(i*90,-10,2)+' L '+pair(i*90,380,2)} stroke="#dcdace" strokeWidth="1.2" strokeDasharray="3 9" opacity=".58"/>
        </g>)}
        {blocks.map((b,i)=><CityTile key={i} block={b} i={i}/>)}
        <path d={route} fill="none" stroke="#fff9eb" strokeWidth="19" strokeLinejoin="round" strokeLinecap="round"/>
        <path className="vhome-path" d={route} pathLength="1" fill="none" stroke="#ff6319" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round"/>
        <path className="vhome-path-highlight" d={route} pathLength="1" fill="none" stroke="#ffaf62" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        <g className="vhome-start-marker" transform={'translate('+start.join(' ')+')'}>
          <circle r="37" fill="#ff7a21" opacity=".11" className="vhome-pulse"/>
          <circle r="23" fill="#ff9d4c" opacity=".24"/>
          <circle r="13" fill="#fffaf2"/>
          <path d="M -7 2 L 8 -7 L 2 10 L -1 3 Z" fill="#f65c12" stroke="#f65c12" strokeLinejoin="round"/>
        </g>
        <g className="vhome-pin" transform={'translate('+end[0]+' '+(end[1]-10)+')'}>
          <path d="M0 19 C-7 10 -17 -2 -17 -12 A17 17 0 1 1 17 -12 C17 -2 7 10 0 19Z" fill="#ff6721" stroke="#fffdf5" strokeWidth="4"/>
          <circle cy="-12" r="6" fill="#fff9ed"/>
        </g>
      </g>
    </svg>
    <div className="vhome-city-caption" aria-hidden="true"><span className="vhome-turn">↱</span> Vá do seu jeito.</div>
    <figcaption className="vhome-city-disclaimer">Mapa conceitual e trajeto ilustrativo, sem dados de localização em tempo real.</figcaption>
  </figure>;
}
