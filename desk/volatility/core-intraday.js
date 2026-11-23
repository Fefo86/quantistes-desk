/* Shared calculation contract for the standalone view and the local pricing API. */
(function(root){
'use strict';
const {CVIData:D,CVIFit:B,CVICert:P,CVILab:L}=root;
const finite=Number.isFinite;
function midGeometry(f){
 const p=f.points.filter(x=>finite(x.mid)&&x.wMid>0).map(x=>({K:x.K,call:x.mid+(x.side==='PUT'?f.D*(f.F-x.K):0)})).sort((a,b)=>a.K-b.K);
 const conflicts=[];let monotonicity=0,vertical=0;
 for(let j=1;j<p.length;j++){
  const l=p[j-1],m=p[j],slope=(m.call-l.call)/(m.K-l.K);
  if(m.call-l.call>1e-8)monotonicity++;
  if(slope< -f.D-1e-8)vertical++;
  const u=p[j+1];if(!u)continue;
  const chord=l.call+(u.call-l.call)*(m.K-l.K)/(u.K-l.K),excess=m.call-chord;
  if(excess>1e-8)conflicts.push({left:l.K,K:m.K,right:u.K,excess});
 }
 return {bilaterals:p.length,triples:Math.max(0,p.length-2),convexityViolations:conflicts.length,increasingCallPairs:monotonicity,slopeBelowMinusDPairs:vertical,
  worst:conflicts.reduce((max,v)=>!max||v.excess>max.excess?v:max,null),priceTolerance:1e-8};
}
function candidateRows(f,c){
 return f.points.map(p=>{const w=B.evaluate(c,p.k).w,price=D.black(f.F,p.K,f.D,w,p.side),hasBid=p.wBid!=null,hasAsk=p.wAsk!=null;
  return {K:p.K,k:p.k,side:p.side,ageSeconds:p.age,kind:p.kind,bid:hasBid?p.bid:null,ask:hasAsk?p.ask:null,mid:p.mid,baseline:p.price,mark:price,
   baselineIV:p.ivFit,markIV:Math.sqrt(w/f.T),markWithin:(!hasBid||price>=p.bid)&&(!hasAsk||price<=p.ask),baselineWithin:p.inside};
 });
}
function quantile(f,z){
 const right=z>0,target=D.normalCDF(-Math.abs(z)),fn=k=>{const v=L.point(f,k);return right?target-v.probAbove:v.probBelow-target;};
 let lo=-.03125,hi=.03125;
 while(lo>-32&&fn(lo)>0)lo*=2;while(hi<32&&fn(hi)<0)hi*=2;
 if(!(fn(lo)<=0&&fn(hi)>=0))return null;
 for(let i=0;i<75;i++){const m=(lo+hi)/2;if(m===lo||m===hi)break;if(fn(m)<0)lo=m;else hi=m;}
 return f.F*Math.exp((lo+hi)/2);
}
function analyze(f,wing=false){
 if(!f?.canonical||!Array.isArray(f.points))throw Error('Seleziona una scadenza con quote ammissibili.');
 const bounds=root.CVIBounds.compute(f),mark=root.CVIMarks.fit(f,wing);
 const baseOk=f.marketPass===true&&f.solver?.status==='CONVERGED'&&f.solver?.kkt?.passes===true&&f.certificate?.status==='CERTIFIED'&&P.fingerprint(f.canonical,f.context)===f.certificate.fingerprint;
 const usable=baseOk&&bounds.status==='FEASIBLE'&&mark.status==='VERIFIED_MARK';
 const m=usable?{...f,canonical:mark.canonical}:null,stats=midGeometry(f);
 const points=usable?candidateRows(f,mark.canonical):f.points.map(p=>({K:p.K,k:p.k,side:p.side,ageSeconds:p.age,kind:p.kind,bid:p.wBid!=null?p.bid:null,ask:p.wAsk!=null?p.ask:null,mid:p.mid,baseline:p.price,baselineIV:p.ivFit,baselineWithin:p.inside,mark:null,markIV:null,markWithin:null}));
 const quantiles=(bounds.rows||[]).map(item=>({...item,baseline:baseOk?quantile(f,item.z):null,mark:usable?quantile(m,item.z):null}));
 const ages=points.map(p=>p.ageSeconds).filter(finite).sort((a,b)=>a-b);
 return {schema:'quantistes.cvi.intraday.v1',asof:f.asof,expiry:f.expiry,symbol:f.symbol,T:f.T,F:f.F,D:f.D,fixing:f.fixing,minutesToFixing:525600*f.T,
  baselineFingerprint:f.certificate.fingerprint,baseEligible:baseOk,markReleased:usable,markScope:'SINGLE_EXPIRY',status:usable?'MARK_RELEASED':'MARK_WITHHELD',
  reason:!baseOk?'Controlli di rilascio della calibrazione base incompleti.':bounds.status!=='FEASIBLE'?bounds.reason:mark.reason,
  tape:{raw:f.audit.raw,admitted:points.length,medianAge:ages.length?ages[(ages.length-1)>>1]:null,maxAge:ages.at(-1)??null,parityPairs:f.audit.parity.count,parityCompatible:f.parityPass,oldestQuoteMs:f.audit.earliest,newestQuoteMs:f.audit.latest},
  midGeometry:stats,base:{stats:f.stats,canonical:f.canonical,certificate:f.certificate,context:f.context,solver:f.solver},observedStrike:f.observed.map(k=>f.F*Math.exp(k)),
  marks:usable?mark:{...mark,canonical:null,candidateFingerprint:null,certificate:null},book:bounds,points,quantiles};
}
function price(r,strike,side='CALL',profile='mark'){
 if(!r||!finite(strike)||!(strike>0)||!['CALL','PUT'].includes(side)||!['base','mark'].includes(profile))throw Error('Strike, lato o profilo non valido.');
 if(profile==='mark'?!r.markReleased:!r.baseEligible)throw Error('Profilo sospeso per questo snapshot.');
 const model=profile==='mark'?r.marks:r.base,canonical=model.canonical,cert=model.certificate,context=model.context;
 if(!canonical||!cert||cert.status!=='CERTIFIED'||P.fingerprint(canonical,context)!==cert.fingerprint||context.F!==r.F||context.T!==r.T||context.D!==r.D)throw Error('Identità della curva non verificata.');
 const k=Math.log(strike/r.F);if(!finite(k)||Math.abs(k)>32)throw Error('Strike fuori dal dominio del valutatore numerico.');
 const p=L.point({F:r.F,D:r.D,T:r.T,canonical},k),premium=side==='CALL'?p.call:p.put;
 if(![p.iv,p.w,premium].every(finite))throw Error('Prezzo fuori risoluzione numerica.');
 const quoted=r.points.find(x=>x.K===strike&&x.side===side),[lo,hi]=r.observedStrike;
 const inRange=strike>=lo-1e-8&&strike<=hi+1e-8;
 const bounds=r.book.digitals||[],low= bounds.find(x=>x.K>=strike)?.lo??0,high=bounds.filter(x=>x.K<=strike).at(-1)?.hi??1;
 return {asof:r.asof,expiry:r.expiry,symbol:r.symbol,profile,side,strike,F:r.F,D:r.D,T:r.T,price:premium,iv:p.iv,totalVariance:p.w,
  cdf:p.probBelow,survival:p.probAbove,densityPerIndexPoint:p.density,g:p.g,region:inRange?'WITHIN_BILATERAL_RANGE':'BEYOND_BILATERAL_RANGE',quoted:quoted?{bid:quoted.bid,ask:quoted.ask,ageSeconds:quoted.ageSeconds}:null,
  outerSurvival:r.book.status==='FEASIBLE'?[low,high]:null,fingerprint:cert.fingerprint,numerics:'FP64',measure:'Q'};
}
root.CVIIntraday=Object.freeze({analyze,midGeometry,price});
})(globalThis);
