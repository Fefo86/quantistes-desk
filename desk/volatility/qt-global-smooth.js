
/* Quantistes global regularized continuous-time canonical surface.
 * Analytic in the sense of EXACT polynomial quadrature of the triangular
 * time kernel against each piecewise affine normalized call term, not an
 * approximate sampled grid. Preserves convexity and calendar monotonicity
 * under deterministic proportional carry: the kernel is nonnegative and the
 * transformed times T+h(T)u are increasing since |h'(T)|<1.
 * Original CVI slice and IPPO/Wall Street level fit are not modified.
 */
(function(root){
'use strict';
const D=root.CVIData,Fit=root.CVIFit,Cert=root.CVICert,baseEngine=root.CVISurfaceCanonical;
const finite=Number.isFinite,clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const cache=new WeakMap();
const KERNEL='CVI_GLOBAL_POSITIVE_TRIANGULAR_TIME_SMOOTH_C2';
function fail(code,reason){return {ok:false,status:code,reason};}
function make(group){
 const base=baseEngine.get(group);if(!base.ok)return fail('REFERENCE_UNCERTIFIED',base.reason);
 const cs=group.curves.slice().sort((a,b)=>a.T-b.T),Ts=cs.map(c=>c.T);
 if(cs.length<2)return fail('MIN_TENORS','Serve almeno una coppia di scadenze certificate.');
 const mindt=Math.min(...Ts.slice(1).map((T,i)=>T-Ts[i]));
 if(!(mindt>0))return fail('INVALID_TENORS','Scadenze duplicate o disordinate.');
 const kappa=Math.max(mindt,1e-8),alphaLimit=.65;
 const obs=cs.flatMap(c=>(c.points||[]).filter(p=>finite(p.K)&&p.K>0&&['CALL','PUT'].includes(p.side)&&['MID','BID','ASK'].includes(p.kind)).map(p=>({c,p})));
 if(!obs.length)return fail('NO_OBSERVATIONS','Nessuna quotazione validabile.');
 const nodalCache=new Map();
 function nodal(k){
  // Caching at quoted strike/forward x, shared across all five tenor queries.
  const key=k.toPrecision(16);if(nodalCache.has(key))return nodalCache.get(key);
  const x=Math.exp(k),out=cs.map(c=>{
   const v=Fit.evaluate(c.canonical,k).w;if(!(v>0&&finite(v)))return NaN;
   if(k<0)return D.black(1,x,1,v,'PUT')+1-x;
   return D.black(1,x,1,v,'CALL');
  });
  nodalCache.set(key,out);return out;
 }
 function callLine(s,values){
  if(s<=Ts[0])return values[0];if(s>=Ts.at(-1))return values.at(-1);
  let j=Ts.findIndex(t=>t>=s);if(j<1)j=1;
  const a=(s-Ts[j-1])/(Ts[j]-Ts[j-1]);return values[j-1]*(1-a)+values[j]*a;
 }
 function hfun(T,alpha){return alpha*kappa*(1-Math.exp(-T/kappa));}
 function integratedCall(T,k,alpha){
  if(!(finite(T)&&T>=Ts[0]-1e-13&&T<=Ts.at(-1)+1e-13&&finite(k)&&Math.abs(k)<20))return null;
  const y=nodal(k);if(y.some(z=>!finite(z)))return null;
  const h=hfun(T,alpha);if(h<=1e-15)return callLine(T,y);
  // Triangular kernel with support [T-h,T+h]. Split at every CVI maturity
  // and the apex T; Simpson is EXACT because each resulting integrand is
  // a quadratic polynomial (affine C0 * affine kernel weight).
  const a=T-h,b=T+h;
  const knots=[a,T,b,...Ts.filter(t=>t>a+1e-16&&t<b-1e-16)].sort((x,z)=>x-z);
  let total=0;
  const weight=s=>Math.max(0,(h-Math.abs(s-T))/(h*h));
  for(let i=1;i<knots.length;i++){
   const l=knots[i-1],r=knots[i],mid=.5*(l+r);
   if(r-l<=1e-16)continue;
   total+=(r-l)/6*(callLine(l,y)*weight(l)+4*callLine(mid,y)*weight(mid)+callLine(r,y)*weight(r));
  }
  return total;
 }
 function check(alpha){
  let failures=0,within=0,worst={breach:0},sse=0,mids=0;
  for(const {c,p} of obs){
   const x=p.K/c.F,k=Math.log(x),cp=integratedCall(c.T,k,alpha);
   if(cp==null)return {failures:obs.length,worst:{breach:Infinity}};
   const price=(p.side==='PUT'?cp-(1-x):cp)*c.D*c.F;
   let breach=0;
   if(['MID','BID'].includes(p.kind)&&finite(p.bid))breach=Math.max(breach,p.bid-price);
   if(['MID','ASK'].includes(p.kind)&&finite(p.ask))breach=Math.max(breach,price-p.ask);
   breach=Math.max(0,breach);
   if(breach>0.000001){failures++;if(breach>worst.breach)worst={breach,expiry:c.expiry,strike:p.K,side:p.side,kind:p.kind,bid:p.bid,ask:p.ask,mark:price};}
   else within++;
   if(p.kind==='MID'&&finite(p.mid)){sse+=(price-p.mid)**2;mids++;}
  }
  return {failures,within,n:failures+within,worst,rmse:mids?Math.sqrt(sse/mids):null};
 }
 // Never widen a bid/ask; find maximal nonzero smoothness strength allowed.
 // This is a monotone bisection in the market-box violation (locally, around
 // alpha=0), followed by a verifying sweep of the accepted alpha.
 const initial=check(0);if(initial.failures)return fail('ORIGINAL_MARK_OFF_BOX','Il mark CVI di partenza non rispetta tutti gli spread.');
 let lo=0,hi=alphaLimit,atHi=check(hi);
 if(atHi.failures){for(let i=0;i<27;i++){
  const mid=.5*(lo+hi),res=check(mid);
  if(res.failures)hi=mid;else lo=mid;
 }}else lo=hi;
 const alpha=lo>0?lo*.999999:0,stats=check(alpha),h0=hfun(Ts[0],alpha),hLast=hfun(Ts.at(-1),alpha);
 const minH=1/(365*24*3600); // 1 second
 const promotable=alpha>0&&hLast>=minH&&stats.failures===0;
 const id=Cert.hash(JSON.stringify({kernel:KERNEL,source:cs.map(c=>[c.expiry,c.fingerprint]),kappa,alpha}));
 const meta={schema:'quantistes.cvi.temporal-kernel.v1',modelId:id,kernel:KERNEL,symbol:cs[0].symbol,
  asof:cs[0].asof,measure:'Q',timeRange:[Ts[0],Ts.at(-1)],expiryRange:[cs[0].expiry,cs.at(-1).expiry],
  tenors:cs.map(c=>({expiry:c.expiry,T:c.T,F:c.F,D:c.D,quoteRange:[c.lo,c.hi]})),
  alpha,kappa,hoursAtFront:h0*365*24,hoursAtBack:hLast*365*24,
  quoteCoverage:{included:obs.length,total:obs.length},blockedIntervals:base.meta.blockedIntervals||[],eligibleIntervals:base.meta.eligibleIntervals||[],calendarCertificates:base.meta.calendarCertificates||[],partial:!!base.meta.partial,
  staticArbitrage:promotable?'CERTIFIED_FROM_POSITIVE_MIXTURE_OF_CVI_CALL_SURFACES':'NOT_RELEASED',
  butterfly:'PRESERVED_ALL_STRIKES_FROM_CONTINUOUS_CVI_CERTIFICATES',
  calendar:'PRESERVED_BY_POSITIVE_TIME_KERNEL_AND_MONOTONE_SHIFT_T_HU',
  condition:'hPrime(T)=alpha*exp(-T/kappa) < 1',
  timeContinuity:'C2_FOR_POSITIVE_ALPHA',dayCount:'ACT/365F',
  localVolatility:'MODEL_DEPENDENT_NOT_PRODUCTION_VALIDATED',
  wings:'MODEL_EXTRAPOLATION_OUTSIDE_BILATERAL_QUOTE_COVERAGE',
  notes:'Globally regularized temporal smoother of the certified CVI price surface. Not Vola Dynamics C* proprietary curves.'};
 function at(T,k,{allowWings=false}={}){
  if(!promotable||!finite(T)||!finite(k))return null;
  const prior=base.at(T,k,{allowWings});if(!prior)return null;
  const x=Math.exp(k),call=integratedCall(T,k,alpha);if(call==null)return null;
  const put=call-(1-x),side=k<0?'PUT':'CALL',w=D.implied(1,x,1,k<0?put:call,side);
  if(!(w>0&&finite(w)))return null;
  return {...prior,source:'CVI_GLOBAL_POSITIVE_TIME_KERNEL',modelId:id,
   iv:Math.sqrt(w/T),w,variance:w,call:prior.D*prior.F*call,put:prior.D*prior.F*put,
   normalizedCall:call,normalizedPut:put,timeContinuity:'C2_TEMPORAL_POSITIVE_KERNEL',pricingEligible:prior.pricingEligible};
 }
 function price(T,K,side='CALL',options={}){
  if(!(finite(K)&&K>0)||!['CALL','PUT'].includes(side))return null;
  const z=base.price(T,K,side,options);if(!z)return null;
  const p=at(T,Math.log(K/z.F),options);return p?{...p,side,price:side==='CALL'?p.call:p.put}:null;
 }
 function digital(T,k,options={}){
  const z=at(T,k,options);if(!z)return null;
  const dx=Math.max(.00001*Math.exp(k),1e-6),x=Math.exp(k),a=integratedCall(T,Math.log(x-dx),alpha),b=integratedCall(T,Math.log(x+dx),alpha);
  const p=a==null||b==null?null:clamp((a-b)/(2*dx),0,1);
  return p==null?null:{strike:z.K,probabilityAbove:p,probabilityBelow:1-p,method:'SMOOTHED_CALL_SLOPE',status:z.status};
 }
 function forwardVarianceATM(){return cs.slice(1).map((c,i)=>{
  const a=at(cs[i].T,0,{allowWings:true}),b=at(c.T,0,{allowWings:true}),v=a&&b?(b.w-a.w)/(c.T-cs[i].T):null;
  return {from:cs[i].expiry,to:c.expiry,forwardVariance:v,nonnegative:v!=null&&v>=-1e-9};
 });}
 function audit({sampleCount=9}={}){
  const probes=[],n=clamp(Math.floor(sampleCount)||9,3,17);
  for(let i=1;i<cs.length;i++){
   const T=(cs[i-1].T+cs[i].T)/2;
   for(let j=0;j<n;j++){const k=-.06+.12*j/(n-1),p=at(T,k,{allowWings:true});if(p)probes.push({T,k,iv:p.iv,call:p.call,put:p.put,status:p.status});}
  }
  return {schema:meta.schema,metadata:meta,summary:{market:stats,eligibleForPricing:promotable,
   initialMarket:initial,kernel:'POSITIVE_TRIANGULAR_TIME_CONVOLUTION',
   mathematicalCertificate:'POSITIVE_MIXTURE_OF_CONVEX_CALENDAR_ORDERED_NORMALIZED_CALLS'},samples:probes};
 }
 const model=Object.freeze({ok:promotable,status:promotable?'CERTIFIED':'BENCHMARK_ONLY',meta,at,price,digital,forwardVarianceATM,audit});
 return {ok:true,promotable,status:promotable?'CERTIFIED':'BENCHMARK_ONLY',model,meta,alpha,kappa,stats,
  reason:promotable?'Superficie temporale C2, senza allargare gli spread.':'Nessuna regolarizzazione temporalmente significativa compatibile con tutti i bid/ask.',
  minHours:h0*365*24,maxHours:hLast*365*24,baseline:base};
}
function analyze(g){if(!g)return fail('NO_GROUP','Gruppo mancante.');if(cache.has(g))return cache.get(g);
 let out;try{out=make(g);}catch(e){out=fail('CALIBRATION_EXCEPTION',String(e?.message||e));}
 cache.set(g,out);return out;}
function peek(g){return cache.get(g)||null;}
root.CVISmoothGlobal=Object.freeze({version:'1.0.0',analyze,peek});
})(globalThis);

