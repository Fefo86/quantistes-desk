
(function(w){
'use strict';
const M=w.DeskMeasures, E=w.InstEngine, I=w.ReportIntel, F=Number.isFinite, min=M.minSessions;
const usd=f=>f.currency==='USD',us=f=>['US','SPX','ES'].includes(f.scope);
const configs=[
 ['cta','Posizione CTA USA','segno',f=>f.g==='cta'&&us(f)&&['weight','position'].includes(f.k)&&(!f.term||f.term==='medium')&&(f.k==='weight'||usd(f)),f=>(f.k==='weight'?0:4)+(f.scope==='US'?0:1)+(f.term==='medium'?0:1)],
 ['gamma','Gamma dealer SPX','segno',f=>f.g==='dealer'&&f.k==='gex'&&f.scope==='SPX'&&usd(f),()=>0],
 ['vc','Leva vol control','fascia',f=>f.g==='vc'&&us(f)&&f.k==='leverage'&&(!f.term||/^target 10%$/i.test(f.term)),f=>f.term?0:1],
 ['rp','Leva risk parity','fascia',f=>f.g==='rp'&&['PORT','US','SPX'].includes(f.scope)&&f.k==='leverage',()=>0],
 ['hf','Posizione hedge fund USA','segno',f=>f.g==='hf'&&us(f)&&['net','position'].includes(f.k),f=>f.k==='net'?0:1],
 ['corr','Correlazione implicita USA','fascia',f=>f.g==='disp'&&us(f)&&f.k==='impliedCorr',()=>0],
 ['breadth','Partecipazione azionaria USA','fascia',f=>us(f)&&['above200','advancing'].includes(f.k),f=>f.k==='above200'?0:1],
 ['credit','Spread high yield USA','fascia',f=>us(f)&&f.k==='hyOas',()=>0]
];
const usable=f=>f.enabled&&!f.review&&f.series&&F(f.pub)&&F(f.v)&&!f.scenario&&['published','estimate','chart'].includes(f.mode);
const ny=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/New_York'});
function reporting(family,rows){
 const [id,label,mode,accept,priority]=family,found=rows.filter(f=>usable(f)&&accept(f));
 if(!found.length)return null;
 const best=Math.min(...found.map(priority)),members=found.filter(f=>priority(f)===best);
 const series=[...new Map(members.map(f=>[I.comparable(f),f])).entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 return {id,label,mode,series,report:true,names:[...new Set(series.map(([,f])=>f.provider+' · '+(f.name||w.InstCore.metrics[f.k][0])))],members};
}
function rankBand(f,dates){
 const older=[];
 for(const [day,vintages] of dates){
  if(day>=f.asof)continue;
  let pub=-Infinity,value,disputed=false;
  for(const x of vintages){if(x.pub>=f.pub)continue;if(x.pub>pub){pub=x.pub;value=x.v;disputed=false;}else if(x.pub===pub&&x.v!==value)disputed=true;}
  if(pub>-Infinity&&!disputed)older.push(value);
 }
 if(older.length<min||older.every(x=>x===older[0]))return null;
 const q=older.reduce((n,x)=>n+(x<f.v?1:x===f.v?.5:0),0)/older.length;
 return q<1/3?'bassa':q>2/3?'alta':'media';
}
const code=(v,ord)=>ord==='segno'?(v<0?'negativo':v>0?'positivo':'zero'):v;
let chainCache=null;
function chainSkew(t){
 const time=M.clock(new Date(t).toISOString());if(!time||time.minute!==585)return null;
 const rows=w.QuantistesPhysical?.playbookHistory?.()?.snapshots;if(!rows?.length)return null;
 if(chainCache?.rows!==rows){
  const map=new Map();let prev=null;
  for(const s of rows){
   const spread=F(s.iv25_put)&&F(s.iv25_call)?s.iv25_put-s.iv25_call:null;
   const wings=[-1,1].every(sign=>s.q_sigma_pts>0&&s.quotes?.some(q=>{const dist=sign*(q[0]-s.spot_quote)/s.q_sigma_pts,b=sign<0?q[3]:q[1],a=sign<0?q[4]:q[2];return dist>=.4&&dist<=.95&&b>0&&a>=b&&(a-b)/((a+b)/2)<=.25;}));
   if(prev?.wings&&wings&&spread!=null&&prev.spread!=null){let next=true;
    for(let day=new Date(Date.parse(prev.date+'T12:00Z')+864e5);day.toISOString().slice(0,10)<s.date;day.setUTCDate(day.getUTCDate()+1)){const f=w.DeskCalendar10?.fixing?.(day.toISOString().slice(0,10));if(!f?.verified||f.isSession){next=false;break;}}
    if(next)map.set(s.date,{value:code(spread-prev.spread,'segno'),at:t,detail:'SPXW 09:45 ET · differenza put 25Δ − call 25Δ tra sedute consecutive'});
   }
   prev={date:s.date,spread,wings};
  }
  chainCache={rows,map};
 }
 return chainCache.map.get(time.date)||null;
}
function nativeSpecs(now){
 const out=[];
 const vx=t=>{const s=w.DeskMarkets?.state?.(t);return s?.one&&s?.two&&F(s.slope)?{value:code(s.slope,'segno'),at:t,detail:s.one.contract+' / '+s.two.contract}:null;};
 const native=(id,label,fn)=>{const v=fn(now);if(v)out.push({id,label,read:fn,now:v,names:[v.detail],report:false});};
 native('skew25','Variazione skew SPXW 25Δ',chainSkew);
 native('rv5','RV ES · cinque sedute concluse',t=>{const day=ny.format(t),prev=w.DeskPlaybooks?.volState?.(M.dateKey(day));if(!prev||!F(prev.prior)||!F(prev.current))return null;
  return {value:code(prev.current-prev.prior,'segno'),at:t,detail:'Varianza ES intraday · cinque sedute contro le cinque precedenti con finestra mobile di un giorno'};});
 native('vx','Curva VX M2 − M1',vx);
 const samePrices=t=>w.DeskMarkets?.state?.(t);
 native('vxBasis','Basis VX M1 − VIX',t=>{const st=samePrices(t);return st?.one&&st?.vix&&F(st.basis)?{value:code(st.basis,'segno'),at:t,detail:st.one.contract+' / VIX'}:null;});
 const daily=new Map();
 native('volPair','VIX e VVIX vs close precedente',t=>{const st=samePrices(t);if(!st?.vix||!st?.vvix||Math.abs(st.vix.t-st.vvix.t)>60000)return null;
  const day=ny.format(t);if(!daily.has(day)){let d=day,old=null;for(let n=0;n<10;n++){d=new Date(Date.parse(d+'T12:00Z')-864e5).toISOString().slice(0,10);const fix=w.DeskCalendar10?.fixing?.(d);if(!fix?.verified)break;if(!fix.isSession)continue;old=d;break;}daily.set(day,old);}
  const prior=daily.get(day),cc=prior&&w.DeskMarkets.closes?.(prior,t);if(!cc?.VIX||!cc?.VVIX)return null;
  return {value:code(st.vix.price-cc.VIX.price,'segno')+' / '+code(st.vvix.price-cc.VVIX.price,'segno'),at:t,detail:'VIX / VVIX · chiusure '+prior};
 });
 const books=w.DeskFields?.dealerGamma?.(now)||[],sources=[...new Set(books.map(b=>b.source))].sort();
 if(sources.length)native('dealer','Inventario gamma dealer',t=>{
  const g=w.DeskFields.dealerGamma(t),selected=sources.map(s=>g.find(x=>x.source===s));
  if(selected.some(x=>!x||!F(x.value)))return null;
  const signs=new Set(selected.map(e=>code(e.value,'segno')));return {value:signs.size===1?[...signs][0]:null,at:t,detail:sources.join(' / ')};});
 const tapes=new Map(),tapeAt=t=>{if(!tapes.has(t))tapes.set(t,w.InstTape?.at?.(t)||[]);return tapes.get(t);};
 const cols=[['H003','Delta'],['H004','Gamma'],['H005','Vega'],['H006','Vanna'],['H007','Charm'],['H009','Speed'],['H011','Color']];
 for(const [metric,name] of cols){
  const clients=[...new Set(tapeAt(now).filter(b=>b.basis==='customer'&&F(b.values[metric])).map(b=>b.source))].sort();if(!clients.length)continue;
  native('tape'+metric,name+' cliente firmato · 5 min',t=>{const candidates=tapeAt(t),books=clients.map(source=>candidates.find(b=>b.basis==='customer'&&b.source===source));if(books.some(b=>!b||!F(b.values[metric])))return null;
   const signs=new Set(books.map(b=>code(b.values[metric],'segno')));return {value:signs.size===1?[...signs][0]:null,at:t,detail:clients.join(' / ')+' · '+metric};});
 }
 return out;
}
function shortRisk(r){return r&&{mean:r.mean,lo:r.lo,hi:r.hi};}
function arm(origins,currentKey,settings){
 const base=[0,0],conditional=[0,0],loss=[[],[]],priceLoss=[[],[]],marketLoss=[[],[]],net=[[],[]],traded=[[],[]],seen=new Set();
 let count=0,n=0,flat=0;
 const sideStats=arr=>arr.map(xs=>({n:xs.length,risk:M.riskSummary(xs)}));
 for(const s of origins){
  const identifiers=s.reportKeys||[s.episode];if(s.key==null||identifiers.some(k=>seen.has(k)))continue;
  for(const k of identifiers)seen.add(k);
  const matches=s.key===currentKey,ys=[s.long,s.short];
  if(matches){
   const payoff=[1,-1].map(side=>M.barriers([s],side,settings.target,settings.stop,settings.cost).outcomes[0].net);
   if(n>=min&&count>=min){
    for(let k=0;k<2;k++){const y=ys[k],ours=(conditional[k]/n-y)**2;loss[k].push((base[k]/count-y)**2-ours);priceLoss[k].push((s.reference[k]-y)**2-ours);marketLoss[k].push(((s.marketReference||s.reference)[k]-y)**2-ours);}
    const forecast=M.choice(...sideStats(net));
    if(forecast==='LONG')traded[0].push(payoff[0]);else if(forecast==='SHORT')traded[1].push(payoff[1]);else flat++;
   }
   for(let k=0;k<2;k++){net[k].push(payoff[k]);conditional[k]+=ys[k];}n++;
  }
  for(let k=0;k<2;k++)base[k]+=ys[k];count++;
 }
 const prob=(sum,den)=>den>=min?sum.map(x=>x/den):[null,null],score=loss.map(xs=>M.riskSummary(xs)),wf=loss[0].length;
 const priceGain=priceLoss.map(xs=>M.riskSummary(xs)),marketGain=marketLoss.map(xs=>M.riskSummary(xs));
 const outcome=sideStats(net),oos=sideStats(traded),pref=n>=min?M.choice(...outcome):null,success=wf>=min&&[...score,...priceGain,...marketGain].every(s=>s?.lo>0);
 const picked=pref==='LONG'?0:pref==='SHORT'?1:-1,economic=picked>=0?oos[picked].n>=min&&oos[picked].risk?.lo>0:pref==='NEUTRALE'&&flat>=min;
 return {n,total:count,wf,baseProbability:prob(base,count),probability:prob(conditional,n),gain:score.map(shortRisk),gainVsES:priceGain.map(shortRisk),gainVsMarket:marketGain.map(shortRisk),net:outcome.map(x=>shortRisk(x.risk)),oosNet:oos.map(x=>shortRisk(x.risk)),oosDirectional:traded.map(x=>x.length),oosFlat:flat,preference:pref,validated:!!(success&&economic),reason:n<min?'Meno di '+min+' origini nello stesso stato':wf<min?'Meno di '+min+' pronostici successivi al campione iniziale':!success?'Miglioramento del Brier non dimostrato su entrambi i lati':!economic?'Verifiche o payoff delle scelte fuori campione insufficienti':'Verifica cronologica superata'};
}
function measure(rows,view,c,cohort){
 const native=nativeSpecs(c.cutMs),active=view?.active||[],conflicts=view?.conflicts||[],rc=configs.map(f=>reporting(f,active.concat(conflicts))).filter(Boolean);
 const ind=new Map(),pastDays=new Map(),refDays=new Map(),bandMemo=new Map(),stateMemo=new Map();
 const included=new Set(rc.flatMap(g=>g.series.map(([key])=>key)));
 const push=f=>{if(!usable(f)||!f.asof||!w.InstCore.allowed(f.k,f.v)||!included.has(I.comparable(f))||f.pub>c.cutMs)return;
  if(!refDays.has(f.pub))refDays.set(f.pub,ny.format(f.pub));if(f.asof>refDays.get(f.pub))return;
  const k=I.comparable(f);if(!ind.has(k))ind.set(k,new Map());const m=ind.get(k);if(!m.has(f.asof))m.set(f.asof,[]);m.get(f.asof).push(f);};
 rows.forEach(push);for(const g of rc)for(const [key] of g.series){if(!ind.has(key))ind.set(key,new Map());}
 function dayWindow(t){const day=ny.format(t);if(!pastDays.has(day)){const at=Date.parse(day+'T12:00Z');pastDays.set(day,Array.from({length:9},(_,i)=>new Date(at-i*864e5).toISOString().slice(0,10)));}return pastDays.get(day);}
 function reading(key,t){const mk=key+'|'+t;if(stateMemo.has(mk))return stateMemo.get(mk);const set=ind.get(key),a=[];for(const d of dayWindow(t))if(set.has(d))a.push(...set.get(d));const resolved=E.at(a,t),f=resolved.active[0];stateMemo.set(mk,f);return f;}
 function val(f,g,key){if(g.mode==='segno')return code(f.v,'segno');const id=key+'|'+f.pub+'|'+f.asof+'|'+f.v;
  if(!bandMemo.has(id))bandMemo.set(id,rankBand(f,ind.get(key)));return bandMemo.get(id);}
 function vector(group,t,current=false){
  const ss=[],episodes=[];
  for(const [k,one] of group.series){const f=current?one:reading(k,t);
   if(!f||current&&conflicts.some(x=>I.comparable(x)===k))return null;
   const v=val(f,group,k);if(v==null)return null;ss.push(v);episodes.push(f.asof);}
  if(new Set(ss).size!==1)return null;return {value:ss[0],episode:episodes.join('|')};
 }
 const features=native.map(g=>({id:g.id,label:g.label,state:g.now.value,names:g.names,report:false})).concat(rc.map(g=>({id:g.id,label:g.label,state:vector(g,c.cutMs,true)?.value??null,names:g.names,report:true,refs:g.members.map(f=>({doc:f.doc,seg:f.seg,id:f.id,page:f.page,provider:f.provider}))})));
 const raw=cohort?.sel||[],dates=new Set(),samples=[];
 for(const s of [...raw].sort((a,b)=>a.date-b.date)){if(dates.has(s.date)||s.date>=c.before||!s.values||s.values.length<c.h+1)continue;
  const at=w.QuantCore.nyEpoch(M.dayISO(s.date)+'T'+M.timeET(c.start)+':00');if(!F(at)||at+c.h*60000>c.cutMs)continue;dates.add(s.date);
  const values=s.values.slice(0,c.h+1),nat=native.map(g=>g.read(at)?.value??null),reps=rc.map(g=>vector(g,at));
  samples.push({date:s.date,values,nat,reps,long:+w.DeskPlaybooks.targetFirst(values,1,c.target,c.stop),short:+w.DeskPlaybooks.targetFirst(values,-1,c.target,c.stop)});
 }
 const marketIndex=[],reportIndex=[],current=rc.map(g=>vector(g,c.cutMs,true));
 // Coverage is determined only from dated inputs, before inspecting any ES outcome.
 for(const [i,g] of native.entries()){
  const f=features[i];f.coverage=samples.filter(s=>s.nat[i]!=null).length;
  f.used=f.state!=null&&f.coverage>=min;if(f.used)marketIndex.push(i);
 }
 for(const [i,g] of rc.entries()){
  const f=features[native.length+i],before=new Set(samples.map(s=>s.reps[i]?.episode).filter(x=>x!=null&&x!==current[i]?.episode));
  f.coverage=before.size;f.used=f.state!=null&&f.coverage>=min;if(f.used)reportIndex.push(i);
 }
 const key=vals=>vals.some(x=>x==null)?null:JSON.stringify(vals),nat=s=>marketIndex.map(i=>s.nat[i]);
 const marketKey=key(marketIndex.map(i=>native[i].now.value)),rKey=key([...marketIndex.map(i=>native[i].now.value),...reportIndex.map(i=>current[i].value)]);
 const empty=reason=>({n:0,total:0,wf:0,validated:false,reason});
 const totals=[0,0,0],marketTotals=new Map();
 for(const s of samples){
  const k=key(nat(s)),state=marketTotals.get(k)||[0,0,0],prob=sums=>sums[2]?[sums[0]/sums[2],sums[1]/sums[2]]:[null,null];
  s.reference=prob(totals);s.marketReference=state[2]>=min?prob(state):s.reference;
  for(const sum of [totals,state]){sum[0]+=s.long;sum[1]+=s.short;sum[2]++;}marketTotals.set(k,state);
 }
 const noPDF=marketIndex.length?arm(samples.map(s=>({...s,marketReference:null,key:key(nat(s)),episode:s.date})),marketKey,c):native.length?empty('Copertura di mercato insufficiente o fonti discordanti'):null;
 let full=null;
 if(reportIndex.length){
  const keys=readings=>reportIndex.flatMap(i=>readings[i]?readings[i].episode.split('|').map((day,j)=>rc[i].series[j][0]+'@'+day):[]);
  const activeKeys=new Set(keys(current)),paired=[];
  for(const s of samples){const obs=keys(s.reps);if(key(nat(s))!==marketKey||obs.some(x=>activeKeys.has(x)))continue;
   paired.push({...s,reportKeys:obs,key:key([...nat(s),...reportIndex.map(i=>s.reps[i]?.value??null)])});}
  full=arm(paired,rKey,c);
 }else if(rc.length){full=empty('Edizioni comparabili insufficienti, stato indeterminato o fonti discordanti');}
 return {features,market:noPDF,combined:full};
}
let memo=null;
function peek(frame,co){
 const c=frame?.settings;if(!frame?.ready||!c||!co?.sel)return null;
 const ver=[w.InstReports?.version?.()||0,w.DeskMarkets?.revision?.()||0,w.DeskFields?.summary?.(c.cutMs)?.revision||0,w.InstTape?.revision?.()||0].join('/');
 const view=w.InstReports?.peek?.(c.cutMs);if(!view)return null;
 const phys=w.QuantistesPhysical?.playbookHistory?.()?.snapshots,marketRows=w.Quantistes360?.data?.()?.rows;
 if(memo?.frame===frame&&memo.co===co&&memo.ver===ver&&memo.view===view&&memo.phys===phys&&memo.marketRows===marketRows)return memo.result;
 const pack={frame,co,ver,view,phys,marketRows,result:null};memo=pack;
 if(!co.sel.length)return null;
 const needReport=view.active.length||view.conflicts.length;
 if(!needReport&&!nativeSpecs(c.cutMs).length){pack.result={features:[],market:null,combined:null};return pack.result;}
 const inputs=!needReport?Promise.resolve([]):w.InstReports.chartReadings?w.InstReports.chartReadings():w.InstReports.range('0001-01-01',new Date(c.cutMs+864e5).toISOString().slice(0,10));
 inputs.then(rows=>{if(memo!==pack)return;pack.result=measure(rows,view,c,co);w.InstitutionalDesk?.refreshPlaybooks?.();}).catch(()=>{if(memo===pack){pack.result={features:[],market:null,combined:null,error:'Archivio delle edizioni non disponibile'};w.InstitutionalDesk?.refreshPlaybooks?.();}});return null;
}
function decide(base,result){
 const without=result?.market?.validated?result.market.preference:base,withReports=result?.combined?.validated?result.combined.preference:without;
 return {base,withoutReports:without,signal:withReports,applied:!!result?.combined?.validated,filter:withReports!==without?'Le letture dei report modificano il segnale ES.':null,model:result||null};
}
w.DeskFusion={measure,peek,decide};
})(window);

