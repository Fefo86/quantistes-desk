
(function(w){
'use strict';
const F=Number.isFinite,C=w.InstCore;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const fmt=v=>F(v)?v.toLocaleString('it-IT',{maximumFractionDigits:3}):'—';
const stamp=t=>F(t)?new Date(t).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
const state=v=>v===true?'confermata':v===false?'assente':'da verificare';
function native(row,c){
 if(!['P05','P22'].includes(row.id))return;
 const found=[],fix=w.DeskCalendar10?.fixing?.(c.date);if(!fix?.verified||!fix.isSession)return;
 if(row.id==='P05'){
  const d=w.Desk?.state,r=d?.result,t=r?.cfg?.asof&&w.QuantCore.nyEpoch(r.cfg.asof);
  if(!d?.stale&&r?.ws?.qAudit?.passed&&r.cfg.expiry===c.date&&w.DeskMeasures.recent(t,c.cutMs,90)&&c.cutMs<=fix.epochMs&&d.parsed?.rows?.some(q=>q.symbol==='SPXW'&&q.expiry===c.date))found.push([1,true,'SPXW PM · fixing '+fix.etClose+' ET']);
 }else{
  found.push([2,c.start>=570&&c.start<=585,'Finestra cash open 09:30–09:45 ET']);
  const feed=w.QuantistesConfluence?.evidence?.()?.snapshot,es=feed?.es,spot=w.DeskMarkets?.state?.(c.cutMs)?.spx;
  const et=w.DeskMeasures.stamp(es?.asof),ft=w.DeskMeasures.stamp(feed?.asof);
  if(es?.contract&&es.last>0&&spot?.price>0&&w.DeskMeasures.recent(et,c.cutMs,60)&&w.DeskMeasures.recent(ft,c.cutMs,60)&&w.DeskMeasures.recent(spot.t,c.cutMs,60)&&Math.abs(spot.t-et)<=30000)found.push([1,true,'Basis '+es.contract+' − SPX '+fmt(es.last-spot.price)+' pt']);
 }
 if(!found.length)return;
 const h=row.known,g=h?.gates.slice()||row.labels.map(()=>null);
 const conflict=[];for(const [i,v] of found){if(g[i]==null)g[i]=v;else if(g[i]!==v){g[i]=null;conflict.push(i);}}
 row.known={...h,asof:h?.asof||new Date(c.cutMs).toISOString(),veto:h?.veto??null,gates:g,source:[h?.source,...found.map(a=>a[2])].filter(Boolean).join(' / '),definition:h?.definition||'Condizioni di sessione e osservazioni sincronizzate.'};
 row.nativeEvidence=found.map(([index,value,origin])=>({index,value,origin}));if(conflict.length){row.nativeConflict=conflict;row.state='Fonti discordanti';row.estimate.p=null;}
 else if(!h||g.some((v,i)=>v!==h.gates[i])){row.state=row.known.veto?'Veto':g.includes(false)?'Inattivo':g.includes(null)||row.known.veto==null?'Dati parziali':'Attivo · da calibrare';row.estimate={...row.estimate,p:null};}
}
const sideSignal=(id,f)=>['US','SPX','ES'].includes(f.scope)&&f.g==='cta'&&f.k==='flow'&&f.mode==='scenario'&&F(f.raw)&&((id==='P10'&&f.scenario==='down'&&f.raw<0)||(id==='P11'&&f.scenario==='up'&&f.raw>0));
const prerequisites={P05:[1],P06:[2],P08:[0],P09:[1,2],P10:[2],P14:[2],P22:[1,2]};
function record(row,report=false){
 const gates=row.known?.gates?.slice()||row.labels.map(()=>null),known=gates.filter(x=>x===true).length;
 const confirmed=gates.filter((v,i)=>v===true&&!(prerequisites[row.id]||[]).includes(i)).length;
 const conflict=row.state==='Fonti discordanti'||!!row.nativeConflict?.length||row.reportEvidence?.evidence?.some(r=>r.conflict||r.nativeConflict);
 const stopped=row.known?.veto===true||gates.includes(false);
 const direct=report?(row.reportContext||[]).filter(f=>sideSignal(row.id,f)):[];
 let tier,title;
 if(row.outside){tier=0;title='Fuori perimetro';}
 else if(conflict){tier=1;title='Discordante';}
 else if(stopped){tier=2;title=row.known?.veto?'Veto':'Condizione assente';}
 else if(row.state==='Attivo'&&F(row.estimate?.p)){tier=8;title='Attivo · P stimata';}
 else if(gates.every(v=>v===true)&&row.known?.veto===false){tier=7;title='Attivo · da calibrare';}
 else if(confirmed){tier=6;title='Condizioni osservate';}
 else if(direct.length){tier=5;title='Scenario pertinente';}
 else if(row.proxy?.active===true){tier=4;title='Solo proxy di prezzo';}
 else{tier=3;title=known?'Solo prerequisiti':'In attesa';}
 const tuple=[tier,tier===6?confirmed:0,tier===6?known-confirmed:0,tier===6&&direct.length?1:0];
 return {title,tier,tuple,gates,substantive:confirmed,prerequisites:known-confirmed,veto:row.known?.veto??null,remaining:row.labels.filter((_,i)=>gates[i]==null),direct,estimate:F(row.estimate?.p)?row.estimate.p:null};
}
const cmp=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return b[i]-a[i];return 0;};
function rank(rows){
 for(const r of rows){
  if(!r.withoutReports)r.withoutReports=record(r);r.withReports=record(r,true);
  const bef=r.withoutReports,aft=r.withReports,ev=r.reportEvidence?.evidence||[];
  const changes=ev.filter(e=>bef.gates[e.index]!==aft.gates[e.index]||e.conflict||e.nativeConflict);
  const drivers=changes.length?changes.flatMap(e=>e.readings.map(f=>({...f,reason:r.labels[e.index]+' '+(e.conflict||e.nativeConflict?'discordante':state(e.value))}))):aft.direct.map(f=>({...f,reason:'Flusso condizionale '+(f.scenario==='down'?'in ribasso':'in rialzo')+' · '+f.h}));
  const relation=changes.length?'condizione':aft.direct.length?'scenario':ev.length?'conferma':r.reportContext?.length?'contesto':'nessuno';
  r.reportImpact={relation,changes:changes.map(e=>({index:e.index,label:r.labels[e.index],before:bef.gates[e.index],after:aft.gates[e.index],conflict:!!(e.conflict||e.nativeConflict)})),drivers};
 }
 function places(key,place){
  const sorted=rows.filter(r=>!r.outside).slice().sort((a,b)=>cmp(a[key].tuple,b[key].tuple)||a.id.localeCompare(b.id));
  let last=null,n=0;for(const [i,r] of sorted.entries()){if(!last||cmp(last,r[key].tuple)!==0)n=i+1;r[place]=n;last=r[key].tuple;}
  const ties=new Map();for(const r of sorted)ties.set(r[place],(ties.get(r[place])||0)+1);for(const r of sorted)r[place+'Ties']=ties.get(r[place]);
 }
 places('withoutReports','beforeRank');places('withReports','rank');return rows;
}
const ordered=rows=>[...rows].sort((a,b)=>(a.rank??1e5)-(b.rank??1e5)||a.id.localeCompare(b.id));
const button=(id,t)=>'<button type="button" data-da-book="'+esc(id)+'">'+esc(t||id)+' ↗</button>';
const source=f=>'<button type="button" data-da-doc="'+esc(f.doc)+'" data-da-seg="'+esc(f.seg||'')+'" data-da-fact="'+esc(f.id||'')+'">'+esc(f.provider+' · p. '+(f.page||'—'))+'</button>';
function releasePreview(doc){
 if(!doc)return null;if(Object.hasOwn(doc,'preview'))return doc.preview;
 const v=w.InstEngine.at(doc.readings,doc.pub),g=w.InstEngine.gates('P10',v)?.evidence?.find(e=>e.index===1);
 if(g&&!g.conflict&&g.readings?.length){const f=g.readings[0];doc.preview={metric:'weight',line:'P10 · esposizione lunga residua '+(g.value?'confermata':'assente')+' ('+f.value+', p. '+f.page+')'};}
 else{const f=(v.active||[]).filter(f=>['US','SPX','ES'].includes(f.scope)&&f.k==='flow'&&f.scenario==='down'&&f.v<0).sort((a,b)=>a.v-b.v)[0];
 doc.preview=f?{metric:'flow',line:'P10 · vendite condizionali '+w.InstEngine.display(f)+' / '+f.h+' nello scenario ribassista'}:null;}return doc.preview;
}
const jump=(d)=>'<button type="button" data-da-preview="'+esc(d.doc)+'" data-da-metric="'+esc(releasePreview(d)?.metric||'')+'" data-da-seg="'+esc(d.seg??'')+'">Esamina '+esc(d.provider)+' alla pubblicazione ↗</button>';
let fileCache=null,lastHtml='',painted=null;
function chronology(){
 const r=w.InstReports,ver=r?.version?.();if(!r?.chartReadings)return [];
 if(fileCache?.ver===ver)return fileCache.events;
 const box={ver,events:null};fileCache=box;r.chartReadings().then(readings=>{
  if(fileCache!==box)return;const events=new Map();for(const f of readings){if(!f.enabled||f.review||!F(f.pub))continue;const k=JSON.stringify([f.doc,f.seg]);if(!events.has(k))events.set(k,{doc:f.doc,seg:f.seg,provider:f.provider,pub:f.pub,series:f.series,asof:f.asof,readings:[]});events.get(k).readings.push(f);}
  box.events=[...events.values()].sort((a,b)=>b.pub-a.pub);w.InstitutionalDesk?.refreshPlaybooks?.();
 }).catch(()=>{if(fileCache===box)box.events=[];});return null;
}
let jointHistory=null;
function history(){
 const repo=w.InstReports;if(!repo?.chartReadings)return null;
 const ver=repo.version();if(jointHistory?.version===ver)return jointHistory;
 const box={version:ver,days:null,gates:new Map()};jointHistory=box;
 repo.chartReadings().then(readings=>{
  if(jointHistory!==box)return;const days=new Map(),series=new Map();for(const f of readings){
   if(!f.asof||!F(f.pub)||!f.enabled||f.review)continue;
   if(!days.has(f.asof))days.set(f.asof,[]);days.get(f.asof).push(f);
   const k=w.ReportIntel.comparable(f);if(!series.has(k))series.set(k,[]);series.get(k).push(f);
  }
  box.days=days;box.series=series;w.dispatchEvent(new CustomEvent('desk:book-calibration'));w.InstitutionalDesk?.refreshPlaybooks?.();
 }).catch(()=>{});return box;
}
function historicalGate(box,id,r){
 const revision=w.DeskMarkets?.revision?.()||0,k=[id,r.a,revision].join('|');if(box.gates.has(k))return box.gates.get(k);
 const day=w.DeskMeasures.dayISO(r.date),t=Date.parse(day+'T12:00Z'),inputs=[];
 for(let i=0;i<9;i++){const d=new Date(t-i*864e5).toISOString().slice(0,10);inputs.push(...(box.days.get(d)||[]));}
 const at=w.InstEngine.at(inputs,r.a);
 // A change can use the preceding comparable edition even if its level is no longer current.
 if(['P12','P17'].includes(id)){
  const rows=at.active.flatMap(f=>box.series.get(w.ReportIntel.comparable(f))||[]);
  at.changes=w.ReportSignals.changes(rows,at.active,r.a);
 }
 const result=w.InstEngine.gates(id,at);box.gates.set(k,result);return result;
}
function recover(row,now,pool,c){
 if(!now||now.veto||row.known?.veto!==false||!row.known.gates.every(x=>x===true)||!row.reportEvidence?.evidence?.length||row.nativeConflict?.length||row.state==='Fonti discordanti')return;
 const proof=row.reportEvidence.evidence.filter(e=>e.value===true&&row.withoutReports.gates[e.index]==null);
 if(!proof.length)return;
 const box=history();if(!box?.days)return;
 const origin=e=>e.readings.map(f=>f.channel).filter(Boolean).sort().filter((a,i,b)=>i===0||b[i-1]!==a).join('|');
 const channels=proof.map(origin);if(channels.some(v=>!v))return;
 const cohorts=pool.filter(r=>r.date<c.before&&r.av<=r.a&&r.veto===false&&r.source===now.source&&r.definition===now.definition&&r.success!=null&&r.reported<=c.cutMs&&Math.abs(r.vix-c.vix)<=c.band);
 const episodes=new Set();let n=0,k=0;
 for(const r of cohorts.slice().sort((a,b)=>a.a-b.a)){
  if(r.gates.some(g=>g===false))continue;
  const gates=r.gates.slice(),res=historicalGate(box,row.id,r);
  if(!res||res.evidence.some(e=>e.conflict||gates[e.index]!=null&&gates[e.index]!==e.value))continue;
  const matched=proof.map((p,i)=>res.evidence.find(e=>e.index===p.index&&e.value===true&&origin(e)===channels[i]));
  if(matched.some(x=>!x))continue;
  for(const e of matched)gates[e.index]=true;
  if(gates.some(g=>g!==true))continue;
  const episode=matched.flatMap(e=>e.readings.map(f=>[f.channel,f.asof].join('/'))).sort().join('|');
  const current=proof.flatMap(e=>e.readings.map(f=>[f.channel,f.asof].join('/'))).sort().join('|');
  if(episode===current||episodes.has(episode))continue;episodes.add(episode);n++;if(r.success)k++;
 }
 row.estimate=w.DeskPlaybooks.estimate(k,n);row.conditional={...row.estimate};row.state=row.estimate.p==null?'Attivo · campione ridotto':'Attivo';
 row.calibration={source:'Condizioni operative e report omogenei',origins:n,successes:k,channels,unit:'Una seduta per combinazione di edizioni'};
 row.detail=(row.detail?row.detail+' ':'')+'Calibrazione con report: '+k+' esiti su '+n+' origini anteriori della stessa definizione.';
}

function detail(r){
 const im=r.reportImpact;if(!im)return '';
 const watches=im.drivers.slice(0,4).map(f=>esc(f.reason)+' · <b>'+esc(f.value)+'</b> '+source(f)).join('<br>');
 return '<div class="da-book-effect"><small>Effetto dei report</small><b>'+esc(r.withoutReports.title)+' → '+esc(r.withReports.title)+'</b><span>'+esc(r.rank?'Priorità '+r.beforeRank+(r.beforeRankTies>1?' ex aequo ('+r.beforeRankTies+')':'')+' → '+r.rank+(r.rankTies>1?' ex aequo ('+r.rankTies+')':''):'Fuori graduatoria')+'</span>'+
 (watches?'<p>'+watches+'</p>':im.relation==='contesto'?'<p>Il report descrive il regime. Le condizioni operative richiedono ulteriori osservazioni.</p>':'')+'</div>';
}
const uid=(doc,seg,id)=>JSON.stringify([doc,seg,id]);
function mapFacts(v,rows,decision){
 const hits=new Map(),calcIndex=new Map(),derived=v?.derived||[];
 function add(map,k,value){if(!map.has(k))map.set(k,new Set());map.get(k).add(value);}
 for(const row of rows){for(const gate of row.reportEvidence?.evidence||[])for(const r of gate.readings){const role=row.id+' · '+(gate.conflict||gate.nativeConflict?'discordanza':state(gate.value));for(const f of r.inputs?.length?r.inputs:[r])add(hits,uid(f.doc,f.seg,f.id),role);}}
 const features=new Map();for(const f of decision?.model?.features||[])for(const s of f.refs||[])features.set(uid(s.doc,s.seg,s.id),f);
 for(const d of derived)for(const i of d.inputs)add(calcIndex,uid(d.doc,d.seg,i),d.title);
 const raw=(v?.active||[]).map(f=>{
  const key=uid(f.doc,f.seg,f.id),gates=[...(hits.get(key)||[])],signal=features.get(key),books=w.ReportLinks.playbooks(f),role=gates.length?gates.join(' / '):f.scenario?'Scenario '+(w.ReportFigures?.scenario[f.scenario]||f.scenario):books.length?'Contesto '+books.join(' / '):'Contesto descrittivo';
  return {name:f.name||C.metrics[f.k]?.[0]||f.k,value:w.InstEngine.display(f),scope:f.scope,h:f.h,role,inputsFor:[...(calcIndex.get(key)||[])],signal:signal?signal.state==null?'Stato sospeso':!signal.used?'Copertura in formazione':decision.applied?'Stato convalidato':'Stato in verifica':null,doc:f.doc,seg:f.seg,id:f.id,page:f.page,provider:f.provider};
 });
 const calcs=derived.map(d=>{
  const linked=w.ReportLinks.playbooks({...d,calc:true,k:'calc-'+d.id}),applied=[];
  for(const row of rows)for(const g of row.reportEvidence?.evidence||[])if(g.readings.some(r=>r.name===d.title&&r.doc===d.doc&&r.seg===d.seg))applied.push(row.id+' · '+(g.conflict||g.nativeConflict?'discordanza':state(g.value)));
  const refs=d.inputs.map(i=>{const f=(v.active||[]).find(r=>r.doc===d.doc&&r.seg===d.seg&&r.id===i);return {doc:d.doc,seg:d.seg,id:i,page:f?.page,provider:d.provider};});
  return {derived:true,name:d.title,value:fmt(d.v)+' '+d.unit,scope:d.scope,h:d.h,role:applied.length?applied.join(' / '):linked.length?'Contesto '+linked.join(' / '):'Indicatore derivato',inputs:refs,inputsFor:[],doc:d.doc,seg:d.seg,id:refs[0]?.id,page:refs[0]?.page,provider:d.provider};
 });
 return raw.concat(calcs);
}
function validationTable(m){
 if(!m?.probability)return '';
 const ci=z=>z&&F(z.lo)&&F(z.hi)?fmt(z.mean)+' ['+fmt(z.lo)+' / '+fmt(z.hi)+']':'—';
 return '<div class="ir-scroll"><table><thead><tr><th>Evento ES</th><th>P nello stato</th><th>Δ Brier vs ES/VIX · IC 95%</th><th>Δ Brier vs mercato · IC 95%</th><th>Scelte fuori campione</th><th>Payoff netto · tick / IC 95%</th></tr></thead><tbody>'+['Long','Short'].map((side,i)=>'<tr><td>'+side+'</td><td>'+(F(m.probability[i])?fmt(m.probability[i]*100)+'%':'—')+'</td><td>'+ci(m.gainVsES?.[i])+'</td><td>'+ci(m.gainVsMarket?.[i])+'</td><td>'+(m.oosDirectional?.[i]??0)+'</td><td>'+ci(m.oosNet?.[i])+'</td></tr>').join('')+'</tbody></table></div>';
}
function compactDecision(frame,dec,rows){
 const v=w.InstReports?.peek?.(frame?.settings?.cutMs),ranked=ordered(rows).filter(r=>!r.outside);
 return {base:dec.base,withoutReports:dec.withoutReports,withReports:dec.signal,applied:dec.applied,validation:dec.model,ranked:ranked.map(r=>({id:r.id,rank:r.rank,before:r.beforeRank,equals:r.rankTies,equalsBefore:r.beforeRankTies,after:r.withReports,withoutReports:r.withoutReports,reportImpact:r.reportImpact})),readings:mapFacts(v,rows,dec)};
}
function render(frame,dec,rows){
 const el=$('deskImpactMain')||$('deskImpact');if(!el)return;const archive=chronology(),t=frame?.settings?.cutMs,view=w.InstReports?.peek?.(t);if(painted&&painted.frame===frame&&painted.rows===rows&&painted.archive===archive&&painted.view===view&&painted.model===dec.model)return;painted={frame,rows,archive,view,model:dec.model};const ranked=ordered(rows).filter(r=>!r.outside),model=dec.model,full=model?.combined;
 const changes=ranked.filter(r=>['condizione','scenario'].includes(r.reportImpact?.relation)).sort((a,b)=>Number(b.reportImpact.relation==='condizione')-Number(a.reportImpact.relation==='condizione')||a.rank-b.rank);
 const shortlist=ranked.filter(r=>r.withReports?.tier>=4).slice(0,3),docs=archive||[],active=view?.active||[];
 const counts=active.length+' letture al cutoff'+(view?.conflicts?.length?' · '+view.conflicts.length+' discordanti':'');
 const block=(title,v,why)=>'<div><small>'+esc(title)+'</small><strong>'+esc(v||'ATTESA')+'</strong><span>'+esc(why)+'</span></div>';
 const flag=(r,i)=>r.withReports?.tier>=7?'active':r.withReports?.tier===2?'blocked':i?'partial':'quiet';
 const reportReason=!F(t)?'Seleziona una seduta con prezzi ES e VIX.':!view?'Lettura dei report in corso.':!active.length?view.stale?'Le letture disponibili sono scadute.':'Nessuna lettura vigente a quest’ora.':!frame?.ready?'In attesa del setup ES.':full?.validated?'Le letture istituzionali concorrono alla scelta del lato.':model?.error?'Serie congiunte indisponibili per questo setup.':'Le letture contribuiscono al contesto dei playbook. Lo storico congiunto non sostiene una variazione del segnale ES.';
 const dr=mapFacts(view,rows,dec);
 let html='<div class="da-head"><h2>Attribuzione del segnale ES</h2><span>'+esc(F(t)?stamp(t):'Ora ES da definire')+'</span></div><div class="da-chain">'+
 block('ES / VIX · riferimento',dec.base,frame?.ready?frame.n+' sedute comparabili':'Serie prezzi richiesta')+block('Mercato · senza PDF',dec.withoutReports,model?.market?.validated?'Condizioni di mercato utilizzate':'Riferimento ES / VIX')+block('Mercato + report',dec.signal,full?.validated?'Contributo istituzionale attivo':counts)+'</div>'+
 '<div class="da-cause"><strong>'+esc(dec.applied?(dec.signal!==dec.withoutReports?'Segnale modificato':'Segnale confermato'):'Effetto dei PDF sul segnale')+'</strong> '+esc(reportReason)+'</div>';
 if(!docs.length&&archive&&active.length===0)html+='<div class="da-clock">Archivio report vuoto. <button type="button" data-da-upload="1">Apri il caricamento PDF ↗</button></div>';
 html+='<div class="da-pair"><section><h3>Playbook in evidenza</h3>'+
 (shortlist.length?shortlist.map(r=>'<div class="da-move"><span class="da-rank">#'+r.rank+'</span><div>'+button(r.id,r.id+' '+r.name)+'<small>'+esc(r.withReports.title)+(r.withReports.remaining.length?' · da verificare '+esc(r.withReports.remaining[0]):'')+'</small></div></div>').join(''):'<p>Nessun playbook con condizioni, scenari direzionali o proxy attivi.</p>')+
 '</section><section><h3>Che cosa ha cambiato il report</h3>'+
 (changes.length?changes.slice(0,4).map(r=>{const f=r.reportImpact.drivers[0];return '<div class="da-move" data-kind="'+flag(r,1)+'"><span class="da-rank">'+(r.beforeRank===r.rank?(r.withReports.tier>r.withoutReports.tier?'↑':r.withReports.tier<r.withoutReports.tier?'↓':'='):r.rank<r.beforeRank?'↑':'↓')+'</span><div>'+button(r.id,r.id+' '+r.name)+'<small>'+esc(r.withoutReports.title+' → '+r.withReports.title)+' · #'+r.beforeRank+' → #'+r.rank+'</small>'+(f?'<span>'+esc(f.reason+' · '+f.value)+' '+source(f)+'</span>':'')+'</div></div>';}).join(''):'<p>'+esc(active.length?'Le letture disponibili forniscono contesto oppure confermano condizioni già note.':'Nessuna condizione modificata al cutoff ES.')+'</p>')+'</section></div>';
 html+=
 '<details class="da-more"><summary>Letture istituzionali ('+active.length+' letture · '+(view?.derived?.length||0)+' calcoli)</summary>'+(dr.length?'<div class="ir-scroll"><table><thead><tr><th>Indicatore</th><th>Valore</th><th>Uso nel segnale</th><th>Origine</th></tr></thead><tbody>'+dr.map(f=>'<tr><td>'+esc(f.name)+'<small>'+esc([f.scope,f.h].filter(Boolean).join(' · '))+'</small></td><td>'+esc(f.value)+'</td><td>'+esc([f.role,f.signal].filter(Boolean).join(' · '))+(f.inputsFor?.length?'<small>'+esc('Input di '+f.inputsFor.join(' / '))+'</small>':'')+'</td><td>'+(f.derived?[...new Map(f.inputs.map(x=>[x.page,x])).values()].map(source).join(' '):source(f))+'</td></tr>').join('')+'</tbody></table></div>':'<p>Le letture compaiono dalla loro disponibilità effettiva e per la durata della loro validità.</p>')+'</details>';
 if(html===lastHtml)return;const opened=[...el.querySelectorAll('details')].map(d=>d.open);lastHtml=html;el.innerHTML=html;[...el.querySelectorAll('details')].forEach((d,i)=>d.open=!!opened[i]);
}
function click(ev){
 const a=ev.target.closest?.('[data-da-book],[data-da-doc],[data-da-preview],[data-da-upload]');if(!a)return;
 if(a.dataset.daBook)w.DeskPlaybooks.focusBook(a.dataset.daBook);
 else if(a.dataset.daDoc)w.InstPanels.source(a.dataset.daDoc,Number(a.dataset.daSeg)||null,Number(a.dataset.daFact)||null);
 else if(a.dataset.daPreview)w.ReportWorkspace.document(a.dataset.daPreview,Number(a.dataset.daSeg)||null,a.dataset.daMetric);
 else if(a.dataset.daUpload)$('q15DataButton')?.click();
}
document.addEventListener('click',click);
w.DeskTriage={recover,native,record,rank,ordered,detail,render,compactDecision,mapFacts};
})(window);

