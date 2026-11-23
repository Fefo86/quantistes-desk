
/* Quantistes Distribution Lab. Additive module: existing fitted price spline is unchanged.
   Q is option-implied. P is an explicitly uncalibrated minimum-relative-entropy scenario.
   No historical sample, physical probability calibration, or path law is inferred here. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DistributionCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='2.1.0',finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const GX=[-.989400934991649932596,-.944575023073232576078,-.865631202387831743880,-.755404408355003033895,-.617876244402643748447,-.458016777657227386342,-.281603550779258913230,-.095012509837637440185,.095012509837637440185,.281603550779258913230,.458016777657227386342,.617876244402643748447,.755404408355003033895,.865631202387831743880,.944575023073232576078,.989400934991649932596];
const GW=[.027152459411754094852,.062253523938647892863,.095158511682492784810,.124628971255533872052,.149595988816576732081,.169156519395002538189,.182603415044923588867,.189450610455068496285,.189450610455068496285,.182603415044923588867,.169156519395002538189,.149595988816576732081,.124628971255533872052,.095158511682492784810,.062253523938647892863,.027152459411754094852];
// 16-point Gauss–Legendre on each cell; every original density knot is a boundary.
function quad(fn,a,b){if(!(b>a))return 0;const h=(b-a)/2,m=(a+b)/2;let s=0;for(let i=0;i<GX.length;i++)s+=GW[i]*fn(m+h*GX[i]);return h*s;}
function integratePieces(edges,fn,lo=edges[0],hi=edges[edges.length-1]){lo=Math.max(lo,edges[0]);hi=Math.min(hi,edges[edges.length-1]);if(!(hi>lo))return 0;let v=0;for(let j=0;j<edges.length-1;j++){const a=Math.max(lo,edges[j]),b=Math.min(hi,edges[j+1]);if(b>a)v+=quad(fn,a,b);if(edges[j+1]>=hi)break;}return v;}
function splitEdges(knots,scale){const out=[knots[0]];for(let i=0;i<knots.length-1;i++){const a=knots[i],b=knots[i+1],n=Math.max(1,Math.min(120,Math.ceil((b-a)/(scale*.16))));for(let j=1;j<=n;j++)out.push(a+(b-a)*j/n);}return out;}
function locate(edges,x){let l=0,r=edges.length-1;while(r-l>1){const m=(l+r)>>1;if(edges[m]>x)r=m;else l=m;}return l;}
function moments(dist){const mean=dist.expect(x=>x),variance=Math.max(0,dist.expect(x=>(x-mean)**2)),sd=Math.sqrt(variance);if(!(sd>0&&finite(sd)))throw new Error('Distribuzione degenere: varianza non positiva.');dist.mean=mean;dist.sd=sd;dist.variance=variance;dist.skew=dist.expect(x=>((x-mean)/sd)**3);dist.excess=dist.expect(x=>((x-mean)/sd)**4)-3;const knots=dist._edges;let mode=knots[0],height=-1;for(let i=0;i<knots.length-1;i++){for(let j=0;j<=4;j++){const x=knots[i]+(knots[i+1]-knots[i])*j/4,v=dist.pdf(x);if(v>height){height=v;mode=x;}}}// Refine the highest grid neighborhood; knots remain exact candidates.
 const mi=locate(knots,mode);let a=knots[Math.max(0,mi-1)],b=knots[Math.min(knots.length-1,mi+2)];
 const gr=(Math.sqrt(5)-1)/2;let c=b-gr*(b-a),d=a+gr*(b-a),fc=dist.pdf(c),fd=dist.pdf(d);
 for(let j=0;j<50;j++){if(fc>fd){b=d;d=c;fd=fc;c=b-gr*(b-a);fc=dist.pdf(c);}else{a=c;c=d;fc=fd;d=a+gr*(b-a);fd=dist.pdf(d);}}
 const refined=(a+b)/2;if(dist.pdf(refined)>height){mode=refined;}dist.mode=mode;dist.modeMethod='Global knot/subcell scan with local maximization';dist.median=dist.quantile(.5);return dist;}
function base(result,coordinate){
 if(!result||!result.ws||!result.ws.model)throw new Error('Serve una curva Wall Street valida, già calcolata nella piattaforma.');
 const model=result.ws.model,map=result.ws.mapping,rawKnots=model.knots.map(k=>model.F+model.scale*k);
 if(coordinate==='mapped'&&!map)throw new Error('Mappatura del target non disponibile.');
 const transform=coordinate==='mapped'?x=>map.map(x):x=>x;
 const knots=rawKnots.map(transform),support=[knots[0],knots.at(-1)],src=coordinate==='mapped'?map:model;
 if(support.some(x=>!finite(x)||x<=0)||!(support[1]>support[0]))throw Error('Finestra di integrazione CVI non valida.');
 const sdGuess=coordinate==='mapped'?result.ws.sd:model.info.sd,edges=knots;
 const pdf=x=>x<=0||x===Infinity?0:Math.max(0,src.pdf(x));
 const cdf=x=>x<=0?0:x===Infinity?1:clamp(src.cdf(x),0,1);
 const quantile=p=>{if(!(p>=0&&p<=1))throw new Error('Il quantile deve essere compreso fra 0 e 1.');return p===0?0:p===1?Infinity:src.quantile(p);};
 const survival=x=>x<=0?1:x===Infinity?0:src.survival(x),isf=p=>src.isf(p);
 const q={survival,isf,name:'Q',status:coordinate==='mapped'?'transformed_scenario':result.cfg.quoteSource==='iv'?'synthetic_iv_scenario':result.cfg.overrideHours>0?'option_implied_assumed_clock':'option_implied',coordinate,pdf,cdf,quantile,support,_edges:edges,integrationWindow:support,
  provenance:coordinate==='native'?(result.cfg.quoteSource==='iv'?'Prezzi sintetici ottenuti dalle IV con orizzonte e parametri del desk.':result.cfg.overrideHours>0?'Densità nativa dai prezzi opzioni con orologio forzato. Discount factor, forward e IV dipendono dalle ore impostate.':'Densità risk-neutral alla scadenza, derivata analiticamente dai premi del mark CVI.'):'Distribuzione Q trasformata dalla mappatura esistente: ribasamento e/o scala temporale sono scenari, non una nuova marginale osservata.',
  integrate:(fn,lo,hi)=>integratePieces(edges,x=>fn(x)*pdf(x),lo,hi)};
 q.expect=fn=>q.integrate(fn,support[0],support[1]);moments(q);q.mass=q.expect(()=>1);
 if(Math.abs(q.mass-1)>2e-6)throw new Error('Massa numerica Q non unitaria: '+q.mass.toPrecision(9));
 return q;
}
function quadratureNodes(q){const nodes=[];for(let j=0;j<q._edges.length-1;j++){const a=q._edges[j],b=q._edges[j+1],h=(b-a)/2,m=(b+a)/2;for(let i=0;i<GX.length;i++){const x=m+h*GX[i],w=h*GW[i]*q.pdf(x);if(w>0)nodes.push({x,z:(x-q.mean)/q.sd,w,logw:Math.log(w)});}}return nodes;}
function tiltedMoments(nodes,a,b,m1,m2){let max=-Infinity;for(const n of nodes){const v=n.logw+a*n.z+b*n.z*n.z;if(v>max)max=v;}let w=0,e1=0,e2=0,e3=0,e4=0;for(const n of nodes){const v=Math.exp(n.logw+a*n.z+b*n.z*n.z-max),z=n.z,z2=z*z;w+=v;e1+=v*z;e2+=v*z2;e3+=v*z2*z;e4+=v*z2*z2;}const logZ=max+Math.log(w);e1/=w;e2/=w;e3/=w;e4/=w;return{a,b,logZ,m1:e1,m2:e2,g1:e1-m1,g2:e2-m2,h11:e2-e1*e1,h12:e3-e1*e2,h22:e4-e2*e2,dual:logZ-a*m1-b*m2};}
function solveTilt(nodes,meanShift,volRatio){const m1=meanShift,m2=meanShift*meanShift+volRatio*volRatio;let s=tiltedMoments(nodes,0,0,m1,m2),iteration=0;
 for(;iteration<120;iteration++){
  const error=Math.max(Math.abs(s.g1),Math.abs(s.g2)/(1+m2));if(error<2e-11)break;
  const ridge=1e-13*Math.max(1,s.h11,s.h22),h11=s.h11+ridge,h22=s.h22+ridge,det=h11*h22-s.h12*s.h12;
  if(!(det>0&&finite(det)))throw new Error('Scenario P non risolto: vincoli troppo concentrati sul supporto disponibile.');
  const da=-(h22*s.g1-s.h12*s.g2)/det,db=-(-s.h12*s.g1+h11*s.g2)/det,slope=s.g1*da+s.g2*db;
  let accepted=false;
  for(let k=0;k<42;k++){const step=2**(-k),t=tiltedMoments(nodes,s.a+step*da,s.b+step*db,m1,m2);if(finite(t.dual)&&(t.dual<=s.dual+1e-4*step*slope+1e-13)){s=t;accepted=true;break;}}
  if(!accepted)throw new Error('Scenario P: ricerca numerica non convergente; riduci lo spostamento della media o la variazione di volatilità.');
 }
 const error=Math.max(Math.abs(s.g1),Math.abs(s.g2)/(1+m2));
 if(error>2e-8)throw new Error('Scenario P: momenti richiesti non raggiunti (residuo '+error.toExponential(2)+').');
 return{...s,iterations:iteration,error};
}
/* Suffix integrals preserve residual probability below machine epsilon at the
   upper edge. For a physical tilt the same segment quadrature as the density
   normalization is used on both sides. */
function addPhysicalTails(d,edges,masses){
 const end=edges.length-1,suf=new Float64Array(end+1);
 for(let i=end-1;i>=0;i--)suf[i]=suf[i+1]+masses[i];
 const total=suf[0];d.survival=x=>{
  if(x<=edges[0])return 1;if(x>=edges[end])return 0;const i=locate(edges,x);
  return clamp((suf[i+1]+quad(d.pdf,x,edges[i+1]))/total,0,1);
 };
 const original=d.quantile;
 d.isf=p=>{
  if(!(p>=0&&p<=1))throw Error('Probabilità di coda fuori da [0,1].');
  if(p===0)return d.support[1];if(p===1)return d.support[0];
  if(p>.5)return original(1-p);
  let i=0,j=end;
  while(i<j){const k=(i+j)>>1;if(suf[k]<=p*total)j=k;else i=k+1;}
  if(suf[j]===p*total)return edges[j];
  let a=edges[Math.max(0,j-1)],b=edges[j];
  for(let k=0;k<62;k++){const x=a+(b-a)/2;if(x===a||x===b)break;if(d.survival(x)<=p)b=x;else a=x;}
  return b;
 };
 d.quantile=p=>p>.5?d.isf(1-p):original(p);
}

function physical(q,meanShift,volRatio){
 if(!finite(meanShift)||!finite(volRatio)||!(volRatio>0))throw new Error('Ipotesi P: media finita e rapporto di volatilità positivo richiesti.');
 const support=q.support,m=q.mean+meanShift*q.sd,v=(q.sd*volRatio)**2;
 if(!(m>support[0]&&m<support[1])||v>=(support[1]-m)*(m-support[0]))throw new Error('Momenti P incompatibili con la finestra numerica dello scenario.');
 const identity=Math.abs(meanShift)<1e-14&&Math.abs(volRatio-1)<1e-14;
 if(identity){return{...q,name:'P',status:'uncalibrated',isIdentity:true,provenance:'Scenario neutro non calibrato: P = Q. Nessuna probabilità fisica è identificata dal solo CSV opzioni.',tilt:{a:0,b:0,logZ:0,kl:0,meanShift,volRatio,iterations:0,error:0},mass:q.mass};}
 const nodes=quadratureNodes(q),fit=solveTilt(nodes,meanShift,volRatio),z=x=>(x-q.mean)/q.sd;
 const pdf=x=>{if(x<support[0]||x>support[1])return 0;const b=q.pdf(x);if(!(b>0))return 0;const t=z(x);return Math.exp(Math.log(b)+fit.a*t+fit.b*t*t-fit.logZ);};
 const edges=q._edges,segmentMass=edges.slice(1).map((b,i)=>quad(pdf,edges[i],b)),cum=[0];for(const m of segmentMass)cum.push(cum[cum.length-1]+m);
 const mass=cum[cum.length-1];if(!finite(mass)||Math.abs(mass-1)>2e-7)throw new Error('Scenario P: normalizzazione numerica non raggiunta.');
 const cdf=x=>{if(x<=support[0])return 0;if(x>=support[1])return 1;const i=locate(edges,x);return clamp(cum[i]+quad(pdf,edges[i],x),0,1);};
 const quantile=p=>{if(!(p>=0&&p<=1))throw new Error('Il quantile deve essere compreso fra 0 e 1.');if(p===0)return support[0];if(p===1)return support[1];let l=0,r=cum.length-1;while(r-l>1){const mid=(l+r)>>1;if(cum[mid]>=p)r=mid;else l=mid;}let a=edges[l],b=edges[r];for(let i=0;i<58;i++){const x=(a+b)/2;if(cdf(x)<p)a=x;else b=x;}return(a+b)/2;};
 const d={name:'P',status:'uncalibrated',coordinate:q.coordinate,isIdentity:false,support: support.slice(),_edges:edges,pdf,cdf,quantile,
  provenance:'Scenario fisico ipotetico sulla finestra numerica troncata: proiezione a minima entropia relativa rispetto a Q, vincolata a media e varianza scelte. Parametri assunti, non stimati su esiti storici.',
  integrate:(fn,lo,hi)=>integratePieces(edges,x=>fn(x)*pdf(x),lo,hi),mass,
  tilt:{a:fit.a,b:fit.b,logZ:fit.logZ,kl:Math.max(0,fit.a*fit.m1+fit.b*fit.m2-fit.logZ),meanShift,volRatio,iterations:fit.iterations,error:fit.error}};
 addPhysicalTails(d,edges,segmentMass);d.expect=fn=>d.integrate(fn,support[0],support[1]);moments(d);
 const meanError=(d.mean-m)/q.sd,varianceError=d.variance/(q.sd*q.sd)-volRatio*volRatio;
 if(Math.max(Math.abs(meanError),Math.abs(varianceError)/(1+volRatio*volRatio))>3e-7)throw new Error('Scenario P: verifica indipendente dei momenti fallita.');
 d.tilt.meanError=meanError;d.tilt.varianceError=varianceError;
 return d;
}
/* Recalibration on archived probability integral transforms. The six-component
   Bernstein density has positive weights and integrates to one analytically. */
const PIT_MIN = 40, PIT_BINS = 6, PIT_PRIOR = 12;
const HIST_FIELDS = ['series','asof_utc','expiry_utc','available_utc','pit_q','support_breach'];
const FIX_CLOCK=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function fixingClock(ms){return FIX_CLOCK.format(new Date(ms));}
function sourceFailure(result,settings){
 if(settings.coordinate!=='native'||result.cfg.quoteSource!=='mid'||result.quality?.level==='red'||result.cfg.overrideHours>0)return 'Occorre una Q cash nativa da bid/ask con scadenza osservata e fit utilizzabile.';
 const a=result.quoteAudit;
 if(!a||a.missingTimestamps!==0||!(result.cfg.maxAge>0&&a.latestQuote&&finite(a.ageLatestSeconds)&&a.ageLatestSeconds>=0&&a.ageLatestSeconds<=result.cfg.maxAge))return 'Le quote devono avere timestamp e superare il filtro di età rispetto allo snapshot.';
 if(a.unverifiedContractIdentity)return 'Per archiviare la Q e stimare P servono radice e scadenza contrattuale esplicite nel CSV.';
 const src=result.forward?.source||'';
 if(src.startsWith('Parità'))return '';
 if(src==='Forward manuale'){
  const meta=settings.manualForward||{};let time=NaN;try{time=parseUTC(meta.timestamp);}catch(_e){}
  const lag=(settings.pitContext?.origin-time)/1000;
  return typeof meta.source==='string'&&meta.source.trim().length>1&&finite(lag)&&lag>=0&&lag<=result.cfg.maxAge?'':'Documenta fonte e timestamp del forward osservato nel riquadro Archivio PIT. Il forward deve essere disponibile e fresco allo snapshot.';
 }
 return 'Il forward è stimato dal carry e può ereditare uno spot obsoleto. Per P storica e archivio usa parità put–call o un forward osservato documentato.';
}
function parseUTC(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s))throw new Error('Timestamp ISO con Z o offset esplicito richiesto.');
 const ms=Date.parse(s), date=s.slice(0,10);
 if(Number(s.slice(11,13))>23||Number(s.slice(14,16))>59||!finite(ms)||isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Data UTC non valida.');
 return ms;
}
function historyRow(row){
 const origin=parseUTC(row.asof_utc),end=parseUTC(row.expiry_utc),published=parseUTC(row.available_utc);
 const raw=String(row.pit_q??'').trim(),u=Number(raw),series=String(row.series||'').trim().toUpperCase();
 if(!(origin<end&&published>=end&&raw&&finite(u)&&u>=0&&u<=1&&/^[A-Z0-9._@:-]{1,80}$/.test(series)))throw new Error('Riga PIT non valida. Controlla serie, ordine dei timestamp e PIT in [0,1].');
 const flag=String(row.support_breach??'').trim().toLowerCase();
 if(!['','1','0','true','false'].includes(flag))throw new Error('support_breach deve essere 0, 1 o vuoto.');
 const support_breach=flag===''?null:Number(flag==='1'||flag==='true');
 return {series,support_breach,asof_utc:new Date(origin).toISOString(),expiry_utc:new Date(end).toISOString(),available_utc:new Date(published).toISOString(),pit_q:u};
}
function readHistory(text){
 const lines=text.trim().replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim()),header=lines.shift()||'',sep=header.includes(';')?';':',';
 const split=line=>line.split(sep).map(v=>v.trim().replace(/^"(.*)"$/,'$1'));
 const fields=split(header);if(![HIST_FIELDS.join(','),HIST_FIELDS.slice(0,-1).join(',')].includes(fields.join(',')))throw new Error('Schema dello storico PIT errato. Scarica il CSV modello.');
 if(lines.length>25000)throw new Error('Massimo 25.000 righe per importazione.');
 return lines.map((line,i)=>{try{const cells=split(line);if(cells.length!==fields.length)throw new Error('Numero di campi non valido.');return historyRow(Object.fromEntries(fields.map((f,j)=>[f,cells[j]])));}catch(e){throw new Error('Riga '+(i+2)+' · '+e.message);}});
}
function mergeHistory(current,add){
 const rows=new Map();for(const raw of [...current,...add]){const row=historyRow(raw),key=[row.series,row.asof_utc,row.expiry_utc].join('|'),prev=rows.get(key);
 if(prev&&(prev.pit_q!==row.pit_q||prev.available_utc!==row.available_utc||(prev.support_breach!==null&&row.support_breach!==null&&prev.support_breach!==row.support_breach)))throw new Error('Duplicato discordante per '+row.asof_utc+'. Correggi la fonte e ricarica lo storico.');
 if(prev&&row.support_breach===null)row.support_breach=prev.support_breach;rows.set(key,row);}if(rows.size>25000)throw new Error('Massimo 25.000 osservazioni per archivio.');return [...rows.values()].sort((a,b)=>a.asof_utc.localeCompare(b.asof_utc));
}
function pitMap(counts){
 // ∑ wⱼ Beta(j+1,6−j); corresponding CDF expressed in Bernstein basis of degree six.
 const n=counts.reduce((a,b)=>a+b,0),weights=counts.map(c=>(c+PIT_PRIOR/PIT_BINS)/(n+PIT_PRIOR));
 const choose5=[1,5,10,10,5,1],choose6=[1,6,15,20,15,6,1],acc=[0];for(const w of weights)acc.push(acc.at(-1)+w);
 const density=u=>weights.reduce((s,w,j)=>s+6*w*choose5[j]*u**j*(1-u)**(5-j),0);
 const cdf=u=>u<=0?0:u>=1?1:acc.reduce((s,a,j)=>s+a*choose6[j]*u**j*(1-u)**(6-j),0);
 return {cdf,density,weights};
}
/* Paired errors share the same forecast date and realized event. A Bartlett
   HAC estimate allows serial dependence between adjacent evaluation dates. */
function validationDetail(oos){
 const n=oos.length,bucketsQ=Array(10).fill(0),bucketsP=Array(10).fill(0);
 for(const v of oos){
  bucketsQ[Math.min(9,Math.floor(10*v.uq))]++;
  bucketsP[Math.min(9,Math.floor(10*v.up))]++;
 }
 const series=oos.map(v=>v.qBrier-v.pBrier);
 const difference=n?series.reduce((a,b)=>a+b,0)/n:null;
 const lag=n?Math.min(n-1,Math.floor(4*(n/100)**(2/9))):0;
 let interval=null,standardError=null;
 if(n>=30){
  const residuals=series.map(v=>v-difference);
  let longVariance=residuals.reduce((s,v)=>s+v*v,0)/n;
  for(let k=1;k<=lag;k++){
   let covariance=0;
   for(let i=k;i<n;i++)covariance+=residuals[i]*residuals[i-k];
   longVariance+=2*(1-k/(lag+1))*covariance/n;
  }
  standardError=Math.sqrt(Math.max(0,longVariance)/n);
  interval=[difference-1.95996398454*standardError,difference+1.95996398454*standardError];
 }
 return{n,bucketsQ,bucketsP,difference,standardError,interval,lag};
}

// At a historical origin, non-overlapping training windows must be selected
// from labels already published at that origin. A later revision of the
// available candidates cannot displace an observation that was known then.
function publishedTraining(eligible,priority){
 const ordered=eligible.slice().sort((a,b)=>a.origin-b.origin||a.end-b.end);
 const family=new Map();let block=null;
 for(const row of ordered){
  if(!block||row.origin>=block.end)block={end:row.end,active:[],selected:[]};
  else block.end=Math.max(block.end,row.end);
  family.set(row,block);
 }
 const released=ordered.slice().sort((a,b)=>a.available-b.available),counts=Array(PIT_BINS).fill(0);
 let cursor=0,n=0,bad=0;
 const count=(r,weight)=>{n+=weight;counts[Math.min(PIT_BINS-1,Math.floor(PIT_BINS*r.u))]+=weight;if(r.u===0||r.u===1||r.breach===1)bad+=weight;};
 return origin=>{
  const changed=new Set();
  while(cursor<released.length&&released[cursor].available<origin){
   const r=released[cursor++],b=family.get(r);b.active.push(r);changed.add(b);
  }
  for(const b of changed){
   for(const r of b.selected)count(r,-1);
   b.selected=[];b.active.sort(priority);
   let end=-Infinity;
   for(const r of b.active)if(r.origin>=end){count(r,1);b.selected.push(r);end=r.end;}
  }
  return {n,bad,counts};
 };
}

function calibrate(history,context){
 const expectedClock=fixingClock(context.end),horizon=context.end-context.origin,tolerance=Math.max(60000,Math.min(15*60000,.05*horizon));
 const eligible=[],rejected={series:0,horizon:0,notKnown:0,overlap:0,fixing:0},rows=mergeHistory([],history);
 for(const r of rows){const origin=Date.parse(r.asof_utc),end=Date.parse(r.expiry_utc),available=Date.parse(r.available_utc);
 if(r.series!==context.series){rejected.series++;continue;}
 if(fixingClock(end)!==expectedClock||end%60000!==context.end%60000){rejected.fixing++;continue;}
 if(Math.abs(end-origin-horizon)>tolerance){rejected.horizon++;continue;}
 if(available>=context.origin){rejected.notKnown++;continue;}
 eligible.push({origin,end,available,u:r.pit_q,breach:r.support_breach});}
 // One observation per non-overlapping window, closest horizon first for duplicate maturities.
 const priority=(a,b)=>a.end-b.end||Math.abs(a.end-a.origin-horizon)-Math.abs(b.end-b.origin-horizon)||a.origin-b.origin;eligible.sort(priority);
 const distinct=[];let lastEnd=-Infinity;for(const r of eligible){if(r.origin<lastEnd){rejected.overlap++;continue;}distinct.push(r);lastEnd=r.end;}
 const training=publishedTraining(eligible,priority),alphas=[.05,.25,.5,.75,.95],oos=[];
 const bin=u=>Math.min(PIT_BINS-1,Math.floor(PIT_BINS*u));
 for(const r of distinct){const known=training(r.origin);
 if(known.n<PIT_MIN||known.bad)continue;const map=pitMap(known.counts),up=map.cdf(r.u);
 let qBrier=0,pBrier=0;for(const a of alphas){const outcome=Number(r.u<=a);qBrier+=(outcome-a)**2;pBrier+=(outcome-map.cdf(a))**2;}
 oos.push({uq:r.u,up,qBrier:qBrier/alphas.length,pBrier:pBrier/alphas.length,q80:Number(r.u>=.1&&r.u<=.9),p80:Number(up>=.1&&up<=.9),q95:Number(r.u>=.025&&r.u<=.975),p95:Number(up>=.025&&up<=.975),relativeLog:r.u>0&&r.u<1&&r.breach!==1?Math.log(map.density(r.u)):null});}
 const all=Array(PIT_BINS).fill(0);for(const r of distinct)all[bin(r.u)]++;
 const avg=key=>oos.length?oos.reduce((s,r)=>s+r[key],0)/oos.length:null;
 const metrics={detail:validationDetail(oos),n:oos.length,brierQ:avg('qBrier'),brierP:avg('pBrier'),cover80Q:avg('q80'),cover80P:avg('p80'),cover95Q:avg('q95'),cover95P:avg('p95'),meanLogGain:oos.length&&oos.every(r=>r.relativeLog!==null)?avg('relativeLog'):null};
 return{n:distinct.length,minimum:PIT_MIN,bins:PIT_BINS,prior:PIT_PRIOR,counts:all,map:pitMap(all),rejected,metrics,toleranceMinutes:tolerance/60000,supportBreaches:distinct.filter(r=>r.breach===1).length,supportUnverified:distinct.filter(r=>r.breach===null).length,endpointHits:distinct.filter(r=>r.u===0||r.u===1).length,lastAvailable:distinct.length?new Date(Math.max(...distinct.map(r=>r.available))).toISOString():null};
}
function modeled(q,pdf,cdfGiven,provenance,status,metadata){
 const edges=q._edges,support=q.support.slice(),cum=[0],segmentMass=[];for(let i=1;i<edges.length;i++){const mass=quad(pdf,edges[i-1],edges[i]);segmentMass.push(mass);cum.push(cum.at(-1)+mass);}
 const mass=cum.at(-1);if(!finite(mass)||Math.abs(mass-1)>2e-7)throw new Error('Normalizzazione del modello P oltre la tolleranza.');
 const cdf=cdfGiven||(x=>{if(x<=support[0])return 0;if(x>=support[1])return 1;const j=locate(edges,x);return clamp(cum[j]+quad(pdf,edges[j],x),0,1);});
 const quantile=u=>{if(!(u>=0&&u<=1))throw new Error('Percentile fuori [0,1].');if(u===0)return support[0];if(u===1)return support[1];let l=support[0],r=support[1];for(let i=0;i<63;i++){const m=(l+r)/2;if(cdf(m)<u)l=m;else r=m;}return r;};
 const d={name:'P',status,coordinate:q.coordinate,provenance,isIdentity:false,support,_edges:edges,integrationWindow:support,pdf,cdf,quantile,mass,tilt:metadata,integrate:(fn,l,h)=>integratePieces(edges,x=>fn(x)*pdf(x),l,h)};
 addPhysicalTails(d,edges,segmentMass);d.expect=fn=>d.integrate(fn,...support);moments(d);return d;
}
function crra(q,gamma){
 if(!finite(gamma)||gamma<0||gamma>30)throw new Error('Usa γ compreso fra 0 e 30.');
 const provenance='Scenario CRRA sulla finestra numerica troncata. Si assume un pricing kernel proporzionale a S_T^(−γ) sullo stesso orizzonte e si normalizza q(s)·s^γ.';
 if(gamma===0)return{...physical(q,0,1),provenance,tilt:{gamma,kl:0}};
 const w=x=>(x/q.mean)**gamma,z=q.expect(w);if(!(z>0&&finite(z)))throw new Error('Normalizzatore CRRA non valido.');
 const d=modeled(q,x=>x<q.support[0]||x>q.support[1]?0:q.pdf(x)*w(x)/z,null,provenance,'uncalibrated',{gamma,normalizer:z});d.tilt.kl=Math.max(0,d.expect(x=>gamma*Math.log(x/q.mean)-Math.log(z)));return d;
}
function pitPhysical(q,fit){
 const h=fit.map,desc='Ricalibrazione storica dei PIT: F_P(s)=H(F_Q(s)); H è una mistura Bernstein regolarizzata. Previsione statistica candidata.';
 const d=modeled(q,x=>q.pdf(x)*h.density(q.cdf(x)),x=>h.cdf(q.cdf(x)),desc,'empirical_pit',{weights:h.weights});
 d.tilt.kl=Math.max(0,quad(u=>h.density(u)*Math.log(h.density(u)),0,1));d.isIdentity=Math.max(...h.weights.map(w=>Math.abs(w-1/PIT_BINS)))<1e-14;return d;
}

function build(result,options={}){
 const {history=[],...opts}=options;const settings={coordinate:'native',physicalMode:'empirical',meanShift:0,volRatio:1,gamma:3,...opts};if(!['native','mapped'].includes(settings.coordinate))throw new Error('Sistema di coordinate non valido.');
 const q=base(result,settings.coordinate);let p=null,pReason='',pitValidation=null;
 if(settings.physicalMode==='entropy')p=physical(q,settings.meanShift,settings.volRatio);
 else if(settings.physicalMode==='crra')p=crra(q,settings.gamma);
 else if(settings.physicalMode==='empirical'){
  const ctx=settings.pitContext;
  const sourceIssue=sourceFailure(result,settings);
  if(sourceIssue)pReason='P storica indisponibile: '+sourceIssue;
  else if(!ctx||!finite(ctx.origin)||!finite(ctx.end)||ctx.end<=ctx.origin||!(result.cfg.symbol||'').trim())pReason='Mancano serie o timestamp affidabili per selezionare lo storico.';
  else {const fit=calibrate(history,ctx);const {map,...audit}=fit;pitValidation=audit;
   if(fit.endpointHits)pReason='Stima P sospesa: '+fit.endpointHits+' PIT esattamente a 0 o 1. Verifica il supporto di Q e carica i PIT a piena precisione.';
   else if(fit.supportBreaches)pReason='Stima P sospesa: '+fit.supportBreaches+' esiti in intervalli senza massa sotto Q. Verifica e ristima le curve storiche interessate.';
   else if(fit.n>=PIT_MIN)p=pitPhysical(q,fit);
   else pReason='P storica indisponibile: '+fit.n+' osservazioni compatibili su '+PIT_MIN+' richieste dal modello. La chain attuale consente di stimare Q.';
  }
 }else throw new Error('Metodo P sconosciuto.');
 const selectedLiquid=result.ws.nativeLiquid||[NaN,NaN],liquid=settings.coordinate==='mapped'?selectedLiquid.map(x=>result.ws.mapping.map(x)):selectedLiquid.slice();
 const diagnostics={version:VERSION,cviFingerprint:result.ws.model.cvi.certificate.fingerprint,integrationWindow:q.support,omittedMass:q.cdf(q.support[0])+q.survival(q.support[1]),qMass:q.mass,pMass:p?.mass??null,normalizationError:Math.max(Math.abs(q.mass-1),p?Math.abs(p.mass-1):0),
  qMeanError:settings.coordinate==='native'?q.mean-result.ws.model.F:q.mean-result.ws.mapping.anchor,
  pCalibration:p?.status==='empirical_pit'?'PIT_ESTIMATE':p?'SCENARIO_ASSUMED':'UNAVAILABLE',physicalMode:settings.physicalMode,pReason,pitValidation,isIdentity:p?.isIdentity??null,kl:p?.tilt?.kl??null,solverError:p?.tilt?.error??null,liquid,
  qTailOutsideQuotes:finite(liquid[0])?q.cdf(liquid[0])+q.survival(liquid[1]):null,
  pTailOutsideQuotes:p&&finite(liquid[0])?p.cdf(liquid[0])+p.survival(liquid[1]):null,
  quality:result.quality?.level||'unknown',qualityLabel:result.quality?.label||'',
  quoteSource:result.cfg.quoteSource,synthetic:result.cfg.quoteSource==='iv',snapshot:result.cfg.asof,expiry:result.cfg.expiry+'T'+result.cfg.expiryTime,
  target:settings.coordinate==='native'?result.cfg.expiry+'T'+result.cfg.expiryTime:result.cfg.target,
  warnings:[p?.provenance||pReason,'Q è valutata su prezzi positivi. I momenti usano una finestra di quadratura finita. I quantili estremi dipendono dall’estrapolazione.','Probabilità terminali: nessuna probabilità di tocco, inversione o first passage è identificata.']};
 if(settings.coordinate==='mapped')diagnostics.warnings.push('Coordinate ribasate/target: trasformazione di scenario della Q originaria, non marginale direttamente prezzata dalle opzioni.');
 if(diagnostics.synthetic)diagnostics.warnings.push('I prezzi sono sintetizzati dalle IV: non è una distribuzione estratta direttamente da bid/ask.');
 if(diagnostics.quality==='red')diagnostics.warnings.push('Controlli qualità del fit non superati: risultati esclusivamente diagnostici.');
 return{version:VERSION,q,p,diagnostics,settings};
}
const PROBS=[.001,.005,.01,.025,.05,.1,.16,.25,.5,.75,.84,.9,.95,.975,.99,.995,.999];
const COVERAGES=[.5,.68,.8,.9,.95,.99];
function event(dist,a,b){a=Number(a);b=Number(b);if(!finite(a)||!finite(b)||a>b)throw new Error('Intervallo non valido: serve A ≤ B con valori finiti.');const below=dist.cdf(a),above=dist.survival?dist.survival(b):1-dist.cdf(b),inside=below>.5&&dist.survival?dist.survival(a)-above:dist.cdf(b)-below;return{a,b,below,inside:Math.max(0,inside),above};}
function summary(dist,reference){if(!(finite(reference)&&reference>0))throw new Error('Riferimento positivo richiesto.');
 const quantiles=PROBS.map(p=>({p,price:dist.quantile(p)}));
 const intervals=COVERAGES.map(coverage=>({coverage,lower:dist.quantile((1-coverage)/2),upper:dist.quantile((1+coverage)/2)}));
 const tailExpected=[.01,.025,.05].map(alpha=>{const lower=dist.quantile(alpha),upper=dist.quantile(1-alpha);return{alpha,lowerQuantile:lower,upperQuantile:upper,lowerES:dist.integrate(x=>x,dist.support[0],lower)/alpha,upperES:dist.integrate(x=>x,upper,dist.support[1])/alpha,downsideVaR:reference-lower,upsideVaR:upper-reference};});
 const downside=dist.integrate(x=>reference-x,dist.support[0],reference),upside=dist.integrate(x=>x-reference,reference,dist.support[1]);
 return{name:dist.name,status:dist.status,provenance:dist.provenance,isIdentity:!!dist.isIdentity,reference,mean:dist.mean,median:dist.median,sd:dist.sd,variance:dist.variance,skew:dist.skew,excess:dist.excess,mode:dist.mode,support:dist.support.slice(),supportInterpretation:'Numerical integration window',nativePriceDomain:dist.name==='Q'?[0,'Infinity']:null,pBelow:dist.cdf(reference),pAbove:dist.survival?dist.survival(reference):1-dist.cdf(reference),expectedAbsMove:upside+downside,upside,downside,expectedReturn:dist.mean/reference-1,quantiles,intervals,tailExpected};
}
function report(bundle,reference){return{version:VERSION,settings:bundle.settings,diagnostics:bundle.diagnostics,q:summary(bundle.q,reference),p:bundle.p?{...summary(bundle.p,reference),tilt:bundle.p.tilt}:null,method:{q:'Native CVI mark; analytic digital and density; moments by finite-window quadrature.',p:bundle.p?.provenance||bundle.diagnostics.pReason,calibration:bundle.diagnostics.pCalibration,support:'Native CVI on positive prices with extrapolated wings. Numerical moment integration uses a finite window.',quadrature:'16-point Gauss–Legendre, subdivided at every inherited density knot; continuous CDF integration and inverse CDF.',paths:'A terminal marginal does not identify a dynamic path law.'}};}
return{VERSION,build,physical,crra,pitPhysical,historyRow,readHistory,mergeHistory,calibrate,pitMap,fixingClock,sourceFailure,HIST_FIELDS,summary,event,report,PROBS,COVERAGES};
});

