/* Convex Volatility Interpolation: total-variance natural cubic spline, linear wings.
   Local constrained convex subproblems are solved in nodal-value coordinates.
   Candidate generation only; the independent certificate is authoritative. */
(function(root){
'use strict';
const version='CVI_BROWSER_SCP_1.0',finite=Number.isFinite;
const defaults=Object.freeze({lambdaTV:0.0003,spreadFloor:0.004,minG:0.0003,wingMargin:2e-7,wingCap:1.98,
 maxOuter:16,knotCount:15,trust:1,lambdaTime:0,varianceFloor:1e-10});
const zeros=n=>Array(n).fill(0), dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),maxAbs=a=>a.reduce((v,x)=>Math.max(v,Math.abs(x)),0);
function sorted(xs){return [...new Set(xs)].sort((a,b)=>a-b);}
function median(xs){const a=xs.slice().sort((x,y)=>x-y),i=a.length>>1;return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function curve(c){
 const {knots:x,curvature:d}=c,a=[c.v0],b=[c.slope0];for(let i=0;i<x.length-1;i++){const h=x[i+1]-x[i];
  a.push(a[i]+h*(b[i]+h*(2*d[i]+d[i+1])/6));b.push(b[i]+h*(d[i]+d[i+1])/2);}
 return {x,d,a,b};
}
function evalCurve(s,k){
 const {x,d,a,b}=s,n=x.length;if(k<=x[0])return {w:a[0]+b[0]*(k-x[0]),wp:b[0],wpp:0};
 if(k>=x[n-1])return {w:a[n-1]+b[n-1]*(k-x[n-1]),wp:b[n-1],wpp:0};
 let l=0,r=n-1;while(r-l>1){const m=(r+l)>>1;if(k<x[m])r=m;else l=m;}
 const u=k-x[l],D=(d[r]-d[l])/(x[r]-x[l]);return {w:a[l]+u*(b[l]+u*(d[l]/2+u*D/6)),wp:b[l]+u*(d[l]+u*D/2),wpp:d[l]+u*D};
}
function evaluate(c,k){return evalCurve(curve(c),k);}
function fromNodes(knots,y){
 const n=knots.length,h=knots.slice(1).map((v,i)=>v-knots[i]),up=zeros(n),rhs=zeros(n),d=zeros(n);
 for(let i=1;i<n-1;i++){
  const diag=2*(h[i-1]+h[i])-h[i-1]*up[i-1];
  up[i]=h[i]/diag;rhs[i]=(6*((y[i+1]-y[i])/h[i]-(y[i]-y[i-1])/h[i-1])-h[i-1]*rhs[i-1])/diag;
 }
 for(let i=n-2;i>0;i--)d[i]=rhs[i]-up[i]*d[i+1];
 return {knots:knots.slice(),v0:y[0],slope0:(y[1]-y[0])/h[0]-h[0]*d[1]/6,curvature:d};
}
function gValue(k,w,p,c){const a=1-k*p/(2*w);return a*a-p*p/(4*w)-p*p/16+c/2;}
function cdf(x){
 if(x===0)return .5;const a=Math.abs(x),density=Math.exp(-a*a/2)/Math.sqrt(2*Math.PI);let tail;
 if(a>38)tail=0;else if(a>=3){let v=0;for(let j=130;j>0;j--)v=j/(a+v);tail=density/(a+v);}
 else{let t=a,s=a;for(let j=3;j<201;j+=2){t*=a*a/j;const v=s+t;if(v===s)break;s=v;}tail=.5-density*s;}
 return x<0?tail:1-tail;
}
function price(F,D,k,w,side){
 if(!(w>0&&F>0&&D>0))return NaN;const y=Math.sqrt(w),u=Math.exp(k),a=-k/y+y/2,b=a-y,put=String(side).toUpperCase().startsWith('P');
 if(k<0){const p=u*cdf(-b)-cdf(-a);return F*D*(put?p:p+1-u);}
 const c=cdf(a)-u*cdf(b);return F*D*(put?c+u-1:c);
}
function makeNodes(points,scale,count){
 const ms=points.filter(o=>o.wMid>0).map(o=>o.k),min=Math.min(...ms),max=Math.max(...ms);
 if(!(min<0&&max>0))throw Error('Quote bilaterali richieste da entrambi i lati del forward.');
 // Anchor knots at zero and extend knots up to twenty anchor standard deviations.
 const nEach=(count-1)>>1,out=[0];
 for(const sign of [-1,1]){
  const edge=sign<0?-min:max,zEdge=Math.min(20,edge/scale);
  for(let i=1;i<=nEach;i++){const u=i/nEach,dist=zEdge*Math.sinh(2.3*u)/Math.sinh(2.3);
   out.push(sign*dist*scale);}
 }
 return sorted(out);
}
function basis(slice,cfg,j,offset){
 const {F,D,T,points}=slice;if(!(F>0&&D>0&&T>0&&finite(T)&&points?.length))throw Error('Input di calibrazione F, D, T o quote non valido.');
 const two=points.filter(o=>o.wMid>0&&finite(o.k)&&o.wAsk>=o.wBid&&o.wBid>=0);
 if(two.length<7)throw Error('Occorrono almeno sette quote bilaterali utilizzabili.');
 const ranked=two.slice().sort((a,b)=>Math.abs(a.k)-Math.abs(b.k));
 const w0=slice.anchor>0?slice.anchor**2*T:median(ranked.slice(0,5).map(o=>o.wMid));
 const count=clamp(2*Math.floor((Math.min(cfg.knotCount,two.length)-1)/2)+1,5,35);
 const knots=cfg.knots?.slice()||makeNodes(two,Math.sqrt(w0),count),n=knots.length;
 if(n<3||n>35||!knots.includes(0)||knots.some((v,i)=>!finite(v)||(i&&v<=knots[i-1])))throw Error('Nodi in k non validi: includere zero e ordinare strettamente.');
 const modes=knots.map((_,i)=>{const y=zeros(n);y[i]=w0;return curve(fromNodes(knots,y));});
 const cache=new Map();
 const at=k=>{if(!cache.has(k)){const vals=modes.map(s=>evalCurve(s,k));cache.set(k,{w:vals.map(v=>v.w),wp:vals.map(v=>v.wp),wpp:vals.map(v=>v.wpp)});}return cache.get(k);};
 const op=(v)=>({i:offset,v});
 const grid=knots.flatMap((k,i)=>i===n-1?[k]:[0,.2,.4,.6,.8].map(t=>k+t*(knots[i+1]-k)));
 for(const sign of [-1,1])for(const d of [.2,.6,1.5,4,12,50,300])grid.push((sign<0?knots[0]:knots[n-1])+sign*d*Math.sqrt(w0));
 for(const v of cfg.extraK||[])if(finite(v))grid.push(v);
 if(cfg.extraSliceK?.[j])for(const v of cfg.extraSliceK[j])if(finite(v))grid.push(v);
 const tv=knots.slice(1).map((k,i)=>op(at(k).wpp.map((a,l)=>a-at(knots[i]).wpp[l])));
 const floor=w0*cfg.spreadFloor;
 const avgW=two.reduce((s,o)=>s+(w0/Math.max(o.wAsk-o.wBid,floor))**2,0)/two.length;
 const weightSide=(o,d)=>{const v=d>0?o.vegaAsk:o.vegaBid;return finite(v)&&v>0?v:finite(o.vega)&&o.vega>0?o.vega:1e-10;};
 const sumA=points.reduce((s,o)=>s+(o.wAsk>0?weightSide(o,1):0),0),sumB=points.reduce((s,o)=>s+(o.wBid>0?weightSide(o,-1):0),0);
 const observations=[],level=o=>op(at(o.k).w.map(a=>a/w0));
 for(const o of points){
  if(o.wMid>0&&o.wBid>=0&&o.wAsk>=o.wBid)observations.push({row:level(o),target:o.wMid/w0,weight:(w0/Math.max(floor,o.wAsk-o.wBid))**2/two.length,side:0});
  if(o.wAsk>0)observations.push({row:level(o),target:o.wAsk/w0,weight:avgW*weightSide(o,1)/sumA,side:1});
  if(o.wBid>0)observations.push({row:level(o),target:o.wBid/w0,weight:avgW*weightSide(o,-1)/sumB,side:-1});
 }
 return {slice,j,offset,n,w0,knots,at,op,grid:sorted(grid),tv,observations,two:two.length,avgW};
}
function evalRow(a,x){let v=0;for(let l=0;l<a.v.length;l++)v+=a.v[l]*x[l+a.i];return v;}
function addGrad(x,o,t){for(let i=0;i<o.v.length;i++)x[o.i+i]+=o.v[i]*t;}
function addH(H,o,mul){const a=o.v,t=o.i;for(let i=0;i<a.length;i++){const s=mul*a[i];if(!s)continue;for(let j=0;j<=i;j++)H[t+i][t+j]+=s*a[j];}}
function mat(n){return Array.from({length:n},()=>new Float64Array(n));}
function cholSolve(H,b){
 const n=b.length,d=b.slice();const floor=1e-15;
 for(let i=0;i<n;i++){
  for(let j=0;j<=i;j++){let v=H[i][j];for(let k=0;k<j;k++)v-=H[i][k]*H[j][k];
   if(i===j){if(!(v>floor))return null;H[i][j]=Math.sqrt(v);}else H[i][j]=v/H[j][j];}
  for(let j=0;j<i;j++)d[i]-=H[i][j]*d[j];d[i]/=H[i][i];
 }
 for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)d[i]-=H[j][i]*d[j];d[i]/=H[i][i];}return d;
}
function combined(b1,o1,b2,o2){const l=Math.min(b1.offset,b2.offset),r=Math.max(b1.offset+b1.n,b2.offset+b2.n),v=zeros(r-l);
 for(let i=0;i<o1.length;i++)v[i+b1.offset-l]+=o1[i];
 for(let i=0;i<o2.length;i++)v[i+b2.offset-l]+=o2[i];return {i:l,v};}
const neg=v=>v.map(a=>-a);
function hardRules(models,cfg,prior){
 const rules=[];
 for(const b of models){
  const {knots,grid,at,op}=b;for(const k of grid)rules.push({row:op(at(k).w),rhs:cfg.varianceFloor});
  for(const sign of [-1,1]){const k=sign<0?knots[0]:knots.at(-1),s=at(k).wp.map(v=>sign*v);
   rules.push({row:op(s),rhs:cfg.wingMargin},{row:op(neg(s)),rhs:-cfg.wingCap});}
  const prev=models[b.j-1],prevC=b.j===0&&prior,pc=prevC?curve(prevC):null;
  if(prev||pc){
   const ks=sorted([...knots,...(prev?prev.knots:pc.x)]),dense=ks.flatMap((k,i)=>i===ks.length-1?[k]:[0,.25,.5,.75].map(t=>k+t*(ks[i+1]-k)));
   for(const k of dense.concat((cfg.extraCalendarK||[]).filter(finite))){
    const row=prev?combined(b,at(k).w,prev,neg(prev.at(k).w)):op(at(k).w);
    rules.push({row,rhs:(pc?evalCurve(pc,k).w:0)+cfg.varianceFloor*.05});}
   for(const sign of [-1,1]){const k=sign<0?ks[0]:ks.at(-1);
    const slope=at(k).wp.map(v=>sign*v);
    rules.push({row:prev?combined(b,slope,prev,prev.at(k).wp.map(v=>-sign*v)):op(slope),rhs:(pc?sign*evalCurve(pc,k).wp:0)+cfg.wingMargin*.05});}
  }
 }
 return rules;
}
function nonlinear(models,x,cfg,jac){
 const rows=[],mins=[];for(const m of models){let min=Infinity;
  for(const k of m.grid){const a=m.at(k),w=evalRow(m.op(a.w),x),p=evalRow(m.op(a.wp),x),c=evalRow(m.op(a.wpp),x);
   if(!(w>0))return {min:-Infinity,rows:[]};const z=1-k*p/(2*w),g=gValue(k,w,p,c);min=Math.min(min,g);
   if(jac){const dw=z*k*p/(w*w)+p*p/(4*w*w),dp=-z*k/w-p/(2*w)-p/8;
    const row=m.op(a.w.map((v,i)=>dw*v+dp*a.wp[i]+a.wpp[i]/2));
    rows.push({row,rhs:cfg.minG-g+evalRow(row,x)});}
  }mins.push(min);
 }
 return {min:Math.min(...mins),mins,rows};
}
function starting(models,cfg,prior){
 let lastW=0,prevLeft=0,prevRight=0;
 if(prior){const c=curve(prior);prevLeft=-c.b[0];prevRight=c.b.at(-1);lastW=Math.max(...c.a);}
 const x=[];
 for(const b of models){
  const {knots,w0,n}=b;const eps=5*cfg.wingMargin;
  const left=prevLeft+eps,right=prevRight+eps;
  const width=knots.at(-1)-knots[0],S=knots.map(k=>Math.sqrt(k*k+width*width*.004));
  const C=curve(fromNodes(knots,S)),bl=C.b[0],br=C.b.at(-1),amp=(left+right)/(br-bl),linear=right-amp*br;
  const base=knots.map((k,i)=>amp*S[i]+linear*k);const level=Math.max(w0,lastW+Math.max(1e-6,w0*.02)+Math.abs(Math.min(...base)));
  x.push(...base.map(v=>(v+level)/w0));lastW=level+Math.max(...base);prevLeft=left;prevRight=right;
 }
 return x;
}
// Strict interior initialization for simultaneous maturities. A failed seed
// is not evidence of calendar-infeasible market quotes. Preserve wing slopes
// and lift each maturity, forward in time, until affine variance constraints
// have strict slack. It is only an initialization, never a relaxed constraint.
function recoverInterior(models,cfg,rules,initial){
 const x=initial.slice(),log=[];
 for(const m of models){
  const relevant=rules.filter(r=>r.row.i<=m.offset+m.n-1&&r.row.i+r.row.v.length>m.offset);
  // A constant increment to nodal total variance has coefficient 1 on
  // price-positivity/calendar level rules and zero on wing-slope rules.
  let lift=0;
  for(const r of relevant){
   let sum=0;
   for(let j=0;j<r.row.v.length;j++){
    const at=r.row.i+j;if(at>=m.offset&&at<m.offset+m.n)sum+=r.row.v[j];
   }
   const coefficient=sum/m.w0;
   if(coefficient>1e-8){const deficit=r.rhs+Math.max(5e-9,m.w0*1e-4)-evalRow(r.row,x);
    if(deficit>0)lift=Math.max(lift,deficit/coefficient);
   }
  }
  if(lift>0){for(let j=m.offset;j<m.offset+m.n;j++)x[j]+=lift/m.w0;log.push({expiry:m.slice.expiry,varianceLift:lift});}
 }
 const margin=Math.min(...rules.map(r=>evalRow(r.row,x)-r.rhs));
 const butterfly=nonlinear(models,x,cfg).min;
 return {x,margin,butterfly,log,ok:margin>0&&butterfly>cfg.minG};
}
function loss(sets,x,cfg){const r={mid:0,ask:0,bid:0,tv:0,prior:0};
 for(const s of sets)for(const v of s.observations){const gap=evalRow(v.row,x)-v.target;if(v.side===0||v.side*gap>0)r[v.side===0?'mid':v.side>0?'ask':'bid']+=v.weight*gap*gap/sets.length;}
 for(const s of sets)for(const row of s.tv)r.tv+=cfg.lambdaTV*Math.abs(evalRow(row,x))/sets.length;
 if(cfg.temporalVector)for(let i=0;i<x.length;i++)r.prior+=cfg.lambdaTime*(x[i]-cfg.temporalVector[i])**2;
 r.total=r.mid+r.ask+r.bid+r.tv+r.prior;return r;
}
function localQP(sets,hard,x0,cfg,radius,polish=false){
 const n=x0.length,cnt=sets.length,A=hard.slice();
 for(let i=0;i<n;i++){const d=radius*Math.max(1,Math.abs(x0[i])*.2);A.push({row:{i,v:[1]},rhs:x0[i]-d},{row:{i,v:[-1]},rhs:-x0[i]-d});}
 // Scale constraints without moving them. Constant satisfied constraints contribute nothing.
 const rules=A.map(r=>{const d=Math.max(maxAbs(r.row.v),1e-12);return {row:{i:r.row.i,v:r.row.v.map(z=>z/d)},rhs:r.rhs/d};}).filter(r=>maxAbs(r.row.v)>1e-16||r.rhs>=0);
 const x=x0.slice(),midH=mat(n),midB=zeros(n);let midConst=0;
 for(const b of sets)for(const z of b.observations)if(!z.side){
  const wt=z.weight/cnt;addH(midH,z.row,2*wt);addGrad(midB,z.row,-2*wt*z.target);midConst+=wt*z.target*z.target;}
 if(cfg.temporalVector){for(let i=0;i<n;i++){midH[i][i]+=2*cfg.lambdaTime;midB[i]-=2*cfg.lambdaTime*cfg.temporalVector[i];midConst+=cfg.lambdaTime*cfg.temporalVector[i]**2;}}
 function objective(x,mu,deriv){
  let val=midConst,gradient=deriv?midB.slice():null,H=deriv?midH.map(v=>v.slice()):null;
  for(let i=0;i<n;i++){
   let c=midH[i][i]*x[i];for(let j=0;j<i;j++){const a=midH[i][j];c+=a*x[j];if(deriv)gradient[j]+=a*x[i];}
   if(deriv)gradient[i]+=c;val+=(midB[i]+c-.5*midH[i][i]*x[i])*x[i];}
  for(const b of sets){
   for(const z of b.observations)if(z.side){const d=evalRow(z.row,x)-z.target;if(z.side*d<=0)continue;const weight=z.weight/cnt;val+=weight*d*d;
    if(deriv){addGrad(gradient,z.row,2*weight*d);addH(H,z.row,2*weight);}}
   const lam=cfg.lambdaTV/cnt;if(lam>0){const eps=mu/lam;
    for(const row of b.tv){const c=evalRow(row,x),hyp=Math.hypot(c,eps),den=hyp+eps;
     // Minimize lambda*u - mu*(log(u-c)+log(u+c)) over u>|c|.
     val+=lam*den-mu*Math.log(2*eps*den);
     if(deriv){addGrad(gradient,row,lam*c/den);addH(H,row,lam*eps/(hyp*den));}}
   }
  }
  for(const r of rules){const s=evalRow(r.row,x)-r.rhs;if(!(s>0))return {val:Infinity};
   val-=mu*Math.log(s);if(deriv){addGrad(gradient,r.row,-mu/s);addH(H,r.row,mu/(s*s));}}
  return {val,H,gradient};
 }
 let steps=0,stalls=0,dual=Infinity,lastmu=0,dec=Infinity;
 const mus=[.012,.0006,.00003,.0000015,7.5e-8,3.75e-9,1.875e-10];if(polish)mus.push(9.375e-12,4.7e-13);
 for(const mu of mus){
  lastmu=mu;
  for(let j=0;j<25;j++){
   const a=objective(x,mu,true);if(!finite(a.val))return {ok:false,why:'QP_START_NOT_STRICT',steps};
   dual=maxAbs(a.gradient);const diag=a.H.map((v,i)=>Math.sqrt(Math.max(v[i],1e-18)));
   const HH=a.H.map((row,i)=>row.map((v,j)=>j>i?0:v/(diag[i]*diag[j])));
   const raw=cholSolve(HH,a.gradient.map((v,i)=>-v/diag[i]));if(!raw){stalls++;break;}
   const d=raw.map((v,i)=>v/diag[i]);const gd=dot(a.gradient,d);dec=-gd;
   if(dec<(polish?Math.max(1e-19,mu*1e-5):Math.max(1e-14,mu*1e-4))){break;}
   let alpha=1;for(const r of rules){const k=evalRow(r.row,d);if(k<0)alpha=Math.min(alpha,.995*(evalRow(r.row,x)-r.rhs)/(-k));}
   let acc=false;for(let back=0;back<24;back++){const trial=x.map((v,i)=>v+alpha*d[i]);
    const nv=objective(trial,mu,false).val;if(nv<=a.val+.01*alpha*gd+1e-11*Math.max(1,Math.abs(a.val))){for(let i=0;i<n;i++)x[i]=trial[i];acc=true;break;}alpha*=.5;}
   steps++;if(!acc){stalls++;break;}
  }
 }
 const a=objective(x,lastmu,true);dual=maxAbs(a.gradient);
 return {ok:finite(a.val),x,steps,stalls,dual,newtonDecrement:dec,barrierMu:lastmu,maxQPGap:(rules.length+2*sets.reduce((s,b)=>s+b.tv.length,0))*lastmu,
  minSlack:Math.min(...rules.map(r=>evalRow(r.row,x)-r.rhs))};
}
function validateConfig(opts){
 const cfg={...defaults,...opts};
 if(!Number.isInteger(cfg.knotCount)||cfg.knotCount<5||cfg.knotCount>35||!Number.isInteger(cfg.maxOuter)||cfg.maxOuter<1||cfg.maxOuter>40||
 ![cfg.lambdaTV,cfg.spreadFloor,cfg.minG,cfg.wingMargin,cfg.wingCap,cfg.varianceFloor,cfg.trust,cfg.lambdaTime].every(finite)||cfg.lambdaTV<0||cfg.lambdaTime<0||!(cfg.spreadFloor>0&&cfg.minG>0&&cfg.wingMargin>0&&cfg.wingCap>cfg.wingMargin&&cfg.wingCap<2&&cfg.varianceFloor>0&&cfg.trust>0))throw Error('Parametri CVI non validi.');
 return cfg;
}
// Bound-constrained dual polishing on the final nonlinear mesh. Each multiplier
// remains dual feasible; complementary residuals are tested on the *actual* slack.
function localKKT(models,rules,x,cfg){
 const lam=cfg.lambdaTV/models.length,g=zeros(x.length),ds=[];
 for(const b of models)for(const o of b.observations){const err=evalRow(o.row,x)-o.target;
  if(!o.side||o.side*err>0)addGrad(g,o.row,2*o.weight/models.length*err);}
 if(cfg.temporalVector)for(let i=0;i<x.length;i++)g[i]+=2*cfg.lambdaTime*(x[i]-cfg.temporalVector[i]);
 const scale=1+maxAbs(g);
 const add=(row,amp,lo,hi,slack,kind,cv=0)=>{ds.push({row,amp,lo,hi,slack,kind,cv,den:dot(row.v,row.v)});addGrad(g,row,amp);};
 for(const b of models)for(const row of b.tv){const c=evalRow(row,x);
  if(Math.abs(c)*lam>1e-7||!lam)addGrad(g,row,lam*Math.sign(c));else add(row,0,-lam,lam,0,'tv',c);}
 let primal=0;
 for(const r of rules){
  const m=maxAbs(r.row.v);if(!(m>0))continue;
  const residual=(evalRow(r.row,x)-r.rhs)/m;
  primal=Math.max(primal,-residual);
  if(residual<1e-5){
   const v=r.row.v.map(a=>-a/m),row={i:r.row.i,v};add(row,0,0,1e-7/Math.max(1e-18,residual),residual,'hard');}
 }
 for(let j=0;j<4000;j++){let moved=0;
  for(const v of ds){if(!v.den)continue;const a=clamp(v.amp-evalRow(v.row,g)/v.den,v.lo,v.hi),step=a-v.amp;
   v.amp=a;addGrad(g,v.row,step);moved=Math.max(moved,Math.abs(step)*Math.sqrt(v.den));}
  if(moved<1e-13||maxAbs(g)<2e-8)break;
 }
 let complement=0;for(const v of ds){const c=v.kind==='hard'?Math.abs(v.amp*v.slack):Math.abs(lam*Math.abs(v.cv)-v.amp*v.cv);complement=Math.max(complement,c);}
 const stationarity=maxAbs(g);return {stationarity,scaledStationarity:stationarity/scale,complementarity:complement,scaledPrimalViolation:primal,dualFeasible:true,
  threshold:2e-7,passes:Math.max(stationarity,complement,primal)<=2e-7,scope:'First-order diagnostic on the sampled nonlinear problem; independent continuous certificate required.'};
}

// Institutional quote-box feasibility stage. Black prices are monotone in
// total variance, so observed bid/ask intervals become EXACT *linear* bounds
// on the CVI spline nodal coordinates. No widening of observed book spreads.
function hardQuoteRules(models){
 const rules=[],byExpiry={};
 for(const b of models){
  let nb=0,na=0;
  for(const p of b.slice.points){
   const basis=b.op(b.at(p.k).w);
   const width=p.wBid>0&&p.wAsk>0?Math.max(0,p.wAsk-p.wBid):Infinity;
   // This margin only selects the strict interior of an actual spread;
   // it never exceeds one ten-thousandth of the observed variance interval.
   const margin=Math.min(b.w0*2e-9,Number.isFinite(width)?width/10000:Infinity);
   if(Number.isFinite(p.wBid)&&p.wBid>0){rules.push({row:basis,rhs:p.wBid+margin,kind:'bid',strike:p.K,side:p.side,expiry:b.slice.expiry});nb++;}
   if(Number.isFinite(p.wAsk)&&p.wAsk>0){rules.push({row:b.op(basis.v.map(v=>-v)),rhs:-p.wAsk+margin,kind:'ask',strike:p.K,side:p.side,expiry:b.slice.expiry});na++;}
  }
  byExpiry[b.slice.expiry]={bid:nb,ask:na};
 }
 return {rules,byExpiry};
}
// Hildreth/Dykstra dual coordinate projection onto intersections of affine
// half spaces. It locates a candidate only, NOT a proof of feasibility or
// infeasibility. Market and continuous no-arb certificates still decide.
function projectMarketHalfspaces(rules,x0,maxSweeps=1800){
 const A=rules.map(r=>{
  const scale=Math.max(1e-16,maxAbs(r.row.v)),a=r.row.v.map(v=>v/scale),rhs=r.rhs/scale;
  return {i:r.row.i,a,rhs,den:dot(a,a),dual:0,kind:r.kind||'geometry'};
 }).filter(r=>r.den>1e-26);
 const x=x0.slice();let violation=Infinity,passes=0,correction=Infinity;
 for(let sweep=0;sweep<maxSweeps;sweep++){
  correction=0;
  for(const r of A){let actual=0;for(let j=0;j<r.a.length;j++)actual+=r.a[j]*x[j+r.i];
   const dv=Math.max(-r.dual,(r.rhs-actual)/r.den);
   if(dv!==0){r.dual+=dv;for(let j=0;j<r.a.length;j++)x[j+r.i]+=dv*r.a[j];correction=Math.max(correction,Math.abs(dv)*Math.sqrt(r.den));}
  }
  if(sweep%5===4||sweep===maxSweeps-1){violation=0;
   for(const r of A){let actual=0;for(let j=0;j<r.a.length;j++)actual+=r.a[j]*x[j+r.i];violation=Math.max(violation,r.rhs-actual);}
   if(violation<1e-9){passes=sweep+1;break;}
  }
 }
 return {x,passes,iterations:passes||maxSweeps,maxViolation:violation,correction,converged:passes>0};
}
function maxQuoteBreach(models,x){let worst={breach:0,expiry:null,strike:null,side:null,book:null};let violations=0;
 for(const b of models)for(const o of b.slice.points){
  const w=evalRow(b.op(b.at(o.k).w),x),mark=price(b.slice.F,b.slice.D,o.k,w,o.side);
  const gap=Math.max(0,o.wBid>0?o.bid-mark:0,o.wAsk>0?mark-o.ask:0);
  if(gap>1e-7)violations++;if(gap>worst.breach)worst={breach:gap,expiry:b.slice.expiry,strike:o.K,side:o.side,bid:o.bid,ask:o.ask,mark};
 }
 return {violations,worst};
}
function repairMarketBoxes(models,lin,x0,cfg){
 const before=maxQuoteBreach(models,x0),quotes=hardQuoteRules(models);
 if(before.violations===0)return {success:true,x:x0,changed:false,before,after:before,quoteRules:quotes.rules.length,passes:0,byExpiry:quotes.byExpiry};
 let x=x0.slice(),last=null,best=null;
 for(let iter=0;iter<7;iter++){
  const ng=nonlinear(models,x,cfg,true);
  const all=lin.concat(quotes.rules,ng.rows);
  const projected=projectMarketHalfspaces(all,x,iter<3?650:1200);
  last=projected;
  if(!projected.converged)break;
  const y=projected.x,bo=maxQuoteBreach(models,y),b=nonlinear(models,y,cfg).min;
  const linOk=lin.every(r=>evalRow(r.row,y)>=r.rhs-5e-11);
  x=y;
  if(bo.violations===0&&b>=cfg.minG-5e-8&&linOk){
   best={success:true,x:y,changed:true,before,after:bo,quoteRules:quotes.rules.length,passes:iter+1,projection:projected,minimumButterfly:b,byExpiry:quotes.byExpiry};
   break;
  }
 }
 if(!best)return {success:false,x:x0,changed:false,before,after:maxQuoteBreach(models,x),quoteRules:quotes.rules.length,
  cause:'Strict quote projection did not achieve simultaneous butterfly/calendar/price feasibility',projection:last,byExpiry:quotes.byExpiry};
 return best;
}

function fitSurface(slices,options={},priorMaturity=null){
 const start=Date.now(),cfg=validateConfig(options);if(!Array.isArray(slices)||!slices.length||slices.some((s,i)=>i&&!(s.T>slices[i-1].T)))throw Error('Le scadenze del solve congiunto devono essere ordinate e distinte.');
 const prior=priorMaturity?.canonical||priorMaturity;
 let size=0;const bs=slices.map((s,j)=>{const b=basis(s,cfg,j,size);size+=b.n;return b;});
 if(cfg.temporalVector&&(!Array.isArray(cfg.temporalVector)||cfg.temporalVector.length!==size||!cfg.temporalVector.every(finite)))throw Error('Prior temporale incompatibile con le coordinate nodali congelate.');
 if(cfg.lambdaTime>0&&!cfg.temporalVector)throw Error('Prior temporale richiesto quando λt è positivo.');
 const lin=hardRules(bs,cfg,prior);
 let x=starting(bs,cfg,prior),radius=cfg.trust,stable=0,status='BUDGET_OR_PROGRESS_LIMIT',solves=0;
 let seedDiagnostics={recovery:false,varianceLift:[]};
 if(lin.some(r=>evalRow(r.row,x)<=r.rhs)||nonlinear(bs,x,cfg).min<=cfg.minG){
   const recovered=recoverInterior(bs,cfg,lin,x);
   if(recovered.ok){x=recovered.x;seedDiagnostics={recovery:true,varianceLift:recovered.log};}
   else throw Error('NO_FEASIBLE_SEED: il punto iniziale non è interno ai vincoli, anche dopo il recupero. '+'Margine lineare '+recovered.margin.toExponential(3)+'; butterfly '+recovered.butterfly.toExponential(3)+'. Questo non dimostra incompatibilità dei prezzi.');
 }
 let l=loss(bs,x,cfg),stops=0,last=null;const trace=[];
 let finalRel=Infinity,finalGain=Infinity;
 for(let outer=0;outer<cfg.maxOuter;outer++){
  const ng=nonlinear(bs,x,cfg,true);
  const qp=localQP(bs,lin.concat(ng.rows),x,cfg,radius);solves++;if(!qp.ok){trace.push({iteration:outer+1,accepted:false,reason:qp.why});radius*=.5;continue;}
  let candidate=null,trialLoss=null,weight=1;
  for(let i=0;i<16;i++){
   const trial=x.map((v,j)=>v+weight*(qp.x[j]-v)),real=nonlinear(bs,trial,cfg).min;
   if(real>cfg.minG&&lin.every(r=>evalRow(r.row,trial)>r.rhs)){const ll=loss(bs,trial,cfg);
    if(ll.total<=l.total+1e-10*Math.max(1,l.total)){candidate=trial;trialLoss=ll;break;}}
   weight*=.5;
  }
  if(!candidate){trace.push({iteration:outer+1,accepted:false,reason:'TRUST_OR_MERIT'});radius*=.5;if(++stops>=4)break;continue;}
  stops=0;const step=maxAbs(candidate.map((v,i)=>v-x[i])),gain=l.total-trialLoss.total;
  finalRel=step/Math.max(1,maxAbs(x));finalGain=Math.abs(gain)/Math.max(1,l.total);
  trace.push({iteration:outer+1,accepted:true,radius,alpha:weight,loss:trialLoss.total,relativeStep:finalRel,relativeImprovement:finalGain,minSampleG:nonlinear(bs,candidate,cfg).min,qpSteps:qp.steps,qpStalls:qp.stalls,barrierGapDiagnostic:qp.maxQPGap,barrierStationarity:qp.dual});
  last=qp;x=candidate;l=trialLoss;stable=finalRel<1e-7&&finalGain<1e-8?stable+1:0;if(stable>=2){status='CONVERGED';break;}
  radius=Math.min(64,radius*(weight>=.5?1.5:1));
 }
 if(!trace.some(s=>s.accepted))throw Error('Nessun passo CVI accettato: calibrazione sospesa.');
 let finalRules=lin.concat(nonlinear(bs,x,cfg,true).rows),kkt=localKKT(bs,finalRules,x,cfg);
 if(status==='CONVERGED'&&!kkt.passes&&solves<cfg.maxOuter){
  const polished=localQP(bs,finalRules,x,cfg,radius,true);solves++;
  if(polished.ok){
   const y=polished.x,yn=nonlinear(bs,y,cfg,true),yl=loss(bs,y,cfg);
   if(yn.min>cfg.minG&&lin.every(r=>evalRow(r.row,y)>r.rhs)&&yl.total<=l.total+1e-11*Math.max(1,l.total)){
    const check=localKKT(bs,lin.concat(yn.rows),y,cfg);
    if(check.stationarity<kkt.stationarity){
     finalRel=maxAbs(y.map((v,i)=>v-x[i]))/Math.max(1,maxAbs(x));finalGain=Math.abs(yl.total-l.total)/Math.max(1,l.total);
     x=y;l=yl;kkt=check;trace.push({iteration:solves,accepted:true,polish:true,alpha:1,loss:l.total,minSampleG:yn.min,qpSteps:polished.steps,barrierStationarity:polished.dual});
    }
   }
  }
 }
 if(status==='CONVERGED'&&!kkt.passes)status='STEP_CONVERGED_KKT_UNCONFIRMED';
 let marketRepair={requested:cfg.strictQuotes===true,changed:false};
 if(cfg.strictQuotes===true){
  const repaired=repairMarketBoxes(bs,lin,x,cfg);
  marketRepair={...repaired,x:undefined};
  if(repaired.success&&repaired.changed){
   x=repaired.x;l=loss(bs,x,cfg);
   // Quote feasibility is independently audited after final spline reconstruction.
   // A feasible quote-box projection is NOT incorrectly reported as KKT convergence.
   status='MARKET_BOX_FEASIBLE';
   kkt=localKKT(bs,lin.concat(hardQuoteRules(bs).rules,nonlinear(bs,x,cfg,true).rows),x,cfg);
  }
 }
 const diagnostics={seedDiagnostics,kkt,marketRepair,profile:version,solver:'QP convessa locale · Newton primale con barriera logaritmica e backtracking',status,iterations:solves,loss:l,relativeStep:finalRel,relativeImprovement:finalGain,trace,elapsedMs:Date.now()-start,jointMaturities:slices.length,
  fixed:{lambdaTV:cfg.lambdaTV,lambdaTime:cfg.lambdaTime,spreadFloor:cfg.spreadFloor,varianceFloor:cfg.varianceFloor,minG:cfg.minG,wingMargin:cfg.wingMargin,wingCap:cfg.wingCap,knotCountRequested:cfg.knotCount,maxOuter:cfg.maxOuter,maximumKnotAbsZ:20},hardMeshOnly:true};
 const output=bs.map(b=>{
  const s=b.slice,y=x.slice(b.offset,b.offset+b.n).map(v=>v*b.w0),canonical=fromNodes(b.knots,y),cc=curve(canonical);
  const obs=s.points.map(o=>{const w=evalCurve(cc,o.k).w,mark=price(s.F,s.D,o.k,w,o.side);return {K:o.K,k:o.k,side:o.side,bid:o.bid,ask:o.ask,mid:o.mid,wMid:o.wMid,fit:mark,w,iv:w>0?Math.sqrt(w/s.T):null};});
  const two=obs.filter(o=>finite(o.mid)&&o.wMid>0&&o.ask>=o.bid&&finite(o.fit));
  const residuals=two.map(o=>o.fit-o.mid),inside=two.filter(o=>o.fit>=o.bid-1e-8&&o.fit<=o.ask+1e-8).length;
  const bids=obs.filter(o=>o.bid>0),asks=obs.filter(o=>o.ask>0),minSampleG=nonlinear([b],x,cfg).min;
  return {canonical,diagnostics:{kkt,marketRepair,profile:version,status,iterations:solves,loss:loss([b],x,{...cfg,temporalVector:null}),w0:b.w0,anchor:Math.sqrt(b.w0/s.T),n:obs.length,bilateral:two.length,inside,within:two.length?inside/two.length:null,rmse:two.length?Math.sqrt(dot(residuals,residuals)/two.length):null,bidViolations:bids.filter(o=>o.fit<o.bid-1e-8).length,askViolations:asks.filter(o=>o.fit>o.ask+1e-8).length,grid:b.grid.length,minSampleG,knots:canonical.knots.length,wingLeft:-cc.b[0],wingRight:cc.b.at(-1),elapsedMs:Date.now()-start},observations:obs};
 });
 return {slices:output,diagnostics};
}
function fitSlice(slice,config={},priorMaturity=null){const r=fitSurface([slice],config,priorMaturity);return {...r.slices[0],solver:r.diagnostics};}
root.CVIFit={version,defaults,fitSlice,fitSurface,evaluate,fromNodes,gValue,price};
})(globalThis);
