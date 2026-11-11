(()=>{
  "use strict";
  const byId=id=>document.getElementById(id);
  const alertBox=byId("vai-alert");
  const n=v=>Number(v||0);
  const fmt=v=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(n(v));
  const label=(v)=>String(v||"Desconhecido").slice(0,90);
  const message=(txt)=>{alertBox.textContent=txt;alertBox.style.display=txt?"block":"none";};
  function renderRows(id,rows,title,value){
    const root=byId(id);root.replaceChildren();
    if(!rows.length){const p=document.createElement("p");p.className="vai-sub";p.textContent="Sem registros no período.";root.append(p);return;}
    for(const x of rows){
      const row=document.createElement("div");row.className="vai-row";
      const a=document.createElement("div"),b=document.createElement("b"),s=document.createElement("small");
      b.textContent=title(x);s.textContent=x.detail||"";a.append(b,s);
      const count=document.createElement("span");count.className="vai-count";count.textContent=value(x);
      row.append(a,count);root.append(row);
    }
  }
  function chart(rows){
    const root=byId("vai-chart");root.replaceChildren();
    const svg="http://www.w3.org/2000/svg", width=480,base=175;
    const values=rows.map(x=>n(x.calculations)), peak=Math.max(1,...values);
    const mk=(name,attrs,text)=>{
      const e=document.createElementNS(svg,name);
      for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
      if(text!==undefined)e.textContent=text;root.append(e);return e;
    };
    for(let k=0;k<4;k++){const y=26+k*47;mk("line",{x1:12,x2:488,y1:y,y2:y,stroke:"#e9edf2","stroke-dasharray":"4 5"});}
    if(!values.length){mk("text",{x:250,y:105,"text-anchor":"middle",fill:"#8894a3","font-size":13},"Sem dados para o período");return;}
    const step=width/Math.max(1,values.length);
    values.forEach((v,i)=>{
      const x=12+i*step+step*.18, barW=Math.max(3,step*.62),h=(v/peak)*140;
      mk("rect",{x,y:base-h,width:barW,height:Math.max(1,h),rx:Math.min(8,barW/3),fill:"#f97316"});
      mk("text",{x:x+barW/2,y:198,"text-anchor":"middle",fill:"#818c99","font-size":Math.max(8,Math.min(11,80/values.length+7))},String(rows[i].day||"").slice(5));
    });
  }
  async function load(){
    message("");
    const days=byId("vai-days").value;
    try{
      const r=await fetch("/api/admin/intelligence/overview?days="+encodeURIComponent(days),{credentials:"same-origin",cache:"no-store"});
      if(!r.ok)throw new Error("Não foi possível consultar o servidor ("+r.status+").");
      const data=await r.json();if(!data.ok)throw new Error("O banco analítico não está disponível.");
      const m=data.overview.routes,h=data.overview.route_api;
      byId("vai-routes").textContent=fmt(m.calculations);
      byId("vai-candidates").textContent=fmt(m.avg_candidates);
      byId("vai-errors").textContent=fmt(h.route_http_errors);
      byId("vai-degraded").textContent=fmt(m.degraded_count);
      chart(data.daily||[]);
      renderRows("vai-modes",data.modes||[],x=>label(x.mode)+" · "+label(x.profile),x=>fmt(x.calculations));
      const inc=[...(data.errors||[]).map(x=>({label:"HTTP "+x.status_code+" · "+label(x.path),value:x.occurrences,detail:"Erro de API"})),
                 ...(data.incidents||[]).map(x=>({label:label(x.category)+" · "+label(x.status),value:x.reports,detail:"Relato de usuário"}))];
      renderRows("vai-incidents",inc.slice(0,18),x=>x.label,x=>fmt(x.value));
    }catch(e){message(e.message||"Falha ao carregar.");}
  }
  byId("vai-days").addEventListener("change",load);
  byId("vai-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const button=byId("vai-submit"),answer=byId("vai-answer"),q=byId("vai-question").value.trim();
    if(q.length<5)return;
    button.disabled=true;button.textContent="Analisando…";answer.textContent="Consultando indicadores e aguardando a análise…";
    try{
      const r=await fetch("/api/admin/intelligence/ask",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json","X-CSRF-Token":window.VANO?.csrf||""},
        body:JSON.stringify({question:q,days:Number(byId("vai-days").value)})
      });
      const data=await r.json();
      if(!r.ok||!data.ok){answer.textContent=data.message||("Análise indisponível: "+(data.error||r.status));return;}
      answer.textContent=data.answer;
    }catch{answer.textContent="Falha de conexão com o serviço administrativo.";}
    finally{button.disabled=false;button.textContent="Analisar →";}
  });
  load();
})();
