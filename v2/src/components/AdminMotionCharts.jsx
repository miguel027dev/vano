import React,{useEffect,useMemo,useRef,useState} from 'react';

/**
 * Only animate observed counts once when the dashboard first becomes visible.
 * Counters are presentational: the screen-reader value is always the real metric.
 */
export function CountUp({value,active=false}){
 const valid=typeof value==='number'&&Number.isFinite(value)&&value>=0&&Number.isInteger(value)&&value<=1_000_000_000;
 const [display,setDisplay]=useState(()=>valid&&active?0:value);
 const played=useRef(false);
 useEffect(()=>{
  if(!valid){setDisplay(value);return;}
  if(!active){setDisplay(value);return;}
  if(played.current){setDisplay(value);return;}
  played.current=true;
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   setDisplay(value);return;
  }
  let raf=0;
  const started=performance.now();
  const duration=690;
  const tick=now=>{
   const t=Math.min(1,(now-started)/duration);
   const eased=1-Math.pow(1-t,3);
   setDisplay(Math.round(value*eased));
   if(t<1)raf=requestAnimationFrame(tick);
  };
  setDisplay(0);
  raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf);
 },[value,valid,active]);
 const actual=valid?value.toLocaleString('pt-BR'):value===null||value===undefined?'—':String(value);
 const shown=valid&&Number.isFinite(display)?display.toLocaleString('pt-BR'):actual;
 return <><span className="vai-count-visual" aria-hidden="true">{shown}</span><span className="sr-only">{actual}</span></>;
}

const formatCount=value=>Number(value).toLocaleString('pt-BR');

/** Each plotted point is a stored daily history count, never a predicted value. */
export function DailyRouteTrend({days=[],animate=false}){
 const points=useMemo(()=>{
  const rows=(Array.isArray(days)?days:[]).slice(-14);
  const peak=Math.max(1,...rows.map(row=>Math.max(0,Number(row?.total)||0)));
  const left=38,right=652,top=25,bottom=165;
  return rows.map((row,i)=>({
   day:String(row?.day||''),
   count:Math.max(0,Number(row?.total)||0),
   x:rows.length<2?(left+right)/2:left+(right-left)*i/(rows.length-1),
   y:bottom-(Math.max(0,Number(row?.total)||0)/peak)*(bottom-top)
  }));
 },[days]);
 if(!points.length)return <p className="vai-empty">Ainda não há dados de rotas para exibir a tendência.</p>;
 const line=points.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
 const area='M '+points[0].x.toFixed(1)+' 165 '+line.replace(/^M /,'L ')+' L '+points.at(-1).x.toFixed(1)+' 165 Z';
 const peak=Math.max(1,...points.map(p=>p.count));
 const total=points.reduce((sum,p)=>sum+p.count,0);
 const description=points.map(p=>p.day+': '+formatCount(p.count)).join('; ');
 return <div className="vai-trend" data-animate={animate?'true':'false'}>
  <div className="vai-trend-summary"><span>ROTAS REGISTRADAS · SÉRIE DIÁRIA</span>
   <strong>{formatCount(total)} <small>no período</small></strong></div>
  <div className="vai-trend-canvas" role="img" aria-label={'Evolução de rotas registradas por dia. '+description}>
   <svg viewBox="0 0 690 192" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
     <linearGradient id="vaiTrendFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#f59a62" stopOpacity=".28"/>
      <stop offset="1" stopColor="#f59a62" stopOpacity="0"/>
     </linearGradient>
     <linearGradient id="vaiTrendStroke" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#ad542f"/><stop offset=".7" stopColor="#f59a62"/><stop offset="1" stopColor="#ffdab1"/>
     </linearGradient>
    </defs>
    {[25,72,119,165].map(y=><line key={y} className="vai-trend-grid" x1="38" x2="652" y1={y} y2={y}/>)}
    <path className="vai-trend-area" d={area} fill="url(#vaiTrendFill)"/>
    <path className="vai-trend-line" d={line} pathLength="1" fill="none" stroke="url(#vaiTrendStroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    {points.map((p,i)=><circle key={p.day+'-'+i} className="vai-trend-point" style={{'--vai-index':i}} cx={p.x} cy={p.y} r="4.5" fill="#f8b281" stroke="#251719" strokeWidth="2">
     <title>{p.day}: {formatCount(p.count)} rotas</title>
    </circle>)}
    <text className="vai-trend-y-label" x="3" y="29">{formatCount(peak)}</text>
    <text className="vai-trend-y-label" x="17" y="169">0</text>
   </svg>
  </div>
  <div className="vai-trend-labels">{points.map((p,i)=><span key={p.day+'-'+i} title={p.day+': '+formatCount(p.count)+' rotas'}>{p.day.slice(5)||'—'}</span>)}</div>
  <p className="vai-trend-caption">Históricos realmente salvos. A curva conecta as contagens diárias; não representa deslocamento em tempo real.</p>
 </div>;
}
