/* Optional slice marking profile. Project a released natural cubic in total variance
   onto observed option boxes in the same nodal basis. Shape is independently re-certified. */
(function(root){
'use strict';
const PROFILE='CVI_INTRADAY_BOX_PROJECTION_2', finite=Number.isFinite;
const dot=(a,b)=>{let s=0;for(let j=0;j<a.length;j++)s+=a[j]*b[j];return s;};
const maximum=a=>{let m=0;for(const v of a)m=Math.max(m,Math.abs(v));return m;};
function sourceCheck(f){
 if(!f||f.certificate?.status!=='CERTIFIED'||f.solver?.status!=='CONVERGED'||f.solver?.kkt?.passes!==true||f.marketPass!==true||f.parityPass!==true)
  throw Error('La curva di partenza deve superare geometria, convergenza, mercato e parità.');
 const {canonical:c,context:t}=f;
 if(!c||!t||root.CVICert.fingerprint(c,t)!==f.certificate.fingerprint||f.F!==t.F||f.D!==t.D||f.T!==t.T||f.symbol!==t.symbol||f.fixMs!==t.fixMs||f.timeMs!==t.asofMs||f.expiry!==t.expiry||f.asof!==t.asof)
  throw Error('Identità o contesto della curva di partenza incoerente.');
 const hash=root.CVICert.hash(JSON.stringify(f.points.map(p=>[p.K,p.side,p.bid,p.ask,p.wBid,p.wAsk,p.wMid,p.ms,p.source,p.row])));
 if(hash!==t.quoteHash||hash!==f.quoteHash)throw Error('Provenienza delle quote non verificata.');
}
function priceStats(f,c){
 let bilateral=0,inside=0,unilateral=0,sidedInside=0,accepted=0,maxBreach=0,sq=0,maxMid=0,spreadSq=0;
 const exceptions=[];
 for(const p of f.points){
  const w=root.CVIFit.evaluate(c,p.k).w,mark=root.CVIData.black(f.F,p.K,f.D,w,p.side);
  if(!finite(mark))throw Error('Riprezzamento non finito.');
  const hasBid=p.wBid!=null,hasAsk=p.wAsk!=null;
  const breach=Math.max(0,hasBid?p.bid-mark:0,hasAsk?mark-p.ask:0);
  maxBreach=Math.max(maxBreach,breach);
  if(breach>0)exceptions.push({K:p.K,side:p.side,bid:hasBid?p.bid:null,ask:hasAsk?p.ask:null,mark,breach});
  if(hasBid&&hasAsk){bilateral++;const d=mark-p.mid;sq+=d*d;maxMid=Math.max(maxMid,Math.abs(d));spreadSq+=(d/Math.max(.005,(p.ask-p.bid)/2))**2;if(!breach)inside++;}
  else {unilateral++;if(!breach)sidedInside++;}
  if(!breach)accepted++;
 }
 return {bilateral,inside,unilateral,sidedInside,accepted,total:f.points.length,maxBreach,rmse:Math.sqrt(sq/bilateral),maxAbsMidError:maxMid,rmsHalfSpread:Math.sqrt(spreadSq/bilateral),exceptions};
}
function projectionSystem(f,c){
 const knots=c.knots,n=knots.length,B=root.CVIFit;
 const w=knots.map(k=>B.evaluate(c,k).w);
 const basis=w.map((v,i)=>B.fromNodes(knots,w.map((_,j)=>i===j?v:0)));
 const rules=[];
 function bound(row,rhs){
  const norm=Math.sqrt(dot(row,row));
  if(!(norm>0&&finite(norm)&&finite(rhs)))throw Error('Vincolo privo di scala valida.');
  rules.push({a:row.map(v=>v/norm),b:rhs/norm});
 }
 for(const p of f.points){
  const k=Math.log(p.K/f.F);
  if(!finite(k)||k!==p.k||p.wMid!=null&&p.mid!==(p.bid+p.ask)/2)throw Error('Strike, log-moneyness o mid incoerente con la quota.');
  const at=B.evaluate(c,k).w,row=basis.map(b=>B.evaluate(b,k).w);
  // Reserve at most a millionth of a point strictly inside non-locked price boxes.
  const both=p.wAsk!=null&&p.wBid!=null,margin=both?Math.min(1e-6,(p.ask-p.bid)*1e-4):1e-6;
  if(p.wBid!=null){
   const pad=Math.min(margin,p.bid*1e-4),lo=pad>0?root.CVIData.implied(f.F,p.K,f.D,p.bid+pad,p.side):p.wBid;
   if(!(lo>0))throw Error('Bid fuori dominio.');
   bound(row,lo-at);
  }
  if(p.wAsk!=null){
   const pad=Math.min(margin,p.ask*1e-4),hi=pad>0?root.CVIData.implied(f.F,p.K,f.D,p.ask-pad,p.side):p.wAsk;
   if(!(hi>0))throw Error('Ask fuori dominio.');
   bound(row.map(v=>-v),at-hi);
  }
 }
 for(const direction of [-1,1]){
  const edge=direction<0?knots[0]:knots[n-1],slope=direction*B.evaluate(c,edge).wp,row=basis.map(b=>direction*B.evaluate(b,edge).wp);
  bound(row,-slope);bound(row.map(a=>-a),slope-(2-1e-8));
 }
 return {w,rules,basis,bound};
}
function project(rules,n){
 const x=Array(n).fill(0),dual=Array(rules.length).fill(0),maxSweeps=4000;
 let gap=Infinity,primal=Infinity,stationarity=Infinity,pass=false,sweeps=0;
 for(let it=1;it<=maxSweeps;it++){
  for(let i=0;i<rules.length;i++){
   const {a,b}=rules[i],old=dual[i],next=Math.max(0,old+b-dot(a,x)),delta=next-old;
   if(delta!==0){dual[i]=next;for(let j=0;j<n;j++)x[j]+=delta*a[j];}
  }
  sweeps=it;if(it>10&&it%10!==0)continue;
  primal=0;gap=0;const residual=x.slice();
  for(let i=0;i<rules.length;i++){
   const {a,b}=rules[i],slack=dot(a,x)-b;primal=Math.max(primal,-slack);
   gap+=Math.abs(dual[i]*slack);
   if(dual[i])for(let j=0;j<n;j++)residual[j]-=dual[i]*a[j];
  }
  stationarity=maximum(residual);
  if(primal<=1e-11&&gap<=1e-11&&stationarity<=1e-10){pass=true;break;}
 }
 return {x,diagnostics:{status:pass?'CONVERGED':'BUDGET_EXHAUSTED',sweeps,scaledPrimalViolation:primal,absoluteComplementarity:gap,stationarity,
  dualMin:Math.min(...dual),objective:.5*dot(x,x),constraints:rules.length,active:dual.filter(v=>v>0).length}};
}
function onBasis(f,c,added,base){
 const context={...f.context,markProfile:PROFILE,sourceFingerprint:f.certificate.fingerprint,addedKnots:added.slice()};
 const sys=projectionSystem(f,c);
 const common={profile:PROFILE,basisProfile:added.length?'LOCAL_REFINEMENT':'ORIGINAL_KNOTS',addedKnots:added.slice(),sourceFingerprint:f.certificate.fingerprint,context,base};
 const trace=[];let sol,market,certificate,mark;
 // Sequential local butterfly cuts repair adverse changes in curvature. KKT is
 // relative to the final convex subproblem. Only the independent continuous
 // proof can release its solution; these cuts need not define a global convex set.
 for(let round=0;round<=6;round++){
  sol=project(sys.rules,c.knots.length);common.solver={...sol.diagnostics,cuts:trace.slice()};
  const delta=root.CVIFit.fromNodes(c.knots,sol.x.map((a,i)=>a*sys.w[i]));
  mark={knots:c.knots.slice(),v0:c.v0+delta.v0,slope0:c.slope0+delta.slope0,curvature:c.curvature.map((v,i)=>v+delta.curvature[i])};
  market=priceStats(f,mark);
  if(sol.diagnostics.status!=='CONVERGED')
   return {...common,status:'NO_VERIFIED_MARK',reason:'Budget della proiezione esaurito. La fattibilità non è determinata.',canonical:null,certificate:null,candidateFingerprint:null,market,distortion:null};
  certificate=root.CVICert.slice(mark,{context});
  if(certificate.status==='CERTIFIED'||round===6)break;
  const bad=(certificate.components||[]).filter(z=>z.status==='VIOLATION'&&['butterfly','wing_butterfly'].includes(z.kind)&&finite(z.witness?.k));
  if(!bad.length)break;
  for(const k of new Set(bad.map(item=>item.witness.k))){
   const {w,wp,wpp}=root.CVIFit.evaluate(mark,k),term=1-k*wp/(2*w);
   if(!(w>0))continue;
   const gradW=(term*k*wp+wp*wp/4)/(w*w),gradSlope=-term*k/w-wp/(2*w)-wp/8,g=root.CVIFit.gValue(k,w,wp,wpp);
   const row=sys.basis.map(b=>{const v=root.CVIFit.evaluate(b,k);return gradW*v.w+gradSlope*v.wp+v.wpp/2;});
   sys.bound(row,0.0003-g+dot(row,sol.x));trace.push({round:round+1,k,g});
  }
 }
 const ivDiff=c.knots.map(k=>100*(Math.sqrt(root.CVIFit.evaluate(mark,k).w/f.T)-Math.sqrt(root.CVIFit.evaluate(c,k).w/f.T)));
 const distortion={maxAbsNodeVolPoints:maximum(ivDiff),maxRelNodeVariance:maximum(sol.x),rmsRelNodeVariance:Math.sqrt(dot(sol.x,sol.x)/sol.x.length),
  knots:c.knots.length,atmVolPoints:ivDiff[c.knots.indexOf(0)]};
 const ok=certificate.status==='CERTIFIED'&&market.accepted===market.total;
 return {...common,status:ok?'VERIFIED_MARK':'NO_VERIFIED_MARK',reason:ok?'Tutti i limiti di premio e la geometria continua sono verificati.':
  certificate.status!=='CERTIFIED'?'La proiezione dei premi non supera la verifica geometrica continua.':'La verifica finale in punti di premio non rispetta ogni lato.',
  canonical:ok?mark:null,certificate:ok?certificate:null,candidateFingerprint:ok?certificate.fingerprint:null,geometryStatus:certificate.status,witness:certificate.witness,market,distortion};
}
function calculate(f){
 sourceCheck(f);const base=priceStats(f,f.canonical),added=[],attempts=[],original=f.canonical;
 const bilateral=f.points.filter(p=>p.wBid!=null&&p.wAsk!=null),limit=Math.min(3,35-original.knots.length);
 let c=original,result;
 for(let i=0;i<=limit;i++){
  result=onBasis(f,c,added,base);attempts.push({basis:result.basisProfile,knots:c.knots.length,status:result.status,reason:result.reason,
   convergence:result.solver.status,inside:result.market?.accepted,total:result.market?.total,geometry:result.geometryStatus||null});
  if(result.status==='VERIFIED_MARK'||i===limit)break;
  const violations=new Map((result.market?.exceptions||[]).map(p=>[p.K,p.breach]));
  const ordered=bilateral.map(p=>{const half=Math.max(.005,(p.ask-p.bid)/2),breach=violations.get(p.K)||0;
   return {k:p.k,K:p.K,score:breach/half,distance:finite(result.witness?.k)?Math.abs(p.k-result.witness.k):Infinity};});
  ordered.sort((a,b)=>b.score-a.score||a.distance-b.distance||a.k-b.k);
  const span=original.knots.at(-1)-original.knots[0],k=ordered.find(p=>(p.score>0||finite(p.distance))&&p.k>original.knots[0]&&p.k<original.knots.at(-1)&&c.knots.every(x=>Math.abs(x-p.k)>1e-6*span))?.k;
  if(!finite(k))break;
  added.push(k);const knots=[...original.knots,...added].sort((a,b)=>a-b);
  c={...original,knots,curvature:knots.map(x=>root.CVIFit.evaluate(original,x).wpp)};
 }
 return {...result,attempts};
}
/* A separate, reproducible profile in exactly the same natural-spline CVI basis.
   Work relative to a feasible, independently certified incumbent. */
const WING_PROFILE='CVI_WING_MID_BOX_1';
function cholesky(H){
 const L=H.map(r=>r.map(()=>0));
 for(let i=0;i<H.length;i++)for(let j=0;j<=i;j++){
  let v=H[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];
  if(i===j&&!(v>0))throw Error('Obiettivo del fit ali numericamente singolare.');
  L[i][j]=i===j?Math.sqrt(v):v/L[j][j];
 }
 return L;
}
function triangular(L,b,transpose){
 const n=b.length,sol=b.slice();
 for(let t=0;t<n;t++){
  const i=transpose?n-1-t:t;
  if(transpose){for(let j=i+1;j<n;j++)sol[i]-=L[j][i]*sol[j];}
  else {for(let j=0;j<i;j++)sol[i]-=L[i][j]*sol[j];}
  sol[i]/=L[i][i];
 }
 return sol;
}
function wingWeight(z){return z<=-2?3:z>=2?2:1;}
function wingErrors(f,c,volT){
 const groups={left:{n:0,within:0,squares:0,spreadSquares:0},centre:{n:0,within:0,squares:0,spreadSquares:0},right:{n:0,within:0,squares:0,spreadSquares:0}};let weighted=0;
 for(const p of f.points){
  if(p.wMid==null)continue;
  const k=p.k,z=k/volT,px=root.CVIData.black(f.F,p.K,f.D,root.CVIFit.evaluate(c,k).w,p.side),e=px-p.mid;
  const norm=e/Math.max(.005,(p.ask-p.bid)/2),g=z<=-2?groups.left:z>=2?groups.right:groups.centre;
  g.n++;if(px>=p.bid&&px<=p.ask)g.within++;g.squares+=e*e;g.spreadSquares+=norm*norm;weighted+=wingWeight(z)*norm*norm;
 }
 for(const g of Object.values(groups)){g.rmse=g.n?Math.sqrt(g.squares/g.n):null;g.rmsHalfSpread=g.n?Math.sqrt(g.spreadSquares/g.n):null;delete g.squares;delete g.spreadSquares;}
 return {groups,weighted};
}
function wingCandidate(f,inc){
 if(inc.status!=='VERIFIED_MARK')throw Error('Curva CVI di riferimento sospesa. '+inc.reason);
 const B=root.CVIFit,D=root.CVIData,P=root.CVICert,c=inc.canonical,n=c.knots.length,sys=projectionSystem(f,c),volT=Math.sqrt(B.evaluate(c,0).w);
 const ref=wingErrors(f,c,volT);
 if(ref.groups.left.n<3||ref.groups.right.n<3)throw Error('Richieste almeno tre quotazioni bilaterali per ala oltre due volatilità ATM.');
 const H=c.knots.map(()=>Array(n).fill(0)),rhs=Array(n).fill(0);
 function residual(a,y,weight){
  for(let j=0;j<n;j++){rhs[j]+=weight*y*a[j];for(let i=0;i<n;i++)H[i][j]+=weight*a[i]*a[j];}
 }
 for(let i=0;i<n;i++){
  const z=Math.abs(c.knots[i])/volT,prior=z<1?80:25;
  H[i][i]+=prior*prior;
  const unit=Array(n).fill(0);unit[i]=1;sys.bound(unit,-.035);sys.bound(unit.map(x=>-x),-.035);
  if(i>0&&i<n-1){
   const widths=c.knots[i+1]-c.knots[i-1],g=Array(n).fill(0);
   g[i]=1;g[i-1]=-(c.knots[i+1]-c.knots[i])/widths;g[i+1]=-(c.knots[i]-c.knots[i-1])/widths;
   residual(g,0,25*25);
  }
 }
 for(const p of f.points){
  if(p.wMid==null)continue;
  const w=B.evaluate(c,p.k).w,s=Math.sqrt(w),z=p.k/volT,half=Math.max(.005,(p.ask-p.bid)/2);
  const px=D.black(f.F,p.K,f.D,w,p.side),vegaW=f.D*f.F*D.normalPDF(-p.k/s+s/2)/(2*s);
  residual(sys.basis.map(b=>B.evaluate(b,p.k).w*vegaW/half),(p.mid-px)/half,wingWeight(z));
 }
 for(const sign of [-1,1]){
  const k=sign<0?c.knots[0]:c.knots.at(-1),slope=sign*B.evaluate(c,k).wp;
  const a=sys.basis.map(b=>sign*B.evaluate(b,k).wp),allow=Math.max(1e-9,.04*slope);
  sys.bound(a,Math.max(-slope,-allow));sys.bound(a.map(x=>-x),-allow);
 }
 // Protect nearly binding butterfly margins of the incumbent at spline knots
 // and quarter points. The exact full-domain certificate remains mandatory.
 const kg=[];
 for(let i=0;i<n-1;i++)for(const t of [0,.25,.5,.75])kg.push(c.knots[i]+t*(c.knots[i+1]-c.knots[i]));
 kg.push(c.knots[n-1]);
 for(const k of kg){
  const {w,wp,wpp}=B.evaluate(c,k),g=B.gValue(k,w,wp,wpp);
  if(g>=.20)continue;
  const term=1-k*wp/(2*w),dw=(term*k*wp+wp*wp/4)/(w*w),dp=-term*k/w-wp/(2*w)-wp/8;
  const a=sys.basis.map(b=>{const e=B.evaluate(b,k);return dw*e.w+dp*e.wp+e.wpp/2;});
  if(maximum(a)>0)sys.bound(a,-.40*Math.max(0,g));
 }
 // H = L Lᵀ. In whitened coordinates this is the Euclidean projection already
 // used by the published price-box solver.
 const L=cholesky(H),zero=triangular(L,triangular(L,rhs,false),true);
 const rules=sys.rules.map(({a,b})=>{const q=triangular(L,a,false),scale=Math.sqrt(dot(q,q));return {a:q.map(v=>v/scale),b:(b-dot(a,zero))/scale};});
 const result=project(rules,n);
 if(result.diagnostics.status!=='CONVERGED')throw Error('Il fit ali vincolato non ha raggiunto la tolleranza KKT.');
 const dy=triangular(L,result.x,true).map((v,i)=>v+zero[i]);
 const delta=B.fromNodes(c.knots,dy.map((d,i)=>d*sys.w[i]));
 const context={...inc.context,markProfile:WING_PROFILE,incumbentFingerprint:inc.candidateFingerprint};
 const trials=[];
 for(const factor of [1,.5,.25,.125,.0625,.03125]){
  const proposed={knots:c.knots.slice(),v0:c.v0+factor*delta.v0,slope0:c.slope0+factor*delta.slope0,curvature:c.curvature.map((v,i)=>v+factor*delta.curvature[i])};
  const market=priceStats(f,proposed),errors=wingErrors(f,proposed,volT),ok=market.accepted===market.total&&errors.weighted<ref.weighted-1e-10;
  if(!ok){trials.push({factor,reason:'PRICE_OR_OBJECTIVE'});continue;}
  const betaLeft=-B.evaluate(proposed,c.knots[0]).wp,betaRight=B.evaluate(proposed,c.knots.at(-1)).wp;
  const rightMoment=betaRight>0?1/(2*betaRight)+.5+betaRight/8:Infinity;
  if(!(betaLeft>=0&&betaLeft<2&&betaRight>=0&&betaRight<2&&rightMoment>4)){trials.push({factor,reason:'MOMENT'});continue;}
  const certificate=P.slice(proposed,{context});trials.push({factor,reason:certificate.status});
  if(certificate.status!=='CERTIFIED')continue;
  const stats=priceStats(f,f.canonical),ivDiff=c.knots.map(k=>100*(Math.sqrt(B.evaluate(proposed,k).w/f.T)-Math.sqrt(B.evaluate(f.canonical,k).w/f.T)));
  return {...inc,profile:WING_PROFILE,reason:'Fit ali verificato sui premi ammessi e sulla geometria continua.',sourceFingerprint:f.certificate.fingerprint,canonical:proposed,context,
   candidateFingerprint:certificate.fingerprint,certificate,market,base:stats,solver:{...result.diagnostics,appliedFraction:factor,kktScope:'Proposta quadratica completa prima del controllo geometrico.'},
   distortion:{...inc.distortion,maxAbsNodeVolPoints:maximum(ivDiff),maxRelNodeVariance:Math.max(...proposed.knots.map(k=>Math.abs(B.evaluate(proposed,k).w/B.evaluate(f.canonical,k).w-1))),rmsRelNodeVariance:Math.sqrt(proposed.knots.reduce((a,k)=>a+(B.evaluate(proposed,k).w/B.evaluate(f.canonical,k).w-1)**2,0)/n),atmVolPoints:ivDiff[c.knots.indexOf(0)]},
   wingFit:{profile:WING_PROFILE,incumbentFingerprint:inc.candidateFingerprint,wingThresholdATM:2,wingWeights:[3,1,2],trustFraction:.035,maxSlopeChangeFraction:.04,reference:ref,candidate:errors,trials,betaLeft,betaRight,rightMomentOrder:Number.isFinite(rightMoment)?rightMoment:null}};
 }
 throw Error('Nessun passo del fit ali migliora la perdita sui mid e supera i vincoli di premio, geometria e momenti.');
}

function fit(f,wing=false){
 const now=()=>typeof performance!=='undefined'?performance.now():Date.now(),start=now();
 try{const incumbent=calculate(f),result=wing?wingCandidate(f,incumbent):incumbent;return {...result,elapsedMs:now()-start};}catch(e){return {profile:wing?WING_PROFILE:PROFILE,status:'NO_VERIFIED_MARK',reason:String(e.message||e),sourceFingerprint:f?.certificate?.fingerprint||null,candidateFingerprint:null,canonical:null,certificate:null,market:null,distortion:null,solver:null,elapsedMs:now()-start};}
}
root.CVIMarks=Object.freeze({profile:PROFILE,fit});
})(globalThis);
