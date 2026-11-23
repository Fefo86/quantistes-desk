(function(root){
'use strict';
const by=id=>document.getElementById(id);
const finite=Number.isFinite;
const C={paper:'#0e1924',grid:'#293b4b',tick:'#afc2cc',silver:'#d5d8e7',gold:'#f0bb75',ice:'#83cde1'};
const f=(n,d=2)=>finite(n)?n.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const number=(n,d=0)=>finite(n)?n.toLocaleString('it-IT',{maximumFractionDigits:d}):'—';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const width=(el,fallback=720)=>Math.max(1,Math.round(el.getBoundingClientRect?.().width||el.clientWidth||fallback));
const line=(x,y,X,Y,color=C.grid,dash='',weight=1)=>'<line x1="'+x+'" y1="'+y+'" x2="'+X+'" y2="'+Y+'" stroke="'+color+'" stroke-width="'+weight+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
const label=(x,y,s,anchor='start',color=C.tick)=>'<text x="'+x+'" y="'+y+'" font-size="11" text-anchor="'+anchor+'" fill="'+color+'">'+esc(s)+'</text>';
const makeScale=(lo,hi,start,end)=>v=>start+(v-lo)/(hi-lo)*(end-start);
function niceTicks(lo,hi,n){
  if(!finite(lo)||!finite(hi)||!(hi>lo))return [];
  const raw=(hi-lo)/Math.max(n,1),base=10**Math.floor(Math.log10(raw)),fac=raw/base,step=(fac<=1?1:fac<=2?2:fac<=2.5?2.5:fac<=5?5:10)*base;
  const a=Math.ceil(lo/step-1e-10),b=Math.floor(hi/step+1e-10),digits=Math.max(0,Math.min(9,Math.ceil(-Math.log10(step))+Number(step/base===2.5)));
  return Array.from({length:Math.max(0,Math.min(50,b-a+1))},(_,i)=>{const v=(a+i)*step;return {v,s:number(v,digits)};});
}
function makePath(data,X,Y,field){
  let pen=false,d='';for(const p of data){const v=p[field];if(!finite(v)){pen=false;continue;}d+=(pen?' L':'M')+X(p.K).toFixed(2)+' '+Y(v).toFixed(2);pen=true;}return d;
}
function nearest(rows,k){
 let a=0,b=rows.length-1;while(b-a>1){const m=(a+b)>>1;if(rows[m].K<k)a=m;else b=m;}
 return Math.abs(rows[a].K-k)<=Math.abs(rows[b].K-k)?a:b;
}
function onWidth(el,fn){
 let previous=0,queued=false;
 const changed=()=>{const w=el.getBoundingClientRect?.().width||el.clientWidth;if(!w||Math.abs(w-previous)<1||queued)return;previous=w;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;fn();});};
 if(typeof root.ResizeObserver==='function')new root.ResizeObserver(changed).observe(el);else root.addEventListener('resize',changed);
}
function priceTicks(lo,hi,X,T,B,W){
 let out='';for(const t of niceTicks(lo,hi,Math.max(2,Math.min(9,(W-80)/78)))){
  const x=X(t.v);out+=line(x,T,x,B,C.grid,'2 5')+label(x,B+19,t.s,'middle');
 }return out;
}
function axis(lo,hi,Y,L,R,count){
 let s='';for(const t of niceTicks(lo,hi,count)){const y=Y(t.v);s+=line(L,y,R,y,t.v===0?'#2d567e':C.grid)+label(L-8,y+4,t.s,'end');}return s;
}
function svg(W,H,title,inside){return '<svg font-family="Consolas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title>'+inside+'</svg>';}
function isCurrent(r){const s=root.Desk?.state;return !!s&&!s.stale&&s.result===r;}
let geometryState=null,geometryInit=false,range='all';
function cleanGeometry(){
 geometryState=null;const box=by('gfPlot');if(!box)return;
 box.innerHTML='';box.onpointermove=null;box.onpointerdown=null;by('gfProbe').disabled=true;by('gfProbe').oninput=null;by('gfRead').textContent='—';
}
function geometry(r,g){
 const m=r.ws.model,rows=g.trace.map(z=>({...z,logDensity:z.K*m.pdf(z.K)}));
 geometryState={r,g,rows,k:g.F};
 if(!geometryInit){geometryInit=true;onWidth(by('gfPlot').parentElement,()=>{if(geometryState&&isCurrent(geometryState.r))drawGeometry();});by('gfRange').onchange=()=>{range=by('gfRange').value;if(geometryState&&isCurrent(geometryState.r))drawGeometry();};}
 drawGeometry();
}
function drawGeometry(){
 const s=geometryState,box=by('gfPlot'),slider=by('gfProbe'),m=s.r.ws.model;
 const a=2*Math.sqrt(m.varianceAt(s.g.F)),loCut=s.g.F*Math.exp(-a),hiCut=s.g.F*Math.exp(a);
 let rows=s.rows;if(range==='central'){const subset=rows.filter(q=>q.K>=loCut&&q.K<=hiCut);if(subset.length>=2)rows=subset;}
 const valid=rows.filter(q=>finite(q.wkk)&&finite(q.logDensity));if(valid.length<2){cleanGeometry();return;}
 const W=width(box.parentElement),small=W<520,H=small?476:568,L=small?55:68,R=Math.max(L+2,W-(small?14:25)),T=37,B=Math.round(H*.44),T2=B+49,B2=H-42;
 const lo=rows[0].K,hi=rows.at(-1).K;if(!(hi>lo)){cleanGeometry();return;}
 const vals=valid.map(z=>z.wkk),mn=Math.min(0,...vals),mx=Math.max(0,...vals),pad=(mx-mn||.01)*.07;
 const low=mn<0?mn-pad:0,high=mx+pad,peak=Math.max(1e-12,...valid.map(z=>z.logDensity))*1.07;
 const X=makeScale(lo,hi,L,R),Y=makeScale(low,high,B,T),Y2=makeScale(0,peak,B2,T2),crossK=clamp(s.k,lo,hi);
 let body='<rect width="'+W+'" height="'+H+'" fill="'+C.paper+'"/>';
 body+=label(L,17,'Curvatura wₖₖ', 'start',C.gold)+label(L,T2-15,'Densità Q del log-rendimento', 'start',C.ice)+label(R,H-5,'Strike SPX', 'end');
 body+=axis(low,high,Y,L,R,4)+axis(0,peak,Y2,L,R,4);
 const ticks=niceTicks(lo,hi,Math.max(2,Math.min(9,(W-80)/78)));for(const t of ticks)body+=line(X(t.v),T,X(t.v),B,C.grid,'2 5');
 body+=priceTicks(lo,hi,X,T2,B2,W);
 if(s.g.F>=lo&&s.g.F<=hi){const x=X(s.g.F);body+=line(x,T,x,B,'#7fade6','5 5')+line(x,T2,x,B2,'#7fade6','5 5')+label(x,T-3,'F','middle',C.silver);}
 const d=makePath(rows,X,Y2,'logDensity');
 body+='<path fill="'+C.ice+'" fill-opacity=".095" d="'+d+' L'+R+' '+B2+' H'+L+' Z"/><path fill="none" stroke="'+C.ice+'" stroke-width="2.1" d="'+d+'"/><path fill="none" stroke="'+C.gold+'" stroke-width="2.2" d="'+makePath(rows,X,Y,'wkk')+'"/>';
 for(const pivot of s.g.pivots.filter(v=>v.K>=lo&&v.K<=hi))body+='<circle cx="'+X(pivot.K)+'" cy="'+Y(0)+'" r="2.6" stroke="'+C.gold+'" fill="'+C.paper+'"><title>Pivot wₖₖ · '+f(pivot.K)+'</title></circle>';
 body+='<g id="g10Cursor"></g>';
 box.setAttribute('viewBox','0 0 '+W+' '+H);box.setAttribute('height',H);box.style.height=H+'px';box.innerHTML=body;
 const update=i=>{if(!isCurrent(s.r))return;const z=rows[clamp(i,0,rows.length-1)];s.k=z.K;slider.value=String(rows.indexOf(z));const x=X(z.K);
   const mark=(v,y,col)=>finite(v)?'<circle cx="'+x+'" cy="'+y(v)+'" r="3.5" stroke="'+col+'" stroke-width="1.6" fill="'+C.paper+'"/>':'';
   const marker=by('g10Cursor');if(marker)marker.innerHTML=line(x,T,x,B,C.silver,'3 4')+line(x,T2,x,B2,C.silver,'3 4')+mark(z.wkk,Y,C.gold)+mark(z.logDensity,Y2,C.ice);
   const t='K '+f(z.K,2)+'  ·  IV '+f(100*Math.sqrt(m.varianceAt(z.K)/s.r.T),2)+'%  ·  wₖₖ '+f(z.wkk,5)+'  ·  K·q(K) '+f(z.logDensity,5);
   by('gfRead').textContent=t;slider.setAttribute('aria-valuetext',t);
 };
 slider.disabled=false;slider.max=String(rows.length-1);slider.oninput=()=>update(+slider.value);
 box.onpointermove=box.onpointerdown=e=>{if(e.isPrimary===false)return;const b=box.getBoundingClientRect();if(b.width)update(nearest(rows,lo+clamp(((e.clientX-b.left)*W/b.width-L)/(R-L),0,1)*(hi-lo)));};
 update(nearest(rows,crossK));
}
let densityState=null,densityInit=false;
function density(r){
 const w=r.ws,law=w.mapping,lo=law.quantile(.002),hi=law.quantile(.998);if(!(finite(lo)&&finite(hi)&&hi>lo))return;
 const rows=Array.from({length:2049},(_,i)=>{const K=lo+(hi-lo)*i/2048;return {K,density:law.pdf(K)};});
 densityState={r,law,lo,hi,rows,price:w.median};if(!densityInit){densityInit=true;onWidth(by('densityChart'),()=>{if(densityState&&isCurrent(densityState.r))drawDensity();});}
 drawDensity();
}
function drawDensity(){
 const h=by('densityChart'),{r,law,lo,hi,rows}=densityState,W=width(h),small=W<500,H=small?350:445,L=small?62:76,R=Math.max(L+2,W-20),T=34,B=H-48,top=Math.max(1e-12,...rows.map(v=>v.density))*1.1;
 const X=makeScale(lo,hi,L,R),Y=makeScale(0,top,B,T);
 let out='<rect width="'+W+'" height="'+H+'" fill="'+C.paper+'"/>'+axis(0,top,Y,L,R,4)+priceTicks(lo,hi,X,T,B,W)+label(L,16,'Densità Q per punto SPX','start',C.gold)+label(R,H-7,'Prezzo SPX','end');
 const d=makePath(rows,X,Y,'density');
 const ribbon=[.01,.05,.25,.50,.75,.95,.99].map(p=>[p,law.quantile(p)]);let prev=-Infinity;
 for(const [p,k] of ribbon){if(k<=lo||k>=hi)continue;const px=X(k);out+=line(px,T+8,px,B,C.grid,'2 5');if(px-prev>42&&px<R-22){out+=label(px,T-4,'P'+String(Math.round(p*100)).padStart(2,'0'),'middle',C.silver);prev=px;}}
 out+='<defs><clipPath id="d10MassClip"><rect id="d10MassRect" x="'+L+'" y="'+T+'" width="0" height="'+(B-T)+'"/></clipPath></defs>';
 out+='<path d="'+d+' L'+R+' '+B+' H'+L+' Z" fill="'+C.ice+'" fill-opacity=".29" clip-path="url(#d10MassClip)"/>';
 out+='<path d="'+d+' L'+R+' '+B+' H'+L+' Z" fill="'+C.gold+'" fill-opacity=".12"/><path d="'+d+'" fill="none" stroke="'+C.gold+'" stroke-width="2.25"/>';
 for(const [v,col,dash] of [[r.cfg.settlement,C.silver,'6 4'],[r.ws.median,C.gold,'2 3']])if(v>=lo&&v<=hi)out+=line(X(v),T,X(v),B,col,dash);
 out+='<g id="d10Cursor"></g>';h.innerHTML=svg(W,H,'Densità della distribuzione terminale Q',out);
 const slider=by('d10Probe'),read=v=>{if(!isCurrent(r))return;const k=clamp(v,lo,hi),x=X(k),den=law.pdf(k);densityState.price=k;slider.value=String(k);
  const mass=by('d10MassRect');if(mass)mass.setAttribute('width',Math.max(0,x-L));const cursor=by('d10Cursor');if(cursor)cursor.innerHTML=line(x,T,x,B,C.ice,'3 4')+'<circle cx="'+x+'" cy="'+Y(den)+'" r="3.5" fill="'+C.paper+'" stroke="'+C.ice+'" stroke-width="1.5"/>';
  const t='SPX '+f(k,2)+'  ·  q(K) '+f(den,6)+' / pt  ·  Q ≤ K '+f(100*law.cdf(k),2)+'%  ·  Q > K '+f(100*law.survival(k),2)+'%';by('d10Read').textContent=t;slider.setAttribute('aria-valuetext',t);
 };
 slider.min=String(lo);slider.max=String(hi);slider.step=String((hi-lo)/1000);slider.disabled=false;slider.oninput=()=>read(+slider.value);
 h.onpointermove=h.onpointerdown=e=>{const b=h.getBoundingClientRect();if(b.width&&e.isPrimary!==false)read(lo+(hi-lo)*(((e.clientX-b.left)*W/b.width-L)/(R-L)));};
 read(densityState.price);
}
function cleanDensity(){densityState=null;const s=by('d10Probe');if(s){s.disabled=true;s.oninput=null;by('d10Read').textContent='—';by('densityChart').onpointermove=null;by('densityChart').onpointerdown=null;}}
root.QuantistesPlots={width,niceTicks,onWidth,geometry,cleanGeometry,density,cleanDensity};
})(globalThis);
