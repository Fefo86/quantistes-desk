/* QUANTISTES PHYSICAL PROBABILITY DESK — 09:45 ET / 0DTE
 * Historical SPX paths scaled by contemporaneous pre-event ATM implied straddle;
 * conditional kernel based only on available-at-forecast historical IV and skew.
 * Walk-forward OOS diagnostics embedded in dated data bundle.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id),F=Number.isFinite;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const fmt=(v,n=2)=>F(v)?Number(v).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pct=(v,n=1)=>F(v)?fmt(100*v,n)+'%':'—';
const C={bg:'#0c1927',grid:'#2d4352',axis:'#adc3cd',gold:'#dbc29b',cyan:'#76c5c9',cyanBright:'#b4e6df',red:'#e79aa9',green:'#80d5b4',purple:'#bba8dd',white:'#e8e9df'};
const ST={data:null,dates:[],snapshot:null,model:null,rows:[],selected:null,fan:null,touchMap:null,sort:'distance',sortDesc:false,horizon:375,hover:{},ready:false,spinner:false,sequence:0};
function normalCDF(x){ // Abramowitz-Stegun erf approximation, max abs error ~ 1e-7
 const z=Math.abs(x),t=1/(1+0.2316419*z);
 const v=Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*(0.319381530*t-0.356563782*t*t+1.781477937*t*t*t-1.821255978*t*t*t*t+1.330274429*t*t*t*t*t);
 return clamp(x>=0?1-v:v,0,1);
}
function normalPDF(x){return Math.exp(-.5*x*x)/Math.sqrt(2*Math.PI)}
function unzip64(b64){
 if(typeof DecompressionStream==='undefined')return Promise.reject(Error('Browser non compatibile con gzip. Apri in Chrome/Edge recente.'));
 const raw=atob(b64),a=new Uint8Array(raw.length);for(let j=0;j<a.length;j++)a[j]=raw.charCodeAt(j);
 return new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
function visible(){return $('flow-panel-physical')?.classList.contains('active') && $('view-flows')?.classList.contains('active')}
function decodePath(s){
 if(!s?._cache){if(!s?.hasOutcome)throw Error('Percorso realizzato non disponibile');
 const fac=1/(ST.data?.quantization_per_sigma||400);
 const l=Float64Array.from(s.l,v=>v*fac),h=Float64Array.from(s.h,v=>v*fac),c=Float64Array.from(s.c,v=>v*fac);
 const last=c.length-1;c[last]=s.outcome;l[last]=Math.min(l[last],c[last]);h[last]=Math.max(h[last],c[last]);
 s._cache={l,h,c};
 s._cache.min=Math.min(...s._cache.l);s._cache.max=Math.max(...s._cache.h);
 s._cache.zT=+s.outcome;
 }return s._cache;
}
function computeModel(s,mode){
 const prior=ST.data.snapshots.filter(x=>x.hasOutcome && x.date<s.date);
 if(prior.length<ST.data.min_training_sessions)return {blocked:true,train:prior.length,required:ST.data.min_training_sessions,date:s.date};
 let raw=prior.map(x=>{
  if(mode==='pool')return 1;
  const a=Math.log(x.q_sigma_pct/s.q_sigma_pct)/.55;
  const b=(x.rr25-s.rr25)/.24;
  const c=(x.rr10-s.rr10)/.32;
  const dist=clamp(a*a+.45*b*b+.15*c*c,0,700);
  return Math.exp(-.5*dist);
 });
 let k=raw.reduce((a,b)=>a+b,0);if(k<=1e-10){raw=raw.map(()=>1);k=raw.length;}
 const n=prior.length;const weights=raw.map(v=>mode==='pool'?1/n:.55*v/k+.45/n);
 const norm=weights.reduce((a,b)=>a+b,0),w=weights.map(x=>x/norm),ess=1/w.reduce((a,b)=>a+b*b,0);
 const p=prior.map(decodePath);
 return {prior,p,w,ess,n,blocked:false,date:s.date,spot:s.spot_quote,sigma:s.q_sigma_pts,mode};
}
function wsum(m,fn){let sum=0;for(let i=0;i<m.n;i++)sum+=m.w[i]*Number(!!fn(m.p[i],i));return sum;}
function sampleVar(m,v,fun){let a=0;for(let i=0;i<m.n;i++)a+=m.w[i]*fun(m.p[i],i,v);return a;}
function effectiveHit(m,hitMask){let w=0,w2=0;for(let i=0;i<m.n;i++)if(hitMask[i]){w+=m.w[i];w2+=m.w[i]**2;}return {prob:w,ess:w2>0?w*w/w2:0};}
function weightedQuantile(vals,weights,p){const a=vals.map((x,i)=>({x,w:weights[i]})).sort((x,y)=>x.x-y.x);let c=0;for(let i=0;i<a.length;i++){c+=a[i].w;if(c>=p)return a[i].x;}return a.at(-1)?.x||0;}
function essInterval(p,n){if(!F(p)||!(n>0))return null;const z=1.96,den=1+z*z/n,mid=(p+z*z/(2*n))/den,hw=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,mid-hw),Math.min(1,mid+hw)];}
function firstHitMinute(p,z){
 if(Math.abs(z)<1e-8)return 0;
 if(z>0&&z>p.max)return -1;
 if(z<0&&z<p.min)return -1;
 if(z>0){for(let j=0;j<p.h.length;j++)if(p.h[j]>=z)return j;}
 else {for(let j=0;j<p.l.length;j++)if(p.l[j]<=z)return j;}
 return -1;
}
function reaction(p,z,hit,buffer,win){
 if(hit<0)return 0;
 const up=z>=0,end=Math.min(375,hit+win+1);
 for(let j=Math.abs(z)<1e-8?0:hit+1;j<(Math.abs(z)<1e-8?Math.min(375,win):end);j++){
  const rev=up?p.l[j]<=z-buffer:p.h[j]>=z+buffer;
  const brk=up?p.h[j]>=z+buffer:p.l[j]<=z-buffer;
  if(rev&&brk)return 3; // intraminute order unknowable
  if(rev)return 1;
  if(brk)return 2;
 }
 return 0;
}
function singleLevel(m,K,extra=true){
 const z=(K-m.spot)/m.sigma,up=z>=0,buffer=Number($('qpReactionBand').value)||.25,win=Number($('qpReactMinutes').value)||30;
 const pinWidth=Number($('qpPinWidth').value)||10,pinZ=pinWidth/m.sigma;
 let pAbove=0,pBeyond=0,pTouch=0,pPin=0,hitSum2=0,rev=0,brk=0,unknown=0,firsts=[],hitCount=0;
 for(let i=0;i<m.n;i++){
  const p=m.p[i],w=m.w[i],zT=p.zT;
  pAbove+=w*(zT>z);pBeyond+=w*(up?zT>z:zT<z);pPin+=w*(Math.abs(zT-z)<=pinZ);
  const hit=Math.abs(z)<1e-8?true:(up?p.max>=z:p.min<=z);
  if(hit){pTouch+=w;hitSum2+=w*w;hitCount++;
   if(extra){const j=firstHitMinute(p,z);if(j>=0){const v=reaction(p,z,j,buffer,win);if(v===1)rev+=w;else if(v===2)brk+=w;else unknown+=w;}}
  }
 }
 const hitESS=hitSum2>0?pTouch*pTouch/hitSum2:0;
 // Retain null for unsupported conditional events
 const validEvent=extra&&hitESS>=30&&pTouch>=.025;
 return {K,z,up,distance:Math.abs(K-m.spot),pAbove,pBeyond,pTouch,pPin,
  qAbove:1-normalCDF(z),qBeyond:1-normalCDF(Math.abs(z)),qTouch:Math.min(1,2*(1-normalCDF(Math.abs(z)))),
  qPin:normalCDF(z+pinZ)-normalCDF(z-pinZ),
  pReversal:validEvent?rev/pTouch:null,pBreakout:validEvent?brk/pTouch:null,pNeutral:validEvent?unknown/pTouch:null,
  hitESS,hitCount,hitMass:pTouch,deltaQ:pAbove-(1-normalCDF(z)),interval:essInterval(pTouch,m.ess),
  tailBlocked: Math.min(pAbove,1-pAbove)<1/(2*m.ess)};
}
function buildRows(m,s){
 const rows=s.strikes.map(x=>singleLevel(m,+x,true));
 if(!rows.length||rows.length!==s.strikes.length)throw Error('Incompleta la copertura degli strike.');
 const violations=rows.filter(r=>r.pTouch+1e-8<r.pBeyond);
 if(violations.length)throw Error('Invariante first-touch non rispettata su '+violations.length+' strike.');
 return rows;
}
function calcFan(m){
 const zkeys=[.05,.10,.25,.5,.75,.90,.95];const res=[{j:0,price:zkeys.map(()=>m.spot),q:zkeys.map(()=>0),median:m.spot}];
 for(let j=0;j<375;j++){
  const z=m.p.map(v=>v.c[j]);const q=zkeys.map(a=>weightedQuantile(z,m.w,a));
  res.push({j:j+1,price:q.map(v=>m.spot+m.sigma*v),q,median:m.spot+m.sigma*q[3]});
 }
 return res;
}
function firstCDF(m,K){
 const z=(K-m.spot)/m.sigma;const hist=new Float64Array(376),uncond=new Float64Array(376);
 for(let i=0;i<m.n;i++){
  const minute=firstHitMinute(m.p[i],z);if(minute>=0){const bin=Math.abs(z)<1e-8?0:Math.min(375,minute+1);hist[bin]+=m.w[i];uncond[bin]+=1/m.n;}
 }
 for(let t=1;t<=375;t++){hist[t]+=hist[t-1];uncond[t]+=uncond[t-1];}
 return {hist,uncond,z};
}
function canvas(id,height){const el=$(id);if(!el)return null;
 const rect=el.parentNode.getBoundingClientRect(),w=Math.max(275,rect.width),dpr=Math.min(2,root.devicePixelRatio||1);
 const pxw=Math.round(w*dpr),pxh=Math.round(height*dpr);
 if(el.width!==pxw||el.height!==pxh){el.width=pxw;el.height=pxh;}
 el.style.width=w+'px';el.style.height=height+'px';
 const ctx=el.getContext('2d');if(!ctx)return null;
 ctx.setTransform(dpr,0,0,dpr,0,0);return {el,ctx,w,h:height,dpr};}
function cleanOverlay(id){
 const base=$(id.replace(/Hover$/,''));
 const h=base?.getBoundingClientRect()?.height||315;
 const p=canvas(id,h>0?h:315);
 if(p)p.ctx.clearRect(0,0,p.w,p.h);
 return p;
}
function axes(ctx,w,h,{left=64,right=20,top=25,bottom=38,xMin=0,xMax=1,yMin=0,yMax=1,xTicks=5,yTicks=5,xFmt=v=>fmt(v,0),yFmt=v=>fmt(v,0)}={}){
 const L=left,R=w-right,T=top,B=h-bottom,X=x=>L+(x-xMin)/(xMax-xMin||1)*(R-L),Y=y=>B-(y-yMin)/(yMax-yMin||1)*(B-T);
 ctx.strokeStyle=C.grid;ctx.lineWidth=.65;ctx.fillStyle=C.axis;ctx.font='11px Consolas';
 for(let k=0;k<=xTicks;k++){const z=xMin+(xMax-xMin)*k/xTicks,x=X(z);ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,B);ctx.stroke();ctx.textAlign='center';ctx.fillText(xFmt(z),x,B+18)}
 for(let k=0;k<=yTicks;k++){const z=yMin+(yMax-yMin)*k/yTicks,y=Y(z);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(yFmt(z),L-8,y+4)}
 return {L,R,T,B,X,Y,xMin,xMax,yMin,yMax};
}
function bg(ctx,w,h,title){ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);ctx.fillStyle='#8ed1ea';ctx.font='10px Consolas';ctx.textAlign='left';if(title)ctx.fillText(title,13,16)}
function plotLine(ctx,points,X,Y,color,width=2,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();points.forEach((p,i)=>{const x=X(p[0]),y=Y(p[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([])}
function plotBand(ctx,rows,lo,hi,X,Y,color){ctx.fillStyle=color;ctx.beginPath();rows.forEach((r,i)=>i?ctx.lineTo(X(r.j),Y(r.price[lo])):ctx.moveTo(X(r.j),Y(r.price[lo])));for(let i=rows.length-1;i>=0;i--)ctx.lineTo(X(rows[i].j),Y(rows[i].price[hi]));ctx.closePath();ctx.fill()}
function attachOverlay(id,chart,cb){
 const el=$(id);if(!el)return;el.onmousemove=e=>{
  const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const info=chart();if(!info)return;
  const {a}=info;if(x<a.L||x>a.R||y<a.T||y>a.B){cleanOverlay(id);return}
  const xp=clamp(a.xMin+(x-a.L)/(a.R-a.L)*(a.xMax-a.xMin),a.xMin,a.xMax);
  const yp=clamp(a.yMin+(a.B-y)/(a.B-a.T)*(a.yMax-a.yMin),a.yMin,a.yMax);
  const overlay=cleanOverlay(id);if(!overlay)return;
  const ctx=overlay.ctx;ctx.strokeStyle='rgba(225,221,203,.85)';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,a.T);ctx.lineTo(x,a.B);ctx.moveTo(a.L,y);ctx.lineTo(a.R,y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#96bdf2';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#0c2134';ctx.fillRect(a.L,y-12,Math.max(20,a.L-3),21);ctx.fillStyle='#9fc3f4';ctx.font='11px Consolas';ctx.textAlign='right';ctx.fillText(fmt(yp,yp>10?2:3),a.L-4,y+4);
  cb({x:xp,y:yp,px:x,py:y,ctx});
 };
 el.onmouseleave=()=>{cleanOverlay(id)};
}
function buildFan(){const m=ST.model;if(!m||m.blocked)return;const p=canvas('qpFan',420);if(!p)return;
 const {ctx,w,h}=p;bg(ctx,w,h,'P DISTRIBUZIONE FISICA · P05/P95 / P25/P75 / MEDIANA');
 if(!ST.fan)ST.fan=calcFan(m);
 const arr=ST.fan,lo=Math.min(...arr.map(a=>a.price[0]),m.spot-3*m.sigma),hi=Math.max(...arr.map(a=>a.price[6]),m.spot+3*m.sigma);
 const a=axes(ctx,w,h,{left:74,right:20,top:25,bottom:40,xMin:0,xMax:375,yMin:lo,yMax:hi,xFmt:x=>x>=375?'T':`${Math.round(x)}m`});
 plotBand(ctx,arr,0,6,a.X,a.Y,'rgba(110,183,215,.11)');plotBand(ctx,arr,2,4,a.X,a.Y,'rgba(110,183,215,.26)');
 plotLine(ctx,arr.map(d=>[d.j,d.median]),a.X,a.Y,C.cyan,2.2);
 const qL=arr.map(d=>[d.j,m.spot+1.645*m.sigma*Math.sqrt(d.j/375)]),qU=arr.map(d=>[d.j,m.spot-1.645*m.sigma*Math.sqrt(d.j/375)]);
 plotLine(ctx,qL,a.X,a.Y,'rgba(220,218,202,.65)',1,[4,4]);plotLine(ctx,qU,a.X,a.Y,'rgba(220,218,202,.65)',1,[4,4]);
 const K=ST.selected;if(F(K)&&K>lo&&K<hi){plotLine(ctx,[[0,K],[375,K]],a.X,a.Y,'rgba(157,194,244,.84)',1,[4,2]);ctx.textAlign='right';ctx.fillStyle=C.purple;ctx.fillText('STRIKE '+fmt(K,0),a.R-4,a.Y(K)-6)}
 plotLine(ctx,[[0,m.spot],[375,m.spot]],a.X,a.Y,'rgba(177,198,218,.35)',1,[3,5]);
 ctx.fillStyle=C.cyan;ctx.textAlign='left';ctx.fillText('P mediana',a.L+5,a.T+14);ctx.fillStyle=C.gold;ctx.fillText('Q ATM ±1,645σ(t)',a.L+112,a.T+14);
 ST.hover.fan={a};
 attachOverlay('qpFanHover',()=>ST.hover.fan,({x,y})=>{
  const t=clamp(Math.round(x),0,375),row=arr[t],z=(y-m.spot)/m.sigma;
  const pAbove=t===0?Number(m.spot>y):wsum(m,v=>v.c[t-1]>z),qAbove=t===0?Number(m.spot>y):1-normalCDF(z/Math.sqrt(t/375));
  $('qpFanRead').innerHTML=`<b>09:45 + ${t}m</b> · Cursore SPX <b>${fmt(y,2)}</b> · P mediana <strong>${fmt(row.median,2)}</strong> · P 50% <b>${fmt(row.price[2],2)}–${fmt(row.price[4],2)}</b> · P 90% <b>${fmt(row.price[0],2)}–${fmt(row.price[6],2)}</b> · P(close &gt; cursore) <strong>${pct(pAbove,1)}</strong> · Q ATM ${pct(qAbove,1)}`;
 });
}
function densityCurve(){const m=ST.model;if(!m||m.blocked)return;const p=canvas('qpDensity',352);if(!p)return;
 const {ctx,w,h}=p;
 const k=m.sigma,lo=m.spot-3.7*k,hi=m.spot+3.7*k;
 const xv=[],dp=[],dq=[],bandwidth=Math.max(4,.22*k);
 const n=90,step=(hi-lo)/(n-1);
 for(let j=0;j<n;j++){
  const x=lo+j*step;
  let val=0;for(let i=0;i<m.n;i++){const z=(x-m.spot-m.p[i].zT*k)/bandwidth;val+=m.w[i]*normalPDF(z)/bandwidth;}
  xv.push(x);dp.push(val);dq.push(normalPDF((x-m.spot)/k)/k);
 }
 const ymax=Math.max(...dp,...dq)*1.1;
 // redraw axes with proper density scale in % per 1 sigma move
 bg(ctx,w,h,'DENSITÀ · '+(m.mode==='pool'?'P empirica':'P condizionale')+' / Q ATM proxy · % per punto SPX');
 const ax=axes(ctx,w,h,{left:58,right:18,top:24,bottom:35,xMin:lo,xMax:hi,yMin:0,yMax:ymax,xFmt:x=>fmt(x,0),yFmt:y=>fmt(y*100,2)});
 plotLine(ctx,xv.map((x,i)=>[x,dp[i]]),ax.X,ax.Y,C.cyan,2.3);
 plotLine(ctx,xv.map((x,i)=>[x,dq[i]]),ax.X,ax.Y,C.gold,1.5,[4,3]);
 const K=ST.selected;if(F(K)&&K>=lo&&K<=hi)plotLine(ctx,[[K,0],[K,ymax]],ax.X,ax.Y,C.purple,1,[3,3]);
 ctx.fillStyle=C.cyan;ctx.fillText('P density',ax.L+3,ax.T+12);ctx.fillStyle=C.gold;ctx.fillText('Q ATM',ax.L+96,ax.T+12);
 ST.hover.density={a:ax};
 attachOverlay('qpDensityHover',()=>ST.hover.density,({x})=>{
  const z=(x-m.spot)/m.sigma,pAbove=wsum(m,v=>v.zT>z),q=1-normalCDF(z);
  $('qpDensityRead').innerHTML=`Strike interrogato <b>${fmt(x,2)}</b> · P(close sopra) <strong>${pct(pAbove,2)}</strong> · Q ATM proxy <b>${pct(q,2)}</b> · Δ P−Q <b>${pct(pAbove-q,2)}</b> · P(coda) = empirica, senza estrapolazione`;
 });
}
function touchTimeSurface(){const m=ST.model;if(!m||m.blocked)return;const plot=canvas('qpTouchMap',352);if(!plot)return;
 const {ctx,w,h}=plot;bg(ctx,w,h,'FIRST PASSAGE / LEVEL × TIME');
 const times=24,ks=61,spot=m.spot,sigma=m.sigma;
 const priceRows=Array.from({length:ks},(_,i)=>spot+(i-(ks-1)/2)/((ks-1)/2)*2.7*sigma);
 const bins=Array.from({length:times},(_,j)=>Math.round((j+1)/times*375));
 const d=priceRows.map(K=>{
   const z=(K-spot)/sigma,vals=[];
   const first=m.p.map(p=>firstHitMinute(p,z));
   for(let t of bins){let prob=0;for(let i=0;i<m.n;i++)if(first[i]>=0&&first[i]<t)prob+=m.w[i];vals.push(prob);}
   return vals;
 });
 const a=axes(ctx,w,h,{left:65,right:18,top:22,bottom:35,xMin:0,xMax:375,yMin:priceRows[0],yMax:priceRows.at(-1),xFmt:x=>fmt(x,0)+'m',yFmt:y=>fmt(y,0),yTicks:6});
 const cw=(a.R-a.L)/times,ch=(a.B-a.T)/ks;
 for(let k=0;k<ks;k++)for(let j=0;j<times;j++){
  const v=d[k][j],power=Math.sqrt(v);ctx.fillStyle=`rgba(${v>.5?'153,222,255':'135,181,255'},${.07+Math.min(.8,power*.79)})`;
  ctx.fillRect(a.L+j*cw,a.B-(k+1)*ch,cw+.4,ch+.5);
 }
 if(F(ST.selected)&&ST.selected>a.yMin&&ST.selected<a.yMax){plotLine(ctx,[[0,ST.selected],[375,ST.selected]],a.X,a.Y,C.purple,1,[3,3]);}
 ST.touchMap={priceRows,bins,values:d,axes:a};ST.hover.touch={a};
 attachOverlay('qpTouchMapHover',()=>ST.hover.touch,({x,y})=>{
  const i=clamp(Math.round((y-priceRows[0])/(priceRows.at(-1)-priceRows[0])*(ks-1)),0,ks-1),j=clamp(Math.ceil(x/375*times)-1,0,times-1),p=d[i][j];
  $('qpTouchRead').innerHTML=`SPX <b>${fmt(priceRows[i],2)}</b> · tempo <b>${bins[j]}m</b> · P(first touch entro t) <strong>${pct(p,2)}</strong> · campione ${m.n} sedute · effective N ${fmt(m.ess,0)}`;
 });
}
function touchCurve(){const m=ST.model;if(!m||m.blocked)return;const plot=canvas('qpTouchCurve',315);if(!plot)return;
 const {ctx,w,h}=plot;bg(ctx,w,h,'CUMULATIVE FIRST-TOUCH · P vs Q ATM');
 const data=firstCDF(m,ST.selected),z=data.z,a=axes(ctx,w,h,{left:57,right:18,top:22,bottom:38,xMin:0,xMax:375,yMin:0,yMax:1,xFmt:x=>fmt(x,0)+'m',yFmt:y=>fmt(y*100,0)+'%'});
 const pc=[],qc=[];
 for(let t=0;t<=375;t+=3){pc.push([t,data.hist[t]]);qc.push([t,Math.min(1,2*(1-normalCDF(Math.abs(z)/Math.sqrt(Math.max(t,0.5)/375))))]);}
 plotLine(ctx,pc,a.X,a.Y,C.cyan,2.1);plotLine(ctx,qc,a.X,a.Y,C.gold,1.3,[5,4]);
 const t=ST.horizon;plotLine(ctx,[[t,0],[t,1]],a.X,a.Y,C.purple,1,[3,4]);
 ST.hover.curve={a,pc,qc,values:data};
 attachOverlay('qpTouchCurveHover',()=>ST.hover.curve,({x})=>{
  const t=clamp(Math.round(x),0,375),p=data.hist[t],q=Math.min(1,2*(1-normalCDF(Math.abs(z)/Math.sqrt(Math.max(t,.5)/375))));
  $('qpCurveRead').innerHTML=`Livello <b>${fmt(ST.selected,2)}</b> · t <b>${t}m</b> · P cumulata <strong>${pct(p,2)}</strong> · Q ATM browniana proxy <b>${pct(q,2)}</b> · differenza <b>${pct(p-q,2)}</b>`;
 });
}
function renderKPIs(){const m=ST.model,s=ST.snapshot;if(!m||m.blocked)return;
 const lev=ST.rows.find(r=>r.K===ST.selected)||singleLevel(m,ST.selected,true);
 const selectedCDF=firstCDF(m,ST.selected),t=ST.horizon;
 const val=[
  ['SPX · 09:45 ET',fmt(m.spot,2),'Fonte chain 0DTE'],
  ['IMPLIED 1σ MOVE',fmt(m.sigma,2)+' pt',fmt(s.q_sigma_pct*100,2)+'% SPX'],
  ['P CLOSE > SPOT',pct(wsum(m,v=>v.zT>0),1),'Frequenza condizionata'],
  ['P TOUCH · '+fmt(ST.selected,0),pct(selectedCDF.hist[t],1),`entro ${t} minuti`],
  ['P REVERSAL | TOUCH',lev.pReversal===null?'—':pct(lev.pReversal,1),lev.hitESS<30?'Hit ESS insuff.':'Condiz. dopo primo tocco'],
  ['SAMPLE EFFETTIVO',fmt(m.ess,1),m.n+' sedute storiche'],
 ];
 $('qpKpis').innerHTML=val.map(([title,big,small])=>`<div class="qp-kpi"><small>${title}</small><strong>${big}</strong><em>${small}</em></div>`).join('');
 $('qpAsOf').textContent=s.date+' · '+fmt(s.spot_quote,2);
 $('qpHorizonLabel').textContent=String(t)+' / 375 min';
}
function quality(){const s=ST.snapshot,m=ST.model;if(!m)return;
 if(m.blocked){$('qpQualityStrip').textContent=`STORICO INSUFFICIENTE · ${s.date} · ${m.train} sedute precedenti; necessarie almeno ${m.required}. Nessuna probabilità P pubblicata.`;return;}
 const observed=backtestBefore(s.date);
 if(!observed){$('qpQualityStrip').textContent='P fisica · '+s.date+' · '+m.n+' sedute di stima · verifica fuori campione in attesa';return;}
 const n=observed.close_up.n_test, q=observed.close_up.Q_ATM_Gaussian_proxy.brier,p=observed.close_up[m.mode==='pool'?'P_pool':'P_conditional'].brier;
 $('qpQualityStrip').innerHTML=`<b>PHYSICAL P</b> · ${s.date} 09:45 ET · <b>${m.n}</b> sedute precedenti · ESS <b>${fmt(m.ess,1)}</b> · Strike <b>${s.strikes.length}</b> · Walk-forward <b>${n}</b> test · <b>NESSUN EDGE VALIDATO</b> · Verifica fino al ${observed.close_up.last_test} · Brier close↑ ${m.mode==='pool'?'P empirica':'P condizionale'} ${fmt(p,6)} / Q ATM ${fmt(q,6)} · Dealer 2025 escluso dall'addestramento`;
}
function displayProb(v){const n=ST.model?.ess||100;if(!F(v))return '—';if(v<1e-11)return '≤'+pct(1/n,1);if(v>1-1e-11)return '≥'+pct(1-1/n,1);return pct(v,1)}
function makeEvent(title,v,sub,cl=''){return `<div class="qp-event ${cl}"><small>${title}</small><b>${displayProb(v)}</b><em>${sub}</em></div>`}
function eventCards(){const m=ST.model;if(!m||m.blocked)return;const lev=ST.rows.find(r=>r.K===ST.selected)||singleLevel(m,ST.selected,true);
 const width=Number($('qpPinWidth').value),z=lev.z;
 $('qpEvents').innerHTML=[
  makeEvent('P CLOSE BEYOND',lev.pBeyond,'lato '+(lev.up?'up':'down')),
  makeEvent('P FIRST TOUCH',lev.pTouch,'sull’intero orizzonte'),
  makeEvent('REVERSAL | HIT',lev.pReversal,`ESS hit ${fmt(lev.hitESS,0)}`),
  makeEvent('BREAKOUT | HIT',lev.pBreakout,`entro ${$('qpReactMinutes').value} min`, 'qp-risk'),
  makeEvent('P PIN · ±'+width+'pt',lev.pPin,'a fine sessione'),
  makeEvent('Q ATM CLOSE BEYOND',lev.qBeyond,'proxy, non CVI'),
 ].join('');
 $('qpEventRead').innerHTML=`Strike <b>${fmt(lev.K,2)}</b> (${lev.up?'resistenza superiore':'supporto inferiore'}) · P(hit) 95% CI appross. <b>${lev.interval?lev.interval.map(x=>pct(x,1)).join('–'):'—'}</b> · P(return / extension) classificata solo con ESS≥30. Il tag reversal descrive una sequenza storica, non l'hedge realizzato da un dealer.`;
}
function heat(value,sign=false){if(!F(value))return '';const v=clamp(sign?Math.abs(value)/.35:Math.abs(value),0,1),intensity=Math.round(v*100)/100;
 return `background:rgba(${sign?(value>=0?'153,222,255':'245,239,222'):'135,181,255'},${(.05+.52*Math.pow(intensity,.72)).toFixed(3)});`;
}
function cellProb(v,sign=false,nullable=false){if(!F(v))return `<td class="qp-muted">—</td>`;return `<td style="${heat(v,sign)}">${sign?(v>0?'+':'')+pct(v,1):displayProb(v)}</td>`;}
function table(){const m=ST.model;if(!m||m.blocked)return;const val=$('qpSearch').value.trim(),range=$('qpRange').value;
 let filtered=ST.rows.filter(r=>(range==='ALL'||r.distance<=Number(range)*m.sigma)&&(!val||String(r.K).includes(val)));
 const k=ST.sort,dir=ST.sortDesc?-1:1;
 filtered.sort((a,b)=>dir*((a[k]??-999)-(b[k]??-999)));
 const rows=filtered.map(r=>`<tr data-strike="${r.K}" class="${r.K===ST.selected?'qp-selected':''}">
  <td>${fmt(r.K,r.K%1?2:0)}</td><td>${fmt((r.K-m.spot),1)}</td>${cellProb(r.pAbove)}${cellProb(r.pBeyond)}${cellProb(r.qAbove)}${cellProb(r.pTouch)}${cellProb(r.pReversal)}${cellProb(r.pBreakout)}${cellProb(r.pPin)}${cellProb(r.deltaQ,true)}<td>${fmt(r.hitESS,1)}</td></tr>`).join('');
 $('qpTable').querySelector('tbody').innerHTML=rows||'<tr><td colspan="11">Nessuno strike corrispondente ai filtri</td></tr>';
 $('qpTableCount').textContent=`${filtered.length}/${ST.rows.length} strike · clicca riga per selezionare`;
 $('qpTable').querySelectorAll('tbody tr[data-strike]').forEach(el=>el.onclick=()=>{ST.selected=+el.dataset.strike;$('qpStrike').value=String(ST.selected);syncSelection();});
}
function runPair(){const m=ST.model;if(!m||m.blocked)return;
 const target=Number($('qpTarget').value),stop=Number($('qpStop').value);
 if(!F(target)||!F(stop)||Math.abs(target-stop)<.0001){$('qpPairRead').textContent='Imposta due prezzi distinti.';return;}
 const zT=(target-m.spot)/m.sigma,zS=(stop-m.spot)/m.sigma;
 const ans={target:0,stop:0,none:0,tie:0};
 for(let i=0;i<m.n;i++){
  const p=m.p[i],w=m.w[i],t=firstHitMinute(p,zT),s=firstHitMinute(p,zS);
  const ev=t>=0&&(s<0||t<s)?'target':s>=0&&(t<0||s<t)?'stop':t<0&&s<0?'none':'tie';
  ans[ev]+=w;
 }
 $('qpPairMetrics').innerHTML=[makeEvent('TARGET FIRST',ans.target,'condizionato al percorso'),makeEvent('STOP FIRST',ans.stop,'condizionato al percorso','qp-risk'),makeEvent('NESSUNO',ans.none,'entro 16:00 ET'),makeEvent('PARI/INCERTO',ans.tie,'ordine intraminuto ignoto')].join('');
 $('qpPairRead').innerHTML=`First event su ${m.n} percorsi precedenti · P(target) + P(stop) + P(none) + P(tie) = <b>${fmt(ans.target+ans.stop+ans.none+ans.tie,6)}</b>. Nel reticolo OHLC a 1 minuto il pareggio non viene assegnato arbitrariamente.`;
}
function nearestQuote(s,K,right){return (s.quotes||[]).find(q=>Math.abs(q[0]-K)<1e-6)||null}
function runSpread(){const m=ST.model,s=ST.snapshot;if(!m||m.blocked)return;
 const kind=$('qpSpreadType').value,longK=Number($('qpLongK').value),shortK=Number($('qpShortK').value);
 const qL=nearestQuote(s,longK,kind),qS=nearestQuote(s,shortK,kind),off=kind==='CALL'?1:3;
 if(!qL||!qS||qL[0]===qS[0]||!(qL[off+1]>0&&qS[off]>0)||qL[off+1]<qL[off]||qS[off+1]<qS[off]){
  $('qpSpreadMetrics').innerHTML='';$('qpSpreadRead').textContent='Quotazione non valida: seleziona due strike diversi con bid e ask disponibili nella chain alle 09:45.';return;}
 const debit=qL[off+1]-qS[off];
 const payoff=x=>{const leg=K=>kind==='CALL'?Math.max(x-K,0):Math.max(K-x,0);return leg(longK)-leg(shortK)-debit;};
 let expP=0,pWin=0,varP=0;
 for(let i=0;i<m.n;i++){const v=payoff(m.spot+m.sigma*m.p[i].zT);expP+=m.w[i]*v;pWin+=m.w[i]*Number(v>0);varP+=m.w[i]*Math.min(v,0);}
 // Q ATM Gaussian proxy integration, numerical midpoint on +/-8sigma
 let expQ=0,qWin=0;const n=1401,range=8,dz=2*range/n;
 for(let i=0;i<n;i++){const z=-range+(i+.5)*dz,p=normalPDF(z)*dz,v=payoff(m.spot+z*m.sigma);expQ+=p*v;qWin+=p*Number(v>0);}
 const Kmin=Math.min(longK,shortK),Kmax=Math.max(longK,shortK);
 const xlo=Kmin-1.15*m.sigma,xhi=Kmax+1.15*m.sigma,pl=canvas('qpSpreadChart',235);
 if(pl){const {ctx,w,h}=pl;bg(ctx,w,h,'PAYOFF PER SHARE · SPX OPTION × 100 USD');const yy=[];for(let x=xlo;x<=xhi;x+=(xhi-xlo)/80)yy.push(payoff(x));const ymin=Math.min(...yy,0)-2,ymax=Math.max(...yy,0)+2;const a=axes(ctx,w,h,{left:58,right:18,top:25,bottom:35,xMin:xlo,xMax:xhi,yMin:ymin,yMax:ymax,xFmt:x=>fmt(x,0),yFmt:y=>fmt(y,1)});plotLine(ctx,[[xlo,0],[xhi,0]],a.X,a.Y,'rgba(124,170,229,.6)',1,[4,4]);plotLine(ctx,Array.from({length:120},(_,i)=>{const x=xlo+(xhi-xlo)*i/119;return [x,payoff(x)]}),a.X,a.Y,C.cyan,2);}
 $('qpSpreadMetrics').innerHTML=[
  makeEvent('P PROFIT',pWin,'prima di costi e slippage'),makeEvent('Q ATM PROFIT',qWin,'solo proxy'),
  `<div class="qp-event"><small>PREMIO NETTO</small><b>${fmt(debit,2)}</b><em>punti · ×100 USD</em></div>`,
  `<div class="qp-event"><small>EXPECTED P&amp;L · P</small><b>${fmt(expP*100,0)} $</b><em>campione storico · 1 spread</em></div>`,
  `<div class="qp-event"><small>EXPECTED P&amp;L · Q ATM</small><b>${fmt(expQ*100,0)} $</b><em>benchmark non CVI</em></div>`
 ].join('');
 $('qpSpreadRead').innerHTML=`${kind} long <b>${fmt(longK,0)}</b> @ ask ${fmt(qL[off+1],2)}, short <b>${fmt(shortK,0)}</b> @ bid ${fmt(qS[off],2)}. P&amp;L in USD per spread (moltiplicatore 100). <b>Non è un edge OOS validato né un fill garantito.</b>`;
}
function quantileConfluence(){
 const m=ST.model;if(!m||m.blocked)return;
 const levels=[[.025,-1.95996398454],[.05,-1.64485362695],[.10,-1.28155156554],[.25,-.67448975020],[.50,0],[.75,.67448975020],[.90,1.28155156554],[.95,1.64485362695],[.975,1.95996398454]];
 const prices=m.p.map(o=>o.zT);
 const lines=levels.map(([q,z])=>{
  const pk=m.spot+m.sigma*weightedQuantile(prices,m.w,q), qk=m.spot+m.sigma*z;
  const pTouch=singleLevel(m,pk,false).pTouch;
  return `<tr><td>${pct(q,1)}</td><td>${fmt(pk,2)}</td><td>${fmt(qk,2)}</td><td style="${heat((pk-qk)/m.sigma,true)}">${(pk-qk)>0?'+':''}${fmt(pk-qk,2)}</td><td style="${heat(pTouch)}">${displayProb(pTouch)}</td></tr>`;
 });
 $('qpQuantTable').innerHTML=`<table class="qp-table"><thead><tr><th>PERCENTILE</th><th>P LEVEL · SPX</th><th>Q ATM LEVEL</th><th>Δ P−Q · PT</th><th>P TOUCH P-LEVEL</th></tr></thead><tbody>${lines.join('')}</tbody></table>`;
 // Join native CVI/IPPO/Wall Street only when date, cutoff, 0DTE, and 16:00 PM horizon all agree.
 const r=root.Desk?.state?.result,co=r?.cfg||{},asof=String(co.asof||''),expiry=String(co.expiry||'').slice(0,10);
 const time=asof.match(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)(?::(\d\d))?/);
 const nativeOK=!!r?.ws?.model&&!root.Desk?.state?.stale&&time?.[1]===ST.snapshot.date&&time?.[2]==='09:45'&&(!time[3]||+time[3]===0)&&expiry===ST.snapshot.date&&String(co.target||'').startsWith(ST.snapshot.date+'T16:00');
 const meta=$('qpNativeJoin');
 if(!nativeOK){meta.textContent='IPPO / WALL STREET: confronto Q↔P sospeso. La chain deve essere 0DTE, della stessa data, con cutoff 09:45:00 ET e fixing alle 16:00 ET.';return;}
 const safe=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;', '\"':'&quot;',"'":'&#39;'}[c]));
 const native=[...(r.ippo?.levels||[]),...(r.ws?.levels||[])].map(x=>({name:x.name||x.z||x.family||'Livello',family:x.family||'CVI',K:Number(x.price)})).filter(x=>F(x.K));
 const joined=native.map(x=>{const e=singleLevel(m,x.K,false),q=r.ws.model.survival(x.K);
 return `<tr><td>${safe(x.family)}</td><td>${safe(x.name)}</td><td>${fmt(x.K,2)}</td><td>${displayProb(e.pTouch)}</td><td>${displayProb(e.pAbove)}</td><td>${pct(q,1)}</td><td>${pct(e.pAbove-q,1)}</td></tr>`;});
 meta.innerHTML=`<b>IPPO / WALL STREET · Q CVI + P STORICA SINCRONIZZATE</b><div class="qp-tablewrap"><table class="qp-table"><thead><tr><th>FAMIGLIA</th><th>LIVELLO</th><th>SPX</th><th>P TOUCH</th><th>P CLOSE &gt;</th><th>Q CVI CLOSE &gt;</th><th>Δ P−Q</th></tr></thead><tbody>${joined.join('')}</tbody></table></div>`;
}
const testedEvents=['close_up','close_up_0p5','close_down_0p5','touch_up_0p5','touch_down_0p5','pin_0p25'];
const testedModels=['P_conditional','P_pool','Q_ATM_Gaussian_proxy'];
let walkCache=null;
function backtestBefore(asOf){
 if(walkCache?.source!==ST.data.snapshots){
  walkCache={source:ST.data.snapshots,sessions:ST.data.snapshots.filter(s=>s.hasOutcome).slice().sort((a,b)=>a.date.localeCompare(b.date)),
   past:[],prefix:[],sum:testedEvents.map(()=>testedModels.map(()=>({loss:0,log:0,bias:0,rate:0}))),ess:0};
 }
 const c=walkCache;
 let end=0;while(end<c.sessions.length&&c.sessions[end].date<asOf)end++;
 const min=ST.data.min_training_sessions;
 if(end<=min)return null;
 for(let j=c.past.length;j<end;j++){
  const s=c.sessions[j],p=decodePath(s),barrier=.005*s.spot_quote/s.q_sigma_pts;
  const mark=path=>[path.zT>0,path.zT>barrier,path.zT< -barrier,path.max>=barrier,path.min<=-barrier,Math.abs(path.zT)<=barrier/2];
  if(j>=min){
   // Compute the same distribution and evaluate the same quantised paths as the active 09:45 view.
   const m=computeModel(s,'conditional'),outcome=mark(p),cond=testedEvents.map(()=>0),pool=testedEvents.map(()=>0);
   for(let i=0;i<m.n;i++){
    const flags=mark(m.p[i]);for(let k=0;k<flags.length;k++)if(flags[k]){cond[k]+=m.w[i];pool[k]+=1/m.n;}
   }
   const tail=1-normalCDF(barrier),q=[.5,tail,tail,2*tail,2*tail,normalCDF(barrier/2)-normalCDF(-barrier/2)];
   const n=j-min+1,summary={};c.ess+=m.ess;
   for(let k=0;k<testedEvents.length;k++){
    const y=Number(outcome[k]),entry={n_test:n,first_test:c.sessions[min].date,last_test:s.date,mean_ESS:c.ess/n};
    [cond[k],pool[k],q[k]].forEach((x,i)=>{
     const prob=Math.max(1e-12,Math.min(1-1e-12,x)),score=c.sum[k][i];
     score.loss+=(x-y)**2;score.log-=y?Math.log(prob):Math.log1p(-prob);score.bias+=x-y;score.rate+=y;
     entry[testedModels[i]]={brier:score.loss/n,log_loss:score.log/n,bias:score.bias/n,base_rate:score.rate/n};
    });summary[testedEvents[k]]=entry;
   }
   c.prefix[j]=summary;
  }
  c.past.push(s.date);
 }
 return c.prefix[end-1]||null;
}
function scorecard(){if(!ST.data||!ST.snapshot)return;
 const observed=backtestBefore(ST.snapshot.date);
 if(!observed){$('qpWalkTable').textContent='Prime verifiche dopo il campione iniziale di '+ST.data.min_training_sessions+' sedute.';$('qpAuditSummary').textContent='Nessun esito fuori campione disponibile all’apertura di questa seduta.';return;}
 const obj=observed,keys=[['close_up','Close UP'],['close_up_0p5','Close +0,50%'],['close_down_0p5','Close −0,50%'],['touch_up_0p5','Touch +0,50%'],['touch_down_0p5','Touch −0,50%'],['pin_0p25','Pin ±0,25%']];
 let wins=0;
 const rows=keys.map(([key,label])=>{
  const s=obj[key],p=s.P_conditional.brier,q=s.Q_ATM_Gaussian_proxy.brier,pool=s.P_pool.brier;
  if(p<q)wins++;
  const scored=[['P cond.',p],['P pool',pool],['Q ATM',q]].filter(x=>F(x[1]));
  const lowest=Math.min(...scored.map(x=>x[1])),best=scored.filter(x=>x[1]===lowest).map(x=>x[0]).join(' / ')||'—';
  return `<tr><td>${label}</td><td>${s.n_test}</td><td>${fmt(p,4)}</td><td>${fmt(pool,4)}</td><td>${fmt(q,4)}</td><td>${best}</td></tr>`;
 });
 $('qpWalkTable').innerHTML=`<table><thead><tr><th>Evento</th><th>N</th><th>P cond.</th><th>P pool</th><th>Q ATM</th><th>Min Brier</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
 $('qpAuditSummary').innerHTML=`<b style="color:#88b3eb">WALK-FORWARD OOS</b><div>Finestra test: <b>${obj.close_up.first_test} – ${obj.close_up.last_test}</b></div><div>Previsioni: <b>${obj.close_up.n_test}</b> (train espandibile ≥${ST.data.min_training_sessions})</div><div>Eventi dove P cond. migliora Q ATM: <b>${wins}/6</b></div><div>Ottimizzazione iperparametri sul test: <b>nessuna</b></div><div>Feature disponibili: <b>IV ATM, skew 25δ / 10δ</b></div><div>Paths: <b>OHLC SPX 1 minuto</b></div><div>Dealer P condizionale: <b>NON CALIBRATA</b></div><div>Decisione: <b style="color:#e9e2cd">RESEARCH / NO CERTIFIED EDGE</b></div>`;
}
function exportText(name,text,mime){const blob=new Blob([text],{type:mime||'text/plain'}),u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
function exportCSV(){const keys=['K','distance','pAbove','pBeyond','qAbove','pTouch','pReversal','pBreakout','pNeutral','pPin','deltaQ','hitESS','hitCount','hitMass'];const lines=[keys.join(',')];for(const r of ST.rows)lines.push(keys.map(k=>F(r[k])?String(r[k]):'').join(','));exportText('Quantistes_Physical_'+ST.snapshot.date+'_all_strikes.csv',lines.join('\n'),'text/csv;charset=utf-8')}
function exportAudit(){const m=ST.model;const payload={schema:'quantistes.physical.2026.0945.analysis.v1',cutoff:'09:45 America/New_York',date:ST.snapshot.date,spot:ST.snapshot.spot_quote,ivATM:ST.snapshot.iv_atm,qSigmaPts:ST.snapshot.q_sigma_pts,skew25:ST.snapshot.rr25,model:m.mode,trainingSessionCount:m.n,ESS:m.ess,minTraining:ST.data.min_training_sessions,strikes:ST.rows.length,selectedK:ST.selected,pinWidth:+$('qpPinWidth').value,events:ST.rows,walkforward:backtestBefore(ST.snapshot.date),scope:'historical 0DTE at 09:45; no contemporaneous dealer state; Q ATM is not full CVI'};exportText('Quantistes_Physical_'+ST.snapshot.date+'_audit.json',JSON.stringify(payload,null,2),'application/json')}
function syncSelection(){if(!ST.model||ST.model.blocked)return;let closest=ST.selected;if(!F(closest)){const s=ST.snapshot.strikes;closest=s.reduce((a,k)=>Math.abs(k-ST.model.spot)<Math.abs(a-ST.model.spot)?k:a,s[0]);ST.selected=closest;}
 $('qpStrike').value=String(closest);
 renderKPIs();eventCards();touchCurve();buildFan();densityCurve();touchTimeSurface();table();quantileConfluence();
 $('qpTarget').value=String(closest);
 // stop default is opposite side of spot, so both barriers nonidentical
 const gap=Math.max(20,Math.round(ST.model.sigma*.6/5)*5);
 $('qpStop').value=String(Math.round((ST.model.spot+(closest>=ST.model.spot?-gap:gap))/5)*5);
 runPair();
}
function runMain(){if(!ST.data)return;const date=$('qpDate').value,s=ST.data.snapshots.find(x=>x.date===date);if(!s)return;
 ST.snapshot=s;ST.model=computeModel(s,$('qpModel').value);ST.fan=null;ST.rows=[];
 if(!ST.model.blocked){ST.rows=buildRows(ST.model,s);ST.selected=F(+$('qpStrike').value)?+$('qpStrike').value:s.strikes.at(Math.floor(s.strikes.length/2));
  if(!s.strikes.some(k=>Math.abs(k-ST.selected)<1e-4))ST.selected=s.strikes.reduce((a,k)=>Math.abs(k-ST.model.spot)<Math.abs(a-ST.model.spot)?k:a,s.strikes[0]);
  const near=s.strikes.reduce((a,k)=>Math.abs(k-s.spot_quote)<Math.abs(a-s.spot_quote)?k:a,s.strikes[0]);
  const gap=Math.max(10,Math.round(s.q_sigma_pts*.35/5)*5);
  $('qpLongK').value=String(near);$('qpShortK').value=String(s.strikes.reduce((a,k)=>Math.abs(k-(near+gap))<Math.abs(a-(near+gap))?k:a,s.strikes[0]));
  syncSelection();runSpread();
 }else{
  ST.hover={};ST.touchMap=null;
  for(const c of $('flow-panel-physical').querySelectorAll('canvas')){
   if(c.id.endsWith('Hover')){c.onmousemove=null;c.onmouseleave=null;}
   const ctx=c.getContext?.('2d');if(ctx){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.restore();}
  }
  for(const id of ['qpKpis','qpEvents','qpPairMetrics','qpSpreadMetrics','qpQuantTable','qpNativeJoin'])$(id).innerHTML='';
  for(const id of ['qpFanRead','qpDensityRead','qpTouchRead','qpCurveRead','qpPairRead','qpSpreadRead','qpEventRead'])$(id).textContent='Storico insufficiente per la seduta selezionata.';
  $('qpAsOf').textContent=s.date+' · 09:45 ET';
  $('qpTable').querySelector('tbody').innerHTML='';$('qpTableCount').textContent='Campione storico insufficiente';
 }
 quality();scorecard();quantileConfluence();
}
function init(){if(!$('flow-panel-physical')||ST.ready)return;ST.ready=true;
 const nav=document.querySelector('#view-flows .flow-subnav');const phys=document.querySelector('[data-flow-panel="physical"]');
 if(phys){phys.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();document.querySelectorAll('#view-flows .flow-inner').forEach(el=>el.classList.toggle('active',el.id==='flow-panel-physical'));nav?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===phys));ST.horizon=Number($('qpHorizon').value);runMain();},true);}
 nav?.querySelectorAll('button:not([data-flow-panel="physical"])').forEach(b=>b.addEventListener('click',()=>{$('flow-panel-physical')?.classList.remove('active')},true));
 const dataEl=$('qt-physical-data');if(!dataEl)return;
 unzip64(dataEl.textContent.trim()).then(src=>{ST.data=JSON.parse(src);const dates=ST.data.snapshots.map(s=>s.date);ST.dates=dates;
 $('qpDate').innerHTML=ST.data.snapshots.map(s=>`<option value="${s.date}">${s.date} · ${s.hasOutcome?'storico + esito':'solo snapshot'}</option>`).join('');
 $('qpDate').value=dates.at(-1);
 $('qpStrike').value=String(ST.data.snapshots.at(-1).strikes.reduce((a,b)=>Math.abs(a-ST.data.snapshots.at(-1).spot_quote)<Math.abs(b-ST.data.snapshots.at(-1).spot_quote)?a:b));
 $('qpDate').onchange=()=>{const s=ST.data.snapshots.find(x=>x.date===$('qpDate').value);if(s)$('qpStrike').value=String(s.strikes.reduce((a,b)=>Math.abs(a-s.spot_quote)<Math.abs(b-s.spot_quote)?a:b));runMain()};
 for(const id of ['qpModel','qpPinWidth','qpReactionBand','qpReactMinutes'])$(id).addEventListener('change',runMain);
 $('qpApply').onclick=runMain;
 $('qpStrike').onchange=()=>{ST.selected=Number($('qpStrike').value);syncSelection()};
 $('qpSearch').oninput=table;$('qpRange').onchange=table;
 $('qpTable').querySelectorAll('thead th[data-sort]').forEach(th=>th.onclick=()=>{const key=th.dataset.sort;ST.sortDesc=ST.sort===key?!ST.sortDesc:false;ST.sort=key;table()});
 $('qpHorizon').oninput=e=>{ST.horizon=+e.target.value;renderKPIs();touchCurve()};
 $('qpPairRun').onclick=runPair;$('qpSpreadRun').onclick=runSpread;
 $('qpCsv').onclick=exportCSV;$('qpJson').onclick=exportAudit;
 runMain();
 }).catch(e=>{$('qpQualityStrip').textContent='ERRORE DATI STORICI: '+e.message;console.error('Physical Engine',e)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
/* Quantistes Daily Physical Adapter · calibrated 09:45 feature-space only */
function qdSetOptions(){
 const sel=$('qpDate');
 if(!sel||!ST.data)return;
 const current=sel.value;
 sel.innerHTML=ST.data.snapshots.map(s=>`<option value="${s.date}">${s.date} · ${s.hasOutcome?'esito registrato':'previsione disponibile'}</option>`).join('');
 if(ST.data.snapshots.some(s=>s.date===current))sel.value=current;
 else sel.value=ST.data.snapshots.at(-1)?.date||'';
}
function qdPick(date){
 if(!ST.data)return false;
 const s=ST.data.snapshots.find(s=>s.date===date);
 if(!s)return false;
 $('qpDate').value=date;
 $('qpStrike').value=String(s.strikes.reduce((a,k)=>Math.abs(a-s.spot_quote)<Math.abs(k-s.spot_quote)?a:k,s.strikes[0]));
 runMain();
 root.dispatchEvent(new CustomEvent('qt:physical-updated',{detail:{date}}));
 return true;
}
function qdCleanSnapshot(s){
 const o={...s};delete o._cache;return o;
}
function checkedSnapshot(input){
 if(!input||typeof input!=='object'||typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date))return null;
 const day=Date.parse(input.date+'T12:00:00Z');
 if(!F(day)||new Date(day).toISOString().slice(0,10)!==input.date)return null;
 const keys=['spot_quote','q_sigma_pts','rr25','rr10'];
 const o={...input};
 for(const k of keys){
  if(typeof o[k]!=='number'&&(typeof o[k]!=='string'||!o[k].trim()))return null;
  o[k]=Number(o[k]);if(!F(o[k]))return null;
 }
 if(o.spot_quote<=0||o.q_sigma_pts<=0||!Array.isArray(o.strikes)||o.strikes.length<20||o.strikes.length>15000||
    !o.strikes.every(k=>F(k)&&k>0)||new Set(o.strikes).size!==o.strikes.length)return null;
 o.q_sigma_pct=o.q_sigma_pts/o.spot_quote;if(!F(o.q_sigma_pct)||o.q_sigma_pct<=0)return null;
 return qdCleanSnapshot(o);
}
function qdLoadSnapshots(list){
 if(!ST.data)throw Error('Archivio storico non caricato');
 if(!Array.isArray(list)||list.length>2000)throw Error('Dimensione archivio non valida');
 const earliestEnd=ST.data.max_labels_date||'2026-11-16',scale=ST.data.quantization_per_sigma||400;
 const base=new Map(ST.data.snapshots.map(s=>[s.date,s]));let count=0;
 for(const v of list){
  const rec=checkedSnapshot(v);
  if(!rec||!rec.__daily||rec.date<=earliestEnd||base.get(rec.date)?.hasOutcome)continue;
  if(rec.hasOutcome){
   if(!['l','h','c'].every(k=>Array.isArray(rec[k])&&rec[k].length===375&&rec[k].every(Number.isSafeInteger))||
      !F(rec.outcome)||Math.abs(rec.outcome-rec.c[374]/scale)>.500001/scale||
      rec.l.some((lo,i)=>lo>rec.c[i]||rec.c[i]>rec.h[i]||rec.spot_quote+lo*rec.q_sigma_pts/scale<=0))continue;
  }
  base.set(rec.date,rec);count++;
 }
 if(!count)return 0;
 ST.data.snapshots=[...base.values()].sort((a,b)=>a.date.localeCompare(b.date));qdSetOptions();
 const latest=ST.data.snapshots.at(-1);if(latest)qdPick(latest.date);return count;
}
root.QuantistesDailyBridge=Object.freeze({
 getEnsemble:()=>ST.model&&!ST.model.blocked?{
  date:ST.snapshot.date,mode:ST.model.mode,spot:ST.model.spot,sigma:ST.model.sigma,
  trainedThrough:ST.model.prior.at(-1)?.date,ESS:ST.model.ess,
  records:ST.model.p.map((p,i)=>({d:ST.model.prior[i]?.date||'Historical',l:p.l,h:p.h,c:p.c})),
  weights:ST.model.w.slice()
 }:null,

 ready:()=>!!ST.data,
 dates:()=>ST.data?.snapshots.map(s=>s.date)||[],
 select:qdPick,
 getSnapshot:(date)=>{
  const s=ST.data?.snapshots.find(s=>s.date===date);return s?{date:s.date,spot:s.spot_quote,sigma:s.q_sigma_pts,rr25:s.rr25,rr10:s.rr10,strikes:s.strikes.length,hasOutcome:s.hasOutcome,source:s.source||'SPXW historical 09:45'}:null;
 },
 predict:(date,K)=>{
  if(!ST.data||!Number.isFinite(K))return null;
  if(ST.snapshot?.date!==date)qdPick(date);
  if(ST.snapshot?.date!==date||!ST.model||ST.model.blocked)return null;
  return singleLevel(ST.model,K,true);
 },
 priceCDF:(K)=>{
  const m=ST.model;return m&&!m.blocked&&Number.isFinite(K)?wsum(m,p=>p.zT<=(K-m.spot)/m.sigma):null;
 },
 priceQuantile:(p)=>{
  const m=ST.model;if(!m||m.blocked||!Number.isFinite(p)||p<0||p>1)return null;
  return m.spot+m.sigma*weightedQuantile(m.p.map(x=>x.zT),m.w,p);
 },
 model:()=>ST.model&&!ST.model.blocked?{date:ST.snapshot.date,mode:ST.model.mode,spot:ST.model.spot,sigma:ST.model.sigma,n:ST.model.n,ess:ST.model.ess,cutoff:'09:45 ET',mode:ST.model.mode,trainedThrough:ST.model.prior.at(-1)?.date}:null,
 getRows:()=>ST.rows.slice(),
 ingestSnapshot:(input)=>{
  if(!ST.data)throw Error('Motore P non pronto');
  input=checkedSnapshot(input);if(!input)throw Error('Feature della chain 09:45 non valide');
  if(input.date<=(ST.data.max_labels_date||'2026-11-16'))throw Error('Non sovrascrivere lo storico di addestramento originale');
  const prev=ST.data.snapshots.find(s=>s.date===input.date);
  if(prev?.hasOutcome)throw Error('Esito storico già presente: non sostituibile da un upload');
  const item={...input,__daily:true,hasOutcome:false};
  ST.data.snapshots=ST.data.snapshots.filter(x=>x.date!==input.date).concat([item]).sort((a,b)=>a.date.localeCompare(b.date));
  qdSetOptions();qdPick(input.date);
  return {date:input.date,n:ST.model?.n||0,ess:ST.model?.ess||0,strikes:input.strikes.length};
 },
 ingestOutcome:(date,bars)=>{
  if(!ST.data||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Data non valida');
  const s=ST.data.snapshots.find(x=>x.date===date);
  if(!s||s.hasOutcome||s.date<=(ST.data.max_labels_date||'2026-11-16'))throw Error('Snapshot 09:45 assente, esito già registrato o giorno storico non modificabile');
  if(!Array.isArray(bars)||bars.length!==375||bars.some((b,i)=>!b||b.minute!==i||
       ![b.low,b.high,b.close].every(Number.isFinite)||b.low<=0||b.high<b.low||b.close>b.high||b.close<b.low))
   throw Error('Richieste 375 barre OHLC valide, consecutive 09:45–15:59 ET');
  const scale=ST.data.quantization_per_sigma||400;
  const z=v=>Math.round((v-s.spot_quote)/s.q_sigma_pts*scale);
  s.__daily=true;s.l=bars.map(x=>z(x.low));s.h=bars.map(x=>z(x.high));s.c=bars.map(x=>z(x.close));
  s.outcome=(bars.at(-1).close-s.spot_quote)/s.q_sigma_pts;
  s.hasOutcome=true;walkCache=null;
  delete s._cache;
  qdSetOptions();qdPick(date);
  return {date,returnPct:100*(bars.at(-1).close/s.spot_quote-1)};
 },
 exportArchive:()=>ST.data?.snapshots.filter(s=>s.__daily).map(qdCleanSnapshot)||[],
 importArchive:qdLoadSnapshots
});

root.QuantistesPhysical=Object.freeze({refreshRegistry:()=>{if(ST.ready&&ST.snapshot)runMain();},playbookHistory:()=>ST.data?{...ST.data,get walkforward(){return ST.snapshot?backtestBefore(ST.snapshot.date):null;}}:null,version:'1.0.0',getRows:()=>ST.rows.map(x=>({...x})),getSnapshot:()=>ST.snapshot?{...ST.snapshot,quotes:undefined,l:undefined,c:undefined,h:undefined}:null,stats:()=>ST.model&&!ST.model.blocked?{date:ST.snapshot.date,train:ST.model.n,ess:ST.model.ess,strikes:ST.rows.length,walkForward:backtestBefore(ST.snapshot.date)?.close_up.n_test||0,verifiedOOSAdvantage:false,mode:ST.model.mode,validationThrough:backtestBefore(ST.snapshot.date)?.close_up.last_test??null,brierUpPool:backtestBefore(ST.snapshot.date)?.close_up.P_pool.brier??null,brierUpKernel:backtestBefore(ST.snapshot.date)?.close_up.P_conditional.brier??null,cutoff:'09:45 ET'}:null,
 validate:()=>{
 if(!ST.model||ST.model.blocked)return [{name:'AVAILABLE_TRAINING',pass:false}];
 const m=ST.model,s=ST.snapshot;
 return [{name:'NO_LOOKAHEAD',pass:m.prior.every(x=>x.date<s.date)},{name:'TRAINING_MINIMUM',pass:m.n>=ST.data.min_training_sessions},
 {name:'WEIGHTS_SUM_ONE',pass:Math.abs(m.w.reduce((a,b)=>a+b,0)-1)<1e-9},{name:'ESS_BOUNDS',pass:m.ess>1&&m.ess<=m.n+1e-7},
 {name:'ALL_STRIKES',pass:ST.rows.length===s.strikes.length},
 {name:'TERMINAL_CDF_MONOTONE',pass:ST.rows.every((r,i)=>i===0||ST.rows[i-1].pAbove+1e-8>=r.pAbove)},
 {name:'TOUCH_MONOTONE_OUTWARD',pass:ST.rows.every((r,i)=>i===0||((r.K>=m.spot&&ST.rows[i-1].K>=m.spot)?ST.rows[i-1].pTouch+1e-8>=r.pTouch:(r.K<m.spot&&ST.rows[i-1].K<m.spot)?ST.rows[i-1].pTouch<=r.pTouch+1e-8:true))},
 {name:'PIN_IN_RANGE',pass:ST.rows.every(r=>r.pPin>=-1e-8&&r.pPin<=1+1e-8)},
 {name:'TOUCH_GE_CLOSE',pass:ST.rows.every(r=>r.pTouch+1e-8>=r.pBeyond)},
 {name:'REVERSAL_PARTITION',pass:ST.rows.every(r=>r.pReversal===null||Math.abs(r.pReversal+r.pBreakout+r.pNeutral-1)<1e-8)},
 {name:'NO_PHYSICAL_DEALER_INFERENCE',pass:true}];
 }});
})(window);
