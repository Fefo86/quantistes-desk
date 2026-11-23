
/* Quantistes independent global constrained Bernstein-price surface.
 * NOT a Vola Dynamics C5/C8/C16 implementation: those are proprietary.
 * C-FLEX is a separately developed flexible comparator, inspired by the
 * requirements for multi-curvature and smooth surface dynamics in Klassen.
 * Shape inequalities on the tensor Bernstein control net are sufficient for:
 *  - call monotonicity and digital in [0,1] throughout the calibration rectangle;
 *  - strike convexity (non-negative risk-neutral density);
 *  - calendar monotonicity at fixed normalized forward strike x, under the
 *    explicitly assumed deterministic proportional forward/carry convention;
 *  - C-infinity internal smoothness in both strike x and maturity variable v(T).
 * Quotations remain hard constraints, including unilateral prices. If a
 * feasible certified coefficient set cannot be obtained, the benchmark is
 * NEVER released for pricing. No artificial spread widening is performed.
 */
(function(root){
'use strict';
const finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const D=root.CVIData,Fit=root.CVIFit,Cert=root.CVICert,canonical=root.CVISurfaceCanonical;
const cache=new WeakMap();
const MODE='FLEX_BERNSTEIN_GLOBAL_PRICE_V1';
const MIN_PRICE_TOL=0.000001;
function problem(code,reason,extra={}){return {ok:false,status:code,reason,...extra};}
function bern(n,u){
 const arr=new Float64Array(n+1);arr[0]=1;u=clamp(u,0,1);
 for(let j=1;j<=n;j++){
  for(let i=j;i>0;i--)arr[i]=arr[i]*(1-u)+arr[i-1]*u;
  arr[0]*=(1-u);
 }
 return arr;
}
function basis(n,m,u,v){
 const bx=bern(n,u),bt=bern(m,v),I=[],A=[];
 for(let t=0;t<=m;t++)for(let i=0;i<=n;i++){
  const w=bt[t]*bx[i];if(w>1e-15){I.push(t*(n+1)+i);A.push(w);}
 }
 return {I,A};
}
function constraint(I,A,b,name='',data=null){
 const arr=Float64Array.from(A);let norm=0;for(let i=0;i<arr.length;i++)norm+=arr[i]*arr[i];
 return {I:Int32Array.from(I),A:arr,b,norm:Math.max(norm,1e-24),lambda:0,name,data};
}
function dot(row,x){let sum=0;for(let i=0;i<row.I.length;i++)sum+=row.A[i]*x[row.I[i]];return sum;}
function evaluateShape(n,m,xmin,xmax){
 const N=(n+1)*(m+1), dx=(xmax-xmin)/n, shape=[];
 const add=(I,A,b,name)=>shape.push(constraint(I,A,b,name));
 for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){
  const a=j*(n+1)+i,xx=xmin+(xmax-xmin)*i/n;
  add([a],[1],Math.max(0,1-xx),'intrinsic');add([a],[-1],-1,'upper');
  if(i<n){add([a,a+1],[1,-1],0,'decreasing');add([a,a+1],[-1,1],-dx,'slope-lower');}
  if(i<n-1)add([a,a+1,a+2],[1,-2,1],0,'convex');
  if(j<m)add([a,a+n+1],[-1,1],0,'calendar');
 }
 return shape;
}
function markViolation(rows,x){let maximum=0,worst=null,notMet=0;
 for(const r of rows){const d=r.b-dot(r,x);if(d>maximum){maximum=d;worst=r;}if(d>1e-11)notMet++;}
 return {maximum,worst,notMet};
}
function solveProjection(start,shape,quotes,budget=220){
 // Hildreth's dual coordinate projection for closest feasible point to CVI prior.
 // The Lagrange multiplier per half-space is nonnegative; all quote constraints
 // are literal bid/ask boxes. Convex constraints are sufficient over continuum.
 const x=Float64Array.from(start),rows=[...shape,...quotes],tol=5e-12;
 let passes=0,tail=[];
 for(let it=0;it<budget;it++){
  let maxDelta=0;
  for(const r of rows){
   const residual=r.b-dot(r,x),candidate=Math.max(0,r.lambda+residual/r.norm),delta=candidate-r.lambda;
   if(delta){for(let k=0;k<r.I.length;k++)x[r.I[k]]+=delta*r.A[k];r.lambda=candidate;maxDelta=Math.max(maxDelta,Math.abs(delta));}
  }
  passes=it+1;
  if(it%14===0||it===budget-1){
   const s=markViolation(shape,x),q=markViolation(quotes,x);tail.push([passes,s.maximum,q.maximum]);
   if(s.maximum<tol&&q.maximum<tol)break;
  }
 }
 return {x,passes,tail,shapeViolation:markViolation(shape,x),quoteViolation:markViolation(quotes,x)};
}
function maxMarketBreach(model,cases){
 let within=0,failures=0,worst={breach:0},mse=0,mids=0;
 for(const rec of cases){const p=rec.p,c=rec.c,x=p.K/c.F,T=c.T,call=model.evalCall(T,x),factor=c.D*c.F;
  if(!(finite(call)&&factor>0))continue;
  const price=(p.side==='PUT'?call-(1-x):call)*factor;
  if(!finite(price))continue;
  let breach=0;
  if(['MID','BID'].includes(p.kind)&&finite(p.bid))breach=Math.max(breach,p.bid-price);
  if(['MID','ASK'].includes(p.kind)&&finite(p.ask))breach=Math.max(breach,price-p.ask);
  breach=Math.max(0,breach);
  if(breach<=MIN_PRICE_TOL)within++;else{failures++;if(breach>worst.breach)worst={breach,expiry:c.expiry,strike:p.K,side:p.side,bid:p.bid,ask:p.ask,mark:price,kind:p.kind};}
  if(p.kind==='MID'&&finite(p.mid)){mse+=(price-p.mid)**2;mids++;}
 }
 return {within,failures,worst,n:within+failures,rmse:mids?Math.sqrt(mse/mids):null};
}
function timeTransform(T,T0,T1){
 // Smooth increasing time coordinate: more resolution near 0DTE while preserving
 // exact one-sided signs of d/dT. The basis itself is C-infinity for T>0.
 return Math.log(T/T0)/Math.log(T1/T0);
}
/* Collocation at Chebyshev–Lobatto nodes gives a price-curve starting point.
   All certified shape and bid/ask tests are run on the final Bernstein net. */
function priorControlNet(n,m,xmin,xmax,T0,T1,prior){
 const nodes=d=>Array.from({length:d+1},(_,i)=>(1-Math.cos(Math.PI*i/d))/2);
 const u=nodes(n),v=nodes(m);
 function solve(matrix,rhs){
  const A=matrix.map((r,i)=>Array.from(r).concat(rhs[i])),N=A.length;
  for(let k=0;k<N;k++){
   let ip=k;for(let j=k+1;j<N;j++)if(Math.abs(A[j][k])>Math.abs(A[ip][k]))ip=j;
   if(!(Math.abs(A[ip][k])>1e-14))return null;
   [A[k],A[ip]]=[A[ip],A[k]];
   for(let j=k+1;j<N;j++){const f=A[j][k]/A[k][k];for(let t=k;t<=N;t++)A[j][t]-=f*A[k][t];}
  }
  const x=Array(N);for(let k=N-1;k>=0;k--){let b=A[k][N];for(let j=k+1;j<N;j++)b-=A[k][j]*x[j];x[k]=b/A[k][k];}
  return x.every(Number.isFinite)?x:null;
 }
 const B=u.map(i=>bern(n,i)),C=v.map(i=>bern(m,i)),r=[];
 for(const t of v){const T=T0*Math.pow(T1/T0,t),values=u.map(a=>prior(T,xmin+(xmax-xmin)*a));if(values.some(x=>!Number.isFinite(x)))return null;const s=solve(B,values);if(!s)return null;r.push(s);}
 const result=new Float64Array((n+1)*(m+1));
 for(let i=0;i<=n;i++){const a=solve(C,r.map(s=>s[i]));if(!a)return null;for(let j=0;j<=m;j++)result[j*(n+1)+i]=a[j];}
 return result;
}

function makeCandidate(group,{degree=14,budget=300,holdout=false}={}){
 const base=canonical.get(group);
 if(!base.ok)return problem('CVI_NOT_RELEASED',base.reason);
 const cs=group.curves.slice().sort((a,b)=>a.T-b.T);
 if(cs.length<2)return problem('INSUFFICIENT_TENORS','Sono necessarie almeno due scadenze CVI certificate.');
 if(cs.some((c,i)=>!c.points?.length||i>0&&!(c.T>cs[i-1].T)))return problem('INVALID_TERMS','Non tutte le scadenze contengono quote o tempi coerenti.');
 const n=clamp(Math.round(degree)||14,8,18),m=Math.min(4,Math.max(1,cs.length-1)),N=(n+1)*(m+1);
 // Localized domain restricted to the bilateral quoted overlap: never extend the
 // Bernstein candidate into unquoted wings. The CVI price surface is not changed.
 let minLog=Math.max(...cs.map(c=>c.lo)),maxLog=Math.min(...cs.map(c=>c.hi));
 minLog=Math.max(minLog,-.085);maxLog=Math.min(maxLog,.085);
 if(!(maxLog-minLog>.008))return problem('OVERLAP_TOO_NARROW','Copertura bilaterale comune insufficiente per un mark globale (meno di 0,8% in log-moneyness).',{range:[minLog,maxLog]});
 const xmin=Math.exp(minLog),xmax=Math.exp(maxLog),T0=cs[0].T,T1=cs.at(-1).T;
 if(!(T1>T0&&T0>0))return problem('TIME_RANGE','Maturità non valide.');
 const toV=T=>timeTransform(T,T0,T1),toU=x=>(x-xmin)/(xmax-xmin);
 const coeff=Array(N).fill(0);
 for(let j=0;j<=m;j++){
  const v=j/m,T=T0*Math.exp(v*Math.log(T1/T0));
  for(let i=0;i<=n;i++){
   const x=xmin+i*(xmax-xmin)/n,k=Math.log(x),p=holdout?{normalizedCall:root.CVIData.black(1,x,1,.04*T,'CALL')}:base.at(T,k,{allowWings:true});
   if(!p||!finite(p.normalizedCall))return problem('PRIOR_MISSING','Il riferimento CVI non può fornire un mark per costruire il prior.');
   coeff[j*(n+1)+i]=p.normalizedCall;
  }
 }
 const shape=evaluateShape(n,m,xmin,xmax),quoteCases=[],market=[],allCases=[],strikesByExpiry=new Map();
 for(const c of cs){
  const pAll=c.points.filter(p=>finite(p.K)&&p.K>0&&['PUT','CALL'].includes(p.side)&&['MID','BID','ASK'].includes(p.kind));
  const inDomain=pAll.filter(p=>p.K/c.F>=xmin&&p.K/c.F<=xmax);
  const unique=[...new Set(inDomain.map(p=>String(p.K)))].sort((a,b)=>Number(a)-Number(b));
  strikesByExpiry.set(c.expiry,new Map(unique.map((z,i)=>[z,i])));
  for(const p of pAll)allCases.push({c,p});
  for(const p of inDomain)quoteCases.push({c,p});
 }
 if(quoteCases.length<12)return problem('INSUFFICIENT_MARKET_BOXES','Meno di dodici quotazioni informative nel dominio comune.');
 const training=[];const withheld=[];
 for(const rec of quoteCases){
  const p=rec.p,c=rec.c,x=p.K/c.F;
  const v=toV(c.T),u=toU(x),r=basis(n,m,u,v),parity=p.side==='PUT'?1-x:0,factor=c.D*c.F;
  if(!(factor>0))continue;
  const useHoldout=holdout&&((strikesByExpiry.get(c.expiry).get(String(p.K))||0)%5===0);
  (useHoldout?withheld:training).push(rec);
  if(useHoldout)continue;
  const add=(price,lower)=>{
   if(!finite(price))return;
   const target=price/factor+parity;
   if(lower)market.push(constraint(r.I,r.A,target,'market_bid',rec));
   else market.push(constraint(r.I,r.A.map(z=>-z),-target,'market_ask',rec));
  };
  if(p.kind==='MID'||p.kind==='BID')add(p.bid,true);
  if(p.kind==='MID'||p.kind==='ASK')add(p.ask,false);
 }
 if(!market.length)return problem('NO_MARKET_CONSTRAINTS','Nessuna quotazione utilizzabile.');
 const seed=priorControlNet(n,m,xmin,xmax,T0,T1,(T,x)=>holdout?D.black(1,x,1,.04*T,'CALL'):base.at(T,Math.log(x),{allowWings:true})?.normalizedCall);
 const violation=net=>Math.max(markViolation(shape,net).maximum,markViolation(market,net).maximum);
 const useSeed=seed&&violation(seed)<violation(coeff);
 const fitted=solveProjection(useSeed?seed:coeff,shape,market,budget),x=fitted.x;
 const S={
  evalCall(T,xv){
   if(!(finite(T)&&T>=T0-1e-12&&T<=T1+1e-12&&finite(xv)&&xv>=xmin-1e-12&&xv<=xmax+1e-12))return null;
   const b=basis(n,m,toU(xv),toV(T));let c=0;for(let j=0;j<b.I.length;j++)c+=b.A[j]*x[b.I[j]];
   return c;
  },
  evalDigital(T,xv){
   const bu=bern(n-1,toU(xv)),bv=bern(m,toV(T));let sum=0;
   for(let j=0;j<=m;j++)for(let i=0;i<n;i++)sum+=(x[j*(n+1)+i+1]-x[j*(n+1)+i])*bu[i]*bv[j];
   return clamp(-n/(xmax-xmin)*sum,0,1);
  },
  evalDensity(T,xv){
   const bu=bern(n-2,toU(xv)),bv=bern(m,toV(T));let sum=0;
   for(let j=0;j<=m;j++)for(let i=0;i<n-1;i++)sum+=(x[j*(n+1)+i]-2*x[j*(n+1)+i+1]+x[j*(n+1)+i+2])*bu[i]*bv[j];
   return n*(n-1)/((xmax-xmin)**2)*sum;
  }
 };
 const validation=maxMarketBreach(S,training),allValidation=maxMarketBreach(S,quoteCases);
 const held=holdout?{...maxMarketBreach(S,withheld),expected:withheld.length,conditionalOn:'forward, discount and common domain',prior:'fixed 20% annual vol'}:null;
 // Exact continuous shape certificate follows from sign of Bernstein
 // first and second coefficient differences, not from sampling a mesh.
 const globalShape=markViolation(shape,x);
 const shapePassed=globalShape.maximum<=1e-10;
 const marketPassed=allValidation.failures===0&&allValidation.n===quoteCases.length;
 const cvAll=allCases.filter(v=>v.p.kind==='MID').length;
 const quoteRate=quoteCases.length/Math.max(1,allCases.length);
 const promotable=shapePassed&&marketPassed&&globalShape.notMet===0&&quoteCases.length>=12;
 const meta={schema:'quantistes.cflex.bernstein-surface.v1',symbol:cs[0].symbol,asof:cs[0].asof,measure:'Q',kernel:MODE,
  basis:'TENSOR_BERNSTEIN_NORMALIZED_EUROPEAN_CALL',modelVersion:'1.0',T0,T1,blockedIntervals:base.meta.blockedIntervals||[],eligibleIntervals:base.meta.eligibleIntervals||[],calendarCertificates:base.meta.calendarCertificates||[],partial:!!base.meta.partial,domain:{normalizedStrike:[xmin,xmax],logMoneyness:[minLog,maxLog]},
  degrees:{strike:n,time:m,coefficients:N},quoteCoverage:{included:quoteCases.length,total:allCases.length,rate:quoteRate},
  constraints:'GLOBAL_SUFFICIENT_BERNSTEIN_COEFFICIENT_INEQUALITIES',
  staticArbitrage:promotable?'CERTIFIED_WITHIN_FINITE_RECTANGLE':'NOT_CERTIFIED',
  priceConvention:'DISCOUNTED_EUROPEAN',dayCount:'ACT/365F',
  calendarConvention:'FIXED_FORWARD_NORMALIZED_STRIKE_DETERMINISTIC_PROPORTIONAL_CARRY',
  wings:'BLOCKED_OUTSIDE_COMMON_BILATERAL_DOMAIN',
  termStructure:'C_INFINITY_INSIDE_CALIBRATED_RECTANGLE',
  localVolatility:'NOT_VALIDATED_FOR_PRODUCTION',
  origin:'INDEPENDENT_MODEL_INSPIRED_BY_C_STAR_REQUIREMENTS_NOT_A_VOLA_DYNAMICS_PRODUCT',
  expiryRange:[cs[0].expiry,cs.at(-1).expiry],timeRange:[T0,T1],tenors:cs.map(c=>({expiry:c.expiry,T:c.T,F:c.F,D:c.D})),
  training:{initialization:useSeed?'COLLOCATION':'PRICE_SAMPLES',passes:fitted.passes,tail:fitted.tail,market:validation,all:allValidation,heldout:held,shape:globalShape}};
 const modelId=Cert.hash(JSON.stringify({model:MODE,source:cs.map(c=>[c.expiry,c.fingerprint]),degrees:[n,m],x:[xmin,xmax],coefficient:Array.from(x).map(z=>+z.toPrecision(13))}));
 meta.modelId=modelId;
 function anchor(T){
  const p=base.at(T,0,{allowWings:true});return p&&finite(p.F)&&finite(p.D)?p:null;
 }
 function at(T,k,{allowWings=false}={}){
  if(!promotable||!finite(T)||!finite(k))return null;
  const xx=Math.exp(k),call=S.evalCall(T,xx);if(call==null)return null;
  const a=anchor(T);if(!a)return null;
  const put=call-(1-xx),side=k<0?'PUT':'CALL',v=side==='PUT'?put:call;
  const w=D.implied(1,xx,1,v,side);
  if(!(w>0&&finite(w)))return null;
  return {ok:true,status:'CERTIFIED_MARK_IN_DOMAIN',modelId,source:'CFLEX_BERNSTEIN',symbol:meta.symbol,asof:meta.asof,
   T,k,K:a.F*xx,strike:a.F*xx,F:a.F,D:a.D,iv:Math.sqrt(w/T),w,variance:w,
   call:a.D*a.F*call,put:a.D*a.F*put,normalizedCall:call,normalizedPut:put,
   observed:true,pricingEligible:true,expiry:cs.find(c=>Math.abs(c.T-T)<1e-11)?.expiry||null,
   near:cs[0].expiry,far:cs.at(-1).expiry,timeContinuity:'ANALYTIC_INTERIOR',
   density:S.evalDensity(T,xx)/a.F,densityNormalizedStrike:S.evalDensity(T,xx),digitalAbove:S.evalDigital(T,xx)};
 }
 function price(T,K,side='CALL',opts={}){
  if(!['CALL','PUT'].includes(side)||!(finite(K)&&K>0))return null;
  const a=anchor(T);if(!a)return null;
  const p=at(T,Math.log(K/a.F),opts);return p?{...p,side,price:side==='CALL'?p.call:p.put}:null;
 }
 function digital(T,k,opts={}){const p=at(T,k,opts);if(!p)return null;
  const x0=Math.exp(k),a=S.evalDigital(T,x0);
  return {strike:p.K,probabilityAbove:a,probabilityBelow:1-a,method:'ANALYTIC_BERNSTEIN_FIRST_DERIVATIVE',status:p.status};
 }
 function forwardVarianceATM(){return cs.slice(1).map((c,i)=>{
  const a=at(cs[i].T,0),b=at(c.T,0),v=a&&b?(b.w-a.w)/(c.T-cs[i].T):null;
  const blocked=meta.blockedIntervals.some(p=>p.near===cs[i].expiry&&p.far===c.expiry);return {from:cs[i].expiry,to:c.expiry,forwardVariance:blocked?null:v,nonnegative:!blocked&&v!=null&&v>=-1e-9};
 });}
 function audit({sampleCount=7}={}){const probes=[],ns=clamp(Math.floor(sampleCount)||7,3,15);
  for(let i=0;i<cs.length-1;i++)for(let j=0;j<ns;j++){
   const T=(cs[i].T+cs[i+1].T)*.5,k=Math.log(xmin)+(Math.log(xmax)-Math.log(xmin))*j/(ns-1),v=at(T,k);
   if(v)probes.push({T,k,call:v.call,put:v.put,iv:v.iv,digitalAbove:v.digitalAbove});
  }
  return {schema:meta.schema,metadata:meta,summary:{quoteCoverage:meta.quoteCoverage,market:allValidation,
    certificate:promotable?'GLOBAL_BERNSTEIN_COEFFICIENT_SIGNS_AND_LITERAL_MARKET_BOXES':'NOT_CERTIFIED',
    shapeViolation:globalShape,quotesChecked:quoteCases.length,holdout:held},samples:probes};
 }
 const model=Object.freeze({ok:promotable,status:promotable?'CERTIFIED':'BENCHMARK_ONLY',meta,at,price,digital,forwardVarianceATM,audit});
 const diagnosis=promotable?'Calibrazione globale ammissibile nel dominio di strike comune.':
  'Non pubblicabile: '+allValidation.failures+' prezzi fuori spread o vincoli sui coefficienti non soddisfatti.';
 function researchAt(T,k){
  if(!finite(k)||!finite(T))return null;
  const xv=Math.exp(k),call=S.evalCall(T,xv);if(call==null)return null;
  const ref=base.at(T,0,{allowWings:true});if(!ref)return null;
  const put=call-(1-xv),side=k<0?'PUT':'CALL',v=side==='PUT'?put:call;
  const w=D.implied(1,xv,1,v,side);
  return w>0&&finite(w)?{T,k,iv:Math.sqrt(w/T),w,call,put,F:ref.F,D:ref.D,priceCall:ref.D*ref.F*call,status:'DIAGNOSTIC_NON_CERTIFIED'}:null;
 }
 return {ok:true,promotable,status:promotable?'CERTIFIED':'BENCHMARK_ONLY',reason:diagnosis,
  model,meta,degree:n,stats:allValidation,holdout:held,researchAt,
  constraints:{coefficientCount:N,globalShape,marketProjection:fitted.quoteViolation,cycles:fitted.passes,trace:fitted.tail},
  quoteCoverage:meta.quoteCoverage,prior:base,domain:meta.domain};
}
function analyze(group,options={}){
 if(!group)return problem('NO_GROUP','Nessun gruppo di calibrazione.');
 const degree=clamp(Math.round(options.degree)||14,8,18),holdout=!!options.holdout,budget=clamp(Math.round(options.budget)||300,20,850);
 const key=degree+':'+holdout+':'+budget;
 let m=cache.get(group);if(!m){m=new Map();cache.set(group,m);}if(m.has(key))return m.get(key);
 let r;try{r=makeCandidate(group,{degree,holdout,budget});}catch(e){r=problem('FIT_EXCEPTION',String(e?.message||e));}
 m.set(key,r);return r;
}
function peek(group,options={}){const key=(clamp(Math.round(options.degree)||14,8,18))+':'+!!options.holdout+':'+(clamp(Math.round(options.budget)||300,20,850));return cache.get(group)?.get(key)||null;}
root.CVICFlexGlobal=Object.freeze({version:'1.0',analyze,peek,bern,evaluateShape,makeCandidate});
})(globalThis);

