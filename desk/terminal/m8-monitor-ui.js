(function(root) {
'use strict';
const $ = id => document.getElementById(id);
const fmt = (v, digits=2) => Number.isFinite(v)
  ? v.toLocaleString('it-IT', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const strike = v => fmt(v, Math.abs(v-Math.round(v)) < 1e-7 ? 0 : 2);
const svgLine = (a,b,c,d,col,extra='') => '<line x1="'+a+'" y1="'+b+'" x2="'+c+'" y2="'+d+'" stroke="'+col+'" '+extra+'/>';
const svgText = (a,b,t,anchor='start',col='#7ba9e4') => '<text x="'+a+'" y="'+b+'" text-anchor="'+anchor+'" fill="'+col+'" font-size="11">'+t+'</text>';
const monitor = {prefix:'mon', host:'monChart', view:'monitor', range:'central', measure:'iv'};
const skew = {prefix:'sk9', host:'smileChart', view:'smile', range:'central', measure:'iv'};
let active = 'monitor', snapshot = null;

function closest(points,K) {
 let left=0,right=points.length-1;
 while(right-left>1){const middle=(right+left)>>1;if(points[middle].K<K)left=middle;else right=middle;}
 return Math.abs(points[left].K-K)<=Math.abs(points[right].K-K)?left:right;
}

function read(ch,i) {
 const points=ch.visible, p=points?.[i]; if(!p)return;
 const id=ch.prefix, iv=ch.measure==='iv', residual=p.fit-p.mid;
 ch.selected=p.K;
 const slider=$(id+'Slider');slider.value=String(i);
 const message='K '+strike(p.K)+' '+p.side+'   ·   IV CVI '+fmt(100*p.modelIV,2)+'%   /   mid '+fmt(100*p.sourceIV,2)+'%   ·   Bid '+fmt(p.bid,3)+'   /   Ask '+fmt(p.ask,3)+'   ·   Premio CVI '+fmt(p.fit,4)+' pt   ·   CVI − mid '+fmt(residual,4)+' pt';
 $(id+'Quote').textContent=message;slider.setAttribute('aria-valuetext',message);
 const x=ch.x(p.K), y=ch.y(iv?p.modelIV*100:residual), cross=$(id+'Cross'), dot=$(id+'Dot');
 if(cross){cross.setAttribute('x1',x);cross.setAttribute('x2',x);}
 if(dot){dot.setAttribute('cx',x);dot.setAttribute('cy',y);}
}
function resetChart(ch) {
 ch.visible=null;ch.selected=undefined;ch.signature=null;
 $(ch.prefix+'Central').disabled=true;$(ch.prefix+'Full').disabled=true;
 $(ch.host).replaceChildren();$(ch.prefix+'Quote').textContent='—';$(ch.prefix+'Coverage').textContent='—';
 const slider=$(ch.prefix+'Slider');slider.disabled=true;slider.max='0';slider.value='0';slider.setAttribute('aria-valuetext','—');
}
function clear(message='Da ricalcolare') {
 snapshot=null;resetChart(monitor);resetChart(skew);
 $('sk9IppoLegend').hidden=true;
 $('monMark').setAttribute('data-state','wait');$('monMark').textContent=message;
 $('monProfile').textContent='Profilo CVI selezionato';
 for(const id of ['monBilateral','monOneSide','monRMSE','monFwd','monATM'])$(id).textContent='—';
}
function getSnapshot() {
 const state=root.Desk?.state,w=state?.result?.ws,c=w?.cvi;
 if(!state||state.stale||!c?.markReleased)return null;
 if(snapshot?.model===w.model && snapshot.result===state.result)return snapshot;
 const points=w.model.fitted.filter(p=>[p.K,p.bid,p.ask,p.mid,p.fit].every(Number.isFinite))
    .map(p=>({...p,modelIV:Math.sqrt(w.model.varianceAt(p.K)/c.T)})).sort((a,b)=>a.K-b.K);
 if(!points.length)return null;
 const atmStd=Math.sqrt(w.model.varianceAt(c.F)), min=c.F*Math.exp(-2*atmStd), max=c.F*Math.exp(2*atmStd);
 const centre=points.filter(p=>p.K>=min&&p.K<=max);
 snapshot={model:w.model,result:state.result,c,points,centre:centre.length>=2?centre:points,hasCentre:centre.length>=2,w};
 monitor.selected=skew.selected=c.F;
 return snapshot;
}
function niceStep(span,count) {
 const raw=span/count,power=10**Math.floor(Math.log10(raw)),scale=raw/power;
 return (scale<=1?1:scale<=2?2:scale<=2.5?2.5:scale<=5?5:10)*power;
}
function sequence(start,end,step) {
 const a=Math.ceil(start/step-1e-9),b=Math.floor(end/step+1e-9);
 return Array.from({length:Math.max(0,Math.min(100,b-a+1))},(_,j)=>(a+j)*step);
}
function ippoAt(i,K,settlement) {
 if(!i||!i.points?.length||K<i.points[0].strike||K>i.points.at(-1).strike)return NaN;
 const value=i.variant==='desk'? i.iv : i.spline?.at(Math.log(K/(i.fitReference||settlement)));
 return Number.isFinite(value)?100*value:NaN;
}
function draw(ch) {
 const s=getSnapshot();if(!s)return false;
 const chart=$(ch.host),id=ch.prefix,iv=ch.measure==='iv',p=ch.range==='central'?s.centre:s.points;
 ch.visible=p;
 const lo=p[0].K, hi=p.at(-1).K, {c,model}=s;
 const box=chart.getBoundingClientRect(), W=box.width>0?box.width:760, H=box.height>0?box.height:320;
 const L=W<400?51:63,R=Math.max(L+1,W-(W<400?17:25)),T=31,B=Math.max(T+10,H-47);
 const width=R-L,depth=B-T;
 const x=k=>L+width*(k-lo)/(hi-lo||1);
 const modelAt=k=>100*Math.sqrt(model.varianceAt(k)/c.T);
 const ippo=ch===skew?s.result.ippo:null;
 let ipCurve=[];
 if(ippo?.points?.length){
   const lower=Math.max(lo,ippo.points[0].strike),upper=Math.min(hi,ippo.points.at(-1).strike);
   if(lower<=upper){
     const n=ippo.variant==='desk'?1:100;
     ipCurve=Array.from({length:n+1},(_,j)=>{const k=lower+(upper-lower)*j/n;return [k,ippoAt(ippo,k,s.result.cfg.settlement)];}).filter(v=>Number.isFinite(v[1]));
   }
 }
 const ipNodes=ippo?.variant!=='desk'?(ippo?.points||[]).filter(q=>Number.isFinite(q.iv)&&q.strike>=lo&&q.strike<=hi):[];
 const sampleCount=Math.min(900,Math.max(100,Math.ceil(width/2)));
 const ks=[...new Set([...(iv?Array.from({length:sampleCount+1},(_,j)=>lo+(hi-lo)*j/sampleCount):[]),...p.map(q=>q.K),...(c.F>=lo&&c.F<=hi?[c.F]:[])])].sort((a,b)=>a-b);
 const curve=iv?ks.map(k=>[k,modelAt(k)]):p.map(q=>[q.K,q.fit-q.mid]);
 const vals=curve.map(q=>q[1]).concat(ipCurve.map(q=>q[1]),ipNodes.map(q=>100*q.iv),iv?p.filter(q=>Number.isFinite(q.sourceIV)).map(q=>100*q.sourceIV):p.flatMap(q=>[q.bid-q.mid,q.ask-q.mid,0])).filter(Number.isFinite);
 if(!vals.length)return false;
 const vMin=Math.min(...vals),vMax=Math.max(...vals),pad=(vMax-vMin)*.07||(iv?Math.max(.1,Math.abs(vMin)*.02):.01);
 const bottom=iv?Math.max(0,vMin-pad):-Math.max(Math.abs(vMin),Math.abs(vMax))-pad,top=iv?vMax+pad:-bottom;
 const y=v=>B-depth*(v-bottom)/(top-bottom);
 ch.x=x;ch.y=y;ch.signature=[W,H].join('|');
 const yStep=niceStep(top-bottom,Math.max(3,Math.floor(depth/40)));
 const xStep=niceStep(hi-lo||1,Math.max(2,Math.floor(width/72)));
 const digits=Math.max(0,Math.min(6,Math.ceil(-Math.log10(yStep))+1));
 let svg='<defs><clipPath id="'+id+'Viewport"><rect x="'+(L-2.8)+'" y="'+(T-2.8)+'" width="'+(width+5.6)+'" height="'+(depth+5.6)+'"/></clipPath></defs>';
 svg+=svgText(L,18,iv?'IV ANNUA (%)':'CVI − MID (PUNTI)')+svgText(R,H-8,'STRIKE','end');
 for(const v of sequence(bottom,top,yStep)){
   const ty=y(v),decimals=Number.isInteger(yStep)?0:digits;
   svg+=svgLine(L,ty,R,ty,'#183148')+svgText(L-8,ty+4,fmt(v,decimals),'end');
 }
 for(const k of sequence(lo,hi,xStep)){
   const tx=x(k);svg+=svgLine(tx,T,tx,B,'#1a344c','stroke-dasharray="2 5"')+svgText(tx,B+18,strike(k),'middle');
 }
 svg+=svgLine(L,B,R,B,'#45637d');
 if(c.F>=lo&&c.F<=hi){
   svg+=svgLine(x(c.F),T,x(c.F),B,'#80ade7','stroke-dasharray="4 4"');
   if(x(c.F)>L+110&&x(c.F)<R-45)svg+=svgText(x(c.F),18,'F '+strike(c.F),'middle','#aacaf6');
 }
 svg+='<g clip-path="url(#'+id+'Viewport)">';
 const toPath=data=>data.filter(q=>Number.isFinite(q[1])).map(([k,v],j)=>(j?'L':'M')+x(k).toFixed(2)+' '+y(v).toFixed(2)).join(' ');
 if(!iv){
   svg+=svgLine(L,y(0),R,y(0),'#7590aa');
   for(const q of p)svg+=svgLine(x(q.K),y(q.ask-q.mid),x(q.K),y(q.bid-q.mid),'#6ab3d4','opacity=".75"');
 }
 if(ipCurve.length)svg+='<path d="'+toPath(ipCurve)+'" stroke="#97bdf2" fill="none" stroke-width="1.5" stroke-dasharray="5 4"/>';
 for(const q of ipNodes)svg+='<circle cx="'+x(q.strike)+'" cy="'+y(100*q.iv)+'" r="2.8" fill="#97bdf2"/>';
 if(iv)svg+='<path class="s9-cvi" d="'+toPath(curve)+'" stroke="#dcdaca" fill="none" stroke-width="2.1"/>';
 for(const q of p){
   const v=iv?(Number.isFinite(q.sourceIV)?100*q.sourceIV:NaN):q.fit-q.mid;
   if(Number.isFinite(v))svg+='<circle class="s9-market" cx="'+x(q.K)+'" cy="'+y(v)+'" r="'+(W<440?1.9:2.25)+'" fill="'+(iv?'#88cce6':'#dcdaca')+'" stroke="#071727" stroke-width=".6"/>';
 }
 svg+='<line id="'+id+'Cross" y1="'+T+'" y2="'+B+'" stroke="#c4dbfb" opacity=".68" stroke-dasharray="2 4"/><circle id="'+id+'Dot" r="3.6" fill="#071727" stroke="#dcdaca" stroke-width="1.7"/></g>';
 chart.innerHTML='<svg font-family="Consolas" role="img" aria-label="'+(iv?'Smile CVI e IV dei mid':'Scarti di premio e limiti bid/ask')+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'+svg+'</svg>';
 const img=chart.querySelector('svg'),move=e=>{
   const b=img.getBoundingClientRect();if(!b.width)return;
   const k=lo+(((e.clientX-b.left)*W/b.width)-L)*(hi-lo)/width;
   read(ch,closest(p,k));
 };
 img.onpointermove=move;img.onpointerdown=move;
 const slider=$(id+'Slider');slider.max=String(p.length-1);slider.disabled=false;
 $(id+'Central').disabled=false;$(id+'Full').disabled=false;
 $(id+'Central').setAttribute('aria-pressed',String(ch.range==='central'));$(id+'Full').setAttribute('aria-pressed',String(ch.range==='full'));
 $(id+'Coverage').textContent=(ch.range==='central'&&!s.hasCentre?'Centro con meno di 2 strike · intervallo completo · ':'')+p.length+' / '+s.points.length+' bilaterali · K '+strike(lo)+'–'+strike(hi);
 if(ch===skew){$('sk9IppoLegend').hidden=!ipCurve.length;$('sk9IppoLegend').textContent=ippo?.variant==='desk'?'IPPO · IV ATM':'IPPO · replica';}
 read(ch,closest(p,Number.isFinite(ch.selected)?ch.selected:c.F));return true;
}
function refresh() {
 if(active!=='monitor')return;
 const s=getSnapshot();
 if(!s){
   const stale=root.Desk?.state?.stale;
   clear(stale?'Da ricalcolare':'Mark sospeso');
   $('monProfile').textContent=stale?'Profilo CVI selezionato':root.Desk?.state?.result?.errors?.ws||'Nessun mark disponibile allo snapshot.';
   return;
 }
 const {c,w}=s,m=c.marks.market;
 $('monMark').setAttribute('data-state','ok');$('monMark').textContent='Mark verificato';
 $('monProfile').textContent=c.marks.profile==='CVI_WING_MID_BOX_1'?'CVI Ali ponderate':'CVI Desk';
 $('monBilateral').textContent=m.inside+' / '+m.bilateral;$('monOneSide').textContent=m.sidedInside+' / '+m.unilateral;
 $('monRMSE').textContent=fmt(m.rmse,5)+' pt';$('monFwd').textContent=fmt(c.F);$('monATM').textContent=fmt(w.ivATM*100,3)+'%';draw(monitor);
}
function renderSkew(){
 if(getSnapshot())return draw(skew);
 resetChart(skew);$('sk9IppoLegend').hidden=true;return false;
}
function open(id) {
 active=id;$('qtWorkArea').classList.toggle('m8-home',id==='monitor');
 if(id==='monitor')refresh();
 if(id==='smile'&&getSnapshot())draw(skew);
}
for(const ch of [monitor,skew]){
 const id=ch.prefix;
 $(id+'Central').onclick=()=>{ch.range='central';draw(ch);};
 $(id+'Full').onclick=()=>{ch.range='full';draw(ch);};
 $(id+'Slider').oninput=()=>read(ch,Number($(id+'Slider').value));
 const onSize=()=>{
   if(active!==ch.view||!getSnapshot())return;
   const b=$(ch.host).getBoundingClientRect();
   if(b.width>0&&b.height>0&&ch.signature!==[b.width,b.height].join('|'))draw(ch);
 };
 if(typeof root.ResizeObserver==='function')new root.ResizeObserver(onSize).observe($(ch.host));
 else root.addEventListener('resize',onSize);
}
for(const [id,t] of [['monCrash','crash'],['monLevels','levels'],['monAudit','audit']])$(id).onclick=()=>root.Desk.tab(t);
function switchMode(m) {
 monitor.measure=m;const iv=m==='iv';$('monSmile').setAttribute('aria-pressed',String(iv));$('monResiduals').setAttribute('aria-pressed',String(!iv));
 $('monChartNote').textContent=iv?'Volatilità implicita annualizzata per strike SPX':'Premio CVI meno mid · punti SPX';
 $('monLegendModel').textContent=iv?'Mark CVI':'Scarto CVI − mid';$('monLegendMid').textContent=iv?'IV dei mid':'Intervallo bid/ask';
 $('monLegendMid').setAttribute('data-mode',m);$('monLegendModel').setAttribute('data-mode',m);draw(monitor);
}
$('monSmile').onclick=()=>switchMode('iv');$('monResiduals').onclick=()=>switchMode('res');
root.CVIDeskMonitor={open,clear,refresh,renderSkew};refresh();
})(globalThis);
