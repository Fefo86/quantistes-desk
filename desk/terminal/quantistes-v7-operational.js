(function(root){
'use strict';
const $=id=>document.getElementById(id), valid=Number.isFinite, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(v,d=2)=>valid(v)?Number(v).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pct=(v,d=1)=>valid(v)?fmt(v*100,d)+'%':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C={bg:'#091c2e',grid:'#29445e',axis:'#aec3d7',gold:'#87b5ff',cyan:'#f5efde',teal:'#99deff',red:'#f5efde',violet:'#b7ceff',deep:'#071525',white:'#c4ecfb'};
const ST={embedded:null,quotes:[],strikes:[],quoteByStrike:new Map(),chainKey:'',result:null,calc:null,match:null,fan:null,selected:7325,sort:'K',desc:false,modelKey:'',runKey:'',tableKey:'',drawKey:'',busy:false,view:{},firstLoaded:false,interval:null};
const opts=()=>({pin:clamp(Number($('opPin')?.value)||10,1,250),breakout:clamp(Number($('opBreak')?.value)||15,1,250),shock:clamp(Number($('opShock')?.value)||0,-4,4),hours:clamp(Number($('opHours')?.value)||0,0,48),vol:clamp(Number($('opVolShock')?.value)||0,-10,10),charm:clamp(Number($('opCharmScale')?.value)||0,0,252),touch:($('opTouchKernel')?.value||'bridge'),range:Number($('opRange')?.value)||5});
function source(){return root.FlowDesk?.scenarioSnapshot?.()||null;}
function paths(){return root.FlowProbability?.get?.()||null;}
function inFlow(){return !!$('view-flows')?.classList?.contains('active');}
function activeOps(){return inFlow() && !!$('flow-panel-ops')?.classList?.contains('active');}
function nearest(arr,v){let lo=0,hi=arr.length-1;if(!arr.length)return null;if(v<=arr[0])return arr[0];if(v>=arr[hi])return arr[hi];while(hi-lo>1){const m=(lo+hi)>>1;if(arr[m]<v)lo=m;else hi=m;}return Math.abs(arr[lo]-v)<=Math.abs(arr[hi]-v)?arr[lo]:arr[hi];}
function lerp(xs,ys,x){if(!xs||!ys||!xs.length||!valid(x)||x<xs[0]||x>xs.at(-1))return null;let lo=0,hi=xs.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(xs[m]<x)lo=m;else hi=m;}const v=(x-xs[lo])/(xs[hi]-xs[lo]||1);return ys[lo]*(1-v)+ys[hi]*v;}
function quantileSorted(a,p){if(!a.length)return NaN;const x=clamp(p,0,1)*(a.length-1),i=Math.floor(x),v=x-i;return a[i]*(1-v)+a[Math.min(i+1,a.length-1)]*v;}
function iconMetric(title,num,sub){return `<div class="op-kpi"><small>${esc(title)}</small><b>${esc(num)}</b><em>${esc(sub)}</em></div>`;}
function cpSide(type){return type==='CALL'||type==='C'?'CALL':'PUT';}
async function embedded(){
 if(ST.embedded)return ST.embedded;
 const el=$('quantistes-flow-embedded');if(!el||typeof DecompressionStream==='undefined')return null;
 const b64=el.textContent.trim(),bytes=new Uint8Array(atob(b64).split('').map(c=>c.charCodeAt(0)));
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 const txt=await new Response(stream).text();ST.embedded=JSON.parse(txt);return ST.embedded;
}
function parseChain(raw){
 const lines=String(raw).trim().split(/\r?\n/);if(!lines.length)return [];
 const heads=lines.shift().split(',').map(x=>x.replace(/"/g,'').trim()),idx=k=>heads.indexOf(k);
 const keys=['strike','right','gamma','delta','charm','vanna','bid','ask','expiration']; if(keys.some(x=>idx(x)<0))throw Error('all7: greche e campi opzioni incompleti');
 const quotes=[];
 for(const line of lines){const row=line.split(',');if(row.length!==heads.length)continue;const num=k=>Number(row[idx(k)]),K=num('strike'),side=cpSide(row[idx('right')].replace(/"/g,'').trim()),expiration=row[idx('expiration')].replace(/"/g,'').trim();
 if(!valid(K)||K<=0)continue;
 quotes.push({K,side,expiration,delta:num('delta'),gamma:num('gamma'),charm:num('charm'),vanna:num('vanna'),bid:num('bid'),ask:num('ask'),mid:.5*(num('bid')+num('ask')),timestamp:row[idx('timestamp')]?.replace(/"/g,'')||''}); }
 quotes.sort((a,b)=>a.K-b.K);
 return quotes;
}
function buildQuoteIndex(quotes){
 const map=new Map();for(const q of quotes){let row=map.get(q.K);if(!row){row={K:q.K};map.set(q.K,row);}row[q.side]=q;}
 const strikes=[...map.keys()].sort((a,b)=>a-b);
 return {map,strikes};
}
function flowFeatures(flow){
 const levels=(flow?.levels||[]).filter(x=>valid(Number(x.price))&&Number(x.price)>0).map(l=>({K:Number(l.price),name:l.name||l.label||l.code||'CVI',family:String(l.family||'CVI')}));
 if(!flow?.spots?.length)return levels;
 const S=flow.spots,G=flow.gamma,H=flow.charm,picks=[];
 const peaks=(v,prefix,n=4)=>{const out=[];for(let j=1;j<v.length-1;j++)if(Math.abs(v[j])>=Math.abs(v[j-1])&&Math.abs(v[j])>=Math.abs(v[j+1]))out.push({K:S[j],name:prefix+' '+(v[j]<0?'−':'+'),family:prefix,mag:Math.abs(v[j])});out.sort((a,b)=>b.mag-a.mag);picks.push(...out.slice(0,n));};
 peaks(G,'GAMMA WALL',4);peaks(H,'CHARM WALL',3);
 for(let j=1;j<G.length;j++)if(G[j]*G[j-1]<0){const K=S[j-1]+(S[j]-S[j-1])*(-G[j-1]/(G[j]-G[j-1]));picks.push({K,name:'GAMMA FLIP',family:'GAMMA FLIP',mag:1});}
 for(let j=1;j<H.length;j++)if(H[j]*H[j-1]<0){const K=S[j-1]+(S[j]-S[j-1])*(-H[j-1]/(H[j]-H[j-1]));picks.push({K,name:'CHARM FLIP',family:'CHARM FLIP',mag:1});}
 return [...levels,...picks].filter(x=>valid(x.K)&&x.K>0);
}
function buildMatchedInventory(embeddedData,flow,quotes,strikes,qmap){
 const result={byStrike:new Map(),matches:0,total:0,absGross:0,absMatched:0,qCount:0,posExpiry:'2025-01-03',delta:0,gamma:0,charm:0,vanna:0};
 if(!embeddedData?.pos?.length)return result;
 const all=embeddedData.pos,base=Number(embeddedData.sourceAnchor||6070),target=Number(flow.reference||embeddedData.targetAnchor||7323.63),scale=target/base;
 const expiry=embeddedData.sourceDates?.positional==='2025-01-02'?'2025-01-03':null;
 const subset=expiry?all.filter(row=>row[3]===expiry):all.filter(row=>row[3]===all[0]?.[3]);
 result.total=subset.length;result.posExpiry=expiry||all[0]?.[3];
 for(const p of subset){const K0=Number(p[2])*scale,q=Number(p[4]),side=cpSide(p[1]);if(!valid(q)||!valid(K0))continue;result.absGross+=Math.abs(q);const near=nearest(strikes,K0);
 if(!valid(near)||Math.abs(near-K0)>Math.max(10,.003*target))continue;
 const quote=qmap.get(near)?.[side]; if(!quote||!valid(quote.gamma)||!valid(quote.delta)||!valid(quote.charm)||!valid(quote.vanna))continue;
 const data=result.byStrike.get(near)||{K:near,q:0,gross:0,delta:0,gamma:0,charm:0,vanna:0,rows:0,bySide:{CALL:0,PUT:0}};
 data.q+=q;data.gross+=Math.abs(q);data.delta+=q*quote.delta;data.gamma+=q*quote.gamma;data.charm+=q*quote.charm;data.vanna+=q*quote.vanna;data.rows++;data.bySide[side]+=q;
 result.byStrike.set(near,data);result.delta+=q*quote.delta;result.gamma+=q*quote.gamma;result.charm+=q*quote.charm;result.vanna+=q*quote.vanna;result.matches++;result.absMatched+=Math.abs(q);result.qCount+=q;
 }
 result.coverage=result.absGross?result.absMatched/result.absGross:0;
 return result;
}
function buildPathIndex(prob){
 const records=prob.records||[],n=records.length,steps=prob.steps||((records[0]?.path?.length||1)-1),info=new Array(n);
 for(let i=0;i<n;i++){
  const path=records[i].path,ma=new Float64Array(steps+1),mi=new Float64Array(steps+1);ma[0]=mi[0]=path[0];
  for(let j=1;j<=steps;j++){ma[j]=Math.max(ma[j-1],path[j]);mi[j]=Math.min(mi[j-1],path[j]);}
  info[i]={ma,mi,logs:Float64Array.from(path,z=>Math.log(z)),terminal:records[i].terminal,path,w:prob.weights[i]||0};
 }
 return {info,steps,n};
}
function firstHitIndex(info,K,up,steps){
 const arr=up?info.ma:info.mi;
 if(up?arr[steps]<K:arr[steps]>K)return -1;
 let lo=0,hi=steps;while(hi-lo>1){const m=(hi+lo)>>1;if(up?arr[m]>=K:arr[m]<=K)hi=m;else lo=m;}
 return hi;
}
function makeGrid(prob,flow,inventory,chain){
 const pathData=buildPathIndex(prob),n=pathData.n,steps=pathData.steps,ref=prob.ref,opts0=opts(),varStep=Math.pow(prob.params?.bridge||1,2)*Math.pow(prob.sd||.01,2)/steps;
 const grid=[];const lo=flow?.spots?.[0],hi=flow?.spots?.at(-1);
 for(const K of chain.strikes){
  const up=K>=ref,hitQ=[],hitR=[];let qHit=0,rHit=0,qRevert=0,rRevert=0,qBreak=0,rBreak=0,qPin=0,rPin=0,qClose=0,rClose=0,tQ=0,tR=0;
  const hCountQ=new Float64Array(steps+1),hCountR=new Float64Array(steps+1);let wHitSq=0;
  for(let i=0;i<n;i++){
   const p=pathData.info[i],term=p.terminal,w=p.w;let pHit=0,hitTimeExpected=0;
   if(opts0.touch==='grid'){
     const first=firstHitIndex(p,K,up,steps);pHit=first<0?0:1;
     if(first>=0){hCountQ[first]+=1/n;hCountR[first]+=w;hitTimeExpected=first;}
   }else{
     const logK=Math.log(K),logPath=p.logs;let survival=1;
     for(let j=1;j<=steps&&survival>1e-12;j++){
       const a=logPath[j-1]-logK,b=logPath[j]-logK;
       if(!valid(a)||!valid(b))continue;
       let crossing=0;
       if(a*b<=0)crossing=1;
       else if(varStep>0 && a*b<34*varStep)crossing=Math.exp(-2*a*b/varStep);
       if(crossing<=1e-13)continue;
       const firstMass=survival*crossing;survival*=1-crossing;
       hCountQ[j]+=firstMass/n;hCountR[j]+=firstMass*w;
       hitTimeExpected+=firstMass*j;
     }
     pHit=Math.max(0,1-survival);
   }
   const beyond=up?term>=K:term<=K;
   const reversed=up?term<K-opts0.breakout:term>K+opts0.breakout;
   const escaped=up?term>K+opts0.breakout:term<K-opts0.breakout;
   const pin=Math.abs(term-K)<=opts0.pin;
   if(beyond){qClose+=1/n;rClose+=w;}if(pin){qPin+=1/n;rPin+=w;}
   if(pHit>0){qHit+=pHit/n;rHit+=pHit*w;wHitSq+=w*w*pHit*pHit;tQ+=hitTimeExpected/n;tR+=hitTimeExpected*w;
    if(reversed){qRevert+=pHit/n;rRevert+=pHit*w;}
    if(escaped){qBreak+=pHit/n;rBreak+=pHit*w;}}
  }
  let sumQ=0,sumR=0;for(let j=0;j<=steps;j++){sumQ+=hCountQ[j];sumR+=hCountR[j];hCountQ[j]=sumQ;hCountR[j]=sumR;}
  const pos=inventory.byStrike.get(K)||null;const g=lerp(flow.spots,flow.gamma,K),c=lerp(flow.spots,flow.charm,K);
  const coverage=(g!=null&&c!=null?'FLOW':'OUTSIDE')+(pos?' + MM':'');
  const qAnalytic=up?(prob.Q?.survival?.(K)):prob.Q?.cdf?.(K);
  // Conditional percentages from very rare touches are not publishable estimates.
  const effHit=rHit*rHit/Math.max(wHitSq,1e-30),canQ=qHit*n>=40,canR=effHit>=40;
  grid.push({K,up,money:100*Math.log(K/ref),ref,gamma:g,charm:c,mm:pos?.q??null,deltaE:pos?.delta??null,gammaE:pos?.gamma??null,charmE:pos?.charm??null,vannaE:pos?.vanna??null,gross:pos?.gross??null,
   hedge:pos?(-2*pos.gamma*ref*.01):null,
   qClose:valid(qAnalytic)?qAnalytic:qClose,rClose,qHit,rHit,qReversal:canQ?qRevert/qHit:null,rReversal:canR?rRevert/rHit:null,qBreak:canQ?qBreak/qHit:null,rBreak:canR?rBreak/rHit:null,
   qPin,rPin,qNeutral:canQ?Math.max(0,1-(qRevert+qBreak)/qHit):null,rNeutral:canR?Math.max(0,1-(rRevert+rBreak)/rHit):null,
   avgTimeQ:canQ?tQ/qHit:null,avgTimeR:canR?tR/rHit:null,firstQ:hCountQ,firstR:hCountR,
   effHit,coverage,selected:false});
 }
 return {grid,ref,step:steps,n,prob,flow,inventory,chain,paths:pathData,parameters:opts0};
}
function labelsFor(K,flow){
 const labels=flowFeatures(flow).filter(l=>Math.abs(l.K-K)<=Math.max(3,.0005*K));
 const native=labels.filter(l=>/Ippo|Wall/i.test(l.family));return {primary:native[0]||labels[0],all:labels};
}
function calcSelected(){return ST.calc?.grid?.find(x=>x.K===ST.selected)||ST.calc?.grid?.reduce((a,b)=>Math.abs(a.K-ST.selected)<Math.abs(b.K-ST.selected)?a:b);}
function setupChart(id,height){
 const canvas=$(id),overlay=$(id.replace('Canvas','Overlay'));
 if(!canvas)return null;const wrap=canvas.parentNode,w=Math.max(235,(wrap?.clientWidth||650)-2),h=height||Number(canvas.getAttribute('height'))||350,dpr=Math.min(2,root.devicePixelRatio||1);
 if(canvas._w!==w||canvas._h!==h){canvas._w=w;canvas._h=h;canvas.style.width=w+'px';canvas.style.height=h+'px';canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  if(overlay){overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);overlay.style.width=w+'px';overlay.style.height=h+'px';}}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.fillStyle=C.deep;ctx.fillRect(0,0,w,h);return {canvas,overlay,ctx,w,h,dpr};
}
function blankOverlay(frame){if(!frame?.overlay)return null;const ctx=frame.overlay.getContext('2d');ctx.setTransform(frame.dpr,0,0,frame.dpr,0,0);ctx.clearRect(0,0,frame.w,frame.h);return ctx;}
function axes(frame,lo,hi,ymin,ymax,{xTicks=6,yTicks=5,unit='',pctY=false,xFmt=null,yFmt=null}={}){
 const {ctx,w,h}=frame,L=w<460?57:74,R=w-24,T=24,B=h-55;xTicks=Math.max(2,Math.min(xTicks,Math.floor((R-L)/78)));
 const X=v=>L+(v-lo)/Math.max(1e-10,hi-lo)*(R-L),Y=v=>B-(v-ymin)/Math.max(1e-10,ymax-ymin)*(B-T);
 ctx.strokeStyle=C.grid;ctx.lineWidth=.75;ctx.font='10px Consolas';
 for(let j=0;j<=yTicks;j++){const y=ymin+(ymax-ymin)*j/yTicks,p=Y(y);ctx.beginPath();ctx.moveTo(L,p);ctx.lineTo(R,p);ctx.stroke();ctx.fillStyle=C.axis;ctx.textAlign='right';ctx.fillText(yFmt?yFmt(y):pctY?pct(y,0):fmt(y,0),L-8,p+4);}
 for(let i=0;i<=xTicks;i++){const v=lo+(hi-lo)*i/xTicks,p=X(v);ctx.beginPath();ctx.moveTo(p,T);ctx.lineTo(p,B);ctx.stroke();ctx.fillStyle=C.axis;ctx.textAlign='center';ctx.fillText(xFmt?xFmt(v):fmt(v,0),p,B+16);}
 ctx.textAlign='right';ctx.fillStyle='#69b1d2';ctx.fillText(unit,R,B+43,Math.max(70,R-L));
 return {X,Y,L,R,T,B};
}
function line(ctx,coords,color,width=2,dash=[]){if(coords.length<2)return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dash);ctx.beginPath();let start=true;for(const item of coords){if(!item||!Array.isArray(item)){start=true;continue;}const [x,y]=item;if(!valid(x)||!valid(y)){start=true;continue;}if(start){ctx.moveTo(x,y);start=false;}else ctx.lineTo(x,y);}ctx.stroke();ctx.restore();}
function colorRamp(v,mode='heat',scale=1){
 if(mode==='lift'){
  const t=clamp(Math.abs(v)/Math.max(scale,1e-10),0,1),h=Math.pow(t,.72),base=[15,37,58],end=v>=0?[153,222,255]:[245,239,222],r=base.map((c,i)=>Math.round(c+(end[i]-c)*h));
  return `rgb(${r.join(',')})`;
 }
 const t=Math.pow(clamp(v/Math.max(scale,1e-10),0,1),.75),stops=[[23,56,84],[26,74,112],[28,96,142],[37,121,167],[64,154,196],[102,185,217],[154,218,237],[236,237,220]],x=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),z=x-i;
 const col=stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*z));return `rgb(${col.join(',')})`;
}
function drawMarker(ctx,geom,x,y,read,color=C.gold){
 ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(204,224,253,.75)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,geom.T);ctx.lineTo(x,geom.B);ctx.moveTo(geom.L,y);ctx.lineTo(geom.R,y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#091c2e';ctx.stroke();ctx.restore();
}
function drawTooltip(ctx,frame,text,x,y){
 const raw=Array.isArray(text)?text:[text],lines0=[];ctx.save();ctx.font='12px Consolas';
 const max=Math.max(110,frame.w-38);for(const msg of raw){let part='';for(const word of String(msg).split(/\s+/)){const test=part?part+' '+word:word;if(part&&ctx.measureText(test).width>max){lines0.push(part);part=word;}else part=test;}lines0.push(part);}
 const widest=Math.min(frame.w-12,Math.max(125,...lines0.map(l=>ctx.measureText(l).width+20))),h=lines0.length*18+12;
 const bx=clamp(x+widest+18<frame.w?x+13:x-widest-12,6,Math.max(6,frame.w-widest-6)),by=clamp(y+14+h<frame.h?y+14:y-h-10,6,Math.max(6,frame.h-h-6));
 ctx.fillStyle='#11283d';ctx.fillRect(bx,by,widest,h);ctx.strokeStyle='#7dabe5';ctx.strokeRect(bx+.5,by+.5,widest-1,h-1);ctx.fillStyle='#f0e6ce';ctx.textAlign='left';lines0.forEach((l,i)=>ctx.fillText(l,bx+9,by+18+i*18,widest-16));ctx.restore();
}
function bindPointer(frame,callback){
 if(!frame?.overlay)return;
 const el=frame.overlay;
 el.onpointermove=e=>{const bounds=el.getBoundingClientRect(),x=(e.clientX-bounds.left)/Math.max(1,bounds.width)*frame.w,y=(e.clientY-bounds.top)/Math.max(1,bounds.height)*frame.h;callback(x,y,false)};
 el.onclick=e=>{const b=el.getBoundingClientRect();callback((e.clientX-b.left)/b.width*frame.w,(e.clientY-b.top)/b.height*frame.h,true)};
 el.onpointerleave=()=>blankOverlay(frame);
}
function selectedChange(K){if(!ST.calc)return;ST.selected=nearest(ST.calc.chain.strikes,K);$('opStrike').value=String(ST.selected);renderSelected();}
function refSlice(){const calc=ST.calc;if(!calc)return null;const percent=Number($('opRange')?.value)||5;return calc.grid.filter(r=>percent===100||Math.abs(r.money)<=percent);}
function metricSpec(name){return {touch:['qHit','rHit','Touch Q / R_flow',true],close:['qClose','rClose','Close beyond Q / R_flow',true],reverse:['qReversal','rReversal','Reversal | touch',true],breakout:['qBreak','rBreak','Breakout | touch',true],pin:['qPin','rPin','Pin window Q / R_flow',true],gamma:['gamma','gamma','Gamma scenario',false],hedge:['hedge','hedge','Hedge Gamma ES eq.',false]}[name]||['qHit','rHit','Touch Q / R_flow',true];}
function renderStrikeChart(){
 const calc=ST.calc,rows=refSlice();if(!calc||!rows?.length)return;const frame=setupChart('opStrikeCanvas',388),{ctx}=frame,mode=$('opLineMetric').value,[qa,ra,title,asProb]=metricSpec(mode);
 const lo=rows[0].K,hi=rows.at(-1).K,v1=rows.map(r=>r[qa]).filter(valid),v2=rows.map(r=>r[ra]).filter(valid),all=[...v1,...v2];
 const vmin=asProb?0:Math.min(0,...all),vmax=asProb?1:Math.max(1e-8,...all);const margin=asProb?0:(vmax-vmin)*.12;
 const geom=axes(frame,lo,hi,vmin-margin,vmax+margin,{unit:'SPX · '+title,pctY:asProb,xFmt:v=>fmt(v,0),yFmt:asProb?(v=>pct(v,0)):(v=>fmt(v,2))});
 const coords=(key)=>rows.map(r=>[geom.X(r.K),valid(r[key])?geom.Y(r[key]):NaN]);
 if(asProb){const gg=ctx.createLinearGradient(0,geom.T,0,geom.B);gg.addColorStop(0,'rgba(107,180,212,.14)');gg.addColorStop(1,'rgba(107,180,212,0)');ctx.beginPath();ctx.moveTo(geom.X(rows[0].K),geom.B);for(const r of rows)ctx.lineTo(geom.X(r.K),geom.Y(r[ra]??0));ctx.lineTo(geom.X(rows.at(-1).K),geom.B);ctx.closePath();ctx.fillStyle=gg;ctx.fill();}
 if(mode==='gamma'||mode==='hedge'){line(ctx,coords(qa),C.cyan,2.4);}
 else{line(ctx,coords(qa),C.gold,2.1,[3,3]);line(ctx,coords(ra),C.cyan,2.7);}
 const native=flowFeatures(calc.flow).filter(l=>l.K>=lo&&l.K<=hi&&/Ippo|Wall/i.test(l.family));
 ctx.save();ctx.font='9px Consolas';for(const l of native){const x=geom.X(l.K);ctx.setLineDash([2,4]);ctx.strokeStyle=/wall/i.test(l.family)?'rgba(131,200,228,.48)':'rgba(224,220,203,.47)';ctx.beginPath();ctx.moveTo(x,geom.T);ctx.lineTo(x,geom.B);ctx.stroke();}ctx.restore();
 const s=calcSelected();if(s&&s.K>=lo&&s.K<=hi){ctx.strokeStyle=C.white;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(geom.X(s.K),geom.T);ctx.lineTo(geom.X(s.K),geom.B);ctx.stroke();}

 bindPointer(frame,(x,y,clicked)=>{if(x<geom.L||x>geom.R||y<geom.T||y>geom.B)return;const K=lo+(x-geom.L)/(geom.R-geom.L)*(hi-lo),r=rows.reduce((a,b)=>Math.abs(a.K-K)<=Math.abs(b.K-K)?a:b);if(clicked){selectedChange(r.K);return;}
 const ov=blankOverlay(frame);const xv=geom.X(r.K),yv=geom.Y(valid(r[ra])?r[ra]:0);drawMarker(ov,geom,xv,yv);
 drawTooltip(ov,frame,[`SPX ${fmt(r.K,2)}  ${fmt(r.money,2)}%`,`Q: ${asProb?pct(r[qa]):fmt(r[qa],3)}`,`R: ${asProb?pct(r[ra]):fmt(r[ra],3)}`,`GAMMA: ${fmt(r.gamma,4)}  CHARM: ${fmt(r.charm,4)}`],x,y);
 $('opStrikeRead').textContent=`Strike ${fmt(r.K,2)} · ${title}: Q ${asProb?pct(r[qa],2):fmt(r[qa],3)} / R_flow ${asProb?pct(r[ra],2):fmt(r[ra],3)} · Gamma ${fmt(r.gamma,3)} · Charm ${fmt(r.charm,3)}`;
 });
}
function renderHeatChart(){
 const calc=ST.calc,rows=refSlice();if(!calc||!rows?.length)return;
 const frame=setupChart('opHeatCanvas',342),{ctx,w,h}=frame,L=66,R=w-22,T=24,B=h-41,m=calc.step,mode=$('opHeatMetric').value;
 const maxabs=Math.max(.03,...rows.flatMap(r=>r.firstR.map((v,j)=>Math.abs(v-r.firstQ[j]))));
 const nT=26,cellW=(R-L)/rows.length,cellH=(B-T)/nT,base=ctx.createLinearGradient(L,T,R,B);
 for(let col=0;col<rows.length;col++)for(let t=0;t<nT;t++){
  const j=Math.round((t+1)*m/nT),r=rows[col],v=mode==='qlift'?r.firstR[j]-r.firstQ[j]:mode==='q'?r.firstQ[j]:r.firstR[j];
  ctx.fillStyle=colorRamp(v,mode==='qlift'?'lift':'heat',mode==='qlift'?Math.min(.25,maxabs):1);
  ctx.fillRect(L+col*cellW,B-(t+1)*cellH,Math.ceil(cellW+.5),Math.ceil(cellH+.5));
 }
 ctx.font='10px Consolas';ctx.strokeStyle='rgba(103,156,218,.23)';ctx.fillStyle=C.axis;
 for(let k=0;k<=5;k++){const x=L+(R-L)*k/5,idx=Math.min(rows.length-1,Math.floor((rows.length-1)*k/5));ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,B);ctx.stroke();ctx.textAlign='center';ctx.fillText(fmt(rows[idx].K,0),x,B+16);}
 for(let k=0;k<=4;k++){const y=B-(B-T)*k/4;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(k*25+'%',L-8,y+4);}
 ctx.fillStyle=C.gold;ctx.textAlign='right';ctx.fillText('T · ORIZZONTE',R,B+31);
 bindPointer(frame,(x,y,clicked)=>{if(x<L||x>R||y<T||y>B)return;const i=clamp(Math.floor((x-L)/cellW),0,rows.length-1),u=clamp((B-y)/(B-T),0,1),r=rows[i],j=clamp(Math.round(u*m),0,m),q=r.firstQ[j],rr=r.firstR[j],lift=rr-q;
 const ov=blankOverlay(frame);ctx.save();ctx.restore();const geom={L,R,T,B};drawMarker(ov,geom,L+(i+.5)*cellW,B-u*(B-T));drawTooltip(ov,frame,[`K ${fmt(r.K,1)} · ${pct(u,0)} T`,`Q touch: ${pct(q,2)}`,`R_flow touch: ${pct(rr,2)}`,`Lift: ${pct(lift,2)}`],x,y);
 $('opHeatRead').textContent=`Strike ${fmt(r.K,2)} · T ${pct(u,0)} · Q touch ${pct(q,2)} · R_flow touch ${pct(rr,2)} · differenza ${pct(lift,2)}. Primo tocco stimato sul reticolo dei sentieri.`;
 if(clicked)selectedChange(r.K);
 });
}
function hedgeByShock(calc,shockPct,opt=opts()){
 if(!calc)return null;const inv=calc.inventory,ref=calc.ref;
 const dS=ref*shockPct/100,dYear=opt.charm===0?0:opt.hours/(opt.charm===252?252*6.5:365*24),dIV=opt.vol/100;
 // A scenario sensitivity translation, not a filled order. SPX multiplier 100 / ES multiplier 50.
 const gamma=-2*inv.gamma*dS,charm=-2*inv.charm*dYear,vanna=-2*inv.vanna*dIV;
 return {dS,dYear,dIV,gamma,charm,vanna,total:gamma+charm+vanna,baseline:-2*inv.delta,coverage:inv.coverage};
}
function renderHedgeChart(){
 const calc=ST.calc;if(!calc)return;const frame=setupChart('opHedgeCanvas',324),{ctx}=frame,opt=opts(),xMin=-4,xMax=4;
 const samples=Array.from({length:81},(_,i)=>hedgeByShock(calc,xMin+i*(xMax-xMin)/80,opt)),vals=samples.flatMap(s=>[s.gamma,s.total]);
 const low=Math.min(0,...vals),high=Math.max(0,...vals),margin=Math.max(5,(high-low)*.13);
 const geom=axes(frame,xMin,xMax,low-margin,high+margin,{xFmt:x=>fmt(x,1)+'%',yFmt:y=>fmt(y,0),unit:'Δ SPX % · ES eq. ipotetici'});
 line(ctx,samples.map((s,i)=>[geom.X(xMin+i*.1),geom.Y(s.gamma)]),C.gold,2,[4,3]);
 line(ctx,samples.map((s,i)=>[geom.X(xMin+i*.1),geom.Y(s.total)]),C.cyan,2.7);

 const sh=hedgeByShock(calc,opt.shock,opt);ctx.strokeStyle=C.white;ctx.beginPath();ctx.moveTo(geom.X(opt.shock),geom.T);ctx.lineTo(geom.X(opt.shock),geom.B);ctx.stroke();
 $('opHedgeCoverage').textContent=`${calc.inventory.matches}/${calc.inventory.total} POS. · ${pct(calc.inventory.coverage,1)} GROSS`;
 $('opHedgeRead').textContent=`Shock ${fmt(opt.shock,2)}% (${fmt(sh.dS,1)} pt) · Gamma hedge ${fmt(sh.gamma,0)} · Charm ${fmt(sh.charm,0)} · Vanna ${fmt(sh.vanna,0)} · totale ${fmt(sh.total,0)} equivalenti ES nello scenario.`;
 bindPointer(frame,(x,y,clicked)=>{if(x<geom.L||x>geom.R||y<geom.T||y>geom.B)return;const shock=xMin+(x-geom.L)/(geom.R-geom.L)*(xMax-xMin),h=hedgeByShock(calc,shock,opt),ov=blankOverlay(frame);
 drawMarker(ov,geom,geom.X(shock),geom.Y(h.total));drawTooltip(ov,frame,[`Shock ${fmt(shock,2)}% · ΔSPX ${fmt(h.dS,1)}`,`Γ hedge ${fmt(h.gamma,1)} ES eq`,`Charm ${fmt(h.charm,1)} · Vanna ${fmt(h.vanna,1)}`,`Totale ΔH ${fmt(h.total,1)} ES eq`],x,y);
 $('opHedgeRead').textContent=`Scenario shock ${fmt(shock,2)}% · ΔH Γ ${fmt(h.gamma,1)} · ΔH Charm ${fmt(h.charm,1)} · ΔH Vanna ${fmt(h.vanna,1)} · totale ${fmt(h.total,1)} ES eq. hypothetici.`;
 if(clicked){$('opShock').value=String(Math.round(shock*4)/4);$('opShockOut').textContent=fmt(shock,1)+'%';renderSelected();}
 });
}
function weightedSamples(values,weights){
 const items=values.map((v,i)=>({p:v,w:weights[i]})).filter(a=>valid(a.p)&&valid(a.w)&&a.w>=0).sort((a,b)=>a.p-b.p),n=items.length;
 const v=new Float64Array(n),cum=new Float64Array(n);let s=0;for(let i=0;i<n;i++){v[i]=items[i].p;s+=items[i].w;cum[i]=s;}return {values:v,cum,n,sum:s};
}
function upperBound(vals,v){let a=0,b=vals.length;while(a<b){const m=(a+b)>>1;if(vals[m]<=v)a=m+1;else b=m;}return a;}
function quantileData(dist,p,weighted){const {values,cum,n,sum}=dist;if(!n)return null;if(!weighted)return quantileSorted(values,p);const tgt=p*sum;let a=0,b=n-1;while(a<b){const m=(a+b)>>1;if(cum[m]>=tgt)b=m;else a=m+1;}return values[a];}
function buildFanCache(calc){
 const {prob,paths:{info,steps,n}}=calc,weights=prob.weights,fans=[];
 for(let k=0;k<=48;k++){
  const j=Math.min(steps,Math.round(k*steps/48)),v=new Array(n);for(let i=0;i<n;i++)v[i]=info[i].path[j];
  const dist=weightedSamples(v,weights),q=[.05,.10,.25,.5,.75,.90,.95].map(p=>quantileData(dist,p,false)),r=[.05,.10,.25,.5,.75,.90,.95].map(p=>quantileData(dist,p,true));
  fans.push({j,t:j/steps,dist,q,r});
 }
 return fans;
}
function renderFanChart(){
 const calc=ST.calc;if(!calc)return;const data=calc.fan||(calc.fan=buildFanCache(calc)),frame=setupChart('opFanCanvas',324),ctx=frame.ctx;
 const values=data.flatMap(d=>[d.q[0],d.q[6],d.r[0],d.r[6]]),lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo)*.07;
 const geom=axes(frame,0,1,lo-pad,hi+pad,{unit:'% dell’orizzonte',xFmt:x=>pct(x,0),yFmt:y=>fmt(y,0),yTicks:4});
 function ribbon(loIdx,hiIdx,color,alpha){ctx.save();ctx.beginPath();data.forEach((d,i)=>{const x=geom.X(d.t),y=geom.Y(d[color==='q'? 'q':'r'][loIdx]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});for(let i=data.length-1;i>=0;i--){const d=data[i];ctx.lineTo(geom.X(d.t),geom.Y(d[color==='q'?'q':'r'][hiIdx]));}ctx.closePath();ctx.fillStyle=color==='q'?`rgba(225,221,203,${alpha})`:`rgba(125,195,224,${alpha})`;ctx.fill();ctx.restore();}
 ribbon(0,6,'q',.10);ribbon(2,4,'q',.22);ribbon(0,6,'r',.12);ribbon(2,4,'r',.24);
 const sample=Math.max(1,Math.floor(calc.paths.n/36));ctx.save();for(let i=0;i<calc.paths.n;i+=sample){const p=calc.paths.info[i].path;const xy=Array.from(p,(v,j)=>[geom.X(j/calc.step),geom.Y(v)]);line(ctx,xy,`rgba(84,137,195,${.06+.12*(calc.paths.info[i].w>1/calc.paths.n?1:0)})`,.5);}ctx.restore();
 line(ctx,data.map(d=>[geom.X(d.t),geom.Y(d.q[3])]),C.gold,2,[4,3]);line(ctx,data.map(d=>[geom.X(d.t),geom.Y(d.r[3])]),C.cyan,2.6);
 const selected=calcSelected();if(selected){const y=geom.Y(selected.K);if(y>=geom.T&&y<=geom.B){ctx.save();ctx.strokeStyle='rgba(242,231,207,.7)';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(geom.L,y);ctx.lineTo(geom.R,y);ctx.stroke();ctx.restore();}}

 function onPoint(x,y,clicked){if(x<geom.L||x>geom.R||y<geom.T||y>geom.B)return;const f=clamp((x-geom.L)/(geom.R-geom.L),0,1),j=Math.round(f*48),data0=data[j],price=lo+pad+(geom.B-y)/(geom.B-geom.T)*((hi+pad)-(lo-pad)); // overwritten below with exact inverse
  const price2=(hi+pad)-(y-geom.T)/(geom.B-geom.T)*((hi+pad)-(lo-pad));
  const idx=upperBound(data0.dist.values,price2),Q=(data0.dist.n-idx)/data0.dist.n,R=1-(idx?data0.dist.cum[idx-1]/(data0.dist.sum||1):0);
  const s=calcSelected(),h=s?s.firstR[data0.j]:null;
  const ov=blankOverlay(frame);drawMarker(ov,geom,geom.X(data0.t),geom.Y(price2));drawTooltip(ov,frame,[`T: ${pct(data0.t,1)} · ${fmt(calc.prob.T*365*24*data0.t,1)}h`,`Prezzo SPX: ${fmt(price2,2)}`,`Mediana Q: ${fmt(data0.q[3],2)} / R ${fmt(data0.r[3],2)}`,`Close above: Q ${pct(Q,1)} / R ${pct(R,1)}`,`Touch livello ${fmt(s?.K,0)}: ${pct(h,1)}`],x,y);
  $('opFanRead').textContent=`T ${pct(data0.t,1)} (${fmt(calc.prob.T*365*24*data0.t,1)} ore) · crosshair SPX ${fmt(price2,2)} · mediana Q ${fmt(data0.q[3],2)} / R_flow ${fmt(data0.r[3],2)} · chiusura sopra ${pct(Q,1)} / ${pct(R,1)} · tocco R livello ${pct(h,1)}.`;
  if(clicked){selectedChange(nearest(calc.chain.strikes,price2));}
 }
 bindPointer(frame,onPoint);
}
function renderConfluence(){
 const calc=ST.calc,box=$('opConfluence');if(!calc||!box)return;
 const levels=flowFeatures(calc.flow),near=levels.map(l=>({...l,d:Math.abs(l.K-ST.selected)})).sort((a,b)=>a.d-b.d).slice(0,15);
 const invPos=[...calc.inventory.byStrike.values()].sort((a,b)=>b.gross-a.gross).slice(0,4).map(p=>({K:p.K,name:'MM INVENTORY',family:'MM',d:Math.abs(p.K-ST.selected),gross:p.gross}));
 const l=[...near,...invPos].sort((a,b)=>a.d-b.d).slice(0,14);
 box.innerHTML=l.map(p=>{const k=nearest(calc.chain.strikes,p.K),r=calc.grid.find(x=>x.K===k),f=Math.exp(-p.d/Math.max(15,calc.ref*.004)),g=r?.gamma,c=r?.charm;
 return `<div class="op-levelrow" data-k="${k}" tabindex="0" role="button"><div><b>${esc(p.name)}</b><small>${esc(p.family)} · Δ${fmt(p.d,1)}pt</small></div><div class="op-bar"><i style="width:${Math.round(100*f)}%"></i></div><div><b>${fmt(p.K,1)}</b><small>R touch ${pct(r?.rHit,0)}</small></div></div>`;
 }).join('')||'<div class="op-note">Livelli non disponibili.</div>';
 box.querySelectorAll('[data-k]').forEach(el=>{el.onclick=()=>selectedChange(Number(el.dataset.k));el.onkeydown=e=>{if(e.key==='Enter')selectedChange(Number(el.dataset.k));};});
}
function renderProbCard(){
 const r=calcSelected(),calc=ST.calc;if(!calc||!r)return;
 const native=labelsFor(r.K,calc.flow).primary,dir=r.up?'RESISTENZA SUPERIORE':'SUPPORTO INFERIORE';
 $('opClass').textContent=(native?.name||dir).toUpperCase();
 const items=[['FIRST TOUCH · Q / R',`${pct(r.qHit,1)} / ${pct(r.rHit,1)}`,'Sul reticolo dei sentieri'],
  ['REVERSAL | TOUCH · Q / R',`${pct(r.qReversal,1)} / ${pct(r.rReversal,1)}`,'Rientro oltre il buffer dopo tocco'],
  ['BREAKOUT | TOUCH · Q / R',`${pct(r.qBreak,1)} / ${pct(r.rBreak,1)}`,'Chiusura oltre barriera + buffer'],
  ['PIN WINDOW · Q / R',`${pct(r.qPin,1)} / ${pct(r.rPin,1)}`,'Chiusura nel range ±'+opts().pin+' pt'],
  ['CLOSE BEYOND · Q / R',`${pct(r.qClose,1)} / ${pct(r.rClose,1)}`,'Q terminale analitica / R Monte Carlo'],
  ['FIRST HIT TIME · Q / R',`${fmt(r.avgTimeQ/calc.step*100,1)}% / ${fmt(r.avgTimeR/calc.step*100,1)}%`,'Tempo medio condizionato al tocco'],
  ['MM×GAMMA · STRIKE',fmt(r.gammaE,3),'Sensibilità campione all7 1DTE'],
  ['GAMMA / CHARM FIELD',`${fmt(r.gamma,2)} / ${fmt(r.charm,2)}`,'Scenario ribasato, unità vendor']];
 $('opProbCard').innerHTML=items.map(([k,v,d])=>`<div class="op-probitem"><small>${esc(k)}</small><b>${esc(v)}</b><em>${esc(d)}</em></div>`).join('');
 const nEff=r.effHit||0,lowEff=calc.prob.ESS/calc.n;
 $('opProbNote').textContent=`Strike ${fmt(r.K,2)} · moneyness ${fmt(r.money,2)}% · ESS totale ${fmt(calc.prob.ESS,0)} / ${calc.n}; ESS condizionato al tocco ${fmt(nEff,0)}. Sotto 40 osservazioni effettive le probabilità condizionate sono sospese. Stima R_flow: IC95% touch ±${pct(1.96*Math.sqrt(Math.max(0,r.rHit*(1-r.rHit))/Math.max(calc.prob.ESS,1)),1)} circa. Nessuna stima P storica.`;
}
function renderScore(){
 const c=ST.calc,r=calcSelected();if(!c||!r)return;
 const inv=c.inventory,opt=opts(),sh=hedgeByShock(c,opt.shock,opt),buf=opt.breakout;
 const conf=(r.gamma!==null&&r.charm!==null?'FLOW FIELD DISPONIBILE':'FUORI DOMINIO GAMMA/CHARM');
 const eff=c.prob.ESS/c.prob.n,covered=inv.coverage,block=['FLOW SAMPLE RIBASATO','P STORICA NON VALIDATA'];
 const lines=[['Misura di scenario','R_flow'],['Strike analizzato',fmt(r.K,2)+' SPX'],['Scenario reversal | hit',pct(r.rReversal,2)+' · Q '+pct(r.qReversal,2)],['Scenario breakout | hit',pct(r.rBreak,2)+' · Q '+pct(r.qBreak,2)],['Scenario pin ±'+opt.pin+'pt',pct(r.rPin,2)+' · Q '+pct(r.qPin,2)],['ESS pesi / totale',fmt(c.prob.ESS,0)+' / '+c.n],['Copertura MM in gross',pct(covered,1)],['Richiesta hedge ΔH ipotetica',fmt(sh.total,0)+' contratti ES eq.'],['Stato campo gamma/charm',conf],['Misura finale','R_flow: scenario, non probabilità fisica P']];
 $('opScoreboard').innerHTML='<div class="op-scorehead">SCENARIO ALLO STRIKE · SPXW</div>'+lines.map(([k,v])=>`<div class="op-scoreline"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
 $('opScoreNote').textContent=block.join(' · ')+'. Le probabilità condizionate possono essere usate per stress e confronto fra livelli, ma non sono edge e win rate realizzati.';
}
function renderKPIs(){
 const calc=ST.calc,r=calcSelected();if(!calc||!r)return;
 const sh=hedgeByShock(calc,opts().shock),levels=flowFeatures(calc.flow),nb=calc.chain.strikes.length,inv=calc.inventory;
 $('opDataStatus').textContent=`${nb} STRIKE · ${calc.n.toLocaleString('it-IT')} PATHS · ${levels.length} LIVELLI DI RIFERIMENTO`;
 $('opKPIs').innerHTML=iconMetric('Strike selezionato',fmt(r.K,0),fmt(r.money,2)+'% dal riferimento')+
 iconMetric('R_flow · touch',pct(r.rHit,1),'Q bridge '+pct(r.qHit,1))+
 iconMetric('R_flow · reversal',pct(r.rReversal,1),'condizionato al tocco')+
 iconMetric('R_flow · breakout',pct(r.rBreak,1),'condizionato al tocco')+
 iconMetric('Dealer ΔH · ES eq',fmt(sh.total,0),'Shock '+fmt(opts().shock,1)+'% · ipotetico')+
 iconMetric('MM matched / gross',pct(inv.coverage,1),`${inv.matches}/${inv.total} posizioni · ${fmt(calc.prob.ESS,0)} ESS`);
}
function allFields(){return ['K','family','gamma','charm','mm','deltaE','gammaE','charmE','hedge','qClose','rClose','qHit','rHit','qReversal','rReversal','qBreak','rBreak','rPin','coverage'];}
function fmtCell(v,key){if(v==null||!valid(Number(v)))return esc(v??'—');if(['qClose','rClose','qHit','rHit','qReversal','rReversal','qBreak','rBreak','rPin'].includes(key))return pct(v,1);return fmt(Number(v),key==='K'?0:key==='gamma'||key==='charm'?3:key==='deltaE'||key==='gammaE'||key==='charmE'||key==='hedge'?2:0);}
function cellTint(v,key,scale){
 if(v==null||!valid(v))return '';
 const prob=['qClose','rClose','qHit','rHit','qReversal','rReversal','qBreak','rBreak','rPin'].includes(key);
 const signed=['gamma','charm','mm','deltaE','gammaE','charmE','hedge'].includes(key);
 if(!prob&&!signed)return '';
 const t=Math.round(96*Math.pow(clamp(prob?v:Math.abs(v)/(scale||1),0,1),.82))/96;
 if(t<.025)return 'background:rgba(12,33,53,.4);';
 const rgb=prob?[135,181,255]:v<0?[245,239,222]:[153,222,255],a=(.07+.72*t).toFixed(3);
 return `background:rgba(${rgb.join(',')},${a});color:${t>.55?'#f5f3e9':'#bde9f9'};`;
}
function renderTable(force=false){
 const c=ST.calc;if(!c)return;
 const key=[c.prob.n,c.prob.asof,c.flow.time,c.parameters.pin,c.parameters.breakout,ST.sort,ST.desc,$('opTableFilter').value,$('opSearch').value,ST.selected].join('|');
 if(!force&&ST.tableKey===key)return;ST.tableKey=key;
 const word=$('opSearch').value.trim().toLowerCase(),filter=$('opTableFilter').value,ref=c.ref;
 let rows=c.grid.filter(r=>{
  if(filter==='near'&&Math.abs(r.money)>5)return false;
  if(filter==='mm'&&r.mm==null)return false;
  if(filter==='levels'&&!labelsFor(r.K,c.flow).all.length)return false;
  if(word&&!fmt(r.K,0).replace(/\./g,'').includes(word)&&!labelsFor(r.K,c.flow).all.some(x=>x.name.toLowerCase().includes(word)))return false;
  return true;
 });
 const get=(r,k)=>k==='family'?labelsFor(r.K,c.flow).primary?.name||'—':r[k];
 rows.sort((a,b)=>{const va=get(a,ST.sort),vb=get(b,ST.sort),c=typeof va==='string'||typeof vb==='string'?String(va??'').localeCompare(String(vb??'')):(va??-Infinity)-(vb??-Infinity);return ST.desc?-c:c;});
 const fields=allFields(),scale={};for(const key of fields){const a=rows.map(r=>Math.abs(Number(r[key]))).filter(valid).sort((a,b)=>a-b);scale[key]=a[Math.min(a.length-1,Math.floor(.95*a.length))]||1;}
 const html=rows.map(r=>`<tr data-k="${r.K}" tabindex="0" class="${r.K===ST.selected?'active':''}">`+fields.map(key=>{let v=get(r,key),style=(key==='K'||key==='family'||key==='coverage')?'':cellTint(v,key,scale[key]);return `<td class="${key}" style="${style}">${key==='family'?esc(v):key==='coverage'?esc(v):fmtCell(v,key)}</td>`;}).join('')+'</tr>').join('');
 $('opTable').querySelector('tbody').innerHTML=html;
 $('opTableFooter').textContent=`${rows.length}/${c.grid.length} strike visibili · copertura greche MM ${pct(c.inventory.coverage,1)} in contratti gross · Q close analitica CVI, R_flow e touch derivati dai sentieri; assenza di dato ≠ zero.`;
 const trs=$('opTable').querySelectorAll('tbody tr');trs.forEach(tr=>{tr.onclick=()=>selectedChange(Number(tr.dataset.k));tr.onkeydown=e=>{if(e.key==='Enter')selectedChange(Number(tr.dataset.k));};});
}
function initOptionsStructure(){
 if(!$('opLegLong')||ST._structInit||!ST.calc)return;ST._structInit=true;
 const near=ST.calc.chain.strikes.filter(K=>Math.abs(K-ST.calc.ref)<ST.calc.ref*.07),arr=near.length?near:ST.calc.chain.strikes;
 const options=arr.map(K=>`<option value="${K}">${fmt(K,0)}</option>`).join('');$('opLegLong').innerHTML=$('opLegShort').innerHTML=options;
 const nearLong=nearest(arr,ST.calc.ref-20),nearShort=nearest(arr,ST.calc.ref+20);$('opLegLong').value=String(nearLong);$('opLegShort').value=String(nearShort);
}
function buildVertical(){
 const c=ST.calc;if(!c)return null;
 const type=$('opStructType').value,dir=$('opStructDir').value,KL=Number($('opLegLong').value),KS=Number($('opLegShort').value),ql=c.chain.quoteByStrike.get(KL)?.[type],qs=c.chain.quoteByStrike.get(KS)?.[type];
 if(!ql||!qs||KL===KS||![ql.bid,ql.ask,qs.bid,qs.ask].every(valid))return null;
 const debit=dir==='LONG'?ql.ask-qs.bid:qs.ask-ql.bid,sign=dir==='LONG'?1:-1;
 const intrinsic=(S,K)=>type==='CALL'?Math.max(S-K,0):Math.max(K-S,0),pnl=S=>sign*(intrinsic(S,KL)-intrinsic(S,KS))-debit;
 const at0=pnl(0),atHigh=pnl(Math.max(KL,KS)*2),atL=pnl(KL),atS=pnl(KS),maxProfit=Math.max(at0,atHigh,atL,atS),maxLoss=Math.min(at0,atHigh,atL,atS);
 let eq=0,POPq=0,POPr=0,accQ=0,accR=0;
 for(let i=0;i<c.paths.n;i++){const pr=pnl(c.paths.info[i].terminal),w=c.prob.weights[i];accQ+=pr/c.paths.n;accR+=pr*w;if(pr>0){POPq+=1/c.paths.n;POPr+=w;}}
 return {type,dir,KL,KS,debit,pnl,maxProfit,maxLoss,eqQ:accQ,eqR:accR,popQ:POPq,popR:POPr,ql,qs};
}
function renderStructure(){
 const c=ST.calc;if(!c)return;initOptionsStructure();const v=buildVertical();if(!v){$('opStructureStats').innerHTML='';$('opStructureRead').textContent='Scegli due strike diversi e contratti validi.';return;}
 const frame=setupChart('opPayoffCanvas',296),{ctx}=frame,lo=Math.min(c.ref*.94,v.KL-55,v.KS-55),hi=Math.max(c.ref*1.06,v.KL+55,v.KS+55),vals=[v.pnl(lo),v.pnl(hi),v.pnl(v.KL),v.pnl(v.KS)],min=Math.min(0,...vals),max=Math.max(0,...vals),pad=Math.max(2,(max-min)*.12),geom=axes(frame,lo,hi,min-pad,max+pad,{unit:'SPX · payoff punti',yFmt:x=>fmt(x,0)});
 const points=Array.from({length:160},(_,i)=>{const K=lo+(hi-lo)*i/159;return [geom.X(K),geom.Y(v.pnl(K))];});line(ctx,points,C.cyan,2.7);
 ctx.strokeStyle='rgba(225,221,203,.55)';ctx.beginPath();ctx.moveTo(geom.L,geom.Y(0));ctx.lineTo(geom.R,geom.Y(0));ctx.stroke();
 for(const [K,color] of [[v.KL,C.gold],[v.KS,C.violet]]){const x=geom.X(K);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x,geom.T);ctx.lineTo(x,geom.B);ctx.stroke();}
 $('opStructureRead').textContent=`${v.dir} ${v.type} vertical: ${fmt(v.KL,0)} / ${fmt(v.KS,0)} · debit ${fmt(v.debit,2)} pt (ask acquisto / bid vendita) · PnL a scadenza in punti SPX per spread; nessun costo/slippage aggiuntivo incluso.`;
 $('opStructureStats').innerHTML=[['MAX PROFIT',fmt(v.maxProfit,2),'pt per spread'],['MAX LOSS',fmt(v.maxLoss,2),'pt per spread'],['Q PROFIT >0',pct(v.popQ,1),'MC Q bridge'],['R_FLOW PROFIT >0',pct(v.popR,1),'scenario non P'],['E[P&L] Q',fmt(v.eqQ,2),'punti indice'],['E[P&L] R',fmt(v.eqR,2),'scenario pesato']].map(([a,b,s])=>`<div class="op-probitem"><small>${a}</small><b>${b}</b><em>${s}</em></div>`).join('');
 bindPointer(frame,(x,y,clicked)=>{if(x<geom.L||x>geom.R||y<geom.T||y>geom.B)return;const K=lo+(x-geom.L)/(geom.R-geom.L)*(hi-lo),pr=v.pnl(K),ov=blankOverlay(frame);drawMarker(ov,geom,geom.X(K),geom.Y(pr));drawTooltip(ov,frame,[`SPX ${fmt(K,2)}`,`Payoff spread: ${fmt(pr,2)} pt`,`Debito iniziale: ${fmt(v.debit,2)} pt`],x,y);
 $('opStructureRead').textContent=`Prezzo scenario ${fmt(K,2)} SPX · payoff verticale ${fmt(pr,2)} punti per spread · Q POP ${pct(v.popQ)} · R_flow POP ${pct(v.popR)} (non P).`;
 });
}
function csvDownload(name,content,type='text/csv'){const blob=new Blob([content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();root.setTimeout(()=>URL.revokeObjectURL(url),1600);}
function exportStrikeCSV(){const c=ST.calc;if(!c)return;const keys=['K','money','gamma','charm','mm','deltaE','gammaE','charmE','vannaE','hedge','qClose','rClose','qHit','rHit','qReversal','rReversal','qBreak','rBreak','qPin','rPin','effHit','avgTimeR','coverage'];const escCsv=x=>`"${String(x??'').replace(/"/g,'""')}"`;
 const lines=[keys.map(escCsv).join(',')];c.grid.forEach(row=>lines.push(keys.map(k=>escCsv(row[k])).join(',')));
 csvDownload('Quantistes_All_Strike_Scenario_'+(c.prob.expiry||'SPXW')+'.csv',lines.join('\r\n'));
}
function exportAudit(){const c=ST.calc;if(!c)return;const obj={schema:'quantistes.ops.strike-scenario.v7',generatedAt:new Date().toISOString(),status:'SCENARIO_RESEARCH_NON_P',source:{flowDates:c.flow.sourceDates,flowTime:c.flow.time,all7Expiry:c.prob.expiry,all7AsOf:c.prob.asof,temporalMapping:'SAMPLE_2025_TO_SPXW_2026',strikeCount:c.grid.length},simulation:{pathCount:c.n,steps:c.step,ESS:c.prob.ESS,weightsGamma:Number($('opBetaGamma').value),weightsCharm:Number($('opBetaCharm').value),pinBand:c.parameters.pin,breakBuffer:c.parameters.breakout,firstTouchKernel:c.parameters.touch},hedge:{contractConvention:'SPX_100_DOLLAR_PER_POINT_TO_ES_50_DOLLAR_PER_POINT',routeAssumption:'100_PERCENT_HYPOTHETICAL',matchedPositions:c.inventory.matches,totalPositions:c.inventory.total,grossCoverage:c.inventory.coverage,deltaExposure:c.inventory.delta,gammaExposure:c.inventory.gamma,charmExposure:c.inventory.charm,vannaExposure:c.inventory.vanna},selectedStrike:ST.selected,levels:flowFeatures(c.flow),strikeLadder:c.grid.map(x=>({K:x.K,money:x.money,mm:x.mm,deltaE:x.deltaE,gammaE:x.gammaE,charmE:x.charmE,gammaField:x.gamma,charmField:x.charm,qClose:x.qClose,rClose:x.rClose,qTouchGrid:x.qHit,rTouchGrid:x.rHit,qReversalConditional:x.qReversal,rReversalConditional:x.rReversal,qBreakoutConditional:x.qBreak,rBreakoutConditional:x.rBreak,qPinWindow:x.qPin,rPinWindow:x.rPin,effHit:x.effHit,coverage:x.coverage}))};
 csvDownload('Quantistes_All_Strike_Audit.json',JSON.stringify(obj,null,2),'application/json');
}
function maybeCompactLegacyES(){
 const basis=Number($('flowBasis')?.value)||0;
 for(const table of document.querySelectorAll('#view-flows table')){
  if(table.id==='opTable')continue;
  const ths=[...table.querySelectorAll('thead th')];if(!ths.length)continue;
  const es=ths.findIndex(el=>/^ES(?:\*|\s|$)/i.test(el.textContent.trim())),sp=ths.findIndex(el=>/^SPX(?:\s|$)/i.test(el.textContent.trim()));if(es<0||sp<0)continue;
  const cells=[...table.querySelectorAll('tbody tr')].filter(row=>row.cells?.length>Math.max(es,sp));
  const num=s=>Number(String(s||'').trim().replace(/\./g,'').replace(',','.').replace(/[^0-9+\-.]/g,''));
  let comparable=0;const same=cells.every(row=>{const v=num(row.cells[es].textContent),w=num(row.cells[sp].textContent);if(!valid(v)||!valid(w))return true;comparable++;return Math.abs(v-w)<=Math.max(.001,Math.abs(v)*1e-8);});
  const collapse=basis===0&&comparable>=2&&same;
  ths[es].hidden=collapse;cells.forEach(row=>row.cells[es].hidden=collapse);
 }
}
function selectiveShadeLegacy(){
 for(const tbl of document.querySelectorAll('#view-flows table')){
  if(tbl.id==='opTable'||tbl.dataset.opStyle==='v7')continue;
  const rows=[...tbl.rows],heads=rows.find(r=>r.querySelector('th'))?.cells;if(!heads||rows.length<3)continue;
  const max=Math.max(...rows.map(r=>r.cells.length));
  for(let i=0;i<max;i++){
    const title=String(heads[i]?.textContent||'').trim();
    if(/(?:PRICE|PREZZO|K SOURCE|K DEMO|STRIKE|SPX|ES\b|EXPIR|FAMIGLIA|LIVELL|BASIS|SCADENZA|ORA|HOUR|TEMPO|TENOR|DATA|FAMILY|NOME)/i.test(title))continue;
    const prob=/(?:PROB|\bQ\b|\bR_FLOW\b|\bR\b|TOUCH|CLOSE|ABOVE|BELOW|LIFT|COPERTURA|COVERAGE|%)/i.test(title),signed=/(?:GAMMA|CHARM|VANNA|NET|GROSS|MM|DELTA|HEDGE|ESPOSIZ|EXPOSURE|IMBALANCE|SCORE|HHI|CONFLUENCE|VEGA)/i.test(title);
    if(!prob&&!signed)continue;
    const parse=s=>{let v=String(s||'').trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9+\-.]/g,'');return Number(v);};
    const all=rows.slice(1).map(r=>parse(r.cells[i]?.textContent||'')).filter(valid).map(Math.abs).sort((a,b)=>a-b);if(all.length<3)continue;
    const scale=prob?(all.at(-1)>1?100:1):(all[Math.floor(all.length*.95)]||1);
    for(const row of rows.slice(1)){const cell=row.cells[i];if(!cell)continue;const v=parse(cell.textContent);if(!valid(v))continue;
     const t=Math.round(96*Math.pow(clamp((prob?v:Math.abs(v))/scale,0,1),.86))/96;const neg=v<0&&!prob;cell.style.transition='none';cell.style.animation='none';cell.style.backgroundColor=neg?`rgba(212,213,200,${.07+.69*t})`:prob?`rgba(93,165,200,${.07+.68*t})`:`rgba(88,141,200,${.07+.69*t})`;cell.style.color=t>.54?'#f5f3e9':'#b7e7f8';}
  }
  tbl.dataset.opStyle='v7';
 }
}
function renderSelected(){if(!ST.calc)return;
 renderKPIs();renderProbCard();renderScore();renderConfluence();renderStrikeChart();renderHeatChart();renderHedgeChart();renderFanChart();renderTable();
}
function renderAll(){if(!ST.calc||!activeOps())return;
 renderSelected();renderStructure();selectiveShadeLegacy();maybeCompactLegacyES();
}
let optsTimer=null;
function debouncedGrid(){clearTimeout(optsTimer);optsTimer=root.setTimeout(()=>{if(!ST.calc)return;const c=ST.calc;ST.calc=makeGrid(c.prob,c.flow,c.inventory,c.chain);ST.calc.fan=c.fan;ST.tableKey='';renderAll();},180);}
function resetFromProbability(prob,flow){
 const chainObj=ST.embedded;if(!chainObj)return;
 if(!ST.quotes.length){ST.quotes=parseChain(chainObj.chainRaw);const q=buildQuoteIndex(ST.quotes);ST.strikes=q.strikes;ST.quoteByStrike=q.map;ST._structInit=false;}
 const chain={quotes:ST.quotes,strikes:ST.strikes,quoteByStrike:ST.quoteByStrike};
 const inv=buildMatchedInventory(chainObj,flow,ST.quotes,ST.strikes,ST.quoteByStrike);
 const c=makeGrid(prob,flow,inv,chain);ST.calc=c;ST.tableKey='';ST.modelKey='';ST.selected=nearest(ST.strikes,Number($('opStrike')?.value)||prob.ref);$('opStrike').value=String(ST.selected);ST._structInit=false;
 const status=$('opSimStatus');if(status)status.textContent=`Q bridge · R_flow · ESS ${fmt(prob.ESS,0)} / ${prob.n} · scenario non P`;
 renderAll();
}
function simInputs(){
 const bind=[['opBetaGamma','fpGamma'],['opBetaCharm','fpCharm'],['opPathCount','fpN']];
 for(const [src,dst] of bind){const a=$(src),b=$(dst);if(!a||!b)continue;b.value=a.value;b.dispatchEvent(new Event('input',{bubbles:true}));}
}
function simulate(){simInputs();$('opSimStatus').textContent='Calcolo paths in corso…';const btn=$('opSimulate');if(btn)btn.disabled=true;
 root.FlowProbability?.run?.();root.setTimeout(()=>{if(btn)btn.disabled=false;},1400);
}
async function refreshOnce(){
 if(!ST.embedded)await embedded();
 if(!ST.embedded)return;
 const flow=source(),prob=paths();
 if(!flow){if(inFlow()&&$('opDataStatus'))$('opDataStatus').textContent='Carica DEMO ALL7 + FLOW';return;}
 const requestKey=`${flow.time}|${flow.reference}|${flow.result?.cfg?.asof||''}|${flow.result?.cfg?.expiry||''}`;
 if((!prob||prob.flowTime!==flow.time||prob.asof!==flow.result?.cfg?.asof) && flow.result?.ws?.model){
   if(ST.runKey!==requestKey){ST.runKey=requestKey;root.FlowProbability?.run?.();}
   return;
 }
 if(!prob?.ready)return;
 if(ST.lastProb!==prob||ST.lastFlowKey!==requestKey){ST.lastProb=prob;ST.lastFlowKey=requestKey;resetFromProbability(prob,flow);}
 if(activeOps()&&ST.view.lastActive!==true){ST.view.lastActive=true;renderAll();}
 if(!activeOps())ST.view.lastActive=false;
}
function attachEvents(){
 const change=id=>$(id);
 $('opStrike').onchange=e=>selectedChange(Number(e.target.value));
 for(const id of ['opRange','opLineMetric','opHeatMetric'])$(id).onchange=()=>{if(!ST.calc)return;if(id==='opRange'){renderStrikeChart();renderHeatChart();}else if(id==='opLineMetric')renderStrikeChart();else renderHeatChart();};
 for(const id of ['opBreak','opPin'])$(id).oninput=debouncedGrid;$('opTouchKernel').onchange=debouncedGrid;
 for(const id of ['opShock','opHours','opVolShock','opCharmScale'])$(id).oninput=()=>{if(id==='opShock')$('opShockOut').textContent=fmt(Number($(id).value),1)+'%';if(ST.calc){renderHedgeChart();renderKPIs();renderScore();}};
 for(const id of ['opStructType','opStructDir','opLegLong','opLegShort'])$(id).onchange=renderStructure;
 $('opSearch').oninput=()=>renderTable(true);$('opTableFilter').onchange=()=>renderTable(true);
 $('opCsv').onclick=exportStrikeCSV;
 $('opTable').querySelectorAll('thead th[data-k]').forEach(th=>th.onclick=()=>{const k=th.dataset.k;ST.desc=ST.sort===k?!ST.desc:false;ST.sort=k;renderTable(true);});
 $('opBetaGamma').oninput=()=>{$('opBetaGammaOut').textContent=fmt(Number($('opBetaGamma').value),1)};
 $('opBetaCharm').oninput=()=>{$('opBetaCharmOut').textContent=fmt(Number($('opBetaCharm').value),1)};
 $('opSimulate').onclick=simulate;
 $('opZero').onclick=()=>{$('opBetaGamma').value='0';$('opBetaCharm').value='0';$('opBetaGammaOut').textContent='0,0';$('opBetaCharmOut').textContent='0,0';simulate();};
 document.querySelector('[data-flow-panel="ops"]')?.addEventListener('click',()=>root.setTimeout(()=>{ST.view.lastActive=false;refreshOnce();},80));
 window.addEventListener('resize',()=>{if(activeOps()&&ST.calc)renderAll();});
 root.setInterval(()=>{
  refreshOnce().catch(e=>{console.error('QOPS-V7',e.stack||e);const x=$('opSimStatus');if(x)x.textContent='Dati non disponibili: '+String(e?.message||e);});
  if(inFlow()&&ST.calc){selectiveShadeLegacy();maybeCompactLegacyES();}
 },800);
}
function init(){if(!$('flow-panel-ops'))return;attachEvents();refreshOnce().catch(console.warn);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
root.QuantistesOpsV7=Object.freeze({version:'7.0.0',ready:()=>!!ST.calc,stats:()=>ST.calc?{strikes:ST.calc.grid.length,paths:ST.calc.n,coverage:ST.calc.inventory.coverage,selected:ST.selected,ESS:ST.calc.prob.ESS}:null,validate:()=>{
 const c=ST.calc;if(!c)return [{pass:false,name:'NO_DATA'}];const checks=[];
 checks.push({name:'FULL_STRIKE_COVERAGE',pass:c.grid.length===c.chain.strikes.length});
 checks.push({name:'WEIGHTS_SUM_1',pass:Math.abs(c.prob.weights.reduce((a,b)=>a+b,0)-1)<1e-8});
 checks.push({name:'EVENT_PARTITION_CONDITIONAL',pass:c.grid.every(r=>!valid(r.rReversal)||Math.abs((r.rReversal||0)+(r.rBreak||0)+(r.rNeutral||0)-1)<1e-6)});
 checks.push({name:'TOUCH_AT_LEAST_CLOSE_MC',pass:c.grid.every(r=>r.qHit+1e-8>=Math.max(0,r.up?c.paths.info.filter(p=>p.terminal>=r.K).length/c.n:c.paths.info.filter(p=>p.terminal<=r.K).length/c.n))});
 checks.push({name:'CUM_TOUCH_MONOTONE',pass:c.grid.every(r=>r.firstR.every((x,i)=>i===0||x+1e-8>=r.firstR[i-1]))});
 checks.push({name:'CVI_NATIVE_LEVELS_UNMODIFIED',pass:c.flow.levels.every(x=>valid(Number(x.price)))});
 return checks;}});
})(window);
