(function(w){
'use strict';
const $=id=>document.getElementById(id), cl=(x,a,b)=>Math.min(b,Math.max(a,x)), fmt=(x,d=2)=>Number.isFinite(x)?x.toLocaleString('it-IT',{maximumFractionDigits:d,minimumFractionDigits:d}):'—', pc=x=>fmt(x*100,1)+'%', escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lilac='#baa4ed',coral='#ec929b',mint='#7dd6b4',ivory='#eeece1';
const arr=(n,fn)=>Array.from({length:n},(_,i)=>fn(i)),clock=min=>String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
const traces=new WeakMap();function curve(x,y,name,color,more={}){return {type:'scatter',mode:'lines',x,y,name,line:{color,width:2.4},connectgaps:false,hovertemplate:name+' · %{y:,.5g}<extra></extra>',...more};}
const axis=s=>({title:{text:s,standoff:15},automargin:true,showspikes:true,spikemode:'across',spikesnap:'cursor',spikethickness:1,spikedash:'dot',showline:true});
function attachProbe(host,series,xName,yName,read){
 if(!host||!series?.length)return;host.tabIndex=0;host.setAttribute('aria-label',xName+' / '+yName+'. Frecce per scorrere i dati, spazio per fissare il cursore.');
 const next={series,xName,yName,read,fixed:false,point:0};host._studioProbe=next;if(host._studioProbeBound)return;host._studioProbeBound=true;
 function show(px,py){
  const p=host._studioProbe,l=host._fullLayout,ax=l?.xaxis,ay=l?.yaxis;if(!ax?.p2d||!ay?.p2d)return;
  const L=ax._offset,R=L+ax._length,T=ay._offset,B=T+ay._length;if(px<L||px>R||py<T||py>B)return hide();
  let overlay=host.querySelector('.st-cross');if(!overlay){overlay=document.createElement('div');overlay.className='st-cross';overlay.setAttribute('aria-hidden','true');overlay.innerHTML='<i></i><b></b>';host.appendChild(overlay);}
  overlay.hidden=false;const v=overlay.firstElementChild,h=overlay.lastElementChild;v.style.cssText='left:'+px+'px;top:'+T+'px;height:'+(B-T)+'px';h.style.cssText='left:'+L+'px;top:'+py+'px;width:'+(R-L)+'px';
  const x=ax.p2d(px-L),y=ay.p2d(py-T),rows=[];
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  for(const a of p.series){const xs=a.x,ys=a.y;if(!xs?.length||x<xs[0]||x>xs[xs.length-1])continue;
   let lo=0,hi=xs.length-1;while(hi-lo>1){const m=(hi+lo)>>1;if(xs[m]<x)lo=m;else hi=m;}const j=Math.abs(xs[lo]-x)<=Math.abs(xs[hi]-x)?lo:hi;
   if(a===p.series[0])p.point=j;if(Number.isFinite(ys[j]))rows.push({name:a.name,val:ys[j],distance:Math.abs(ys[j]-y),x:xs[j]});
  }
  if(p.series.length>12)rows.sort((a,b)=>a.distance-b.distance);
  const out=$(p.read);if(out)out.textContent=p.xName+' '+fmt(x,2)+' · cursore '+fmt(y,Math.abs(y)<.1?6:2)+' / '+p.yName+' · '+rows.slice(0,6).map(r=>r.name+' '+fmt(r.val,Math.abs(r.val)<.1?6:2)).join(' · ');
 }
 function hide(){const o=host.querySelector('.st-cross');if(o)o.hidden=true;}
 const coords=e=>{const b=host.getBoundingClientRect();return [(e.clientX-b.left)*host.clientWidth/b.width,(e.clientY-b.top)*host.clientHeight/b.height];};
 host.addEventListener('pointermove',e=>{if(!host._studioProbe.fixed)show(...coords(e));});
 host.addEventListener('pointerleave',()=>{if(!host._studioProbe.fixed)hide();});
 let down=null;host.addEventListener('pointerdown',e=>{down=coords(e);});
 host.addEventListener('pointerup',e=>{const at=coords(e);if(down&&Math.hypot(at[0]-down[0],at[1]-down[1])<4&&e.button===0&&!e.target.closest('.modebar')){const p=host._studioProbe;p.fixed=!p.fixed;if(p.fixed)show(...at);}down=null;});
 host.addEventListener('keydown',e=>{const p=host._studioProbe,l=host._fullLayout;if(e.key==='Escape'){p.fixed=false;hide();return;}if(e.key===' '){e.preventDefault();p.fixed=!p.fixed;return;}if(!['ArrowLeft','ArrowRight'].includes(e.key)||!l?.xaxis)return;e.preventDefault();const s=p.series[0],i=cl((p.point||0)+(e.key==='ArrowLeft'?-1:1),0,s.x.length-1);p.point=i;if(Number.isFinite(s.y[i]))show(l.xaxis._offset+l.xaxis.d2p(s.x[i]),l.yaxis._offset+l.yaxis.d2p(s.y[i]));});
}

function graph(id,obj,getTraces,xName,yName,read,extra={}){
 const host=$(id);if(!host||!w.Plotly||!host.getClientRects().length||host.clientWidth<50)return;
 if(traces.get(host)===obj&&host.classList.contains('js-plotly-plot'))return;traces.set(host,obj);
 const series=getTraces(),reader=$(read),small=host.clientWidth<540;
 const layout={height:id==='fpPaths'||id==='faFanCanvas'?495:402,margin:{l:72,r:22,t:28,b:small?106:90},xaxis:axis(xName),yaxis:axis(yName),showlegend:true,legend:{orientation:'h',x:0,y:-.25,yanchor:'top',font:{size:11}},hovermode:'x unified',hoverdistance:100,spikedistance:-1,dragmode:'zoom',uirevision:id,hoverlabel:{namelength:-1},...extra};
 const p=w.Plotly.react(host,series,layout,{displaylogo:false,responsive:true,scrollZoom:true});
 Promise.resolve(p).then(()=>{if(traces.get(host)!==obj)return;attachProbe(host,series,xName,yName,read);if(host._deskHover)host.removeListener?.('plotly_hover',host._deskHover);
 const fn=e=>{if(host._studioProbe?.fixed||host.querySelector('.st-cross:not([hidden])'))return;const pts=e.points||[],a=pts[0];if(!a||!reader)return;reader.textContent=xName+' '+fmt(+a.x,2)+'  /  '+pts.slice(0,6).map(z=>z.data.name+' '+fmt(z.y,Math.abs(z.y)<.03?6:2)).join('   ·   ');};host._deskHover=fn;host.on?.('plotly_hover',fn);}).catch(e=>{traces.delete(host);if(reader)reader.textContent=e.message;});
}
function flowPlot(id,r,d){
 const xname='Prezzo terminale SPX',frac='Orizzonte trascorso (%)';
 if(id==='fpDensity'){return graph(id,r,()=>[curve(d.x,d.qD,'Q',lilac,{fill:'tozeroy',fillcolor:'rgba(164,198,245,.13)'}),curve(d.x,d.fD,'R_flow',coral)],xname,'Densità per punto','fpDensityRead');}
 if(id==='fpCDF'){const q=r.Q,lo=q.quantile(.005),hi=q.quantile(.995);
 return graph(id,r,()=>{const x=arr(701,i=>lo+(hi-lo)*i/700),sorted=r.records.map((z,i)=>[z.terminal,r.weights[i]]).sort((a,b)=>a[0]-b[0]);let j=0,mass=0;const weighted=x.map(k=>{while(j<sorted.length&&sorted[j][0]<=k)mass+=sorted[j++][1];return mass;});return [curve(x,x.map(k=>q.cdf(k)),'Q',lilac),curve(x,weighted,'R_flow',coral,{line:{color:coral,width:2,shape:'hv'}})];},xname,'Massa cumulata','fpCDFRead',{yaxis:{...axis('Probabilità cumulata'),tickformat:'.0%',range:[0,1]}});}
 if(id==='fpPaths'){return graph(id,r,()=>{const series=[];for(const [label,paths,color] of [['Q-bridge',r.basePlots||[],lilac],['R_flow',r.plots||[],coral]]){
   const n=Math.min(36,paths.length);for(let j=0;j<n;j++){const index=n<2?0:Math.round(j*(paths.length-1)/(n-1)),y=Array.from(paths[index]),x=arr(y.length,k=>100*k/(y.length-1));series.push(curve(x,y,label+' #'+(index+1),color,{opacity:.43,legendgroup:label,showlegend:j===0,line:{color,width:1.15},hovertemplate:label+' #'+(index+1)+'<br>%{x:.1f}% · SPX %{y:,.2f}<extra></extra>'}));}}
   for(const [name,value,color] of [['Target',r.params.target,mint],['Stop',r.params.stop,coral]])series.push(curve([0,100],[value,value],name,color,{line:{color,width:1.3,dash:'dash'}}));return series;},frac,'Prezzo SPX','fpPathsRead',{hovermode:'closest'});}
 if(id==='faQuantCanvas'){const a=r.quantiles,x=a.map(p=>p.p*100);return graph(id,r,()=>[curve(x,a.map(p=>p.q),'Q CVI',lilac),curve(x,a.map(p=>p.flow),'Q + Δ ponderazione',coral,{customdata:a.map(p=>[p.qMC,p.flowMC,p.commonRandomShift]),hovertemplate:'%{x:.1f}° · SPX %{y:.2f}<br>Q MC %{customdata[0]:.2f} · R_flow MC %{customdata[1]:.2f}<br>Δ %{customdata[2]:+.2f} pt<extra></extra>'})],'Percentile terminale (%)','Strike SPX','faQuantRead');}
 if(id==='faLiftCanvas'){const a=r.lift;return graph(id,r,()=>[curve(a.map(p=>p.x),a.map(p=>Number.isFinite(p.ratio)?p.ratio:null),'R_flow / Q',coral,{mode:'lines+markers',marker:{size:4},customdata:a.map(p=>[p.q,p.flow]),hovertemplate:'SPX %{x:.2f} · rapporto %{y:.3f}×<br>Q %{customdata[0]:.6f} · R_flow %{customdata[1]:.6f}<extra></extra>'})],xname,'Rapporto delle densità','faLiftRead',{shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:1,y1:1,line:{color:ivory,width:1,dash:'dot'}}]});}
 if(id==='faFanCanvas'){const a=r.fan,x=a.map(p=>100*p.fr);return graph(id,r,()=>{const ts=[];for(const [n,k,color] of [['Q','Q',lilac],['R_flow','flow',coral]]){
  for(const [j,label] of [[0,'P05'],[4,'P95'],[1,'P25'],[3,'P75'],[2,'P50']])ts.push(curve(x,a.map(p=>p[k][j]),n+' '+label,color,{showlegend:j===2,legendgroup:n,fill:j===4||j===3?'tonexty':'none',fillcolor:n==='Q'?'rgba(164,198,245,.10)':'rgba(245,239,222,.10)',line:{color,width:j===2?2.8:.65},hovertemplate:n+' '+label+' %{y:.2f}<extra></extra>'}));}
  return ts;},frac,'Prezzo SPX','faFanRead',{shapes:[[r.r.params.target,mint],[r.r.params.stop,coral]].map(([v,color])=>({type:'line',xref:'paper',x0:0,x1:1,y0:v,y1:v,line:{color,dash:'dot',width:1}}))});}
}
function densityMesh(sel,h,bottom,top,X,Y){
 const rows=44,cols=Math.min(h+1,145),dx=754/(cols-1||1),dy=(Y(bottom)-Y(top))/rows,step=(top-bottom)/rows,counts=arr(cols,()=>new Uint32Array(rows)),outside=arr(cols,()=>[0,0]);
 const minute=j=>Math.round(h*j/(cols-1||1));
 for(let j=0;j<cols;j++){const t=minute(j);for(const s of sel){const v=s.values[t];if(v<bottom){outside[j][0]++;continue;}if(v>top){outside[j][1]++;continue;}counts[j][Math.min(rows-1,Math.floor((v-bottom)/step))]++;}}
 const buckets=['#1b344b','#24485e','#2c6172','#397b84','#519695','#78b4aa','#afd1bc','#f0e6c9'],paths=Array(8).fill('');let svg='';
 for(let j=0;j<cols;j++){const t=minute(j);for(let k=0;k<rows;k++){const n=counts[j][k];if(!n)continue;const p=n/sel.length,bin=Math.min(7,Math.max(0,Math.floor(Math.log2(1+255*p))));const x=Math.max(58,X(t)-dx/2),end=Math.min(812,X(t)+dx/2);paths[bin]+='M'+x.toFixed(1)+' '+(Y(bottom+(k+1)*step)).toFixed(1)+'h'+Math.max(0,end-x+.12).toFixed(1)+'v'+(dy+.1).toFixed(1)+'H'+x.toFixed(1)+'Z';}}
 for(let k=0;k<8;k++)svg+='<path fill="'+buckets[k]+'" d="'+paths[k]+'"/>';
 const last=counts.at(-1),max=Math.max(1,...last);for(let k=0;k<rows;k++)if(last[k])svg+='<rect x="828" y="'+Y(bottom+(k+1)*step).toFixed(1)+'" width="'+(78*last[k]/max).toFixed(1)+'" height="'+Math.max(1,dy-1).toFixed(1)+'" fill="'+lilac+'" opacity=".8"/>';
 svg+='<text x="828" y="14">T+'+h+' min</text><text x="828" y="369">0</text><text x="908" y="369" text-anchor="end">'+pc(max/sel.length)+'</text>';
 return {svg,counts,outside,bottom,top,step,minute,cols,rows,base:sel.length};
}
function cell(ev,svg,ctx,xy,i){
 if(!ctx.mesh||ctx.ev)return;const m=ctx.mesh,yy=xy.y;if(yy<27||yy>342)return;
 const v=m.bottom+(342-yy)*(m.top-m.bottom)/315,k=cl(Math.floor((v-m.bottom)/m.step),0,m.rows-1),j=cl(Math.round(i*(m.cols-1)/ctx.h),0,m.cols-1);
 const n=m.counts[j][k],now=m.minute(j),a=m.bottom+k*m.step,b=a+m.step;
 const marker=$('deskHorizontal');if(marker){marker.setAttribute('y1',yy);marker.setAttribute('y2',yy);marker.style.display='';}
 const out=$('deskCellData');if(out)out.textContent='T+'+now+'m · Δ ES '+fmt(a)+' a '+fmt(b)+' pt · '+n+'/'+m.base+' sedute ('+pc(n/m.base)+') · oltre la scala '+m.outside[j].reduce((x,y)=>x+y,0)+'.';
}
function registry(){
 const dyn=$('dxTable')?.closest('article'),fixed=$('qpTable')?.closest('article');if(!dyn||!fixed||$('stRegHome'))return;
 const parent=dyn.parentElement,physical=fixed.parentElement,wrap=document.createElement('section');wrap.id='stRegHome';wrap.className='dx-wide';const bar=document.createElement('header');bar.className='studio-sectionhead';bar.innerHTML='<h2>Registro probabilità per strike</h2><label>Origine <select id="stRegistryClock"><option value="dynamic">Cutoff dinamico</option><option value="fixed">09:45 ET</option></select></label>';wrap.append(bar);parent.insertBefore(wrap,dyn);const link=document.createElement('button');link.type='button';link.className='st-reglink';link.textContent='Apri il registro per strike · 09:45 ET ↗';physical.insertBefore(link,fixed);wrap.append(dyn,fixed);
 const change=v=>{dyn.hidden=v!=='dynamic';fixed.hidden=v!=='fixed';if(v==='fixed')w.QuantistesPhysical?.refreshRegistry?.();};$('stRegistryClock').onchange=e=>change(e.target.value);change('dynamic');link.onclick=()=>{w.QuantistesFlatDesk?.go('path','dynamic-p');$('stRegistryClock').value='fixed';change('fixed');requestAnimationFrame(()=>wrap.scrollIntoView({block:'start'}));};
}
function fileUI(){
 const host=$('q15ParamsMount');if(!host||$('stDataInputs'))return;
 const el=document.createElement('section');el.id='stDataInputs';el.innerHTML='<h3>Campi firmati e storico playbook</h3><div class="st-input-grid"><label>Greche firmate o eseguiti opzioni · CSV / JSON<input type="file" id="stFlowFile" accept=".csv,.json,text/csv,application/json"></label><button type="button" data-st-template="fields">Tracciato greche ↓</button><button type="button" data-st-template="tape">Tracciato eseguiti ↓</button><label>Osservazioni playbook · JSON<input type="file" id="stPbFile" accept=".json,application/json"></label><button type="button" data-st-template="playbook">Tracciato playbook ↓</button></div><output id="stLoadStatus" aria-live="polite"></output>';host.prepend(el);
 el.onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>32e6)throw Error('Limite 32 MB per file.');const raw=await file.text(),isFlow=e.target.id==='stFlowFile';if(isFlow&&/\.csv$/i.test(file.name)&&/(?:^|[,;\t])"?trade_id"?(?=[,;\t]|$)/i.test(raw.split(/\r?\n/)[0])){const n=w.InstTape.install(w.InstTape.parseCSV(raw));e.target.value='';$('stLoadStatus').textContent=n+' eventi eseguiti importati. Lettura in Options Flow al cutoff della scoreboard.';return;}const obj=isFlow&&/\.csv$/i.test(file.name)?w.DeskFields.parseCSV(raw):JSON.parse(raw),n=isFlow?w.DeskFields.install(obj):w.DeskPlaybooks.set(obj);$('stLoadStatus').textContent=file.name+' · '+n+(isFlow?' serie caricate.':' osservazioni caricate.');w.InstitutionalDesk?.refreshPlaybooks?.();}catch(err){$('stLoadStatus').textContent='Importazione interrotta · '+err.message;}e.target.value='';};
 el.onclick=e=>{const k=e.target.dataset.stTemplate;if(!k)return;if(k==='tape'){const u=URL.createObjectURL(new Blob([w.InstTape.template()],{type:'text/csv'})),a=document.createElement('a');a.href=u;a.download='Quantistes_eseguiti_opzioni.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);return;}const data=k==='fields'?w.DeskFields.template():w.DeskPlaybooks.template();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=data.schema+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
}
function install(){fileUI();registry();document.querySelectorAll('[data-studio-controls]').forEach(el=>{if(el.childElementCount||el.dataset.stReady)return;el.dataset.stReady='1';el.innerHTML=w.DeskFields.controls(el.dataset.studioControls==='surface');});w.DeskFields.refresh();}
function boot(){w.DeskFields.bind();let queued=false;const soon=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});};
 document.addEventListener('click',e=>{if(e.target.closest('.q25-toolbar,.q13-nav,#q15DataButton,[data-q13-view],#q13Demo,.q15-lookup-card')){soon();setTimeout(soon,225);}});
 w.addEventListener('desk:route',soon);w.addEventListener('resize',soon);document.fonts?.ready?.then(soon);
 const mo=new MutationObserver(m=>{if(m.some(z=>[...z.addedNodes].some(n=>n.nodeType===1&&(n.id==='q13App'||n.id==='q15Settings'||n.id==='q16FlowLab'||n.matches?.('[data-studio-controls]')))))soon();});mo.observe(document.body,{childList:true,subtree:true});soon();
}
w.DeskStudio=Object.freeze({flowPlot,densityMesh,cell,install,escape,clock});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})(window);
