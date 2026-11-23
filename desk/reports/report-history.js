

(function(w){
'use strict';
let memo=null;
const signed=f=>f.g==='cta'&&['weight','position'].includes(f.k)||f.g==='dealer'&&f.k==='gex'||f.g==='hf'&&['net','position'].includes(f.k)||f.g==='disp'&&f.k==='dispPosition'||f.g==='letf'&&f.k==='cashflow'&&f.h==='1D';
const levels=new Set(['leverage','rv5','forecastVol','targetLev','cashAllocation','betaHeadroom','captureGap','impliedCorr','realizedCorr','advancing','above200','putCall','buybackBlackout','hyOas','igOas','closeShare','etfSensitivity']);
const covered=f=>['US','SPX','ES'].includes(f.scope)&&['published','estimate','chart'].includes(f.mode)&&!f.scenario&&Number.isFinite(f.v)
 &&(signed(f)||levels.has(f.k)||f.k==='custom'&&f.name&&f.unit);
const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function historicalBand(reference,byDay){
 const values=[];
 for(const [day,rows] of byDay){if(day>=reference.asof)continue;
  let current=null,conflict=false;
  for(const row of rows){if(row.pub>=reference.pub)continue;
   if(!current||row.pub>current.pub){current=row;conflict=false;}
   else if(row.pub===current.pub&&row.v!==current.v)conflict=true;
  }
  if(current&&!conflict)values.push(current.v);
 }
 if(values.length<25||values.every(x=>x===values[0]))return null;
 let rank=0;for(const x of values)rank+=x<reference.v?1:x===reference.v?.5:0;
 const pct=rank/values.length;return pct<1/3?'bassa':pct>2/3?'alta':'intermedia';
}
function measure(rows,now,settings,cohort){
 const M=w.DeskMeasures,E=w.InstEngine,pb=w.DeskPlaybooks,eligible=now.active.filter(covered),out=[];
 const origin=t=>w.QuantCore.nyEpoch(M.dayISO(t)+'T'+M.timeET(settings.start)+':00');
 const origins=[...cohort.sel].filter(s=>s.values?.length>=settings.h+1&&s.date<settings.before).sort((a,b)=>a.date-b.date);
 const pool=new Map();for(const f of rows.filter(covered)){const k=w.ReportIntel.comparable(f);if(!pool.has(k))pool.set(k,[]);pool.get(k).push(f);}
 const seen=new Set();for(const cur of eligible){
  const key=w.ReportIntel.comparable(cur);if(seen.has(key)||!cur.series)continue;seen.add(key);const candidates=pool.get(key)||[],byDay=new Map();
  for(const r of candidates){if(!r.asof||r.asof>=cur.asof||!r.enabled||r.review||!Number.isFinite(r.pub)||r.asof>ny.format(r.pub)||!w.InstCore.allowed(r.k,r.v))continue;if(!byDay.has(r.asof))byDay.set(r.asof,[]);byDay.get(r.asof).push(r);}
  const bySign=signed(cur),currentState=bySign?Math.sign(cur.v):historicalBand(cur,byDay);
  if(currentState===null)continue;
  const days=new Set(),past=[];
  for(const s of origins){const when=origin(s.date);if(when>=cur.pub||when+settings.h*60000>settings.cutMs)continue;
   const pastRows=[];for(let i=0;i<=7;i++){const day=new Date(Date.parse(M.dayISO(s.date)+'T12:00:00Z')-i*86400000).toISOString().slice(0,10);if(byDay.has(day))pastRows.push(...byDay.get(day));}
   const f=E.at(pastRows,when).active[0];if(!f||days.has(f.asof))continue;days.add(f.asof);
   const condition=bySign?Math.sign(f.v):historicalBand(f,byDay);if(condition===null)continue;
   const values=s.values.slice(0,settings.h+1);past.push({date:s.date,values,sign:condition,buy:Number(pb.targetFirst(values,1,settings.target,settings.stop)),sell:Number(pb.targetFirst(values,-1,settings.target,settings.stop))});
  }
  const sign=currentState,same=past.filter(s=>s.sign===sign),n=same.length;
  const stat={provider:cur.provider,scope:cur.scope,g:cur.g,k:cur.k,term:cur.term,series:cur.series,name:cur.name||w.InstCore.metrics[cur.k][0],sign:bySign?sign:undefined,band:bySign?undefined:sign,n,long:pb.estimate(same.reduce((a,s)=>a+s.buy,0),n),short:pb.estimate(same.reduce((a,s)=>a+s.sell,0),n),unit:'una origine per data del report',event:'Target ES prima dello stop sulle chiusure a 1 minuto entro '+settings.h+' min. Timeout incluso.'+(bySign?' Condizione: segno della posizione.':' Fascia '+sign+' della serie. Terzili stimati per ogni edizione da almeno 25 date precedenti, disponibili prima della pubblicazione.')};
  // A single predeclared conditioning series can temper the desk preference. Other series stay separately inspectable.
  if(cur.g==='cta'&&cur.k==='weight'&&cur.scope==='US'&&cur.provider==='BofA'&&cur.series==='Systematic Flows Monitor'&&cur.term==='medium'&&cur.mode==='estimate'){
   const scores=[[],[]],tot=[0,0],cond=[0,0];let count=0,m=0;
   for(const s of past){const ys=[s.buy,s.sell];if(s.sign===sign&&m>=25){for(let i=0;i<2;i++){const y=ys[i];scores[i].push((tot[i]/count-y)**2-(cond[i]/m-y)**2);}}
    for(let i=0;i<2;i++){tot[i]+=ys[i];if(s.sign===sign)cond[i]+=ys[i];}count++;if(s.sign===sign)m++;}
   const stats=scores.map(v=>M.riskSummary(v)),validated=scores[0].length>=25&&stats.every(s=>s&&s.lo>0);
   const sides=n>=25?[1,-1].map(side=>M.barriers(same,side,settings.target,settings.stop,settings.cost)):null;
   stat.check={n:scores[0].length,gainLong:stats[0]?.mean??null,gainShort:stats[1]?.mean??null,validated,preference:sides?M.choice(...sides):null};
  }
  out.push(stat);
 }
 return out;
}
function peek(frame,cohort){const c=frame?.settings;if(!c||!cohort?.sel?.length)return [];const current=w.InstReports.peek(c.cutMs);if(!current?.active?.some(covered))return [];
 const ver=w.InstReports.version();if(memo?.frame===frame&&memo.co===cohort&&memo.ver===ver)return memo.value;
 const state={frame,co:cohort,ver,value:[]};memo=state;const dates=cohort.sel.map(v=>v.date),first=dates.reduce((a,b)=>Math.min(a,b),Infinity),start=new Date(Date.parse(w.DeskMeasures.dayISO(first)+'T00:00:00Z')-8*864e5).toISOString().slice(0,10),end=new Date(c.cutMs+864e5).toISOString().slice(0,10);
 w.InstReports.range(start,end).then(rows=>{if(memo!==state)return;state.value=measure(rows,current,c,cohort);w.InstitutionalDesk?.refreshPlaybooks?.();}).catch(()=>{});return state.value;}
function decision(base,studies){const s=studies.find(v=>v.check?.validated&&['LONG','SHORT'].includes(v.check.preference));
 const opposed=s&&['LONG','SHORT'].includes(base)&&s.check.preference!==base;
 return {signal:opposed?'NEUTRALE':base,base,filter:opposed?'Conflitto con il campione CTA USA validato.':null};}
w.InstHistory={measure,peek,decision};
})(window);


