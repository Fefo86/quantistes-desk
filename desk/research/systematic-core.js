/* Daily cash-only benchmark. All exposures are ratios to unit initial NAV. */
(function(root){
'use strict';
const Q=root.QuantCore,DAY=86400000;
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const variance=x=>{const m=mean(x);return x.reduce((a,b)=>a+(b-m)**2,0)/(x.length-1);};
const rms2=x=>mean(x.map(v=>v*v)),annual=v=>Math.sqrt(252*v),clip=(v,l,h)=>Math.max(l,Math.min(h,v));
const dayName=t=>new Date(t).toISOString().slice(0,10);
const knownClosures=new Set(['2001-09-11','2001-09-12','2001-09-13','2001-09-14','2004-06-11','2007-01-02','2012-10-29','2012-10-30','2018-12-05','2025-01-09']);
const holidayCache=new Map();
function holidays(y){
 if(holidayCache.has(y))return holidayCache.get(y);
 const set=new Set(),utc=(m,d)=>Date.UTC(y,m-1,d),dow=t=>new Date(t).getUTCDay(),add=t=>set.add(dayName(t));
 const fixed=(m,d,ny=false)=>{const t=utc(m,d),w=dow(t);if(w===6&&ny)return;add(t+(w===6?-DAY:w===0?DAY:0));};
 const nth=(m,w,n)=>{const t=utc(m,1);add(t+((w-dow(t)+7)%7+7*(n-1))*DAY);};
 fixed(1,1,true);if(y>=1998)nth(1,1,3);nth(2,1,3);
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,g=Math.floor((b-Math.floor((b+8)/25)+1)/3);
 const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
 add(utc(Math.floor(n/31),n%31+1)-2*DAY);
 const mayEnd=utc(5,31);add(mayEnd-((dow(mayEnd)+6)%7)*DAY);
 if(y>=2022)fixed(6,19);fixed(7,4);nth(9,1,1);nth(11,4,4);fixed(12,25);
 holidayCache.set(y,set);return set;
}
function session(day){
 const t=Date.parse(day+'T00:00:00Z'),w=new Date(t).getUTCDay();
 return w>0&&w<6&&!knownClosures.has(day)&&!holidays(Number(day.slice(0,4))).has(day);
}
function nextDay(day){
 let t=Date.parse(day+'T00:00:00Z');do{t+=DAY;}while(!session(dayName(t)));return dayName(t);
}
function readDaily(text){
 const head=String(text).trimStart().split(/\r?\n/,1)[0],sep=[',',';','\t','|'].reduce((a,b)=>head.split(a).length>=head.split(b).length?a:b);
 const rows=Q.records(text,sep),keys=(rows.shift()||[]).map(Q.canonical),theta=keys.includes('created')&&keys.includes('lasttrade');
 if(new Set(keys).size!==keys.length||!keys.includes('close')||(!theta&&!(keys.includes('date')&&keys.includes('availableutc')))||keys.some(v=>['strike','right','expiration','optiontype'].includes(v)))throw Error('Serve un CSV di chiusure dell’indice cash SPX con date,close,available_utc oppure created,last_trade,close (ThetaData Index EOD).');
 const out=[];
 rows.forEach((row,i)=>{
   if(row.length!==keys.length)throw Error('Numero di campi errato alla riga '+(i+2));
   const r=Object.fromEntries(keys.map((k,j)=>[k,row[j].trim()]));
   if(keys.includes('symbol')&&r.symbol.toUpperCase()!=='SPX')return;
   const obs=theta?Q.timestampText(r.lasttrade):null,day=theta?obs.slice(0,10):Q.dateText(r.date),cost=Q.number(r.close);
   if(!/^\d{4}-\d\d-\d\d$/.test(day)||!(cost>0)||!Number.isFinite(cost)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||dayName(Date.parse(day+'T00:00:00Z'))!==day||!session(day))throw Error('Data seduta o chiusura cash non valida alla riga '+(i+2));
   let available;
   if(theta){
     if(!/[T ]\d\d:\d\d/.test(r.created)||!/[T ]\d\d:\d\d/.test(r.lasttrade))throw Error('Timestamp ThetaData incompleto alla riga '+(i+2));
     const created=Q.nyEpoch(r.created),trade=Q.nyEpoch(r.lasttrade);
     if(!(created>=trade))throw Error('Report precedente al prezzo osservato alla riga '+(i+2));
     available=Math.max(created,Q.nyEpoch(day+'T17:15:00'));
   }
   if(!theta||keys.includes('availableutc')){
     if(!/(?:Z|[+-]\d\d:\d\d)$/i.test(r.availableutc||''))throw Error('available_utc richiede Z o un offset alla riga '+(i+2));
     const explicit=Date.parse(r.availableutc);available=theta?Math.max(available,explicit):explicit;
   }
   const w=new Date(day+'T00:00:00Z').getUTCDay(),md=day.slice(5),early=(md==='07-03'||md==='12-24'||(md.startsWith('11-')&&w===5&&+md.slice(3)>=23&&+md.slice(3)<=29));
   if(!Number.isFinite(available)||available<Q.nyEpoch(day+(early?'T13:00:00':'T16:00:00')))throw Error('Disponibilità incoerente alla riga '+(i+2));
   out.push({day,close:cost,available});
 });if(!out.length)throw Error('Nessuna chiusura cash SPX nel CSV.');return out;
}
function select(rows,asof){
 if(!Number.isFinite(asof))throw Error('Snapshot ET non valido.');
 const dated=new Map();let later=0;
 for(const r of rows){
   if(r.available>asof){later++;continue;}
   let rev=dated.get(r.day);if(!rev){rev=new Map();dated.set(r.day,rev);}
   if(rev.has(r.available)&&rev.get(r.available)!==r.close)throw Error('Chiusure discordanti con la stessa pubblicazione il '+r.day);
   rev.set(r.available,r.close);
 }
 const ordered=[...dated].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,versions])=>{const available=Math.max(...versions.keys());return {day,available,close:versions.get(available)};});
 let start=0;for(let i=1;i<ordered.length;i++)if(nextDay(ordered[i-1].day)!==ordered[i].day)start=i;
 const used=ordered.slice(start);if(!used.length)throw Error('Nessuna chiusura già disponibile allo snapshot.');
 return {used,skipped:start,unavailable:later};
}
function volOfVol(returns){
 const block=6,count=12;if(returns.length<block*count)return null;
 const r=returns.slice(-block*count),logs=[],diffs=[];
 for(let i=0;i<r.length;i+=block){
   const b=r.slice(i,i+block),v=rms2(b);if(!(v>0))return null;logs.push(Math.log(v));
   const odd=rms2(b.filter((_,j)=>j%2)),even=rms2(b.filter((_,j)=>!(j%2)));
   if(odd>0&&even>0)diffs.push(Math.log(odd/even));
 }
 const rv=logs.slice(1).reduce((s,x,i)=>s+(x-logs[i])**2,0);
 const noise=diffs.length===count?2*(count-1)*variance(diffs)/4:null;
 return {rv,noise,net:noise===null?null:rv-noise};
}
function ema(x,n){
 let v=mean(x.slice(0,n));for(let i=n;i<x.length;i++)v+=2/(n+1)*(x[i]-v);return v;
}
function cta(prices,daily,cfg){
 if(prices.length<96)return null;
 const p=prices.at(-1),a=Math.max(daily,cfg.floor/Math.sqrt(252)),vol=a*Math.sqrt(252),rows=[];
 function add(name,s,trigger){rows.push({name,signal:s,weight:clip(s*cfg.target/vol,-cfg.cap,cfg.cap),trigger});}
 for(const [f,s] of [[8,24],[16,48],[32,96]]){
   const ef=ema(prices,f),es=ema(prices,s),af=2/(f+1),as=2/(s+1);
   const k=((1-as)*es-(1-af)*ef)/(af-as);add('EMA '+f+'/'+s,Math.tanh((ef-es)/(p*a*Math.sqrt(s-f))),k>0?[k]:[]);
 }
 for(const n of [21,63]){
   const z=Math.log(p/prices.at(-n-1))/(a*Math.sqrt(n));add('Momentum '+n,Math.tanh(z),[prices.at(-n)]);
 }
 for(const n of [20,55]){
   let s=0;for(let j=n;j<prices.length;j++){const prev=prices.slice(j-n,j),px=prices[j];if(px>Math.max(...prev))s=1;else if(px<Math.min(...prev))s=-1;}
   const last=prices.slice(-n);add('Breakout '+n,s,[Math.min(...last),Math.max(...last)]);
 }
 const w=mean(rows.map(r=>r.weight));return {rows,w,disp:mean(rows.map(r=>(r.weight-w)**2))};
}
function ledger(w,r,desired,u=0){
 const pre=w*(1+r),nav=1+w*r+u;
 return nav>0?{nav,pre,target:desired*nav,gap:desired*nav-pre}:null;
}
function metrics(book,cfg){
 for(const k of ['target','floor','cap','lambda','shock','leverage','flow'])if(!Number.isFinite(cfg[k]))throw Error('Parametri numerici incompleti.');
 if(!(cfg.target>0&&cfg.floor>0&&cfg.cap>0&&cfg.lambda>0&&cfg.lambda<1&&cfg.shock>0&&cfg.shock<1)||(cfg.current!==null&&!Number.isFinite(cfg.current)))throw Error('Target, floor e cap positivi; 0 < λ < 1 e 0 < shock < 100%.');
 const p=book.used.map(r=>r.close),r=p.slice(1).map((v,i)=>Math.log(v/p[i])),level=p.at(-1);
 const rv=n=>r.length<n?null:rms2(r.slice(-n)),v20=rv(20),v21=rv(21),v63=rv(63);
 if(v20===null){
   const scenarios=[-cfg.shock,0,cfg.shock].map(move=>({move,price:level*(1+move),rolling:null,ew:null,weights:[null,null],cta:null,rollRatio:null,gap:null,letf:ledger(cfg.leverage,move,cfg.leverage,cfg.flow),reset:cfg.leverage*(cfg.leverage-1)*move,flowTerm:cfg.leverage*cfg.flow}));
   return {n:r.length,level,v20:null,ew:null,current:null,scenarios,drop:[],cross:null,before:null,rv1:null,rv3:null,vov:null,sensitivity:cfg.leverage*(cfg.leverage-1)};
 }
 const weight=v=>Math.min(cfg.cap,cfg.target/Math.max(cfg.floor,annual(v)));
 let ew=rms2(r.slice(0,20));for(const x of r.slice(20))ew=cfg.lambda*ew+(1-cfg.lambda)*x*x;
 const current=cta(p,Math.sqrt(v20),cfg);const scenarios=[],drop=[];
 const out=r.at(-20),sum20=v20*20;
 for(const move of [-cfg.shock,0,cfg.shock]){
   const add=Math.log1p(move)**2,rolling=Math.max(0,v20+(add-out*out)/20),u=cfg.flow;
   const ew1=cfg.lambda*ew+(1-cfg.lambda)*add;
   const ct=current?cta([...p,level*(1+move)],Math.sqrt(rolling),cfg):null;
   const weights=[weight(rolling),weight(ew1)];
   scenarios.push({move,price:level*(1+move),rolling,ew:ew1,weights,cta:ct,rollRatio:annual(rolling)/cfg.target,gap:cfg.current===null?null:ledger(cfg.current,move,weights[0]),letf:ledger(cfg.leverage,move,cfg.leverage,u),reset:cfg.leverage*(cfg.leverage-1)*move,flowTerm:cfg.leverage*u});
 }
 let v=v20,previous=weight(v),projectedDay=book.used.at(-1).day;
 for(let step=0;step<5;step++){
   const ix=r.length-20+step,old=r[ix];v=Math.max(0,v-old*old/20);projectedDay=nextDay(projectedDay);
   const w=weight(v);drop.push({date:projectedDay,outDate:book.used[ix+1].day,old,share:sum20>0?old*old/sum20:null,vol:annual(v),weight:w,delta:w-previous});previous=w;
 }
 const cross=v63===null?null:annual(v21)-annual(v63),before=r.length<64?null:annual(rms2(r.slice(-22,-1)))-annual(rms2(r.slice(-64,-1)));
 return {n:r.length,level,v20,ew,current,scenarios,drop,cross,before,rv1:v21===null?null:annual(v21),rv3:v63===null?null:annual(v63),vov:volOfVol(r),sensitivity:cfg.leverage*(cfg.leverage-1)};
}
root.SystematicCore={readDaily,select,metrics,session,nextDay,volOfVol,ledger,cta};
})(typeof window==='undefined'?globalThis:window);
