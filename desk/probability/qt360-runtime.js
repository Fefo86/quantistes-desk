
/* QUANTISTES // Market Structure 360
   Source: locally validated SCID 2026 historical data, VIX, v10 CVI distribution state.
   Strictly no forward-looking features, unsupported live claims, or invented path probabilities.
 */
(function(root){'use strict';
const $=id=>document.getElementById(id);
const S={ready:false,rows:[],validation:null,atlas:null,selected:null,current:null,active:'path',plots:new Set(),working:false};
const PLOT_CONFIG={responsive:true,displaylogo:false,scrollZoom:true,toImageButtonOptions:{format:'png',filename:'Quantistes_Desk_360',height:1080,width:1920,scale:2},modeBarButtonsToRemove:['lasso2d','select2d','toggleSpikelines']};
const COLORS={bg:'#091c2e',ink:'#d8e6f4',sub:'#689cda',grid:'rgba(67,137,176,.14)',gold:'#87b5ff',blue:'#d3e8ff',green:'#96d7ee',red:'#f5efde',line:'#1f3a53'};
const TT=.25;
const F=n=>Number.isFinite(n);const pct=n=>F(n)?(n*100).toLocaleString('it-IT',{maximumFractionDigits:2,minimumFractionDigits:1})+'%':'—';
const num=(v,p=2)=>F(+v)?(+v).toLocaleString('it-IT',{maximumFractionDigits:p,minimumFractionDigits:p}):'—';
const val=id=>$(id)?.value;const clamp=(a,b,c)=>Math.min(c,Math.max(b,a));
const human=d=>String(d).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
const layout=(h=420)=>({height:h,margin:{l:63,r:30,t:22,b:46},paper_bgcolor:COLORS.bg,plot_bgcolor:COLORS.bg,font:{family:'Consolas',size:11,color:COLORS.ink},hoverlabel:{bgcolor:'#0d2236',font:{color:'#c0ebfa',family:'Consolas',size:11},bordercolor:'#42607b'},xaxis:{gridcolor:COLORS.grid,zerolinecolor:'#3b5974',linecolor:'#1d3850',tickfont:{size:10,color:COLORS.sub}},yaxis:{gridcolor:COLORS.grid,zerolinecolor:'#3b5974',linecolor:'#1d3850',tickfont:{size:10,color:COLORS.sub}},showlegend:false,hovermode:'closest',dragmode:'pan',uirevision:'qt360'});
const plot=async(id,traces,lo)=>{const el=$(id);if(!el||!root.Plotly)return;const options={...PLOT_CONFIG};await root.Plotly.react(el,traces,lo,options);S.plots.add(id);};
async function unzip(id){const node=$(id);if(!node)throw Error('Archivio embedded assente: '+id);if(!('DecompressionStream' in root))throw Error('Browser senza DecompressionStream; usare Chrome/Edge/Firefox aggiornati.');let raw=atob(node.textContent.trim());const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}
const percentile=(sorted,p)=>{if(!sorted.length)return NaN;const q=clamp(p,0,1)*(sorted.length-1),i=Math.floor(q),h=q-i;return sorted[i]*(1-h)+sorted[Math.min(i+1,sorted.length-1)]*h;};
function accepted(){const spot=+val('qt360Spot'),vix=+val('qt360Vix'),target=+val('qt360Target'),width=+val('qt360VixBand'),hour=val('qt360Hour');if(!F(spot)||spot<=0||!F(target)||target<=0||!F(vix)||vix<6||vix>100)throw Error('Inserire prezzi ES positivi e un livello VIX plausibile.');if(Math.abs(spot/TT-Math.round(spot/TT))>1e-6||Math.abs(target/TT-Math.round(target/TT))>1e-6)throw Error('Prezzo ES e target devono essere multipli di 0,25.');return{spot,vix,target,width,hour,nPaths:+val('qt360PathsCount')||160};}
function filterRows(c){const snap=root.QuantistesV12?.snapshot?.(),timing=snap?DeskMeasures.priceClockError(snap):null;if(timing)throw Error(timing);const pool=snap?S.rows.filter(r=>r[9]<DeskMeasures.dateKey(DeskMeasures.clock(snap.asof)?.date)):S.rows;let subset=pool.filter(r=>Math.abs(r[0]*.01-c.vix)<=c.width+1e-9&&(!c.hour||c.hour==='all'||(c.hour==='open'?r[1]<690:c.hour==='mid'?r[1]>=690&&r[1]<840:r[1]>=840)));
 let extra='';if(subset.length<220){extra='CAMPIONE RIDOTTO '+subset.length+' · filtri ampliati per stima descrittiva';subset=pool.filter(r=>Math.abs(r[0]*.01-c.vix)<=Math.max(5,c.width)&&(!c.hour||c.hour==='all'||(c.hour==='open'?r[1]<690:c.hour==='mid'?r[1]>=690&&r[1]<840:r[1]>=840)));}
 if(subset.length<220){extra='VIX/TOD NON SUPPORTATO · usato solo campione generale';subset=pool.filter(r=>!c.hour||c.hour==='all'||(c.hour==='open'?r[1]<690:c.hour==='mid'?r[1]>=690&&r[1]<840:r[1]>=840));}
 return{rows:subset,extra};}
function stats(arr,c){const n=arr.length,delta=Math.round((c.target-c.spot)/TT);if(!n)throw Error('Nessun percorso per questo filtro.');let up=0,down=0,flat=0,touch=0,terminal=0;
 const series=[[],[],[],[],[],[]],ends=[];
 for(const r of arr){series[0].push(0);for(let j=1;j<=5;j++)series[j].push(r[1+j]);const v=r[6];ends.push(v);if(v>0)up++;else if(v<0)down++;else flat++;
 if(delta>=0){if(v>=delta)terminal++;if(delta===0||r[7]>=delta)touch++;}else{if(v<=delta)terminal++;if(r[8]>=-delta)touch++;}}
 const qs=series.map(a=>{a.sort((a,b)=>a-b);return[.05,.25,.5,.75,.95].map(p=>percentile(a,p))});
 return{n,qs,ends,delta,up:up/n,down:down/n,flat:flat/n,touch:touch/n,terminal:terminal/n,paths:arr};}
function updateKPIs(v,c,extra){
 const q5=v.qs[5],lo=c.spot+q5[0]*TT,hi=c.spot+q5[4]*TT;
 $('qt360KpiRange').textContent=num(lo,2)+' → '+num(hi,2);
 $('qt360KpiRangeSub').textContent='90% terminale · N='+v.n.toLocaleString('it-IT')+' · 5m';$('qt360KpiTouch').textContent=pct(v.touch);$('qt360KpiTouchSub').textContent='K='+num(c.target)+' · terminale '+pct(v.terminal);
 $('qt360PUp').innerHTML='P(S₅ &gt; S₀) <b>'+pct(v.up)+'</b>';$('qt360PDown').innerHTML='P(S₅ &lt; S₀) <b>'+pct(v.down)+'</b>';$('qt360PFlat').innerHTML='P(S₅ = S₀) <b>'+pct(v.flat)+'</b>';$('qt360Pt').innerHTML='P(TARGET TOUCHED) <b>'+pct(v.touch)+'</b>';
 $('qt360SampleText').textContent=(extra?extra+'  /  ':'')+'CAMPIONE ES EFFETTIVO: '+num(v.n,0)+' finestre osservate, 2026 · VIX±'+num(c.width,1)+' · '+(c.hour==='all'?'RTH completa':c.hour)+' · nessuna interpolazione attraverso cambi contratto/sessione. Le finestre possono sovrapporsi.';
 $('qt360CalNote').textContent='Q SPX: utilizza il modulo CVI e seleziona l’orizzonte corretto. P ES: distribuzione empirica terminale a 5m, priva di stima Q→P calibrata per ES.';
}
function baseTrace(x,y,name,color,opts={}){return{type:'scatter',mode:'lines',x,y,name,hovertemplate:'%{x} · '+name+' %{y:.2f}<extra></extra>',line:{color,width:2},...opts}}
async function renderPaths(){if(!S.current)return;const {c,v}=S.current;const xx=[0,1,2,3,4,5],q=v.qs;
 const top=idx=>q.map(a=>c.spot+a[idx]*TT),a05=top(0),a25=top(1),a50=top(2),a75=top(3),a95=top(4);
 const traces=[
 {type:'scatter',mode:'lines',x:xx.concat([...xx].reverse()),y:a05.concat([...a95].reverse()),fill:'toself',fillcolor:'rgba(136,204,231,.10)',line:{color:'rgba(136,204,231,.22)',width:0.8},hoverinfo:'skip',showlegend:false,name:'90% fan'},
 {type:'scatter',mode:'lines',x:xx.concat([...xx].reverse()),y:a25.concat([...a75].reverse()),fill:'toself',fillcolor:'rgba(210,211,200,.15)',line:{color:'rgba(210,211,200,.22)',width:0.8},hoverinfo:'skip',showlegend:false,name:'50% fan'}
 ];
 // Quantile boundaries are genuine cross-sectional historical order statistics at each minute.
 traces.push(baseTrace(xx,a05,'Q05',COLORS.blue,{line:{color:'#539abf',width:1,dash:'dot'}}));traces.push(baseTrace(xx,a95,'Q95',COLORS.blue,{line:{color:'#539abf',width:1,dash:'dot'}}));
 traces.push(baseTrace(xx,a50,'MEDIAN P',COLORS.gold,{line:{color:COLORS.gold,width:3}}));
 const sorted=v.paths.slice().sort((a,b)=>a[6]-b[6]||a[9]-b[9]),n=Math.min(c.nPaths,sorted.length);
 const step=sorted.length/n;const chosen=[];
 for(let i=0;i<n;i++)chosen.push(sorted[Math.min(sorted.length-1,Math.floor((i+.5)*step))]);
 S.rendered=[];
 for(let i=0;i<chosen.length;i++){
  const r=chosen[i],returns=r.slice(2,7),ys=returns.map(v=>c.spot+v*TT),end=r[6],clr=end>0?'rgba(131,200,228,.33)':end<0?'rgba(222,219,203,.34)':'rgba(218,216,202,.31)',idx=traces.length;
  S.rendered.push({i,idx,row:r});traces.push({type:'scatter',mode:'lines+markers',x:xx,y:[c.spot,...ys],marker:{size:3,opacity:.42,color:clr},line:{width:1,color:clr},name:'REALIZED '+human(r[9]),showlegend:false,customdata:Array.from({length:6},()=>[human(r[9]),r[0]*.01,end,r[7],r[8]]),hovertemplate:'REALIZED '+human(r[9])+'<br>t=%{x}m / prezzo=%{y:.2f}<br>VIX='+num(r[0]*.01,2)+' · risultato '+(end>=0?'+':'')+end+' tick<br>PESO CAMPIONARIO = 1/'+v.n+'<extra></extra>'});
 }
 const lower=Math.min(...a05,c.target),upper=Math.max(...a95,c.target);const pad=Math.max(1,(upper-lower)*.13);
 const l=layout(572);l.xaxis={...l.xaxis,title:'MINUTI IN AVANTI · t0 = RIFERIMENTO',dtick:1,range:[0,5.13]};l.yaxis={...l.yaxis,title:'ES · PUNTI INDICE',range:[lower-pad,upper+pad],tickformat:',.2f'};l.hovermode='closest';l.shapes=[{type:'line',xref:'x',yref:'y',x0:0,x1:5,y0:c.target,y1:c.target,line:{color:COLORS.blue,width:2,dash:'dash'}},{type:'line',xref:'x',yref:'y',x0:0,x1:5,y0:c.spot,y1:c.spot,line:{color:'#64819a',width:1,dash:'dot'}}];l.annotations=[{x:5,y:c.target,showarrow:false,text:'TARGET '+num(c.target),xanchor:'right',yshift:13,font:{color:COLORS.blue,size:10}},{x:5,y:a50[5],showarrow:false,text:'P50 '+num(a50[5]),xanchor:'right',yshift:-13,font:{color:COLORS.gold,size:10}}];
 await plot('qt360PathPlot',traces,l);
 const el=$('qt360PathPlot');if(el){el.removeAllListeners?.('plotly_click');el.removeAllListeners?.('plotly_hover');el.on('plotly_hover',ev=>{const line=S.rendered.find(r=>r.idx===ev.points?.[0]?.curveNumber);if(line)details(line.row,v.n,false)});el.on('plotly_click',ev=>{const line=S.rendered.find(r=>r.idx===ev.points?.[0]?.curveNumber);if(line)highlight(line)});}
 S.selected=null;$('qt360PathInspect').textContent='Seleziona un sentiero: 1/N indica il suo peso empirico nel campione, non una probabilità di realizzo del percorso esatto.';
 await Promise.all([renderTerminal(),renderTouch()]);
}
function details(r,n,selected){const text=(selected?'LOCKED // ':'HOVER // ')+human(r[9])+' · VIX '+num(r[0]*.01,2)+' · END '+(r[6]>=0?'+':'')+r[6]+' TICKS · MAX ↑ '+r[7]+' · MAX ↓ '+r[8]+' · PESO EMPIRICO 1/'+n; $('qt360PathInspect').textContent=text;}
function highlight(line){if(!S.current)return;const el=$('qt360PathPlot');if(!el)return;const previous=S.selected;if(previous&&previous.idx!==line.idx){root.Plotly.restyle(el,{'line.width':1,'marker.size':3},[previous.idx]);}
 root.Plotly.restyle(el,{'line.width':3.5,'marker.size':6},[line.idx]);S.selected=line;details(line.row,S.current.v.n,true);}
async function renderTerminal(){const {v,c}=S.current;const a=v.ends;const lower=Math.min(...a),upper=Math.max(...a);let step=Math.max(1,Math.ceil((upper-lower)/48));const low=Math.floor(lower/step)*step,k=Math.max(1,Math.ceil((upper-low)/step)+1);const bins=Array(k).fill(0);for(const x of a)bins[Math.min(k-1,Math.max(0,Math.floor((x-low)/step)))]++;
 const X=bins.map((_,i)=>c.spot+(low+(i+.5)*step)*TT),Y=bins.map(v=>v/a.length);
 const traces=[{type:'bar',x:X,y:Y,marker:{color:X.map(x=>x<c.spot?'#98a8b0':'#377ba3'),line:{color:'#0a1d2f',width:.4}},name:'Probability mass',customdata:bins,hovertemplate:'ES %{x:.2f}<br>Probabilità empirica %{y:.2%}<br>Osservazioni %{customdata}<extra></extra>'}];
 const l=layout(322);l.xaxis={...l.xaxis,title:'ES TERMINALE · 5 MIN'};l.yaxis={...l.yaxis,title:'FREQUENZA',tickformat:'.1%'};l.shapes=[{type:'line',xref:'x',yref:'paper',x0:c.target,x1:c.target,y0:0,y1:1,line:{color:COLORS.blue,width:2,dash:'dash'}},{type:'line',xref:'x',yref:'paper',x0:c.spot,x1:c.spot,y0:0,y1:1,line:{color:COLORS.gold,width:1}}];await plot('qt360TerminalPlot',traces,l);
}
async function renderTouch(){const{c,v}=S.current;const x=['TERMINALE OLTRE K','TOUCH PRIMA DI 5m'],y=[v.terminal,v.touch];const l=layout(322);l.yaxis={...l.yaxis,title:'PROBABILITÀ EMPIRICA',tickformat:'.0%',range:[0,Math.min(1.02,Math.max(...y)*1.28+.05)]};l.xaxis={...l.xaxis,tickfont:{size:10,color:COLORS.sub}};l.margin.b=61;
 const traces=[{type:'bar',x,y,marker:{color:[COLORS.gold,COLORS.blue],opacity:.89,line:{color:'#93d5ed',width:.5}},text:y.map(pct),textposition:'outside',hovertemplate:'%{x}<br>P = %{y:.2%}<extra></extra>'}];await plot('qt360TouchPlot',traces,l);
}
async function calculate(){if(!S.ready)return;try{let c=accepted();let {rows,extra}=filterRows(c);let v=stats(rows,c);S.current={c,v};updateKPIs(v,c,extra);if(S.active==='path' && $('qt360PathPlot')?.getBoundingClientRect().width>20)await renderPaths();}catch(err){S.current=null;S.selected=null;for(const id of ['qt360PathPlot','qt360TerminalPlot','qt360TouchPlot']){const n=$(id);if(n){if(n.data)root.Plotly?.purge?.(n);n.replaceChildren();}}for(const id of ['qt360KpiRange','qt360KpiTouch','qt360PUp','qt360PDown','qt360PFlat','qt360Pt'])$(id).textContent='—';$('qt360SampleText').textContent='INPUT / MODEL ERROR: '+String(err.message||err);void 0}}
const dtepoch=Date.UTC(1899,11,30,0,0,0);
async function renderValidation(){const D=S.validation;if(!D)return;
 const c=D.calibration;$('deskRegimeN').textContent=num(c.oos_samples,0)+' finestre su '+num(c.oos_days,0)+' sedute. Le soglie VIX di ogni fold sono stimate sulle sole sedute di training.';
 $('deskRegimeTable').innerHTML=[90,80,50].map(n=>{const r=c.score[n+'pct_interval'];return '<tr><td>'+n+'%</td><td>'+pct(r.base.coverage)+'</td><td>'+pct(r.regime.coverage)+'</td><td>'+num(r.base.mean_interval_width_ticks,1)+'</td><td>'+num(r.regime.mean_interval_width_ticks,1)+'</td></tr>';}).join('');
 const rx=D.regime_daily.map(r=>r[0]),vix=D.regime_daily.map(r=>r[1]),vvix=D.regime_daily.map(r=>r[2]);
 const rl=layout(322);rl.margin={l:60,r:61,t:15,b:54};rl.showlegend=true;rl.legend={x:0,y:1.16,orientation:'h',font:{size:10,color:COLORS.sub}};rl.hovermode='x unified';rl.xaxis={...rl.xaxis,title:'DATA ET · SEDUTE ES',type:'date'};rl.yaxis={...rl.yaxis,title:'VIX',rangemode:'tozero'};rl.yaxis2={title:'VVIX',tickfont:{color:COLORS.blue,size:10},titlefont:{color:COLORS.blue},overlaying:'y',side:'right',showgrid:false};
 rl.xaxis.showspikes=true;rl.xaxis.spikemode='across';rl.xaxis.rangeslider={visible:false};rl.uirevision='volatility-regimes';rl.xaxis.rangeselector={buttons:[{count:1,label:'1M',step:'month',stepmode:'backward'},{count:3,label:'3M',step:'month',stepmode:'backward'},{label:'Tutto',step:'all'}]};await plot('qt360RegimePlot',[{type:'scatter',mode:'lines+markers',x:rx,y:vix,name:'VIX',line:{color:COLORS.gold,width:1.8},marker:{size:3},hovertemplate:'VIX %{y:.2f}<extra></extra>'},{type:'scatter',mode:'lines+markers',x:rx,y:vvix,name:'VVIX',line:{color:COLORS.blue,width:1.6},marker:{size:3},yaxis:'y2',connectgaps:false,hovertemplate:'VVIX %{y:.2f}<extra></extra>'}],rl);
}
function jump(name){const map={'quant360':['path','realized'],flows:['dealer','flow-ops'],'flow-score':['score','decision'],monitor:['market','skewfit'],smile:['market','skewfit'],levels:['market','levels'],volcube:['market','volcube'],surface:['market','surface'],tailbook:['market','tailrisk'],crash:['market','tailrisk'],implied:['market','implied'],distributions:['path','distributions'],history:['path','history'],research:['path','research'],systematic:['audit','systematic'],method:['audit','method'],export:['market','export'],audit:['audit','audit']};const target=map[name]||['audit','method'];root.QuantistesFlatDesk?.go(...target);}
function filteredAtlas(){let list=S.atlas?.chapters||[];const term=String(val('qt360AtlasSearch')||'').trim().toLowerCase();if(term)list=list.filter(x=>(x.id+' '+x.name+' '+x.status+' '+x.note).toLowerCase().includes(term));if(S.atlasFilter==='gap')list=list.filter(x=>x.status!=='native');if(S.atlasFilter==='ready')list=list.filter(x=>x.status==='native');return list;}
function renderAtlas(){const list=filteredAtlas();if(!S.atlas)return;let counts=S.atlas.chapters.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});$('qt360AtlasSummary').textContent='SEZIONI '+S.atlas.chapter_count+' · '+S.atlas.appendix_count+' APPENDICI · PIENI '+(counts.native||0)+' · PARZIALI '+(counts.partial||0)+' · DIPENDENTI '+(counts.wait||0)+' · INFRASTRUTTURA '+(counts.infra||0)+' · VISIBILI '+list.length;
 const html='<table class="qt360-table"><thead><tr><th>REF</th><th>SPECIFICA · SEZIONE</th><th>STATUS</th><th>COLLEGAMENTO</th></tr></thead><tbody>'+list.map(x=>'<tr><td style="color:#86b1ea">'+x.id+'</td><td><b>'+escapeHtml(x.name)+'</b><div style="font-size:10px;color:#60a7ca;margin-top:3px">'+escapeHtml(x.note)+'</div></td><td><span class="qt360-badge '+x.status+'">'+({native:'IMPLEMENTED',partial:'PARZIALE',wait:'DATI / MODELLO',infra:'INFRASTRUTTURA'}[x.status]||'REFERENCE')+'</span></td><td><button type="button" class="qt360-btn" data-qt360-jump="'+x.tab+'">APRI ↗</button></td></tr>').join('')+'</tbody></table>';
 $('qt360AtlasTable').innerHTML=html;
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function activate(id){if(!['path','val','atlas'].includes(id))return;S.active=id;document.querySelectorAll('[data-qt360-tab]').forEach(b=>{const on=b.dataset.qt360Tab===id;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));});document.querySelectorAll('.qt360-panel').forEach(p=>p.classList.toggle('on',p.id==='qt360-panel-'+id));
 if(!S.ready){try{await load();}catch(e){$('qt360Ready').textContent=String(e.message||e);return;}if(S.active!==id)return;}
 try{if(id==='path'){await calculate();}else if(id==='val'){await renderValidation();}else if(id==='atlas'){renderAtlas();}}
 catch(e){console.error('qt360 rendering '+id,e);$('qt360Ready').textContent='DRAW ERROR · CHECK CONSOLE';}
}
function updateChainState(){let d=root.DistributionUI?.getState?.(),s=root.QuantistesDynamic?.stats?.();const haveQ=!!(d&&d.valid&&d.bundle?.q),date=s?.date||null;
 $('qt360ChainStatus').textContent=haveQ?'Q CVI: FIT DISPONIBILE'+(date?' / '+date:''):'Q: CARICA UNA CHAIN SPXW';$('qt360ChainStatus').className='qt360-chip '+(haveQ?'ok':'note');$('qt360PStatus').textContent=s&&s.qMatched?'P SPX · MODELLO '+s.kind+' / Q MATCHED':'P ES 5m · STORICO';}
async function useSpX(){
 const n=$('qt360SampleText'),st=root.Desk?.state,r=st?.stale?null:st?.result,basis=DeskMeasures.number(val('basis')),spx=DeskMeasures.number(r?.cfg?.settlement);
 if(!(spx>0)||basis===null){n.textContent='Seleziona un mark SPXW e imposta il basis ES meno SPX.';return;}
 const ref=Math.round((spx+basis)/TT)*TT;$('qt360Spot').value=ref.toFixed(2);$('qt360Target').value=(ref+4).toFixed(2);
 await calculate();n.textContent+=' Riferimento di scenario = settlement SPX '+num(spx)+' + basis '+num(basis)+' = ES '+num(ref)+'.';
}
let pending=null;
function dataset(){return S.ready?{rows:S.rows,validation:S.validation}:null;}
function load(){
 if(S.ready)return Promise.resolve(dataset());
 if(!pending)pending=(async()=>{
   const p=await unzip('qt360-paths-data'),v=JSON.parse($('qt360-validation-data').textContent),a=JSON.parse($('qt360-manual-map').textContent);
   if(p.schema!=='quantistes.es.actual_paths.5m.v1'||!Array.isArray(p.rows)||!p.rows.length||!v.regime_daily?.length)throw Error('Archivio ES o serie VIX assente.');
   for(const row of p.rows){
    // The source records the future-bar extrema. A path includes its observed origin at t=0.
    row[7]=Math.max(0,row[7]);row[8]=Math.max(0,row[8]);
   }
   S.rows=p.rows;S.validation=v;S.atlas=a;S.ready=true;return dataset();
 })().catch(err=>{pending=null;throw err;});
 return pending;
}
function applyArchiveReference(){
 const snap=root.QuantistesV12?.snapshot?.(),reg=S.validation?.regime_daily;
 if(snap){const last=DeskMeasures.number(val('qt360Spot')),target=DeskMeasures.number(val('qt360Target')),distance=target!==null&&last!==null?target-last:4;
 $('qt360Spot').value=snap.es.last;$('qt360Target').value=snap.es.last+distance;$('qt360Vix').value=snap.vix.value;
 $('qt360Vix').title=snap.vix.asof||'Ora VIX non dichiarata';$('qt360SourceTag').textContent='SNAPSHOT ES · '+snap.asof;
 }else if(reg?.length){const last=reg.at(-1),v=[...reg].reverse().find(r=>r[1]>=6&&r[1]<=100);
 if(last[3]>0){$('qt360Spot').value=last[3];$('qt360Target').value=last[3]+4;}
 if(v){$('qt360Vix').value=v[1];$('qt360Vix').title='Ultima osservazione VIX del '+v[0];}
 $('qt360SourceTag').textContent='ARCHIVIO ES · '+last[0];}
}
async function init(){
 if(!$('view-quant360'))return;
 root.addEventListener('quantistes:v12-feed',()=>{if(S.ready){applyArchiveReference();calculate();}});
 const on=(id,event,fn)=>$(id)?.addEventListener(event,fn);
 on('qt360Calc','click',calculate);on('qt360UseRef','click',useSpX);
 on('qt360ResetPath','click',()=>{if(S.selected&&$('qt360PathPlot')){root.Plotly?.restyle($('qt360PathPlot'),{'line.width':1,'marker.size':3},[S.selected.idx]);S.selected=null;$('qt360PathInspect').textContent='Seleziona un percorso.';}});
 document.querySelectorAll('[data-qtjump]').forEach(e=>e.addEventListener('click',()=>jump(e.dataset.qtjump)));
 for(const id of ['qt360Spot','qt360Vix','qt360Target','qt360VixBand','qt360Hour','qt360PathsCount'])on(id,'change',calculate);
 on('qt360AtlasSearch','input',renderAtlas);
 for(const [id,filter] of [['qt360AtlasAll','all'],['qt360AtlasGap','gap'],['qt360AtlasReady','ready']])on(id,'click',()=>{S.atlasFilter=filter;renderAtlas();});
 on('qt360AtlasTable','click',event=>{const target=event.target.closest('[data-qt360-jump]');if(target)jump(target.dataset.qt360Jump);});
 document.querySelectorAll('[data-qt360-tab]').forEach(e=>e.addEventListener('click',()=>activate(e.dataset.qt360Tab)));
 for(const event of ['quantistes:dynamicP','qt:physical-updated','quantistes:research-stale'])root.addEventListener(event,updateChainState);
 try{
  await load();applyArchiveReference();$('qt360Ready').textContent='ARCHIVIO ES · '+S.validation.regime_daily.at(-1)[0];updateChainState();await calculate();
 }catch(err){$('qt360Ready').textContent='ARCHIVIO INDISPONIBILE';$('qt360SampleText').textContent=String(err.message||err);}
}
root.Quantistes360=Object.freeze({snapshot:()=>S.current,load,data:dataset,openPanel:activate,ready:()=>S.ready,metrics:()=>S.current?{N:S.current.v.n,pUp:S.current.v.up,pDown:S.current.v.down,pTouch:S.current.v.touch,pTerminal:S.current.v.terminal}:null,open:()=>jump('quant360'),refresh:calculate});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
