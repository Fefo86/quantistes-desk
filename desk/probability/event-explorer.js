
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const el = id => byId('dx' + id);
  const note = (id, text) => { el(id).textContent = text; };
  const finite = Number.isFinite;
  const nf = new Intl.NumberFormat('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2});
  const fmt = x => finite(x) ? nf.format(x) : '—';
  const pct = x => finite(x) ? fmt(100*x) + '%' : '—';
  const clip = (x,a,b) => Math.max(a,Math.min(b,x));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = id => el(id).valueAsNumber;
  const write = (id, x) => { el(id).value = Number(x.toFixed(8)); };
  const COLORS = {q:'#dddaca',p:'#8ed1ea',muted:'#aec3d7',grid:'#19334a',red:'#f5efde'};
  const local = {bundle:null, result:null, key:'', view:'pdf', current:null, geo:null, probe:null, drag:null, record:null, raf:0};
  const live = () => window.DistributionUI?.getState();
  const measure = () => el('Measure').value === 'p' && local.bundle?.p ? 'p' : 'q';
  const modelName = b => !b.p ? 'P indisponibile' : b.p.status === 'empirical_pit' ? 'P · stima storica PIT' : b.settings.physicalMode==='crra' ? 'P · scenario CRRA' : 'P · scenario di entropia';
  const nativeQ = b => b.settings.coordinate==='mapped' ? 'Q · scenario ribasato' : b.diagnostics.synthetic ? 'Q · prezzi sintetici' : b.q.status==='option_implied_assumed_clock' ? 'Q · orologio forzato' : 'Q · implicita dai prezzi';
  const rightTail = (d,x) => typeof d.survival==='function' ? d.survival(x) : Math.max(0,1-d.cdf(x));

  function eventIntervals(type, a, b, support) {
    const [lo,hi]=support;
    const intervals = type==='inside' ? [[a,b]] : type==='outside' ? [[lo,a],[b,hi]] : type==='below' ? [[lo,a]] : [[b,hi]];
    return intervals.map(([l,h])=>[Math.max(lo,l),Math.min(hi,h)]).filter(([l,h])=>h>l);
  }
  function eventStats(d,type,a,b,ref) {
    const lower=d.cdf(a),upper=rightTail(d,b);
    const interval=lower>.5?rightTail(d,a)-upper:d.cdf(b)-lower;
    const mass=clip(type==='inside'?interval:type==='outside'?lower+upper:type==='below'?lower:upper,0,1);
    let contribution=0;
    for(const [lo,hi] of eventIntervals(type,a,b,d.support))contribution+=d.integrate(x=>x-ref,lo,hi);
    return {probability:mass,conditionalMean:mass>1e-12?ref+contribution/mass:null,meanContribution:contribution};
  }
  function active() {
    const s=live();
    return s?.valid && s.bundle===local.bundle;
  }
  function setError(message) {
    local.record=null;
    el('Current').hidden=true;
    el('Error').hidden=false;
    el('Export').disabled=true;
    note('Error',message);
  }
  function data() {
    if (!active()) throw new Error('Aggiorna il calcolo per interrogare i dati correnti.');
    const a=num('L'),b=num('U'),type=el('Event').value;
    if(!finite(a)||!finite(b)||a<=0||b<=0) throw new Error('Inserisci due livelli SPX positivi.');
    if(b<=a) throw new Error('La soglia U deve superare L. Puoi correggere i valori nei campi sopra.');
    return {a,b,type,ref:local.current.reference};
  }
  function boundsText(result) {
    if (!result?.available) return result?.reason || 'Quote utilizzabili insufficienti.';
    const pairs = [result.lowerPair,result.upperPair].map(pair=>pair?.map(k=>fmt(k)).join(' / ')||'limite naturale');
    const endpoints = pct(result.lower)+' – '+pct(result.upper);
    return result.consistent ? endpoints+' · strike '+pairs.join(' e ') : 'Vincoli incrociati ('+pct(result.rawLower)+' / '+pct(result.rawUpper)+').';
  }
  function drawBounds(d, qProbability) {
    const {bundle:b,result:r}=local;
    const box=el('BoundOutput');box.replaceChildren();
    if (b.settings.coordinate!=='native'||b.diagnostics.synthetic||b.q.status==='option_implied_assumed_clock') {
      box.textContent='Servono scadenza cash nativa, orologio effettivo e bid/ask osservati.';
      return null;
    }
    const fn=window.QuantCore?.digitalBounds;
    if (!fn) {box.textContent='Calcolo dai vertical spread non disponibile.';return null;}
    const found={};
    for (const [key,k] of [['L',d.a],['U',d.b]]) {
      found[key]=fn(r,k);
      const row=document.createElement('div');row.className='dx-prow';
      row.textContent='Q(S > '+key+') · '+fmt(k)+'   '+boundsText(found[key]);
      box.appendChild(row);
    }
    const ok=k=>found[k]?.available && found[k]?.consistent;
    if ((d.type==='below'&&ok('L'))||(d.type==='above'&&ok('U'))||(ok('L')&&ok('U'))) {
      let lower,upper;
      if(d.type==='below') { lower=1-found.L.upper;upper=1-found.L.lower; }
      else if(d.type==='above') { lower=found.U.lower;upper=found.U.upper; }
      else {
        const insideLower=clip(found.L.lower-found.U.upper,0,1);
        const insideUpper=Math.min(1,found.L.upper-found.U.lower);
        [lower,upper]=d.type==='inside'?[insideLower,insideUpper]:[1-insideUpper,1-insideLower];
      }
      const row=document.createElement('div');row.className='dx-prow';
      if(lower<=upper+1e-10) {
        lower=clip(lower,0,1); upper=clip(upper,lower,1);
        const inBounds=qProbability>=lower-1e-9&&qProbability<=upper+1e-9;
        found.event={lower,upper,fitWithin:inBounds};
        row.textContent='Evento selezionato · '+pct(lower)+' – '+pct(upper)+'   ·   Q del fit '+pct(qProbability)+(inBounds?' entro i limiti':' fuori dai limiti');
      } else {
        found.event={lower:null,upper:null,fitWithin:null};
        row.textContent='I limiti alle due soglie sono incompatibili con una cumulata monotona.';
      }
      box.appendChild(row);
    }
    const expl=document.createElement('p');expl.className='pd-small';
    expl.textContent='I vertical spread con strike entrambi sopra o sotto la soglia forniscono limiti necessari alla probabilità terminale. L’ampiezza riflette anche spread e distanza fra strike. Un estremo naturale del 0% o 100% segnala assenza di un limite più stretto da quel lato.';
    box.appendChild(expl);
    return found;
  }
  function priceRows(stats) {
    const out=el('Conditional');out.replaceChildren();
    for (const [name,row] of Object.entries(stats)) {
      if (!row) continue;
      const div=document.createElement('div');div.className='dx-prow';
      const title=document.createElement('b');title.className='pd-'+name;title.textContent=name.toUpperCase()+' · '+fmt(row.conditionalMean);
      const val=document.createElement('span');val.textContent='Contributo '+fmt(row.meanContribution)+' pt';
      div.append(title,val);out.appendChild(div);
    }
  }
  function update() {
    try {
      const d=data(), {bundle:b}=local;
      el('Error').hidden=true;el('Current').hidden=false;
      const stats={q:eventStats(b.q,d.type,d.a,d.b,d.ref),p:b.p?eventStats(b.p,d.type,d.a,d.b,d.ref):null};
      const primary=measure(), chosen=stats[primary];
      note('PQ',pct(stats.q.probability));note('PP',pct(stats.p?.probability));
      note('QNote',nativeQ(b));note('PNote',modelName(b));
      note('Spread',stats.p?fmt(100*(stats.p.probability-stats.q.probability)):'—');
      note('Mean',fmt(chosen.conditionalMean));note('MeanUnit',primary.toUpperCase()+' · punti SPX');
      priceRows(stats);
      const bound=drawBounds(d,stats.q.probability);
      const [l,u]=b.diagnostics.liquid;
      const highWing = ev=>eventIntervals(d.type,d.a,d.b,ev.support).some(([lo,hi])=>lo<l||hi>u);
      note('Tail','Riferimento '+fmt(d.ref)+' SPX · strike del fit '+fmt(l)+' – '+fmt(u)+(highWing(b.q)?'. Una parte della regione selezionata cade nelle ali estrapolate.':'. La regione selezionata è compresa fra gli strike del fit.')+' Le probabilità usano l’intero supporto del modello.');
      local.record={snapshot:b.diagnostics.snapshot,target:b.diagnostics.target,coordinate:b.settings.coordinate,settings:b.settings,pStatus:b.p?.status||'unavailable',fitQuality:b.diagnostics.quality,priceUnit:'SPX points',type:d.type,lower:d.a,upper:d.b,reference:d.ref,q:stats.q,p:stats.p,verticalSpreadBounds:bound};
      el('Export').disabled=b.diagnostics.quality==='red';
      draw();
    } catch(err) {setError(err.message);}
  }
  function extent() {
    const {q,p}=local.bundle, zoom=el('Zoom').value;
    if (zoom==='event') {
      const a=num('L'),b=num('U'),pad=Math.max((b-a)*.2,q.sd*.025,.01);
      return [Math.max(0,a-pad),b+pad];
    }
    const ds=p?[q,p]:[q];
    if (zoom==='support') return [Math.min(...ds.map(d=>d.support[0])),Math.max(...ds.map(d=>d.support[1]))];
    return [Math.min(...ds.map(d=>d.quantile(.001))),Math.max(...ds.map(d=>d.quantile(.999)))];
  }
  function selectionFill(d,scale,geo) {
    return eventIntervals(el('Event').value,num('L'),num('U'),[geo.lo,geo.hi]).map(([a,b])=>{
      const x1=scale(a),x2=scale(b);
      return '<rect x="'+x1+'" y="'+geo.T+'" width="'+(x2-x1)+'" height="'+(geo.B-geo.T)+'" />';
    }).join('');
  }
  function draw() {
    if (!local.record||!active()) return;
    const {q,p}=local.bundle, selected=measure(), view=local.view;
    const W=Math.max(275,Math.round(el('Canvas').clientWidth||770)),H=W<510?225:280;
    const L=W<510?47:67,R=W-16,T=32,B=H-38;
    const [lo,hi]=extent();
    const grid=Array.from({length:Math.min(620,Math.max(180,Math.ceil((R-L)*.78)))},(_,i)=>i);
    const xs=grid.map(i=>lo+(hi-lo)*i/(grid.length-1));
    // Plot knots and region limits exactly to preserve corners and shaded boundaries at high zoom.
    for(const d of [q,p].filter(Boolean)) for(const k of d._edges||[]) if(k>lo && k<hi)xs.push(k);
    for(const k of [num('L'),num('U')]) if(k>lo&&k<hi) xs.push(k);
    const knots=Array.from(new Set(xs)).sort((a,b)=>a-b);
    const val=(d,k)=>view==='sf'?rightTail(d,k):d.pdf(k);
    const series=view==='delta'?[[COLORS.p,knots.map(k=>100*(rightTail(p,k)-rightTail(q,k))),'p']]:[[COLORS.q,knots.map(k=>val(q,k)),'q'],...(p?[[COLORS.p,knots.map(k=>val(p,k)),'p']]:[])];
    let min=0,max=1;
    if(view==='pdf') max=Math.max(1e-12,...series.map(s=>Math.max(...s[1])))*1.10;
    if(view==='delta') {max=Math.max(.01,...series[0][1].map(Math.abs))*1.10;min=-max;}
    const x=v=>L+(v-lo)/(hi-lo)*(R-L),y=v=>B-(v-min)/(max-min)*(B-T);
    local.geo={W,H,L,R,T,B,lo,hi,x,y,knots};
    const line=(x1,y1,x2,y2,color,extra='')=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" '+extra+'/>';
    const txt=(x1,y1,t,anchor='start',col=COLORS.muted)=>'<text x="'+x1+'" y="'+y1+'" fill="'+col+'" font-size="10" text-anchor="'+anchor+'">'+esc(t)+'</text>';
    const label=view==='pdf'?'Densità per punto SPX':view==='sf'?'Probabilità di chiusura sopra il prezzo':'P(S > prezzo) − Q(S > prezzo) · punti percentuali';
    const zone=selectionFill(q,x,local.geo),clr=COLORS[selected];
    let html='<svg font-family="Consolas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(label)+'"><title>'+esc(label)+'</title><rect width="'+W+'" height="'+H+'" fill="#081828"/><defs><clipPath id="dxRegionMask">'+zone+'</clipPath></defs>';
    html+=txt(L,18,label)+(W>480?txt(R,18,view==='delta'?'AZZURRO · SCARTO':p?'ORO · Q     AZZURRO · P':'ORO · Q','end'):'');
    html+='<g fill="'+clr+'" opacity=".07">'+zone+'</g>';
    for(let i=0;i<=4;i++){
      const v=min+(max-min)*i/4;
      const text=view==='pdf'?(max<.0003?v.toExponential(1):v.toFixed(max>.06?3:4)):view==='sf'?Math.round(100*v)+'%':(v>0?'+':'')+v.toFixed(max<1?2:1);
      html+=line(L,y(v),R,y(v),Math.abs(v)<1e-12?'#46647e':COLORS.grid)+txt(L-6,y(v)+3,text,'end');
    }
    const ticks=W<550?3:6;
    for(let i=0;i<=ticks;i++){
      const k=lo+(hi-lo)*i/ticks;
      html+=line(x(k),T,x(k),B,COLORS.grid,'stroke-dasharray="2 5"')+txt(x(k),B+18,Math.abs(hi-lo)>16?Math.round(k):k.toFixed(2),i===0?'start':i===ticks?'end':'middle');
    }
    for(const [color,ys,m] of series) {
      const path=ys.map((v,i)=>(i?'L':'M')+x(knots[i]).toFixed(2)+','+y(v).toFixed(2)).join(' ');
      if(m===selected||view==='delta') html+='<path d="'+path+' L'+R+','+y(0)+' L'+L+','+y(0)+' Z" clip-path="url(#dxRegionMask)" fill="'+color+'" opacity=".25"/>';
      html+='<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="'+(m===selected||view==='delta'?2.4:1.7)+'" '+(m==='p'&&view!=='delta'?'stroke-dasharray="6 3"':'')+'/>';
    }
    for(const [name,k] of [['L',num('L')],['U',num('U')]]) if(k>=lo&&k<=hi){
      const align=x(k)>R-13?'end':'start';
      html+=line(x(k),T,x(k),B,clr,'stroke-dasharray="4 4"')+txt(x(k)+(align==='end'?-3:3),T+11,name,align,clr);
    }
    html+='<rect id="dxBrush" fill="#c1d3e3" opacity=".20" y="'+T+'" height="'+(B-T)+'" width="0"/><line id="dxCross" y1="'+T+'" y2="'+B+'" stroke="#f5f3e9" stroke-dasharray="2 4"/>'
       +txt(R,H-4,'Prezzo SPX','end')+'</svg>';
    el('Canvas').innerHTML=html;
    probe(clip(finite(local.probe)?local.probe:local.current.reference,lo,hi));
  }
  function probe(k) {
    if(!local.geo||!local.bundle) return;
    const {q,p,diagnostics:g}=local.bundle,{lo,hi,x}=local.geo;
    local.probe=clip(k,lo,hi);
    const K=local.probe, node=el('Cross');
    if(node) {node.setAttribute('x1',x(K));node.setAttribute('x2',x(K));}
    const qVal=rightTail(q,K);
    const lines=['SPX '+fmt(K),'Q ≤ '+pct(q.cdf(K))+' / > '+pct(qVal)];
    if(p) lines.push('P ≤ '+pct(p.cdf(K))+' / > '+pct(rightTail(p,K)));
    lines.push(K<g.liquid[0]||K>g.liquid[1]?'Ala estrapolata':'Fra gli strike del fit');
    note('Probe',lines.join('   ·   '));
  }
  function coordinate(e) {
    const {L,R,W,lo,hi}=local.geo,r=el('Canvas').querySelector('svg').getBoundingClientRect();
    const u=clip(((e.clientX-r.left)/r.width*W-L)/(R-L),0,1);
    return lo+(hi-lo)*u;
  }
  function refreshLevels() {
    const r=local.result,b=local.bundle,select=el('Level');select.replaceChildren();
    const levels=[...(r.ippo?.levels||[]),...(r.ws?.levels||[])].filter(v=>finite(v.price));
    for(const v of levels) {
      const name=(String(v.family).toLowerCase()==='ippo'?'IPPO':'Wall Street')+' '+(v.z>0?'+':'')+v.z+'σ · '+fmt(v.price);
      select.add(new Option(name,v.price));
    }
    const i=levels.findIndex(v=>v.z===-1);if(i>=0)select.selectedIndex=i;
    document.querySelectorAll('[data-dx-level]').forEach(b=>b.disabled=!levels.length);
    const different=b.settings.coordinate==='native'&&(r.cfg.target!==b.diagnostics.target||r.cfg.anchor!=='native'||r.isScenario);
    note('PlacementNote',different?'I livelli appartengono al target e all’ancoraggio del desk. Qui puoi usarne il prezzo come soglia cash alla scadenza indicata.':'I livelli corrispondono ai prezzi calcolati nella mappa del desk.');
  }
  function receive(s) {
    if(!s?.valid||!s.bundle) return;
    const b=s.bundle, key=[b.diagnostics.snapshot,b.diagnostics.target,b.settings.coordinate,s.result?.cfg.symbol].join('|');
    const newTarget=key!==local.key||local.result!==s.result;
    const nextP=(!local.bundle?.p && !!b.p) || (local.bundle?.settings.physicalMode!==b.settings.physicalMode&&!!b.p);
    local.bundle=b;local.result=s.result;local.current=s;local.key=key;local.drag=null;
    el('Measure').options[0].textContent=nativeQ(b);el('Measure').options[1].textContent=modelName(b);el('Measure').options[1].disabled=!b.p;
    if(!b.p)el('Measure').value='q';else if(newTarget||nextP)el('Measure').value='p';
    if(!b.p&&local.view==='delta')setView('pdf',false);
    document.querySelector('[data-dx-view="delta"]').disabled=!b.p;
    note('AsOf','Snapshot '+b.diagnostics.snapshot.replace('T',' ')+' ET · '+(b.settings.coordinate==='native'?'scadenza cash ':'target ribasato ')+b.diagnostics.target.replace('T',' ')+' ET');
    if(newTarget){const d=b[measure()];write('L',d.quantile(.05));write('U',d.quantile(.95));local.probe=s.reference;}
    refreshLevels();update();
  }
  function setView(value,repaint=true) {
    local.view=value;document.querySelectorAll('[data-dx-view]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.dxView===value)));
    if(repaint) draw();
  }
  function assign(side,value) {
    if(!active()||!finite(value))return;
    write(side,value);update();
  }
  function init() {
    for (const id of ['L','U']) el(id).addEventListener('input',update);
    for (const id of ['Event','Measure']) el(id).addEventListener('change',update);
    el('Zoom').addEventListener('change',draw);
    document.querySelectorAll('[data-dx-view]').forEach(b=>b.onclick=()=>setView(b.dataset.dxView));
    document.querySelectorAll('[data-dx-central]').forEach(b=>b.onclick=()=>{
      if(!active())return;const coverage=Number(b.dataset.dxCentral),a=(1-coverage)/2,d=local.bundle[measure()];
      el('Event').value='inside';write('L',d.quantile(a));write('U',d.quantile(1-a));update();
    });
    document.querySelectorAll('[data-dx-pct]').forEach(b=>b.onclick=()=>{
      if(!active())return;
      const n=num('Pct');
      if(!finite(n)||n<.001||n>99.999){el('Pct').setCustomValidity('Usa un percentile fra 0,001 e 99,999%.');el('Pct').reportValidity();return;}
      assign(b.dataset.dxPct,local.bundle[measure()].quantile(n/100));
    });
    el('Pct').addEventListener('input',()=>el('Pct').setCustomValidity(''));
    document.querySelectorAll('[data-dx-level]').forEach(b=>b.onclick=()=>assign(b.dataset.dxLevel,Number(el('Level').value)));
    const area=el('Canvas');
    area.addEventListener('pointerdown',e=>{
      if(!active()||!local.record||!e.isPrimary||e.button!==0) return;
      const k=coordinate(e);local.drag={start:k,x:e.clientX,y:e.clientY,id:e.pointerId};area.setPointerCapture(e.pointerId);probe(k);
    });
    area.addEventListener('pointermove',e=>{
      if(!active()||!local.record||!e.isPrimary)return;const k=coordinate(e);probe(k);
      if(local.drag&&local.drag.id===e.pointerId){const a=local.geo.x(local.drag.start),b=local.geo.x(k);el('Brush').setAttribute('x',Math.min(a,b));el('Brush').setAttribute('width',Math.abs(a-b));}
    });
    area.addEventListener('pointerup',e=>{
      if(!local.drag||e.pointerId!==local.drag.id)return;
      const {start,x}=local.drag,k=coordinate(e);local.drag=null;el('Brush').setAttribute('width',0);
      if(active()&&Math.abs(e.clientX-x)>5 && k!==start) {
        write('L',Math.min(start,k));write('U',Math.max(start,k));el('Event').value='inside';update();
      }
    });
    for(const evt of ['pointercancel','lostpointercapture']) area.addEventListener(evt,()=>{local.drag=null;el('Brush')?.setAttribute('width',0);});
    area.addEventListener('keydown',e=>{
      if(!active()||!local.geo||!local.record)return;
      if(e.key.toLowerCase()==='l'||e.key.toLowerCase()==='u'){e.preventDefault();assign(e.key.toUpperCase(),local.probe);return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const {lo,hi}=local.geo,step=(hi-lo)*(e.shiftKey?.05:.002);
      probe(e.key==='Home'?lo:e.key==='End'?hi:local.probe+(e.key==='ArrowLeft'?-step:step));
    });
    el('Export').onclick=()=>{
      if(!local.record||!active()||local.bundle.diagnostics.quality==='red')return;
      const blob=new Blob([JSON.stringify(local.record,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Quantistes_Evento_'+local.bundle.diagnostics.snapshot.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    };
    let size=0;
    new ResizeObserver(entries=>{
      const w=entries[0].contentRect.width;
      if(w>0&&Math.abs(w-size)>1) {size=w;cancelAnimationFrame(local.raf);local.raf=requestAnimationFrame(draw);}
    }).observe(area);
    const kpis=byId('pdKpis');
    if(kpis)new MutationObserver(()=>{
      if(local.bundle&&local.record&&!active())setError('Aggiorna il calcolo del desk o del modello P per interrogare le nuove impostazioni.');
    }).observe(kpis,{attributes:true,attributeFilter:['class']});
    window.addEventListener('quantistes:distribution',e=>receive(e.detail));
    if(live()?.valid) receive(live());
  }
  init();
})();
