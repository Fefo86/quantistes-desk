/* Terminal loss under the native Q, a mean-preserving conditional mixture,
   and model-independent outer bounds conditional on the admitted price box. */
(function(root){
'use strict';
const finite=Number.isFinite;
function checkRange(x,min,max,label){
 if(!finite(x)||x<min||x>max)throw Error(label+' fuori intervallo ['+min+', '+max+'].');
}
const bits=new DataView(new ArrayBuffer(8)),U=1n<<1074n;
function units(x){
 if(!finite(x))throw Error('Quota non finita.');
 bits.setFloat64(0,Math.abs(x),false);
 const b=bits.getBigUint64(0,false),exp=Number((b>>52n)&2047n),mant=b&((1n<<52n)-1n);
 return (x<0?-1n:1n)*(exp?(mant+(1n<<52n))<<BigInt(exp-1):mant);
}
function upRatio(num,den){
 if(num>=den)return 1;
 if(num<=0n)return 0;
 // Integer ceiling, then one binary64 ULP outward after conversion.
 const ceil=((num<<62n)+den-1n)/den,f=Number(ceil)/2**62;
 bits.setFloat64(0,f,false);bits.setBigUint64(0,bits.getBigUint64(0,false)+1n,false);
 return Math.min(1,bits.getFloat64(0,false));
}
function complementDown(p){
 if(p>=1)return 0;if(p<=0)return 1;
 bits.setFloat64(0,1-p,false);bits.setBigUint64(0,bits.getBigUint64(0,false)-1n,false);return bits.getFloat64(0,false);
}
function complementUp(p){
 if(p>=1)return 0;if(p<=0)return 1;
 bits.setFloat64(0,1-p,false);bits.setBigUint64(0,bits.getBigUint64(0,false)+1n,false);return Math.min(1,bits.getFloat64(0,false));
}
function admittedBounds(c){
 if(c.book?.status!=='FEASIBLE')throw Error('Fattibilità della griglia non verificata.');
 const d=units(c.D),f=units(c.F);
 const asks=c.points.filter(q=>finite(q.ask)).map(q=>{
  const k=units(q.K),pay=units(q.ask)*U,parity=d*(f-k);
  return {k,put:q.side==='PUT'?pay:pay-parity,call:q.side==='CALL'?pay:pay+parity};});
 const digitals=c.book.digitals;
 return x=>{
  let low=0,high=1;const t=units(x);
  for(const q of digitals){
   if(q.K<=x&&finite(q.hi))low=Math.max(low,complementDown(q.hi));
   if(q.K>=x&&finite(q.lo))high=Math.min(high,complementUp(q.lo));
  }
  for(const q of asks){
   if(q.k>t&&q.put>=0n)high=Math.min(high,upRatio(q.put,d*(q.k-t)));
   if(q.k<t&&q.call>=0n)low=Math.max(low,complementDown(upRatio(q.call,d*(t-q.k))));
  }
  if(low>high)throw Error('Limiti del book incoerenti.');
  return {low,high};
 };
}
function distribution(model,factors){
 const mean=model.F*factors.reduce((a,v)=>a+v.weight*v.factor,0);
 return {F:mean,D:model.D,cdf:K=>factors.reduce((a,v)=>a+v.weight*model.cdf(K/v.factor),0),
  price:(K,side)=>factors.reduce((a,v)=>a+v.weight*v.factor*model.price(K/v.factor,side),0),
  pdf:K=>factors.reduce((a,v)=>a+v.weight*model.pdf(K/v.factor)/v.factor,0)};
}
function witness(m,L,K){
 if(!(K>0&&K<L))return null;
 const mass=m.cdf(L),put=m.price(L,'PUT');
 if(!(mass>0&&put>0))return null;
 const mu=L-put/(m.D*mass);
 if(!(mu>0&&mu<L))return null;
 const left=Math.min(mu,K)*.5,right=(L+Math.max(mu,K))*.5;
 const fraction=(right-mu)/(right-left);
 if(!(fraction>0&&fraction<1))return null;
 return {join:L,mass,conditionalMean:mu,threshold:K,firstAtom:mu,
   secondAtoms:[{price:left,conditionalMass:fraction},{price:right,conditionalMass:1-fraction}],
   firstCDF:mu<=K?mass:0,secondCDF:mass*fraction};
}
function describe(law,K){
 const p=law.cdf(K),put=law.price(K,'PUT');
 if(!(finite(p)&&p>=0&&p<=1&&finite(put)&&put>=0))throw Error('Risoluzione numerica insufficiente alla soglia selezionata.');
 const meanBelow=p>0?K-put/(law.D*p):null;
 if(meanBelow!==null&&(meanBelow< -1e-7||meanBelow>K+1e-7))throw Error('Media condizionata fuori tolleranza numerica.');
 return {p,put,meanBelow};
}
function evaluate(w,settings){
 if(!w?.cvi?.markReleased||!w.model?.cvi||w.cvi.marks.candidateFingerprint!==w.model.cvi.certificate.fingerprint)throw Error('Occorre un mark CVI rilasciato sulla scadenza selezionata.');
 const {loss,forwardDrop,jump,weight}=settings;
 checkRange(loss,.1,65,'Soglia di ribasso (%)');checkRange(forwardDrop,0,40,'Shock forward (%)');checkRange(jump,0,60,'Salto (%)');checkRange(weight,0,75,'Peso stress (%)');
 const model=w.model,c=w.cvi,p=weight/100,d=1-jump/100,b=1-forwardDrop/100,u=(1-p*d)/(1-p);
 const factors=[{factor:b*u,weight:1-p},{factor:b*d,weight:p}].filter(x=>x.weight>0);
 const stressed=distribution(model,factors),range=admittedBounds(c),L=Math.min(...c.points.map(q=>q.K));
 const [lower,upper]=c.observedStrike;
 function row(v){
  const K=model.F*(1-v/100),native=describe(model,K),shock=describe(stressed,K),bounds=range(K);
  if(native.p+2e-12<bounds.low||native.p>bounds.high+2e-12)throw Error('Cumulata del mark esterna ai limiti del book.');
  return {loss:v,K,native,shock,bounds,region:K<L?'Sotto tutte le quote':K<lower?'Sotto le bilaterali':K<=upper?'Fra le bilaterali':'Oltre le bilaterali'};
 }
 const levels=[...new Set([1,3,5,7,10,15,20,30,50,loss])].sort((a,b)=>a-b);
 return {symbol:c.symbol,asof:c.asof,expiry:c.expiry,mark:c.marks.candidateFingerprint,modelF:model.F,D:model.D,stressF:stressed.F,settings:{...settings},factors,
  join:L,firstBilateral:lower,selected:row(loss),rows:levels.map(row),witness:witness(model,L,model.F*(1-loss/100))};
}
root.CVICrashRisk=Object.freeze({evaluate,distribution,witness,admittedBounds});
})(globalThis);
