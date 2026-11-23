(function(root){
'use strict';
const el=id=>document.getElementById(id),D=root.CVIData,api=root.CVISurface9,cal=root.DeskCalendar10;
const slots=['0d','1w','2w','1m','3m','6m','1y'];
const files=new Map(),reads=new Map(),overrides=new Map();
const jsIds=['core-data','core-fit','core-cert','core-lab-engine','core-marks','core-bounds','core-intraday','quant-core-script','vc9-engine'];
const fmtDate=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const romeFmt=new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
let lastCfg='',fitJob=null,gen=0,extraId=0,workerBlob,liveTimer=null,confirmReset=false,lastAuditBook=null;

let acquisition=null,missingAfterCommit=[];
const apiMessages=new Map();
function apiSelection(){return slots.filter(id=>el('vc11Pick-'+id).checked);}
function setApiMessage(id,text,error=false){apiMessages.set(id,{text,error});}
function refreshApi(){
  const active=acquisition,selected=apiSelection(),pending=!!active,count=active?.data.size||0;
  for(const id of slots){
    const note=apiMessages.get(id),field=el('vc11State-'+id);
    field.textContent=note?.text||'';field.dataset.error=String(!!note?.error);
    el('vc11Fetch-'+id).disabled=pending||!!reads.size||!el('vc11Expiry-'+id).value;
  }
  el('vc11FetchSet').disabled=pending||!!reads.size||!selected.length;
  el('vc11FetchSet').textContent='Carica selezionate da API'+(selected.length?' ('+selected.length+')':'');
  el('vc11Cancel').hidden=!pending;
  el('vc11Retry').hidden=pending?(active.running||!active.errors.size):!missingAfterCommit.length;
  el('vc11Partial').hidden=!pending||active.running||!active.batch||!count||!active.errors.size;
  el('vc11Partial').textContent='Usa '+count+' '+(count===1?'scadenza disponibile':'scadenze disponibili');
  if(active){
    const total=active.entries.length;
    const body=active.running?'Ricezione in corso. '+count+' di '+total+' scadenze pronte.':
      count+' di '+total+' scadenze pronte. '+(files.size?'Il set precedente è ancora caricato. ':'')+
      (count?'Riprova le mancanti o usa le sole scadenze disponibili.':'Riprova la richiesta o annulla.');
    el('vc11BatchStatus').textContent=body;
  }
}
function cancelApi(reason=''){
  missingAfterCommit=[];
  const active=acquisition;
  if(active){
    acquisition=null;
    active.controller.abort();
    for(const job of active.jobs)job.cancel();
    apiMessages.clear();
    el('vc11BatchStatus').textContent=reason;
    live();
  }else if(!reason){
    apiMessages.clear();el('vc11BatchStatus').textContent='';
  }
}
function commitApi(active,empty=false){
  if(active!==acquisition||(!active.data.size&&!empty))return;
  // One synchronous commit, after every request and validation has settled.
  for(const {id,date} of active.entries){
    const f=active.data.get(id);
    if(f){
      files.set(id,f);
      setApiMessage(id,'Acquisita · '+fmtDate(date));
    }else{
      files.delete(id);
      setApiMessage(id,'Esclusa · '+(active.errors.get(id)?.reason||'nessun dato'),true);
    }
  }
  const count=active.data.size;
  acquisition=null;
  missingAfterCommit=active.entries.filter(({id})=>active.errors.has(id)).map(({id})=>id);
  const missing=active.entries.length-count;
  const note=count+' '+(count===1?'scadenza acquisita':'scadenze acquisite')+' da API.'+
    (missing?' '+missing+' '+(missing===1?'casella esclusa.':'caselle escluse.'):'')+
    (files.size?' Seleziona «Calibra superficie».':' Nessun contratto disponibile per le scadenze richieste.');
  el('vc11BatchStatus').textContent=note;message('');
  changed('Quotazioni aggiornate. Calibra le scadenze al cutoff selezionato.');
  live();refreshApi();
}
async function receiveApi(active,{id,date}){
  let job;
  try{
    setApiMessage(id,'Richiesta · '+fmtDate(date));refreshApi();
    const file=await root.QuantistesAPI.load(date,{signal:active.controller.signal});
    if(acquisition!==active)return;
    const content=typeof file.text==='string'?file.text:await file.text();
    if(acquisition!==active)return;
    if(!content||file.size>35e6)throw Error('Dimensione della risposta non valida.');
    const packet={name:file.name,text:content};
    job=task('inspect',{files:[packet]});active.jobs.add(job);
    const [meta]=await job.promise;
    if(acquisition!==active)return;
    if(meta.expiries.length!==1||meta.expiries[0]!==date)throw Error('Scadenza ricevuta diversa da '+fmtDate(date)+'.');
    active.data.set(id,{...packet,meta});active.errors.delete(id);setApiMessage(id,'Ricevuta · '+fmtDate(date));
  }catch(e){
    if(acquisition!==active)return;
    const reason=String(e?.message||e);
    active.errors.set(id,{reason,empty:e?.code==='NO_DATA'});setApiMessage(id,reason,true);
  }finally{
    if(job)active.jobs.delete(job);
    if(acquisition===active)refreshApi();
  }
}
async function downloadEntries(active,entries){
  if(acquisition!==active||active.running)return;
  active.running=true;
  for(const {id} of entries){active.errors.delete(id);setApiMessage(id,'In coda…');}
  renderState();
  const queue=entries.slice();
  const next=async()=>{
    while(queue.length&&active===acquisition)await receiveApi(active,queue.shift());
  };
  await Promise.all([next(),next()]);
  if(acquisition!==active)return;
  active.running=false;
  if(!active.errors.size||[...active.errors.values()].every(e=>e.empty))commitApi(active,true);
  else renderState();
}
function beginApi(ids,batch){
  if(acquisition||reads.size||!ids.length)return;
  live();
  const entries=ids.map(id=>({id,date:el('vc11Expiry-'+id).value}));
  const invalid=entries.find(({date})=>!/^\d{4}-\d{2}-\d{2}$/.test(date));
  if(invalid){el('vc11BatchStatus').textContent='Indica la data di ogni scadenza selezionata.';return;}
  if(new Set(entries.map(e=>e.date)).size!==entries.length){
    el('vc11BatchStatus').textContent='Due caselle selezionate hanno la stessa data. Modifica la data o deseleziona un tenore.';
    return;
  }
  apiMessages.clear();missingAfterCommit=[];
  acquisition={batch,entries,controller:new AbortController(),data:new Map(),errors:new Map(),jobs:new Set(),running:false};
  clearBook('Acquisizione delle quotazioni in corso…');message('');
  return downloadEntries(acquisition,entries);
}
function bindApi(){
  const settingsChanged=()=>{
    missingAfterCommit=[];
    if(acquisition){cancelApi('Acquisizione annullata per modifica della selezione.');changed();}
    live();refreshApi();
  };
  for(const id of slots){
    const date=el('vc11Expiry-'+id);
    date.oninput=()=>{
      date.dataset.custom=date.value&&date.value!==date.dataset.suggestion?'1':'';
      settingsChanged();
    };
    el('vc11Pick-'+id).onchange=settingsChanged;
    el('vc11Fetch-'+id).onclick=()=>beginApi([id],false);
  }
  el('vc11FetchSet').onclick=()=>beginApi(apiSelection(),true);
  el('vc11Retry').onclick=()=>{
    const a=acquisition;
    if(!a){if(missingAfterCommit.length)return beginApi(missingAfterCommit.slice(),true);return;}
    if(!a.running)return downloadEntries(a,a.entries.filter(({id})=>a.errors.has(id)));
  };
  el('vc11Partial').onclick=()=>{
    if(acquisition&&!acquisition.running&&acquisition.batch)commitApi(acquisition);
  };
  el('vc11Cancel').onclick=()=>{cancelApi('Acquisizione annullata.');changed();};
}

function rawTask(kind,p){
  return kind==='inspect'?p.files.map(api.inspect):api.build(p.files,p.cfg);
}
function task(kind,p){
  let w=null,dead=false,settled=false,rejectTask;
  const promise=new Promise((resolve,reject)=>{
    rejectTask=reject;
    const finish=(ok,value)=>{if(dead||settled)return;settled=true;w?.terminate();if(ok)resolve(value);else reject(Error(value));};
    const local=()=>setTimeout(()=>{if(dead||settled)return;try{finish(true,rawTask(kind,p));}catch(e){finish(false,e.message);}},0);
    if(typeof root.Worker!=='function'){local();return;}
    let url;
    try{
      if(!workerBlob){
        const code=jsIds.map(id=>el(id).textContent).join('\n')+"\nself.onmessage=e=>{try{const v=e.data,p=v.p;const result=v.kind==='inspect'?p.files.map(CVISurface9.inspect):CVISurface9.build(p.files,p.cfg);self.postMessage({result});}catch(error){self.postMessage({error:String(error.message||error)});}};";
        workerBlob=new Blob([code],{type:'text/javascript'});
      }
      url=URL.createObjectURL(workerBlob);w=new root.Worker(url);
      w.onmessage=e=>{if(e.data.error)finish(false,e.data.error);else finish(true,e.data.result);};
      w.onerror=e=>{e.preventDefault?.();w.terminate();w=null;local();};
      w.postMessage({kind,p});
    }catch(error){w?.terminate();w=null;local();}
    finally{if(url)URL.revokeObjectURL(url);}
  });
  return {promise,cancel(){if(dead||settled)return;dead=true;w?.terminate();rejectTask(Error('Operazione sostituita.'));}};
}
function jointLog(g){
  const host=el('vc12JointLog'),reg=el('vc12JointRegister');if(!host||!g)return;
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const j=g.joint||{},pair=g.pairs||[],quality=g.qualityByExpiry||[];
  const canonical=root.CVIModelRouter?.get(g);
  const status=g.partial?'SUPERFICIE PARZIALE CERTIFICATA · '+g.curves.length+' / '+g.expiries.length+' TENOR':g.marketReady?'SUPERFICIE PUBBLICATA':'SUPERFICIE NON RILASCIATA';
  const mr=j.solver?.marketRepair;const repairNote=mr?.requested?'<p><b>Fattibilità bid/ask:</b> '+(mr.success?'proiezione ammissibile':'non verificata')+
  (mr.changed?' · correzione su vincoli rigidi':' · nessuna correzione necessaria')+
  ' · prima '+(mr.before?.violations??0)+' eccezioni'+(mr.before?.worst?.breach?' (massimo '+mr.before.worst.breach.toFixed(6)+' pt SPX)':'')+
  ' · dopo '+(mr.after?.violations??0)+' eccezioni'+(mr.after?.worst?.breach?' (massimo '+mr.after.worst.breach.toFixed(6)+' pt SPX)':'')+
  '. Il proiettore non fornisce da solo una prova di assenza di arbitraggio; prevalgono i certificati continui.</p>':'';
  const discountNote=g.curves?.length?'<table><thead><tr><th>Scadenza</th><th>Fattore D</th><th>Tasso implicito</th><th>Fonte</th></tr></thead><tbody>'+g.curves.map(c=>'<tr><td>'+esc(c.expiry)+'</td><td>'+Number(c.D).toFixed(8)+'</td><td>'+(c.discount?.impliedRate!=null?(100*c.discount.impliedRate).toFixed(4)+'%':'tasso di input')+'</td><td>'+esc(c.discount?.source||'tasso')+'</td></tr>').join('')+'</tbody></table>':'';
  const tradeNote=g.partial?'<p class="qt-joint-caution"><b>Validità limitata:</b> mark e interpolazioni ammessi SOLO da '+esc(g.coverage.from)+' a '+esc(g.coverage.to)+
    '. Le '+(g.expiries.length-g.curves.length)+' scadenze non rilasciate restano escluse dalla superficie e da qualunque valutazione sul loro tenor.</p>':'';
  host.innerHTML='<div class="qt-joint-result '+(g.marketReady?'is-ready':'is-blocked')+'">'+esc(status)+'</div>'+
   '<p>'+esc(g.reason||'')+'</p>'+
   '<p><b>Contratto canonico:</b> '+(canonical?.ok?'CERTIFICATO · '+esc(canonical.meta.kernel)+' · ID '+esc(canonical.meta.modelId.slice(0,16)):'SOSPESO · '+esc(canonical?.reason||'nessuna superficie certificata'))+'</p>'+
   '<p><b>Scadenze rilasciate:</b> '+g.curves.length+' / '+g.expiries.length+' · <b>Fit congiunto:</b> '+
   (j.attempted?(j.accepted?'Rilasciato':'Non certificato su tutti i tenor'):'Non necessario o disattivato')+'</p>'+
   '<table><thead><tr><th>Vicino → lontano</th><th>Calendar</th></tr></thead><tbody>'+pair.map(p=>'<tr><td>'+esc(p.near+' → '+p.far)+'</td><td>'+esc(p.status)+'</td></tr>').join('')+'</tbody></table>'+
   (j.attempted?'<table><thead><tr><th>Prova</th><th>Nodi / regolarizzazione</th><th>Esito</th><th>Motivo</th></tr></thead><tbody>'+j.attempts.map(a=>'<tr><td>'+a.id+'</td><td>'+a.knots+' / '+a.regularization+'</td><td>'+esc(a.status)+'</td><td>'+esc(a.reason)+'</td></tr>').join('')+'</tbody></table>':'')+repairNote+discountNote+tradeNote+(j.attempted?'<p><b>Diagnosi:</b> '+esc(j.category==='QUOTE_BOX_CALENDAR_CONFLICT'?'Quote calendar incompatibili nei rispettivi intervalli bid/ask':j.category==='SOLVER_INCONCLUSIVE'?'Solver inconclusivo, assenza di prova di arbitraggio':'Nessuna soluzione certificata dai tentativi correnti')+'</p>':'')+
   (quality.length?'<table><thead><tr><th>Scadenza</th><th>Righe disponibili</th><th>Ultima quota ET</th><th>Scarto dal cutoff</th><th>Stato</th></tr></thead><tbody>'+quality.map(v=>'<tr><td>'+esc(v.expiry)+'</td><td>'+v.rows+'</td><td>'+esc(v.latest||'—')+'</td><td>'+ (v.lagSeconds==null?'—':v.lagSeconds.toFixed(1)+' s')+'</td><td>'+esc(v.reason||'Presente, passa al fit')+'</td></tr>').join('')+'</tbody></table>':'')+(g.errors?.length?'<div class="qt-joint-error-list"><h4>Perché manca il mark</h4>'+g.errors.map(e=>'<p><b>'+esc(e.expiry)+'</b> — '+esc(e.reason)+'</p>').join('')+'</div>':'')+
   '<p class="qt-joint-help"><b>Come intervenire:</b> se una quota è vecchia o il cutoff non coincide, riacquisisci tutte le scadenze nello stesso intervallo di mercato. Se il problema è parità o spread, confronta le coppie call/put e le convenzioni di tasso e fixing. Un solver inconclusivo non dimostra arbitraggio. Un conflitto dei book non si risolve forzando la superficie: richiede quotazioni coerenti.</p>'+ 
   
   
   '<p class="qt-joint-caution">Vincoli: opzioni europee sullo stesso sottostante, as-of comune e carry proporzionale deterministico. Il calendario è verificato a log-moneyness forward costante; un arbitraggio calendar rilevato può anche dipendere da quote asincrone o carry non coerente. Il sistema può pubblicare una porzione di superficie certificata; i tenori sospesi sono esclusi esplicitamente. Non viene forzata alcuna curva non certificata.</p>';
  reg.open=!g.marketReady;
}
function currentCfg(){
  const c=root.Desk.config();
  return {rate:c.rate,maxPairGap:c.maxPairGap,maxAge:c.maxAge,minBid:c.minBid,maxSpread:c.maxSpread,profile:c.cviWingProfile};
}
function live(){
  const now=Date.now(),s=cal?.snapshot(now);
  if(!s)return;
  el('vc10Roma').textContent='Roma · '+s.rome;el('vc10NY').textContent='New York · '+s.ny;
  el('vc10CalendarNote').textContent=(s.note?s.note+' ':'')+'I tenori guidano la raccolta. Il fit usa le scadenze lette nei contratti.';
  for(const row of s.rows){
    const t=el('vc10Rec-'+row.id);if(!t)continue;
    const date=el('vc11Expiry-'+row.id);
    if(!date.dataset.custom&&!acquisition)date.value=row.date;
    date.dataset.suggestion=row.date;
    t.textContent='Proposta '+fmtDate(row.date)+(row.early?' · '+row.romeFix+' Roma':'')+(row.verified?'':' · indicativa');
    t.title=[row.label,row.rule,row.note,'Fixing '+(row.etClose||'—')+' ET',row.romeFix].filter(Boolean).join(' · ');
  }
}
function deadline(date){
  const f=cal.fixing(date);
  if(f.verified&&!f.isSession)return {invalid:'Scadenza '+fmtDate(date)+' fuori seduta secondo il calendario SPXW.'};
  if(f.verified)return {clock:f.etClose};
  return {clock:overrides.get(date)||'',manual:true};
}
function cfgInfo(){
  const cfg={...currentCfg(),discountMode:el('vc13Discount').value};
  for(const k of ['rate','maxPairGap','maxAge','minBid','maxSpread']){
    if(!Number.isFinite(cfg[k])||(k!=='rate'&&cfg[k]<0))throw Error('Controlla '+k+' nei parametri CSV.');
  }
  if(!(cfg.maxAge>0&&cfg.maxSpread>0))throw Error('Età massima delle quote e spread massimo devono essere positivi.');
  if(!['desk','wing'].includes(cfg.profile))throw Error('Seleziona un profilo di calibrazione CVI nei parametri CSV.');
  return cfg;
}
function selectInfo(){
  const all=[...files.values()],date=el('vc10Date').value;
  const groups=all.map(f=>f.meta.groups.find(g=>g.date===date));
  const present=groups.filter(Boolean),expiries=[...new Set(present.flatMap(g=>g.expiries))].sort();
  const latest=present.length?Math.max(...present.map(g=>g.latest)):null;
  let asof=latest;
  if(el('vc10ClockMode').value==='manual')asof=D.epochET(date+'T'+el('vc10Time').value);
  return {all,date,groups,present,expiries,latest,asof};
}
function message(value){el('vc10ImportNote').textContent=value;}
function setStatus(title,note=''){el('vc9LoadState').textContent=title;el('vc9LoadNote').textContent=note;}
function clearBook(note){
  lastAuditBook=null;el('vc13Audit').disabled=true;
  confirmReset=false;gen++;fitJob?.cancel();fitJob=null;
  root.VolCube9.setData(null);
  if(note)root.VolCube9.showError(note);
  setStatus(files.size?'In attesa del fit':'Attesa CSV');
}
function renderDates(){
  const all=[...files.values()],dates=[...new Set(all.flatMap(f=>f.meta.groups.map(g=>g.date)))].sort().reverse();
  const menu=el('vc10Date'),old=menu.value;
  if(!dates.length){menu.innerHTML='<option value="">Attesa CSV</option>';menu.disabled=true;return;}
  menu.innerHTML=dates.map(d=>'<option value="'+d+'">'+fmtDate(d)+'</option>').join('');
  const common=dates.filter(d=>all.every(f=>f.meta.groups.some(g=>g.date===d)));
  menu.disabled=false;menu.value=common.includes(old)?old:common[0]||(dates.includes(old)?old:dates[0]);
}
function renderState(){
  for(const id of slots){
    const f=files.get(id),busy=reads.has(id),s=el('vc10Slot-'+id);s.setAttribute('data-ready',String(!!f));
    const status=f?'Scad. '+f.meta.expiries.map(fmtDate).join(', ')+' · '+f.name:'Nessun file';
    el('vc10Name-'+id).textContent=busy?'Lettura in corso…':status;
    el('vc10Label-'+id).textContent=f?'Sostituisci':'Carica CSV';
    el('vc10Del-'+id).hidden=!f&&!busy;
  }
  const others=[...files].filter(([k])=>!slots.includes(k));
  el('vc10New').hidden=!files.size&&!reads.size&&!acquisition;el('vc10Keep').hidden=!confirmReset;
  el('vc10New').textContent=confirmReset?'Conferma rimozione dei CSV':'Nuova sessione';
  el('vc10Other').innerHTML=others.map(([id,f])=>'<li>'+esc(f.name)+' · '+esc(f.meta.expiries.map(fmtDate).join(', '))+' <button type="button" data-vc-remove="'+id+'" aria-label="Rimuovi '+esc(f.name)+'">×</button></li>').join('');
  const s=selectInfo(),man=el('vc10ClockMode').value==='manual',time=el('vc10Time');
  time.disabled=!man||!s.date;
  if(!man){time.value=s.latest===null?'':D.timeET(s.latest).slice(11);}
  el('vc10Count').textContent=files.size?files.size+' file · '+s.expiries.length+' scadenz'+(s.expiries.length===1?'a':'e')+' nella seduta':'';
  const unknown=s.expiries.filter(d=>deadline(d).manual);
  const fixPanel=el('vc10Fixes');
  if(fixPanel.dataset.dates!==unknown.join('|')){
    fixPanel.dataset.dates=unknown.join('|');
    fixPanel.innerHTML=unknown.map(date=>'<label>Fixing da confermare · '+fmtDate(date)+' · ET<input type="time" data-fix-date="'+date+'" value="'+esc(overrides.get(date)||'')+'"></label>').join('');
  }
  refreshApi();
  let error='';
  if(acquisition)error=acquisition.running?'Acquisizione API in corso…':'Completa o annulla il lotto API prima del fit.';
  else if(!s.all.length)error='Carica un CSV SPXW per osservare la skew, oppure più scadenze per calibrare la superficie.';
  else if(reads.size)error='Lettura dei file in corso…';
  else if(s.present.length!==s.all.length){
    const missing=s.all.filter((_,i)=>!s.groups[i]).map(f=>f.name);
    error='Seduta diversa per '+missing.join(', ')+'. Scegli una data comune o rimuovi i CSV di altre sedute.';
  }else if(!Number.isFinite(s.asof))error='Inserisci un cutoff ET valido e univoco per la seduta scelta.';
  else if(s.expiries.some(d=>deadline(d).invalid))error=s.expiries.map(d=>deadline(d).invalid).filter(Boolean).join(' ');
  else if(s.expiries.some(d=>!deadline(d).clock))error='Conferma il fixing ET delle scadenze fuori dal calendario verificato.';
  let cfg;
  if(!error){try{cfg=cfgInfo();}catch(e){error=e.message;}}
  const cut=s.asof!=null&&Number.isFinite(s.asof)?'Cutoff '+D.timeET(s.asof).replace('T',' ')+' ET · '+romeFmt.format(s.asof)+' Roma':'';
  const params=cfg?' · '+(cfg.profile==='wing'?'CVI Ali':'CVI Desk')+' · età massima '+cfg.maxAge+' s · tasso '+(cfg.rate*100).toLocaleString('it-IT',{maximumFractionDigits:4})+'%':'';
  el('vc10CutoffNote').textContent=error||(cut+params);
  el('vc10Run').disabled=!!error||!!fitJob;
  return {s,cfg,error};
}
function changed(note){clearBook(note||'Dati aggiornati. Calibra le scadenze per visualizzare il risultato.');renderDates();renderState();}
function remove(id){
  cancelApi();
  const r=reads.get(id);if(r){reads.delete(id);r.job?.cancel();}
  files.delete(id);message('');changed();
}
async function take(key,input){
  if(!input.length)return;
  cancelApi();
  const old=reads.get(key);old?.job?.cancel();
  const ticket={};reads.set(key,ticket);message('');clearBook('Lettura dei contratti in corso…');renderState();
  try{
    const prepared=[];
    for(const f of input){
      if(f.size>35e6)throw Error('File oltre 35 MB: '+f.name+'.');
      const text=typeof f.text==='string'?f.text:await f.text();
      if(reads.get(key)!==ticket)return;
      prepared.push({name:String(f.name||'chain.csv'),text});
    }
    ticket.job=task('inspect',{files:prepared});
    const metas=await ticket.job.promise;
    if(reads.get(key)!==ticket)return;
    const named=slots.includes(key),added=[],skipped=[];
    if(named&&metas[0].expiries.length!==1)throw Error('La casella richiede una scadenza per file. Per un CSV multiscadenza scegli «Aggiungi CSV multipli».');
    const seen=new Set([...files].filter(([k])=>!(named&&k===key)).map(([,f])=>f.meta.hash));
    prepared.forEach((f,i)=>{
      if(seen.has(metas[i].hash)){skipped.push(f.name);return;}
      seen.add(metas[i].hash);const id=named?key:'extra'+(++extraId);
      files.set(id,{...f,meta:metas[i]});added.push(f.name+(metas[i].rejected?' ('+metas[i].rejected+' righe escluse)':''));
    });
    message([added.length?'Acquisiti · '+added.join(', '):'',skipped.length?'Già presenti · '+skipped.join(', '):''].filter(Boolean).join('  /  '));
  }catch(error){if(reads.get(key)!==ticket)return;message('Importazione respinta · '+error.message+(files.has(key)?' Rimane caricato '+files.get(key).name+'.':''));}
  finally{if(reads.get(key)===ticket){reads.delete(key);changed();}}
}
async function run(){
  const {s,cfg,error}=renderState();
  if(error||fitJob)return;
  clearBook('Calibrazione al cutoff selezionato…');
  const id=gen,clocks=Object.fromEntries(s.expiries.map(d=>[d,deadline(d).clock]));
  const packet={files:s.all.map(f=>({name:f.name,text:f.text})),cfg:{...cfg,asof:s.asof,onlyDate:s.date,onlySymbol:'SPXW',clocks,jointMode:el('vc12JointMode').value}};
  const job=task('build',packet);fitJob=job;el('vc10Run').disabled=true;setStatus('Calibrazione in corso…');
  try{
    const book=await job.promise;if(gen!==id)return;
    const g=book.groups[0];lastAuditBook=book;el('vc13Audit').disabled=false;
    root.VolCube9.setData(book);
    jointLog(g);
    setStatus(g?.partial?'Superficie PARZIALE · '+g.curves.length+'/'+g.expiries.length:g?.marketReady?'Superficie calibrata':g?.curves.length?'Skew disponibile':'Mark sospeso',g?.reason||book.issues.join(' / '));
  }catch(e){if(gen!==id)return;root.VolCube9.showError(e.message);setStatus('Calibrazione sospesa',e.message);}
  finally{if(gen===id){fitJob=null;renderState();}}
}
function sync(){
  const state=root.Desk?.state;el('vc10Desk').disabled=!state||state.demo||!state.parsed||!state.files?.length;
  if(!root.Desk)return;
  const c=JSON.stringify(currentCfg());
  if(lastCfg&&lastCfg!==c&&files.size){clearBook('Parametri di calibrazione aggiornati. Esegui il fit con i filtri correnti.');renderState();}
  lastCfg=c;
}
function open(name){
  if(liveTimer){clearInterval(liveTimer);liveTimer=null;}
  if(name==='volcube'){live();sync();renderState();root.VolCube9.refresh();liveTimer=setInterval(live,15000);}
}
for(const id of slots){
  el('vc10File-'+id).onchange=e=>{const arr=[...e.target.files];e.target.value='';return take(id,arr);};
  el('vc10Del-'+id).onclick=()=>remove(id);
}
el('vc10Batch').onchange=e=>{const arr=[...e.target.files];e.target.value='';return take('batch',arr);};
el('vc10Desk').onclick=()=>{const s=root.Desk?.state;if(!s?.demo&&s?.parsed)return take('desk',s.files);};
el('vc10Other').onclick=e=>{const b=e.target.closest?.('[data-vc-remove]');if(b)remove(b.dataset.vcRemove);};
el('vc10Date').onchange=()=>{if(el('vc10ClockMode').value==='manual')el('vc10Time').value='';clearBook('Seduta modificata. Esegui la calibrazione.');renderState();};
el('vc10ClockMode').onchange=()=>{if(el('vc10ClockMode').value==='manual'&&!el('vc10Time').value){const t=selectInfo().latest;if(t!=null)el('vc10Time').value=D.timeET(t).slice(11);}clearBook('Cutoff modificato. Esegui la calibrazione.');renderState();};
el('vc10Time').oninput=()=>{clearBook('Cutoff modificato. Esegui la calibrazione.');renderState();};
el('vc10Fixes').onchange=e=>{if(!e.target.dataset.fixDate)return;overrides.set(e.target.dataset.fixDate,e.target.value);clearBook('Fixing modificato. Esegui la calibrazione.');renderState();};
el('vc10Keep').onclick=()=>{confirmReset=false;renderState();};
el('vc10New').onclick=()=>{
  if(!confirmReset){confirmReset=true;renderState();return;}
  cancelApi();
  for(const pending of reads.values())pending.job?.cancel();
  reads.clear();files.clear();overrides.clear();el('vc10ClockMode').value='last';
  message('');changed('Carica i CSV della nuova seduta.');
};
bindApi();
el('vc10Run').onclick=run;
el('vc13Audit').onclick=()=>{
  if(!lastAuditBook)return;
  const payload={schema:'quantistes.cvi.audit.v3.canonical',generatedAt:new Date().toISOString(),warning:'Contiene le chain CSV originali. Non pubblicare questo file senza autorizzazione.',
    app:'Quantistes Institutional Desk — CVI',cutoff:selectedAuditCutoff(),params:{...currentCfg(),jointMode:el('vc12JointMode').value},
    book:lastAuditBook,canonicalSurfaceAudit:root.CVIModelRouter?.exportBook(lastAuditBook)||[],inputs:[...files.values()].map(f=>({name:f.name,text:f.text}))};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='Quantistes_CVI_Audit_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function selectedAuditCutoff(){const x=selectInfo();return Number.isFinite(x.asof)?D.timeET(x.asof):null;}
el('vc12JointMode').onchange=()=>{clearBook('Modalità multiscadenza modificata. Premi Calibra superficie.');renderState();};
el('vc13Discount').onchange=()=>{clearBook('Fattore di sconto modificato. Ricalibra per riesaminare forward, strike e calendar.');renderState();};
el('vc9Params').onclick=()=>{if(el('terminalSidebar').hidden)el('terminalSettings').click();};
if(el('monSurface'))el('monSurface').onclick=()=>root.Desk.tab('volcube');
root.VolCubeDesk=Object.freeze({open,sync});
live();sync();renderState();setStatus('Attesa CSV');
})(globalThis);
