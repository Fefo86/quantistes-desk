
(function (w) {
'use strict';
const finite=Number.isFinite, greeks=['delta','gamma','charm','vanna'], M=60000;
const fmt=new Intl.NumberFormat('it-IT',{maximumFractionDigits:2});
const et=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const day=t=>et.format(t),number=x=>finite(x)?x:null,positive=x=>finite(x)&&x>0;
const sign=(x,eps=0)=>!finite(x)?null:Math.abs(x)<=eps?0:Math.sign(x);
const absent=()=>({ok:false,reason:'Nessuno snapshot disponibile a questa ora.',asof:null,rows:[],chart:[],targets:{gamma:[],delta:[],charm:[],vanna:[]},inflections:[],stats:{n:0,complete:0},notes:[]});
const text={
 A1:['Recupero del supporto','Superamento della resistenza'],
 A2:['Perdita del supporto','Reiezione della resistenza'],
 A3:['Recupero tattico','Secondo test con vendite o accettazione sopra'],
 A4:['Cedimento o recupero da valutare','Reiezione tattica'],
 A5:['Recupero con acquisti sul future','Breakout con volumi'],
 A6:['Breakdown e retest','Reiezione della resistenza'],
 A7:['Recupero tattico o breakdown','Breakout tattico'],
 A8:['Breakdown o recupero con flusso','Breakout con volumi o falsa rottura'],
 B1:['Recupero deciso','Breakout e retest'],
 B2:['Breakdown e retest','Reiezione della resistenza'],
 B3:['Recupero o breakdown','Breakout o falsa rottura'],
 B4:['Breakdown e retest','Reiezione o breakout con flusso'],
 B5:['Recupero del supporto','Breakout con volumi'],
 B6:['Breakdown e retest','Reiezione della resistenza'],
 B7:['Recupero tattico o breakdown','Secondo test con volumi e flussi'],
 B8:['Breakdown o recupero con flusso','Secondo test con volumi e flussi']
};
// R = hold/reclaim on the approach side, B = break followed by a retest.
// Alternatives requiring volume/aggressive trades stay conditional in this option-flow workspace.
const recipes={
 A1:['R','B'],A2:['B','R'],A3:['R','?'],A4:['?','R'],
 A5:['V','V'],A6:['B','R'],A7:['?','B'],A8:['B','?'],
 B1:['R','B'],B2:['B','R'],B3:['?','?'],B4:['B','R'],
 B5:['R','V'],B6:['B','R'],B7:['?','?'],B8:['B','?']
};
function identify(regime,local,dp,cp,thresholds={}){
 const [g,k,d,c]=[regime,local,dp,cp].map((v,i)=>sign(v,Math.max(0,number(thresholds[['globalGamma','gamma','dp','cp'][i]])||0)));
 if(!g||!k||!d||!c)return null;
 const pair=d>0?(c>0?1:3):(c<0?2:4);
 return (g>0?'A':'B')+(pair+(g===k?0:4));
}
// A provider can differentiate delta against time remaining. Its normalized charm
// factor then has the opposite sign, since one minute elapsed reduces time remaining.
const validFactor=(k,v)=>finite(v)&&(k==='charm'?v!==0:v>0);
const scale=(f,r,k)=>finite(r[k])&&validFactor(k,f.factors?.[k])?r[k]*f.factors[k]:null;
const sum=a=>a.length&&a.every(finite)?a.reduce((s,x)=>s+x,0):null;
const distinct=r=>Array.isArray(r)&&r.length&&r.every(v=>v&&positive(v.strike))&&new Set(r.map(v=>v.strike)).size===r.length;
const gammaName=x=>x===null?'Regime n.d.':x>0?'Gamma lunga':x<0?'Gamma corta':'Gamma neutra';
function sameScope(f,t){
 const sameMeta=['kind','perspective','source','expiry','lastTradeAt','pmSettled','optionClass','coverage','modelPeriod','timeframe','comparableId','windowMinutes','gammaSign','charmClock','pressureBasis','convention'].every(k=>f[k]===t[k]);
 return sameMeta&&greeks.every(k=>{
  if(f.units?.[k]!==t.units?.[k])return false;
  const a=f.factors?.[k],b=t.factors?.[k];
  if(a==null&&b==null)return true;
  if(!validFactor(k,a)||!validFactor(k,b)||Math.sign(a)!==Math.sign(b))return false;
  return a===b||/^USD/i.test(f.units?.[k]||'');
 });
}
function normalizeTimes(frames,cutoff){
 const set=new Map();
 for(const f of frames||[]){
  if(!finite(f?.ts)||!finite(f.availableAt)||f.ts>cutoff||f.availableAt>cutoff||f.availableAt<f.ts)continue;
  const old=set.get(f.ts);
  if(!old||old.availableAt<f.availableAt)set.set(f.ts,{availableAt:f.availableAt,frame:f});
  else if(old.availableAt===f.availableAt&&old.frame!==f)set.set(f.ts,{availableAt:f.availableAt,frame:null});
 }
 return [...set.entries()].sort((a,b)=>a[0]-b[0]);
}
function globalGamma(f){
 if(f.perspective!=='dealer'||!distinct(f.rows))return null;
 if(f.regimeVerified===true&&finite(f.globalGamma))return f.globalGamma;
 if(f.expiry==='ALL'&&f.kind==='inventory'&&f.coverage==='full_book'&&f.gammaSign==='dealer_long_positive')return sum(f.rows.map(r=>scale(f,r,'gamma')));
 return null;
}
function sensitivities(f,r,opts){
 const dealer=f.perspective==='dealer',kind=f.kind;
 const mapped=dealer&&['inventory','signed_flow'].includes(kind),inv=dealer&&kind==='inventory';
 const local=dealer&&finite(r.inventoryGamma)?r.inventoryGamma:inv&&f.gammaSign==='dealer_long_positive'?scale(f,r,'gamma'):null;
 const delta=mapped?scale(f,r,'delta'):null;
 const factor=(k,move)=>{
  const sensitivity=k==='gamma'?(inv?local:f.gammaSign==='dealer_long_positive'?scale(f,r,k):null):scale(f,r,k);
  return move===0?0:mapped&&finite(sensitivity)?-sensitivity*move:null;
 };
 const contributions={delta:kind==='signed_flow'&&finite(delta)?-delta:null,gamma:factor('gamma',opts.ds),vanna:factor('vanna',opts.div),charm:factor('charm',opts.dt)};
 const net=mapped?sum([contributions.gamma,contributions.vanna,contributions.charm]):null;
 // DP is total modeled hedge pressure. Its time component CP is already included.
 const hasDP=dealer&&finite(r.dp),hasCP=dealer&&finite(r.cp);
 const dp=hasDP?r.dp:hasCP?null:inv?net:null;
 const cp=hasCP?r.cp:hasDP?null:inv?contributions.charm:null;
 const provided=dealer&&finite(r.dp)&&finite(r.cp),caseBasis=provided?(f.pressureBasis==='modeled'?'Pressioni fornite · modello':'Pressioni fornite'):finite(dp)&&finite(cp)?'Pressioni di scenario':'Parziale';
 return {local,dp,cp,net,caseBasis,provided,contributions,stockHedge:inv&&finite(delta)?-delta:null,tradeHedge:contributions.delta};
}
function plan(id,side,spot){
 const sup=side==='Supporto',res=side==='Resistenza';
 if(!id||(!sup&&!res))return {pattern:!id?'Quadro incompleto':'Test ATM da orientare',trigger:!finite(spot)?'Serve un prezzo SPX sincronizzato.':'Servono regime, gamma locale e pressioni firmate sul test.',invalidation:'Riclassificare alla prossima osservazione.',recipe:'?',direction:null};
 const ix=sup?0:1,recipe=recipes[id][ix],dest=recipe==='R'?(sup?'LONG':'SHORT'):recipe==='B'?(sup?'SHORT':'LONG'):null;
 const pattern=text[id][ix];
 const triggered=dest==='LONG'?'Chiusura sopra la fascia e retest tenuto.':'Chiusura sotto la fascia e retest respinto.';
 const trigger=recipe==='V'?'Conferma di prezzo e volume o acquisti sul future richiesti.':recipe==='?'?'Attendere secondo test e flusso coerente con il lato di uscita.':recipe==='R'?(sup?'Test del supporto, recupero e nuova tenuta sopra.':'Test della resistenza, rifiuto e nuova tenuta sotto.'):triggered;
 const invalidation=dest==='LONG'?'Chiusura sotto il minimo del retest o inversione del flusso.':dest==='SHORT'?'Chiusura sopra il massimo del retest o inversione del flusso.':'Pressioni discordanti, salto del livello o test senza tenuta.';
 return {pattern,trigger,invalidation,recipe,direction:dest};
}
function barOf(f,cutoff){
 const b=f.bar;if(!b||![b.start,b.end,b.open,b.high,b.low,b.close].every(finite)||b.start>=b.end||b.end>cutoff||b.end>f.ts||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))return null;
 return b;
}
function currentTest(frames,cutoff,band){
 // The candidate must have been available before the first test bar opened.
 if(frames.length<3)return null;
 const [a,b,c]=frames.slice(-3),last=barOf(c,cutoff),touch=barOf(b,cutoff),prior=barOf(a,cutoff);
 if(!last||!touch||!prior||a.availableAt>touch.start||b.availableAt>last.start||prior.end!==touch.start||touch.end!==last.start||last.end!==c.ts||!sameScope(a,b)||!sameScope(b,c))return null;
 if(last.end-last.start!==touch.end-touch.start||day(prior.start)!==day(last.end))return null;
 return {a,b,c,last,touch,prior,band};
}
function priceTest(test,k){
 if(!test)return null;
 const {prior,touch,last,band}=test,lo=k-band,hi=k+band;
 const flank=p=>p>hi?1:p<lo?-1:0,origin=flank(prior.close),closed=flank(touch.close);
 if(!origin||!closed||flank(touch.open)===-origin||touch.low>hi||touch.high<lo)return null;
 if(flank(last.open)===-closed||flank(last.close)!==closed||last.low>hi||last.high<lo)return null;
 if(closed>0&&last.low<lo||closed<0&&last.high>hi)return null;
 return {side:origin>0?'Supporto':'Resistenza',recipe:origin===closed?'R':'B',direction:closed>0?'LONG':'SHORT',stopReference:closed>0?last.low:last.high};
}
function sideFor(spot,k,band){
 if(!positive(spot))return 'Spot n.d.';
 return spot>k+band?'Supporto':spot<k-band?'Resistenza':'ATM';
}
function histories(frames){
 const map=new Map();
 for(const [index,f] of frames.entries())for(const r of f.rows){
  if(!map.has(r.strike))map.set(r.strike,[]);
  map.get(r.strike).push({ts:f.ts,availableAt:f.availableAt,spot:number(f.spot),index,delta:number(r.delta),gamma:number(r.gamma),charm:number(r.charm),vanna:number(r.vanna)});
 }
 return map;
}
function slope(series,period,metric,cadence){
 const last=series.at(-1);if(!last||!finite(last[metric]))return null;
 const start=last.ts-period*M;let i=series.length-1;
 while(i>=0&&series[i].ts>start)i--;
 if(i<0)return null;
 // No interpolation through missing slices, sparse anchors, missing strikes, or different sessions.
 for(let j=i;j<series.length-1;j++){
  if(series[j+1].index!==series[j].index+1||series[j+1].ts-series[j].ts>cadence*1.5*M||!finite(series[j][metric])||!finite(series[j+1][metric]))return null;
 }
 const a=series[i],b=series[i+1];if(a.ts!==start&&(!b||b.ts>=last.ts))return null;
 const origin=a.ts===start?a[metric]:a[metric]+(b[metric]-a[metric])*(start-a.ts)/(b.ts-a.ts);
 return (last[metric]-origin)/period;
}
function chooseFrames(series,last){
 // Newer edits are admissible in the current display. Prior trigger tests use only observations
 // that were available at each test, and require identical contracts, units and perspective.
 const session=day(last.ts),out=[];
 for(const item of series){const f=item[1].frame;if(!f||!sameScope(f,last)||day(f.ts)!==session||!distinct(f.rows)){out.length=0;continue;}out.push(f);}
 return out;
}
const fmtHedge=x=>!finite(x)?'n.d.':Math.abs(x)<1e-8?'0 ES eq':(x>0?'Acquisto ':'Vendita ')+fmt.format(Math.abs(x))+' ES eq';
function detailHedge(f,z){
 if(f.perspective!=='dealer')return 'Prospettiva MM da identificare';
 if(f.kind==='signed_flow')return finite(z.tradeHedge)?fmtHedge(z.tradeHedge)+' · nuovi contratti':'Hedge del nuovo flusso n.d.';
 if(f.kind==='inventory')return finite(z.net)?fmtHedge(z.net)+' · shock impostato':'Sensibilità incomplete';
 return 'Campo provider · unità o natura da identificare';
}
function summarizeTargets(rows,k){return rows.filter(r=>finite(r[k])&&r[k]!==0).sort((a,b)=>Math.abs(b[k])-Math.abs(a[k])||a.strike-b.strike).slice(0,3).map(r=>({strike:r.strike,value:r[k]}));}
function anatomy(rows,current){
 const table=rows.slice().sort((a,b)=>a.strike-b.strike),flips=[];
 let prev=null;
 for(const r of table){
  const loc=r.localGamma;
  if(!finite(loc)){prev=null;continue;}if(loc===0){if(prev)prev.zeros.push(r.strike);continue;}
  if(prev&&Math.sign(prev.value)!==Math.sign(loc))flips.push({lo:prev.strike,hi:r.strike,zeros:prev.zeros,label:'Cambio di segno fra strike'});
  prev={strike:r.strike,value:loc,zeros:[]};
 }
 for(const k of greeks){
  const abs=table.map(r=>Math.abs(r[k]??0)).filter(x=>x>0).sort((a,b)=>a-b),q=abs[Math.max(0,Math.ceil(.9*abs.length)-1)]||1;
  for(const r of table)r.intensity[k]=!finite(r[k])?null:Math.max(-1,Math.min(1,r[k]/q));
 }
 const targets=Object.fromEntries(greeks.map(k=>[k,summarizeTargets(rows,k)]));
 for(const r of table){
  if(!r.direction||!positive(current.spot))continue;
  const reference=r.direction==='LONG'?Math.max(current.spot,r.strike):Math.min(current.spot,r.strike);
  const levels=targets.gamma.map(p=>p.strike).filter(k=>r.direction==='LONG'?k>reference:k<reference);
  r.target=levels.length?(r.direction==='LONG'?Math.min(...levels):Math.max(...levels)):null;
 }
 return {targets,inflections:flips};
}
// Time-weighted prior-hour profile. A last-observation hold uses the values available
// at each interval start. A late revision, missing strike or sampling gap breaks coverage.
function hourCharm(series,cadence){
 const last=series.at(-1),start=last?.ts-60*M;if(!last)return null;
 let accum=0,span=0;
 for(let i=series.length-1;i>=1;i--){
  const b=series[i],a=series[i-1];if(b.ts<=start)break;
  if(!finite(a.charm)||a.availableAt>Math.max(start,a.ts)||b.index!==a.index+1||b.ts-a.ts>1.5*cadence*M)return null;
  const time=b.ts-Math.max(a.ts,start);accum+=time*a.charm;span+=time;
 }
 return span===60*M?accum/span:null;
}
const period=p=>p.modelPeriod||p.timeframe;
function modelConvergence(pack,frame,cutoff,companions,maxAge){
 const empty=reason=>({ready:false,reason,label:reason,aligned:null,daily:[],intraday:[],distance:null});
 const a=period(pack);if(!['daily','intraday'].includes(a)||!pack.comparableId)return empty('Confronto daily / intraday in attesa di due modelli confrontabili.');
 const b=a==='daily'?'intraday':'daily';
 const compatible=(companions||[]).filter(p=>p.id!==pack.id&&period(p)===b&&p.mode===pack.mode&&p.source===pack.source&&p.comparableId===pack.comparableId&&p.kind===pack.kind&&p.perspective===pack.perspective&&p.coverage===pack.coverage&&p.expiry===pack.expiry&&['optionClass','lastTradeAt','pmSettled'].every(k=>(p[k]??null)===(pack[k]??null)));
 if(compatible.length!==1)return empty(compatible.length?'Più modelli omologhi disponibili: abbinamento ambiguo.':'Manca il modello '+b+' della stessa fonte e famiglia.');
 const other=normalizeTimes(compatible[0].frames,cutoff).at(-1)?.[1].frame;
 if(!other||!distinct(other.rows)||other.perspective!=='dealer'||day(frame.ts)!==day(other.ts))return empty('Snapshot omologhi della stessa seduta richiesti.');
 // Both clocks must represent the same cut, unless an explicit validity interval covers it.
 const coherent=x=>x.ts===Math.max(frame.ts,other.ts)||finite(x.validUntil)&&x.validUntil>=Math.max(frame.ts,other.ts)&&x.validUntil>=cutoff;
 if(!coherent(frame)||!coherent(other)||cutoff-frame.ts>maxAge*M||cutoff-other.ts>maxAge*M&&!(finite(other.validUntil)&&other.validUntil>=cutoff))return empty('Orari o validità dei due modelli non allineati.');
 const keys=new Set(frame.rows.map(r=>r.strike));if(keys.size!==other.rows.length||!other.rows.every(r=>keys.has(r.strike)))return empty('Griglie di strike differenti nei due modelli.');
 const levels=f=>{if(!f.rows.every(r=>finite(scale(f,r,'charm'))))return [];return summarizeTargets(f.rows.map(r=>({strike:r.strike,charm:scale(f,r,'charm')})),'charm');};
 const one=levels(frame),two=levels(other),daily=a==='daily'?one:two,intraday=a==='intraday'?one:two;
 if(!daily.length||!intraday.length)return empty('Charm zero, parziale o unità incompatibili.');
 // A tie in |charm| has no unique primary. Report all top concentrations instead.
 const tie=levels=>levels.length>1&&Math.abs(levels[0].value)===Math.abs(levels[1].value);
 if(tie(daily)||tie(intraday))return {...empty('Picco primario a pari intensità.'),daily,intraday};
 const distance=Math.abs(daily[0].strike-intraday[0].strike),aligned=distance===0&&Math.sign(daily[0].value)===Math.sign(intraday[0].value);
 const label=aligned?'Concentrazioni concordi a '+fmt.format(daily[0].strike):distance?'Picchi distinti · '+fmt.format(distance)+' pt SPX':'Stesso strike, segni opposti';
 return {ready:true,reason:'',aligned,daily,intraday,distance,label};
}
const unknownClose='Orario di fine negoziazione richiesto per la scadenza';
function tradingHorizon(pack,frame,cutoff,ageLimit,sessionClose){
 const expiry=frame.expiry??pack.expiry,dated=typeof expiry==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(expiry);
 if(!dated)return {freshThrough:ageLimit,ended:false,unknown:false,end:null};
 const date=day(cutoff),declared=frame.lastTradeAt??pack.lastTradeAt,pm=(frame.pmSettled??pack.pmSettled)===true;
 let end=finite(declared)?declared:null;
 if(end===null&&pm){
  if(expiry===day(frame.ts))end=sessionClose;
  else{const fixing=w.DeskCalendar10?.fixing?.(expiry);if(fixing?.verified&&fixing.isSession&&finite(fixing.epochMs))end=fixing.epochMs;}
 }
 const ended=date>expiry||(finite(end)&&cutoff>=end),unknown=date===expiry&&end===null;
 let freshThrough=finite(end)?Math.min(ageLimit,end-1):ageLimit;
 // An overnight 1DTE snapshot can remain fresh across New York midnight.
 // Wake the live view when a missing due-day clock starts blocking confirmations.
 if(end===null&&date<expiry&&day(ageLimit)>=expiry){
  let lo=Math.floor(cutoff),hi=Math.ceil(ageLimit);
  while(hi-lo>1){const mid=Math.floor(lo+(hi-lo)/2);if(day(mid)<expiry)lo=mid;else hi=mid;}
  freshThrough=lo;
 }
 return {freshThrough,ended,unknown,end};
}
function analyze(pack,user={}){
 const cutoff=finite(user.cutoff)?user.cutoff:Date.now(),obs=normalizeTimes(pack?.frames,cutoff);
 const last=obs.at(-1)?.[1].frame;
 if(!last||!distinct(last.rows))return {...absent(),reason:obs.length?'Strike duplicati, snapshot discordanti o perimetro vuoto.':'Nessuno snapshot disponibile a questa ora.'};
 const cadence=positive(pack.intervalMinutes)?pack.intervalMinutes:positive(last.intervalMinutes)?last.intervalMinutes:1;
 const maxAge=positive(user.maxAgeMinutes)?user.maxAgeMinutes:positive(pack.maxAgeMinutes)?pack.maxAgeMinutes:Math.max(10,cadence*1.5);
 const opts={ds:user.ds===undefined?1:number(user.ds),dt:user.dt===undefined?1:number(user.dt),div:user.div===undefined?0:number(user.div)};
 if(!Object.values(opts).every(finite)||opts.dt<0)return {...absent(),reason:'Verifica shock spot, IV e minuti di calendario.'};
 const band=positive(user.band)?user.band:.5,stale=cutoff-last.ts>maxAge*M;
 const scope=chooseFrames(obs,last),history=histories(scope),test=currentTest(scope,cutoff,band);
 const spot=positive(last.spot)?last.spot:null,esSpot=positive(last.esSpot)?last.esSpot:null;
 const basis=spot!==null&&esSpot!==null?esSpot-spot:null,aggregate=globalGamma(last),thresholds=last.thresholds||{},regime=gammaName(sign(aggregate,thresholds.globalGamma));
 const gross=last.regimeVerified===true&&finite(aggregate)&&positive(last.globalGrossGamma)&&Math.abs(aggregate)<=last.globalGrossGamma?last.globalGrossGamma:null;
 const gammaBalancePct=gross===null?null:100*aggregate/gross;
 const fix=w.DeskCalendar10?.fixing?.(day(last.ts)),close=fix?.verified&&fix.isSession&&finite(fix.epochMs)?fix.epochMs:null;
 const {freshThrough,ended:expired,unknown:clockMissing,end}=tradingHorizon(pack,last,cutoff,last.ts+maxAge*M,close);
 const projectionEnd=finite(end)&&finite(close)?Math.min(end,close):end??close;
 const blockedReason=expired?'Scadenza terminata':clockMissing?unknownClose:stale?'Snapshot scaduto':!positive(spot)?'Prezzo non disponibile':'';
 const blocked=!!blockedReason,rows=[];
 const aRows=test?new Map(test.a.rows.map(r=>[r.strike,r])):null,bRows=test?new Map(test.b.rows.map(r=>[r.strike,r])):null;
 const ga=test?globalGamma(test.a):null,gb=test?globalGamma(test.b):null;
 for(const r of last.rows){
  const k=r.strike,z=sensitivities(last,r,opts),id=identify(aggregate,z.local,z.dp,z.cp,thresholds),track=history.get(k)||[];
  const reading=priceTest(test,k),arrival=reading?.side||sideFor(spot,k,band),p=plan(id,arrival,spot);
  let status=blocked||last.perspective!=='dealer'?'sospeso':id?'osservazione':'attesa';
  const match=(f,row,g)=>{if(!row)return false;const prev=sensitivities(f,row,opts);return prev.provided&&identify(g,prev.local,prev.dp,prev.cp,f.thresholds)===id;};
  if(!blocked&&reading&&id&&z.provided&&reading.recipe===p.recipe&&reading.direction===p.direction&&match(test.a,aRows.get(k),ga)&&match(test.b,bRows.get(k),gb))status='confermato';
  const m15=slope(track,15,'charm',cadence),m30=slope(track,30,'charm',cadence),gv=slope(track,15,'gamma',cadence);
  const projection=[];
  for(const minutes of [15,30,45,60]){
   if(blocked||finite(projectionEnd)&&last.ts+minutes*M>projectionEnd)continue;
   if(!finite(gv)&&!finite(m15))continue;
   projection.push({minutes,gamma:finite(gv)?r.gamma+gv*minutes:null,charm:finite(m15)?r.charm+m15*minutes:null});
  }
  const quality=blockedReason||(last.perspective!=='dealer'?'Prospettiva MM assente':id?z.caseBasis:aggregate===null?'Gamma globale non identificata':z.local===null?'Inventario gamma locale assente':!finite(z.dp)||!finite(z.cp)?'Pressioni incomplete':'Componente neutra');
  rows.push({...Object.fromEntries(greeks.map(g=>[g,number(r[g])])),strike:k,esStrike:basis===null?null:k+basis,caseId:id,caseBasis:z.caseBasis,regime,hedge:detailHedge(last,z),pattern:p.pattern,trigger:p.trigger,invalidation:p.invalidation,status,direction:blocked?null:p.direction,side:arrival,dp:z.dp,cp:z.cp,net:z.net,localGamma:z.local,gammaPerTick:finite(z.local)?-.25*z.local:null,stockHedge:z.stockHedge,tradeHedge:z.tradeHedge,quality,scenario:'ΔS '+fmt.format(opts.ds)+' pt · ΔIV '+fmt.format(opts.div)+' pt vol · Δt '+fmt.format(opts.dt)+' min',contributions:z.contributions,history:track,momentum:{m15,m30},projection,target:null,stopReference:status==='confermato'?reading.stopReference:null,intensity:{}});
 }
 const anatomyData=anatomy(rows,last),chart=scope.filter(f=>positive(f.spot)).map(f=>({ts:f.ts,spot:f.spot,esSpot:positive(f.esSpot)?f.esSpot:null}));
 const charmHour=summarizeTargets(rows.map(r=>({strike:r.strike,charm:hourCharm(r.history,cadence)})),'charm');
 const convergence=modelConvergence(pack,last,cutoff,user.companions,maxAge);
 const stats={n:rows.length,complete:rows.filter(r=>greeks.every(k=>finite(r[k]))).length,cases:rows.filter(r=>r.caseId).length,confirmed:rows.filter(r=>r.status==='confermato').length};
 const totals=Object.fromEntries(greeks.map(k=>[k,sum(rows.map(r=>r[k]))]));
 const notes=[];
 if(stale)notes.push('Snapshot oltre la finestra di validità di '+maxAge+' min.');
 if(expired)notes.push('Scadenza già terminata al cutoff.');
 if(clockMissing)notes.push(unknownClose+'.');
 if(aggregate===null)notes.push('Il regime richiede gamma di inventario aggregata con perimetro verificato.');
 if(last.kind==='signed_flow')notes.push('La copertura iniziale dei nuovi contratti vale −Δ del flusso dealer. Lo shock misura il successivo ribilanciamento della coorte.');
 if(last.kind==='inventory')notes.push('La copertura di stock vale −Δ. Lo shock mostra il ribilanciamento incrementale assumendo neutralità iniziale.');
 if(basis===null)notes.push('Basis ES/SPX in attesa di prezzi sincronizzati.');
 return {ok:true,reason:blockedReason,sourceMode:pack.mode,observed:pack.mode==='observed',stale:!!(stale||expired),clockMissing,asof:last.ts,availableAt:last.availableAt,freshThrough,spot,esSpot,basis,globalGamma:aggregate,globalGrossGamma:gross,gammaBalancePct,regime,rows,targets:anatomyData.targets,inflections:anatomyData.inflections,charmHour,convergence,chart,phase:expired?'Scadenza terminata':clockMissing?'Conferme sospese':stale?'Snapshot storico':stats.confirmed?'Retest osservato':stats.cases?'Scenari al livello':'Copertura parziale',totals,stats,notes,units:{...last.units},band,shocks:opts};
}
w.ScalpEngine=Object.freeze({analyze,caseId:identify});
})(window);

