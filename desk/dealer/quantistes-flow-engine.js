(function(root){
'use strict';
const $=id=>document.getElementById(id), F=Number.isFinite;
const fmt=(v,n=2)=>F(v)?Number(v).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const fmtInt=v=>F(v)?Math.round(v).toLocaleString('it-IT'):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','&quot;':'&quot;','"':'&quot;'}[c]||'&#39;'));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const state={data:null,source:null,mode:'sample-mapped',t:167,panel:'ops',hover:{},playing:false,timer:null,ready:false,baseline:6070,target:7323.63,basis:0,expiry:'ALL',lastResult:null,autocalc:false,manual:false};
const COLORS={bg:'#091c2e',grid:'#29445e',text:'#aec3d7',gold:'#87b5ff',cyan:'#99deff',red:'#f5efde',green:'#99deff',muted:'#598eca'};
const offsetDays=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
const addDays=(a,d)=>new Date(Date.parse(a+'T00:00:00Z')+d*86400000).toISOString().slice(0,10);
function identity(data){return data?.sourceDates?.gamma&&data?.sourceDates?.chain?`${data.sourceDates.gamma} → ${data.sourceDates.chain} · SIMULAZIONE`: 'DATA NON SINCRONIZZATA';}
function explainTime(){return state.data?.times?.[state.t]??'—';}
function mapPrice(p){return p*state.target/state.baseline;}
function unmapPrice(p){return p*state.baseline/state.target;}
function chainInfo(){const r=root.Desk?.state?.result;return r&&!root.Desk?.state?.stale ? r:null;}
function mapExpiry(original){const reference=state.data?.sourceDates?.positional||'2025-01-02';return addDays('2026-11-18',offsetDays(original,reference));}
function table(headers,rows){return `<table class="flow-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>cell&&typeof cell==='object'&&cell.html!=null?`<td class="${esc(cell.class||'')}">${cell.html}</td>`:`<td>${esc(cell??'—')}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="12">Nessun dato valido</td></tr>'}</tbody></table>`;}
function cell(v,cls='num'){return {html:esc(String(v)),class:cls};}
async function gunzipBase64(b64){
  if(typeof DecompressionStream==='undefined')throw Error('Browser senza supporto gzip. Usa Chrome/Edge recenti.');
  const binary=atob(b64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
function parsePlainCSV(raw){
 const lines=String(raw).replace(/^\uFEFF/,'').trim().split(/\r?\n/),heads=lines.shift().split(',').map(z=>z.trim());
 return {heads,rows:lines.map(row=>row.split(',')).filter(r=>r.length===heads.length)};
}
function parsedMatrix(raw,kind,filename=''){
 const parsed=root.CVIData?.csv?root.CVIData.csv(raw):null;
 const {heads,rows}=parsed?{heads:parsed[0]||[],rows:parsed.slice(1)}:parsePlainCSV(raw);
 const idx=name=>heads.findIndex(h=>h.trim().replace(/^\uFEFF/,'')===name);
 const ci=idx('sim_datetime'),pi=idx('price'),vi=idx('value');
 if([ci,pi,vi].some(x=>x<0))throw Error('CSV gamma/charm · colonne richieste sim_datetime, price, value.');
 const entries=[],timesSet=new Set(),prices=new Set(),dates=new Set(),zones=new Set();
 const timePattern=/^(?:(\d{4}-\d{2}-\d{2})[ T])?([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/;
 for(const row of rows){
   if(row.every(v=>!String(v).trim()))continue;
   const dt=timePattern.exec(String(row[ci]||'').trim()),sv=String(row[vi]??'').trim(),sp=String(row[pi]??'').trim();
   const value=Number(sv),spot=Number(sp);
   if(!dt||!sv||!sp||!F(value)||!F(spot)||spot<=0)throw Error('La griglia contiene data, prezzo o valore non valido.');
   if(dt[1]){
     const stamp=Date.parse(dt[1]+'T00:00:00Z');
     if(!F(stamp)||new Date(stamp).toISOString().slice(0,10)!==dt[1])throw Error('Data di proiezione non valida.');
   }
   dates.add(dt[1]||'');zones.add(dt[6]||'');
   const fraction=(dt[5]||'').replace(/0+$/,'').replace(/\.$/,'');
   const time=dt[2]+':'+dt[3]+':'+(dt[4]||'00')+fraction;
   entries.push([time,spot,value]);timesSet.add(time);prices.add(spot);
 }
 if(dates.size>1||zones.size>1)throw Error('Carica una proiezione per seduta, con un solo fuso orario.');
 const times=[...timesSet].sort(),spots=[...prices].sort((a,b)=>a-b);
 if(!times.length||!spots.length||times.length*spots.length>5e6)throw Error('Dimensioni gamma/charm non supportate.');
 const ti=new Map(times.map((v,i)=>[v,i])),xi=new Map(spots.map((v,i)=>[v,i]));
 const matrix=Array(times.length*spots.length).fill(null);
 for(const [time,spot,value] of entries){
   const i=ti.get(time)*spots.length+xi.get(spot);
   if(matrix[i]!==null)throw Error('Coordinata tempo/prezzo duplicata nel CSV.');
   matrix[i]=value;
 }
 if(matrix.includes(null))throw Error('Griglia non rettangolare. Mancano alcuni punti tempo/prezzo.');
 let date=[...dates][0]||null;
 if(!date){
   const fileDate=/^daily_(?:gamma|charm)_(\d{4})(\d{2})(\d{2})(?:\.csv)$/i.exec(filename);
   if(fileDate){
     const candidate=fileDate.slice(1).join('-'),ms=Date.parse(candidate+'T00:00:00Z');
     if(F(ms)&&new Date(ms).toISOString().slice(0,10)===candidate)date=candidate;
   }
 }
 return {times,spots,values:matrix,kind,date,zone:[...zones][0]||'',name:filename};
}
function withMatrix(previous,a){
 const gamma=a.kind==='gamma',other=gamma?'charm':'gamma',date=previous.sourceDates?.[other];
 const sameGrid=a.times.length===previous.times.length&&a.spots.length===previous.spots.length&&
   a.times.every((v,i)=>v===previous.times[i])&&a.spots.every((v,i)=>v===previous.spots[i]);
 const coeval=sameGrid&&!!a.date&&a.date===date&&a.zone===(previous.matrixImports?.[other]?.zone||'');
 const bothUndated=sameGrid&&!a.date&&!date&&previous.matrixImports?.[other]&&a.zone===previous.matrixImports[other].zone;
 const matrixImports={...previous.matrixImports,[a.kind]:{name:a.name,date:a.date,zone:a.zone}};
 const sourceDates={...previous.sourceDates,[a.kind]:a.date},source={...previous.source,[a.kind]:a.name};
 const next={...previous,sourceDates,source,matrixImports,pairConfirmed:coeval,times:a.times,spots:a.spots,[a.kind]:a.values,checksum:{...previous.checksum}};
 delete next.checksum[a.kind];
 if(!coeval&&!bothUndated){next[other]=[];delete matrixImports[other];delete sourceDates[other];delete source[other];delete next.checksum[other];}
 return next;
}

function parsedPos(raw){
 const d=parsePlainCSV(raw),get=(row,name)=>row[d.heads.indexOf(name)],required=['option_symbol','call_put_flag','strike_price','expiration_date','mm_posn','broker_posn','firm_posn','procust_posn','nonprocust_posn','total_customers_posn'];
 if(required.some(x=>!d.heads.includes(x)))throw Error('CSV positional: colonne incomplete.');
 return d.rows.map(row=>[
 get(row,'option_symbol'), get(row,'call_put_flag'),+get(row,'strike_price'),get(row,'expiration_date'),
 ...['mm_posn','broker_posn','firm_posn','procust_posn','nonprocust_posn','total_customers_posn'].map(name=>Number(get(row,name)))
 ]).filter(row=>row.slice(2).every((v,i)=>i===1||F(v)));
}
const pendingImports=new Map();
async function importFile(file,kind){
 if(!file)return;
 const request=(pendingImports.get(kind)||0)+1;pendingImports.set(kind,request);
 try{
  if(file.size>25e6)throw Error('File troppo grande (>25 MB).');
  const raw=await file.text();if(pendingImports.get(kind)!==request)return;if(!state.data)throw Error('Sample non disponibile: ricarica la pagina.');
  if(kind==='gamma'||kind==='charm'){
   const a=parsedMatrix(raw,kind,file.name);
   state.data=withMatrix(state.data,a);
   state.t=state.data.times.length-1;
   root.DeskFields?.nativeUpdate(state.data,state.t,true,'flow-overview');
  }else if(kind==='pos')state.data={...state.data,pos:parsedPos(raw)};

  state.mode='manual-illustrative';state.manual=true;$(kind==='pos'?'flowPosFile':kind==='gamma'?'flowGammaFile':'flowCharmFile').value='';
  reloadExpiry();render();
 }catch(error){setStatus('ERRORE IMPORT: '+error.message,'error');}
}
function setStatus(message,type='info'){
 const e=$('flowStatePill'); if(e)e.textContent=message;
 const pill=document.querySelector('#view-flows .flow-led');if(pill)pill.style.borderColor=type==='error'?'#a1afb5':'#87b5ff';
}
function currentVectors(){
 const d=state.data;if(!d)return null;
 const n=d.spots.length,offset=state.t*n;
 return {times:d.times,spots:d.spots,gamma:d.gamma.slice(offset,offset+n),charm:d.charm.slice(offset,offset+n)};
}
function sampleAt(xs,ys,x){
 if(!xs?.length||ys?.length!==xs.length||!F(x)||x<xs[0]||x>xs.at(-1))return null;
 if(xs.length===1)return F(ys[0])?ys[0]:null;
 let lo=0,hi=xs.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(xs[m]<x)lo=m;else hi=m;}
 const z=(x-xs[lo])/(xs[hi]-xs[lo]);return ys[lo]*(1-z)+ys[hi]*z;
}
function scenarioValue(kind,target){const v=currentVectors();return v?sampleAt(v.spots,v[kind],unmapPrice(target)):null;}
function median(a){const b=a.filter(F).slice().sort((x,y)=>x-y);return b.length?b[Math.floor((b.length-1)/2)]:null;}
function quant(a,q){const v=a.filter(F).slice().sort((x,y)=>x-y);if(!v.length)return null;const k=clamp((v.length-1)*q,0,v.length-1),i=Math.floor(k),j=Math.min(v.length-1,i+1);return v[i]*(1-(k-i))+v[j]*(k-i);}
function crossings(xs,ys){const out=[];for(let i=1;i<xs.length;i++){const a=ys[i-1],b=ys[i];if(!F(a)||!F(b))continue;if(a===0)out.push(xs[i-1]);else if(a*b<0)out.push(xs[i-1]+(xs[i]-xs[i-1])*(-a)/(b-a));}return out;}
function localPeaks(xs,ys,n=5){const peaks=[];for(let i=1;i<ys.length-1;i++){const a=Math.abs(ys[i-1]),b=Math.abs(ys[i]),c=Math.abs(ys[i+1]);if(b>=a&&b>=c)peaks.push({x:xs[i],v:ys[i]});}return peaks.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,n);}
function cliffs(xs,ys,n=4){const a=[];for(let i=1;i<xs.length;i++){const derivative=(ys[i]-ys[i-1])/(mapPrice(xs[i])-mapPrice(xs[i-1]));if(F(derivative))a.push({x:(xs[i]+xs[i-1])/2,v:derivative});}return a.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,n);}
function positions(){const d=state.data;if(!d)return [];return d.pos.filter(row=>state.expiry==='ALL'||row[3]===state.expiry);}
function groupPositions(rows){const d=new Map();for(const row of rows){const key=row[2],curr=d.get(key)||{strike:key,mm:0,custom:0,b:0,firm:0,pro:0,nonpro:0,calls:0,puts:0};curr.mm+=row[4];curr.b+=row[5];curr.firm+=row[6];curr.pro+=row[7];curr.nonpro+=row[8];curr.custom+=row[9];if(row[1]==='C')curr.calls+=row[4];else curr.puts+=row[4];d.set(key,curr);}return [...d.values()].sort((a,b)=>a.strike-b.strike);}
function hhi(rows){const abs=rows.map(r=>Math.abs(r.mm)),sum=abs.reduce((a,b)=>a+b,0);return sum?abs.reduce((a,b)=>a+(b/sum)**2,0):null;}
function sizeCanvas(id,height){const canvas=$(id);if(!canvas)return null;
 const parent=canvas.parentElement,rect=parent.getBoundingClientRect();const width=Math.max(200,rect.width-4);height=height||Number(canvas.getAttribute('height'))||280;
 const dpr=Math.min(2,root.devicePixelRatio||1);const w=Math.round(width*dpr),h=Math.round(height*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext('2d',{alpha:false});ctx.setTransform(dpr,0,0,dpr,0,0);return {canvas,ctx,w:width,h:height,dpr};
}
function setupPlot(id,H){const info=sizeCanvas(id,H);if(!info)return null;const {ctx,w,h}=info;ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,w,h);return info;}
function drawLine(id,xRaw,y,opts={}){
 const p=setupPlot(id,290);if(!p||!xRaw||!y||xRaw.length<2)return;
 const {ctx,w,h}=p,{hoverIdx=null,highlight=null,selected=state.target,label=''}=opts;
 const x=xRaw.map(mapPrice),lo=x[0],hi=x.at(-1);const vals=y.filter(F);if(!vals.length)return;
 let mn=Math.min(0,...vals),mx=Math.max(0,...vals),pad=Math.max((mx-mn)*.08,Math.abs(mx)*.015,.2);mn-=pad;mx+=pad;
 const L=58,R=w-18,T=18,B=h-35,X=v=>L+(v-lo)/(hi-lo)*(R-L),Y=v=>B-(v-mn)/(mx-mn)*(B-T);
 ctx.lineWidth=1;ctx.font='10px Consolas';ctx.strokeStyle=COLORS.grid;ctx.fillStyle=COLORS.text;
 for(let i=0;i<=5;i++){let v=mn+(mx-mn)*i/5,yp=Y(v);ctx.beginPath();ctx.moveTo(L,yp);ctx.lineTo(R,yp);ctx.stroke();ctx.textAlign='right';ctx.fillText(fmt(v,1),L-8,yp+4);}
 for(let i=0;i<=4;i++){const xp=L+(R-L)*i/4;ctx.beginPath();ctx.moveTo(xp,T);ctx.lineTo(xp,B);ctx.stroke();ctx.textAlign='center';ctx.fillText(fmt(lo+(hi-lo)*i/4,0),xp,B+16);}
 ctx.beginPath();y.forEach((v,i)=>{const px=X(x[i]),py=Y(v);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.lineWidth=2;ctx.strokeStyle=opts.color||COLORS.gold;ctx.stroke();
 if(mn<0&&mx>0){ctx.setLineDash([4,4]);ctx.strokeStyle='#bbcee0';ctx.beginPath();ctx.moveTo(L,Y(0));ctx.lineTo(R,Y(0));ctx.stroke();ctx.setLineDash([]);}
 if(selected>=lo&&selected<=hi){ctx.setLineDash([5,4]);ctx.strokeStyle=COLORS.cyan;ctx.beginPath();ctx.moveTo(X(selected),T);ctx.lineTo(X(selected),B);ctx.stroke();ctx.setLineDash([]);}
 if(hoverIdx!=null){const i=clamp(hoverIdx,0,x.length-1);ctx.strokeStyle='#f1e7ce';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(X(x[i]),T);ctx.lineTo(X(x[i]),B);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=opts.color||COLORS.gold;ctx.beginPath();ctx.arc(X(x[i]),Y(y[i]),4,0,Math.PI*2);ctx.fill();}
 p.canvas.onpointermove=e=>{const box=p.canvas.getBoundingClientRect();let px=(e.clientX-box.left)*w/box.width;const idx=clamp(Math.round((clamp(px,L,R)-L)/(R-L)*(x.length-1)),0,x.length-1);state.hover[id]=idx;drawLine(id,xRaw,y,{...opts,hoverIdx:idx});if($(id==='flowGammaPlot'?'flowGammaRead':'flowCharmRead'))$(id==='flowGammaPlot'?'flowGammaRead':'flowCharmRead').textContent=`${label} · SPX ${fmt(x[idx],2)} · ${fmt(y[idx],5)} unità native · ES indicativo ${fmt(x[idx]+state.basis,2)} (basis manuale)`;};
 p.canvas.onpointerleave=()=>{state.hover[id]=null;drawLine(id,xRaw,y,{...opts,hoverIdx:null});};
}
function heatColor(v,m){const t=clamp(v/Math.max(m,1e-6),-1,1);const a=Math.abs(t),end=t<0?[245,239,222]:[153,222,255],base=[15,37,58];return 'rgb('+base.map((c,i)=>Math.round(c+(end[i]-c)*a)).join(',')+')';}
function drawHeat(){const d=state.data;if(!d)return;const p=setupPlot('flowHeatmap',310);if(!p)return;const {ctx,w,h}=p;const {times,spots,gamma}=d;
 if(!gamma?.length||times.length<2||spots.length<2){
  ctx.fillStyle=COLORS.text;ctx.font='12px Consolas';
  const caption=!gamma?.length?'In attesa della proiezione gamma':'Per il valore disponibile consulta il profilo della greca.';
  ctx.fillText(caption,15,32);$('flowHeatRead').textContent=caption;
  const canvas=$('flowHeatmap');if(canvas){canvas.onpointermove=null;canvas.onclick=null;}return;
 }
 const L=58,R=w-12,T=20,B=h-38,X=i=>L+(R-L)*i/(times.length-1),Y=j=>B-(B-T)*j/(spots.length-1);const dx=(R-L)/(times.length-1),dy=(B-T)/(spots.length-1);
 const m=quant(gamma.map(Math.abs),.98)||1;
 for(let ti=0;ti<times.length;ti++)for(let si=0;si<spots.length;si++){ctx.fillStyle=heatColor(gamma[ti*spots.length+si],m);ctx.fillRect(X(ti)-dx/2,Y(si)-dy/2,dx+1,dy+1);}
 ctx.fillStyle=COLORS.text;ctx.font='10px Consolas';
 for(let i=0;i<6;i++){const t=Math.floor((times.length-1)*i/5);ctx.textAlign='center';ctx.fillText(times[t].slice(0,5),X(t),h-18);}
 for(let i=0;i<5;i++){const j=Math.floor((spots.length-1)*i/4);ctx.textAlign='right';ctx.fillText(fmt(mapPrice(spots[j]),0),L-7,Y(j)+4);}
 ctx.beginPath();ctx.moveTo(X(state.t),T);ctx.lineTo(X(state.t),B);ctx.strokeStyle='#e2decb';ctx.lineWidth=1.5;ctx.stroke();
 const selectedUnmap=unmapPrice(state.target);if(selectedUnmap>=spots[0]&&selectedUnmap<=spots.at(-1)){const j=(selectedUnmap-spots[0])/(spots.at(-1)-spots[0])*(spots.length-1);ctx.beginPath();ctx.moveTo(L,Y(j));ctx.lineTo(R,Y(j));ctx.strokeStyle='#7ec4e1';ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);}
 p.canvas.onpointermove=e=>{const box=p.canvas.getBoundingClientRect(),px=(e.clientX-box.left)*w/box.width,py=(e.clientY-box.top)*h/box.height,ti=Math.floor(clamp((px-L)/(R-L),0,1)*(times.length-1)),j=Math.floor((1-clamp((py-T)/(B-T),0,1))*(spots.length-1)),v=gamma[ti*spots.length+j];$('flowHeatRead').textContent=`SAMPLE ${times[ti]} · SPX demo ${fmt(mapPrice(spots[j]),2)} · gamma value ${fmt(v,5)} · tempo di simulazione, NON quotazione 2026.`;};
 p.canvas.onclick=e=>{const box=p.canvas.getBoundingClientRect();state.t=Math.round(clamp(((e.clientX-box.left)*w/box.width-L)/(R-L),0,1)*(times.length-1));$('flowTime').value=String(state.t);render();};
}
function drawPos(){const rows=groupPositions(positions()),p=setupPlot('flowPosPlot',350);if(!p||!rows.length)return;const {ctx,w,h}=p;const width=.09*state.target,selected=rows.filter(r=>Math.abs(mapPrice(r.strike)-state.target)<width).sort((a,b)=>a.strike-b.strike);const a=selected.length?selected:rows.slice(-65),kmin=mapPrice(a[0].strike),kmax=mapPrice(a.at(-1).strike);const {mmMax,customMax}={mmMax:Math.max(1,...a.map(r=>Math.abs(r.mm))),customMax:Math.max(1,...a.map(r=>Math.abs(r.custom)))};const L=57,R=w-16,T=26,B=h-39,M=(T+B)/2,X=x=>L+(x-kmin)/(Math.max(1,kmax-kmin))*(R-L),scale=(B-T)*.39/Math.max(mmMax,customMax);
 ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,M);ctx.lineTo(R,M);ctx.stroke();ctx.font='10px Consolas';ctx.fillStyle=COLORS.text;
 for(let i=0;i<=5;i++){const x=L+(R-L)*i/5;ctx.textAlign='center';ctx.fillText(fmt(kmin+(kmax-kmin)*i/5,0),x,h-18);}
 const barw=Math.max(1,Math.min(7,(R-L)/a.length*.4));for(const r of a){const x=X(mapPrice(r.strike));const mmY=M-r.mm*scale,cuY=M-r.custom*scale;ctx.strokeStyle=COLORS.gold;ctx.lineWidth=barw;ctx.beginPath();ctx.moveTo(x,M);ctx.lineTo(x,mmY);ctx.stroke();ctx.strokeStyle=COLORS.cyan;ctx.lineWidth=barw*.42;ctx.beginPath();ctx.moveTo(x+barw*.48,M);ctx.lineTo(x+barw*.48,cuY);ctx.stroke();}
 const at=X(state.target);if(at>=L&&at<=R){ctx.strokeStyle='#ebe3cd';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(at,T);ctx.lineTo(at,B);ctx.stroke();ctx.setLineDash([]);}
 p.canvas.onpointermove=e=>{const box=p.canvas.getBoundingClientRect(),x=(e.clientX-box.left)*w/box.width,K=kmin+clamp((x-L)/(R-L),0,1)*(kmax-kmin);const row=a.reduce((u,v)=>Math.abs(mapPrice(u.strike)-K)<Math.abs(mapPrice(v.strike)-K)?u:v);$('flowPosRead').textContent=`Strike source ${fmt(row.strike,0)} → demo ${fmt(mapPrice(row.strike),2)} · MM ${fmtInt(row.mm)} · clienti ${fmtInt(row.custom)} · call MM ${fmtInt(row.calls)} · put MM ${fmtInt(row.puts)}`;};
}
function drawHedge(){const v=currentVectors();if(!v)return;const spots=v.spots.map(mapPrice),g=v.gamma,c=v.charm;const p=setupPlot('flowHedgePlot',310);if(!p)return;const {ctx,w,h}=p;
 if(c.length!==spots.length||g.length!==spots.length||(state.data.matrixImports&&!state.data.pairConfirmed)){ctx.fillStyle=COLORS.text;ctx.font='12px Consolas';ctx.fillText('In attesa di gamma e charm coevi',18,36);$('flowHedgeRead').textContent='Per combinare gamma e charm carica le due griglie della stessa seduta.';return;}
 const ds=Number($('flowShock')?.value)||0,elapsed=Number($('flowElapsed')?.value)||0;
 const ga=quant(g.map(Math.abs),.95)||1,ca=quant(c.map(Math.abs),.95)||1;
 const pressure=g.map((x,i)=>-(x/ga)*(ds/.01/100)-.45*(c[i]/ca)*(elapsed/6.5));
 const L=50,R=w-18,T=22,B=h-39,max=Math.max(.05,...pressure.map(x=>Math.abs(x))),Y=y=>T+(B-T)/2-y/max*(B-T)*.41,X=i=>L+(R-L)*i/(spots.length-1);
 ctx.strokeStyle=COLORS.grid;ctx.fillStyle=COLORS.text;ctx.font='10px Consolas';for(let j=0;j<=4;j++){const v=-max+max*j/2,y=Y(v);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.fillText(fmt(v,2),6,y+3);}
 ctx.beginPath();pressure.forEach((v,i)=>i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));ctx.strokeStyle=COLORS.cyan;ctx.lineWidth=2;ctx.stroke();
 for(let i=0;i<=4;i++){const j=Math.floor((spots.length-1)*i/4);ctx.fillText(fmt(spots[j],0),X(j)-15,h-15);}
 const a=sampleAt(spots,pressure,state.target);
 $('flowHedgeRead').textContent=`Scenario: ΔSPX ${fmt(ds,2)}% · Δtempo ${fmt(elapsed,2)} h · indice di response presso riferimento ${fmt(a,4)}. Adimensionale, non dealer hedge in USD.`;
}
function kpiAndTopology(){const v=currentVectors();if(!v)return;const x=v.spots.map(mapPrice),g=v.gamma,c=v.charm,gRef=sampleAt(x,g,state.target),cRef=sampleAt(x,c,state.target),pos=positions(),net=pos.reduce((s,r)=>s+r[4],0);
 $('flowKpiGamma').textContent=fmt(gRef,3);$('flowKpiCharm').textContent=fmt(cRef,3);
 $('flowKpiGammaText').textContent=!g.length?'Gamma coevo in attesa':gRef==null?'Fuori dominio scenario':'Gamma scenario · unità vendor ignota';$('flowKpiCharmText').textContent=!c.length?'Charm coevo in attesa':cRef==null?'Fuori dominio scenario':'Charm scenario · unità vendor ignota';
 $('flowKpiDomain').textContent=`${fmt(x[0],0)}–${fmt(x.at(-1),0)}`;$('flowKpiPosition').textContent=fmtInt(net);
 if($('flowGammaLegend'))$('flowGammaLegend').textContent=`${fmt(Math.min(...g),0)} → ${fmt(Math.max(...g),0)} (unità source)`;
 if($('flowCharmLegend'))$('flowCharmLegend').textContent=`${fmt(Math.min(...c),0)} → ${fmt(Math.max(...c),0)} (unità source)`;
 const gs=crossings(x,g),cs=crossings(x,c),gp=localPeaks(v.spots,g,3),cp=localPeaks(v.spots,c,3),cl=cliffs(v.spots,g,3);
 const nearestLevels=(arr)=>arr.length ? arr.slice().sort((a,b)=>Math.abs(a-state.target)-Math.abs(b-state.target)).slice(0,4).sort((a,b)=>a-b).map(k=>fmt(k,1)).join(' · ')+(arr.length>4?' · +'+(arr.length-4):'') : 'nessuno';
 const rows=[];
 rows.push(['Gamma flip (scenario)',nearestLevels(gs),gs.length?gs.length+' crossing osservati; mostrati i 4 più vicini':'Non si forza un gamma flip']);
 rows.push(['Charm zero (scenario)',nearestLevels(cs),cs.length+' crossing; non prova hedge flow']);
 rows.push(['Gamma peaks',gp.map(a=>fmt(mapPrice(a.x),1)).join(' · '),gp.map(a=>fmt(a.v,1)).join(' · ')]);
 rows.push(['Charm hotspots',cp.map(a=>fmt(mapPrice(a.x),1)).join(' · '),cp.map(a=>fmt(a.v,1)).join(' · ')]);
 rows.push(['Gamma cliffs',cl.map(a=>fmt(mapPrice(a.x),1)).join(' · '),cl.map(a=>fmt(a.v,2)).join(' · ')+' unità/SPX pt']);
 const abs=g.map(Math.abs),H=abs.reduce((s,val)=>s+val,0),hhi=H?abs.reduce((s,v)=>s+(v/H)**2,0):null;
 rows.push(['HHI scenario gamma',fmt(hhi,5),`N effettivo ${fmt(hhi?1/hhi:null,1)} campioni · non posizioni`]);
 $('flowTopology').innerHTML=table(['METRICA','PREZZO SPX DEMO / VALORE','NOTA OPERATIVA'],rows);
 root.DeskFields?.nativeUpdate(state.data,state.t,false,'flow-overview');
}
function levelCandidates(){const r=chainInfo(),out=[];
 if(!r)return out;
 for(const [label,key] of [['IPPO','ippo'],['WALL STREET','ws']]){
  for(const l of (r[key]?.levels||[])){
   if(!F(l.price)||!F(l.z)||Math.abs(l.z)>2.5||l.z===0)continue;
   out.push({family:label,price:l.price,z:l.z,tail:l.tail||''});
  }
 }
 return out.sort((a,b)=>a.price-b.price);
}
function levelRows(limit=18){const levels=levelCandidates(),v=currentVectors();if(!v)return [];
 return levels.slice(0,limit).map(l=>{const g=scenarioValue('gamma',l.price),c=scenarioValue('charm',l.price),dist=(l.price/state.target-1)*100;
  return [l.family,fmt(l.z,1)+'σ',cell(fmt(l.price,2),'num gold'),cell(fmt(l.price+state.basis,2),'num'),cell(fmt(dist,2)+'%','num'),cell(fmt(g,3),'num '+(g>=0?'green':'red')),cell(fmt(c,3),'num '+(c>=0?'cyan':'red')),g===null?'FUORI DOMINIO':'CAMPIONE DEMO'];
 });}
function drawLevels(){const r=chainInfo();$('flowLevelsMeta').textContent=r?`CVI LIVE · ${fmt(r.cfg.settlement,2)} SPX · ${levelCandidates().length} livelli`:'carica all7 e calcola i livelli';$('flowLevels').innerHTML=r?table(['FAMIGLIA','Z','SPX','ES*','Δ SPX %','GAMMA SAMPLE','CHARM SAMPLE','STATO'],levelRows(30)):
  '<div class="flow-method-note">In attesa del fitting CVI: premi “CARICA DEMO COMPLETA” o importa all7 nel desk, poi “Calcola livelli”. I flussi si vedono anche senza la skew.</div>';
}
function drawPositions(){const pos=positions();if(!pos.length)return;const a=groupPositions(pos),net=pos.reduce((s,r)=>s+r[4],0),gross=pos.reduce((s,r)=>s+Math.abs(r[4]),0),top=a.reduce((m,r)=>!m||Math.abs(r.mm)>Math.abs(m.mm)?r:m,null);
 $('flowPosNet').textContent=fmtInt(net);$('flowPosGross').textContent=fmtInt(gross);$('flowPosHHI').textContent=fmt(hhi(a),4);$('flowPosTop').textContent=fmt(top?mapPrice(top.strike):null,2);
 drawPos();drawGreekInventory();const byExp=new Map();for(const r of pos){const a=byExp.get(r[3])||{n:0,net:0,gross:0,calls:0,puts:0};a.n++;a.net+=r[4];a.gross+=Math.abs(r[4]);if(r[1]==='C')a.calls+=r[4];else a.puts+=r[4];byExp.set(r[3],a);}
 $('flowExpiries').innerHTML=table(['EXPIRY SOURCE','EXPIRY DEMO','CONTRATTI','MM NET','MM GROSS','CALL / PUT'],[...byExp].sort((a,b)=>a[0].localeCompare(b[0])).map(([e,z])=>[e,mapExpiry(e),z.n,cell(fmtInt(z.net)),cell(fmtInt(z.gross)),fmtInt(z.calls)+' / '+fmtInt(z.puts)]));
 $('flowPositionsTable').innerHTML=table(['STRIKE SOURCE','SPX DEMO','MM NET','MM CALL','MM PUT','CLIENTI','BROKER','FIRM','PROCUST','NONPROCUST'],a.slice().sort((u,v)=>Math.abs(v.mm)-Math.abs(u.mm)).slice(0,20).map(z=>[fmt(z.strike,0),cell(fmt(mapPrice(z.strike),2),'num gold'),cell(fmtInt(z.mm),'num '+(z.mm>=0?'green':'red')),cell(fmtInt(z.calls)),cell(fmtInt(z.puts)),cell(fmtInt(z.custom),'num cyan'),cell(fmtInt(z.b)),cell(fmtInt(z.firm)),cell(fmtInt(z.pro)),cell(fmtInt(z.nonpro))]));
}
function optionGreekBook(){
 const d=state.data; if(!d) return null;
 if(d._greeksBook) return d._greeksBook;
 const lines=d.chainRaw.trim().split(/\r?\n/),head=lines.shift().replace(/"/g,'').split(','),idx=name=>head.indexOf(name);
 const book={CALL:[],PUT:[]},name=['gamma','vanna','charm','delta'];
 for(const line of lines){
  const cells=line.replace(/"/g,'').split(','),side=cells[idx('right')],strike=+cells[idx('strike')],bid=+cells[idx('bid')],ask=+cells[idx('ask')];
  if(!book[side]||!(strike>0)||!(ask>=bid))continue;
  const row={K:strike}; for(const field of name)row[field]=+cells[idx(field)];
  if(!name.every(key=>F(row[key])))continue;book[side].push(row);
 }
 for(const arr of Object.values(book))arr.sort((a,b)=>a.K-b.K);
 d._greeksBook=book;return book;
}
function interpGreek(side,K){
 const arr=optionGreekBook()?.[side];if(!arr||arr.length<2||!(K>=arr[0].K&&K<=arr.at(-1).K))return null;
 let l=0,h=arr.length-1;while(h-l>1){const m=(l+h)>>1;if(arr[m].K<K)l=m;else h=m;}
 const L=arr[l],H=arr[h]; if(H.K-L.K>35)return null;
 const w=(K-L.K)/(H.K-L.K||1),out={};for(const f of ['gamma','vanna','charm','delta'])out[f]=L[f]*(1-w)+H[f]*w;
 return out;
}
function greekInventoryProxy(){
 if(!state.data)return null;
 const effective=state.data.sourceDates.positional||'2025-01-02',targetExpiry=state.data.chainExpiry||'2026-11-19';
 const relevant=state.data.pos.filter(row=>addDays('2026-11-18',offsetDays(row[3],effective))===targetExpiry),grossSource=relevant.reduce((a,r)=>a+Math.abs(r[4]),0);
 const linked=[];
 for(const row of relevant){const K=mapPrice(row[2]),side=row[1]==='C'?'CALL':'PUT',g=interpGreek(side,K);if(!g)continue;
  linked.push({sourceK:row[2],demoK:K,side,mm:row[4],...g,expoGamma:row[4]*g.gamma,expoVanna:row[4]*g.vanna,expoCharm:row[4]*g.charm});}
 const sum=f=>linked.reduce((a,r)=>a+r[f],0),matchedGross=linked.reduce((a,r)=>a+Math.abs(r.mm),0),g=sum('expoGamma');
 const shock=0.01*state.target;
 return {eligible:relevant.length,matched:linked.length,matchedGross,grossSource,gammaPerPt:g,vannaRaw:sum('expoVanna'),charmRaw:sum('expoCharm'),esEquiv1pct:-g*shock*2,rows:linked};
}
function drawGreekInventory(){
 const box=$('flowGreekExposureKpis'),tablebox=$('flowGreekExposureTable');if(!box||!tablebox)return;
 const a=greekInventoryProxy();if(!a)return;
 const card=(k,v,t)=>`<div class="flow-kpi"><small>${esc(k)}</small><strong>${esc(v)}</strong><span>${esc(t)}</span></div>`;
 box.innerHTML=card('MATCH 1DTE',a.matched+'/'+a.eligible,'righe MM con greche interpolate')+
 card('GAMMA × MM',fmt(a.gammaPerPt,3),'Σ mm_posn × Gamma / pt SPX')+
 card('ES EQ. ±1%*',fmtInt(a.esEquiv1pct),'equivalente nozionale in ES')+
 card('CONTRATTI COPERTI',fmt(a.grossSource?100*a.matchedGross/a.grossSource:null,1)+'%','quota |MM| matched dalla catena');
 const rows=a.rows.slice().sort((x,y)=>Math.abs(y.expoGamma)-Math.abs(x.expoGamma)).slice(0,20).map(r=>[fmt(r.sourceK,0),cell(fmt(r.demoK,2),'num gold'),r.side,cell(fmtInt(r.mm)),cell(fmt(r.gamma,6)),cell(fmt(r.expoGamma,3),'num '+(r.expoGamma>=0?'green':'red')),cell(fmt(r.expoVanna,2)),cell(fmt(r.expoCharm,2))]);
 tablebox.innerHTML=table(['K SOURCE','K DEMO','SIDE','MM CONTRACTS','GAMMA all7','MM × GAMMA','MM × VANNA¹','MM × CHARM¹'],rows);
}
function drawGreeks(){const d=state.data;if(!d)return;const ci=d.chainSummary;if(!ci){$('flowGreeks').textContent='Nessuna chain greche.';return;}
 const rows=ci.map(x=>[x.name,x.n,cell(fmt(x.median,5)),cell(fmt(x.q10,5)),cell(fmt(x.q90,5)),x.scope]);$('flowGreeks').innerHTML=table(['GRECA','N','MEDIANA','P10','P90','CONVENZIONE'],rows);
}
function prepareChain(){const d=state.data;if(!d||d.chainSummary)return;
 const lines=d.chainRaw.trim().split(/\r?\n/),headers=lines.shift().replace(/"/g,'').split(','),col=key=>headers.indexOf(key),result=[];
 for(const row of lines){const cells=row.replace(/"/g,'').split(','),strike=+cells[col('strike')],spot=+cells[col('underlying_price')];if(!F(strike)||!F(spot)||Math.abs(strike/spot-1)>.016)continue;
 const ask=+cells[col('ask')],bid=+cells[col('bid')];if(!(ask>=bid&&ask>0))continue;result.push(cells);}
 d.chainSummary=['gamma','delta','vega','vanna','charm','speed','color','zomma','vomma','ultima','theta'].map(name=>{
  const vals=result.map(row=>+row[col(name)]).filter(F);return {name,n:vals.length,median:median(vals),q10:quant(vals,.1),q90:quant(vals,.9),scope:'ThetaData greca grezza'};
 });
}
function coverage(){if(!$('flowCoverage'))return;const entries=[
 ['M17','Greeks / tensori','DEMO PARZIALE','Greek-weighted MM inventory 1DTE a scadenza coincidente: solo join illustrativo fra vintage incompatibili'],
 ['M18','Dealer topology','DEMO','Gamma/charm scenario e MM by strike, zero crossings e HHI separati'],
 ['M20','Surface innovation','NON IDENTIFICABILE','Singola chain all7, nessuna sequenza CVI a cutoff comparabili'],
 ['M21','Hedge response','SCENARIO','Indice gamma/charm normalizzato; USD hedge/backlog senza convenzioni non disponibili'],
 ['M23','Lifecycle expiry','PARZIALE','Posizioni per 5 expiry e distanza al fixing; nessuna migrazione reale di inventario'],
 ['M24','Robustezza dealer','PARZIALE','Parametri shock/tempo e sensibilità al ribasamento disponibili, non posterior calibrato'],
 ['M25–31','Meccanismi systematic & capital','NON OSSERVATO','Mancano capital flows, 13F/ETF, buybacks, volatilità realizzata e risk balances'],
 ['M32–35','Regimi e misura fisica P','NON CALIBRATO','Mancano serie causali/realizzate e procedure di stima Q→P'],
 ['M36–38','Physical paths / first passage','SCENARIO CONDIZIONATO','Bridge Q terminale + pesi gamma/charm; touch e target-first parametrizzati, non P validata'],
 ['M39–42','Forecasting e model governance','NON CALIBRATO','Mancano target storici / training cronologico / out-of-sample score'],
 ['M43–44','Playbook e decision engine','DIAGNOSTICO','Condizioni e invalidazioni esplicitate; utility/fills/edge non stimati'],
 ['M45','Scoreboard','CONTESTO','Scenari di copertura associati ai livelli e alle date delle sorgenti'],
 ];
 $('flowCoverage').innerHTML=table(['MODULO','OGGETTO','STATO','VINCOLO IN INPUT'],entries);
}
function hedgeLedger(){const v=currentVectors(),gr=positions();if(!v)return;
 const reference=state.target,deltaS=Number($('flowShock').value)/100*reference,deltaT=Number($('flowElapsed').value),g=scenarioValue('gamma',reference),c=scenarioValue('charm',reference);
 const ga=quant(v.gamma.map(Math.abs),.95)||1,ca=quant(v.charm.map(Math.abs),.95)||1;
 const gN=F(g)?g/ga:NaN, cN=F(c)?c/ca:NaN;
 const rows=[
 ['ΔS (spot)',fmt(deltaS,2)+' pt SPX', 'ΔS = shock × riferimento'],
 ['Γ sample',fmt(g,5)+' unità', 'Scenario gamma; units unknown'],
 ['Charm sample',fmt(c,5)+' unità', 'Scenario charm; units unknown'],
 ['γ normalizzata',fmt(gN,4), 'Γ / percentile 95% |Γ| griglia'],
 ['χ normalizzata',fmt(cN,4), 'Charm / percentile 95% |Charm| griglia'],
 ['Response indice',fmt(state.data.matrixImports&&!state.data.pairConfirmed?NaN:-(gN)*(deltaS/reference/.01)-.45*cN*deltaT/6.5,4), 'Sensibilità, non contratti / USD'],
 ['MM positional',fmtInt(gr.reduce((s,r)=>s+r[4],0)), 'Contratti 2025, strike rimappati'],
 ['Vanna inventory', '—', 'Mancano esposizioni vanna native sincronizzate'],
 ['Hedge backlog', '—', 'Mancano target ed eseguiti intraday'],
 ];$('flowHedgeLedger').innerHTML=table(['FATTORE','VALORE','DEFINIZIONE / LIMITE'],rows);
 drawHedge();coverage();
}
function scoreModels(){return root.InstitutionalDesk?.frame?.()||null;}
function makeHelp(){
 const sections=[
 ['Fonti e orario','Seleziona i flussi dealer e la chain opzioni. Nel replay dimostrativo i flussi del 2025 sono riportati sulla scala di prezzo della chain del 2026. Le date delle fonti restano distinte. Per una lettura osservata servono prezzi e flussi contemporanei.'],
 ['Greche, unità e segnali','Delta è ∂V/∂S, Gamma = ∂²V/∂S², Vanna = ∂²V/(∂S∂σ) e Charm = ∂²V/(∂S∂t). Le greche in all7 sono snapshot di contratto, non un ledger di dealer. Il campo value dei file daily_gamma e daily_charm non riporta le unità né la convenzione time-to-expiry; non attribuirgli USD/1% o futures contracts. Una proiezione del delta dealer in USD richiede mm_posn per contratto ed esatta Greek corrispondente, più contratto, valuta e moltiplicatore validati.'],
 ['La geometria non è una singola linea','La curva gamma/charm dei CSV è una funzione dello scenario spot, non un histogram per strike. Usa il replay temporale e muovi il cursore per vedere come cambia nel tempo. Un flip è un attraversamento reale dello zero; se la curva resta positiva, il sistema mostra “nessuno”. Un hotspot è un massimo assoluto locale, un cliff è la derivata numerica rispetto al prezzo; nessuno è automaticamente un supporto/resistenza su ES. La tabella posizionale ha invece ascissa strike_price ed è mantenuta indipendente.'],
 ['Innovazione della superficie','Una variazione di IV o dei parametri CVI è “innovazione” soltanto dopo aver controllato il cambiamento di spot, forward, tempo, eventi e coordinate. Servono almeno più snapshot CVI correttamente comparabili. all7 contiene un solo snapshot e non permette una regressione flow-to-vol né un’elasticità di supply stimata: questa componente resta non calibrata.'],
 ['Gamma, Charm e risposta dell’hedge','In teoria l’hedge target è H=−Δ_dealer. Per perturbazioni piccole ΔH≈−Γ_dealer ΔS−Vanna_dealer Δσ−Charm_dealer Δt, usando tutte le unità coerenti. Il pannello mostra invece un indice normalizzato di sensibilità calcolato sui campi gamma/charm del sample. Usa gli slider shock e tempo per esplorare il profilo, ma non confonderlo con acquisti/vendite realmente richiesti ai dealer. Il backlog è H_target−H_eseguito e non è osservabile qui.'],
 ['Expiry lifecycle e robustezza','Il ledger ha scadenze originali 2, 3, 6, 7 e 8 gennaio 2025. Nel demo preserviamo le distanze in giorni dalla data iniziale e le mappiamo sulla data all7. La selezione per expiry modifica solo il filtro MM, non trasforma il CSV 2025 in inventario 2026. Ripeti gli scenari modificando ancora, shock, tempo e basis: le risposte troppo sensibili alla convenzione devono essere contrassegnate come fragili.'],
 ['Gamma walls, HHI, center of mass','Gli hotspot di gamma sono massimi locali in scenario spot; le massime posizioni MM sono strike del ledger. HHI è Σ(|MM_K|/Σ|MM|)² e N_eff=1/HHI: misurano concentrazione, non previsione di mercato. Le percentuali delta, “gamma notional” e buyer/seller pressure non sono fornite come unità verificabili in questi Sample e non vengono presentate in USD.'],
 ['Distribuzione Q contro P e first passage','I livelli IPPO e Wall Street e le Q terminali possono essere calcolati da all7 con la piattaforma CVI. Per ottenere P(up), P(touch) o P(target prima dello stop), occorrono campioni storici point-in-time e un generatore di sentieri calibrato con verifica out-of-sample. Una probabilità terminale Q non coincide con una probabilità fisica e non identifica un evento intraday di primo passaggio. La scoreboard non inventa questi valori.'],
 ['Scoreboard ES','La scoreboard mostra la frequenza degli eventi sui soli dati precedenti all’origine, i payoff in tick e la verifica a origine mobile. Il posizionamento e i livelli accompagnano la lettura con fonte e orario.'],
 ['Lettura dei livelli sul future ES','Seleziona un livello IPPO o Wall Street. Verifica che rientri nel dominio gamma e charm, poi osserva la concentrazione delle posizioni. Per riportare il livello su ES usa un basis rilevato allo stesso orario. La scoreboard espone le frequenze storiche del setup.'],
 ];
 $('flowHelpContent').innerHTML=sections.map(([h,p],i)=>`<section><h3>${esc(h)}</h3><p>${esc(p)}</p></section>`).join('')+`<section><h3>Esposizioni e probabilità</h3><div class="flow-formula">Position concentration: HHI = Σ (|MM_K| / Σ|MM_K|)²\nGamma flip: solve Γ_scenario(S*) = 0 within observed domain\nHedge target: H(S,σ,t) = −Δ_dealer(S,σ,t)\nHedge response: ΔH ≈ −Γ ΔS − Vanna Δσ − Charm Δt\nScoreboard action: READY only if P, utility, fills and freshness validated.</div><p>Il termine Charm è qui definito rispetto al tempo di calendario crescente; la convenzione derivata rispetto al time-to-expiry ne invertirebbe il segno. I campi gamma/charm del sample non dichiarano queste convenzioni: non usarli in una formula di hedge monetario senza verificarne la documentazione.</p></section>`;
}
function reloadExpiry(){if(!state.data)return;const options=['ALL',...new Set(state.data.pos.map(r=>r[3]))].sort();const s=$('flowExpiry'),prior=state.expiry;s.innerHTML=options.map(e=>`<option value="${esc(e)}">${e==='ALL'?'Tutte le scadenze · sample':e+' → '+mapExpiry(e)+' (demo)'}</option>`).join('');state.expiry=options.includes(prior)?prior:'ALL';s.value=state.expiry;}
function render(){if(!state.data||!state.ready)return;
 const d=state.data;state.t=clamp(state.t,0,d.times.length-1);
 $('flowTime').max=String(d.times.length-1);$('flowTime').value=String(state.t);$('flowTimeLabel').textContent=d.times[state.t];
 state.baseline=Number($('flowBaseAnchor').value)||6070;state.target=Number($('flowTargetAnchor').value)||7323.63;state.basis=Number($('flowBasis').value)||0;
 $('flowAsOf').textContent=d.matrixImports?'PROIEZIONE CSV · '+(d.sourceDates.gamma||d.sourceDates.charm||'data non dichiarata')+' · '+d.times[state.t]:`GAMMA/CHARM ${d.sourceDates.gamma} · ${d.times[state.t]} → DEMO ${d.demoDate}`;
 setStatus(d.matrixImports?'PROIEZIONE CSV · SPX':state.manual?'POSIZIONI CSV · CAMPI DI ARCHIVIO':'SAMPLE 2025 → DEMO 2026');
 if(state.panel==='overview'){kpiAndTopology();drawHeat();drawLevels();}
 if(state.panel==='position'){drawPositions();prepareChain();drawGreeks();}
 if(state.panel==='hedge')hedgeLedger();
 if(state.panel==='paths')root.FlowProbability?.refresh?.();
}
function refresh(){if(!state.ready)return;render();scoreModels();}
function exportScore(){const button=$('deskExport');if(button)button.click();}
async function loadDemoChain(){if(!state.data||state.autocalc)return;state.autocalc=true;
 try{
  const input=$('csvFile'),csv=state.data.chainRaw,file=new File([csv],'all7_demo_integrato.csv',{type:'text/csv'}),dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  setStatus('ALL7 IMPORT · CALIBRAZIONE CVI');
  const started=Date.now();const awaitImport=()=>new Promise((resolve,reject)=>{const id=setInterval(()=>{
    if(root.Desk?.state?.parsed?.rows?.length && root.Desk.state.files?.some(f=>f.name==='all7_demo_integrato.csv')){clearInterval(id);resolve();}
    else if(Date.now()-started>12000){clearInterval(id);reject(Error('Importazione all7 non confermata. Usa il pulsante Calcola livelli nel desk.'));}
  },120);});await awaitImport();
  const sett=$('settlement');if(sett)sett.value=String(state.data.targetAnchor);
  await root.Desk.calculate();
  state.panel='ops';document.querySelectorAll('[data-flow-panel]').forEach(a=>a.classList.toggle('on',a.dataset.flowPanel==='ops'));
  for(const x of ['ops','overview','position','hedge','paths','method'])$('flow-panel-'+x).classList.toggle('active',x==='ops');
  setStatus('ALL7 + FLOW DEMO PRONTA');root.Desk.tab('flows');
  if($('terminalSidebar')?.hidden===false) $('qtCloseParams')?.click();
  refresh();
 }catch(e){setStatus('IMPORT ALL7: '+e.message,'error');}finally{state.autocalc=false;}
}
function bind(){
 $('flowDemoBtn').onclick=loadDemoChain;$('flowRefreshBtn').onclick=refresh;
 for(const [id,kind] of [['flowGammaFile','gamma'],['flowCharmFile','charm'],['flowPosFile','pos']])$(id).onchange=e=>importFile(e.target.files?.[0],kind);
 for(const id of ['flowBaseAnchor','flowTargetAnchor','flowBasis','flowExpiry','flowTime','flowShock','flowElapsed'])$(id).addEventListener('input',()=>{
   if(id==='flowTime')state.t=Number($(id).value);
   if(id==='flowExpiry')state.expiry=$(id).value;
   if(id==='flowShock')$('flowShockLabel').textContent=fmt(Number($(id).value),2)+'%';
   if(id==='flowElapsed')$('flowElapsedLabel').textContent=fmt(Number($(id).value),2)+' h';
   render();
 });
 const tabs=document.querySelectorAll('[data-flow-panel]');tabs.forEach(tab=>tab.onclick=()=>{
   state.panel=tab.dataset.flowPanel;
   tabs.forEach(a=>a.classList.toggle('on',a===tab));
   for(const x of ['ops','overview','position','hedge','paths','method'])$('flow-panel-'+x).classList.toggle('active',x===state.panel);
   render();
 });
 $('flowPlay').onclick=()=>{if(state.timer){clearInterval(state.timer);state.timer=null;state.playing=false;$('flowPlay').textContent='PLAY';return;}
  state.playing=true;$('flowPlay').textContent='PAUSE';state.timer=setInterval(()=>{state.t=(state.t+1)%state.data.times.length;render();},200);};
 
 root.addEventListener('resize',()=>{if($('view-flows')?.classList.contains('active'))render();});
 root.setInterval(()=>{const r=chainInfo();if(r!==state.lastResult){state.lastResult=r;if(state.ready)refresh();}},1300);
}
async function init(){
 try{
  const tag=$('quantistes-flow-embedded');if(!tag)throw Error('Dataset sample incorporato mancante');
  const json=await gunzipBase64(tag.textContent.trim());state.data=JSON.parse(json);state.source=state.data;
  if(state.data.gamma.length!==state.data.times.length*state.data.spots.length||state.data.charm.length!==state.data.gamma.length)throw Error('Checksum dimensionale della superficie flow non valido');
  state.t=state.data.times.length-1;state.ready=true;
  state.target=state.data.targetAnchor||7323.63;state.baseline=state.data.sourceAnchor||6070;
  $('flowBaseAnchor').value=String(state.baseline);$('flowTargetAnchor').value=String(state.target);
  prepareChain();reloadExpiry();makeHelp();bind();render();scoreModels();
  root.FlowDesk=Object.freeze({fieldArchive:()=>state.data,sampleProjection:()=>state.source,metadata:()=>({dates:{...state.data?.sourceDates},time:explainTime(),mapping:state.mode}),refresh,scoreModels,loadDemoChain,scenarioSnapshot:()=>{const v=currentVectors(),r=chainInfo();return v&&state.ready&&(!state.data.matrixImports||state.data.pairConfirmed)&&v.gamma.length===v.spots.length&&v.charm.length===v.spots.length?{spots:v.spots.map(mapPrice),gamma:v.gamma.slice(),charm:v.charm.slice(),reference:state.target,basis:state.basis,time:explainTime(),sourceDates:{...state.data.sourceDates},sourceAnchor:state.baseline,positions:state.data.pos.map(row=>row.slice()),result:r,levels:levelCandidates(),mappingType:state.mode}:null;},stats:()=>({ready:state.ready,times:state.data?.times.length,spots:state.data?.spots.length,positions:state.data?.pos.length,selectedTime:explainTime(),sourceDates:state.data?.sourceDates,levels:levelCandidates().length,scoreboard:'BLOCKED'})});
 }catch(e){setStatus('FLOW ENGINE ERROR: '+e.message,'error');console.error('FlowDesk initialization',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
