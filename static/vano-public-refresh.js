/* VANO MAPS — semantic page navigation, no tracking or external requests. */
(()=>{
  'use strict';
  const root=document.querySelector('.legal-shell,.vano-seo .seo-wrap,.faq-shell');
  if(!root)return;
  const prefersReduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const scroller=document.scrollingElement||document.documentElement;
  const progress=document.createElement('div');
  progress.className='vano-reading-progress';
  progress.setAttribute('aria-hidden','true');
  progress.innerHTML='<span></span>';
  document.body.appendChild(progress);
  const fill=progress.firstElementChild;
  let scheduled=false;
  const updateProgress=()=>{
    scheduled=false;
    const available=Math.max(1,scroller.scrollHeight-window.innerHeight);
    const pct=Math.max(0,Math.min(1,window.scrollY/available));
    fill.style.transform=`scaleX(${pct})`;
    progress.classList.toggle('is-scrolled',window.scrollY>100);
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(updateProgress);
  };
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  updateProgress();

  /* Topic shortcuts use existing editorial headings; preserves one H1 per page. */
  const seo=document.querySelector('.vano-seo .seo-wrap');
  if(seo){
    const hero=seo.querySelector('.seo-hero');
    const sections=[...seo.querySelectorAll(':scope > .seo-section')]
      .filter(section=>section.querySelector(':scope > h2')).slice(0,6);
    if(hero&&sections.length>=2){
      const nav=document.createElement('nav');
      nav.className='vano-public-topics';
      nav.setAttribute('aria-label','Assuntos desta página');
      const header=document.createElement('span');
      header.textContent='Nesta página';
      nav.appendChild(header);
      const used=new Set();
      sections.forEach((section,index)=>{
        const h=section.querySelector(':scope > h2');
        if(!h)return;
        let id=section.id||'assunto-'+(index+1);
        while(used.has(id)||(!section.id&&document.getElementById(id)))id+='-v';
        used.add(id);
        if(!section.id)section.id=id;
        const link=document.createElement('a');
        link.href='#'+encodeURIComponent(id);
        link.textContent=h.textContent.trim();
        nav.appendChild(link);
      });
      hero.insertAdjacentElement('afterend',nav);
    }
  }

  const tocLinks=[...document.querySelectorAll('.legal-toc a[href^="#"],.vano-public-topics a[href^="#"]')];
  const anchorMap=new Map();
  for(const link of tocLinks){
    let id='';
    try{id=decodeURIComponent(link.getAttribute('href').slice(1))}catch(_){}
    const section=id&&document.getElementById(id);
    if(section){
      const current=anchorMap.get(section)||[];
      current.push(link);
      anchorMap.set(section,current);
    }
  }
  if(anchorMap.size&&'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      const active=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if(!active)return;
      tocLinks.forEach(a=>a.removeAttribute('aria-current'));
      (anchorMap.get(active.target)||[]).forEach(a=>a.setAttribute('aria-current','location'));
    },{rootMargin:'-12% 0px -68% 0px',threshold:0});
    anchorMap.forEach((_,section)=>observer.observe(section));
  }
  /* Native anchor navigation remains available without JS. */
})();
