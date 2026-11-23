
/* Quantistes canonical SPXW surface contract.
   Single source of truth for released multi-tenor prices and presentations.
   A certified group consists of individually certified European CVI calls with
   continuous calendar certificates in forward-normalized strike x=K/F_T.
   Between adjacent maturities the canonical normalized call is an AFFINE
   combination in calendar time. A convex combination of convex call prices is
   convex; a nondecreasing blend of ordered curves is calendar-monotone.
   It is C0 at quoted maturities; it does not assert continuous Dupire local vol.
 */
(function(root){
'use strict';
const D=root.CVIData,Fit=root.CVIFit,Cert=root.CVICert;
const cache=new WeakMap(), finite=Number.isFinite;
const YEAR='ACT/365F';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function fail(code,reason){return Object.freeze({ok:false,status:code,reason});}
function build(group){
 if(!group||group.marketReady!==true)return fail('NOT_RELEASED','La superficie non è stata pubblicata dal calibratore.');
 const curves=(group.curves||[]).slice().sort((a,b)=>a.T-b.T);
 if(curves.length<2)return fail('INSUFFICIENT_TENORS','Servono almeno due scadenze certificate allo stesso cutoff.');
 if((group.pairs||[]).length!==curves.length-1)return fail('MISSING_CALENDAR_PROOF','Manca almeno un certificato calendar.');
 const asof=curves[0].asof, symbol=curves[0].symbol;
 if(curves.some((c,i)=>c.symbol!==symbol||c.asof!==asof||!(c.F>0&&c.D>0&&c.T>0)||i>0&&!(c.T>curves[i-1].T)))
  return fail('INCONSISTENT_SLICES','Simbolo, cutoff, forward, sconto o ordine scadenze incoerenti.');
 const certs=[];
 for(let i=0;i<curves.length;i++){
  const c=curves[i];
  if(!c.canonical||c.marketPass!==true||c.certificate?.status!=='CERTIFIED')
   return fail('SLICE_NOT_CERTIFIED','Slice '+c.expiry+' non certificata.');
  const fp=Cert.fingerprint(c.canonical,c.context||{});
  if(fp!==c.fingerprint||fp!==c.certificate.fingerprint)
   return fail('FINGERPRINT_MISMATCH','Identità numerica non valida per '+c.expiry+'.');
  if(i){
   const saved=group.pairs[i-1];
   if(saved.near!==curves[i-1].expiry||saved.far!==c.expiry||saved.status!=='CERTIFIED')
    return fail('CALENDAR_PROOF_MISSING','Certificato calendar incompleto: '+curves[i-1].expiry+' / '+c.expiry+'.');
   // Independent continuous verification from the canonical curves, not from
   // the plotting mesh. The result is cached for the life of this group.
   const proof=Cert.calendar(curves[i-1].canonical,c.canonical,
     {nearContext:curves[i-1].context,farContext:c.context});
   if(proof.status!=='CERTIFIED')return fail('CALENDAR_NOT_CERTIFIED',curves[i-1].expiry+' / '+c.expiry+': '+(proof.reason||proof.status));
   certs.push({near:curves[i-1].expiry,far:c.expiry,status:proof.status});
  }
 }
 const missing=(group.missing||[]).concat((group.excluded||[]).map(q=>q.expiry)).filter(Boolean);
 const blockedIntervals=certs.filter(p=>missing.some(expiry=>expiry>p.near&&expiry<p.far)).map(p=>({near:p.near,far:p.far,reason:'REQUESTED_TENOR_NOT_RELEASED'}));
 const eligibleIntervals=certs.filter(p=>!blockedIntervals.some(b=>b.near===p.near&&b.far===p.far));
 if(!eligibleIntervals.length)return fail('NO_CONNECTED_MATURITY_INTERVAL','Tutti gli intervalli fra scadenze rilasciate attraversano tenor richiesti ma sospesi. Pricing multiscadenza disabilitato.');
 const hashSource=JSON.stringify({version:'v1',kernel:'NORMALIZED_EUROPEAN_CALL_AFFINE_TIME',asof,symbol,
  tenorIds:curves.map(c=>[c.expiry,c.fingerprint,c.F,c.D,c.T]),calendar:certs});
 const fingerprint=Cert.hash(hashSource);
 const meta=Object.freeze({schema:'quantistes.cvi.canonical-surface.v1',modelId:fingerprint,
  symbol,asof,measure:'Q',kernel:'NORMALIZED_EUROPEAN_CALL_AFFINE_TIME',
  tenorCount:curves.length,tenors:curves.map(c=>({expiry:c.expiry,T:c.T,F:c.F,D:c.D,fingerprint:c.fingerprint,quoteRange:[c.lo,c.hi]})),
  timeRange:[curves[0].T,curves.at(-1).T],expiryRange:[curves[0].expiry,curves.at(-1).expiry],
  calendarCertificates:certs,eligibleIntervals,blockedIntervals,staticArbitrage:'CERTIFIED_UNDER_PROPORTIONAL_DETERMINISTIC_CARRY',
  localVolatility:'NOT_CERTIFIED_TEMPORAL_DERIVATIVE_DISCONTINUOUS_AT_KNOTS',
  priceConvention:'discounted European calls/puts on SPXW',dayCount:YEAR,
  partial:!!group.partial,extrapolation:'MODEL_ONLY_OUTSIDE_BILATERAL_QUOTES'});
 function at(T,k,{allowWings=false}={}){
  if(!(finite(T)&&T>0&&finite(k)&&Math.abs(k)<20))return null;
  const x=Math.exp(k),tol=8*Number.EPSILON*Math.max(1,T);
  const idx=curves.findIndex(c=>Math.abs(c.T-T)<=tol);
  let near,far,u=0,F,discount,cNorm,pNorm,w,iv,observed;
  if(idx>=0){
   near=far=curves[idx];F=near.F;discount=near.D;
   observed=k>=near.lo-1e-12&&k<=near.hi+1e-12;
   if(!allowWings&&!observed)return null;
   w=Fit.evaluate(near.canonical,k).w;
   if(!(finite(w)&&w>0))return null;
   cNorm=D.black(1,x,1,w,'CALL');pNorm=D.black(1,x,1,w,'PUT');
  }else{
   const j=curves.findIndex(c=>c.T>T);
   if(j<1)return null;near=curves[j-1];far=curves[j];
   if(blockedIntervals.some(gap=>gap.near===near.expiry&&gap.far===far.expiry))return null;
   observed=k>=Math.max(near.lo,far.lo)-1e-12&&k<=Math.min(near.hi,far.hi)+1e-12;
   if(!allowWings&&!observed)return null;
   u=(T-near.T)/(far.T-near.T);
   if(!(u>0&&u<1))return null;
   F=Math.exp((1-u)*Math.log(near.F)+u*Math.log(far.F));
   discount=Math.exp((1-u)*Math.log(near.D)+u*Math.log(far.D));
   const wa=Fit.evaluate(near.canonical,k).w,wb=Fit.evaluate(far.canonical,k).w;
   if(!(wa>0&&wb>0&&finite(wa)&&finite(wb)))return null;
   // Use the OTM leg for numerical stability near intrinsic and in wings.
   if(k<0){
    pNorm=(1-u)*D.black(1,x,1,wa,'PUT')+u*D.black(1,x,1,wb,'PUT');
    cNorm=pNorm+1-x;
   }else{
    cNorm=(1-u)*D.black(1,x,1,wa,'CALL')+u*D.black(1,x,1,wb,'CALL');
    pNorm=cNorm-1+x;
   }
   const side=k<0?'PUT':'CALL';
   const price=side==='PUT'?pNorm:cNorm;
   w=D.implied(1,x,1,price,side);
   if(!(finite(w)&&w>0))return null;
  }
  if(!(finite(cNorm)&&finite(pNorm)&&finite(F)&&finite(discount)&&F>0&&discount>0))return null;
  iv=Math.sqrt(w/T);
  return {ok:true,status:observed?'CERTIFIED_MARK':'MODEL_EXTRAPOLATION',
   modelId:meta.modelId,source:'CANONICAL_NORMALIZED_CALL',
   symbol,asof,T,k,K:x*F,strike:x*F,F,D:discount,iv,w,variance:w,
   call:discount*F*cNorm,put:discount*F*pNorm,
   normalizedCall:cNorm,normalizedPut:pNorm,observed,expiry:idx>=0?near.expiry:null,
   near:near.expiry,far:far.expiry,calendarWeight:u,
   timeContinuity:'C0_EXACT_AT_MARKET_MATURITIES',pricingEligible:observed};
 }
 function price(T,K,side='CALL',opts={}){
  if(!(finite(K)&&K>0)||!['CALL','PUT'].includes(side))return null;
  let F=null;
  const exact=curves.find(c=>Math.abs(T-c.T)<=8*Number.EPSILON*Math.max(1,T));
  if(exact)F=exact.F;
  else{
   const j=curves.findIndex(c=>c.T>T);if(j<1)return null;
   const a=curves[j-1],b=curves[j];
   if(blockedIntervals.some(gap=>gap.near===a.expiry&&gap.far===b.expiry))return null;
   const u=(T-a.T)/(b.T-a.T);
   F=Math.exp((1-u)*Math.log(a.F)+u*Math.log(b.F));
  }
  const res=at(T,Math.log(K/F),opts);
  return res?{...res,side,price:side==='CALL'?res.call:res.put}:null;
 }
 function digital(T,k,opts={}){
  const center=at(T,k,opts);if(!center)return null;
  const x=Math.exp(k),dx=Math.max(.0001*x,1e-5),left=at(T,Math.log(x-dx),opts),right=at(T,Math.log(x+dx),opts);
  if(!left||!right)return null;
  const prob=-(right.normalizedCall-left.normalizedCall)/(2*dx);
  return {probabilityAbove:clamp(prob,0,1),probabilityBelow:clamp(1-prob,0,1),
   strike:center.strike,method:'FINITE_DIFFERENCE_NORMALIZED_CALL',
   status:center.status,stepInNormalizedStrike:dx};
 }
 function forwardVarianceATM(){
  return curves.slice(1).map((c,i)=>{
   const prev=curves[i],wa=Fit.evaluate(prev.canonical,0).w,wb=Fit.evaluate(c.canonical,0).w;
   const v=(wb-wa)/(c.T-prev.T);
   return {from:prev.expiry,to:c.expiry,forwardVariance:v,
    forwardVolatility:v>=0?Math.sqrt(v):null,nonnegative:v>=-1e-10};
  });
 }
 function audit({sampleCount=9}={}){
  const count=Math.max(3,Math.min(21,Math.floor(sampleCount))),probe=[];
  for(let j=0;j<curves.length-1;j++){
   const a=curves[j],b=curves[j+1],T=(a.T+b.T)/2;
   for(let i=0;i<count;i++){
    const k=-.08+i*(.16/(count-1)),p=at(T,k,{allowWings:true});
    if(!p)continue;
    probe.push({T,k,iv:p.iv,F:p.F,D:p.D,normalizedCall:p.normalizedCall,
      normalizedPut:p.normalizedPut,call:p.call,put:p.put,
      status:p.status,parityResidual:p.normalizedCall-p.normalizedPut-(1-Math.exp(k))});
   }
  }
  const maxParity=probe.length?Math.max(...probe.map(r=>Math.abs(r.parityResidual))):null;
  return {schema:meta.schema,generatedAt:new Date().toISOString(),metadata:meta,
   summary:{points:probe.length,maxNormalizedParityResidual:maxParity,
    calendarCheck:'CONTINUOUS_BERNSTEIN_CERTIFICATES_ON_ALL_ADJACENT_CVI_SLICES',
    butterflyCheck:'CONVEX_COMBINATION_OF_CERTIFIED_CONVEX_NORMALIZED_CALLS',
    productionLocalVolatility:false},
   forwardVarianceATM:forwardVarianceATM(),samples:probe};
 }
 return Object.freeze({ok:true,status:'CERTIFIED',meta,at,price,digital,forwardVarianceATM,audit});
}
function get(group){
 if(!group)return fail('NO_GROUP','Gruppo mancante.');
 if(cache.has(group))return cache.get(group);
 let value;try{value=build(group);}catch(error){value=fail('VERIFICATION_EXCEPTION',String(error?.message||error));}
 cache.set(group,value);return value;
}
function exportBook(book){
 return (book?.groups||[]).map(group=>{
  const model=get(group);
  return model.ok?model.audit({sampleCount:11}):{status:model.status,reason:model.reason,
   symbol:group.symbol,asof:group.asof,missing:group.missing||[]};
 });
}
root.CVISurfaceCanonical=Object.freeze({version:'1.0.0',get,exportBook});
})(globalThis);

