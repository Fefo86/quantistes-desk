(function(root){
 'use strict';
 const Q=root.QuantCore,I=root.ImpliedResearch,finite=Number.isFinite;
 const unique=a=>[...new Set(a)].sort((x,y)=>x-y);
 function move(F,expect){
  const mean=expect(s=>s),shift=mean-F,sd=Math.sqrt(expect(s=>(s-mean)**2)),rms=Math.sqrt(expect(s=>(s-F)**2));
  if(![mean,sd,rms].every(finite))return null;
  return {F,mean,meanMove:shift,sd,rms,identityResidual:rms*rms-(sd*sd+shift*shift)};
 }
 function scanCurvature(fn,nodes,sub){
  const grid=[];let maxLogStep=0;
  for(let i=1;i<nodes.length;i++){
   const a=nodes[i-1],b=nodes[i],step=(b-a)/sub;maxLogStep=Math.max(maxLogStep,step);
   for(let j=0;j<sub;j++)grid.push(a+j*step);
  }
  grid.push(nodes.at(-1));const data=grid.map(k=>({k,v:fn(k)})),vs=data.map(p=>p.v).filter(finite);
  const peak=vs.length?Math.max(...vs.map(Math.abs)):0,eps=1e-8*Math.max(1,Math.min(100,peak));
  const pivots=[],extrema=[],zeroBands=[];let prev=null;
  for(let i=0;i<data.length;i++){
   const p=data[i];if(!finite(p.v)){prev=null;continue;}
   if(Math.abs(p.v)<=eps)continue;
   if(prev!==null&&Math.sign(p.v)!==Math.sign(data[prev].v)){
    if(i-prev<=2){
     let a=data[prev].k,b=p.k,sign=Math.sign(data[prev].v),ok=true;for(let j=0;j<45&&b-a>1e-12;j++){const m=(a+b)/2,z=fn(m);if(!finite(z)){ok=false;break;}if(z===0){a=b=m;break;}if(Math.sign(z)===sign)a=m;else b=m;}
     if(ok)pivots.push({k:(a+b)/2,leftSign:sign,bracket:[data[prev].k,p.k]});
    }else zeroBands.push([data[prev+1].k,data[i-1].k]);
   }
   prev=i;
  }
  for(let i=1;i<data.length-1;i++){
   const [a,b,c]=data.slice(i-1,i+2);if(![a.v,b.v,c.v].every(finite))continue;
   const isMax=b.v>a.v+eps&&b.v>c.v+eps,isMin=b.v<a.v-eps&&b.v<c.v-eps;if(!isMax&&!isMin)continue;
   const sign=isMax?1:-1;let l=a.k,h=c.k,best=b;
   for(let iter=0;iter<33;iter++){const k1=l+(h-l)/3,k2=h-(h-l)/3,v1=fn(k1),v2=fn(k2);if(!finite(v1)||!finite(v2))break;
    if(sign*v1>sign*best.v)best={k:k1,v:v1};if(sign*v2>sign*best.v)best={k:k2,v:v2};if(sign*v1>sign*v2)h=k2;else l=k1;}
   extrema.push({...best,type:isMax?'massimo':'minimo',bracket:[a.k,c.k]});
  }
  const finiteRows=data.filter(d=>finite(d.v)),opts=[...finiteRows,...extrema];
  const global=opts.length?[opts.reduce((a,b)=>a.v<b.v?a:b),opts.reduce((a,b)=>a.v>b.v?a:b)]:[];
  return {pivots,extrema,global,zeroBands,maxLogStep,nodes:grid.length,valid:finiteRows.length,eps,trace:data};
 }
 function densityProfile(x,y,lo,hi){
  if(x.length!==y.length||x.length<3||!x.every((s,i)=>finite(s)&&s>0&&(!i||s>x[i-1]))||!y.every(d=>finite(d)&&d>=-1e-12))return null;
  let mass=0;for(let i=1;i<x.length;i++)mass+=(x[i]-x[i-1])*(y[i]+y[i-1])/2;
  if(Math.abs(mass-1)>2e-6)return null;
  const nodes=[];
  for(let i=1;i<x.length;i++){
   const a=x[i-1],b=x[i],l=Math.max(a,lo),h=Math.min(b,hi);if(h<=l)continue;
   const slope=(y[i]-y[i-1])/(b-a),v=s=>s*(y[i-1]+slope*(s-a));
   const turning=slope===0?NaN:(a-y[i-1]/slope)/2;
   if(!nodes.length)nodes.push({s:l,v:v(l)});
   if(turning>l&&turning<h)nodes.push({s:turning,v:v(turning)});
   nodes.push({s:h,v:v(h)});
  }
  if(nodes.length<3)return {modes:[],saddles:[]};
  const toll=Math.max(...nodes.map(a=>Math.abs(a.v)))*1e-11,sets=[];
  for(const p of nodes){const last=sets.at(-1);if(last&&Math.abs(last.v-p.v)<=toll)last.h=p.s;else sets.push({l:p.s,h:p.s,v:p.v});}
  const modes=[],mins=[];for(let i=1;i<sets.length-1;i++){const [a,b,c]=sets.slice(i-1,i+2);if(b.v>a.v&&b.v>c.v)modes.push(b);if(b.v<a.v&&b.v<c.v)mins.push(b);}
  const saddles=[];
  for(const v of mins){const left=modes.filter(a=>a.h<v.l).at(-1),right=modes.find(a=>a.l>v.h);if(!left||!right)continue;
   const depth=1-v.v/Math.min(left.v,right.v),center=(v.l+v.h)/2;
   saddles.push({lo:v.l,hi:v.h,K:center,logDensity:v.v,depth,leftMode:(left.l+left.h)/2,rightMode:(right.l+right.h)/2});
  }return {modes,saddles};
 }
 function geometry(r,sub=12){
  const m=r.ws.model,F=m.F,[lo,hi]=r.ws.nativeLiquid,x=m.knots.map(t=>F+m.scale*t),y=x.map(s=>m.pdf(s));
  if(!(lo>0&&hi>lo&&F>0))throw Error('Intervallo liquido o forward non valido.');
  const nodes=unique([lo,hi,...m.cvi.canonical.knots.map(k=>F*Math.exp(k)).filter(s=>s>lo&&s<hi)]).map(s=>Math.log(s/F)),cache=new Map();
  const fun=k=>{if(!cache.has(k)){const row=I.wing(r,F*Math.exp(k));cache.set(k,row?.wkk??null);}return cache.get(k);};
  const coarse=scanCurvature(fun,nodes,sub),fine=scanCurvature(fun,nodes,sub*2),K=k=>F*Math.exp(k);
  const enrich=(arr,other)=>arr.map(a=>({...a,K:K(a.k),coarseMatch:other.some(b=>b.type===a.type&&b.leftSign===a.leftSign&&b.bracket[0]<=a.k&&a.k<=b.bracket[1])}));
  // Refine extrema of the actual log-price density inside the bilateral domain.
  function densitySaddles(lx,pdf){
  const val=k=>{const price=F*Math.exp(k);return price*pdf(price);};
  const heights=lx.map(val),turns=[];
  for(let i=1;i<lx.length-1;i++){
   const sign=heights[i]>heights[i-1]&&heights[i]>heights[i+1]?1:heights[i]<heights[i-1]&&heights[i]<heights[i+1]?-1:0;
   if(!sign)continue;let a=lx[i-1],b=lx[i+1];
   for(let j=0;j<44;j++){const c=a+(b-a)/3,d=b-(b-a)/3;if(sign*val(c)<sign*val(d))a=c;else b=d;}
   const k=(a+b)/2;turns.push({K:K(k),v:val(k),sign});
  }
  return {saddles:turns.flatMap((o,i)=>{const l=turns[i-1],h=turns[i+1];return o.sign===-1&&l?.sign===1&&h?.sign===1?[{K:o.K,lo:o.K,hi:o.K,logDensity:o.v,depth:1-o.v/Math.min(l.v,h.v),leftMode:l.K,rightMode:h.K}]:[];})};}
  const base=densitySaddles(fine.trace.map(p=>p.k),m.pdf),variants=(r.ws.sensitivityDetails||[]).filter(v=>v.ok&&v.nativeProfile).map(v=>{const c=v.nativeProfile.cvi,f={...c.context,canonical:c.canonical},ns=unique([lo,hi,...c.canonical.knots.map(k=>F*Math.exp(k)).filter(x=>x>lo&&x<hi)]).map(x=>Math.log(x/F));
   const ks=[];for(let j=1;j<ns.length;j++)for(let i=0;i<sub*2;i++)ks.push(ns[j-1]+(ns[j]-ns[j-1])*i/(sub*2));ks.push(ns.at(-1));
   return {label:v.label,fit:densitySaddles(ks,s=>root.CVILab.point(f,Math.log(s/F)).density)};}).filter(v=>v.fit);
  const saddles=(base?.saddles||[]).map(s=>{
   const radius=.5*Math.min(s.K-s.leftMode,s.rightMode-s.K),matched=[];
   for(const v of variants){const found=v.fit.saddles.filter(a=>Math.abs(a.K-s.K)<=radius&&a.leftMode<s.K&&a.rightMode>s.K);
    if(found.length===1)matched.push({label:v.label,K:found[0].K,depth:found[0].depth});}
   return {...s,logReturn:Math.log(s.K/F),matchRadius:radius,matched,profiles:variants.length};
  });
  return {F,liquid:[lo,hi],knots:nodes.length,grid:fine.nodes,valid:fine.valid,subdivisions:2*sub,maxLogStep:fine.maxLogStep,
   maxPriceStep:Math.max(...fine.trace.slice(1).map((p,i)=>K(p.k)-K(fine.trace[i].k))),pivots:enrich(fine.pivots,coarse.pivots),extrema:enrich(fine.extrema,coarse.extrema),
   global:fine.global.map(a=>({...a,K:K(a.k)})),zeroBands:fine.zeroBands.map(a=>a.map(K)),saddles,profiles:variants.length,
   trace:fine.trace.map(a=>({K:K(a.k),wkk:a.v})),qMove:move(F,fn=>Q.expectation(m,fn))};
 }
 root.NativeFeatures={move,scanCurvature,densityProfile,geometry};
})(globalThis);
