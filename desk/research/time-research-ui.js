(function(){
'use strict';
const $=id=>document.getElementById('tm'+id),C=window.TimeResearchCore,Q=window.QuantCore,D=window.DistributionCore;
const state={labelLoading:false,chainLoading:false,docs:[],labelMap:new Map(),pits:[],table:[],settings:null,fail:[],bars:null,study:null,token:0,chainFiles:null,chainRows:null,revision:null,working:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,n=3)=>Number.isFinite(x)?x.toLocaleString('it-IT',{maximumFractionDigits:n,minimumFractionDigits:n}):'—',pct=x=>Number.isFinite(x)?fmt(100*x,2)+'%':'—';
const say=(id,s)=>{$(id).textContent=s;};const zero=()=>{state.regime=null;window.RegimeUI?.reset();state.pits=[];state.table=[];$('Pit').disabled=true;$('SavePit').disabled=true;};
function exportFile(name,data,type='application/json'){
 const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function table(headers,rows){return '<div class="tablewrap"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function discard(message){
 ++state.token;state.working=false;state.docs=[];state.settings=null;state.fail=[];zero();$('Replay').disabled=false;$('Stop').disabled=true;$('Dump').disabled=true;$('QFile').disabled=true;$('Pick').innerHTML='<option>—</option>';$('Table').replaceChildren();
 say('ReplayMsg',message||'Parametri o file modificati. Esegui il replay con il nuovo input.');say('Stats','In attesa del replay.');
}
function sync(){
 const evaluated=C.evaluate(state.docs,state.labelMap);state.table=evaluated.table;state.pits=evaluated.pits;state.regime=window.RegimeResearch.evaluate(evaluated);window.RegimeUI.render(state.regime);
 const paired=state.table.filter(r=>r.p),avg=f=>paired.length?paired.reduce((s,r)=>s+f(r),0)/paired.length:null;
 const s=state.docs.length+' Q ricostruite · '+state.pits.length+' fixing associati · '+paired.length+' confronti Q/P fuori campione.';
 say('Stats',paired.length?s+' CRPS medio appaiato in punti: Q '+fmt(avg(r=>r.q.crps))+' / P '+fmt(avg(r=>r.p.crps))+'.':s);
 $('Pit').disabled=!state.pits.length;$('SavePit').disabled=!state.pits.length;$('Dump').disabled=!state.docs.length;$('QFile').disabled=!state.docs.length;
 $('Pick').innerHTML=state.docs.map((d,i)=>'<option value="'+i+'">'+esc(d.asof_utc)+'</option>').join('')||'<option>—</option>';
 const v=state.table.map(r=>[r.doc.asof_utc.slice(0,10),r.doc.usedQuotes,fmt(r.doc.forward,2),r.missing?'In attesa':fmt(r.y,2),fmt(r.pit,4),fmt(r.q?.crps),fmt(r.p?.crps),fmt(r.p?.pinball?.[.5]),fmt(Number.isFinite(r.terminalPremium)?1e4*r.terminalPremium:null,5)]);
 $('Table').innerHTML=table(['Data','Quote','Forward','Fixing','PIT Q','CRPS Q','CRPS P','Pinball P50','Premio log² · %²'],v.slice(-100))+(v.length>100?'<p class="hint">Ultime 100 sedute visibili. L’export include lo storico completo.</p>':'')+
 (state.fail.length?'<details class="tm-guide"><summary>'+state.fail.length+' date escluse</summary>'+table(['Seduta','Diagnosi'],state.fail.map(r=>[r.day,r.error]).slice(-100))+'</details>':'');
}
function currentSource(){return state.chainRows||window.Desk?.state.parsed?.rows||[];}
function ifFresh(){if(state.working||!state.settings||state.revision!==window.Desk?.state.revision)throw Error('Aggiorna il replay con i parametri correnti.');}
async function replay(){
 if(state.chainLoading||state.labelLoading)throw Error('Attendi il completamento della lettura dei CSV.');
 discard('Preparazione del replay…');const token=state.token,desk=window.Desk,rows=currentSource();if(!rows.length)throw Error('Carica le chain ThetaData nel desk o nel selettore Storico.');
 const cfg=desk.config(),jobs=C.plan(rows,cfg,$('Cut').value.trim(),$('Fix').value);if(!jobs.length)throw Error('Nessuna chain 0DTE per la root '+cfg.symbol+'.');
 if(!(cfg.maxAge>0))throw Error('Per archiviare una Q storica serve una finestra di freschezza quote positiva.');
 const docs=[],fail=[],revision=desk.state.revision;state.working=true;$('Replay').disabled=true;$('Stop').disabled=false;
 try{
  for(let i=0;i<jobs.length;i++){
   if(token!==state.token)return;if(revision!==desk.state.revision){discard();return;}
   const j=jobs[i],keys=[...state.labelMap.values()].filter(l=>l.day===j.day&&l.symbol===cfg.symbol);if(keys.length>1){fail.push({day:j.day,error:'Più fixing per la stessa root e giornata.'});continue;}
   say('ReplayMsg','Calcolo '+(i+1)+' / '+jobs.length+' · '+j.day);await new Promise(r=>setTimeout(r,0));
   try{const input=C.forDate(C.schedule(j,keys[0]));const r=await desk.computeHistory(j.rows,input);docs.push(C.archive(r));}catch(e){fail.push({day:j.day,error:e.message});}
  }
  if(token!==state.token)return;if(revision!==desk.state.revision){discard();return;}
  state.docs=docs;state.fail=fail;state.settings={...cfg,forward:'parità per data',settlement:'forward per data',overrideHours:0,quoteSource:'mid',cutoffET:$('Cut').value,fixingET:$('Fix').value,files:state.chainFiles||desk.state.files.map(f=>f.name)};
  state.revision=revision;sync();say('ReplayMsg',docs.length+' date ricostruite su '+jobs.length+' · '+fail.length+' escluse.');
 }finally{if(token===state.token){state.working=false;$('Replay').disabled=false;$('Stop').disabled=true;}}
}
function guard(id,fn){
 return async e=>{try{await fn(e);}catch(err){say(id,err.message||String(err));}};
}
let loads=0;
$('Chain').onchange=guard('ReplayMsg',async e=>{
 const token=++loads;state.chainLoading=true;try{discard('Lettura dei file…');state.chainRows=[];state.chainFiles=null;
 const ff=[...e.target.files];if(!ff.length){state.chainRows=null;say('ReplayMsg','Vengono usate le chain nel desk.');return;}
 const rows=[];for(const f of ff){const txt=await f.text();const p=Q.parseCSV(txt);const keys=p.headers.map(Q.canonical);
 if(!keys.some(x=>['symbol','root','underlying','underlyingsymbol'].includes(x))||!keys.some(x=>['timestamp','datetime','quotedatetime','quotetime','time'].includes(x)))throw Error(f.name+' richiede colonna simbolo e timestamp opzione intraday.');
 for(const r of p.rows)rows.push(r);}
 if(token!==loads)return;state.chainRows=rows;state.chainFiles=ff.map(f=>f.name);say('ReplayMsg',rows.length+' righe da '+ff.length+' file. Seleziona la root nel desk ed esegui il replay.');
 }finally{if(token===loads)state.chainLoading=false;}
});
let labelLoad=0;
$('Labels').onchange=guard('Stats',async e=>{const token=++labelLoad;state.labelLoading=true;const f=e.target.files[0];const prev=state.labelMap;state.labelMap=new Map();zero();$('Table').replaceChildren();
 if(state.working)discard('Settlement modificati durante il replay. Ricalcola.');
 try{const book=f?C.labels(await f.text()):new Map();if(token!==labelLoad)return;
 state.labelMap=book;if(state.docs.some(d=>{const ny=Q.nyFormat(Date.parse(d.expiry_utc));return [...book.values()].some(l=>l.day===ny.slice(0,10)&&l.symbol===d.series.split('@')[0]&&l.clock.slice(0,5)!==ny.slice(11,16));})||[...prev.values()].some(l=>l.clock.slice(0,5)!==$('Fix').value&&![...book.values()].some(n=>n.clock===l.clock&&n.day===l.day))) {
  discard('Convenzione di fixing modificata. Esegui il replay.');return;
 }sync();say('ReplayMsg',book.size+' fixing caricati. Le date coincidenti sono associate automaticamente.');
 }catch(err){if(token===labelLoad){discard('File settlement non valido. Controlla l’intestazione e i timestamp.');}throw err;}finally{if(token===labelLoad)state.labelLoading=false;}
});
for(const id of ['Cut','Fix'])$(id).oninput=()=>discard();
$('Replay').onclick=guard('ReplayMsg',replay);$('Stop').onclick=()=>discard('Replay interrotto. Nessun archivio parziale pubblicato.');
$('Dump').onclick=guard('ReplayMsg',()=>{ifFresh();exportFile('Quantistes_replay_Q.json',{format:'quantistes-historical-replay-v1',config:state.settings,forecasts:state.docs,excluded:state.fail,results:state.table.map(({doc,...r})=>({asof:doc.asof_utc,expiry:doc.expiry_utc,...r})),pits:state.pits,regimeChallenger:state.regime});});
$('QFile').onclick=guard('Stats',()=>{ifFresh();const doc=state.docs[Number($('Pick').value)];if(doc)exportFile('Q_'+doc.asof_utc.slice(0,10)+'.json',doc);});
$('Pit').onclick=guard('Stats',()=>{ifFresh();const n=window.DistributionUI.mergePIT(state.pits);say('Stats','Archivio PIT del desk aggiornato: '+n+' osservazioni uniche.');});
$('SavePit').onclick=guard('Stats',()=>{ifFresh();const f=D.HIST_FIELDS;exportFile('Quantistes_replay_PIT.csv',[f.join(','),...state.pits.map(r=>f.map(k=>r[k]??'').join(','))].join('\n')+'\n','text/csv');});
function clearBars(){state.study=null;$('SaveBars').disabled=true;$('BarTables').replaceChildren();say('BarMsg','Dati o parametri da ricalcolare.');}
for(const id of ['Symbol','Open','Close','Interval','Stamp','AsOf','Down','Up','Bars','Buffer','Recross','Occup','Trunc'])$(id).addEventListener('input',clearBars);
$('Study').onclick=guard('BarMsg',async()=>{
 clearBars();const token=++barToken,ff=[...$('Bars').files];if(!ff.length)throw Error('Carica barre OHLC del sottostante.');
 const sym=$('Symbol').value.trim().toUpperCase();if(!sym)throw Error('Indica il simbolo delle barre.');
 const cfg={symbol:sym,start:$('Open').value,end:$('Close').value,minutes:$('Interval').valueAsNumber,stamp:$('Stamp').value,until:Q.nyEpoch($('AsOf').value),lower:$('Down').valueAsNumber,upper:$('Up').valueAsNumber,breakBps:$('Buffer').valueAsNumber,recrossBars:$('Recross').valueAsNumber,occupShare:$('Occup').valueAsNumber,truncateBps:$('Trunc').valueAsNumber};
 const list=[];for(const f of ff){for(const x of C.readBars(await f.text(),sym))list.push(x);}
 if(token!==barToken)return;
 const study=C.windowData(list,cfg),m=C.summarize(study);state.study={config:{...cfg,asof_utc:new Date(cfg.until).toISOString(),files:ff.map(f=>f.name)},...study,metrics:m};$('SaveBars').disabled=false;
 say('BarMsg',sym+' · '+study.good.length+' finestre complete da '+cfg.start+' a '+cfg.end+' ET · '+study.omitted.length+' date escluse.');
 const issue=study.omitted.length?'<details class="tm-guide"><summary>Date escluse</summary>'+table(['Data','Motivo'],study.omitted.slice(-100).map(r=>[r.day,r.reason]))+'</details>':'';
 if(!m){$('BarTables').innerHTML=issue;return;}
 const vr=v=>fmt(v*1e4,5),bands=b=>pct(b[0])+' – '+pct(b[1]);
 const h=m.har,ql=h.tests.length?h.tests.reduce((s,r)=>s+r.quasiLoss,0)/h.tests.length:null,hb=h.tests.length?h.tests.reduce((s,r)=>s+r.baseQuasiLoss,0)/h.tests.length:null;
 $('BarTables').innerHTML='<div class="tm-grid">'+table(['Evento osservato','Frequenza'],[
 ['Tocco barriera superiore',pct(m.touchU)],['Tocco barriera inferiore',pct(m.touchL)],['Superiore per prima · limiti',bands(m.firstU)],['Inferiore per prima · limiti',bands(m.firstL)],['Ordine intrabar ambiguo',pct(m.amb)],['Nessun contatto',pct(m.none)],['Chiusura ≥ superiore',pct(m.closeU)],['Chiusura ≤ inferiore',pct(m.closeL)],['Chiusura > open',pct(m.pUp)],['Chiusura < open',pct(m.pDown)],['Chiusura = open',pct(m.pFlat)],['Rendimento storico medio',pct(m.expectedReturn)]])+table(['Variazione della finestra','Media · %²'],[['RV',vr(m.rv)],['Bipower corretta',vr(m.bv)],['RV troncata · '+cfg.truncateBps+' bp',vr(m.path.truncated)],['Barre escluse dal troncamento',m.path.discarded],['Skewness realizzata media',fmt(m.path.skew)],['Kurtosis realizzata media',fmt(m.path.kurt)],['Finestre con RV positiva',m.path.momentDays],['Salti · proxy positiva',vr(m.jump)],['Semivarianza downside',vr(m.downVar)],['Semivarianza upside',vr(m.upVar)],['Quarticity · %⁴',fmt(m.rq*1e8,5)]])+'</div>'+table(['Quantili rendimento semplice','5%','25%','50%','75%','95%'],[['Benchmark storico',...m.retQ.map(v=>pct(Math.expm1(v)))]])+table(['Escursioni mediane','Favorevole dal primo open','Avversa dal primo open'],[['Long sul sottostante',pct(m.mfe),pct(m.mae)]])+table(['Griglia campionamento','RV media della stessa finestra · %²'],Object.entries(m.signature).map(([k,v])=>[k+' min',vr(v)]))+
 pathTables(m.path,cfg,table)+
 '<p class="tm-status">'+(h.next===null?'HAR in attesa di 22 finestre per i regressori e 30 esempi disponibili per il training.':'HAR · prossima finestra: √RV prevista '+pct(Math.sqrt(h.next))+' · '+h.trained+' precedenti di training.')+' Confronti cronologici '+h.tests.length+' · QLIKE HAR '+fmt(ql,4)+' · media 22 finestre '+fmt(hb,4)+'. Finestre con regressori in ritardo: '+h.lateFeatures+'. HAR usa la prima versione osservata delle barre e solo esiti già pubblicati. Senza available_utc si assume disponibilità a fine barra.</p>'+issue;riskChart(m.path);
});
function pathTables(p,cfg,grid){
 const bounds=(b,f)=>b[0]===null?'—':f(b[0])+' – '+f(b[1]),mins=b=>bounds(b,x=>fmt(x,1)),ps=b=>bounds(b,pct),points=b=>bounds(b,x=>fmt(x,3));
 const o=[p.lower,p.upper],row=(label,fn)=>[label,...o.map(fn)];
 const a=grid(['Primo passaggio empirico','Inferiore','Superiore'],[
 row('Touch osservati',z=>z.touched),row('Sedute senza touch',z=>z.nonTouch),row('Tempo medio | touch · min',z=>mins(z.time)),row('Mediana tempo | touch · min',z=>mins(z.timeQuant[1])),row('Overshoot al touch · punti',z=>points(z.overshoot)),
 row('Break | touch · close',z=>pct(z.pBreak)),row('Reject | touch · close',z=>pct(z.pReject)),row('Irrisolto | touch',z=>pct(z.pUnresolved)),row('Break confermati',z=>z.nBreak),row('Recross | break · limiti',z=>ps(z.recross)),row('Break con esito recross censurato',z=>z.recrossCensored)
 ]);
 const b=grid(['Misura di percorso','Limiti OHLC'],[['Drawdown massimo medio · % open',ps(p.drawdown)],['Run-up massimo medio · % open',ps(p.runup)],['Frequenza DD > '+cfg.lower+'% open',ps(p.ddExceeded)],['Tempo medio in banda · min',mins(p.occupation)],['Frequenza in banda ≥ '+cfg.occupShare+'% del tempo',ps(p.occupationEvent)],['Occupazione campionata ai close · min',fmt(p.occupationClose,1)]]);
 const t=grid(['Minuti','Touch L nel bin','Survival L','Hazard L / bin','Touch U nel bin','Survival U','Hazard U / bin','Quota RV'],p.lower.curve.map((x,i)=>{const y=p.upper.curve[i];return [x.minutes,x.events,pct(x.survival),pct(x.hazard),y.events,pct(y.survival),pct(y.hazard),pct(p.clock[i].fraction)];}));
 return '<h3>Sopravvivenza fino al primo tocco</h3><p class="hint">Barriera inferiore in ambra · superiore in azzurro</p><svg font-family="Consolas" viewBox="0 0 720 196" preserveAspectRatio="none" id="tmRiskPlot" role="img" aria-label="Sopravvivenza empirica a ciascuna barriera" style="width:100%;height:195px;display:block;touch-action:pan-y"></svg><label for="tmRiskProbe">Tempo trascorso nella finestra</label><input type="range" id="tmRiskProbe" step="1" min="0" style="width:100%"><p class="tm-status" aria-live="polite" id="tmRiskRead"></p><div class="tm-grid">'+a+b+'</div><details class="tm-guide"><summary>Curva di sopravvivenza, hazard discreto e clock di volatilità</summary>'+t+'</details>';
}
function riskChart(p){
 const host=$('RiskPlot'),probe=$('RiskProbe'),read=$('RiskRead');if(!host||!probe||!read)return;
 const days=p.lower.curve[0].atRisk,n=p.lower.curve.length,W=720,H=196,left=40,right=16,top=12,bottom=25,inner=W-left-right;
 const X=i=>left+inner*i/n,Y=s=>top+(H-top-bottom)*(1-s);
 const line=side=>{let d='M'+X(0)+','+Y(1);for(let i=0;i<n;i++)d+='H'+X(i+1)+'V'+Y(side.curve[i].survival);return d;};
 const graph=[0,.25,.5,.75,1].map(v=>'<line x1="'+left+'" x2="'+(W-right)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="#162e45"/><text x="'+(left-4)+'" y="'+(Y(v)+3)+'" text-anchor="end" fill="#99b2ca" font-size="10">'+Math.round(v*100)+'%</text>').join('')+'<path d="'+line(p.lower)+'" stroke="#d2d3c8" fill="none" stroke-width="2.6"/><path d="'+line(p.upper)+'" stroke="#97d8ef" fill="none" stroke-width="2.2"/>';
 probe.max=n;probe.value=n;const mark=i=>{i=Math.max(0,Math.min(n,Math.round(i)));probe.value=i;
  const lo=p.lower.curve[i-1],up=p.upper.curve[i-1];read.textContent=i===0?'Origine · '+days+' finestre a rischio per ciascuna barriera.':(i*p.minutes)+' min · survival inferiore '+pct(lo.survival)+' / superiore '+pct(up.survival)+' · hazard del bin L '+pct(lo.hazard)+' / U '+pct(up.hazard)+' · a rischio L '+lo.atRisk+' / U '+up.atRisk;
  host.innerHTML=graph+'<line x1="'+X(i)+'" x2="'+X(i)+'" y1="'+top+'" y2="'+(H-bottom)+'" stroke="#e4eaea" stroke-dasharray="3,3"/>'+[lo?.survival??1,up?.survival??1].map((v,j)=>'<circle cx="'+X(i)+'" cy="'+Y(v)+'" r="'+(j?3:5)+'" fill="'+(j?'#97d8ef':'#d2d3c8')+'"/>').join('')+'<text x="'+left+'" y="'+(H-3)+'" fill="#99b2ca" font-size="11">0 min</text><text x="'+(W-right)+'" y="'+(H-3)+'" text-anchor="end" fill="#99b2ca" font-size="11">'+p.horizon+' min</text>';};
 const pointer=e=>{const r=host.getBoundingClientRect();if(r.width>0)mark(((e.clientX-r.left)*W/r.width-left)*n/inner);};
 host.onpointermove=pointer;host.onpointerdown=pointer;probe.oninput=()=>mark(Number(probe.value));mark(n);
}
let barToken=0;for(const id of ['Symbol','Open','Close','Interval','Stamp','AsOf','Down','Up','Bars','Buffer','Recross','Occup','Trunc'])$(id).addEventListener('input',()=>barToken++);
$('SaveBars').onclick=()=>{if(state.study)exportFile('Quantistes_studio_ohlc.json',state.study);};
window.addEventListener('quantistes:distribution',e=>{if(!$('AsOf').value&&e.detail?.result?.cfg?.asof)$('AsOf').value=e.detail.result.cfg.asof.slice(0,19);if(state.settings&&state.revision!==window.Desk.state.revision)discard();});
window.TimeResearchUI={invalidate(){if(state.settings||state.working)discard();}};
})();
