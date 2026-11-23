(function(root){
'use strict';
const fit=root.ResearchMath.ivAt,ok=Number.isFinite,ks=[-.02,-.01,0,.01,.02];
function observe(r){
 const grid=ks.map(k=>fit(r,k));
 if(grid.some(v=>!v.within||!ok(v.iv)))return null;
 return {iv:grid.map(v=>v.iv),slope:(grid[3].iv-grid[1].iv)/.02,forward:r.forward.F,time:root.QuantCore.nyEpoch(r.cfg.asof),asof:r.cfg.asof};
}
function increments(series){
 const obs=series.map(observe),delta=[];
 for(let i=1;i<obs.length;i++){const a=obs[i-1],b=obs[i];if(!a||!b)continue;
  const quotes=series[i].ws.model.fitted||[];if(quotes.some(z=>!z.time||root.QuantCore.nyEpoch(z.time)<=a.time))continue;
  delta.push({x:Math.log(b.forward/a.forward),iv:b.iv.map((v,j)=>v-a.iv[j]),slope:b.slope-a.slope,duration:(b.time-a.time)/60000});}
 return delta;
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function line(x,y){
 const mx=mean(x),my=mean(y),v=x.reduce((acc,z)=>acc+(z-mx)**2,0);
 if(v<1e-18)return null;
 const beta=x.reduce((acc,z,i)=>acc+(z-mx)*(y[i]-my),0)/v;return {beta,intercept:my-beta*mx};
}
function pca(delta){
 if(delta.length<6)return null;
 const d=ks.length,m=ks.map((_,j)=>mean(delta.map(z=>z.iv[j]))),mat=ks.map((_,i)=>ks.map((_,j)=>delta.reduce((v,z)=>v+(z.iv[i]-m[i])*(z.iv[j]-m[j]),0)/(delta.length-1)));
 const vec=ks.map((_,i)=>ks.map((_,j)=>Number(i===j)));
 for(let iter=0;iter<160;iter++){
  let p=0,q=1,max=0;for(let i=0;i<d;i++)for(let j=i+1;j<d;j++)if(Math.abs(mat[i][j])>max){p=i;q=j;max=Math.abs(mat[i][j]);}
  if(max<1e-18)break;
  const theta=.5*Math.atan2(2*mat[p][q],mat[q][q]-mat[p][p]),c=Math.cos(theta),s=Math.sin(theta),vp=mat[p][p],vq=mat[q][q],vpq=mat[p][q];
  mat[p][p]=c*c*vp-2*s*c*vpq+s*s*vq;mat[q][q]=s*s*vp+2*s*c*vpq+c*c*vq;mat[p][q]=mat[q][p]=0;
  for(let i=0;i<d;i++){if(i!==p&&i!==q){const x=mat[i][p],y=mat[i][q];mat[p][i]=mat[i][p]=c*x-s*y;mat[q][i]=mat[i][q]=s*x+c*y;}const x=vec[i][p],y=vec[i][q];vec[i][p]=c*x-s*y;vec[i][q]=s*x+c*y;}
 }
 const total=ks.reduce((s,_,i)=>s+mat[i][i],0);if(!(total>1e-17))return null;
 return ks.map((_,i)=>({variance:mat[i][i]/total,loads:vec.map(v=>v[i])})).sort((a,b)=>b.variance-a.variance);
}
function factors(series,interval){
 const delta=increments(series).filter(v=>Math.abs(v.duration-interval)<.001),n=delta.length;
 if(n<6)return {n};
 const x=delta.map(r=>r.x),y=delta.map(r=>r.iv[2]),zs=delta.map(r=>r.slope),last=x.length-1,prior=n>=21?line(x.slice(0,last),y.slice(0,last)):null;
 return {n,pca:pca(delta),ivBeta:line(x,y)?.beta,skewBeta:line(x,zs)?.beta,lastResidual:prior?y[last]-prior.intercept-prior.beta*x[last]:null};
}
function eventVariance(slices,t){
 const obs=slices.map(s=>({t:s.T,w:fit(s,0).w,d:Number(root.QuantCore.nyEpoch(s.cfg.expiry+'T'+s.cfg.expiryTime)>=t)}));
 if(obs.length<3||obs.some(o=>!(o.w>0))||!obs.some(o=>o.d)||!obs.some(o=>!o.d))throw Error('Servono almeno tre scadenze valide, con fixing prima e dopo l’evento.');
 const s=(fn)=>obs.reduce((v,o)=>v+fn(o),0),aa=s(o=>o.t*o.t),bb=s(o=>o.t*o.d),cc=s(o=>o.d),at=s(o=>o.t*o.w),bt=s(o=>o.d*o.w),det=aa*cc-bb*bb;
 const cand=[[Math.max(0,at/aa),0],[0,Math.max(0,bt/cc)]];if(det>0){const v=(at*cc-bt*bb)/det,j=(bt*aa-at*bb)/det;if(v>=0&&j>=0)cand.push([v,j]);}
 const pairs=cand.map(([v,j])=>({v,j,err:Math.sqrt(s(o=>(o.w-v*o.t-j*o.d)**2)/obs.length)}));return pairs.sort((a,b)=>a.err-b.err)[0];
}
function interp(a,b,t,k){
 const fraction=(t-a.T)/(b.T-a.T);if(fraction<0||fraction>1)throw Error('Orizzonte esterno alle scadenze disponibili.');
 const ma=a.ws.model,mb=b.ws.model,u=Math.exp(k),side=k<0?'PUT':'CALL',norm=m=>m.price(m.F*u,side)/(m.D*m.F),premium=(1-fraction)*norm(ma)+fraction*norm(mb),total=root.QuantCore.impliedTotal(1,u,premium,1,side);
 return {iv:total>0?total/Math.sqrt(t):null,premium};
}
root.SurfaceResearch={ks,observe,increments,factors,eventVariance,interp};
})(globalThis);
