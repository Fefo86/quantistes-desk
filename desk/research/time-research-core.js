/* Historical data applications for the frozen native fit. All absolute times
   are UTC milliseconds; matching a trading window uses America/New_York. */
(function(root){
'use strict';
const Q=root.QuantCore, D=root.DistributionCore;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sorted=a=>a.slice().sort((x,y)=>x-y);
const quant=(a,u)=>{if(!a.length)return null;const t=sorted(a),i=(t.length-1)*u,j=Math.floor(i);return t[j]+(i-j)*(t[Math.min(j+1,t.length-1)]-t[j]);};
const iso=ms=>new Date(ms).toISOString();
function etClock(s){if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?$/.test(s))throw Error('Ora ET non valida.');return s;}
function rowsOf(text,required){
 const header=String(text).trimStart().split(/\r?\n/,1)[0];const sep=[',',';','\t','|'].reduce((a,b)=>header.split(b).length>header.split(a).length?b:a);
 const lines=Q.records(text,sep),keys=(lines.shift()||[]).map(Q.canonical);if(!required.every(k=>keys.includes(k)))throw Error('Colonne richieste: '+required.join(', '));
 if(new Set(keys).size!==keys.length)throw Error('Colonne duplicate nel CSV.');
 return lines.map((row,i)=>{if(row.length!==keys.length)throw Error('Riga '+(i+2)+' con numero di campi errato.');return Object.fromEntries(keys.map((k,j)=>[k,row[j].trim()]));});
}
function labels(text){
 const out=new Map();for(const r of rowsOf(text,['symbol','expiration','settlement','availableutc'])){
  const sym=r.symbol.toUpperCase(),day=Q.dateText(r.expiration),clock=etClock(r.fixinget||'16:00'),y=Q.number(r.settlement),end=Q.nyEpoch(day+'T'+clock);
  if(!/^\d{2}:\d{2}$/.test(clock)||!Number.isFinite(end)||!(y>0)||!sym)throw Error('Settlement, data, ora di fixing HH:MM o simbolo non validi.');
  const known=D.historyRow({series:sym+'@'+clock.slice(0,5)+'ET-CVIMARK1',asof_utc:iso(end-1000),expiry_utc:iso(end),available_utc:r.availableutc,pit_q:.5}).available_utc;
  let fixingKnown=null;
  if(r.fixingknownutc){
   const stamp=r.fixingknownutc;
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(stamp)||!Q.timestampText(stamp)||!Number.isFinite(Date.parse(stamp)))throw Error('fixing_known_utc richiede un timestamp ISO con Z o offset.');
   const dayUTC=Date.parse(stamp.slice(0,10)+'T00:00:00Z');if(!Number.isFinite(dayUTC)||iso(dayUTC).slice(0,10)!==stamp.slice(0,10)||+stamp.slice(11,13)>23||+stamp.slice(14,16)>59)throw Error('Data fixing_known_utc non valida.');
   fixingKnown=iso(Date.parse(stamp));
  }
  const row={symbol:sym,day,clock,value:y,available:known,fixingKnown},key=sym+'|'+day+'|'+clock.slice(0,5);
  if(out.has(key)&&JSON.stringify(out.get(key))!==JSON.stringify(row))throw Error('Settlement discordante per '+key);out.set(key,row);
 }return out;
}
function plan(rows,settings,cutoff,fixing){
 etClock(cutoff);etClock(fixing);const groups=new Map();
 for(const r of rows){
  if(r.symbol!==settings.symbol||!r.expiry||!r.time||r.time.slice(0,10)!==r.expiry)continue;
  if(!groups.has(r.expiry))groups.set(r.expiry,[]);groups.get(r.expiry).push(r);
 }
 return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([day,series])=>({day,rows:series,asof:day+'T'+cutoff,fixing,settings}));
}
function schedule(job,label){
 if(!label||label.clock===job.fixing||Q.nyEpoch(job.day+'T'+label.clock)===Q.nyEpoch(job.day+'T'+job.fixing))return job;
 if(!label.fixingKnown||Date.parse(label.fixingKnown)>=Q.nyEpoch(job.asof))throw Error('Fixing eccezionale: documentare il calendario con fixing_known_utc precedente al cutoff oppure impostare il fixing del batch da un calendario noto.');
 return {...job,fixing:label.clock};
}
function forDate(job){
 const cfg={...job.settings,asof:job.asof,expiry:job.day,expiryTime:job.fixing,target:job.day+'T'+job.fixing,forward:0,quoteSource:'mid',overrideHours:0,anchor:'native'};
 const origin=Q.nyEpoch(cfg.asof),end=Q.nyEpoch(cfg.target);if(!(end>origin))throw Error('Il fixing deve seguire il cutoff.');
 const filtered=Q.selectSnapshot(job.rows,cfg),last=new Map(filtered.rows.map(r=>[r.strike+'|'+r.right,r]));
 for(const r of job.rows){
  const prev=last.get(r.strike+'|'+r.right);if(!prev||r.time!==prev.time)continue;
  if(['bid','ask'].some(k=>!(r[k]===prev[k]||Number.isNaN(r[k])&&Number.isNaN(prev[k]))))throw Error('Quote discordanti per contratto allo stesso timestamp del cutoff.');
 }
 const f=Q.inferForward(filtered.rows,cfg,(end-origin)/(365*86400000));
 if(!(f.F>0&&f.source.startsWith('Parità')))throw Error('Forward non identificato dalle coppie put/call disponibili al cutoff.');
 cfg.settlement=f.F;return cfg;
}
function archive(result,settings={coordinate:'native'}){
 if(!result.ws)throw Error(result.errors?.ws||'Q non disponibile.');
 const issue=D.sourceFailure(result,settings);if(issue)throw Error(issue);
 const m=result.ws.model,cfg=result.cfg,cvi=m.cvi;
 if(!cvi||cvi.certificate?.status!=='CERTIFIED')throw Error('Mark CVI non verificato.');
 const ctx=cvi.context,series=cfg.symbol+'@'+cfg.expiryTime.slice(0,5)+(ctx.markProfile==='CVI_WING_MID_BOX_1'?'ET-CVIWING1':'ET-CVIMARK1');
 const native=Q.cviModel(cvi,[],ctx.T);
 const x=native.knots.map(k=>native.F+native.scale*k);
 return {format:'quantistes-cvi-mark-v1',series,asof_utc:iso(ctx.asofMs),expiry_utc:iso(ctx.fixMs),x,
  canonical:cvi.canonical,context:ctx,fingerprint:cvi.certificate.fingerprint,
  qEngine:Q.VERSION,forwardSource:result.forward.source,fitQuality:result.quality?.level,maxQuoteAge:cfg.maxAge,forward:m.F,usedQuotes:m.fitted.length,rate:cfg.rate,dividend:cfg.dividend};
}
function archivedCVI(doc){
 const c=doc.canonical,ctx=doc.context,x=doc.x;
 if(!ctx||!c||!Array.isArray(c.knots)||c.knots.length>100||!Array.isArray(x)||x.length<3||x.length>5000||
  !x.every((v,i)=>Number.isFinite(v)&&v>0&&(!i||v>x[i-1]))||ctx.asofMs!==Date.parse(doc.asof_utc)||ctx.fixMs!==Date.parse(doc.expiry_utc)||
  ctx.F!==doc.forward||!(ctx.F>0&&ctx.T>0&&ctx.D>0)||typeof ctx.symbol!=='string'||
  doc.series!==ctx.symbol+'@'+D.fixingClock(ctx.fixMs)+(ctx.markProfile==='CVI_WING_MID_BOX_1'?'ET-CVIWING1':'ET-CVIMARK1')||Math.abs(ctx.T-(ctx.fixMs-ctx.asofMs)/(365*86400000))>1e-13)throw Error('Metadati o griglia della previsione CVI incoerenti.');
 const certificate=root.CVICert.slice(c,{context:ctx});
 if(!['CVI_INTRADAY_BOX_PROJECTION_2','CVI_WING_MID_BOX_1'].includes(ctx.markProfile)||certificate.fingerprint!==doc.fingerprint||certificate.status!=='CERTIFIED')throw Error('Impronta o verifica continua della previsione CVI non valida.');
 const native=Q.cviModel({canonical:c,context:ctx,certificate},[],ctx.T);
 if(native.knots.length!==x.length||x.some((K,i)=>Math.abs(K-(native.F+native.scale*native.knots[i]))>1e-11*Math.max(1,K)))throw Error('Nodi di quadratura diversi dalla ricostruzione CVI.');
 const F=ctx.F,f={...ctx,canonical:c},pt=s=>root.CVILab.point(f,Math.log(s/F));
 const clip=v=>Math.max(0,Math.min(1,v));
 const cdf=s=>s<=0?0:s===Infinity?1:clip(pt(s).probBelow);
 const sf=s=>s<=0?1:s===Infinity?0:clip(pt(s).probAbove);
 const pdf=s=>s<=0||s===Infinity?0:Math.max(0,pt(s).density);
 if(cdf(x[0])+sf(x.at(-1))>1e-10||x[0]>=F||x.at(-1)<=F)throw Error('La finestra di quadratura è insufficiente.');
 const inverse=u=>{if(!(u>=0&&u<=1))throw Error('Percentile fuori intervallo.');if(u===0)return 0;if(u===1)return Infinity;
  const upper=u>.5,v=upper?1-u:u,fn=s=>upper?v-sf(s):cdf(s)-v;let l=x[0],h=x.at(-1);
  while(l>0&&fn(l)>0)l/=2;while(Number.isFinite(h)&&fn(h)<0)h*=2;
  for(let j=0;j<90;j++){const m=l+(h-l)/2;if(m===l||m===h)break;if(fn(m)>=0)h=m;else l=m;}return h;};
 return {cdf,pdf,inverse,breach:s=>!(s>0&&Number.isFinite(s))};
}
function archiveLaw(doc){
 if(doc?.format==='quantistes-cvi-mark-v1')return archivedCVI(doc);
 if(doc?.format!=='quantistes-native-linear-density-v1'||!doc?.series?.endsWith('ET-QSPLINE1'))throw Error('Formato o serie di previsione Q incompatibili.');

 const x=doc?.x,y=doc?.density;
 if(!Array.isArray(x)||!Array.isArray(y)||x.length<2||x.length!==y.length||x.some((k,i)=>!(Number.isFinite(k)&&k>0&&(!i||k>x[i-1])&&Number.isFinite(y[i])&&y[i]>=0)))throw Error('Nodi o densità archiviati non validi.');
 const n=x.length,cs=[0];for(let i=1;i<n;i++)cs.push(cs[i-1]+(x[i]-x[i-1])*(y[i-1]+y[i])/2);
 if(Math.abs(cs.at(-1)-1)>2e-7)throw Error('Massa differente da 1.');
 function cell(s){let l=0,r=n-1;while(r-l>1){let m=(l+r)>>1;if(s<x[m])r=m;else l=m;}return l;}
 const cdf=s=>{if(s<=x[0])return 0;if(s>=x[n-1])return 1;const i=cell(s),dt=s-x[i],v=cs[i]+dt*(y[i]+.5*dt*(y[i+1]-y[i])/(x[i+1]-x[i]));return Math.max(0,Math.min(1,v));};
 const inverse=u=>{if(!(u>=0&&u<=1))throw Error('Percentile fuori intervallo.');if(u===0){const i=y.findIndex(v=>v>0);return x[Math.max(0,i-1)];}if(u===1){let i=n-1;while(i>0&&!(y[i]>0))i--;return x[Math.min(n-1,i+1)];}let l=x[0],h=x[n-1];for(let k=0;k<70;k++){const m=(l+h)/2;if(cdf(m)>=u)h=m;else l=m;}return h;};
 const breach=s=>!x.slice(1).some((b,i)=>s>=x[i]&&s<=b&&(y[i]>0||y[i+1]>0));
 const pdf=s=>{if(s<x[0]||s>x[n-1])return 0;const i=cell(s);return y[i]+(s-x[i])*(y[i+1]-y[i])/(x[i+1]-x[i]);};
 return {cdf,pdf,inverse,breach};
}
// Gauss–Legendre of degree 31 integrates squared sextic Bernstein CDF
// transforms of a quadratic native CDF exactly in each spline interval.
const GX=[.09501250983763744,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const GW=[.1894506104550685,.1826034150449236,.16915651939500254,.14959598881657673,.12462897125553387,.09515851168249278,.06225352393864789,.027152459411754095];
function scores(doc,law,y,transform=x=>x){
 const x=doc.x,bounds=sorted([...x,...(y>x[0]&&y<x.at(-1)?[y]:[])]);let score=Math.max(0,x[0]-y,y-x.at(-1));
 for(let i=1;i<bounds.length;i++){const a=bounds[i-1],b=bounds[i],c=(a+b)/2,h=(b-a)/2,z=Number(c>=y);
  for(let j=0;j<GX.length;j++)score+=h*GW[j]*((transform(law.cdf(c-h*GX[j]))-z)**2+(transform(law.cdf(c+h*GX[j]))-z)**2);
 }
 const pinball={};for(const u of [.05,.5,.95]){let lo=0,hi=1;for(let k=0;k<56;k++){const m=(lo+hi)/2;if(transform(m)>=u)hi=m;else lo=m;}const d=y-law.inverse((lo+hi)/2);pinball[u]=d*(u-Number(d<0));}
 return {crps:score,pinball};
}
function secondLog(doc,law,tilt=()=>1){
 if(!(doc.forward>0))return null;let total=0;
 for(let i=1;i<doc.x.length;i++){const a=doc.x[i-1],b=doc.x[i],c=(a+b)/2,h=(b-a)/2;
  for(let j=0;j<GX.length;j++)for(const s of [c-h*GX[j],c+h*GX[j]])total+=h*GW[j]*Math.log(s/doc.forward)**2*law.pdf(s)*tilt(law.cdf(s));
 }return total;
}
function evaluate(docs,settlements){
 const pits=[],table=[];for(const doc of docs.slice().sort((a,b)=>a.asof_utc.localeCompare(b.asof_utc))){
  const symbol=doc.series.split('@')[0],end=Date.parse(doc.expiry_utc),origin=Date.parse(doc.asof_utc),ny=Q.nyFormat(end),label=settlements.get(symbol+'|'+ny.slice(0,10)+'|'+ny.slice(11,16));
  if(!label){table.push({doc,missing:true});continue;}
  const f=archiveLaw(doc),u=f.cdf(label.value),r=D.historyRow({series:doc.series,asof_utc:doc.asof_utc,expiry_utc:doc.expiry_utc,available_utc:label.available,pit_q:u,support_breach:Number(f.breach(label.value))});
  const fit=D.calibrate(pits,{series:doc.series,end,origin}),hasP=fit.n>=fit.minimum&&!fit.endpointHits&&!fit.supportBreaches;
  const q2=secondLog(doc,f),p2=hasP?secondLog(doc,f,fit.map.density):null;
  table.push({doc,logSquareQ:q2,logSquareP:p2,terminalPremium:p2!==null&&q2!==null?q2-p2:null,logSquareRealized:Math.log(label.value/doc.forward)**2,y:label.value,pit:u,breach:r.support_breach,train:fit.n,q:scores(doc,f,label.value),p:hasP?scores(doc,f,label.value,fit.map.cdf):null});
  pits.push(r);
 }return{pits,table};
}
function readBars(text,symbol){
 const t=Q.table(text),keys=t.headers.map(Q.canonical),find=names=>keys.findIndex(k=>names.includes(k));
 const ids={time:find(['timestamp','time','datetime','barend','barstart','date']),open:find(['open','apertura']),high:find(['high','massimo']),low:find(['low','minimo']),close:find(['close','chiusura']),sym:find(['symbol','root','underlyingsymbol','ticker'])};
 if(['time','open','high','low','close'].some(k=>ids[k]<0)||keys.includes('strike')||keys.includes('expiration'))throw Error('Carica OHLC del sottostante con timestamp, open, high, low e close; richiesto un solo strumento.');
 const found=[],seenSymbols=new Set();
 for(let i=0;i<t.rows.length;i++){const r=t.rows[i],s=ids.sym<0?symbol:r[ids.sym]?.trim().toUpperCase();if(s)seenSymbols.add(s);if(s!==symbol)continue;
  let timeText=String(r[ids.time]||'');const legacyMs=keys.indexOf('msofday');
  if(legacyMs>=0&&/^\d{8}$|^\d{4}-\d{2}-\d{2}$/.test(timeText)){
   const msDay=Q.number(r[legacyMs]);if(!Number.isInteger(msDay)||msDay<0||msDay>=86400000)throw Error('ms_of_day non valido alla riga '+(i+2));
   timeText=Q.dateText(timeText)+'T'+new Date(msDay).toISOString().slice(11,23);
  }
  if(!/[T ]\d{1,2}:\d\d/.test(timeText)&&!/^\d{10}(\.\d+)?$|^\d{13}$/.test(timeText))throw Error('Timestamp intraday con ora richiesto alla riga '+(i+2));
  const time=Q.timestampText(timeText),ms=Q.nyEpoch(time),[o,h,l,c]=['open','high','low','close'].map(k=>Q.number(r[ids[k]]));
  if(!Number.isFinite(ms)||![o,h,l,c].every(v=>Number.isFinite(v)&&v>0)||h<Math.max(o,c)||l>Math.min(o,c))throw Error('OHLC non valido alla riga '+(i+2));
  const ai=keys.indexOf('availableutc');let available;
  if(ai>=0){const proof=D.historyRow({series:'CASH',asof_utc:iso(ms-1),expiry_utc:iso(ms),available_utc:String(r[ai]??'').trim(),pit_q:.5});available=Date.parse(proof.available_utc);}
  found.push({ms,o,h,l,c,...(available==null?{}:{available})});
 }if(!found.length)throw Error('Nessuna barra '+symbol+'. Simboli nel file: '+[...seenSymbols].join(', '));return found;
}
/* Bounds use the observed OHLC extrema and their known ordering with open and close.
   Their meaning is identification within the bar, separate from sampling error. */
function pathFeatures(data,L,U,hitL,hitU,cfg){
 const n=data.length,horizon=n*cfg.minutes,origin=data[0].o;
 const buffer=(cfg.breakBps??5)*origin/1e4,recrossBars=cfg.recrossBars??3,occupShare=cfg.occupShare??50,truncate=(cfg.truncateBps??30)/1e4;
 if(!(buffer>0&&Number.isInteger(recrossBars)&&recrossBars>0&&occupShare>0&&occupShare<=100&&truncate>0))throw Error('Verifica banda di reazione, recross, occupazione e soglia di troncatura.');
 function side(level,sign,hit){
  if(hit===null)return null;
  const z=data[hit],outside=(p)=>sign*(p-level),openGap=outside(z.o)>=0;
  const maxOver=outside(sign===1?z.h:z.l);
  const t0=hit*cfg.minutes,t1=t0+cfg.minutes;
  const overshoot=openGap?[outside(z.o),outside(z.o)]:[0,maxOver];
  let reaction='unresolved',breakAt=null;
  for(let i=hit;i<n;i++){const beyond=outside(data[i].c);if(beyond>=buffer){reaction='break';breakAt=i;break;}if(beyond<=-buffer){reaction='reject';break;}}
  let recross=null;
  if(breakAt!==null){
   const last=Math.min(n-1,breakAt+recrossBars);let returned=false;
   for(let i=breakAt+1;i<=last;i++)if(outside(data[i].c)<=-buffer){returned=true;break;}
   recross=returned?'yes':last<breakAt+recrossBars?'censored':'no';
  }
  return {touch:openGap?[t0,t0]:[t0,t1],overshoot,reaction,recross};
 }
 let minPrice=origin,maxPrice=origin,ddLow=0,ddHigh=0,ruLow=0,ruHigh=0,insideMin=0,insideMax=0,insideClose=0;
 let prev=origin,r3=0,r4=0,rv=0,truncated=0,discarded=0;
 const pathRV=[];
 for(const z of data){
  ddLow=Math.max(ddLow,maxPrice-z.l,z.o-z.l,z.h-z.c);
  ddHigh=Math.max(ddHigh,maxPrice-z.l,z.h-z.l);
  ruLow=Math.max(ruLow,z.h-minPrice,z.h-z.o,z.c-z.l);
  ruHigh=Math.max(ruHigh,z.h-minPrice,z.h-z.l);
  maxPrice=Math.max(maxPrice,z.h);minPrice=Math.min(minPrice,z.l);
  if(z.l>=L&&z.h<=U)insideMin+=cfg.minutes;
  if(z.h>=L&&z.l<=U)insideMax+=cfg.minutes;
  if(z.c>=L&&z.c<=U)insideClose+=cfg.minutes;
  const r=Math.log(z.c/prev),r2=r*r;prev=z.c;rv+=r2;r3+=r2*r;r4+=r2*r2;pathRV.push(r2);
  if(Math.abs(r)<=truncate)truncated+=r2;else discarded++;
 }
 const target=horizon*occupShare/100,drawdown=[ddLow/origin,ddHigh/origin],runup=[ruLow/origin,ruHigh/origin];
 return {minutes:cfg.minutes,horizon,upper:side(U,1,hitU),lower:side(L,-1,hitL),drawdown,runup,
  ddExceeded:[drawdown[0]>cfg.lower/100,drawdown[1]>cfg.lower/100],occupation:[insideMin,insideMax],
  occupationEvent:[insideMin>=target,insideMax>=target],occupationClose:insideClose,
  skewRealized:rv?Math.sqrt(n)*r3/rv**1.5:null,kurtRealized:rv?n*r4/(rv*rv):null,
  truncated,discarded,pathRV
 };
}
function pathStats(dates){
 const paths=dates.map(d=>d.path),n=paths.length,h=paths[0].horizon,m=paths[0].minutes,rows=paths[0].pathRV.length;
 const av=(a)=>a.length?a.reduce((s,v)=>s+Number(v),0)/a.length:null;
 const boundsMean=(list)=>list.length?[av(list.map(x=>x[0])),av(list.map(x=>x[1]))]:[null,null];
 const side=key=>{
  const all=paths.map(p=>p[key]),touch=all.filter(Boolean),k=touch.length,br=touch.filter(t=>t.reaction==='break'),count=(l,p)=>l.filter(p).length;
  const curve=[];let atRisk=n;
  for(let i=0;i<rows;i++){
   const events=count(dates,d=>(key==='upper'?d.hitU:d.hitL)===i);
   curve.push({minutes:(i+1)*m,atRisk,events,hazard:atRisk?events/atRisk:null,survival:(atRisk-events)/n});atRisk-=events;
  }
  const t=touch.map(r=>r.touch),qBounds=(u)=>t.length?[quant(t.map(r=>r[0]),u),quant(t.map(r=>r[1]),u)]:[null,null];
  const yes=count(br,t=>t.recross==='yes'),unknown=count(br,t=>t.recross==='censored');
  return {touched:k,nonTouch:n-k,time:boundsMean(t),timeQuant:[.1,.5,.9].map(qBounds),
   overshoot:boundsMean(touch.map(r=>r.overshoot)),survivalAtH:(n-k)/n,curve,
   nBreak:br.length,pBreak:k?br.length/k:null,pReject:k?count(touch,t=>t.reaction==='reject')/k:null,
   pUnresolved:k?count(touch,t=>t.reaction==='unresolved')/k:null,recross:br.length?[yes/br.length,(yes+unknown)/br.length]:[null,null],recrossCensored:unknown};
 };
 const variances=Array.from({length:rows},(_,i)=>av(paths.map(x=>x.pathRV[i]))),total=variances.reduce((a,b)=>a+b,0);
 const valid=paths.filter(x=>x.skewRealized!==null);
 return {upper:side('upper'),lower:side('lower'),horizon:h,minutes:m,
  drawdown:boundsMean(paths.map(x=>x.drawdown)),runup:boundsMean(paths.map(x=>x.runup)),
  ddExceeded:boundsMean(paths.map(x=>x.ddExceeded)),occupation:boundsMean(paths.map(x=>x.occupation)),
  occupationEvent:boundsMean(paths.map(x=>x.occupationEvent)),occupationClose:av(paths.map(x=>x.occupationClose)),
  skew:av(valid.map(x=>x.skewRealized)),kurt:av(valid.map(x=>x.kurtRealized)),momentDays:valid.length,
  truncated:av(paths.map(x=>x.truncated)),discarded:paths.reduce((s,x)=>s+x.discarded,0),
  clock:variances.map((v,i)=>({minute:(i+1)*m,fraction:total?v/total:null,perMinute:total?v/(total*m):null}))
 };
}

function windowData(bars,cfg){
 const {start,end,minutes,stamp,until,lower,upper}=cfg;etClock(start);etClock(end);
 if(!Number.isInteger(minutes)||minutes<1||!['open','close'].includes(stamp)||!Number.isFinite(until)||!(lower>0&&lower<100&&upper>0))throw Error('Controlla orari, data di taglio, ampiezza barre e distanze delle barriere.');
 const step=minutes*60000,days=new Map();
 for(const bar of bars){
  const from=bar.ms-(stamp==='close'?step:0),to=from+step,day=Q.nyFormat(from).slice(0,10);
  const published=bar.available??to;
  if(!Number.isFinite(published)||published<to)throw Error('La disponibilità di una barra completa deve seguire la fine della barra. Verifica il campo available_utc e il significato del timestamp.');
  if(!days.has(day))days.set(day,{map:new Map(),first:new Map(),conflicts:new Set(),publication:new Map()});
  if(published>=until)continue;
  const g=days.get(day),id=from+'|'+published,old=g.publication.get(id);
  if(old&&['o','h','l','c'].some(k=>old[k]!==bar[k]))g.conflicts.add(from);
  const entry={...bar,published};g.publication.set(id,entry);
  if(!g.map.has(from)||g.map.get(from).published<published)g.map.set(from,entry);
  if(!g.first.has(from)||g.first.get(from).published>published)g.first.set(from,entry);
 }

 const good=[],omitted=[];for(const [day,g] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  const a=Q.nyEpoch(day+'T'+start),b=Q.nyEpoch(day+'T'+end);if(!(b>a&&(b-a)%step===0))throw Error('L’intervallo ET deve essere positivo, nella stessa seduta e multiplo della durata barra.');
  if(b>=until){omitted.push({day,reason:'Finestra successiva al cutoff di ricerca'});continue;}
  const data=[];for(let i=a;i<b;i+=step){if(!g.map.has(i)||g.conflicts.has(i))break;data.push(g.map.get(i));}
  if(data.length!==(b-a)/step||data.length<2){omitted.push({day,reason:'Griglia incompleta o duplicato discordante'});continue;}
  if([...g.map.keys()].some(t=>t>=a&&t<b&&(t-a)%step!==0)){omitted.push({day,reason:'Frequenza o allineamento delle barre incoerente'});continue;}
  const open=data[0].o,endPrice=data.at(-1).c,L=open*(1-lower/100),U=open*(1+upper/100);
  let prev=open,rv=0,down=0,up=0,qp=0,bp=0,lastRet=null,hitL=null,hitU=null,first='timeout',mfe=0,mae=0;
  const closes=[open];for(let i=0;i<data.length;i++){
   const z=data[i],r=Math.log(z.c/prev),u=r*r;rv+=u;qp+=u*u;down+=r<0?u:0;up+=r>=0?u:0;if(lastRet!==null)bp+=Math.abs(lastRet*r);lastRet=r;prev=z.c;closes.push(z.c);
   mfe=Math.max(mfe,z.h/open-1);mae=Math.min(mae,z.l/open-1);const low=z.l<=L,high=z.h>=U;if(low&&hitL===null)hitL=i;if(high&&hitU===null)hitU=i;
   if(first==='timeout'&&(low||high))first=z.o<=L?'lower':z.o>=U?'upper':low&&high?'ambiguous':low?'lower':'upper';
  }
  const n=data.length,bv=bp*Math.PI/2*n/(n-1),sig={};
  for(const m of [1,2,5,10]){if(m>n)continue;let total=0,p=0;while(p<n){const j=Math.min(n,p+m);total+=Math.log(closes[j]/closes[p])**2;p=j;}sig[m*minutes]=total;}
  let firstPrice=g.first.get(a).o,firstRV=0,firstAvailable=-Infinity;
  for(let t=a;t<b;t+=step){const bar=g.first.get(t);firstRV+=Math.log(bar.c/firstPrice)**2;firstPrice=bar.c;firstAvailable=Math.max(firstAvailable,bar.published);}
  good.push({day,windowOrigin:a,firstRV,firstAvailable,open,close:endPrice,ret:Math.log(endPrice/open),rv,down,up,bv,jump:Math.max(rv-bv,0),rq:qp*n/3,mfe,mae,first,hitL,hitU,endLow:endPrice<=L,endHigh:endPrice>=U,signature:sig,path:pathFeatures(data,L,U,hitL,hitU,cfg)});
 }
 return {good,omitted,until};
}
function ridgePredict(gram,cross,x){
 // Inputs use variance in percent squared to condition 0DTE and session units.
 const h=gram.map((row,i)=>row.map((v,j)=>v+(i===j&&i>0?1e-8*Math.max(gram[i][i],1):0)));
 try{const beta=Q.solveLinear(h,cross.slice());const pred=beta.reduce((s,v,i)=>s+v*x[i],0)/10000;return Number.isFinite(pred)?Math.max(1e-12,pred):null;}catch(_){return null;}
}
function har(days,until=Infinity){
 const gram=Array.from({length:4},()=>Array(4).fill(0)),cross=Array(4).fill(0),tests=[];
 const rv=days.map(d=>d.firstRV??d.rv),origin=days.map((d,i)=>d.windowOrigin??i),known=days.map((d,i)=>d.firstAvailable??i+.5);
 const features=(i,clock)=>{
  const past=rv.slice(i-22,i);
  if(past.length!==22||known.slice(i-22,i).some(t=>t>=clock))return null;
  const v=past.map(r=>r*1e4);
  return [1,v.at(-1),mean(v.slice(-5)),mean(v)];
 };
 const releases=[];for(let i=22;i<days.length;i++){
  const x=features(i,origin[i]);if(x)releases.push({available:known[i],x,y:rv[i]});
 }
 releases.sort((a,b)=>a.available-b.available);
 let trained=0,next=null,lateFeatures=0;
 for(let i=22;i<=days.length;i++){
  const clock=i===days.length?until:origin[i];
  while(trained<releases.length&&releases[trained].available<clock){
   const {x,y}=releases[trained++];
   for(let j=0;j<4;j++){cross[j]+=x[j]*y*1e4;for(let k=0;k<4;k++)gram[j][k]+=x[j]*x[k];}
  }
  const x=features(i,clock);
  if(!x){if(i<days.length)lateFeatures++;continue;}
  const pred=trained>=30?ridgePredict(gram,cross,x):null;
  if(i===days.length){next=pred;break;}
  const actual=rv[i],b=x[3]/1e4;
  if(pred!==null&&b>0&&actual>0){const loss=v=>actual/v-Math.log(actual/v)-1;tests.push({day:days[i].day,actual,pred,baseline:b,quasiLoss:loss(pred),baseQuasiLoss:loss(b)});}
 }
 return {trained,next,tests,lateFeatures,vintage:'Prima pubblicazione osservata di ciascuna barra; dati disponibili prima dell’origine.'};
}

function summarize(s){
 const a=s.good,n=a.length;if(!n)return null;
 const freq=f=>a.filter(f).length/n,up=freq(k=>k.first==='upper'),lo=freq(k=>k.first==='lower'),amb=freq(k=>k.first==='ambiguous'),none=freq(k=>k.first==='timeout');
 const sig=Object.fromEntries(Object.keys(a[0].signature).map(k=>[k,mean(a.map(x=>x.signature[k]))]));
 return {n,path:pathStats(a),pDown:freq(k=>k.ret<0),pFlat:freq(k=>k.ret===0),expectedReturn:mean(a.map(k=>Math.expm1(k.ret))),firstU:[up,up+amb],firstL:[lo,lo+amb],amb,none,touchU:freq(k=>k.hitU!==null),touchL:freq(k=>k.hitL!==null),closeU:freq(k=>k.endHigh),closeL:freq(k=>k.endLow),retQ:[.05,.25,.5,.75,.95].map(p=>quant(a.map(k=>k.ret),p)),pUp:freq(k=>k.ret>0),mfe:quant(a.map(k=>k.mfe),.5),mae:quant(a.map(k=>k.mae),.5),rv:mean(a.map(k=>k.rv)),bv:mean(a.map(k=>k.bv)),jump:mean(a.map(k=>k.jump)),upVar:mean(a.map(k=>k.up)),downVar:mean(a.map(k=>k.down)),rq:mean(a.map(k=>k.rq)),signature:sig,har:har(a,s.until)};
}
root.TimeResearchCore= {plan,schedule,forDate,archive,archiveLaw,scores,labels,evaluate,readBars,windowData,summarize,har};
})(typeof globalThis==='object'?globalThis:this);
