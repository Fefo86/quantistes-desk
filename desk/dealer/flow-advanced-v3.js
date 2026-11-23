
/* Quantistes · Conditional Flow Scenario Studio v3
 * Adds research-only isoprobability level mapping, time-to-first-touch, terminal
 * weighted quantiles, fan charts and source coverage. All derived from the
 * *same* FlowProbability v2 ensemble. Native CVI/IPPO levels are never mutated.
 * No inference of actual P, executed dealer trades, or ES orders is made.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id), finite=Number.isFinite;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const fmt=(x,d=2)=>finite(x)?Number(x).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pct=(x,d=1)=>finite(x)?fmt(100*x,d)+'%':'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normCDF=p=>finite(p)?clamp(p,0,1):null;
const COLORS={amber:'#87b5ff',cyan:'#99deff',teal:'#63abcd',green:'#8dd0e9',red:'#f5efde',violet:'#b7ceff',text:'#d8e6f4',dim:'#aec3d7',grid:'#29445e'};
const PERCENTILES=[.01,.025,.05,.10,.16,.25,.50,.75,.84,.90,.95,.975,.99];
const CACHE=new WeakMap();
const state={result:null,analysis:null,selection:{family:'ALL',coord:'SPX',heatMode:'LIFT'},hover:{},lastW:0,lastH:0,scoreBound:false,ready:false,interval:null};
const manual=[
 ['M17','Greeks e tensori','PARTIAL','Greche contrattuali all7; join MM 1DTE ipotetico','Greche native aggregate su inventory realmente coevo e convenzioni del provider'],
 ['M18','Geometria dealer','PARTIAL','Gamma/charm scenario, flip veri, cliffs, topologia, HHI, livelli','Unità provider ignote e dealer state sincronizzato con all7'],
 ['M20','Innovazione di superficie','BLOCKED','CVI del singolo cutoff come riferimento Q','Snapshot CVI ripetuti allo stesso contratto, eventi e regressioni causalmente datate'],
 ['M21','Hedge response','SCENARIO','Gamma/charm response condizionale su sentieri, sensibilità normalizzate','Vanna netta, unità GEX/charm, hedge target ed eseguito'],
 ['M23','Expiry / overnight','PARTIAL','Scadenze source e orizzonte demo collegati','Stato inventory migrato, nuove posizioni, opening auction'],
 ['M24','CTA trigger ensemble','BLOCKED','Nessuna inferenza di CTA nascosta','Rendimenti storici, posizionamento/mandati e trigger osservabili'],
 ['M25','Vol-control e dropout','BLOCKED','Nessun re-risking fittizio','RV ed EWMA storiche, masse AUM e regole effettive'],
 ['M26','Risk parity e margine','BLOCKED','Nessun inventario cross-asset ricostruito','Covarianze point-in-time, funding, vincoli e leverage'],
 ['M27','LETF / flussi passivi','BLOCKED','No reset fisico dedotto dal gamma','AUM, shares, closing auction e reset contrattuale'],
 ['M28','Vol supply, VIX, dispersione','BLOCKED','Solo forma della skew Q SPXW','Vol surface per ticker/componenti, opzioni VIX e flussi QIS'],
 ['M29','Posizionamento e capacità','PARTIAL','MM posizioni Sample, massa netta/gross bucket, HHI','Capacità residua di fondi, posizioni aggregate reali contemporanee'],
 ['M30','Reflexivity e stress','SCENARIO','Cambio misure R_flow e shock sui pesi; nessun impatto predetto','Serie congiunte e sensitività storiche coeve'],
 ['M31','Contabilità dei flussi','PARTIAL','Data lineage distinto per fonte e unità; nessun double-count di buyer flow','Ledger ordini eseguiti, revisioni e sorprese per coorte'],
 ['M32','Regimi/changepoint','BLOCKED','Nessun regime storico inventato dai 168 profili gamma','Rendimenti, RV e serie di feature causalmente timestampate'],
 ['M33','Prior storico P','BLOCKED','Nessun prior P stimato','Rendimenti e salti ES/SPX con dataset storico validato'],
 ['M34','Q→P / density ratio','SCENARIO','Q→R_flow solo per tilt esponenziale parametrico; lift per prezzo','Pricing kernel stimato, osservazioni P, holdout temporale'],
 ['M35','VRP / risk premia','BLOCKED','Dispersione Q e R_flow di scenario soltanto','Forecast P indipendente, realized variance e payoffs uniformi'],
 ['M36','Joint physical paths','SCENARIO','Q terminale + Brownian bridge ipotizzato + reweight path; fan e drawdowns','Legge fisica P multiorizzonte e transizioni spot-vol validate'],
 ['M37','First-passage / level registry','SCENARIO','Touch, target-first, stop-first, heatmap temporale, shift isoprobabilità','Eventi ES osservati e validazione temporale'],
 ['M38','Calibrazione / astensione','PARTIAL','ESS, copertura, stabilità del campione e gate BLOCKED','Proper scores su eventi realizzati in rolling out-of-sample'],
 ['M39','Feature engineering','PARTIAL','Gamma/charm di scenario, HHI, ESS, lift e shift dei livelli','Statistiche PIT per z-score robusti e surprise condizionali'],
 ['M41','ML e benchmark','BLOCKED','Nessun modello ML predittivo etichettato','Feature/label storiche, nested out-of-sample'],
 ['M42','Causalità/counterfactual','BLOCKED','Scenario reweight ≠ prova di causalità','DAG identificato e shock naturali validabili'],
 ['M43','Pattern / playbook','PARTIAL','Pattern cards e condizioni di osservabilità','Conferme ES, trigger e invalidazioni stimati'],
 ['M44','Decision fusion','BLOCKED','Nessuna utility o strength Z calibrata','Probabilità congiunta, costo ipotizzato e utilità fuori campione'],
 ['M45','Scoreboard','PARTIAL','Scenari, qualità dei dati e fonti disponibili','Data e orizzonte coerenti con gli eventi ES']
];
function current(){return root.FlowProbability?.get?.()||null;}
function source(){return root.FlowDesk?.scenarioSnapshot?.()||null;}
function sortedTerminal(r){
 const a=r.records.map((p,i)=>({x:p.terminal,w:r.weights[i],i})).filter(p=>finite(p.x)&&p.x>0&&finite(p.w)&&p.w>=0).sort((a,b)=>a.x-b.x);
 let c=0;for(const p of a){c+=p.w;p.cum=c;}
 return a;
}
function wQuantile(sorted,p){
 if(!sorted.length||!finite(p))return NaN;
 p=clamp(p,0,1);const n=sorted.length;
 if(p<=0)return sorted[0].x;if(p>=1)return sorted[n-1].x;
 let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi)>>1;if(sorted[m].cum<p)lo=m+1;else hi=m;}
 const j=lo,prev=j?sorted[j-1].cum:0,span=sorted[j].cum-prev;
 if(!j)return sorted[0].x;
 const t=span>0?clamp((p-prev)/span,0,1):0;
 return sorted[j-1].x*(1-t)+sorted[j].x*t;
}
function simpleQuantile(vals,p){const a=vals.slice().sort((x,y)=>x-y);if(!a.length)return NaN;const pos=(a.length-1)*clamp(p,0,1),i=Math.floor(pos),q=pos-i;return a[i]*(1-q)+a[Math.min(a.length-1,i+1)]*q;}
function weightedQuantiles(values,weights,pcts){
 const items=values.map((x,i)=>({x,w:weights?.[i]??1})).filter(a=>finite(a.x)&&a.w>0).sort((a,b)=>a.x-b.x);
 const sum=items.reduce((a,b)=>a+b.w,0);if(!(sum>0))return pcts.map(()=>NaN);
 let c=0;for(const item of items){c+=item.w/sum;item.cum=c;}
 return pcts.map(p=>wQuantile(items,p));
}
function interpolation(xs,ys,x){if(x<xs[0]||x>xs.at(-1)||!finite(x))return null;let lo=0,hi=xs.length-1;while(hi-lo>1){const j=(hi+lo)>>1;if(xs[j]<=x)lo=j;else hi=j;}const u=(x-xs[lo])/(xs[hi]-xs[lo]||1);return ys[lo]*(1-u)+ys[hi]*u;}
function nativeSample(level,f){
 if(!f?.spots?.length||!f.gamma?.length||!f.charm?.length)return {gamma:null,charm:null,inDomain:false};
 const g=interpolation(f.spots,f.gamma,level),c=interpolation(f.spots,f.charm,level);
 return {gamma:g,charm:c,inDomain:g!==null&&c!==null};
}
function weightedMoments(r){
 const rets=r.records.map(x=>Math.log(x.terminal/r.ref));
 const sum=r.weights.reduce((a,b)=>a+b,0);
 let mu=0;for(let i=0;i<r.n;i++)mu+=r.weights[i]*rets[i]/sum;
 let v=0,sk=0,kurt=0;for(let i=0;i<r.n;i++){const d=rets[i]-mu,w=r.weights[i]/sum;v+=w*d*d;sk+=w*d*d*d;kurt+=w*d*d*d*d;}
 return {mean:mu,sd:Math.sqrt(v),skew:v>1e-14?sk/v**1.5:null,kurt:v>1e-14?kurt/v**2-3:null};
}
function leftES(sorted,p,ref){
 let mass=0,value=0;for(const item of sorted){if(mass>=p-1e-12)break;const take=Math.min(item.w,p-mass);mass+=take;value+=(item.x/ref-1)*take;}
 return mass?value/mass:null;
}
function getRisk(r,terminal){
 const q=terminal.map(a=>({...a,w:1/terminal.length}));let cc=0;q.forEach(a=>{cc+=a.w;a.cum=cc;});
 const rf=weightedMoments(r);
 const qe={
  mean:r.records.reduce((a,b)=>a+Math.log(b.terminal/r.ref),0)/r.n,
  sd:null,skew:null,kurt:null
 };
 let v=0,sk=0,kr=0;
 for(const x of r.records){const d=Math.log(x.terminal/r.ref)-qe.mean;v+=d*d/r.n;sk+=d*d*d/r.n;kr+=d**4/r.n;}
 qe.sd=Math.sqrt(v);qe.skew=v>1e-14?sk/v**1.5:null;qe.kurt=v>1e-14?kr/v**2-3:null;
 const out={Q:qe,flow:rf,tail:{},qSorted:q,rSorted:terminal};
 for(const p of [.01,.05])out.tail[p]={q:wQuantile(q,p),flow:wQuantile(terminal,p),qES:leftES(q,p,r.ref),flowES:leftES(terminal,p,r.ref)};
 return out;
}
function derive(r){
 if(CACHE.has(r))return CACHE.get(r);
 const terminal=sortedTerminal(r), N=r.records.length, sortedFlat=terminal.map(x=>x.x);
 const sortedQ=terminal.map(x=>({...x,w:1/N}));let cc=0;for(const a of sortedQ){cc+=1/N;a.cum=cc;}
 const support=Math.max(.002,5/Math.max(50,r.ESS));
 const f=source();
 const levels=(r.levels||[]).map((l,j)=>{
  let q=normCDF(r.Q.cdf(l.price));
  const stable=finite(q)&&q>=support&&q<=1-support;
  // CRN correction: quantify the reweighting effect on the same terminal
  // paths, removing the baseline Monte Carlo quantile noise. For β=0 the
  // scenario shift is exactly zero, while native CVI levels remain intact.
  const qMCSample=stable?wQuantile(sortedQ,q):null;
  const flowMC=stable?wQuantile(terminal,q):null;
  const mapped=stable?l.price+(flowMC-qMCSample):null;
  const fl=nativeSample(l.price,f);
  const row={index:j,family:l.family,z:l.z,price:l.price,flowPrice:mapped,shift:finite(mapped)?mapped-l.price:null,
   qPercentile:q,tail:l.price>r.ref?1-q:q,qTouch:l.qTouch,flowTouch:l.flowTouch,
   flowClose:l.flowClose,qClose:l.qClose,flowLift:finite(l.flowTouch)&&finite(l.qTouch)?l.flowTouch-l.qTouch:null,
   sourceCoverage:fl.inDomain,gamma:fl.gamma,charm:fl.charm,valid:stable};
  return row;
 });
 // Time-to-first-touch CDF on the common Q-bridge/R_flow ensemble.
 const nsteps=r.steps,atStep=new Array(levels.length);
 for(let j=0;j<levels.length;j++){
  const Q=new Float64Array(nsteps+1),R=new Float64Array(nsteps+1);
  for(let i=0;i<N;i++){
   const first=r.records[i].firstAt[j];
   if(first>=0&&first<=nsteps){Q[first]+=1/N;R[first]+=r.weights[i];}
  }
  for(let k=1;k<=nsteps;k++){Q[k]+=Q[k-1];R[k]+=R[k-1];}
  atStep[j]={Q,R};
 }
 const hpoints=Array.from({length:41},(_,i)=>i/40);
 const fan=hpoints.map(fr=>{
  const step=Math.round(fr*nsteps),prices=r.records.map(p=>p.path[step]);
  const Q=weightedQuantiles(prices,null,[.05,.25,.5,.75,.95]);
  const flow=weightedQuantiles(prices,r.weights,[.05,.25,.5,.75,.95]);
  return {fr,step,Q,flow};
 });
 const risk=getRisk(r,terminal);
 const quantiles=PERCENTILES.map(p=>{
   const q=r.Q.quantile(p),qMC=wQuantile(sortedQ,p),flowMC=wQuantile(terminal,p);
   return {p,q,qMC,flowMC,flow:q+(flowMC-qMC),commonRandomShift:flowMC-qMC};
 });
 const low=r.Q.quantile(.005),high=r.Q.quantile(.995),bins=35,delta=(high-low)/bins;
 const Qhist=new Float64Array(bins),Rhist=new Float64Array(bins);
 for(let i=0;i<N;i++){
  const x=r.records[i].terminal;if(x<low||x>high)continue;
  let j=clamp(Math.floor((x-low)/delta),0,bins-1);
  Qhist[j]+=1/N;Rhist[j]+=r.weights[i];
 }
 const lift=Array.from({length:bins},(_,j)=>({x:low+(j+.5)*delta,q:Qhist[j]/delta,flow:Rhist[j]/delta,ratio:Qhist[j]>=5/N?Rhist[j]/Qhist[j]:null}));
 const KL=r.weights.reduce((s,w)=>w>0?s+w*Math.log(N*w):s,0);
 const nativeCompared=levels.filter(l=>finite(l.flowPrice));
 const changed=nativeCompared.map(l=>l.shift),maxAbs=changed.length?Math.max(...changed.map(Math.abs)):0;
 const diagnostics={
  n:N,weightSum:r.weights.reduce((s,x)=>s+x,0),ESS:r.ESS,essRatio:r.ESS/N,
  KL,sourceCoverage:r.sourceCoverage,weightedCoverage:r.weightedCoverage,
  mappedCount:nativeCompared.length,totalLevels:levels.length,maxAbsShift:maxAbs,
  biggest:levels.filter(l=>finite(l.shift)).sort((a,b)=>Math.abs(b.shift)-Math.abs(a.shift))[0]||null,
  gammaCharmVintage:f?.sourceDates||r.sourceDates,flowTime:r.flowTime,asof:r.asof
 };
 const invariants=[];
 const check=(id,pass,detail)=>invariants.push({id,pass:!!pass,detail});
 check('Pesi normalizzati',Math.abs(diagnostics.weightSum-1)<1e-8,'Somma dei pesi R_flow = 1');
 check('ESS nell’intervallo',r.ESS>0&&r.ESS<=N*(1+1e-8),'N_eff = 1 / Σ w²');
 check('Livelli ordinati',levels.filter(l=>finite(l.flowPrice)).every((l,i,arr)=>!i||l.flowPrice>=arr[i-1].flowPrice-1e-7),'Mappatura quantile monotona');
 check('Fan probabilità ordinate',fan.every(v=>v.Q.every((p,i)=>!i||p>=v.Q[i-1]-1e-7)&&v.flow.every((p,i)=>!i||p>=v.flow[i-1]-1e-7)),'Quantili 5/25/50/75/95');
 check('Touch temporale monotono',atStep.every(a=>a.Q.every((x,i)=>!i||x>=a.Q[i-1]-1e-9)&&a.R.every((x,i)=>!i||x>=a.R[i-1]-1e-9)),'Prima visita cumulata');
 check('Touch ricalcolato = base',levels.every((l,j)=>Math.abs(atStep[j].Q[nsteps]-l.qTouch)<5e-7&&Math.abs(atStep[j].R[nsteps]-l.flowTouch)<5e-7),'Stesso ensemble/eventi nativi');
 check('Rispetto dominio percentile',levels.filter(l=>!l.valid).every(l=>l.flowPrice===null),'Code MC senza supporto non estrapolate');
 if(r.params.gamma===0&&r.params.charm===0)
  check('Zero-flow identity',levels.every(l=>!l.valid||Math.abs(l.shift)<1e-8),'Stessi paths: βΓ=βχ=0 rende nullo il level shift');
 const analysis={r,levels,terminal,sortedQ,fan,atStep,hpoints,quantiles,lift,risk,diagnostics,invariants};
 CACHE.set(r,analysis);return analysis;
}
function canvas(id,height=310){
 const c=$(id);if(!c)return null;
 const w=Math.max(270,Math.round(c.parentElement.getBoundingClientRect().width-16));
 if(!w||!finite(w))return null;
 const dpr=Math.min(2,root.devicePixelRatio||1),h=height;
 c.style.height=h+'px';c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
 const ctx=c.getContext('2d',{alpha:false});ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#091a2b';ctx.fillRect(0,0,w,h);
 return {c,ctx,w,h};
}
function axes(ctx,w,h,xmin,xmax,ymin,ymax,{left=76,right=20,top=22,bottom=46,xname='',yname='',xTick=5,yTick=5,formatX=null,formatY=null}={}){
 const x0=left,x1=w-right,y0=top,y1=h-bottom,spanX=xmax-xmin||1,spanY=ymax-ymin||1;
 const X=x=>x0+(x-xmin)/spanX*(x1-x0),Y=y=>y1-(y-ymin)/spanY*(y1-y0);
 ctx.font='10.5px Consolas';ctx.lineWidth=.6;
 for(let j=0;j<=yTick;j++){const t=j/yTick,yy=y1-(y1-y0)*t;ctx.strokeStyle='#1d3951';ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke();ctx.fillStyle='#77bfdd';ctx.textAlign='right';ctx.fillText(formatY?formatY(ymin+spanY*t):fmt(ymin+spanY*t,1),x0-8,yy+4);}
 for(let j=0;j<=xTick;j++){const t=j/xTick,xx=x0+(x1-x0)*t;ctx.strokeStyle='#1b364e';ctx.beginPath();ctx.moveTo(xx,y0);ctx.lineTo(xx,y1);ctx.stroke();ctx.fillStyle='#86cbe6';ctx.textAlign='center';ctx.fillText(formatX?formatX(xmin+spanX*t):fmt(xmin+spanX*t,1),xx,y1+17);}
 ctx.fillStyle='#a0def3';ctx.textAlign='center';if(xname)ctx.fillText(xname,(x0+x1)/2,h-8);
 if(yname){ctx.save();ctx.translate(15,(y0+y1)/2);ctx.rotate(-Math.PI/2);ctx.fillText(yname,0,0);ctx.restore();}
 return {X,Y,x0,x1,y0,y1};
}
function line(ctx,points,X,Y,{color='#7dabe5',width=2,dash=[],fill=null,opacity=1}={}){
 ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=opacity;ctx.setLineDash(dash);
 ctx.beginPath();let on=false;for(const p of points){if(!(finite(p[0])&&finite(p[1]))){on=false;continue;}if(!on){ctx.moveTo(X(p[0]),Y(p[1]));on=true;}else ctx.lineTo(X(p[0]),Y(p[1]));}ctx.stroke();ctx.restore();
}
function area(ctx,upper,lower,X,Y,color){ctx.save();ctx.fillStyle=color;ctx.beginPath();upper.forEach((p,i)=>{const x=X(p[0]),y=Y(p[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});lower.slice().reverse().forEach(p=>ctx.lineTo(X(p[0]),Y(p[1])));ctx.closePath();ctx.fill();ctx.restore();}
function label(ctx,x,y,msg,color=COLORS.text){ctx.fillStyle=color;ctx.font='11px Consolas';ctx.textAlign='left';ctx.fillText(msg,x,y);}
function listen(id,fn){const c=$(id);if(!c||c.dataset.faBound)return;c.dataset.faBound='1';c.addEventListener('pointermove',e=>{const b=c.getBoundingClientRect();fn(clamp((e.clientX-b.left)/b.width,0,1),clamp((e.clientY-b.top)/b.height,0,1));});c.addEventListener('pointerleave',()=>{state.hover[id]=null;});}
function filtered(){let a=state.analysis?.levels||[];return state.selection.family==='ALL'?a:a.filter(l=>String(l.family).toLowerCase()===state.selection.family.toLowerCase());}
function drawLevels(){
 const a=state.analysis;if(!a)return;
 const rows=filtered();const h=Math.max(290,95+rows.length*25), setup=canvas('faLevelCanvas',h);if(!setup)return;
 const {ctx,w}=setup,L=198,R=w-55,T=47,B=h-44;
 if(!rows.length){label(ctx,30,60,'Nessun livello per il filtro scelto');return;}
 const basis=Number($('flowBasis')?.value||0),coord=state.selection.coord;
 const marks=rows.flatMap(l=>[l.price,finite(l.flowPrice)?l.flowPrice:null]).filter(finite);
 const ref=a.r.ref;
 let xmin=coord==='DIST'?Math.min(0,...rows.map(l=>l.shift??0)):Math.min(...marks,ref);
 let xmax=coord==='DIST'?Math.max(0,...rows.map(l=>l.shift??0)):Math.max(...marks,ref);
 if(coord==='ES'){xmin+=basis;xmax+=basis;}
 const pad=(xmax-xmin||1)*.08;xmin-=pad;xmax+=pad;
 const X=x=>L+(x-xmin)/(xmax-xmin)*(R-L);
 const transform=x=>coord==='DIST'?x:coord==='ES'?x+basis:x;
 const rawX=l=>coord==='DIST'?0:transform(l.price),flowX=l=>coord==='DIST'?l.shift:transform(l.flowPrice);
 const yFor=i=>T+i*(B-T)/Math.max(rows.length,1)+(B-T)/(Math.max(rows.length,1)*2);
 ctx.font='10px Consolas';ctx.fillStyle='#7bc2df';
 for(let j=0;j<=5;j++){const val=xmin+(xmax-xmin)*j/5,px=X(val);ctx.strokeStyle='#29445e';ctx.beginPath();ctx.moveTo(px,T);ctx.lineTo(px,B);ctx.stroke();ctx.textAlign='center';ctx.fillText(fmt(val,coord==='DIST'?1:0),px,h-16);}
 const zero=coord==='DIST'?0:transform(ref);if(zero>=xmin&&zero<=xmax){ctx.strokeStyle='#e5dfcc';ctx.setLineDash([4,5]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(X(zero),T);ctx.lineTo(X(zero),B);ctx.stroke();ctx.setLineDash([]);}
 rows.forEach((l,i)=>{
  const yy=yFor(i);if(i%2===0){ctx.fillStyle='rgba(30,61,91,.19)';ctx.fillRect(3,yy-11,w-6,22);}
  ctx.fillStyle=l.family==='Ippo'?'#84b0e9':'#aeccf7';ctx.textAlign='left';ctx.font='10.5px Consolas';ctx.fillText(String(l.family).slice(0,11)+' '+fmt(l.z,1)+'σ',11,yy+4);
  ctx.fillStyle='#78c0de';ctx.textAlign='right';ctx.fillText(fmt(l.price,0),L-10,yy+4);
  const x0=X(rawX(l));ctx.fillStyle=COLORS.amber;ctx.beginPath();ctx.moveTo(x0-4,yy);ctx.lineTo(x0,yy-4);ctx.lineTo(x0+4,yy);ctx.lineTo(x0,yy+4);ctx.closePath();ctx.fill();
  if(finite(l.flowPrice)){
   const x1=X(flowX(l));ctx.strokeStyle=l.shift>=0?COLORS.cyan:COLORS.red;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke();ctx.fillStyle=l.shift>=0?COLORS.cyan:COLORS.red;ctx.beginPath();ctx.arc(x1,yy,3.4,0,2*Math.PI);ctx.fill();
  } else{ctx.fillStyle='#588dc9';ctx.textAlign='left';ctx.fillText('supporto insuff.',Math.min(w-125,x0+6),yy+4);}
 });
 label(ctx,18,18,'CVI originali  ◆',COLORS.amber);label(ctx,180,18,'R_flow  ●',COLORS.cyan);
 label(ctx,L,34,coord==='DIST'?'Δ prezzo R_flow − CVI · punti SPX':coord==='ES'?'ES*: solo basis impostato · non mercato ES':'Prezzo SPX · originale ↔ scenario',COLORS.dim);
 listen('faLevelCanvas',(xp,yp)=>{const i=clamp(Math.floor((yp*h-T)/(B-T)*rows.length),0,rows.length-1),l=rows[i];if(!l)return;
  $('faLevelRead').textContent=`${l.family} ${fmt(l.z,1)}σ · CVI ${fmt(l.price,2)} · R_flow ${fmt(l.flowPrice,2)} · Δ ${fmt(l.shift,2)} pt · P_Q(close sotto) ${pct(l.qPercentile,2)} · touch Q ${pct(l.qTouch)} / R_flow ${pct(l.flowTouch)} · Δtouch ${fmt(100*l.flowLift,2)} pp · campi gamma/charm: ${l.sourceCoverage?'coperti':'fuori dominio'}`;
 });
 let html='<table class="fa-table"><thead><tr><th>Famiglia</th><th>σ</th><th>Livello CVI</th><th>R_flow · scenario</th><th>Δ pt</th><th>Q≤L</th><th>Q touch</th><th>R_flow touch</th><th>Δ touch (pp)</th><th>Γ sample*</th><th>Charm sample*</th></tr></thead><tbody>';
 for(const l of rows){html+=`<tr tabindex="0"><td>${escape(l.family)}</td><td>${fmt(l.z,1)}</td><td>${fmt(l.price,2)}</td><td>${fmt(l.flowPrice,2)}</td><td class="${l.shift>=0?'fa-up':'fa-down'}">${fmt(l.shift,2)}</td><td>${pct(l.qPercentile,2)}</td><td>${pct(l.qTouch,1)}</td><td>${pct(l.flowTouch,1)}</td><td class="${l.flowLift>=0?'fa-up':'fa-down'}">${fmt(100*l.flowLift,2)}</td><td>${fmt(l.gamma,3)}</td><td>${fmt(l.charm,3)}</td></tr>`;}
 $('faLevelTable').innerHTML=html+'</tbody></table>';
}
function drawQuant(){if(state.analysis)window.DeskStudio.flowPlot('faQuantCanvas',state.analysis);}
function drawLift(){if(state.analysis)window.DeskStudio.flowPlot('faLiftCanvas',state.analysis);}
function drawFan(){if(state.analysis)window.DeskStudio.flowPlot('faFanCanvas',state.analysis);}
function drawHeat(){const a=state.analysis;if(!a)return;const rows=filtered();const height=Math.max(275,75+rows.length*23),setup=canvas('faHeatCanvas',height);if(!setup)return;
 const {ctx,w}=setup,L=185,R=w-24,T=44,B=height-28,mode=state.selection.heatMode;
 const val=(j,idx)=>{const i=Math.round(idx/20*a.r.steps);const entry=a.atStep[j];return mode==='Q'?entry.Q[i]:mode==='FLOW'?entry.R[i]:entry.R[i]-entry.Q[i];};
 let max=0;for(const l of rows)for(let j=0;j<=20;j++){max=Math.max(max,Math.abs(val(l.index,j)));}
 if(mode==='LIFT')max=Math.max(max,.00001);else max=1;
 const cw=(R-L)/21,ch=(B-T)/rows.length;
 ctx.font='10px Consolas';ctx.fillStyle='#89cde7';
 for(let t=0;t<=4;t++){const px=L+(R-L)*t/4;ctx.textAlign='center';ctx.fillText((t*25)+'%',px,20);}
 rows.forEach((l,ri)=>{
  const y=T+ri*ch;ctx.textAlign='right';ctx.fillStyle=l.family==='Ippo'?COLORS.amber:COLORS.violet;ctx.fillText(`${String(l.family).slice(0,10)} ${fmt(l.z,1)}σ`,L-9,y+ch*.7);
  for(let j=0;j<=20;j++){
   const v=val(l.index,j),norm=mode==='LIFT'?clamp(v/max,-1,1):clamp(v,0,1);
   if(mode==='LIFT')ctx.fillStyle=norm>=0?`rgba(93,164,199,${.13+.83*norm})`:`rgba(207,209,199,${.13+.83*(-norm)})`;
   else ctx.fillStyle=`rgba(${mode==='Q'?'135,181,255':'245,239,222'},${.14+.82*norm})`;
   ctx.fillRect(L+j*cw,y,Math.max(1,cw-1),Math.max(1,ch-1));
  }
 });
 label(ctx,L,36,mode==='LIFT'?'R_FLOW − Q · probabilità di touch entro il tempo':'First touch · probabilità cumulata',COLORS.dim);
 listen('faHeatCanvas',(xp,yp)=>{
  const index=clamp(Math.floor((yp*height-T)/ch),0,rows.length-1),col=clamp(Math.floor((xp*w-L)/cw),0,20),l=rows[index];if(!l)return;
  const entry=a.atStep[l.index],s=Math.round(col/20*a.r.steps);
  $('faHeatRead').textContent=`${l.family} ${fmt(l.z,1)}σ · SPX ${fmt(l.price,2)} · entro ${col*5}% dell’orizzonte: Q touch ${pct(entry.Q[s],2)}, R_flow touch ${pct(entry.R[s],2)}, Δ ${fmt(100*(entry.R[s]-entry.Q[s]),2)} pp. Brownian bridge, non P calibrata.`;
 });
}
function drawRisk(){const a=state.analysis;if(!a)return;const r=a.r,v=a.risk;
 const data=[
  ['Media log-return',pct(v.Q.mean,2),pct(v.flow.mean,2)],
  ['Dispersione log-return',pct(v.Q.sd,2),pct(v.flow.sd,2)],
  ['Skewness campionaria',fmt(v.Q.skew,3),fmt(v.flow.skew,3)],
  ['Excess kurtosis',fmt(v.Q.kurt,3),fmt(v.flow.kurt,3)],
  ['Quantile inferiore 5%',fmt(v.tail[.05].q,2),fmt(v.tail[.05].flow,2)],
  ['Quantile inferiore 1%',fmt(v.tail[.01].q,2),fmt(v.tail[.01].flow,2)],
  ['ES inferiore 5% · return',pct(v.tail[.05].qES,2),pct(v.tail[.05].flowES,2)],
  ['ES inferiore 1% · return',pct(v.tail[.01].qES,2),pct(v.tail[.01].flowES,2)]
 ];
 $('faRiskTable').innerHTML='<table class="fa-table"><thead><tr><th>Rischio terminale</th><th>Q MC</th><th>R_flow MC</th></tr></thead><tbody>'+data.map(x=>`<tr><td>${escape(x[0])}</td><td>${x[1]}</td><td>${x[2]}</td></tr>`).join('')+'</tbody></table>';
 $('faRiskRead').textContent='ES = rendimento medio del peggior 1% / 5% dei terminali nel campione. Per la Q originale il motore CVI resta la fonte dei quantili ufficiali; qui i rischi sono stimatori MC sullo stesso ensemble.';
}
function drawWeights(){const a=state.analysis;if(!a)return;const d=a.diagnostics,r=a.r;
 const entries=[
  ['Misura terminale originale','Q · CVI all7'],
  ['Misura riponderata','R_flow · importance weights'],
  ['Campioni/seed',`${d.n} / ${r.params.seed}`],
  ['ESS effettivo',`${fmt(d.ESS,0)} (${pct(d.essRatio,1)} del campione)`],
  ['Divergenza discreta KL(R||Q)',`${fmt(d.KL,4)} nat · sul campione`],
  ['Coverage scenario Q/R',`${pct(d.sourceCoverage)} / ${pct(d.weightedCoverage)}`],
  ['Livelli con percentile stimabile',`${d.mappedCount}/${d.totalLevels}`],
  ['Delta massimo livello',`${fmt(d.maxAbsShift,2)} punti`],
  ['Data gamma/charm source',`${JSON.stringify(d.gammaCharmVintage)}`],
  ['As-of opzioni / flow virtual time',`${r.asof||'—'} / ${r.flowTime||'—'}`],
  ['P fisica calibrata','NO · dato assente'],
 ];
 $('faWeightTable').innerHTML='<table class="fa-table"><tbody>'+entries.map(([k,v])=>`<tr><td>${escape(k)}</td><td>${escape(v)}</td></tr>`).join('')+'</tbody></table>';
 $('faWeightRead').textContent=a.invariants.every(v=>v.pass)?'Scenario dimostrativo: flussi 2025 su prezzi opzioni 2026.':'Scenario sospeso: distribuzione o pesi incoerenti.';
}
function manualAudit(){const node=$('faManualAudit');if(!node||node.dataset.ready)return;
 const groups=[
  ['01 · Dealer, greche e dinamica della superficie (M17–M23)',17,23],
  ['02 · Systematic, capitale e contabilità (M24–M31)',24,31],
  ['03 · Regimi, Q→P, paths e validazione (M32–M38)',32,38],
  ['04 · Features, causalità, decisione e scoreboard (M39–M45)',39,45]
 ];
 const labels={PARTIAL:'PARZIALE',SCENARIO:'SCENARIO',BLOCKED:'BLOCCATO'};
 node.innerHTML=groups.map(([title,lo,hi],i)=>{
  const rows=manual.filter(x=>{const n=+x[0].slice(1);return n>=lo&&n<=hi;});
  return `<details ${i===2?'open':''}><summary>${escape(title)}<span class="fa-pill partial">${rows.filter(x=>x[2]!=='BLOCKED').length}/${rows.length} almeno parziali</span></summary><article><p>Stato riferito soltanto ai quattro CSV e alla demo con date ribasate. «Scenario» indica calcolo matematico condizionato, non misura di un'azione reale. «Parziale» indica un sottoinsieme del capitolo, non completamento istituzionale.</p><table class="fa-table"><thead><tr><th>Modulo</th><th>Sezione</th><th>Stato</th><th>Disponibile in Quantistes</th><th>Input assente</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${e[0]}</td><td>${escape(e[1])}</td><td><span class="fa-pill ${e[2]==='BLOCKED'?'blocked':e[2]==='SCENARIO'?'partial':'ok'}">${labels[e[2]]}</span></td><td>${escape(e[3])}</td><td>${escape(e[4])}</td></tr>`).join('')}</tbody></table></article></details>`;
 }).join('');
 node.dataset.ready='1';
}
function kpis(){const a=state.analysis;if(!a)return;const d=a.diagnostics;
 const pick=a.levels.find(l=>l.family==='Ippo'&&Math.abs(l.z)===1&&l.z>0)||d.biggest;
 const rows=[
  ['Δ maggiore livello scenario',fmt(d.maxAbsShift,2)+' pt','Massimo spostamento in valore assoluto, fra percentili supportati'],
  ['Livelli confrontabili',`${d.mappedCount}/${d.totalLevels}`,'Code senza supporto MC escluse'],
  ['ESS dei paths R_flow',fmt(d.ESS,0),`${pct(d.essRatio)} del numero simulato`],
  ['Target prima di stop',`${pct(a.r.qFirst.target)} → ${pct(a.r.flowFirst.target)}`,'Q bridge → R_flow scenario; NON P calibrata']
 ];
 $('faKpis').innerHTML=rows.map(row=>`<div class="fa-stat"><small>${escape(row[0])}</small><strong>${escape(row[1])}</strong><em>${escape(row[2])}</em></div>`).join('');
}
function exportJSON(){const a=state.analysis;if(!a)return;const d=a.diagnostics,r=a.r;
 const f=source();if(r!==current()||(f&&f.time!==r.flowTime)){
  const note=$('faLevelRead');if(note)note.textContent='La fonte flow o la simulazione è cambiata: riesegui SIMULA PATHS & PROBABILITÀ prima di esportare.';
  return;
 }
 const out={schema:'quantistes.flow.scenario-studio.v3',createdAt:new Date().toISOString(),status:'RESEARCH_ONLY_NOT_P',policy:{physicalP:null,flow2025MappedToAll7_2026:true},
  source:{sourceDates:r.sourceDates,flowTime:r.flowTime,asof:r.asof,expiry:r.expiry,reference:r.ref,basis:source()?.basis||0},
  params:r.params,diagnostics:d,invariants:a.invariants,quantiles:a.quantiles,risk:a.risk&&{Q:a.risk.Q,R_flow:a.risk.flow,tails:a.risk.tail},
  nativeAndFlowLevels:a.levels.map(l=>({...l,firstTouch:undefined})),
  timeFractions:a.hpoints,
  touchTimeMatrix:a.levels.map((l,j)=>({family:l.family,z:l.z,price:l.price,Q:a.hpoints.map(x=>a.atStep[j].Q[Math.round(x*r.steps)]),R_flow:a.hpoints.map(x=>a.atStep[j].R[Math.round(x*r.steps)])})),
  pathFan:a.fan,modelNote:'Scenario level = native level + weighted empirical quantile minus unweighted empirical quantile at the same Q-CVI percentile, using the same path ensemble (common random numbers). Not physical P or causal hedge inference.'};
 const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='Quantistes_Scenario_Flussi.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function render(){if(!state.analysis)return; kpis();drawLevels();drawQuant();drawLift();drawFan();drawHeat();drawRisk();drawWeights();manualAudit();}
function init(){
 if(state.ready)return;state.ready=true;
 const sel=$('faFamily'),coord=$('faCoord'),heat=$('faHeatMode');
 if(sel)sel.addEventListener('change',e=>{state.selection.family=e.target.value;drawLevels();drawHeat();});
 if(coord)coord.addEventListener('change',e=>{state.selection.coord=e.target.value;drawLevels();});
 if(heat)heat.addEventListener('change',e=>{state.selection.heatMode=e.target.value;drawHeat();});
 if($('faExport'))$('faExport').onclick=exportJSON;
 const basis=$('flowBasis');if(basis)basis.addEventListener('input',()=>{if(state.analysis&&state.selection.coord==='ES')drawLevels();});
 manualAudit();
 let lastWidth=0;
 root.addEventListener('resize',()=>{if(state.analysis&&$('view-flows')?.classList.contains('active'))render();});
 state.interval=root.setInterval(()=>{
  const r=current();if(r&&r!==state.result){state.result=r;state.analysis=null;try{state.analysis=derive(r);}catch(e){console.error('Flow Studio v3',e);const st=$('faLevelRead');if(st)st.textContent='Errore nella vista avanzata: '+(e.message||e);return;}}
  const active=$('view-flows')?.classList.contains('active')&&$('flow-panel-paths')?.classList.contains('active');
  
  if(state.analysis){
   if(active){const width=$('faStudio')?.clientWidth||0; if(state.rendered!==state.result||width!==lastWidth){render();state.rendered=state.result;lastWidth=width;}}
  }
 },550);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
root.FlowAdvanced=Object.freeze({refresh:()=>{const r=current();if(r&&r!==state.result){state.result=r;state.analysis=derive(r);}render();},get:()=>state.analysis,manualAudit:()=>manual,validate:()=>state.analysis?.invariants||[],export:exportJSON});
})(window);

