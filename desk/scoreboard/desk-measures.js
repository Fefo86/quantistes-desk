(function (root) {
'use strict';
const tick = 0.25;
const minSessions = 25;
function number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function onTick(v) { return Number.isFinite(v) && Math.abs(v / tick - Math.round(v / tick)) < 1e-8; }
function dateKey(s) { return Number(String(s || '').slice(0,10).replaceAll('-','')); }
function stamp(s) {
  if (typeof s !== 'string' || !/(Z|[+-]\d\d:?\d\d)$/i.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
function recent(t,cut,ttl) { return Number.isFinite(t) && Number.isFinite(cut) && t <= cut && cut - t <= ttl * 1000; }
function priceClockError(snap,now=Date.now()){
 const cut=stamp(snap?.asof);if(!Number.isFinite(cut))return 'Carica uno snapshot ES con data, ora e fuso.';
 if(cut>now||!recent(stamp(snap.es?.asof),cut,90))return 'Il prezzo ES richiede un orario anteriore o uguale allo snapshot, entro 90 secondi.';
 if(!recent(stamp(snap.vix?.asof),cut,180))return 'Il VIX richiede un proprio timestamp, anteriore o uguale allo snapshot ES, entro 180 secondi.';
 return null;
}
function dates(rows) { return [...new Set(rows.map(r=>r[9]))].sort((a,b)=>a-b); }
function dayISO(n) { return String(n).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'); }
function timeET(min) { return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'); }
function clock(iso) {
  const t=stamp(iso);if(t===null)return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(t);
  const p=Object.fromEntries(parts.map(a=>[a.type,a.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,minute:60*Number(p.hour)+Number(p.minute),second:+p.second};
}
function riskSummary(values) {
  const n=values.length;if(!n)return null;
  const mean=values.reduce((a,b)=>a+b,0)/n;
  const dev=values.map(v=>v-mean);
  const lag=Math.min(5,n-1);
  let s=dev.reduce((a,v)=>a+v*v,0);
  for(let k=1;k<=lag;k++) {
    let cov=0;for(let i=k;i<n;i++)cov+=dev[i]*dev[i-k];
    s+=2*(1-k/(lag+1))*cov;
  }
  const se=n>1?Math.sqrt(Math.max(0,s)/(n*(n-1))):null;
  return {mean,se,lo:se===null?null:mean-1.96*se,hi:se===null?null:mean+1.96*se};
}
function barriers(selection,side,target,stop,cost) {
  if(![1,-1].includes(side)||!Number.isSafeInteger(target)||target<=0||!Number.isSafeInteger(stop)||stop<=0||number(cost)===null||cost<0)throw Error('Target e stop richiedono tick interi positivi e un costo valido.');
  const count={target:0,stop:0,timeout:0},outcomes=[],net=[];
  for(const path of selection) {
    const ticks=path.values;
    let event='timeout',profit=side*ticks[ticks.length-1]/tick,minute=ticks.length-1;
    for(let j=1;j<ticks.length;j++){
      const observed=side*ticks[j]/tick;
      if(observed>=target || observed<=-stop){
        event=observed>=target?'target':'stop';profit=observed;minute=j;break;
      }
    }
    count[event]++;net.push(profit-cost);outcomes.push({date:path.date,event,minute,gross:profit,net:profit-cost});
  }
  const n=net.length;
  return {n,count,p:n?Object.fromEntries(Object.entries(count).map(([k,v])=>[k,v/n])):null,outcomes,risk:riskSummary(net)};
}
function choice(a,b) {
  if(!a||!b||a.n<minSessions||b.n<minSessions)return 'ATTESA';
  if(a.risk.lo>0 && a.risk.mean>b.risk.mean)return 'LONG';
  if(b.risk.lo>0 && b.risk.mean>a.risk.mean)return 'SHORT';
  return 'NEUTRALE';
}
function foldTest(a,b) {
  const out=[],n=a.n;
  for(let i=minSessions;i<n;i++){
    const prev=series=>({n:i,risk:riskSummary(series.outcomes.slice(0,i).map(v=>v.net))});
    const side=choice(prev(a),prev(b));
    out.push({date:a.outcomes[i].date,side,net:side==='LONG'?a.outcomes[i].net:side==='SHORT'?b.outcomes[i].net:0});
  }
  const active=out.filter(v=>v.side!=='NEUTRALE');
  return {test:out.length,active:active.length,total:out.reduce((s,v)=>s+v.net,0),perOrigin:out.length?out.reduce((s,v)=>s+v.net,0)/out.length:null};
}
root.DeskMeasures=Object.freeze({number,onTick,stamp,recent,priceClockError,dates,clock,dateKey,dayISO,timeET,riskSummary,barriers,choice,foldTest,tick,minSessions});
})(globalThis);
