'use strict';
const Q=QuantCore,$=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—',plain=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):'—',pct=(v,n=2)=>Number.isFinite(v)?(100*v).toFixed(n)+'%':'—';
const state={files:[],parsed:null,result:null,stale:true,busy:false,demo:false,ohlc:null,term:null,revision:0,workerUsed:false};
function text(id,s){$(id).textContent=s;}
function toast(s){text('toast',s);$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function status(s,type=''){text('statusText',s);$('status').className='statusline '+type;}
function stale(msg='Parametri modificati: ricalcola per aggiornare livelli, grafici ed export.'){window.QuantistesPlots.cleanDensity();renderIppoProbe(null);
  window.QuantistesStability?.reset();
  window.ImpliedScreen?.reset();window.DistributionUI?.invalidate('Dati o parametri modificati: ricalcola i livelli.');window.DistributionExtensions?.invalidate();
  window.TimeResearchUI?.invalidate();state.stale=true;window.VolCubeDesk?.sync();window.CVIDeskMonitor?.clear();window.CVIDeskFiles?.clear();for(const id of ['kpiSettlement','kpiIppo','kpiWS','kpiSD','kpiFit','snapshotTitle','qualityBadge','scenarioBadge'])text(id,'—');for(const id of ['smileChart','densityChart','fitBody','auditFacts','atmDeskFacts','skewFacts','asymmetryBody','cvFacts','termResult','warnings','importAudit'])$(id).replaceChildren();$('wsDiagnostic').classList.add('hidden');state.term=null;state.revision++;renderLevels();renderMainChart();window.SystematicUI?.invalidate();text('deskQuality','Parametri o dati modificati: i risultati precedenti non sono esportabili fino al ricalcolo.');renderHorizonCheck();if(!state.busy)status(msg,'warn');document.querySelectorAll('.exportbtn').forEach(b=>b.disabled=true);$('exportText').classList.add('export-stale');$('exportText').value='Ricalcola prima di esportare.';syncSession();
}
function tab(name){$('qtWorkArea').classList.toggle('qd-surface',name==='volcube');window.CVIDeskMonitor?.open(name);window.CVIDeskFiles?.open(name);if(name==='implied')window.ImpliedScreen?.refresh();document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));window.QuantistesTerminal?.select(name);window.VolCubeDesk?.open(name);}
function metaFrom(parts){const rows=parts.flatMap(p=>p.rows);return{rows,headers:parts[0].headers,ivUnit:parts.map(p=>p.ivUnit).join(' / '),warnings:parts.flatMap(p=>p.warnings),bad:parts.flatMap(p=>p.bad),delimiter:parts.map(p=>p.delimiter).join(' / '),meta:{count:rows.length,expiries:[...new Set(rows.map(r=>r.expiry).filter(Boolean))].sort(),dates:[...new Set(rows.map(r=>r.time.slice(0,10)).filter(Boolean))].sort(),symbols:[...new Set(rows.map(r=>r.symbol))].sort(),latest:rows.map(r=>r.time).filter(Boolean).sort().pop()||'',spot:Q.median(rows.map(r=>r.spot)),zeroIV:rows.filter(r=>!Number.isFinite(r.iv)).length,zeroBid:rows.filter(r=>r.bid===0).length}};}
function options(id,values,current){$(id).innerHTML=values.length?values.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join(''):'<option value="">Da inserire manualmente</option>';if(values.includes(current))$(id).value=current;}
function currentSpot(){if(!state.parsed)return NaN;const asof=$('asof').value;if(!asof)return NaN;return Q.median(Q.selectSnapshot(state.parsed.rows,{asof,expiry:$('expiry').value,symbol:$('symbol').value}).rows.map(r=>r.spot));}
function datasetSummary(){const p=state.parsed;if(!p)return;text('dataMeta',`${p.meta.count} righe · ${p.meta.expiries.length} scadenza/e · ${p.meta.dates.length} data/e. ${p.meta.zeroIV} IV nulle/non valide.`);text('settlementHint','Inserisci il settlement di riferimento per questo snapshot. Spot nel CSV: '+fmt(currentSpot())+'.');}
function selectedSnapshotInfo(keepDate=true){
  if(!state.parsed)return {latest:'',rows:0,dates:[]};
  return Q.snapshotInfo(state.parsed.rows,{symbol:$('symbol').value,expiry:$('expiry').value,date:keepDate?$('asof').value.slice(0,10):''});
}
function nextTradingDay(date){
 const fix=window.DeskCalendar10.fixing(date);
 if(!date||(!fix.isSession&&!/^\d{4}-\d\d-\d\d$/.test(date)))return null;
 const t=Date.parse(date+'T12:00:00Z');
 if(!Number.isFinite(t))return null;
 for(let n=1;n<=12;n++){
  const d=new Date(t+n*864e5).toISOString().slice(0,10),f=window.DeskCalendar10.fixing(d);
  if(f.isSession)return f;
 }
 return null;
}
function applyFixing(date){
 const f=window.DeskCalendar10.fixing(date);
 $('expiryTime').value=f.etClose||'';
 text('fixingNote',f.isSession?('Fixing SPXW '+f.etClose+' ET · '+f.romeFix+' a Roma.'+(f.verified?'':' Calendario indicativo: verifica la specifica contrattuale.')):'Verifica la data e il fixing del contratto.');
}
function changeExpiry(date){
 const old=$('expiry').value,clock=$('expiryTime').value,oldTarget=$('target').value;
 const linked=!oldTarget||oldTarget===old+'T'+clock||oldTarget===old+'T'+clock+':00';
 $('expiry').value=date;applyFixing(date);
 if(linked)$('target').value=date&&$('expiryTime').value?date+'T'+$('expiryTime').value:'';
 renderSnapshotInfo();stale();
}
function syncSession(){
 const has=!!state.parsed?.rows.length;
 $('qtWorkArea').classList.toggle('qd-empty',!has);
 $('calculate').disabled=!has||state.busy;
 $('downloadAudit').disabled=!state.result||state.stale;
 $('downloadAudit2').disabled=!state.result||state.stale;
 $('sessionTitle').textContent=has?'Chain della sessione':'Apri una sessione SPXW';
 $('sessionBody').textContent=has?state.files.map(f=>f.name).join(' · ')+'  |  '+state.parsed.rows.length+' righe · '+state.parsed.meta.expiries.length+' scad.':'Carica una chain per analizzare smile, distribuzioni e livelli al fixing. Per confrontare più scadenze, apri la superficie.';
 $('sessionFile').textContent=has?'Sostituisci CSV':'Importa chain CSV';
 if(!has){text('snapshotTitle','In attesa delle quotazioni');text('scenarioBadge','SPXW');}
 if(has&&state.stale)text('snapshotTitle',($('symbol').value||'SPXW')+' · cutoff '+($('asof').value||'—').replace('T',' ')+' ET');
}
$('sessionFile').onclick=()=>$('csvFile').click();
$('sessionVOLS').onclick=()=>tab('volcube');

function renderSnapshotInfo(){
  const info=selectedSnapshotInfo(),asof=$('asof').value;
  if(!info.latest){text('snapshotInfo',info.rows?'Timestamp opzioni assente: inserisci manualmente lo snapshot.':'Nessuna riga per simbolo/scadenza selezionati.');return;}
  let detail='Ultima quota CSV per '+info.selection+' / '+info.expiry+': '+info.latest.replace('T',' ')+' ET.';
  if(asof){
    if(!info.requestedDateMatched)detail+=' La data snapshot selezionata non è presente in questa chain.';
    else{const sec=(Q.nyEpoch(asof)-Q.nyEpoch(info.latest))/1000;
      if(sec>0.001)detail+=' Snapshot '+(sec/60).toFixed(1)+' minuti dopo l’ultima quota.';
      else if(sec<-.001)detail+=' Snapshot precedente alle ultime quote: i dati futuri vengono esclusi.';
      else detail+=' Snapshot allineato all’ultima quota.';
      const age=Q.number($('maxAge').value);if(age>0&&sec>age)detail+=' Attenzione: tutte le quote datate selezionate sono oltre il limite di '+age+' secondi.';
    }
  }
  detail+=' Il confronto è con i timestamp del file, non con oggi.';
  text('snapshotInfo',detail);
}
function syncSnapshotFromCSV(){
  if(!state.parsed)return toast('Carica prima un CSV.');
  const info=selectedSnapshotInfo();if(!info.latest)return toast('Nessun timestamp opzioni valido per simbolo/scadenza selezionati.');
  $('asof').value=info.latest;
  // Align only the snapshot. Never silently change settlement, horizon, filters or forward.
  datasetSummary();renderSnapshotInfo();stale('Snapshot riallineato a '+info.latest.replace('T',' ')+' ET. Settlement e filtri invariati: verifica il target e ricalcola.');
  toast('Snapshot dal CSV. Settlement, target e filtri non modificati.');
}
function renderHorizonCheck(){
  const box=$('horizonDiagnostic');if(!state.parsed){box.classList.add('hidden');return;}
  const ck=Q.horizonCheck(state.parsed.rows,config());
  if(ck.code==='INCOMPLETE_TIME_INPUT'||ck.code==='TARGET_MATCHES_EXPIRY'){box.classList.add('hidden');return;}
  box.classList.remove('hidden');box.style.borderColor=ck.blocked?'#e4dfcc':'#dfdccb';
  text('horizonTitle',ck.blocked?'CSV non adatto al target richiesto':'Target e scadenza differenti');
  text('horizonMessage',ck.message);
  text('horizonHint',ck.blocked?'Seleziona una scadenza con fixing successivo al cutoff e coerente con il target.':'Cutoff e scadenza provengono dalla chain selezionata.');
  $('useEligibleExpiry').classList.toggle('hidden',!ck.recommendedExpiry||ck.recommendedExpiry===$('expiry').value);
}
function useEligibleExpiry(){
  if(!state.parsed)return;
  const ck=Q.horizonCheck(state.parsed.rows,config());
  if(!ck.recommendedExpiry)return toast('Nessuna scadenza nel CSV copre il target: esporta la chain successiva.');
  $('expiry').value=ck.recommendedExpiry;$('expirySelect').value=ck.recommendedExpiry;applyFixing(ck.recommendedExpiry);
  renderSnapshotInfo();stale('Scadenza '+ck.recommendedExpiry+' selezionata. Snapshot, settlement, target e filtri invariati: ricalcola.');
}
function inputAuditDownload(){
  if(!state.parsed)throw new Error('Carica prima un CSV.');
  const rep={version:Q.VERSION,files:state.files.map(f=>f.name),importMeta:state.parsed.meta,headers:state.parsed.headers,config:config(),inputCheck:Q.horizonCheck(state.parsed.rows,config()),result:state.result&&!state.stale?Q.report(state.result):null};
  download('Quantistes_Diagnosi_CSV.json',JSON.stringify(rep,null,2),'application/json');
}
function renderQuoteDiagnostic(){
  const r=state.result,box=$('wsDiagnostic');
  if(!r||r.ws||!r.errors.ws){box.classList.add('hidden');return;}
  box.classList.remove('hidden');text('wsDiagnosticMessage',r.inputCheck?.blocked?'Il controllo della scadenza precede il fit. I conteggi qui sotto provengono dai bid/ask effettivi: nessun prezzo è stato ricostruito o alterato.':r.errors.ws);
  const a=r.quoteAudit;let detail='';
  if(a&&!r.errors.ws)detail=`${a.selectedRows} righe selezionate · ${a.otmCandidates} candidati OTM · ${a.used} utilizzabili. I conteggi riportano il primo filtro non superato da ciascuna quota. `;
  if(r.inputCheck?.blocked&&a)detail+=`${a.otmZeroBid} bid OTM a zero · bid OTM massimo ${fmt(a.otmMaxBid)}. `;
  detail+='Il settlement è il riferimento dei livelli; l’orario snapshot è quello delle quote. Nessun filtro è stato disattivato automaticamente.';
  text('wsDiagnosticDetail',detail);
  $('syncSnapshotError').classList.toggle('hidden',!a?.reasons?.['Quote fuori finestra temporale']);
}
function parseFiles(reset=true){
  if(!state.files.length)throw new Error('Carica un CSV opzioni.');
  const parts=state.files.map(f=>Q.parseCSV(f.text,{ivUnit:$('ivUnit').value})),p=metaFrom(parts);state.parsed=p;
  if(reset){
    options('symbol',p.meta.symbols,p.meta.symbols.includes('SPXW')?'SPXW':p.meta.symbols[0]);
    const rootInfo=Q.snapshotInfo(p.rows,{symbol:$('symbol').value}),rootRows=p.rows.filter(r=>r.symbol===$('symbol').value),expiries=[...new Set(rootRows.map(r=>r.expiry).filter(Boolean))].sort();
    const cutoff=Q.nyEpoch(rootInfo.latest),expiry=expiries.find(e=>window.DeskCalendar10.fixing(e).epochMs>cutoff)||expiries.at(-1)||'';
    options('expirySelect',p.meta.expiries,expiry);$('expiry').value=expiry;applyFixing(expiry);
    const selectedInfo=Q.snapshotInfo(p.rows,{symbol:$('symbol').value,expiry});$('asof').value=selectedInfo.latest||rootInfo.latest||'';
    const selectedDate=$('asof').value.slice(0,10);$('target').value=expiry?expiry+'T'+$('expiryTime').value:'';
    $('settlement').value='';
    $('forward').value='';$('overrideHours').value='';
    options('termFirst',p.meta.expiries,p.meta.expiries[0]);options('termSecond',p.meta.expiries,p.meta.expiries[1]||p.meta.expiries[0]);
    state.ohlc=null;$('removeOHLC').classList.add('hidden');text('ohlcBadge','NESSUNA SERIE OHLC');
  }
  datasetSummary();renderSnapshotInfo();stale('CSV importato. Inserisci il settlement, verifica orari e scadenza, poi calcola.');
  $('termButton').disabled=p.meta.expiries.length<2;
  text('termResult',p.meta.expiries.length<2?'Una sola scadenza disponibile: varianza forward non identificabile. Nessuna seconda maturità viene simulata.':'Scegli due scadenze dello stesso snapshot e calcola la varianza forward ATM.');
}
function config(){const num=id=>Q.number($(id).value),val=id=>$(id).value;return{cviWingProfile:val('cviFitMode'),settlement:num('settlement'),asof:val('asof'),expiry:val('expiry'),expiryTime:val('expiryTime'),target:val('target'),symbol:val('symbol'),rate:num('rate')/100,dividend:num('dividend')/100,forward:val('forward').trim()?num('forward'):0,minBid:num('minBid'),maxAge:num('maxAge'),maxSpread:num('maxSpread'),smoothing:num('smoothing'),autoSmoothing:$('autoSmoothing').checked,maxPairGap:num('maxPairGap'),tailPenalty:num('tailPenalty'),regularTails:$('regularTails').checked,robust:$('robust').checked,sensitivity:$('sensitivity').checked,quoteSource:val('quoteSource'),ippoClock:'calendar',ippoIV:'desk',strictIppo:false,anchor:val('anchor'),maxSigma:num('maxSigma'),step:num('step'),overrideHours:val('overrideHours')?num('overrideHours'):0};}
function computeAsync(rows,cfg,revision){
  return new Promise((resolve,reject)=>{
    let worker,url;
    try{
      const src=["core-data", "core-fit", "core-cert", "core-lab-engine", "core-marks", "core-bounds", "core-intraday", "quant-core-script"].map(id=>$(id).textContent).join('\n')+`\nself.onmessage=e=>{try{const r=QuantCore.compute(e.data.rows,{...e.data.cfg,progress:message=>self.postMessage({progress:message})});self.postMessage({report:QuantCore.report(r)});}catch(err){self.postMessage({error:err.message});}};`;
      url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));worker=new Worker(url);state.workerUsed=true;
      const cleanup=()=>{worker.terminate();URL.revokeObjectURL(url);};
      worker.onmessage=e=>{if(e.data.progress){if(state.revision===revision)status(e.data.progress+'…');return;}cleanup();if(e.data.error)reject(new Error(e.data.error));else{try{resolve(Q.hydrate(e.data.report));}catch(err){reject(err);}}};
      worker.onerror=e=>{cleanup();reject(new Error('Errore nel motore isolato: '+e.message));};
      worker.postMessage({rows,cfg});
    }catch(e){if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);state.workerUsed=false;
      try{resolve(Q.compute(rows,cfg));}catch(err){reject(err);}
    }
  });
}
async function calculate(){
  if(state.busy)return;const revision=state.revision;state.busy=true;state.stale=true;window.DistributionUI?.invalidate('Ricalcolo della curva in corso…');window.DistributionExtensions?.invalidate();
  document.querySelectorAll('.exportbtn').forEach(b=>b.disabled=true);
  $('calculate').disabled=true;text('calculate','Calcolo e controlli…');status('Calibrazione della curva prezzi e verifica dei due modelli…');
  await new Promise(r=>setTimeout(r,25));
  try{
    if(!state.parsed)throw new Error('Carica un CSV opzioni.');
    const r=await computeAsync(state.parsed.rows,{...config(),cviFiles:state.files},revision);
    if(state.revision!==revision){status('Dati o parametri cambiati durante il calcolo: risultato scartato. Ricalcola.','warn');return;}
    state.result=r;state.stale=false;syncSession();renderAll();const partial=Object.keys(r.errors).length>0;
    status(r.inputCheck?.blocked?'CSV non adatto al target: serve una chain con scadenza corretta. Consulta la diagnosi.':partial?'Calcolo parziale: '+Object.values(r.errors).join(' · '):'Calcolo completato · '+(r.ws?r.ws.cvi.marks.market.inside+'/'+r.ws.cvi.marks.market.bilateral+' premi bilaterali nel bid/ask · CVI verificato':'mark sospeso')+(r.isScenario?' · scenario temporale':''),r.inputCheck?.blocked||r.quality?.level==='red'?'err':partial||r.isScenario?'warn':'');
    $('exportText').classList.remove('export-stale');refreshExport();
  }catch(e){if(state.revision!==revision)return;state.result=null;state.stale=true;document.querySelectorAll('.exportbtn').forEach(b=>b.disabled=true);status(e.message,'err');clearResults(e.message);}
  finally{state.busy=false;$('calculate').disabled=false;text('calculate','Calcola livelli');syncSession();}
}
function updateIppoMode(){}
function referenceLabel(){return state.anchorSource||'settlement inserito manualmente';}
function renderDeskAudit(){
  const r=state.result;
  if(!r?.ws){text('deskQuality',r?.errors?.ws||'Mark CVI sospeso.');$('atmDeskFacts').innerHTML='';$('asymmetryBody').innerHTML='';text('cvFacts','');return;}
  const w=r.ws,c=w.cvi,m=c.marks,q=m.market;
  $('deskQuality').style.borderColor=C.green;
  $('deskQuality').innerHTML='<strong>'+esc(m.profile==='CVI_WING_MID_BOX_1'?'CVI ALI PONDERATE VERIFICATO':'CVI DESK VERIFICATO')+'</strong> · '+q.inside+'/'+q.bilateral+' premi bilaterali nello spread · '+q.sidedInside+'/'+q.unilateral+' limiti unilaterali rispettati.<br><span class="hint">Controlli sullo snapshot selezionato e sulla geometria continua della smile. La precisione delle probabilità estreme dipende dalla copertura degli strike.</span>';
  $('atmDeskFacts').innerHTML=[fact('Forward di parità',fmt(r.forward.F,4)),fact('IV ATM-forward CVI',pct(w.ivATM,4)),fact('Varianza totale ATM',w.model.atmW.toExponential(6)),fact('Nodi del mark',m.canonical.knots.length),fact('Nodi locali aggiunti',m.addedKnots?.length||0),fact('Scadenza · ore residue',fmt(r.T*365*24,3)),fact('Mediana IPPO Desk',r.ippo?.variant==='desk'?fmt(r.ippo.median):'—'),fact('Mediana Wall Street',fmt(w.median)),fact('SD del prezzo IPPO',fmt(r.ippo?.sd)),fact('SD del prezzo Wall Street',fmt(w.sd))].join('');
  $('asymmetryBody').innerHTML=w.asymmetry.map(v=>'<tr><td>'+zlabel(v.z)+'</td><td class="num">'+fmt(v.downPoints)+'</td><td class="num">'+fmt(v.upPoints)+'</td><td class="num">'+fmt(v.ratioDownUp,4)+'</td><td class="num">'+fmt(v.difference)+'</td></tr>').join('');
  text('cvFacts','Impronta del mark '+m.candidateFingerprint+' · '+c.midGeometry.convexityViolations+' violazioni locali di convessità su '+c.midGeometry.triples+' terne di mid. '+(r.cfg.sensitivity?w.sensitivityFits+' rifit di sensibilità rilasciati su 2.':'Sensibilità disattivata.'));
}
function clearResults(message){window.QuantistesPlots.cleanDensity();window.CVIDeskMonitor?.clear();window.CVIDeskFiles?.clear();renderQuoteRanges(null);renderIppoProbe(null);window.ImpliedScreen?.reset();window.QuantistesStability?.reset();window.DistributionUI?.invalidate(message);window.DistributionExtensions?.invalidate();text('deskQuality',message);$('wsDiagnostic').classList.add('hidden');for(const id of ['kpiSettlement','kpiIppo','kpiWS','kpiSD','kpiFit'])text(id,'—');for(const id of ['levelChart','smileChart','densityChart'])$(id).innerHTML='<div class="empty">'+esc(message)+'</div>';for(const id of ['levelsBody','fitBody','auditFacts','skewFacts','atmDeskFacts','asymmetryBody'])$(id).innerHTML='';text('exportText','');$('exportText').value='';}
function zlabel(z){return(z===0?'0':z<0?'−'+Math.abs(z):'+'+z)+'σ';}
function fact(label,value){return '<div><div class="factlabel">'+esc(label)+'</div><div class="factvalue">'+esc(value)+'</div></div>';}
function renderAll(){window.VolCubeDesk?.sync();window.CVIDeskMonitor?.refresh();window.CVIDeskFiles?.refresh();const r=state.result,w=r.ws,i=r.ippo;text('snapshotTitle',`${r.cfg.symbol||'SPX'} · snapshot ${r.cfg.asof.replace('T',' ')} ET → target ${r.cfg.target.replace('T',' ')} ET`);text('scenarioBadge',r.inputCheck?.blocked?'CSV NON IDONEO':r.isScenario?'SCENARIO DI ORIZZONTE':'TARGET = SCADENZA');$('scenarioBadge').className='badge '+(r.inputCheck?.blocked?'err':r.isScenario?'warn':'neutral');text('kpiSettlement',fmt(r.cfg.settlement));text('kpiAnchor',referenceLabel());text('kpiIppo',i?pct(i.iv,3):'—');text('kpiIppoSub',i?(i.variant==='desk'?'Curva prezzi comune · varianza target':i.unsuitableForTarget?'IV terminale · sola replica tecnica':i.exact?'Replica spline + bande 1/252':i.clock==='legacy252'?'Bande 1/252 · IV/nodi modificati':'Tempo target ACT/365'):'Famiglia non calcolabile');text('kpiWS',w?pct(w.ivATM,3):'—');text('kpiWSSub',w?'Varianza fino a scadenza: '+fmt(r.T*365*24,1)+' ore':'Controlla messaggio di errore');text('kpiSD',w?fmt(w.sd)+' pt':'—');text('kpiFit',w?pct(w.cvi.marks.market.inside/w.cvi.marks.market.bilateral,1):'—');text('kpiFitSub',w?w.cvi.marks.market.inside+'/'+w.cvi.marks.market.bilateral+' bilaterali · '+w.cvi.marks.market.sidedInside+'/'+w.cvi.marks.market.unilateral+' unilaterali':'Qualità del fit, non tasso di successo');
  window.QuantistesStability?.render(r);renderLevels();renderMainChart();renderSmile();renderDensity();renderAudit();renderDeskAudit();renderSnapshotInfo();renderHorizonCheck();renderQuoteDiagnostic();refreshExport();window.DistributionUI?.render(r,state.parsed?.rows||[]);
  $('skewFacts').innerHTML=w?[fact('Mediana Q (non linea 0σ)',fmt(w.median)),fact('Media della distribuzione mappata',fmt(w.mapping.anchor)),fact('IV put 25Δ · forward delta',pct(w.skew25.ivPut25,3)),fact('IV call 25Δ · forward delta',pct(w.skew25.ivCall25,3)),fact('Skew normalizzato / IV50Δ',fmt(w.skew25.ratio,4)),fact('σ Q effettiva, punti SPX',fmt(w.sd)),fact('Curva · dIV/d log(K/F)',fmt(w.atmCheck.dIVdLogK,4)),fact('Curva · d²IV/d log(K/F)²',fmt(w.atmCheck.d2IVdLogK2,3))].join(''):'<div class="muted">Wall Street non disponibile.</div>';
}
function formatLevelTail(p,z){
  if(!Number.isFinite(p))return '—';
  if(p>0&&p<.000001)return (100*p).toExponential(3)+'%';
  return pct(p,Math.abs(z)>=3||p<.01?4:2);
}
function renderIppoProbe(r,reset=false){
  const pick=$('ipTailLevel'),out=$('ipTailValues'),i=r?.ippo;
  if(!pick||!out)return;
  if(!i||i.variant!=='desk'){
    pick.disabled=true;pick.innerHTML='';out.textContent=i?'La replica tecnica genera soglie in unità di volatilità log. Per la legge lognormale ATM seleziona Ippo Desk.':'Ippo Desk richiede la curva prezzi calibrata.';return;
  }
  pick.disabled=false;
  if(reset){
    const was=pick.value,choices=i.levels.filter(l=>l.z!==0);
    pick.innerHTML=choices.map(l=>'<option value="'+l.z+'">'+(l.z<0?'Coda inferiore ':'Coda superiore ')+zlabel(l.z)+'</option>').join('');
    pick.value=choices.some(l=>String(l.z)===was)?was:String(choices.find(l=>l.z===-3)?.z??choices[0]?.z);
  }
  const l=i.levels.find(l=>l.z===Number(pick.value));if(!l||!l.conditionalTail){out.textContent='Seleziona un livello diverso dal riferimento.';return;}
  const a=l.conditionalTail,meta=Q.levelMeasurement(r,l),en=i.atmEnvelope,z=l.z;
  const data=[fact('Soglia · punti',fmt(l.price)),fact('Coda della baseline ATM',formatLevelTail(a.probability,z)),fact('Coda della smile sulla stessa soglia',formatLevelTail(meta.smileTail,z)),
    fact('Distanza dalla media / SD del prezzo',fmt(meta.priceStandardDeviations,4)),fact('SD del prezzo IPPO · punti',fmt(i.sd,4)),fact('Media dentro la coda IPPO · punti',fmt(a.mean,4)),
    fact('SD dentro la coda IPPO · punti',fmt(a.sd,4)),fact('Superamento medio della soglia · punti',fmt(a.meanExcess,4))];
  if(en?.available){
    data.push(fact('Premio ATM da quote vicine',fmt(en.lowerPremium,4)+' → '+fmt(en.upperPremium,4)),fact('SD del prezzo compatibile · punti',fmt(en.targetSDLow,3)+' → '+fmt(en.targetSDHigh,3)),fact('Intervallo del livello da quote ATM',fmt(l.atmQuoteRange?.low,3)+' → '+fmt(l.atmQuoteRange?.high,3)),fact('Premio ATM del fit',fmt(en.fittedPremium,4)+(en.fitInside?' · entro i vincoli locali':' · ESTERNO ai vincoli locali')));
  }
  const source=en?.available?'Strike bid/ask usati: '+en.quotes.map(q=>q.side+' '+fmt(q.strike)+' ['+fmt(q.bid)+' / '+fmt(q.ask)+']').join(' · ')+'.':en?.reason||'Banda da quote non disponibile.';
  out.innerHTML='<div class="factgrid">'+data.join('')+'</div><p class="hint">'+esc(source)+'</p>';
}
function quoteRange(r,z){
  if(!r?.ws||r.isScenario||!z)return null;
  const c=r.ws.cvi,q=c.quantiles.find(v=>v.z===z);if(!q)return null;
  const scale=r.ws.mapping.anchor/c.F;
  return {low:Number.isFinite(q.payoffLo)?scale*q.payoffLo:null,high:Number.isFinite(q.payoffHi)?scale*q.payoffHi:null};
}
function renderQuoteRanges(r){
  const box=$('cviLevelBounds'),body=$('cviBoundRows'),note=$('cviBoundNote');body.replaceChildren();note.textContent='';box.hidden=!r?.ws||state.stale;
  if(box.hidden)return;
  const w=r.ws,observed=w.cvi.observedStrike;
  if(r.isScenario){note.textContent='I limiti delle quote riguardano il fixing della scadenza. Il target selezionato usa una trasformazione di orizzonte. Per confrontare valori sulla stessa data seleziona «Uguale a scadenza».';return;}
  const rows=w.levels.filter(l=>l.z&&quoteRange(r,l.z)).map(l=>{const range=quoteRange(r,l.z);return '<tr><td>'+zlabel(l.z)+'</td><td>'+fmt(l.price)+'</td><td>'+fmt(range.low)+'</td><td>'+fmt(range.high)+'</td><td>'+esc(l.withinLiquid?'Fra strike bilaterali':'Oltre gli strike bilaterali')+'</td></tr>';});
  body.innerHTML=rows.join('');note.textContent='Coordinate '+(r.cfg.anchor==='native'?'native SPX':'ribasate al settlement '+fmt(r.cfg.settlement))+' · strike bilaterali nativi da '+fmt(observed[0])+' a '+fmt(observed[1])+'. Ogni quantile compatibile con i vincoli di prezzo, supporto e media ricade fra i limiti esterni. Gli estremi possono essere conservativi. La larghezza della fascia non è un intervallo di confidenza.';
}

function renderLevels(){
  renderQuoteRanges(state.result);
  const r=state.result;
  if(!r||state.stale){$('levelsBody').innerHTML='<tr><td colspan="8">Ricalcola i livelli sui parametri correnti.</td></tr>';renderIppoProbe(null);return;}
  const f=$('tableFamily').value,objs=f==='both'?[r.ippo,r.ws]:[r[f]],levels=objs.filter(Boolean).flatMap(o=>o.levels).sort((a,b)=>a.price-b.price);
  $('levelsBody').innerHTML=levels.map(l=>{
    const isWS=l.family==='Wall Street',m=Q.levelMeasurement(r,l),bad=/Sensibile|fragile|extrapolata/.test(l.tail);
    return '<tr class="'+(l.z===0?'settlement':'')+'"><td class="'+(isWS?'gold':'blue')+'">'+(l.z===0?'RIF.':zlabel(l.z))+' '+l.family+'</td><td class="num">'+fmt(l.price)+'</td><td class="num">'+(l.price-r.cfg.settlement>0?'+':'')+fmt(l.price-r.cfg.settlement)+'</td><td class="num">'+fmt(m.priceStandardDeviations,3)+'</td><td class="num">'+formatLevelTail(m.modelTail,l.z)+'</td><td class="num">'+formatLevelTail(m.smileTail,l.z)+'</td><td class="num">'+(r.cfg.sensitivity&&Number.isFinite(l.sensitivityWidth)?fmt(l.sensitivityWidth,2):'—')+'</td><td><span class="quality-pill '+(bad?'warn':l.z===0?'ref':'')+'">'+esc(l.tail)+'</span></td></tr>';
  }).join('')||'<tr><td colspan="8">Famiglia non disponibile: consulta l’audit.</td></tr>';
  renderIppoProbe(r,true);
}
const C={gold:'#d2d3c8',blue:'#97d8ef',grid:'#162e45',muted:'#99b2ca',fg:'#e8ecea',red:'#e4dfcc',green:'#7cc2e0'};
function svgStart(W,H,title){return `<svg font-family="Consolas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" style="font-family:Consolas"><rect width="${W}" height="${H}" fill="#071525"/>`;}
function svgText(x,y,s,color=C.muted,size=11,anchor='start',extra=''){return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;}
function line(x1,y1,x2,y2,color,width=1,dash=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?'stroke-dasharray="'+dash+'"':''}/>`;}
function renderMainChart(){const r=state.result;if(state.stale){$('levelChart').innerHTML='<div class=empty>Ricalcola per aggiornare la mappa dei livelli.</div>';return;}if(!r){$('levelChart').innerHTML='<div class="empty">Carica i dati e calcola i livelli.</div>';return;}
  const focus=Q.number($('focus').value),levels=[];if($('showWS').checked&&r.ws)levels.push(...r.ws.levels.filter(l=>l.z&&Math.abs(l.z)<=focus));if($('showIppo').checked&&r.ippo)levels.push(...r.ippo.levels.filter(l=>l.z&&Math.abs(l.z)<=focus));
  const bars=state.ohlc?state.ohlc.rows.slice(-250):[],prices=[r.cfg.settlement,...levels.map(l=>l.price),...bars.flatMap(b=>[b.low,b.high])];let lo=Math.min(...prices),hi=Math.max(...prices);let span=Math.max(hi-lo,r.cfg.settlement*.005);lo-=span*.08;hi+=span*.08;
  const W=1100,H=520,L=76,R=858,T=35,B=466,y=p=>B-(p-lo)/(hi-lo)*(B-T),x=j=>L+(j+.5)/Math.max(1,bars.length)*(R-L-15);
  let s=svgStart(W,H,'Mappa livelli SPX');s+=`<defs><clipPath id="priceClip"><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}"/></clipPath></defs>`;
  for(let k=0;k<=6;k++){const p=lo+(hi-lo)*k/6,yp=y(p);s+=line(L,yp,R,yp,C.grid,.75)+svgText(L-12,yp+4,fmt(p,1),C.muted,11,'end');}
  for(let k=0;k<=6;k++){const xp=L+(R-L)*k/6;s+=line(xp,T,xp,B,C.grid,.6,'2 7');}
  if(r.ws&&$('showWS').checked){const a=r.ws.levels.find(l=>l.z===-1),b=r.ws.levels.find(l=>l.z===1);if(a&&b)s+=`<rect x="${L}" y="${Math.max(T,y(b.price))}" width="${R-L}" height="${Math.max(0,Math.min(B,y(a.price))-Math.max(T,y(b.price)))}" fill="${C.gold}" fill-opacity="0.045"/>`;}
  s+='<g clip-path="url(#priceClip)">';
  if(bars.length){const bw=Math.max(1,Math.min(12,(R-L)/bars.length*.68));for(let j=0;j<bars.length;j++){const b=bars[j],xp=x(j),col=b.close>=b.open?C.green:C.red;s+=line(xp,y(b.high),xp,y(b.low),col,1);s+=`<rect x="${xp-bw/2}" y="${Math.min(y(b.open),y(b.close))}" width="${bw}" height="${Math.max(1,Math.abs(y(b.open)-y(b.close)))}" fill="${col}" fill-opacity=".8"><title>${esc(b.time)} ET · O ${b.open} H ${b.high} L ${b.low} C ${b.close}</title></rect>`;}}
  else{s+=svgText((L+R)/2,235,'MAPPA DI LIVELLI · NON UN PREZZO LIVE','#5e7b95',14,'middle');s+=svgText((L+R)/2,258,'Carica barre OHLC SPX oppure usa l’export Pine sul grafico reale.','#44627c',11,'middle');}
  for(const l of levels){const col=l.family==='Ippo'?C.blue:C.gold;s+=`<g opacity="${l.family==='Ippo'?.7:.9}"><title>${esc(zlabel(l.z)+' '+l.family+' · '+fmt(l.price)+' · SD prezzo '+fmt(Q.levelMeasurement(r,l).priceStandardDeviations,3)+' · coda smile '+formatLevelTail(Q.levelMeasurement(r,l).smileTail,l.z))}</title>`+line(L,y(l.price),R,y(l.price),col,Math.abs(l.z)%1===0?1:.65,l.family==='Ippo'?'4 5':'')+'</g>';}
  s+=line(L,y(r.cfg.settlement),R,y(r.cfg.settlement),'#e4eaea',1.6)+'</g>';
  const labels=[...levels.map(l=>({...l})),{z:0,price:r.cfg.settlement,family:'SETTLEMENT'}].sort((a,b)=>y(a.price)-y(b.price));let prev=T-20;
  labels.forEach(l=>{l.labelY=Math.max(y(l.price),prev+15);prev=l.labelY;});if(labels.length&&labels.at(-1).labelY>B){let next=B+15;for(let j=labels.length-1;j>=0;j--){labels[j].labelY=Math.min(labels[j].labelY,next-15);next=labels[j].labelY;}}
  for(const l of labels){const col=l.z===0?'#e4eaea':l.family==='Ippo'?C.blue:C.gold;const tag=l.z===0?'RIF.':zlabel(l.z)+(l.family==='Ippo'?' I':' WS');s+=line(R+2,y(l.price),R+13,l.labelY,col,.7)+line(R+13,l.labelY,R+21,l.labelY,col,.7);s+=svgText(R+26,l.labelY+3.5,tag,col,10.5)+svgText(W-15,l.labelY+3.5,fmt(l.price),col,11,'end');}
  s+=svgText(L,19,'SPX / POINTS',C.muted,10)+svgText(R+25,19,'LIVELLO',C.muted,10)+svgText(W-15,19,'PREZZO',C.muted,10,'end');
  if(bars.length){for(let k=0;k<=4;k++){const j=Math.min(bars.length-1,Math.floor(k*(bars.length-1)/4));s+=svgText(x(j),490,bars[j].time.slice(5,10)+' '+bars[j].time.slice(11,16),C.muted,10,k===0?'start':k===4?'end':'middle');}}
  else{s+=svgText(L,493,'Snapshot: '+r.cfg.asof.replace('T',' ')+' ET',C.muted,10)+svgText(R,493,'Target: '+r.cfg.target.replace('T',' ')+' ET',C.muted,10,'end');}
  $('levelChart').innerHTML=s+'</svg>';text('chartSubtitle',r.inputCheck?.blocked?'CSV non idoneo al target · Ippo mostrato solo come replica tecnica, non come previsione.':'Riferimento '+fmt(r.cfg.settlement)+' · '+(r.isScenario?'scenario scalato':'target coincidente con scadenza')+' · finestra visiva ±'+focus+'σ');
  text('chartNote',bars.length?`${bars.length} barre reali mostrate (ultime 250 al massimo) · ${bars[0].time.replace('T',' ')} → ${bars.at(-1).time.replace('T',' ')} ET. Livelli dello snapshot selezionato.`:'Importa un CSV OHLC per sovrapporre le barre SPX ai livelli.');
}
function plot({title,series,points=[],vlines=[],yLabel='',xLabel='STRIKE SPX',xMin,xMax,yMin=0,yMax,container,area=false}){
  const W=1100,H=375,L=80,R=1040,T=38,B=316,x=v=>L+(v-xMin)/(xMax-xMin)*(R-L),y=v=>B-(v-yMin)/(yMax-yMin)*(B-T);let s=svgStart(W,H,title);const clip=container+'clip';s+=`<defs><clipPath id="${clip}"><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}"/></clipPath></defs>`;
  for(let j=0;j<=5;j++){const v=yMin+(yMax-yMin)*j/5,yy=y(v);s+=line(L,yy,R,yy,C.grid,.7)+svgText(L-12,yy+4,Math.abs(v)<.1&&v!==0?v.toFixed(4):v.toFixed(1),C.muted,10,'end');}
  for(let j=0;j<=6;j++){const v=xMin+(xMax-xMin)*j/6,xx=x(v);s+=line(xx,T,xx,B,C.grid,.7,'2 6')+svgText(xx,B+21,fmt(v,0),C.muted,10,'middle');}
  s+='<g clip-path="url(#'+clip+')">';for(const v of vlines){s+=line(x(v.x),T,x(v.x),B,v.color||C.muted,1,'4 5');}
  for(const ss of series){const a=ss.data.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));if(!a.length)continue;let d=a.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ');if(area)s+=`<path d="${d} L${x(a.at(-1)[0])} ${B} L${x(a[0][0])} ${B}Z" fill="${ss.color}" fill-opacity=".08"/>`;s+=`<path d="${d}" fill="none" stroke="${ss.color}" stroke-width="2" ${ss.dash?'stroke-dasharray="5 4"':''}/>`;}
  for(const p of points)if(Number.isFinite(p.y))s+=`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="${p.r||2.6}" fill="${p.color||C.gold}" fill-opacity=".7"><title>${esc(p.label||'')} · ${fmt(p.x)} / ${fmt(p.y,3)}</title></circle>`;
  s+='</g>';for(const v of vlines){const left=v.align==='end';s+=svgText(Math.max(L+5,Math.min(R-5,x(v.x)+(left?-6:6))),T-7,v.label,v.color||C.muted,10,left?'end':'start');}
  s+=svgText(L,19,yLabel,C.muted,10)+svgText(R,H-13,xLabel,C.muted,10,'end');$(container).innerHTML=s+'</svg>';
}
function renderSmile(){const r=state.result;if(!r)return;const w=r.ws,i=r.ippo;if(window.CVIDeskMonitor?.renderSkew())return;if(!w&&!i){$('smileChart').innerHTML='<div class="empty">Nessun modello disponibile.</div>';return;}
  let xmin=w?w.nativeLiquid[0]:i.points[0].strike,xmax=w?w.nativeLiquid[1]:i.points.at(-1).strike;
  const series=[],points=[];if(w){const m=w.model,curve=Array.from({length:241},(_,j)=>{const K=xmin+(xmax-xmin)*j/240,side=K<m.F?'PUT':'CALL';return[K,Math.sqrt(CVIFit.evaluate(w.cvi.marks.canonical,Math.log(K/m.F)).w/r.T)*100];});series.push({color:C.gold,data:curve});for(const q of m.fitted)if(Number.isFinite(q.mid))points.push({x:q.K,y:Q.impliedTotal(m.F,q.K,q.mid,m.D,q.side)/Math.sqrt(r.T)*100,color:C.gold,label:'Mid, clock coerente'});}
  if(i){const a=Math.max(xmin,i.points[0].strike),b=Math.min(xmax,i.points.at(-1).strike);series.push({color:C.blue,data:Array.from({length:181},(_,j)=>{const K=a+(b-a)*j/180;return[K,100*(i.variant==='desk'?i.iv:i.spline.at(Math.log(K/(i.fitReference||r.cfg.settlement))))];}),dash:true});if(i.variant!=='desk')i.points.forEach(p=>points.push({x:p.strike,y:100*p.iv,color:C.blue,r:3.5,label:'Nodo Ippo'}));}
  const all=series.flatMap(x=>x.data.map(p=>p[1])).concat(points.map(p=>p.y)).filter(v=>Number.isFinite(v)&&v>0),min=Math.max(0,Math.min(...all)*.9),max=Math.max(...all)*1.06;
  plot({title:'Smile implicito',series,points,vlines:[{x:r.forward.F,label:'F',color:'#adc3d7'}],xMin:xmin,xMax:xmax,yMin:min,yMax:max,yLabel:'IV ANNUALIZZATA (%)',container:'smileChart'});
}
function renderDensity(){const r=state.result;if(!r?.ws||state.stale){window.QuantistesPlots.cleanDensity();$('densityChart').innerHTML='<div class="empty">Densità Q in attesa di un mark disponibile.</div>';return;}window.QuantistesPlots.density(r);}
function renderAudit(){
  const r=state.result;if(!r)return;
  const w=r.ws,f=r.forward||{},c=w?.cvi,m=c?.marks,q=m?.market,ok=!!(c?.markReleased&&w);
  text('qualityBadge',ok?'MARK CVI VERIFICATO':'MARK CVI SOSPESO');$('qualityBadge').className='badge '+(ok?'ok':'err');
  const facts=[fact('Forward di parità',fmt(f.F,5)),fact('Coppie call/put',c?.tape.parityPairs??'—'),fact('Tempo al fixing',fmt(r.T*365*24,3)+' ore'),fact('Fattore di sconto',fmt(f.D,8))];
  if(ok)facts.push(fact('Book OTM · fattibilità',c.book.status),fact('Geometria continua · butterfly',m.certificate.status),fact('Convergenza della proiezione',m.solver.status),fact('Prezzi bilaterali nello spread',q.inside+' / '+q.bilateral),fact('Limiti unilaterali rispettati',q.sidedInside+' / '+q.unilateral),fact('RMSE dei premi bilaterali',fmt(q.rmse,6)+' pt'),fact('Massimo sforamento',fmt(q.maxBreach,8)+' pt'),fact('Strike bilaterali ammessi',c.observedStrike.map(x=>fmt(x,0)).join(' – ')),fact('Età mediana / massima',fmt(c.tape.medianAge,2)+' / '+fmt(c.tape.maxAge,2)+' s'),fact('Impronta del mark',m.candidateFingerprint.slice(0,16)+'…'));
  $('auditFacts').innerHTML=facts.join('');
  const rows=c?.points||[];
  $('fitBody').innerHTML=rows.map(p=>'<tr><td>'+p.side+'</td><td class="num">'+fmt(p.K)+'</td><td class="num">'+fmt(p.bid,4)+'</td><td class="num">'+fmt(p.mid,4)+'</td><td class="num">'+fmt(p.ask,4)+'</td><td class="num">'+fmt(p.mark,5)+'</td><td class="num">'+(Number.isFinite(p.mid)?fmt(p.mark-p.mid,5):'—')+'</td><td class="'+(p.markWithin?'green':'gold')+'">'+(p.markWithin?'Sì':'—')+'</td></tr>').join('')||'<tr><td colspan="8">Mark sospeso</td></tr>';
  const warn=[...(state.parsed?.warnings||[]),...(r.warnings||[]),...Object.values(r.errors||{})];
  $('warnings').innerHTML=warn.map(s=>'<div class="issue">'+esc(s)+'</div>').join('');
  const exclusions={};for(const e of(r.wsExcluded||w?.excluded||[]))if(e.reason)exclusions[e.reason]=(exclusions[e.reason]||0)+1;
  const msg=['CSV: '+state.files.map(f=>f.name).join(' · '),(state.parsed?.meta.count||0)+' righe importate. Cutoff '+r.cfg.asof+' ET.',...(c?[c.tape.raw+' righe per la scadenza e '+c.tape.admitted+' strike OTM ammessi.']:[]),...Object.entries(exclusions).map(([s,n])=>s+' · '+n)];
  $('importAudit').innerHTML=msg.map(s=>'<div class="issue">'+esc(s)+'</div>').join('');
}
function exportArgs(){return[$('exportFamily').value,Q.number($('basis').value),Q.number($('tick').value)];}
function refreshExport(){
  let enabled=false;
  if(!state.result||state.stale)$('exportText').value='Ricalcola prima di esportare.';
  else try{const content=Q.exportText(state.result,...exportArgs());$('exportText').value=content||'Famiglia non disponibile: consulta la diagnosi.';enabled=!!content;}catch(e){$('exportText').value=e.message;}
  document.querySelectorAll('.exportbtn').forEach(b=>b.disabled=!enabled);
}
function requireLevelExport(){const r=requireCurrent();Q.exportText(r,...exportArgs());return r;}
function requireCurrent(){if(!state.result||state.stale)throw new Error('Risultati non aggiornati: ricalcola prima di esportare.');return state.result;}
function artifactName(ext){const r=requireCurrent();return 'Quantistes_'+r.cfg.expiry+'_'+$('exportFamily').value+'.'+ext;}
function download(name,content,mime='text/plain;charset=utf-8'){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('File creato: '+name);}
async function copy(s){if(!s)throw new Error('Nessun livello per la famiglia selezionata.');try{if(!navigator.clipboard)throw new Error('fallback');await navigator.clipboard.writeText(s);}catch(e){const t=document.createElement('textarea');t.value=s;t.style.cssText='position:fixed;top:0;left:-9999px';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok){$('exportText').focus();$('exportText').select();throw new Error('Copia automatica bloccata: testo selezionato, premi Ctrl+C.');}}toast('Copiato negli appunti.');}
function reportDownload(){const r=requireCurrent(),rep=Q.report(r);rep.import={files:state.files.map(f=>f.name),meta:state.parsed.meta,warnings:state.parsed.warnings,bad:state.parsed.bad};rep.referenceSource=referenceLabel();rep.export={family:$('exportFamily').value,basis:Q.number($('basis').value),tick:Q.number($('tick').value)};rep.term=state.term;download(artifactName('json'),JSON.stringify(rep,null,2),'application/json');}
function safe(fn){return async(...a)=>{try{await fn(...a);}catch(e){toast(e.message);}};}
async function termCompute(){
  const r=requireCurrent(),one=$('termFirst').value,two=$('termSecond').value,revision=state.revision;
  if(!(one&&two&&one<two))throw new Error('Seleziona T₁ e T₂ distinte, in ordine crescente.');
  if(r.cfg.forward>0)throw new Error('Per il confronto fra scadenze seleziona forward automatico: un solo forward manuale non definisce entrambe le maturità.');
  text('termResult','Fit delle due scadenze con gli stessi filtri…');$('termButton').disabled=true;
  try{const vals=[];
    for(const expiry of[one,two]){
      const expiryTime=expiry===r.cfg.expiry?r.cfg.expiryTime:window.DeskCalendar10.fixing(expiry).etClose;if(!expiryTime)throw Error('Fixing contrattuale assente per '+expiry);
      const rr=await computeAsync(state.parsed.rows,{...r.cfg,cviFiles:state.files,expiry,expiryTime,target:expiry+'T'+expiryTime,sensitivity:false,overrideHours:0},revision);
      if(state.revision!==revision)throw new Error('Parametri cambiati durante il confronto: ricalcola prima di procedere.');
      if(!rr.ws||rr.quality?.level==='red')throw new Error(rr.errors.ws||'Scadenza senza una curva sufficientemente valida.');
      vals.push({expiry,T:rr.T,w:rr.ws.model.atmW,iv:rr.ws.ivATM,forward:rr.forward.F});
    }
    const f=Q.forwardVariance(vals[0].w,vals[0].T,vals[1].w,vals[1].T);state.term={values:vals,result:f};
    text('termResult',f.error?f.error:'Forward IV ATM '+pct(f.volatility,3)+' · T₁ '+one+' (IV '+pct(vals[0].iv,3)+') → T₂ '+two+' (IV '+pct(vals[1].iv,3)+'). Nessuna modifica ai livelli dello snapshot selezionato.');
  }finally{$('termButton').disabled=false;}
}
// Events: numerical inputs invalidate outputs; visual controls do not.
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
$('guideButton').onclick=()=>tab('method');$('calculate').onclick=calculate;
$('useEligibleExpiry').onclick=safe(useEligibleExpiry);$('downloadInputAudit').onclick=safe(inputAuditDownload);
$('syncSnapshot').onclick=syncSnapshotFromCSV;$('syncSnapshotError').onclick=syncSnapshotFromCSV;$('showQuoteAudit').onclick=()=>tab('audit');
const paramIds=['cviFitMode','autoSmoothing','maxPairGap','settlement','asof','expiry','expiryTime','target','symbol','rate','dividend','forward','minBid','maxAge','maxSpread','smoothing','tailPenalty','regularTails','robust','sensitivity','quoteSource','anchor','maxSigma','step','overrideHours'];
paramIds.forEach(id=>$(id).addEventListener('input',()=>{if(id==='settlement'){state.demo=false;state.anchorSource='settlement inserito manualmente';text('settlementHint','Riferimento inserito manualmente. Il forward resta stimato indipendentemente dalle opzioni.');}if(['ippoIV','autoSmoothing'].includes(id))updateIppoMode();if(id==='expiry')applyFixing($('expiry').value);if(id==='expiryTime')text('fixingNote','Fixing ET inserito manualmente.');if(['asof','expiry','symbol','maxAge'].includes(id))renderSnapshotInfo();stale();}));
$('expirySelect').onchange=()=>changeExpiry($('expirySelect').value);
$('nextSession').onclick=()=>{const f=nextTradingDay($('asof').value.slice(0,10));if(!f)return toast('Imposta il cutoff.');$('target').value=f.date+'T'+f.etClose;stale('Target al fixing della prossima seduta.');};
$('matchExpiry').onclick=()=>{if(!$('expiry').value)return toast('Scegli prima la scadenza.');$('target').value=$('expiry').value+'T'+$('expiryTime').value;stale();};
$('useSpot').onclick=()=>{const s=currentSpot();if(!(s>0))return toast('Prezzo sottostante assente: inserisci il settlement manualmente.');$('settlement').value=s.toFixed(2);state.demo=false;state.anchorSource='spot dal CSV su selezione manuale';text('settlementHint','Spot CSV adottato come riferimento su tua scelta. Non certifica il settlement ufficiale.');stale();};
$('ivUnit').onchange=safe(()=>{parseFiles(false);});
let importId=0;
async function importDeskChain(chosen){
 const token=++importId;
 state.result=null;state.parsed=null;state.files=[];state.ohlc=null;
 state.anchorSource='settlement inserito manualmente';
 $('settlement').value='';$('removeOHLC').classList.add('hidden');text('ohlcBadge','NESSUNA SERIE OHLC');
 text('dataMeta','Lettura dei CSV…');
 stale('Lettura delle quotazioni…');clearResults('In attesa della nuova chain.');
 try{
  const files=[];
  for(const f of chosen){
   if(f.size>35e6)throw Error('Esporta una chain entro 35 MB per file.');
   files.push({name:f.name,text:typeof f.text==='string'?f.text:await f.text()});
   if(token!==importId)return;
  }
  state.files=files;parseFiles(true);
  if(!state.parsed?.rows.length)throw Error('Il CSV non contiene contratti utilizzabili.');
  if($('terminalSidebar').hidden)$('terminalSettings').click();
  $('settlement').focus?.({preventScroll:true});
  return true;
 }catch(error){
  if(token!==importId)return;
  state.files=[];state.parsed=null;
  for(const id of ['asof','expiry','target','settlement'])$(id).value='';
  for(const id of ['symbol','expirySelect','termFirst','termSecond'])$(id).replaceChildren();
  text('dataMeta','Nessuna chain caricata.');text('snapshotInfo','—');
  text('settlementHint','Inserisci il riferimento cash dopo aver caricato il CSV.');
  clearResults(error.message);status(error.message,'err');throw error;
 }finally{if(token===importId)syncSession();}
}
const skewApiViews=['mon','skew','side'];
let skewDateOverride=false,skewOperation=0,skewController=null;
const skewInputs=()=>skewApiViews.map(id=>$('skApiDate-'+id));
function skewStatus(message,kind=''){
 for(const id of skewApiViews){
  const n=$('skApiMessage-'+id);
  n.textContent=message;
  n.dataset.kind=kind;
 }
}
function skewBusy(busy){
 for(const id of skewApiViews){
  $('skApiLoad-'+id).disabled=busy;
  $('skApiCancel-'+id).hidden=!busy;
 }
}
function stopSkewAPI(){
 skewOperation++;
 if(skewController)skewController.abort();
 skewController=null;
 skewBusy(false);
}
function suggestSkewDate(force=false){
 const next=window.DeskCalendar10.snapshot().sessionDate;
 if(force||!skewDateOverride){
  if(force)skewDateOverride=false;
  for(const input of skewInputs())input.value=next;
 }
 return next;
}
function selectSkewDate(input){
 const hadRequest=!!skewController;
 stopSkewAPI();
 skewDateOverride=true;
 const value=input.value;
 for(const other of skewInputs())if(other!==input)other.value=value;
 skewStatus(hadRequest?'Richiesta annullata. Seleziona «Carica da API» per la nuova scadenza.':'');
}
async function loadSkewAPI(){
 const forecast=suggestSkewDate();
 const expiry=skewDateOverride?skewInputs()[0].value:forecast;
 if(!expiry){skewStatus('Seleziona la scadenza SPXW da richiedere.','error');return;}
 stopSkewAPI();
 const ticket=skewOperation,controller=new AbortController();
 skewController=controller;
 skewBusy(true);
 skewStatus('Richiesta SPXW del '+expiry+' in corso…');
 try{
  const file=await window.QuantistesAPI.load(expiry,{signal:controller.signal});
  if(ticket!==skewOperation)return;
  const csv=await file.text();
  if(ticket!==skewOperation)return;
  const loaded=await importDeskChain([{name:file.name,size:file.size,text:csv}]);
  if(ticket!==skewOperation||!loaded)return;
  const latest=state.parsed.meta.latest.replace('T',' ');
  skewStatus('SPXW '+expiry+' · '+state.parsed.rows.length+' righe · ultima quota '+latest+' ET.','ok');
 }catch(error){
  if(ticket!==skewOperation)return;
  const active=state.parsed?' Chain attiva: '+$('symbol').value+' '+$('expiry').value+' · cutoff '+$('asof').value.replace('T',' ')+' ET.':'';
  skewStatus(String(error.message||error)+active,'error');
 }finally{
  if(ticket===skewOperation){skewController=null;skewBusy(false);}
 }
}
for(const id of skewApiViews){
 const input=$('skApiDate-'+id);
 input.oninput=()=>selectSkewDate(input);
 input.onchange=()=>selectSkewDate(input);
 input.onfocus=()=>{if(!skewController)suggestSkewDate();};
 $('skApiLoad-'+id).onclick=loadSkewAPI;
 $('skApiCancel-'+id).onclick=()=>{stopSkewAPI();skewStatus('Richiesta annullata.');};
 $('skApiNext-'+id).onclick=()=>{stopSkewAPI();suggestSkewDate(true);skewStatus('Scadenza aggiornata al prossimo fixing SPXW.');};
}
$('skewManualCSV').onclick=()=>$('csvFile').click();
suggestSkewDate();
const skewDateTimer=setInterval(()=>{
 if(!document.hidden&&!skewController&&!skewDateOverride)suggestSkewDate();
},30000);
skewDateTimer.unref?.();
if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&!skewController)suggestSkewDate();
});

$('csvFile').onchange=safe(async e=>{
 const chosen=Array.from(e.target.files||[]);e.target.value='';
 if(!chosen.length)return;
 stopSkewAPI();skewStatus('');
 return importDeskChain(chosen);
});
$('ipTailLevel').onchange=()=>renderIppoProbe(state.result);
for(const id of['showIppo','showWS','focus'])$(id).onchange=renderMainChart;
$('tableFamily').onchange=renderLevels;
for(const id of['exportFamily','basis','tick'])$(id).addEventListener('input',refreshExport);
$('importOHLCButton').onclick=()=>$('ohlcFile').click();$('ohlcFile').onchange=safe(async e=>{const f=e.target.files[0];if(!f)return;const p=Q.parseOHLC(await f.text());state.ohlc={...p,name:f.name};text('ohlcBadge',p.rows.length+' BARRE CSV');$('removeOHLC').classList.remove('hidden');renderMainChart();toast('OHLC importato: '+p.rows.length+' barre reali; '+p.bad.length+' righe scartate.');});
$('removeOHLC').onclick=()=>{state.ohlc=null;text('ohlcBadge','NESSUNA SERIE OHLC');$('removeOHLC').classList.add('hidden');renderMainChart();};
$('copyText').onclick=safe(()=>copy(Q.exportText(requireCurrent(),...exportArgs())));
$('copyPine').onclick=safe(()=>copy(Q.exportPine(requireCurrent(),...exportArgs())));
$('downloadText').onclick=safe(()=>download(artifactName('txt'),Q.exportText(requireCurrent(),...exportArgs())));
$('downloadPine').onclick=safe(()=>download(artifactName('pine'),Q.exportPine(requireCurrent(),...exportArgs())));
$('downloadLevelsCSV').onclick=safe(()=>{const r=requireLevelExport(),[family,basis,tick]=exportArgs(),obs=family==='both'?[r.ippo,r.ws]:[r[family]],rows=obs.filter(Boolean).flatMap(o=>o.levels).sort((a,b)=>a.price-b.price);download(artifactName('csv'),'sigma,family,spx_price,export_price,terminal_quantile_q,sensitivity_low,sensitivity_high,quality,model,model_cdf,model_tail,smile_measure,smile_tail,price_sd_distance,conditional_tail_mean,conditional_tail_sd,atm_quote_level_low,atm_quote_level_high,fit_engine,mark_sha256,quote_outer_low_spx,quote_outer_high_spx\n'+rows.map(l=>{const m=Q.levelMeasurement(r,l),n=v=>Number.isFinite(v)?v.toPrecision(14):'';return [l.z,l.family,l.price.toFixed(8),(Math.round((l.price+basis)/tick)*tick).toFixed(2),n(m.smileCDF),n(l.sensitivityLow),n(l.sensitivityHigh),l.tail,m.model,n(m.modelCDF),n(m.modelTail),m.smileMeasure,n(m.smileTail),n(m.priceStandardDeviations),n(l.conditionalTail?.mean),n(l.conditionalTail?.sd),n(l.atmQuoteRange?.low),n(l.atmQuoteRange?.high),r.ws?r.ws.cvi.marks.profile:'IPPO_NOTEBOOK',r.ws?.cvi?.marks.candidateFingerprint||'',n(l.family==='Wall Street'?quoteRange(r,l.z)?.low:null),n(l.family==='Wall Street'?quoteRange(r,l.z)?.high:null)].map(x=>String(x??'').includes(',')?'"'+String(x).replaceAll('"','""')+'"':x).join(',');}).join('\n'),'text/csv;charset=utf-8');});
$('downloadAudit').onclick=safe(()=>state.result&&!state.stale?reportDownload():inputAuditDownload());$('downloadAudit2').onclick=safe(()=>state.result&&!state.stale?reportDownload():inputAuditDownload());$('termButton').onclick=safe(termCompute);
window.Desk={state,calculate,config,computeHistory:(rows,cfg)=>computeAsync(rows,cfg,-1),parseFiles,renderAll,stale,tab,syncSnapshotFromCSV,selectedSnapshotInfo,renderHorizonCheck,useEligibleExpiry,inputAuditDownload,updateIppoMode};
syncSession();
