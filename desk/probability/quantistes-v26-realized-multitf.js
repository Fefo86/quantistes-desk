

/* QUANTISTES / ES Realized P multi-horizon — UI/analytics layer.
   Reconstruct contiguous observed 1m returns from the same overlapping ES 5m windows.
   One fixed start per historical session, no cross-session stitching or extrapolation. */
(function(w){'use strict';
const $=id=>document.getElementById(id),TICK=.25,START=570,LAST=959;
const durations=[5,10,15,20,30,45,60,90,120,180,240,300,360,'close'];
const Q=[.05,.25,.5,.75,.95],colors={gold:'#efba75',mint:'#79d5b2',red:'#ef96a2',blue:'#88baff',line:'#4d6475',muted:'#b2c3d0',grid:'rgba(123,150,171,.18)',bg:'#0e1924'};
let days=[],visible=false,busy=false,lastStat=null,initDone=false,lastH=30,token=0;
function n(v,d=2){return Number.isFinite(v)?Number(v).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function pct(v,d=1){return Number.isFinite(v)?n(v*100,d)+'%':'—'}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function quant(sorted,p){if(!sorted.length)return NaN;const t=(sorted.length-1)*p,a=Math.floor(t),r=t-a;return sorted[a]*(1-r)+sorted[Math.min(a+1,sorted.length-1)]*r}
function quantSet(a){const s=a.slice().sort((x,y)=>x-y);return Q.map(p=>quant(s,p))}
function parseMinute(t){const a=/^(\d{2}):(\d{2})$/.exec(t||'');if(!a||+a[2]>59)return NaN;const m=60*(+a[1])+(+a[2]);return m>=START&&m<=954?m:NaN}
function timeStr(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function confWilson(k,N){const z=1.96,p=N?k/N:0,c=1+z*z/N,v=z*Math.sqrt(p*(1-p)/N+z*z/(4*N*N)),m=p+z*z/(2*N);return[Math.max(0,(m-v)/c),Math.min(1,(m+v)/c)]}
function indexDaily(){const src=w.Quantistes360?.data?.();if(!src?.rows?.length)return false;
 const groups=new Map();
 for(const r of src.rows){if(!Array.isArray(r)||r.length<10||!r.slice(0,10).every(Number.isFinite)||!Number.isInteger(r[1])||r[1]<START||r[1]>954)continue;let d=groups.get(r[9]);if(!d){d={day:r[9],byMinute:new Map(),rows:[]};groups.set(r[9],d)}d.byMinute.set(r[1],r);d.rows.push(r)}
 days=[];
 for(const g of groups.values()){
  const increments=new Array(LAST).fill(null);
  // Prefer the direct 1m observation; recover absent timestamps from *observed* 2–5m overlapping path points.
  for(const r of g.rows)if(Number.isFinite(r[2]))increments[r[1]]=r[2];
  const conflicted=new Set();let conflicts=0;
  for(const r of g.rows){for(let k=1;k<=5;k++){
   const minute=r[1]+k-1;if(minute>=LAST)break;
   const v=r[k+1]-(k===1?0:r[k]);if(!Number.isFinite(v))continue;
   if(increments[minute]===null)increments[minute]=v;
   else if(increments[minute]!==v){conflicts++;conflicted.add(minute);}
  }}
  // Gaps are tracked explicitly: no window can span a missing minute.
  const prefix=new Float64Array(LAST+1),gaps=new Uint16Array(LAST+1);
  for(let t=START;t<LAST;t++){
   prefix[t+1]=prefix[t]+(increments[t]===null?0:increments[t]);
   gaps[t+1]=gaps[t]+(increments[t]===null||conflicted.has(t)?1:0);
  }
  days.push({date:g.day,byMinute:g.byMinute,prefix,gaps,conflicts});
 }
 days.sort((a,b)=>a.date-b.date);
 return days.length>0;
}
function makeMarkup(){const p=$('qt360-panel-path');if(!p)return false;if($('q26Realized'))return true;
 const el=document.createElement('section');el.id='q26Realized';el.innerHTML=`
 <div class="q26-head"><div><h2>REALIZED P / ES · MULTI-HORIZON</h2><small>Finestre ES reali · partenza ET allineata per seduta · distribuzione fisica osservata</small></div><span class="q26-origin">HISTORICAL ES / 1m OBSERVED</span></div>
 <div class="q26-controls">
 <label>SEDUTA DI RIFERIMENTO<input id="q26Date" type="date" required/></label>
 <label>PARTENZA ET<input id="q26Start" type="time" min="09:30" max="15:54" step="60" value="09:45"/></label>
 <label>ORIZZONTE<select id="q26Horizon">${durations.map(h=>`<option value="${h}" ${h===30?'selected':''}>${h==='close'?'FINO A 15:59 ET':String(h)+' MINUTI'}</option>`).join('')}</select></label>
 <label>VIX DI INGRESSO<input id="q26Vix" type="number" min="6" max="100" step=".1" value="22"/></label>
 <label>VIX ±<input id="q26Band" type="number" min=".1" max="100" step=".5" value="8"/></label>
 <label>PREZZO ES (RIF.)<input id="q26Spot" type="number" min="1" max="99999" step=".25" value="7000"/></label>
 <label>TARGET Δ ES<input id="q26Target" type="number" min="-300" max="300" step=".25" value="4"/></label>
 <button type="button" id="q26Calc">CALCOLA</button>
 </div>
 <div class="q26-stats" aria-live="polite">
 <div class="q26-stat"><small>INTERVALLO TERMINALE 90%</small><strong id="q26Range">—</strong><em>Quantili P05–P95 · punti ES</em></div>
 <div class="q26-stat"><small>PROB. UP / DOWN</small><strong id="q26Direction">—</strong><em id="q26Flat">Movimento nullo —</em></div>
 <div class="q26-stat"><small>PRIMO TOCCO TARGET</small><strong id="q26Touch">—</strong><em id="q26TouchCI">Wilson 95% —</em></div>
 <div class="q26-stat"><small>TERMINALE OLTRE TARGET</small><strong id="q26Terminal">—</strong><em>Separato dal first-touch</em></div>
 <div class="q26-stat"><small>SEDUTE DISTINTE</small><strong id="q26Samples">—</strong><em id="q26Dates">Una osservazione / data ET</em></div>
 </div>
 <output id="q26Passage"></output><div id="q26Graphs"><div class="q26-graph-head"><h3>REALIZED PATH ENSEMBLE / QUANTILE FAN</h3><span id="q26HorizonTitle">—</span></div>
 <div id="q26Fan" class="q26-main-plot"></div>
 <div class="q26-chart-pair"><section><div class="q26-graph-head"><h3>TERMINAL DISTRIBUTION / P</h3><span>Frequenze storiche, non Q</span></div><div id="q26Hist" class="q26-plot"></div></section>
 <section><div class="q26-graph-head"><h3>FIRST TOUCH VS TERMINAL</h3><span>Monitorato sulla griglia a 1 minuto</span></div><div id="q26TouchPlot" class="q26-plot"></div></section></div></div>
 <p id="q26Status" role="status" aria-live="polite">Inizializzazione archivio ES…</p>
 <div class="q26-footer"><span>Una finestra per seduta, precedente alla data di riferimento. Il prezzo ES è un’ancora di scenario. Ultimo timestamp ricostruibile: 15:59 ET. Nessuna interpolazione su gap né estrapolazione al fixing 16:00.</span>
 <button type="button" id="q26Legacy" hidden aria-expanded="false">ESCURSIONI HIGH/LOW · 5 MIN</button></div>
 `;
 p.prepend(el);p.classList.add('q26-enhanced');
 $('q26Date').value=w.InstitutionalDesk?.origin?.()?.date || w.DeskMeasures.dayISO(Math.max(...(w.Quantistes360?.data?.()?.rows||[]).map(r=>r[9])));
 $('q26Vix').value=$('qt360Vix')?.value||'22';
 $('q26Spot').value=$('qt360Spot')?.value||'7000';
 const origTarget=+$('qt360Target')?.value,spot=+$('q26Spot').value;if(Number.isFinite(origTarget)&&Number.isFinite(spot)&&Math.abs(origTarget-spot)>0)$('q26Target').value=(origTarget-spot).toFixed(2);
 $('q26Calc').addEventListener('click',recalc);
 for(const id of ['q26Date','q26Horizon','q26Start','q26Vix','q26Band','q26Spot','q26Target']){
  $(id).addEventListener('change',recalc);
 }
 $('q26Legacy').addEventListener('click',()=>{
  const show=!p.classList.contains('q26-show-legacy');p.classList.toggle('q26-show-legacy',show);
  $('q26Legacy').setAttribute('aria-expanded',String(show));$('q26Legacy').textContent=show?'TORNA AL MULTI-HORIZON':'ESCURSIONI HIGH/LOW · 5 MIN';
  if(show){w.Quantistes360?.openPanel?.('path');setTimeout(()=>w.dispatchEvent(new Event('resize')),200)}
  else renderPlots(lastStat).catch(e=>console.error('[Q26] graph refresh',e));
 });
 return true;
}
function getSettings(){const start=parseMinute($('q26Start')?.value);const value=$('q26Horizon')?.value||'30',close=value==='close';
 const h=close?LAST-start:Number(value),spot=+$('q26Spot')?.value,vix=+$('q26Vix')?.value,band=+$('q26Band')?.value,target=+$('q26Target')?.value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test($('q26Date').value)||!Number.isInteger(start)||!w.DeskMeasures.onTick(spot)||!w.DeskMeasures.onTick(target)||!$('q26Target').value.trim()||!Number.isFinite(spot)||spot<=0||!Number.isFinite(vix)||vix<6||vix>100||!Number.isFinite(band)||band<.1||band>100||!Number.isFinite(target)||Math.abs(target)>.25*1200||!Number.isInteger(h)||h<1||start+h>LAST){throw Error('Parametri o orizzonte non validi. L’archivio finisce alle 15:59 ET.')}
 return {start,h,spot,vix,band,target,close,before:w.DeskMeasures.dateKey($('q26Date').value)};}
function calculate(c){const sel=[];let missing=0,excluded=0;
 for(const d of days){if(c.before!=null&&d.date>=c.before)continue;const row=d.byMinute.get(c.start);if(!row)continue;
  if(Math.abs(row[0]/100-c.vix)>c.band+1e-10){excluded++;continue}
  if(d.gaps[c.start+c.h]!==d.gaps[c.start]){missing++;continue}
  const anchor=d.prefix[c.start],values=new Float64Array(c.h+1);
  for(let t=0;t<=c.h;t++)values[t]=(d.prefix[c.start+t]-anchor)*TICK;
  sel.push({date:d.date,vix:row[0]/100,values,end:values[c.h]});
 }
 if(w.DeskMarkets){sel.push(...w.DeskMarkets.paths(c,new Set(days.map(d=>d.date))));sel.sort((a,b)=>a.date-b.date);}
 const N=sel.length; if(!N)return{N,missing,excluded,sel,c};
 const qr=[];for(let t=0;t<=c.h;t++)qr.push(quantSet(sel.map(s=>s.values[t])));
 const eps=1e-8,sign=c.target>=0?1:-1;
 let touch=0,terminal=0,up=0,down=0,flat=0;
 const observedTouch=[];
 for(const s of sel){let first=Infinity;
  // Discrete 1m first-passage; does not claim tick-by-tick intraminute extrema.
  for(let t=0;t<=c.h;t++){if(s.values[t]*sign>=c.target*sign-eps){first=t;break}}
  observedTouch.push(first);
  if(Number.isFinite(first))touch++;
  if(s.end*sign>=c.target*sign-eps)terminal++;
  if(s.end>eps)up++;else if(s.end< -eps)down++;else flat++;
 }
 return{c,N,missing,excluded,sel,qr,touch,terminal,up,down,flat,observedTouch,ci:confWilson(touch,N)};
}
function layout(height,l=60,r=30){return{height,autosize:true,margin:{l:Math.max(l,68),r,t:32,b:108},paper_bgcolor:colors.bg,plot_bgcolor:colors.bg,font:{family:'Consolas',size:11,color:'#bfeaf9'},xaxis:{gridcolor:colors.grid,zerolinecolor:'#294f74',showline:true,linecolor:'#2f5982'},yaxis:{gridcolor:colors.grid,zerolinecolor:'#294f74',showline:true,linecolor:'#2f5982'},hoverlabel:{bgcolor:'#10263b',font:{family:'Consolas',color:'#f0e7ce'}},showlegend:true,legend:{orientation:'h',x:0,y:-.26,yanchor:'top',font:{size:11}},dragmode:'zoom',uirevision:'q26-multi'}};
const plotCfg={responsive:true,displaylogo:false,scrollZoom:true,modeBarButtonsToRemove:['lasso2d','select2d'],toImageButtonOptions:{format:'png',filename:'Quantistes_ES_Realized_P_Multi_Horizon',width:3840,height:2160,scale:1}};
async function plot(id,traces,layout){if(!w.Plotly)throw Error('Plotly non disponibile.');const el=$(id);if(el&&el.isConnected)return w.Plotly.react(el,traces,layout,plotCfg)}
async function renderPlots(st){if(!st||!st.N||$('qt360-panel-path')?.classList.contains('q26-show-legacy'))return;
 const {c,N,sel,qr,observedTouch}=st,h=c.h,ts=[],q05=[],q25=[],q50=[],q75=[],q95=[];
 const stride=h<=150?1:Math.ceil(h/150);
 for(let t=0;t<=h;t+=(t+stride>h && t!==h ?h-t:stride)){
  const v=qr[t];ts.push(t);q05.push(c.spot+v[0]);q25.push(c.spot+v[1]);q50.push(c.spot+v[2]);q75.push(c.spot+v[3]);q95.push(c.spot+v[4]);if(t===h)break;
 }
 const xRev=ts.slice().reverse();
 const traces=[
  {type:'scatter',mode:'lines',x:ts.concat(xRev),y:q05.concat(q95.slice().reverse()),fill:'toself',fillcolor:'rgba(108,159,220,.13)',line:{width:0},name:'90% P',hoverinfo:'skip',showlegend:true},
  {type:'scatter',mode:'lines',x:ts.concat(xRev),y:q25.concat(q75.slice().reverse()),fill:'toself',fillcolor:'rgba(222,219,203,.15)',line:{width:0},name:'50% P',hoverinfo:'skip',showlegend:true},
  {type:'scatter',mode:'lines',x:ts,y:q05,line:{color:'rgba(133,177,234,.68)',dash:'dot',width:1.1},name:'P05',hovertemplate:'T+%{x}m · P05 %{y:.2f}<extra></extra>'},
  {type:'scatter',mode:'lines',x:ts,y:q95,line:{color:'rgba(133,177,234,.68)',dash:'dot',width:1.1},name:'P95',hovertemplate:'T+%{x}m · P95 %{y:.2f}<extra></extra>'},
  {type:'scatter',mode:'lines',x:ts,y:q50,line:{color:colors.gold,width:2.7},name:'MEDIANA P',hovertemplate:'T+%{x}m · Mediana %{y:.2f}<extra></extra>'}
 ];
 const sorted=sel.slice().sort((a,b)=>a.end-b.end);const shown=Math.min(24,sorted.length),strided=shown?sorted.length/shown:0;
 for(let j=0;j<shown;j++){
  const r=sorted[Math.min(sorted.length-1,Math.floor((j+.5)*strided))];const down=r.end<0;
  traces.push({type:'scatter',mode:'lines',x:ts,y:ts.map(t=>c.spot+r.values[t]),line:{color:down?'rgba(222,219,203,.27)':'rgba(129,198,227,.24)',width:1},name:String(r.date),showlegend:false,hovertemplate:'ES %{y:.2f} · T+%{x}m<br>DATA '+r.date+' · VIX '+n(r.vix,1)+'<extra></extra>'});
 }
 const fl=layout(Math.max(440,Math.round($('q26Fan').clientHeight)||520),76,36);fl.xaxis.title='MINUTI DALLA PARTENZA · '+timeStr(c.start)+' ET';fl.xaxis.range=[0,h];fl.yaxis.title='ES · PUNTI';fl.hovermode='closest';fl.uirevision=[c.before,c.start,h,c.spot,c.vix,c.band].join('|');
 fl.shapes=[{type:'line',xref:'x',yref:'y',x0:0,x1:h,y0:c.spot+c.target,y1:c.spot+c.target,line:{color:'#87b5ff',dash:'dash',width:1.2}}];
 const ends=sel.map(r=>c.spot+r.end);
 const hist=layout(Math.max(330,Math.round($('q26Hist').clientHeight)||360),66,25);
 hist.xaxis.title='ES · TERMINALE '+h+' MIN';hist.yaxis.title='QUOTA DEL CAMPIONE';hist.yaxis.tickformat='.0%';hist.showlegend=false;
 hist.shapes=[{type:'line',xref:'x',yref:'paper',x0:c.spot+c.target,x1:c.spot+c.target,y0:0,y1:1,line:{color:colors.gold,width:1.5,dash:'dash'}}];
 const tm=[],touchP=[],termP=[],step=h<=200?1:Math.ceil(h/180),sgn=c.target>=0?1:-1;
 for(let t=0;t<=h;t+=(t+step>h && t!==h ?h-t:step)){
  tm.push(t);let tk=0,ek=0;for(let k=0;k<N;k++){if(observedTouch[k]<=t)tk++;if(sel[k].values[t]*sgn>=c.target*sgn-1e-8)ek++}
  touchP.push(tk/N);termP.push(ek/N);if(t===h)break;
 }
 const tl=layout(Math.max(330,Math.round($('q26TouchPlot').clientHeight)||360),65,23);tl.xaxis.title='MINUTI';tl.yaxis.title='P EMPIRICA';tl.yaxis.tickformat='.0%';tl.yaxis.range=[0,Math.min(1.02,Math.max(.05,...touchP)*1.12)];tl.hovermode='x unified';
 await plot('q26Fan',traces,fl);
 await Promise.all([
  plot('q26Hist',[{type:'histogram',x:ends,histnorm:'probability',nbinsx:Math.max(8,Math.min(24,Math.ceil(Math.sqrt(N)))),marker:{color:colors.mint,line:{color:'#173047',width:.5}},hovertemplate:'ES %{x:.2f}<br>Frequenza %{y:.1%}<extra></extra>'}],hist),
  plot('q26TouchPlot',[{type:'scatter',mode:'lines',x:tm,y:touchP,name:'FIRST TOUCH 1m',line:{color:colors.gold,width:2.4},hovertemplate:'T+%{x}m · P %{y:.2%}<extra></extra>'},{type:'scatter',mode:'lines',x:tm,y:termP,name:'TERMINALE OLTRE K',line:{color:colors.blue,width:2.2,dash:'dash'},hovertemplate:'T+%{x}m · P %{y:.2%}<extra></extra>'}],tl)
 ]);
}
function updateStats(s){const {c,N}=s;
 const el=$('q26Passage');if(el){const hits=(s.observedTouch||[]).filter(Number.isFinite).sort((a,b)=>a-b),m=hits.length>>1,med=hits.length?(hits.length%2?hits[m]:(hits[m-1]+hits[m])/2):null;el.textContent=N>=w.DeskMeasures.minSessions?'Target ES '+n(c.spot+c.target)+' · '+hits.length+' su '+N+' sedute raggiungono il target su chiusura 1m · tempo mediano fra i tocchi '+(med===null?'—':n(med,1)+' min')+' · '+s.terminal+' chiusure oltre soglia.':'Frequenze in attesa di almeno 25 sedute.';}
 $('q26Samples').textContent=String(N);$('q26Dates').textContent='ANTERIORI AL '+w.DeskMeasures.dayISO(c.before);
 $('q26HorizonTitle').textContent=timeStr(c.start)+' → '+timeStr(c.start+c.h)+' ET · '+c.h+'m'+(c.close?' · ULTIMO OSSERVATO':'');
 if(N<w.DeskMeasures.minSessions){for(const id of ['q26Range','q26Direction','q26Touch','q26Terminal'])$(id).textContent='—';$('q26Flat').textContent='Senza campioni';$('q26TouchCI').textContent='Supporto insufficiente · N = '+N;return}
 const end=s.qr[c.h];
 $('q26Range').textContent=n(c.spot+end[0])+' → '+n(c.spot+end[4]);
 $('q26Direction').textContent=pct(s.up/N)+' / '+pct(s.down/N);
 $('q26Flat').textContent='P invariato '+pct(s.flat/N);
 $('q26Touch').textContent=pct(s.touch/N);
 $('q26TouchCI').textContent='WILSON 95% '+pct(s.ci[0])+' – '+pct(s.ci[1]);
 $('q26Terminal').textContent=pct(s.terminal/N);
}
function clearCharts(){if($('q26Passage'))$('q26Passage').textContent='—';for(const id of ['q26Fan','q26Hist','q26TouchPlot']){const el=$(id);if(el)try{w.Plotly?.purge?.(el)}catch(e){}}}
async function recalc(event){if(!visible||!$('q26Realized'))return;
 const job=++token;let c;try{c=getSettings()}catch(e){lastStat=null;clearCharts();for(const id of ['q26Range','q26Direction','q26Touch','q26Terminal','q26Flat','q26TouchCI','q26Samples','q26Dates','q26HorizonTitle'])$(id).textContent='—';if(event?.isTrusted)w.dispatchEvent(new CustomEvent('desk:realized-invalid'));$('q26Status').textContent=String(e.message||e);$('q26Status').dataset.bad='true';return}
 const legacy=$('q26Legacy');legacy.hidden=c.h!==5;
 $('qt360-panel-path')?.classList.remove('q26-show-legacy');legacy.setAttribute('aria-expanded','false');legacy.textContent='ESCURSIONI HIGH/LOW · 5 MIN';
 if(!days.length&&!indexDaily()){$('q26Status').textContent='Archivio ES non ancora disponibile; attendere il caricamento locale.';return}
 const s=calculate(c);lastStat=s;lastH=c.h;updateStats(s);
 $('q26Status').dataset.bad=String(s.N<25);
 if(s.N<25){clearCharts();if(event?.isTrusted)w.dispatchEvent(new CustomEvent('desk:realized',{detail:{settings:c}}));$('q26Status').textContent='CAMPIONE INSUFFICIENTE: '+s.N+' sedute con VIX '+n(c.vix,1)+'±'+n(c.band,1)+' e partenza '+timeStr(c.start)+'. Aumentare banda VIX o scegliere un orizzonte più breve; nessuna probabilità stimata.';return}
 $('q26Status').textContent='CAMPIONE P ES · '+s.N+' sedute distinte / '+days.length+' totali · '+timeStr(c.start)+' ET · '+c.h+'m · VIX '+n(c.vix,1)+' ±'+n(c.band,1)+'. '+(s.missing?('Gap esclusi '+s.missing+' · '):'')+'First touch su campionamento 1m (non eventi intraminuto).';
 if(event?.isTrusted)w.dispatchEvent(new CustomEvent('desk:realized',{detail:{settings:c}}));
 try{await renderPlots(s);if(job!==token)return}
 catch(e){console.error('[Q26] Multi-horizon rendering:',e);$('q26Status').textContent='Errore di rendering: '+String(e.message||e);$('q26Status').dataset.bad='true'}
}
function applyOrigin(){const origin=w.InstitutionalDesk?.origin?.();if(!origin||!$('q26Start'))return false;
 const dir=w.InstitutionalDesk?.side?.()||1;
 const linked=[['q26Date',origin.date],['q26Start',timeStr(origin.start)],['q26Horizon',String(origin.h)],['q26Vix',origin.vix],['q26Band',origin.band],['q26Target',dir*origin.target*.25]];
 if(origin.spot>0)linked.push(['q26Spot',origin.spot]);
 let changed=false;for(const [key,raw] of linked){const el=$(key),v=key==='q26Horizon'&&!durations.includes(+raw)?'close':String(raw);if(el.value!==v){el.value=v;changed=true;}}return changed;}
function activate(){visible=true;if(!makeMarkup())return;const parent=$('qt360-panel-path');parent?.classList.add('q26-enhanced');
 if(!days.length&&!indexDaily()){setTimeout(activate,380);return}
 const linked=applyOrigin();if(!initDone||linked){initDone=true;recalc();return}
 const state=$('q26Horizon');if(state&&(+state.value===lastH||state.value==='close')){
  // Force resize when switching back from other native workstations.
  setTimeout(()=>{if(parent?.classList.contains('q26-show-legacy'))return;for(const id of ['q26Fan','q26Hist','q26TouchPlot']){const el=$(id);if(el&&el.offsetWidth)try{w.Plotly?.Plots?.resize(el)}catch(e){}}},160);
 }else recalc();
}
function bootstrap(){if(!$('qt360-panel-path')||!w.QuantistesFlatDesk||!w.Quantistes360){setTimeout(bootstrap,200);return}
 document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-q25-tool="realized"]');if(btn)setTimeout(activate,360)});
 // v25 may open this stage programmatically rather than via a click.
 setInterval(()=>{const current=w.QuantistesFlatDesk?.state?.();if(current?.stage==='path'&&current?.tool==='realized'&&!visible)activate();if(current?.stage!=='path'||current?.tool!=='realized')visible=false},800);
 if(w.QuantistesFlatDesk.state().tool==='realized')activate();
}
w.QuantistesRealizedMulti=Object.freeze({activate,settings:()=>lastStat?.c||null,analyze:(params)=>{if(!Number.isInteger(params.start)||params.start<START||params.start>954||!Number.isInteger(params.h)||params.h<1||params.start+params.h>LAST||!(params.band>0)||!Number.isFinite(params.vix))throw Error('Finestra ES non valida');if(!days.length)indexDaily();return calculate(params)},inventory:()=>({sessions:days.length,from:days[0]?.date,to:days.at(-1)?.date,tick:TICK,maxMinute:LAST}),state:()=>({N:lastStat?.N||0,horizon:lastH,active:visible})});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bootstrap,240));else setTimeout(bootstrap,240);
})(window);


