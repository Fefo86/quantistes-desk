/* Read-only analytics operating on the existing fitted curves. */
(function(root){
'use strict';
const finite=Number.isFinite,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function ivAt(r,k){
 const m=r.ws.model,K=m.F*Math.exp(k),side=k<0?'PUT':'CALL';
 const w=root.CVIFit.evaluate(m.cvi.canonical,k).w;
 return {k,K,w:w>0?w:null,iv:w>0?Math.sqrt(w/r.T):null,within:K>=r.ws.nativeLiquid[0]&&K<=r.ws.nativeLiquid[1]};
}
function calendar(a,b){
 const x=a.ws.model.cvi,y=b.ws.model.cvi;
 const c=root.CVICert.calendar(x.canonical,y.canonical,{nearContext:x.context,farContext:y.context});
 const w=c.witness?.k;
 return {status:c.status,margin:c.minimumDifferenceBound??null,worstU:Number.isFinite(w)?Math.exp(w):null,passes:c.status==='CERTIFIED',reason:c.reason,fingerprint:c.fingerprint,coordinate:'varianza totale a log(K/F) comune'};
}
const sum=a=>a.reduce((s,v)=>s+v,0);
function sampleMesh(dist,n=2){
 const edges=dist._edges,grid=[];
 for(let i=1;i<edges.length;i++)for(let j=0;j<n;j++)grid.push(edges[i-1]+(edges[i]-edges[i-1])*j/n);
 grid.push(edges.at(-1));return grid;
}
function hdi(d,mass){
 if(!(mass>0&&mass<1))throw Error('Massa HDI tra zero e uno richiesta.');
 const x=sampleMesh(d,3),density=x.map(d.pdf),highest=Math.max(...density);
 function pieces(threshold){
  const ranges=[];let start=density[0]>=threshold?x[0]:null;
  for(let i=1;i<x.length;i++){
   const prev=density[i-1]>=threshold,now=density[i]>=threshold;
   if(now===prev)continue;
   let lo=x[i-1],hi=x[i];
   for(let r=0;r<26;r++){const middle=(lo+hi)/2;if((d.pdf(middle)>=threshold)===prev)lo=middle;else hi=middle;}
   const crossing=(lo+hi)/2;
   if(now)start=crossing;else {ranges.push([start,crossing]);start=null;}
  }
  if(start!==null)ranges.push([start,x.at(-1)]);
  return {ranges,actual:sum(ranges.map(([a,b])=>d.cdf(b)-d.cdf(a)))};
 }
 let lo=0,hi=highest;
 for(let i=0;i<37;i++){const mid=(lo+hi)/2;if(pieces(mid).actual>=mass)lo=mid;else hi=mid;}
 const ans=pieces(lo);return {...ans,cutoff:lo,requested:mass,resolved:Math.abs(ans.actual-mass)<.0001};
}
function trap(x,f){let v=0,last=f(x[0]);for(let i=1;i<x.length;i++){const nv=f(x[i]);v+=(x[i]-x[i-1])*(nv+last)/2;last=nv;}return v;}
function inLogReturns(d,F){
 const cv=x=>F*Math.exp(x),edges=d._edges.map(s=>Math.log(s/F));
 return {_edges:edges,pdf:x=>d.pdf(cv(x))*cv(x),cdf:x=>d.cdf(cv(x)),quantile:u=>Math.log(d.quantile(u)/F)};
}
function lawMetrics(b,a,coordinate='price'){
 const q=b.q,p=b.p,F=q.mean,view=d=>coordinate==='return'?inLogReturns(d,F):d,base={qHD:hdi(view(q),a),pHD:p?hdi(view(p),a):null};if(!p)return base;
 const x=sampleMesh(q,8),tail=p.quantile(.05),pq=q.cdf(tail),pp=p.cdf(tail),density=(d,v)=>Math.max(0,d.pdf(v));
 const div=(d,e)=>d.expect(s=>{const f=density(d,s),g=density(e,s);return f>0?Math.log(2*f/(f+g)):0;});
 const js=.5*(div(q,p)+div(p,q));
 const left=[...x.filter(k=>k<tail),tail];
 const w1=trap(x,k=>Math.abs(q.cdf(k)-p.cdf(k))),w1left=pp>0&&pq>0?trap(left,k=>Math.abs(q.cdf(k)/pq-p.cdf(k)/pp)):null;
 // Midpoint quadrature in u after u=sin²(t), finer near the 0 and 1 tails.
 function w2(N){let v=0;for(let i=0;i<N;i++){const t=(i+.5)*Math.PI/(2*N),u=Math.sin(t)**2;v+=(p.quantile(u)-q.quantile(u))**2*Math.sin(2*t);}return Math.sqrt(v*Math.PI/(2*N));}
 const coarse=w2(48),fine=w2(96),offset=d=>d.expect(z=>{const y=d.pdf(z);return y>0?-Math.log(y*z):0;});
 const ref=q.mean;
 function shape(d){const mu=d.expect(s=>Math.log(s/ref)),variance=d.expect(s=>(Math.log(s/ref)-mu)**2);return {mu,variance,skew:d.expect(s=>(Math.log(s/ref)-mu)**3)/variance**1.5,excess:d.expect(s=>(Math.log(s/ref)-mu)**4)/variance**2-3};}
 const sq=shape(q),sp=shape(p);
 function kernel(logm){const spot=ref*Math.exp(logm),f=q.pdf(spot),g=p.pdf(spot);return f>0&&g>0?Math.log(f/g):null;}
 const vals=[-.001,0,.001].map(kernel);const common=vals.every(finite);
 return {...base,js:Math.min(Math.log(2),Math.max(0,js)),kl:p.tilt?.kl??null,w1,w2:fine,w2Delta:Math.abs(coarse-fine),w1left,
  quantileGaps:[.05,.25,.5,.75,.95].map(u=>({u,gap:Math.log(q.quantile(u)/p.quantile(u))})),ratio:pp>0?pq/pp:null,threshold:tail,qTail:pq,pTail:pp,entropyGap:offset(q)-offset(p),skewPremium:sq.skew-sp.skew,kurtPremium:sq.excess-sp.excess,
  logKernelAtForward:vals[1],slope:common?(vals[2]-vals[0])/.002:null,curvature:common?(vals[2]-2*vals[1]+vals[0])/1e-6:null};
}
function prepareStrategy(legs,D,fee,multiplier){
 if(!(D>0&&finite(D)&&multiplier>0&&fee>=0&&finite(fee)&&finite(multiplier))||!legs.length)throw Error('Controlla commissioni, moltiplicatore e gambe.');
 let paid=0,fees=0;
 for(const l of legs){
  if(!['CALL','PUT'].includes(l.side)||!Number.isSafeInteger(l.n)||!l.n||!(l.K>0&&finite(l.K)&&l.price>=0&&finite(l.price)))throw Error('Gamba non valida.');
  paid+=l.n*l.price;fees+=Math.abs(l.n)*fee/multiplier;
 }
 const carry=(paid+fees)/D;if(!finite(carry))throw Error('Costo del portafoglio fuori scala.');
 const payoff=s=>sum(legs.map(l=>l.n*Math.max(0,l.side==='CALL'?s-l.K:l.K-s)))-carry;
 return {paid,fees,carry,payoff,knots:[...new Set(legs.map(l=>l.K))].sort((a,b)=>a-b)};
}
function strategyRisk(d,strategy,alpha=.05){
 if(!(alpha>0&&alpha<1))throw Error('Probabilità di coda tra zero e uno richiesta.');
 const {payoff,knots}=strategy,[lo,hi]=d.support,edges=[lo,...knots.filter(k=>lo<k&&k<hi),hi];
 const segs=edges.slice(1).map((right,i)=>{const left=edges[i],v0=payoff(left),v1=payoff(right),s=(v1-v0)/(right-left);return {left,right,v0,v1,s,mass:d.cdf(right)-d.cdf(left)};});
 const vals=edges.map(payoff);
 function cut(seg,target,inclusive){
  if(Math.abs(seg.s)<1e-12)return (inclusive?seg.v0<=target:seg.v0<target)?[seg.left,seg.right]:null;
  const cross=clamp(seg.left+(target-seg.v0)/seg.s,seg.left,seg.right);
  return seg.s>0?[seg.left,cross]:[cross,seg.right];
 }
 function payoutCdf(v,inc=true){let prob=0;for(const s of segs){const range=cut(s,v,inc);if(range)prob+=d.cdf(range[1])-d.cdf(range[0]);}return clamp(prob,0,1);}
 const floor=Math.min(...vals),cap=Math.max(...vals);let a=floor,b=cap;
 // Lower generalized quantile of the LOSS itself. With an exact boundary atom
 // and a gap in attainable P&L, -lowerQuantile(P&L, alpha) selects the wrong side.
 let lossLo=-cap,lossHi=-floor;
 const conf=1-alpha;
 for(let i=0;i<70;i++){const loss=(lossLo+lossHi)/2;if(1-payoutCdf(-loss,false)>=conf)lossHi=loss;else lossLo=loss;}
 let lossVaR=lossHi;
 for(const seg of segs)if(seg.s===0&&Math.abs(lossVaR+seg.v0)<=1e-12*Math.max(1,Math.abs(seg.v0))&&1-payoutCdf(seg.v0,false)>=conf){lossVaR=-seg.v0;break;}
 for(let i=0;i<60;i++){const m=(a+b)/2;if(payoutCdf(m)>=alpha)b=m;else a=m;}
 let q=b;for(const s of segs)if(s.s===0&&Math.abs(q-s.v0)<1e-9*Math.max(1,Math.abs(q))&&payoutCdf(s.v0)>=alpha&&payoutCdf(s.v0,false)<=alpha){q=s.v0;break;}
 let worst=0;for(const s of segs){const rng=cut(s,q,false);if(rng&&rng[1]>rng[0])worst+=d.integrate(payoff,...rng);}
 const below=payoutCdf(q,false);worst+=Math.max(0,alpha-below)*q;
 const expected=sum(segs.map(s=>d.integrate(payoff,s.left,s.right))),probLoss=payoutCdf(0,false),atZero=Math.max(0,payoutCdf(0)-probLoss);
 return {expected,probWin:1-payoutCdf(0),probLoss,probFlat:atZero,var95:lossVaR,es95:-worst/alpha,minOnSupport:floor,maxOnSupport:cap};
}
root.ResearchMath={ivAt,calendar,hdi,lawMetrics,prepareStrategy,strategyRisk};
})(globalThis);
