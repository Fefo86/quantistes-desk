

(function(w){
'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Each column is a distinct observable precondition. The outcome is evaluated on the declared horizon.
const specs=[
 ['Dealer absorption / reversion','Dealer','Rientro nella fascia di prezzo','Campo dealer stabilizzante|Pressione eseguita alla fascia|Assorbimento confermato'],
 ['Gamma cliff escape','Dealer','Continuazione oltre il cliff','Cliff stabile|Attraversamento osservato|Trasmissione alla liquidità confermata'],
 ['Vanna-driven drift','Dealer','Drift ES nella direzione della copertura','Innovazione IV osservata|Risposta delta coerente con lo shock di smile|Trasmissione a ES firmata'],
 ['Charm window','Dealer','Drift ES entro la finestra di copertura','Risposta charm persistente|Spot nel corridoio prefissato|Finestra di hedge aperta'],
 ['Expiry release / migration','Dealer','Escursione oltre la fascia pre-fixing','Roll o bassa esposizione superstite|Fixing identificato|Fascia pre-fixing registrata'],
 ['Skew–P downside disagreement','Volatilità','Violazione della soglia downside registrata','Compressione put skew|Coda P invariata o più pesante|Ali liquide e orizzonti allineati'],
 ['VRP compression fragility','Volatilità','Perdita di coda oltre soglia','VRP in compressione sullo stesso orizzonte|Offerta concentrata|Rischio fisico in rialzo'],
 ['Post-event vol clearing','Volatilità','Movimento post-evento nella direzione registrata','Release già avvenuta|Componente evento in calo|Campo hedge aggiornato'],
 ['Informed option-flow candidate','Opzioni','Markout netto positivo dopo costi','Flusso residuo del package estremo|Classificazione affidabile|Catalyst controllato'],
 ['CTA stop-out cascade','Sistematici','Continuazione downside dopo il trigger CTA','Trigger downside superato|Esposizione lunga residua|Finestra rebalance aperta'],
 ['CTA stop-in squeeze','Sistematici','Continuazione upside dopo il trigger CTA','Trigger upside superato|Gap positivo di esposizione|Offerta residua limitata'],
 ['Vol-control re-risk','Sistematici','Acquisti netti nel kernel di rebalance','Forecast RV in calo|Target leverage in aumento|Gap di allocazione positivo'],
 ['Risk-parity covariance shock','Sistematici','Deleveraging cross-asset con quota ES','Shock di covarianza osservato|Leva target in calo|Allocazione ES identificata'],
 ['LETF close pressure','Sistematici','Flusso di chiusura coerente con il reset','Reset per prodotto calcolato|Capital flows aggiornati|Finestra di chiusura aperta'],
 ['Supply exhaustion','Volatilità','Rialzo IV oltre soglia','Domanda di volatilità in aumento|Elasticità di offerta in calo|Capacità sotto pressione'],
 ['VIX convexity stress','Volatilità','Propagazione dello stress a ES','Domanda call wing VIX|Risposta del future VX pertinente|Conferma indipendente del vincolo di liquidità'],
 ['Dispersion unwind','Volatilità','Unwind con deterioramento della breadth','Repricing correlazione implicita|Domanda index vol relativa in aumento|Esposizione dispersion identificata'],
 ['Under-capture chase','Sistematici','Acquisti marginali con breadth coerente','Gap dal benchmark|Capacità di aumentare beta|Leadership persistente'],
 ['De-grossing shock','Sistematici','Riduzione del gross con effetto ES registrato','Reversal fattoriale osservato|Gross exposure elevata|Vincolo di rischio attivato'],
 ['Seller-spent recovery','Percorsi','Recupero dopo esaurimento delle vendite','Backlog di vendita in calo|Assenza di nuovo target short|Ripresa del prezzo confermata'],
 ['Buyer-spent stall','Percorsi','Stallo o rientro dopo la spinta rialzista','Gap acquisti in chiusura|Sorpresa di domanda in calo|P di rientro coerente'],
 ['Overnight–open transition','Percorsi','Chiusura della discrepanza overnight–cash','Gap GTH osservato|Basis contemporanea|Finestra cash open attiva'],
 ['Liquidity vacuum','Esecuzione','Accelerazione nella direzione della pressione','Perdita di liquidità verificata|Persistenza della pressione|Conferma indipendente ES'],
 ['Joint mechanical cascade','Sistematici','Amplificazione oltre soglia','Ordini da capitali distinti|Finestre di esecuzione coincidenti|Capacità di assorbimento insufficiente']
].map(([name,family,event,labels],i)=>({id:'P'+String(i+1).padStart(2,'0'),name,family,event,labels:labels.split('|'),outside:[0,1,22].includes(i)}));
const criteria=[["Risposta dealer vicino al livello e conferma di esecuzione", "Nuovo catalyst o perdita del livello di rientro."], ["Profilo gamma e conferma di trasmissione in esecuzione", "Il cliff sparisce, il prezzo rientra o il routing diventa incerto."], ["Sequenza di smile, vanna firmata e quota di hedge ES", "Cambio di inventario, shock di smile non rappresentato o movimento già scontato."], ["Charm firmata su più tempi, spot e calendario hedge", "Nuovo inventario, shock spot dominante o dato scaduto."], ["Posizioni firmate per scadenza, fixing e roll abbinati", "Il roll ricostituisce la convessità o i fixing non sono comparabili."], ["Skew put/call 25Δ, quote sulle due ali e archivio cash SPX", "Quote illiquide, seduta precedente mancante o dipendenza di P dallo skew in esame."], ["Varianza implicita, previsione fisica sullo stesso orizzonte e offerta di volatilità", "Compressione post-evento ordinaria, payoff incompatibili o rischio fisico in calo."], ["Calendario release, quotazioni IV e hedge subito dopo l’evento", "Nuova release imminente o sorpresa macro dominante."], ["Flussi di package con segno e costo, classificazione e calendario", "Leg non identificate o apertura e chiusura delle posizioni indeterminate."], ["Distribuzione dei trigger CTA downside, esposizione residua e orari di ribilanciamento", "Coorte già scarica, esecuzione al solo close o rientro del trigger."], ["Distribuzione dei trigger CTA upside e capacità residua d’acquisto", "Domanda già anticipata o nuovo shock contrario."], ["Volatilità realizzata, regola di leva, esposizione iniziale e finestra di esecuzione", "Cap di leva già raggiunto, nuovo shock di RV o ribilanciamento già eseguito."], ["Rendimenti multi-asset, matrice di covarianza, pesi e leva di portafoglio", "Covarianze instabili o quota ES insufficiente a trasmettere lo shock."], ["NAV iniziale e leva per ETF, creazioni/rimborsi e calendario di chiusura", "Capitale datato al momento sbagliato o copertura già eseguita."], ["Domanda e offerta di opzioni, capacità e drawdown dei venditori", "Rientro dei venditori o cessazione della vendita scambiata per riacquisto."], ["VIX/VVIX, ala call VIX e future VX di maturità coerente", "Stress confinato al VIX o disallineamento delle scadenze."], ["Opzioni indice e componenti, pesi del paniere, correlazione e breadth", "Evento isolato su un componente o copertura del paniere insufficiente."], ["Benchmark e beta del portafoglio, capacità residua, leadership e breadth", "Esposizione già allineata o leadership in esaurimento."], ["Esposizioni long/short per fattore, vincoli di gross e beta netto", "Perdita comune senza vincolo attivo o netting non identificato."], ["Backlog di vendita, aggiornamenti del target e percorso ES", "Il target di vendita aumenta o arriva un nuovo catalyst."], ["Flussi e capacità residua d’acquisto, percorso ES e soglia di rientro", "Nuovi capitali o ulteriore aumento della domanda target."], ["Prezzi overnight e cash, basis contemporanea e orario di apertura", "Il cash invalida il riferimento overnight o il dato scade al cambio sessione."], ["Dati di esecuzione esclusi dal perimetro", "Pressione esaurita o ripristino della liquidità."], ["Capitali indipendenti, finestre di rebalance e capacità di assorbimento", "Lo stesso capitale figura due volte o l’effetto è già incluso nel modello P."]];specs.forEach((s,i)=>{[s.inputs,s.invalidates]=criteria[i];});
const proxyNames={P10:'Momentum ES negativo su 15 min',P11:'Momentum ES positivo su 15 min',P12:'Vol-control ES modellato: RV annualizzata degli ultimi 5 giorni RTH in calo, leva target 10% / RV in rialzo (cap 2×).',P16:'VIX e VVIX in rialzo nella seduta chiusa',P20:'Discesa ES su 10 min, recupero negli ultimi 5',P21:'Salita ES su 10 min, rientro negli ultimi 5'};
const pct=v=>v==null?'—':(v*100).toLocaleString('it-IT',{maximumFractionDigits:1})+'%';
let intradayVix=null;let observations=[],version=0,cache=null,latest=[],selected='',filter='all',indexRef,byDate,volDays,volRef;
const dates=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function local(ms){const p=Object.fromEntries(dates.formatToParts(ms).map(v=>[v.type,v.value]));return {date:Number(p.year+p.month+p.day),minute:Number(p.hour)*60+Number(p.minute)};}
const stamp=s=>w.DeskMeasures.stamp(s);
function wilson(k,n){if(!n)return [null,null];const p=k/n,z=1.95996398454,a=z*z/n,mid=(p+a/2)/(1+a),half=z*Math.sqrt((p*(1-p)+a/4)/n)/(1+a);return [Math.max(0,mid-half),Math.min(1,mid+half)];}
function estimate(k,n){return {k,n,p:n>=25?k/n:null,ci:n>=25?wilson(k,n):[null,null]};}
function parse(o){
 if(o?.schema!=='quantistes.playbooks.v1'||!Array.isArray(o.records)||o.records.length>100000)throw Error('Atteso quantistes.playbooks.v1 con un massimo di 100.000 osservazioni.');
 const seen=new Set();
 return o.records.map((r,i)=>{
  const spec=specs.find(s=>s.id===r.id),a=stamp(r.asof),av=stamp(r.available_at),end=stamp(r.outcome_at),reported=stamp(r.outcome_available_at),has=r.success!==undefined&&r.success!==null;
  const fail=()=>{throw Error('Osservazione '+(i+1)+' non valida. Verifica timestamp con fuso, definizione, condizioni e orizzonte.');};
  if(!spec||spec.outside||a===null||av===null||av>a||!Number.isInteger(r.h)||r.h<=0||r.h>390||typeof r.source!=='string'||!r.source.trim()||typeof r.definition!=='string'||!r.definition.trim()||!Array.isArray(r.gates)||r.gates.length!==spec.labels.length||r.gates.some(x=>x!==true&&x!==false&&x!==null)||typeof r.veto!=='boolean'||!Number.isFinite(r.vix)||r.vix<6||r.vix>100)fail();
  if(has&&(typeof r.success!=='boolean'||end===null||reported===null||end<=a||end>a+r.h*60000||reported<end))fail();
  if(!has&&(r.outcome_at!=null||r.outcome_available_at!=null))fail();
  const {date,minute}=local(a);if(new Date(a).getUTCSeconds()!==0||new Date(a).getUTCMilliseconds()!==0)fail();const key=[r.id,date,minute,r.h].join('|');if(seen.has(key))throw Error('Origine duplicata per playbook, orizzonte e minuto ET.');seen.add(key);
  return {id:r.id,date,minute,h:r.h,a,av,end,reported,success:has?r.success:null,gates:r.gates.slice(),veto:r.veto,vix:r.vix,source:r.source.trim(),definition:r.definition.trim()};
 });
}
function set(o){const checked=parse(o);observations=checked;version++;cache=null;w.InstitutionalDesk?.refreshPlaybooks?.();return checked.length;}
function indexes(){
 const d=w.Quantistes360?.data?.(),raw=d?.rows||[],v=d?.validation?.regime_daily||[];
 if(indexRef!==raw){indexRef=raw;byDate=new Map();intradayVix=new Map();for(const r of raw){if(r[1]===585)intradayVix.set(r[9],r[0]/100);if(!byDate.has(r[9]))byDate.set(r[9],new Map());byDate.get(r[9]).set(r[1],r[2]);}}
 if(volRef!==v){volRef=v;volDays=v.map(r=>[Number(String(r[0]).replaceAll('-','')),r[1],r[2]]).sort((a,b)=>a[0]-b[0]);}
}
let volRisk=null,riskTape=null,riskCloses=null,gapRef=null,gapMap=new Map();
function volModel(day){
 const data=w.Quantistes360?.data?.(),raw=data?.rows,closes=data?.validation?.regime_daily;
 if(!raw?.length||!closes?.length)return null;
 if(riskTape!==raw||riskCloses!==closes){
  riskTape=raw;riskCloses=closes;volRisk=new Map();
  const daily=new Map(closes.map(r=>[Number(String(r[0]).replaceAll('-','')),Number(r[3])])),rvs=[],pts=new Map();
  for(const r of raw){if(!pts.has(r[9]))pts.set(r[9],new Map());pts.get(r[9]).set(r[1],r);}
  let previous=null;
  for(const [date,px] of [...daily].sort((a,b)=>a[0]-b[0])){
   if(rvs.length>=6){const window=rvs.slice(-6);if(window.every(v=>v>0)){
    const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,prior=Math.sqrt(252*mean(window.slice(0,5))),current=Math.sqrt(252*mean(window.slice(1)));
    const prevWeight=Math.min(2,.10/prior),weight=Math.min(2,.10/current);
    volRisk.set(date,{current,prior,weight,prevWeight,active:current<prior&&weight>prevWeight+1e-9});
   }}
   const tape=pts.get(date),last=tape?.get(954);let variance=0;
   if(previous>0&&last){let valid=true;for(let m=570;m<=954;m++){const r=tape.get(m);if(!r||!Number.isFinite(r[2])){valid=false;break;}variance+=(.25*r[2]/previous)**2;}
    if(valid){for(let j=3;j<=6;j++)variance+=(.25*(last[j]-last[j-1])/previous)**2;}else variance=NaN;
   }else variance=NaN;rvs.push(variance);previous=px>0?px:null;
  }
 }
 return volRisk.get(day)||null;
}
function opening(c,co){
 const a=w.QuantistesPhysical?.playbookHistory?.();if(!a?.snapshots?.length||c.start!==585||!co?.sel||c.h>375)return null;
 if(gapRef!==a.snapshots){gapRef=a.snapshots;gapMap=new Map();let prior=null;for(const s of a.snapshots){
  if(prior&&s.spot_quote>0&&s.q_sigma_pts>0&&Date.parse(s.date)-Date.parse(prior.date)<=5*864e5&&prior.hasOutcome&&prior.c?.length>=375&&prior.anchor>0){
   const prev=prior.anchor+prior.c[374]*prior.q_sigma_pts/a.quantization_per_sigma,gap=s.spot_quote-prev;
   gapMap.set(w.DeskMeasures.dateKey(s.date),{gap,gapZ:gap/s.q_sigma_pts,prev,s});
  }prior=s;}}
 const curr=gapMap.get(c.before);if(!curr)return null;const sign=Math.sign(curr.gap);if(!sign)return null;
 const active=Math.abs(curr.gapZ)>=.25,valid=co.sel.map(s=>gapMap.get(s.date)).filter(z=>z&&Math.sign(z.gap)===sign&&Math.abs(z.gapZ)>=.25&&z.s.hasOutcome&&z.s.c?.length>=c.h);
 const k=valid.filter(z=>{for(let j=0;j<c.h;j++){const spot=z.s.anchor+z.s.c[j]*z.s.q_sigma_pts/a.quantization_per_sigma;if((spot-z.prev)*sign<=0)return true;}return false;}).length;
 return {...estimate(k,valid.length),active,title:'SPX 09:45 vs chiusura precedente. Gap di almeno 0,25σ, stesso lato. Target = riassorbimento del gap su chiusure SPX a 1m entro h.',side:-sign,label:'Proxy cash SPX',event:'Riassorbimento del gap entro h',detail:'Gap osservato '+curr.gap.toFixed(2)+' pt SPX.'};
}

function proxy(id,day,start,ticks){
 if(id==='P12'){const r=volModel(day);return r?r.active?1:0:null;}
 if(id==='P16'){
  const v=volDays.filter(r=>r[0]<day).slice(-2);
  const utc=n=>Date.parse(String(n).replace(/^(....)(..)(..)$/,'$1-$2-$3T00:00:00Z'));
  if(v.length<2||utc(day)-utc(v[1][0])>5*864e5||utc(v[1][0])-utc(v[0][0])>5*864e5||v.some(r=>!(r[1]>0&&r[2]>0)))return null;
  return v[1][1]>v[0][1]&&v[1][2]>v[0][2]?-1:0;
 }
 const tape=byDate.get(day);if(!tape||start<585)return null;let early=0,late=0;
 for(let m=start-15;m<start;m++){const move=tape.get(m);if(!Number.isFinite(move))return null;if(m<start-5)early+=move;else late+=move;}
 if(id==='P10')return early+late<=-ticks?-1:0;
 if(id==='P11')return early+late>=ticks?1:0;
 if(id==='P20')return early<=-ticks&&late>=Math.max(1,ticks/4)?1:0;
 if(id==='P21')return early>=ticks&&late<=-Math.max(1,ticks/4)?-1:0;
 return null;
}
function targetFirst(values,side,t,s){for(let i=1;i<values.length;i++){const v=values[i]*side*4;if(v>=t)return true;if(v<=-s)return false;}return false;}
let cashSource=null,cashDays=[],skewRef=null,skewTape=null,skewCache=new Map();
function adjacentCash(prev,date){
 const delta=Date.parse(date)-Date.parse(prev);if(!(delta>0)||delta>6*864e5)return false;
 for(let t=Date.parse(prev)+864e5;t<Date.parse(date);t+=864e5){const d=new Date(t),iso=d.toISOString().slice(0,10),wk=d.getUTCDay();if(wk>0&&wk<6&&(w.DeskCalendar10?.fixing(iso)?.isSession??true))return false;}return true;
}
function cashArchive(){
 const days=w.QuantistesDynamicCore?.state?.days;if(!days?.length)return null;if(days===cashSource)return cashDays;
 cashSource=days;cashDays=[];let trailing=[],lastDay=null;
 for(const z of [...new Map(days.map(s=>[s.d,s])).values()].sort((a,b)=>a.d.localeCompare(b.d))){
  if(lastDay&&!adjacentCash(lastDay,z.d))trailing=[];
  if(!z.c||z.c.length!==375||!(z.a>0)){trailing=[];lastDay=z.d;continue;}
  const risk=trailing.length===5?Math.sqrt(trailing.reduce((sum,v)=>sum+v,0)/5):null;
  let v=0,prev=1;for(const n of z.c){const close=1+n/100000;if(!Number.isFinite(close)||close<=0){v=NaN;break;}v+=Math.log(close/prev)**2;prev=close;}
  if(Number.isFinite(v)){trailing.push(v);if(trailing.length>5)trailing.shift();const after=trailing.length===5?Math.sqrt(trailing.reduce((sum,v)=>sum+v,0)/5):null;cashDays.push({d:z.d,risk,after,c:z.c});}else trailing=[];lastDay=z.d;
 }return cashDays;
}
function skewSignal(c){
 const archive=w.QuantistesPhysical?.playbookHistory?.(),rows=archive?.snapshots,prices=cashArchive();
 if(c.start!==585||c.h>375||!rows?.length||!prices?.length)return null;
 if(skewRef!==rows||skewTape!==prices){skewRef=rows;skewTape=prices;skewCache=new Map();}
 const key=[c.h,c.before,c.vix,c.band].join('|');if(skewCache.has(key))return skewCache.get(key);
 const observations=[],byDay=new Map(prices.map(z=>[z.d,z]));let prev=null;
 for(const s of rows){
  const date=w.DeskMeasures.dateKey(s.date);if(date>c.before)break;
  const cash=byDay.get(s.date),history=prices.filter(p=>p.d<s.date),last=history.at(-1),risk=last&&adjacentCash(last.d,s.date)?last.after:null,prior=risk>0?history.filter(p=>p.risk>0):[];
  const analog=prior.length>=75?prior.map(p=>({d:p.d,c:p.c,dist:Math.abs(Math.log(p.risk/risk))})).sort((a,b)=>a.dist-b.dist||b.d.localeCompare(a.d)).slice(0,60):[];
  const q=analog.length?analog.filter(p=>p.c[c.h-1]<=-250).length/analog.length:null;
  const spread=(Number.isFinite(s.iv25_put)&&Number.isFinite(s.iv25_call))?s.iv25_put-s.iv25_call:null;
  const wings=[-1,1].map(sign=>s.quotes?.some(row=>{const offset=sign*(row[0]-s.spot_quote)/s.q_sigma_pts;if(offset<.4||offset>.95)return false;const bid=sign<0?row[3]:row[1],ask=sign<0?row[4]:row[2];return bid>0&&ask>=bid&&(ask-bid)/((ask+bid)/2)<=.25;})||false);
  if(prev&&q!=null&&prev.q!=null&&spread!=null&&prev.spread!=null&&adjacentCash(prev.date,s.date)){
   const gates=[spread<prev.spread,q>=prev.q,wings.every(Boolean)&&prev.wings.every(Boolean)],actual=cash?cash.c[c.h-1]<=-250:null;
   observations.push({date,gates,q,spread,actual});
  }prev={date:s.date,q,spread,wings};
 }
 const curr=observations.find(z=>z.date===c.before);if(!curr){skewCache.set(key,null);return null;}
 const eligible=observations.filter(z=>z.date<c.before&&z.actual!=null&&z.gates.every(Boolean)&&intradayVix?.has(z.date)&&Math.abs(intradayVix.get(z.date)-c.vix)<=c.band);
 const e=estimate(eligible.filter(z=>z.actual).length,eligible.length);
 const out={event:'Chiusura SPX a T+'+c.h+'m almeno 0,25% sotto il cash delle 09:45 ET.',state:curr.gates.every(Boolean)?(e.p==null?'Attivo · campione ridotto':'Attivo'):'Inattivo',known:{asof:new Date(c.cutMs).toISOString(),source:'SPXW 09:45 ET / percorso cash SPX',definition:'IV put25 − call25 in calo dalla seduta precedente. P downside stabile o crescente, stimata solo dai prezzi SPX sulle 60 sedute più vicine per volatilità realizzata nelle cinque sedute precedenti (minimo 75 candidati). Ali con quote bilaterali a 0,40–0,95 σ, spread/mid ≤25%. La banda VIX del frame filtra gli esiti.',gates:curr.gates,veto:false},estimate:{...e,p:curr.gates.every(Boolean)?e.p:null},conditional:e,detail:'Spread put–call '+(100*curr.spread).toFixed(2)+' punti vol · P downside sui 60 analoghi di prezzo '+pct(curr.q)+'.'};
 skewCache.set(key,out);return out;
}
function assess(f,co){
 const physRows=w.QuantistesPhysical?.playbookHistory?.()?.snapshots,tape=w.QuantistesDynamicCore?.state?.days,flow=w.DeskFields?.summary(f?.settings?.cutMs);const marketRev=w.DeskMarkets?.revision?.()||0,mark=w.Desk?.state?.result,stale=w.Desk?.state?.stale,feed=w.QuantistesConfluence?.evidence?.()?.snapshot;const rep=w.InstReports?.peek(f?.settings?.cutMs);if(cache?.rep===rep&&cache?.f===f&&cache?.co===co&&cache.version===version&&cache.physRows===physRows&&cache.tape===tape&&cache.flowRevision===flow?.revision&&cache.marketRev===marketRev&&cache.mark===mark&&cache.stale===stale&&cache.feedClock===feed?.asof&&cache.esMark===feed?.es?.last)return latest;
 indexes();const c=f?.settings;
 latest=specs.map(spec=>{
  const row={...spec,state:spec.outside?'Fuori perimetro':'In attesa',estimate:estimate(0,0),proxy:null,known:null};
  if(!c||spec.outside)return row;
  const pool=observations.filter(r=>r.id===spec.id&&r.h===c.h&&r.minute===c.start&&r.av<=c.cutMs),now=pool.find(r=>r.date===c.before&&Math.abs(r.a-c.cutMs)<60000&&r.a<=c.cutMs&&Math.abs(r.vix-c.vix)<=c.band);
  if(now){row.known={asof:new Date(now.a).toISOString(),source:now.source,definition:now.definition,gates:now.gates,veto:now.veto};
   const hist=pool.filter(r=>r.date<c.before&&r.source===now.source&&r.definition===now.definition&&r.gates.every(g=>g===true)&&!r.veto&&r.success!==null&&r.reported<=c.cutMs&&Math.abs(r.vix-c.vix)<=c.band);
   row.estimate=estimate(hist.filter(r=>r.success).length,hist.length);row.conditional={...row.estimate};row.state=now.veto?'Veto':now.gates.includes(false)?'Inattivo':now.gates.includes(null)?'Dati parziali':row.estimate.p===null?'Attivo · campione ridotto':'Attivo';
   if(row.state!=='Attivo')row.estimate.p=null;
  }
  if(spec.id==='P06'&&!now){const native=skewSignal(c);if(native)Object.assign(row,native);}
  if(proxyNames[spec.id]&&co?.sel){let k=0,n=0;for(const sample of co.sel){const side=proxy(spec.id,sample.date,c.start,c.stop);if(!side)continue;n++;if(targetFirst(sample.values,side,c.target,c.stop))k++;}
   const active=proxy(spec.id,c.before,c.start,c.stop);row.proxy={...estimate(k,n),active:active===null?null:active!==0,title:proxyNames[spec.id]+(['P10','P11','P20','P21'].includes(spec.id)?' · soglia '+c.stop+' tick'+(['P20','P21'].includes(spec.id)?', recupero minimo '+Math.max(1,Math.ceil(c.stop/4))+' tick':''):''),side:['P10','P16','P21'].includes(spec.id)?-1:1};
  }
  if(spec.id==='P22')row.proxy=opening(c,co);
  const key=({P03:'vanna',P04:'charm',P05:'gamma'})[spec.id];
  if(key&&!row.known){const eligible=flow?.metrics?.filter(s=>s.metrics.includes(key)&&s.last&&w.DeskMeasures.recent(Date.parse(s.last),c.cutMs,300))||[];if(eligible.length){row.state='Dati parziali';row.detail='Campo '+key+' coevo: '+eligible.map(s=>s.source+' / '+s.expiry+' / '+s.last).join(' · ')+'. Occorrono anche le restanti condizioni della scheda.';}}
  if(spec.id==='P12'){const risk=volModel(c.before);if(risk)row.detail='RV stimata '+pct(risk.current)+' · leva teorica '+risk.prevWeight.toFixed(2)+'× → '+risk.weight.toFixed(2)+'×. Il target di rischio e il cap sono ipotesi della coorte modello.';}
  if(w.DeskTriage){w.DeskTriage.native(row,c);row.withoutReports=w.DeskTriage.record(row);}
  if(rep&&w.ReportLinks){row.reportContext=w.ReportLinks.context(spec.id,rep);w.ReportLinks.combine(row,w.InstEngine.gates(spec.id,rep));w.DeskTriage?.recover(row,now,pool,c);}
  return row;
 });if(w.DeskTriage)w.DeskTriage.rank(latest);cache={rep,f,co,version,physRows,tape,marketRev,mark,stale,feedClock:feed?.asof,esMark:feed?.es?.last,flowRevision:flow?.revision};return latest;
}
w.addEventListener('desk:book-calibration',()=>{cache=null;});
function status(r){return r.outside?'Richiede dati di esecuzione esclusi.':r.known?r.known.source+' · '+r.known.definition:'Manca l’osservazione congiunta delle condizioni al cutoff.';}
function render(){
 const host=$('playbookDesk');if(!host)return;
 const rows=(w.DeskTriage?.ordered(latest)||latest).filter(r=>!r.outside&&(filter==='all'||filter==='active'&&r.state.startsWith('Attivo')||filter==='proxy'&&r.proxy||filter==='reports'&&['condizione','scenario','conferma'].includes(r.reportImpact?.relation)));
 if(!rows.find(r=>r.id===selected))selected=rows[0]?.id||'';
 const rr=rows.find(r=>r.id===selected);
 $('pbBody').innerHTML=rows.map(r=>'<tr data-pb="'+r.id+'" data-status="'+esc(r.state)+'" aria-selected="'+(r.id===selected)+'"><td><button type="button" data-pb="'+r.id+'">'+r.id+'</button><small class="pb-priority">#'+(r.rank||'—')+'</small></td><th scope="row">'+esc(r.name)+'</th><td>'+esc(r.withReports?.title||r.state)+(r.reportImpact?.relation==='condizione'?'<small class="pb-pdf">PDF · condizione</small>':r.reportImpact?.relation==='scenario'?'<small class="pb-pdf">PDF · scenario</small>':'')+'</td><td class="pb-num">'+pct(r.estimate.p)+'</td><td>'+ (r.estimate.n||'—')+'</td><td class="pb-extra">'+(r.proxy?(pct(r.proxy.p)+'<small class="'+(r.proxy.active?'pb-on':'pb-off')+'">'+(r.proxy.active===true?'presente':r.proxy.active===false?'storico':'cutoff assente')+'</small>'):'—')+'</td></tr>').join('')||'<tr><td colspan="6">Nessuna scheda soddisfa il filtro al cutoff.</td></tr>';
 const p=rr?.proxy,ci=rr?.estimate.ci;
 $('pbDetail').innerHTML=rr?'<small>'+rr.id+' / '+esc(rr.family)+'</small><h3>'+esc(rr.name)+'</h3><p>'+esc(rr.event)+'</p><ul>'+rr.labels.map((g,i)=>'<li><span>'+ (rr.known?['×','✓','·'][rr.known.gates[i]===true?1:rr.known.gates[i]===false?0:2]:'·')+'</span>'+esc(g)+'</li>').join('')+'</ul><p><b>Input</b> · '+esc(rr.inputs)+'</p><p><b>Invalidazione</b> · '+esc(rr.invalidates)+'</p><p>'+esc(status(rr))+'</p>'+(rr.detail?'<p>'+esc(rr.detail)+'</p>':'')+(rr.conditional?.p!=null&&rr.estimate.p===null?'<p>Storico a trigger attivo · '+rr.conditional.k+'/'+rr.conditional.n+' · '+pct(rr.conditional.p)+' · IC 95% '+pct(rr.conditional.ci[0])+'–'+pct(rr.conditional.ci[1])+'.</p>':'')+(rr.known?'<p>'+esc(rr.known.asof)+' · '+(rr.known.veto===null?'Veto da verificare':rr.known.veto?'Veto attivo':'Veto assente')+'</p>':'')+(rr.estimate.p!==null?'<p><b>'+rr.estimate.k+' / '+rr.estimate.n+'</b> esiti registrati · IC Wilson 95% '+pct(ci[0])+'–'+pct(ci[1])+'.</p>':'')+(p?'<div class="pb-proxy"><b>'+esc(p.label||'Proxy di prezzo ES')+' / '+(p.side>0?'long':'short')+'</b><p>'+esc(p.title)+'. Stato al cutoff '+(p.active===null?'sconosciuto':p.active?'presente':'assente')+'.</p><p>'+esc(p.event||'Target prima dello stop su chiusure 1m')+' · '+p.k+'/'+p.n+' sedute comparabili'+(p.p===null?' · minimo 25.':' · '+pct(p.p)+' · IC 95% '+pct(p.ci[0])+'–'+pct(p.ci[1])+'.')+'</p></div>':''):'';
 if(rr&&w.DeskTriage){const div=document.createElement('div');div.innerHTML=w.DeskTriage.detail(rr);$('pbDetail').append(div);}
 if(rr&&(rr.reportEvidence||rr.reportContext?.length)){
  const el=document.createElement('details');el.className='pb-report-sources';
  const signal=rr.reportEvidence?.evidence||[],ctx=rr.reportContext||[];
  const sourceLink=f=>'<button type="button" data-report-doc="'+esc(f.doc)+'" data-report-seg="'+esc(f.seg??'')+'" data-report-fact="'+esc(f.id??'')+'">'+esc(f.provider+' · p. '+(f.page||'—'))+'</button>';
  el.innerHTML='<summary>Report · '+signal.length+' condizioni / '+ctx.length+' letture di contesto</summary>'+
   signal.map(e=>'<p><b>'+esc(rr.labels[e.index])+' · '+(e.nativeConflict?'discordante con il dato operativo':e.conflict?'discordante':e.value?'confermata':'assente')+'</b><br>'+e.readings.map(f=>esc(f.name+' '+f.value)+' '+sourceLink(f)).join(' · ')+'</p>').join('')+
   (ctx.length?'<ul>'+ctx.map(f=>'<li>'+esc([f.name,f.scope,f.term,f.h,f.scenario].filter(Boolean).join(' · '))+' <b>'+esc(f.value)+'</b> '+sourceLink(f)+'</li>').join('')+'</ul>':'');
  $('pbDetail').append(el);
 }
 $('pbScope').textContent=latest.filter(r=>r.state==='Attivo').length+' con P stimabile / '+latest.filter(r=>!r.outside).length+' in perimetro';
}
function update(f,co){const prev=latest;assess(f,co);if(prev!==latest||!$('pbBody')?.children.length)render();}
function mount(el){if($('playbookDesk'))return;const sec=document.createElement('section');sec.id='playbookDesk';sec.innerHTML='<div class="studio-sectionhead"><div><small>SCENARI OPERATIVI</small><h2>Priorità dei playbook</h2></div><span id="pbScope"></span></div><div class="pb-tools"><label>Vista <select id="pbFilter"><option value="all">Tutti i playbook</option><option value="active">Trigger attivo</option><option value="reports">Con effetto dei report</option><option value="proxy">Con proxy di prezzo</option></select></label><span>Priorità a trigger completi e condizioni operative osservate. Una finestra oraria aperta è un prerequisito. A parità di evidenza le schede condividono il rango. P esito riguarda il target della singola scheda.</span></div><div class="pb-grid"><div class="pb-tablewrap"><table><thead><tr><th>ID / priorità</th><th>Playbook</th><th>Stato</th><th>P esito</th><th>Sedute</th><th class="pb-extra">P prezzo / proxy</th></tr></thead><tbody id="pbBody"></tbody></table></div><aside id="pbDetail" aria-live="polite"></aside></div>';
 el.querySelector('.desk-main-grid').after(sec);sec.addEventListener('click',e=>{const source=e.target.closest('[data-report-doc]');if(source){w.InstPanels?.source(source.dataset.reportDoc,Number(source.dataset.reportSeg)||null,Number(source.dataset.reportFact)||null);return;}const row=e.target.closest('[data-pb]');if(row){selected=row.dataset.pb;render();}});$('pbFilter').onchange=e=>{filter=e.target.value;render();};
}
function template(){return {schema:'quantistes.playbooks.v1',guide:'records contiene una riga per origine e playbook. gates segue in ordine il catalogo. null = condizione sconosciuta. success è l’esito dell’evento definito ex ante in definition, mantenuta identica nello storico e al cutoff. Per le origini ancora aperte omettere success, outcome_at e outcome_available_at. Tutti i timestamp includono il fuso. Non inserire più osservazioni per seduta, minuto, orizzonte e scheda.',catalog:specs.filter(s=>!s.outside).map(s=>({id:s.id,event:s.event,gates:s.labels,veto_if:s.invalidates,inputs:s.inputs})),fields:['id','asof','available_at','h','vix','source','definition','gates','veto','success','outcome_at','outcome_available_at'],records:[]};}
function focusBook(id){if(!specs.some(s=>s.id===id))return;w.QuantistesFlatDesk?.go('score','decision');filter='all';if($('pbFilter'))$('pbFilter').value=filter;selected=id;render();const el=$('pbDetail');if(el){el.tabIndex=-1;el.focus?.({preventScroll:true});el.scrollIntoView?.({block:'center'});}}
w.DeskPlaybooks=Object.freeze({focusBook,mount,update,set,parse,assess,volState:volModel,template,specs,snapshot:()=>latest.map(({labels,...r})=>r),estimate,proxy,targetFirst});
})(window);


