
/* Quantistes global SSVI benchmark and guarded model router.
 * Power-law SSVI: w(k,T)=theta(T)/2[1+rho*phi(theta)*k+sqrt((phi(theta)*k+rho)^2+1-rho^2)]
 * phi(theta)=eta*theta^(-gamma), rho fixed, 0<=gamma<=1/2.
 * This is an analytically constrained SSVI candidate, not an implied claim
 * that SSVI can always meet every observed market bid/ask box.
 */
(function(root){
'use strict';
const D=root.CVIData,Fit=root.CVIFit,Cert=root.CVICert,canonical=root.CVISurfaceCanonical;
const finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const results=new WeakMap(),preferences=new WeakMap();let activeBook=null;
function fail(code,reason){return {ok:false,code,reason};}
function slopes(xs,ys,monotone){
 const n=xs.length;if(n<2)return Array(n).fill(0);
 const h=[],d=[];for(let i=0;i<n-1;i++){h[i]=xs[i+1]-xs[i];d[i]=(ys[i+1]-ys[i])/h[i];}
 if(n===2)return[d[0],d[0]];
 const m=Array(n).fill(0);
 function endpoint(d0,d1,h0,h1){let q=((2*h0+h1)*d0-h0*d1)/(h0+h1);
  if(monotone){if(q*d0<=0)q=0;else if(d0*d1<0&&Math.abs(q)>3*Math.abs(d0))q=3*d0;}return q;}
 m[0]=endpoint(d[0],d[1],h[0],h[1]);m[n-1]=endpoint(d[n-2],d[n-3],h[n-2],h[n-3]);
 for(let i=1;i<n-1;i++){
  if(monotone){if(d[i-1]*d[i]<=0)m[i]=0;else{const a=2*h[i]+h[i-1],b=h[i]+2*h[i-1];m[i]=(a+b)/(a/d[i-1]+b/d[i]);}}
  else m[i]=(h[i]*d[i-1]+h[i-1]*d[i])/(h[i]+h[i-1]);
 }
 return m;
}
function cubic(t0,t1,y0,y1,m0,m1,t){
 const h=t1-t0,u=clamp((t-t0)/h,0,1),u2=u*u,u3=u2*u;
 return (2*u3-3*u2+1)*y0+(u3-2*u2+u)*h*m0+(-2*u3+3*u2)*y1+(u3-u2)*h*m1;
}
function ssvi(theta,k,rho,eta,gamma){
 const phi=eta*theta**(-gamma),y=phi*k+rho;
 return theta*.5*(1+rho*phi*k+Math.sqrt(y*y+1-rho*rho));
}
function sufficient(thetaMin,thetaMax,rho,eta,gamma){
 if(!(thetaMin>0&&thetaMax>=thetaMin&&Math.abs(rho)<.985&&eta>0&&gamma>=0&&gamma<=.500000001))return false;
 const ar=1+Math.abs(rho),wing=eta*thetaMax**(1-gamma)*ar,curv=eta*eta*thetaMax**(1-2*gamma)*ar;
 return wing<3.999999&&curv<3.999999;
}
function butterfly(theta,k,rho,eta,gamma){
 const phi=eta*theta**(-gamma),z=phi*k+rho,r=Math.sqrt(z*z+1-rho*rho),w=theta*.5*(1+rho*phi*k+r);
 const wp=theta*phi*.5*(rho+z/r),wpp=theta*phi*phi*.5*(1-rho*rho)/(r*r*r);
 return (1-k*wp/(2*w))**2-(wp*wp/4)*(1/w+1/4)+wpp/2;
}
function minButterfly(thetaLo,thetaHi,rho,eta,gamma){
 let minimum=Infinity,at=null;for(let j=0;j<=12;j++){
  const t=thetaLo+(thetaHi-thetaLo)*j/12;
  for(let q=0;q<=300;q++){
   const k=-12+q*.08,g=butterfly(t,k,rho,eta,gamma);
   if(!finite(g))return {g:-Infinity};
   if(g<minimum){minimum=g;at={theta:t,k};}
  }
 }
 return {g:minimum,at};
}
function nmSolve(objective,initial,maxIter=130){
 let xs=[initial.slice()];
 const steps=[.18,.65,.12];
 for(let i=0;i<initial.length;i++){const a=initial.slice();a[i]+=steps[i];xs.push(a);}
 let scored=xs.map(x=>({x,f:objective(x)}));
 for(let it=0;it<maxIter;it++){
  scored.sort((a,b)=>a.f-b.f);const center=[0,0,0];for(let j=0;j<3;j++)for(let i=0;i<3;i++)center[j]+=scored[i].x[j]/3;
  const worst=scored[3],reflection=center.map((v,j)=>v+(v-worst.x[j]));const fr=objective(reflection);
  if(fr<scored[0].f){const expand=center.map((v,j)=>v+2*(reflection[j]-v)),fe=objective(expand);scored[3]={x:fe<fr?expand:reflection,f:Math.min(fe,fr)};}
  else if(fr<scored[2].f)scored[3]={x:reflection,f:fr};
  else{
   const inside=fr<scored[3].f?reflection:worst.x,contract=center.map((v,j)=>v+.5*(inside[j]-v)),fc=objective(contract);
   if(fc<Math.min(fr,worst.f))scored[3]={x:contract,f:fc};
   else for(let i=1;i<4;i++){const x=scored[0].x.map((v,j)=>v+.5*(scored[i].x[j]-v));scored[i]={x,f:objective(x)};}
  }
  if(it%11===0){const spread=Math.max(...scored.map(z=>z.f))-Math.min(...scored.map(z=>z.f));if(spread<1e-8)break;}
 }
 return scored.sort((a,b)=>a.f-b.f)[0];
}
function makeCandidate(group){
 const base=canonical.get(group);
 if(!base.ok)return fail('CVI_NOT_RELEASED',base.reason);
 const cs=group.curves.slice().sort((a,b)=>a.T-b.T);
 if(cs.length<2)return fail('INSUFFICIENT_TENORS','SSVI richiede almeno due scadenze certificate.');
 const Ts=cs.map(c=>c.T),theta=cs.map(c=>Fit.evaluate(c.canonical,0).w),lnF=cs.map(c=>Math.log(c.F)),lnD=cs.map(c=>Math.log(c.D));
 if(theta.some((v,i)=>!(v>0)||i>0&&!(v>theta[i-1]+1e-12)))
  return fail('ATM_TERM_STRUCTURE','La varianza ATM non è strettamente crescente; non forzo i dati per adattarli a SSVI.');
 const minTheta=theta[0],maxTheta=theta.at(-1),sTheta=slopes(Ts,theta,true),sF=slopes(Ts,lnF,false),sD=slopes(Ts,lnD,false);
 const grid=[];let allPricePoints=[];
 for(let j=0;j<cs.length;j++){
  const c=cs[j],p=(c.points||[]).filter(z=>z.kind==='MID'&&finite(z.mid)&&finite(z.bid)&&finite(z.ask)&&z.ask>=z.bid).sort((a,b)=>a.k-b.k);
  const limit=95,stride=Math.max(1,Math.ceil(p.length/limit));
  for(let i=0;i<p.length;i+=stride)grid.push({j,p:p[i]});
  allPricePoints.push(...(c.points||[]).map(p=>({c,p})));
 }
 if(grid.length<8)return fail('INSUFFICIENT_QUOTES','Meno di otto prezzi bilaterali informativi nei tenor rilasciati.');
 function objective(x){
  const rho=x[0],eta=Math.exp(x[1]),gamma=x[2];
  if(!sufficient(minTheta,maxTheta,rho,eta,gamma))return 1e12+Math.abs(rho)*1e6;
  let loss=0;
  for(const {j,p} of grid){
   const c=cs[j],w=ssvi(theta[j],p.k,rho,eta,gamma);
   const premium=D.black(c.F,p.K,c.D,w,p.side);
   if(!finite(premium))return 1e11;
   const scale=Math.max(.03,p.ask-p.bid);
   let r=(premium-p.mid)/scale;
   loss+=Math.log1p(r*r);
  }
  // A very weak regularizer prevents the global benchmark seeking
  // near-singular wing slopes to fit a handful of noisy quotes.
  return loss/grid.length+.00001*eta*eta;
 }
 const seeds=[[-.65,Math.log(.14),.3],[-.42,Math.log(.45),.45],[-.78,Math.log(.6),.5],[-.2,Math.log(.06),.2],[.02,Math.log(.12),.4]];
 let optimum=null;
 for(const seed of seeds){const v=nmSolve(objective,seed);if(!optimum||v.f<optimum.f)optimum=v;}
 const [rho,logEta,gamma]=optimum.x,eta=Math.exp(logEta);
 if(!sufficient(minTheta,maxTheta,rho,eta,gamma))return fail('NO_ADMISSIBLE_SSVI','L’ottimizzazione non ha trovato parametri SSVI con vincoli analitici soddisfatti.');
 const bf=minButterfly(minTheta,maxTheta,rho,eta,gamma);
 if(!(bf.g>=-1e-10))return fail('NEGATIVE_DENSITY','Il controllo della densità butterfly ha trovato una violazione nel candidato SSVI.');
 let failures=0,within=0,worst={breach:0};let mse=0,count=0;
 for(const {c,p} of allPricePoints){
  if(!finite(p.K)||!(p.K>0)||!['CALL','PUT'].includes(p.side))continue;
  const w=ssvi(theta[cs.indexOf(c)],p.k,rho,eta,gamma),price=D.black(c.F,p.K,c.D,w,p.side);
  if(!finite(price))continue;
  let breach=0;
  if(p.kind==='MID'){if(finite(p.bid))breach=Math.max(breach,p.bid-price);if(finite(p.ask))breach=Math.max(breach,price-p.ask);}
  else if(p.kind==='ASK'&&finite(p.ask))breach=Math.max(breach,price-p.ask);
  else if(p.kind==='BID'&&finite(p.bid))breach=Math.max(breach,p.bid-price);
  breach=Math.max(0,breach);
  if(breach>1e-6){failures++;if(breach>worst.breach)worst={breach,expiry:c.expiry,strike:p.K,side:p.side,bid:p.bid,ask:p.ask,mark:price,kind:p.kind};}
  else within++;
  if(p.kind==='MID'&&finite(p.mid)){mse+=(price-p.mid)**2;count++;}
 }
 const stats={n:within+failures,within,failures,worst,rmse:count?Math.sqrt(mse/count):null,trainingPoints:grid.length,objective:optimum.f,minButterfly:bf.g};
 const promotable=failures===0&&within>0&&finite(stats.rmse);
 function interp(xs,ys,ms,T){let j=xs.findIndex(x=>x>=T);if(j===0)return ys[0];if(j<0)return ys.at(-1);const i=j-1;return cubic(xs[i],xs[j],ys[i],ys[j],ms[i],ms[j],T);}
 const id=Cert.hash(JSON.stringify({kernel:'SSVI_POWER_LAW_PCHIP_THETA',rho,eta,gamma,expiries:cs.map(c=>c.expiry),F:cs.map(c=>c.F),D:cs.map(c=>c.D),theta,asof:cs[0].asof}));
 const meta={modelId:id,kernel:'SSVI_POWER_LAW_GLOBAL_THETA_C1',schema:'quantistes.ssvi.global.v1',symbol:cs[0].symbol,asof:cs[0].asof,measure:'Q',dayCount:'ACT/365F',timeRange:[Ts[0],Ts.at(-1)],expiryRange:[cs[0].expiry,cs.at(-1).expiry],tenors:cs.map((c,i)=>({expiry:c.expiry,T:c.T,F:c.F,D:c.D,theta:theta[i],quoteRange:[c.lo,c.hi]})),calendarCertificates:group.pairs,blockedIntervals:base.meta.blockedIntervals||[],eligibleIntervals:base.meta.eligibleIntervals||[],partial:!!base.meta.partial,staticArbitrage:promotable?'SSVI_ANALYTIC_SUFFICIENT_AND_MARKET_BOX_CERTIFIED':'ANALYTIC_ONLY_MARKET_BOX_FAILED',localVolatility:'TEMPORAL_C1_NORMALIZED_IV_NOT_PRODUCTION_DUPIRE',rho,eta,gamma,thetaContinuity:'C1_PCHIP',discountContinuity:'C1_HERMITE'};
 const boundary=T=>T>=Ts[0]-1e-12&&T<=Ts.at(-1)+1e-12;
 function at(T,k,{allowWings=false}={}){
  if(!boundary(T)||!finite(k)||Math.abs(k)>19)return null;
  const j=Ts.findIndex(t=>t>=T-1e-13);let l=j,r=j;
  if(j<0)return null;
  if(Math.abs(T-Ts[j])>1e-13){l=j-1;r=j;}
  if(l<0)return null;
  if(l!==r&&meta.blockedIntervals.some(x=>x.near===cs[l].expiry&&x.far===cs[r].expiry))return null;
  const observed=k>=Math.max(cs[l].lo,cs[r].lo)-1e-12&&k<=Math.min(cs[l].hi,cs[r].hi)+1e-12;
  if(!allowWings&&!observed)return null;
  const th=interp(Ts,theta,sTheta,T),F=Math.exp(interp(Ts,lnF,sF,T)),D0=Math.exp(interp(Ts,lnD,sD,T)),w=ssvi(th,k,rho,eta,gamma),x=Math.exp(k);
  if(!(th>0&&w>0&&F>0&&D0>0&&finite(w)))return null;
  const normCall=D.black(1,x,1,w,'CALL'),normPut=normCall-(1-x),expiry=l===r?cs[l].expiry:null;
  return {ok:true,status:observed?'CERTIFIED_MARK':'MODEL_EXTRAPOLATION',modelId:id,source:'SSVI_GLOBAL_Q',symbol:meta.symbol,asof:meta.asof,T,k,K:F*x,strike:F*x,F,D:D0,iv:Math.sqrt(w/T),w,variance:w,call:D0*F*normCall,put:D0*F*normPut,normalizedCall:normCall,normalizedPut:normPut,observed,expiry,near:cs[l].expiry,far:cs[r].expiry,pricingEligible:promotable&&observed,timeContinuity:'C1_TOTAL_VARIANCE'};
 }
 function price(T,K,side='CALL',opts={}){
  if(!finite(K)||!(K>0)||!['CALL','PUT'].includes(side)||!boundary(T))return null;
  const F=Math.exp(interp(Ts,lnF,sF,T)),z=at(T,Math.log(K/F),opts);return z?{...z,side,price:side==='CALL'?z.call:z.put}:null;
 }
 function digital(T,k,opts={}){
  const base=at(T,k,opts);if(!base)return null;
  const x=Math.exp(k),h=Math.max(x*.00008,1e-6),left=at(T,Math.log(x-h),opts),right=at(T,Math.log(x+h),opts);
  if(!left||!right)return null;
  const prob=clamp(-(right.normalizedCall-left.normalizedCall)/(2*h),0,1);
  return {probabilityAbove:prob,probabilityBelow:1-prob,strike:base.K,method:'SSVI_CALL_FINITE_DIFFERENCE',status:base.status};
 }
 function forwardVarianceATM(){return cs.slice(1).map((c,i)=>({from:cs[i].expiry,to:c.expiry,forwardVariance:(theta[i+1]-theta[i])/(Ts[i+1]-Ts[i]),nonnegative:true}));}
 function audit({sampleCount=9}={}){
  const probes=[],count=Math.max(3,Math.min(21,Math.floor(sampleCount)));
  for(let i=0;i<cs.length-1;i++){
   const T=.5*(Ts[i]+Ts[i+1]);for(let j=0;j<count;j++){
    const k=-.08+.16*j/(count-1),p=at(T,k,{allowWings:true});if(p)probes.push({T,k,iv:p.iv,call:p.call,put:p.put,status:p.status});
   }
  }
  return {schema:meta.schema,metadata:meta,stats,parameters:{rho,eta,gamma,theta},summary:{points:probes.length,eligibleForPricing:promotable,minimumButterfly:bf.g,marketBreachCount:failures,certification:'SSVI_SUFFICIENT_CONDITIONS_AND_MARKET_BOX'},samples:probes};
 }
 const model=Object.freeze({ok:promotable,status:promotable?'CERTIFIED':'BENCHMARK_ONLY',reason:promotable?'':'SSVI non riprezza tutti i prezzi ammessi entro i rispettivi bid/ask',meta,at,price,digital,forwardVarianceATM,audit});
 return {ok:true,status:promotable?'MARKET_CERTIFIED':'BENCHMARK_ONLY',reason:promotable?'Tutte le quote ammesse rispettate':'Alcune quote sono fuori bid/ask; SSVI resta solo benchmark',promotable,stats,parameters:{rho,eta,gamma,theta},minButterfly:bf.g,model,base};
}
function peek(group){return group?results.get(group)||null:null;}
function analyze(group){if(!group)return fail('NO_GROUP','Nessun gruppo.');if(results.has(group))return results.get(group);let r;try{r=makeCandidate(group);}catch(error){r=fail('CALIBRATION_EXCEPTION',String(error?.message||error));}results.set(group,r);return r;}
function setBook(book){activeBook=book;return book;}
function book(){return activeBook;}
function group(){return activeBook?.groups?.find(g=>g.marketReady)||activeBook?.groups?.[0]||null;}
function preference(g){return preferences.get(g)||'CVI';}
function select(g,name){if(!g)return false;if(name==='SSVI'&&!analyze(g).promotable)return false;preferences.set(g,name==='SSVI'?'SSVI':'CVI');return true;}
function get(g){if(g&&preference(g)==='SSVI'){const a=analyze(g);if(a.promotable)return a.model;}return canonical.get(g);}
function exportBook(book){return (book?.groups||[]).map(g=>({CVI:canonical.get(g).ok?canonical.get(g).audit({sampleCount:9}):{status:canonical.get(g).status,reason:canonical.get(g).reason},SSVI:results.has(g)?analyze(g).model?.audit({sampleCount:9})||analyze(g):{status:'NOT_RUN'},selectedModel:preference(g)}));}
root.CVIModelRouter=Object.freeze({version:'1.0.0',analyze,peek,select,get,setBook,book,group,preference,exportBook,ssvi,butterfly,sufficient});
})(globalThis);

