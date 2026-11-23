/* QUANTISTES · DYNAMIC P VISUALIZATION */
(function(root){
'use strict';
const C=root.QuantistesDynamicCore;
const get=id=>document.getElementById(id),F=Number.isFinite,fmt=C.fmt,pct=C.pct,clamp=C.clamp;
const PAL={bg:'#091c2e',grid:'#29445e',text:'#aec3d7',gold:'#87b5ff',cyan:'#99deff',blue:'#99deff',green:'#99deff',violet:'#b7ceff',red:'#f5efde'};
function canvas(id,height){const el=get(id);if(!el)return null;const rect=el.parentNode.getBoundingClientRect(),w=Math.max(270,rect.width-2),dpr=Math.min(2,root.devicePixelRatio||1);
 const pw=Math.round(w*dpr),ph=Math.round(height*dpr);
 if(el.width!==pw||el.height!==ph){el.width=pw;el.height=ph}el.style.width=w+'px';el.style.height=height+'px';
 const ctx=el.getContext('2d');if(!ctx)return null;ctx.setTransform(dpr,0,0,dpr,0,0);
 return {el,ctx,w,h:height,dpr};
}
function axes(ctx,w,h,{L=62,R=w-22,T=30,B=h-40,xMin=0,xMax=1,yMin=0,yMax=1,xFmt=x=>fmt(x,0),yFmt=y=>fmt(y,0),xTicks=5,yTicks=5}={}){
 const X=x=>L+(x-xMin)/(xMax-xMin||1)*(R-L),Y=y=>B-(y-yMin)/(yMax-yMin||1)*(B-T);
 ctx.strokeStyle=PAL.grid;ctx.lineWidth=.6;ctx.fillStyle=PAL.text;ctx.font='10px Consolas';
 for(let i=0;i<=xTicks;i++){const v=xMin+(xMax-xMin)*i/xTicks,px=X(v);ctx.beginPath();ctx.moveTo(px,T);ctx.lineTo(px,B);ctx.stroke();ctx.textAlign='center';ctx.fillText(xFmt(v),px,B+17);}
 for(let i=0;i<=yTicks;i++){const v=yMin+(yMax-yMin)*i/yTicks,py=Y(v);ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(R,py);ctx.stroke();ctx.textAlign='right';ctx.fillText(yFmt(v),L-8,py+3);}
 return {L,R,T,B,X,Y,xMin,xMax,yMin,yMax};
}
function background(ctx,w,h,title){ctx.fillStyle=PAL.bg;ctx.fillRect(0,0,w,h);ctx.textAlign='left';ctx.font='11px Consolas';ctx.fillStyle='#99daf0';if(title)ctx.fillText(title,13,17);}
function line(ctx,points,X,Y,color,width=2,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.stroke();ctx.setLineDash([])}
function band(ctx,rows,lo,hi,ax,color){ctx.beginPath();rows.forEach((row,i)=>i?ctx.lineTo(ax.X(row.t),ax.Y(row.q[lo])):ctx.moveTo(ax.X(row.t),ax.Y(row.q[lo])));for(let i=rows.length-1;i>=0;i--)ctx.lineTo(ax.X(rows[i].t),ax.Y(rows[i].q[hi]));ctx.closePath();ctx.fillStyle=color;ctx.fill()}
function bindCrosshair(id,ax,onmove){const ov=get(id+'Overlay');if(!ov||!ax)return;const width=Math.max(260,ov.parentNode.getBoundingClientRect().width-2),height=ov.id.includes('Fan')?420:325;
 const o=canvas(ov.id,height);if(!o)return;
 let pending=false,point=null;const draw=()=>{pending=false;if(!point)return;const {x,y}=point,ctx=o.ctx;ctx.clearRect(0,0,o.w,o.h);if(x<ax.L||x>ax.R||y<ax.T||y>ax.B)return;
 ctx.strokeStyle='rgba(227,222,204,.83)';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,ax.T);ctx.lineTo(x,ax.B);ctx.moveTo(ax.L,y);ctx.lineTo(ax.R,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#e5dfcc';ctx.beginPath();ctx.arc(x,y,3.6,0,2*Math.PI);ctx.fill();
 const xv=ax.xMin+(x-ax.L)/(ax.R-ax.L)*(ax.xMax-ax.xMin),yv=ax.yMin+(ax.B-y)/(ax.B-ax.T)*(ax.yMax-ax.yMin);
 ctx.fillStyle='#0e2438';ctx.fillRect(0,y-12,Math.max(16,ax.L-2),22);ctx.textAlign='right';ctx.fillStyle='#99bff3';ctx.font='11px Consolas';ctx.fillText(fmt(yv,yv>100?2:4),ax.L-5,y+4);
 onmove({x:xv,y:yv,px:x,py:y});};
 ov.onmousemove=e=>{const r=ov.getBoundingClientRect();point={x:e.clientX-r.left,y:e.clientY-r.top};if(!pending){pending=true;root.requestAnimationFrame(draw)}};
 ov.onmouseleave=()=>{point=null;o.ctx.clearRect(0,0,o.w,o.h)};
}
function weightedQuantile(vals,weights,p){const a=vals.map((v,i)=>[v,weights[i]]).sort((x,y)=>x[0]-y[0]);let w=0;for(const [v,q] of a){w+=q;if(w>=p)return v}return a.at(-1)?.[0]??0}
function weightedMoment(vals,w){let mu=0;for(let i=0;i<vals.length;i++)mu+=vals[i]*w[i];let v=0;for(let i=0;i<vals.length;i++)v+=(vals[i]-mu)**2*w[i];return {mean:mu,sd:Math.sqrt(v)}}
function rowSeries(m){const count=Math.min(60,Math.max(10,m.H)),idx=[...new Set(Array.from({length:count+1},(_,k)=>Math.max(0,Math.round((m.H-1)*k/count))))],probs=[.05,.10,.25,.5,.75,.90,.95];
 return idx.map(j=>{const v=m.records.map(p=>m.spot*(1+p.c[j]));return {t:j+1,q:probs.map(p=>weightedQuantile(v,m.weights,p)),mean:weightedMoment(v,m.weights).mean}});
}
function nearestRow(rows,t){let best=rows[0];for(const r of rows)if(Math.abs(r.t-t)<Math.abs(best.t-t))best=r;return best}
function fan(){const s=C.state,m=s.model;if(!m||m.kind==='BLOCKED')return;const pl=canvas('dxFan',420);if(!pl)return;const {ctx,w,h}=pl;background(ctx,w,h,'P paths · quantili 05/10/25/50/75/90/95');
 const rows=rowSeries(m),K=s.selected;let lo=Math.min(...rows.map(x=>x.q[0])),hi=Math.max(...rows.map(x=>x.q[6]));const vol=(hi-lo)||10;
 lo=Math.min(lo,m.spot-.3*vol);hi=Math.max(hi,m.spot+.3*vol);
 const ax=axes(ctx,w,h,{L:70,R:w-20,T:30,B:h-41,xMin:0,xMax:m.H,yMin:lo,yMax:hi,xFmt:v=>String(m.t+Math.round(v)+585>24*60?'T':(Math.floor((m.t+Math.round(v)+585)/60)).toString().padStart(2,'0')+':'+String((m.t+Math.round(v)+585)%60).padStart(2,'0')),yFmt:v=>fmt(v,0)});
 band(ctx,rows,0,6,ax,'rgba(123,194,223,.11)');band(ctx,rows,1,5,ax,'rgba(123,194,223,.15)');band(ctx,rows,2,4,ax,'rgba(123,194,223,.22)');
 // Thin historical examples to show trajectory geometry without confusing them with probabilities.
 for(let i=0;i<Math.min(14,m.n);i++){const rec=m.records[Math.floor(i*(m.n-1)/14)],pts=[];for(let j=0;j<m.H;j+=Math.max(1,Math.floor(m.H/50)))pts.push([j+1,m.spot*(1+rec.c[j])]);pts.push([m.H,m.spot*(1+rec.terminal)]);line(ctx,pts,ax.X,ax.Y,'rgba(73,125,179,.17)',.8)}
 line(ctx,rows.map(r=>[r.t,r.q[3]]),ax.X,ax.Y,PAL.cyan,2.4);
 line(ctx,[[0,m.spot],[m.H,m.spot]],ax.X,ax.Y,'rgba(178,207,248,.5)',1,[3,4]);
 if(F(K)&&K>=lo&&K<=hi){line(ctx,[[0,K],[m.H,K]],ax.X,ax.Y,PAL.violet,1.2,[4,3]);ctx.fillStyle=PAL.violet;ctx.textAlign='right';ctx.fillText('STRIKE '+fmt(K,1),ax.R-5,ax.Y(K)-5)}
 const lev=C.levels().sort((a,b)=>Math.abs(a.price-m.spot)-Math.abs(b.price-m.spot)).slice(0,9);
 lev.forEach((v,i)=>{if(v.price<=lo||v.price>=hi)return;const col=v.family.includes('Wall')?'rgba(183,206,255,.40)':'rgba(224,220,203,.44)';line(ctx,[[0,v.price],[m.H,v.price]],ax.X,ax.Y,col,.8,[1,4]);if(i<5){ctx.fillStyle=col;ctx.font='10px Consolas';ctx.textAlign='left';ctx.fillText(v.family.includes('Wall')?'WS':'IPPO',ax.L+5,ax.Y(v.price)-2)}});
 const q=C.liveQ();if(q){for(const prob of [.05,.5,.95]){const x=q.quantile?.(prob);if(!F(x)||x<lo||x>hi)continue;ctx.fillStyle=PAL.gold;ctx.beginPath();ctx.arc(ax.X(m.H),ax.Y(x),4,0,2*Math.PI);ctx.fill();ctx.textAlign='right';ctx.fillText('Q '+Math.round(prob*100)+'%',ax.R-6,ax.Y(x)-8)}}
 ctx.fillStyle=PAL.cyan;ctx.fillText('P MEDIANA',ax.L+12,ax.T+12);ctx.fillStyle=PAL.gold;ctx.fillText(q?'Q CVI: quantili solo a T':'Q CVI: non allineata',ax.L+140,ax.T+12);
 bindCrosshair('dxFan',ax,({x,y})=>{const j=clamp(Math.round(x)-1,0,m.H-1),r=nearestRow(rows,j+1),n=Math.max(0,Math.round(m.t+j+1+585)),et=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');let above=0;for(let i=0;i<m.n;i++)if(m.spot*(1+m.records[i].c[j])>y)above+=m.weights[i];
 const hit=C.touch(m,s.selected,j+1);const read=get('dxFanRead');read.innerHTML=`<b>${et} ET</b> · Cursore <b>${fmt(y,2)} SPX</b> · P mediana <strong>${fmt(r.q[3],2)}</strong> · P50 ${fmt(r.q[2],2)}—${fmt(r.q[4],2)} · P90 ${fmt(r.q[0],2)}—${fmt(r.q[6],2)} · P(Sₜ&gt;cursor) <strong>${pct(above,1)}</strong> · P(touch ${fmt(s.selected,1)} entro t) ${pct(hit,1)} · N<sub>eff</sub> ${fmt(m.ESS,0)}`;});
}
function cdf(){const s=C.state,m=s.model;if(!m||m.kind==='BLOCKED')return;const pl=canvas('dxCDF',325);if(!pl)return;const {ctx,w,h}=pl;background(ctx,w,h,'Terminal probability · P and risk neutral Q');
 const end=m.records.map(r=>m.spot*(1+r.terminal)),mo=weightedMoment(end,m.weights),low=Math.min(m.spot-3.25*mo.sd,mo.mean-3*mo.sd),high=Math.max(m.spot+3.25*mo.sd,mo.mean+3*mo.sd);const ax=axes(ctx,w,h,{L:60,R:w-20,T:32,B:h-38,xMin:low,xMax:high,yMin:0,yMax:1,xFmt:v=>fmt(v,0),yFmt:v=>pct(v,0)});
 const vals=[],q=C.liveQ();for(let i=0;i<=140;i++){const K=low+(high-low)*i/140;vals.push({K,p:C.terminal(m,K),q:q?.survival?.(K)??null})}
 line(ctx,vals.map(v=>[v.K,v.p]),ax.X,ax.Y,PAL.cyan,2.25);if(q)line(ctx,vals.map(v=>[v.K,v.q]),ax.X,ax.Y,PAL.gold,1.9,[5,3]);
 if(F(s.selected)&&s.selected>low&&s.selected<high)line(ctx,[[s.selected,0],[s.selected,1]],ax.X,ax.Y,PAL.violet,.9,[2,4]);
 ctx.fillStyle=PAL.cyan;ctx.fillText('P EMPIRICA',ax.L+8,ax.T+13);if(q){ctx.fillStyle=PAL.gold;ctx.fillText('Q CVI',ax.L+115,ax.T+13)}
 bindCrosshair('dxCDF',ax,({x,y})=>{const p=C.terminal(m,x),qv=q?.survival?.(x)??null;get('dxCDFRead').innerHTML=`Livello SPX <b>${fmt(x,2)}</b> · P(close &gt; K) <strong>${pct(p,2)}</strong> · Q CVI <b>${qv==null?'NON ALLINEATA':pct(qv,2)}</b> · Δ P−Q <b>${qv==null?'—':pct(p-qv,2)}</b> · probabilità calcolata sullo stesso fixing.`});
}
function touchMap(){const s=C.state,m=s.model;if(!m||m.kind==='BLOCKED')return;const pl=canvas('dxTouch',325);if(!pl)return;const {ctx,w,h}=pl;background(ctx,w,h,'First-passage probability · levels × remaining time');
 const values=m.records.map(r=>m.spot*(1+r.terminal)),sd=weightedMoment(values,m.weights).sd||m.spot*.001,low=m.spot-2.7*sd,hi=m.spot+2.7*sd;
 const nr=51,nc=26,L=65,R=w-18,T=34,B=h-39,cw=(R-L)/nc,ch=(B-T)/nr,ks=Array.from({length:nr},(_,i)=>low+(hi-low)*i/(nr-1)),tt=Array.from({length:nc},(_,i)=>Math.max(1,Math.round((i+1)/nc*m.H)));
 const mat=ks.map(K=>tt.map(t=>C.touch(m,K,t)));
 const ax=axes(ctx,w,h,{L,R,T,B,xMin:0,xMax:m.H,yMin:low,yMax:hi,xFmt:x=>fmt(x,0)+'m',yFmt:y=>fmt(y,0),xTicks:4,yTicks:5});
 for(let i=0;i<nr;i++)for(let j=0;j<nc;j++){const v=mat[i][j],col=v>=.5?'153,222,255':'135,181,255';ctx.fillStyle=`rgba(${col},${.06+.83*Math.sqrt(v)})`;ctx.fillRect(L+j*cw,B-(i+1)*ch,cw+.65,ch+.65)}
 if(s.selected>low&&s.selected<hi)line(ctx,[[0,s.selected],[m.H,s.selected]],ax.X,ax.Y,PAL.violet,1,[3,4]);
 bindCrosshair('dxTouch',ax,({x,y})=>{const i=clamp(Math.round((y-low)/(hi-low)*(nr-1)),0,nr-1),j=clamp(Math.ceil(x/m.H*nc)-1,0,nc-1),v=mat[i][j];get('dxTouchRead').innerHTML=`SPX <b>${fmt(ks[i],2)}</b> · Orizzonte <b>${tt[j]}m</b> · P(first touch entro t) <strong>${pct(v,2)}</strong> · Campione ${m.n} · ESS ${fmt(m.ESS,0)}`;});
}
function renderCharts(){if(!get('flow-panel-dynamic')?.classList.contains('active')||!get('view-flows')?.classList.contains('active'))return;fan();cdf();touchMap()}
root.QuantistesDynamicCharts=Object.freeze({renderCharts,weightedQuantile,weightedMoment});
})(window);
