/* CVI input contract: observed quotes, ACT/365F, European forward Black. */
(function(root){
'use strict';
const DAY=86400000, SQ2PI=Math.sqrt(2*Math.PI),finite=Number.isFinite;
const defaults={maxAge:300,maxPairGap:30,minBid:0.05,maxSpread:1,rate:0,fixing:'16:00',huber:1.5};
const et=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const localCache=new Map();
function timeET(ms){
 if(!finite(ms))return '';
 const p=Object.fromEntries(et.formatToParts(ms).map(a=>[a.type,a.value]));
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'.'+String(((ms%1000)+1000)%1000).padStart(3,'0');
}
function normalizeDate(raw){
 const s=String(raw??'').trim(),m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);if(!m)return '';
 const iso=m[1]+'-'+m[2]+'-'+m[3],v=Date.parse(iso+'T00:00:00Z');return finite(v)&&new Date(v).toISOString().slice(0,10)===iso?iso:'';
}
function epochET(raw){
 if(typeof raw==='number')return finite(raw)?raw:NaN;
 const s=String(raw??'').trim().replace(' ','T'),match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
 if(!match||!normalizeDate(match[1])||+match[2]>23||+match[3]>59||+(match[4]||0)>59)return NaN;
 const wall=match[1]+'T'+match[2]+':'+match[3]+':'+(match[4]||'00')+'.'+(match[5]||'').slice(0,3).padEnd(3,'0');
 if(match[6])return Date.parse(wall+match[6]);
 if(localCache.has(wall))return localCache.get(wall);
 const utc=Date.parse(wall+'Z'),valid=[utc+4*3600000,utc+5*3600000].filter(t=>timeET(t)===wall);
 const value=valid.length===1?valid[0]:NaN;
 if(localCache.size>100000)localCache.clear();localCache.set(wall,value);return value;
}
function csv(text){
 const src=String(text).replace(/^\uFEFF/,'');
 const first=src.split(/[\r\n]/,1)[0],sep=first.includes(';')?';':first.includes('\t')?'\t':',';
 let all=[],row=[],value='',quoted=false;
 for(let i=0;i<src.length;i++){const c=src[i];if(c==='"'){if(quoted&&src[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
 else if(!quoted&&c===sep){row.push(value.trim());value='';}
 else if(!quoted&&(c==='\r'||c==='\n')){if(c==='\r'&&src[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))all.push(row);row=[];value='';}
 else value+=c;}
 if(quoted)throw Error('Virgolette aperte nel CSV.');row.push(value.trim());if(row.some(Boolean))all.push(row);return all;
}
function parseFiles(files){
 const rows=[],groupsMap=new Map(),info=[],issues=[];
 for(const file of files){
  const source=String(file.name||'CSV'),table=csv(file.text),header=(table.shift()||[]).map(v=>v.toLowerCase().replace(/[^a-z0-9]/g,''));
  const col=(...keys)=>keys.map(k=>header.indexOf(k)).find(v=>v>=0)??-1;
  const c={symbol:col('symbol','root','underlying'),expiry:col('expiration','expiry','expirationdate'),strike:col('strike','strikeprice','strikemilli'),side:col('right','side','optiontype'),bid:col('bid','bidprice'),ask:col('ask','askprice'),time:col('timestamp','quotetimestamp','quotedatetime','datetime','time'),date:col('date','quotedate','tradedate'),ms:col('msofday','millisecondsofday'),spot:col('underlyingprice','spot'),spotTime:col('underlyingtimestamp','spottimestamp')};
  if([c.symbol,c.expiry,c.strike,c.side].some(i=>i<0)||(c.bid<0&&c.ask<0)||(c.time<0&&(c.date<0||c.ms<0)))throw Error(source+' · sono richiesti symbol, expiration, strike, right, bid o ask e timestamp (o date + ms_of_day).');
  const sourceIndex=info.length,errors={},examples=[];let accepted=0;
  for(let j=0;j<table.length;j++){
   const r=table[j],val=k=>r[c[k]]??'',num=k=>{const s=val(k).replace(',','.');return s!==''&&finite(Number(s))?Number(s):null;};
   const symbol=val('symbol').toUpperCase(),expiry=normalizeDate(val('expiry')),strike=(num('strike')??0)/(header[c.strike]==='strikemilli'?1000:1),side=({P:'PUT',PUT:'PUT',C:'CALL',CALL:'CALL'})[val('side').toUpperCase()];
   let stamp=val('time');const day=normalizeDate(val('date')||stamp);
   if(day&&/^\d\d:\d\d/.test(stamp))stamp=day+'T'+stamp;
   else if(day&&(!stamp||normalizeDate(stamp))){const ms=num('ms');if(Number.isInteger(ms)&&ms>=0&&ms<DAY)stamp=day+'T'+new Date(ms).toISOString().slice(11,23);}
   const ms=epochET(stamp),bid=num('bid'),ask=num('ask'),problem=!symbol||!expiry||!(strike>0)||!side?'identità contratto':!finite(ms)?'timestamp assente, ambiguo o invalido':null;
   if(problem){errors[problem]=(errors[problem]||0)+1;if(examples.length<6)examples.push({row:j+2,reason:problem});continue;}
   const asof=timeET(ms),date=asof.slice(0,10),id=symbol+'|'+date;
   const badField=k=>val(k)!==''&&!/^(?:null|na|n\/a|nan)$/i.test(val(k))&&num(k)===null;
   const q={symbol,expiry,K:strike,side,bid,ask,malformed:badField('bid')||badField('ask'),ms,date,sourceIndex,row:j+2,spot:num('spot'),spotTime:finite(epochET(val('spotTime')))?epochET(val('spotTime')):null};rows.push(q);accepted++;
   if(!groupsMap.has(id))groupsMap.set(id,{id,symbol,date,timeMs:ms,asof,expiries:new Set(),rows:0});
   const g=groupsMap.get(id);g.rows++;g.expiries.add(expiry);if(ms>g.timeMs){g.timeMs=ms;g.asof=asof;}
  }
  info.push({name:source,inputRows:table.length,rows:accepted,rejected:table.length-accepted,errors,examples});
  if(table.length>accepted)issues.push(source+' · '+(table.length-accepted)+' righe escluse per identità o timestamp.');
 }
 const groups=[...groupsMap.values()].sort((a,b)=>b.timeMs-a.timeMs||a.symbol.localeCompare(b.symbol)).map(g=>({...g,expiries:[...g.expiries].sort()}));
 return {rows,groups,files:info,issues};
}
function normalPDF(x){return Math.exp(-.5*x*x)/SQ2PI;}
function mills(x){let v=0;for(let j=100;j>0;j--)v=j/(x+v);return 1/(x+v);}
function normalCDF(x){
 if(Number.isNaN(x))return NaN;if(!finite(x))return x<0?0:1;const a=Math.abs(x);if(a===0)return .5;
 let tail;if(a>=3)tail=normalPDF(a)*mills(a);else{let term=a,sum=term;for(let j=3;j<=205;j+=2){term*=a*a/j;const next=sum+term;if(next===sum)break;sum=next;}tail=.5-normalPDF(a)*sum;}
 return x<0?tail:1-tail;
}
// OTM-normalized call. For deep tails use the difference of Mills ratios
// before multiplying by the density, avoiding exp(k) times an underflowed CDF.
function otm(k,s){
 if(s===0)return 0;if(k===0){if(s<.02)return s/SQ2PI*(1-s*s/24+s**4/640-s**6/21504);return 2*normalCDF(s*.5)-1;}
 const a=k/s-s/2,b=a+s;
 if(a>=3){
  // Divided difference of the Mills continued fraction; the width remains
  // explicit even when adding it to the leading argument rounds it away.
  let u=0,v=0,d=0;for(let j=100;j>0;j--){const x=a+u,y=b+v;d=j*(1-d)/(x*y);u=j/x;v=j/y;}
  return normalPDF(a)*s*(1-d)/((a+u)*(b+v));
 }
 if(s<.5){
  const x=[.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363],
   w=[.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];let integral=0;
  for(let i=0;i<4;i++){const t1=s*(1-x[i])/2,t2=s*(1+x[i])/2;integral+=w[i]*(Math.exp(-t1*(a+t1/2))+Math.exp(-t2*(a+t2/2)));}
  return Math.max(0,normalPDF(a)*s*.5*integral-Math.expm1(k)*normalCDF(-b));
 }
 const tailB=b>=3?normalPDF(a)*mills(b):Math.exp(k)*normalCDF(-b);
 return Math.max(0,normalCDF(-a)-tailB);
}
function normalizedCall(k,w){
 if(!finite(k)||!finite(w)||w<0)return NaN;const s=Math.sqrt(w);
 return k>=0?otm(k,s):-Math.expm1(k)+Math.exp(k)*otm(-k,s);
}
function black(F,K,D,w,side='CALL'){
 if(!(F>0&&K>0&&D>0&&w>=0&&[F,K,D,w].every(finite))||!['CALL','PUT'].includes(side))return NaN;
 const k=Math.log(K/F),timeValue=D*Math.min(F,K)*otm(Math.abs(k),Math.sqrt(w));return timeValue+D*Math.max(0,side==='CALL'?F-K:K-F);
}
function implied(F,K,D,price,side='CALL'){
 if(!(F>0&&K>0&&D>0&&price>=0&&[F,K,D,price].every(finite)))return null;
 const lower=D*Math.max(0,side==='CALL'?F-K:K-F),upper=D*(side==='CALL'?F:K);
 if(price===lower)return 0;if(price<lower||price>=upper)return null;
 let a=0,b=.125;while(b<64&&black(F,K,D,b*b,side)<price)b*=2;if(black(F,K,D,b*b,side)<price)return null;
 for(let i=0;i<70;i++){let m=(a+b)/2;if(black(F,K,D,m*m,side)>=price)b=m;else a=m;}return ((a+b)/2)**2;
}
function vega(F,k,D,w,T){if(!(w>0&&T>0))return 0;const s=Math.sqrt(w);return D*F*Math.sqrt(T)*normalPDF(-k/s+s/2);}
const median=a=>{const n=a.length;if(!n)return null;const b=a.slice().sort((x,y)=>x-y);return (b[(n-1)>>1]+b[n>>1])/2;};
function marketOK(a){return !a.malformed&&(a.bid===null||a.bid>=0)&&(a.ask===null||a.ask>0)&&(a.bid!==null||a.ask!==null)&&(a.bid===null||a.ask===null||a.bid<=a.ask);}
function pairsFor(selected,cfg,D){
 const byK=new Map();for(const r of selected){if(r.bid===null||r.ask===null||r.bid<=0||!marketOK(r))continue;const item=byK.get(r.K)||{};item[r.side]=r;byK.set(r.K,item);}
 const pairs=[];let asyncPairs=0;
 for(const [k,x] of byK){if(!x.CALL||!x.PUT)continue;const c=x.CALL,p=x.PUT,gap=Math.abs(c.ms-p.ms)/1000;if(gap>cfg.maxPairGap){asyncPairs++;continue;}
 const lower=k+(c.bid-p.ask)/D,upper=k+(c.ask-p.bid)/D,width=Math.max(upper-lower,Math.max(1,k)*1e-8),sync=1/(1+(gap/Math.max(1,cfg.maxPairGap))**2);
 pairs.push({k,lo:lower,hi:upper,mid:(lower+upper)/2,scale:width/2,sync,gap});}
 if(pairs.length<3)throw Error('Forward non identificato: servono almeno tre coppie call/put bilaterali positive, fresche e sincronizzate alla stessa scadenza.');
 const medianF=median(pairs.map(p=>p.mid));let F=medianF,iterations=0;
 for(;iterations<100;iterations++){let sum=0,den=0;for(const p of pairs){const e=(p.mid-F)/p.scale,w=p.sync/(p.scale*p.scale)*Math.min(1,cfg.huber/Math.max(Math.abs(e),1e-15));sum+=w*(p.mid-F);den+=w;}
 const step=sum/den;F+=step;if(Math.abs(step)<=1e-11*Math.max(F,1))break;}
 if(!(finite(F)&&F>0))throw Error('Forward di parità non valido.');
 const lo=Math.max(...pairs.map(p=>p.lo)),hi=Math.min(...pairs.map(p=>p.hi));
 // With a market-derived discount choose an F in the intersection of ALL
 // synchronized bid/ask parity intervals. Huber IRLS alone is not guaranteed
 // to fall inside this narrow box even when a feasible forward exists.
 const projected=cfg.discountMode!=='manual'&&lo<=hi&&finite(lo)&&finite(hi);
 if(projected)F=Math.max(lo,Math.min(hi,F));
 const inside=pairs.filter(p=>p.lo-1e-9<=F&&F<=p.hi+1e-9).length;
 return {F,count:pairs.length,inside,asyncPairs,lo,hi,commonInterval:lo<=hi,mad:median(pairs.map(p=>Math.abs(p.mid-medianF))),medianF,iterations:iterations+1,converged:iterations<100,projectedToParityBox:projected,source:projected?'Huber IRLS proiettato sull’intersezione dei bid/ask di parità':'Huber IRLS su parità call/put con D fissato',details:pairs};
}

// Put-call parity identifies the discount factor from the slope of C-P(K)
// versus strike, provided synchronized two-sided quotes span enough strikes.
// ALL bid/ask boxes are used (not just mids): no assumed risk-free rate is
// silently substituted when market parity is incompatible with the interval.
function discountFromParity(selected,cfg,T,Dinput){
 const mode=cfg.discountMode||'manual';
 const base={D:Dinput,mode:'manual',source:'Tasso impostato: D = exp(-rT)',pairs:0,reason:null};
 if(mode==='manual'||mode==='auto'&&T<3/365)return base;
 const paired=new Map();
 for(const p of selected){if(!marketOK(p)||!(p.bid>0&&p.ask>0))continue;
  const a=paired.get(p.K)||{};a[p.side]=p;paired.set(p.K,a);}
 const rows=[];
 for(const [K,z] of paired){const c=z.CALL,put=z.PUT;if(!c||!put)continue;
  const gap=Math.abs(c.ms-put.ms)/1000;if(gap>cfg.maxPairGap)continue;
  rows.push({K,lo:c.bid-put.ask,hi:c.ask-put.bid,mid:(c.bid+c.ask-put.bid-put.ask)/2,age:gap});
 }
 const strikeRange=rows.length?Math.max(...rows.map(p=>p.K))-Math.min(...rows.map(p=>p.K)):0;
 if(rows.length<6||strikeRange<Math.max(30,0.006*(rows.length?median(rows.map(p=>p.K)):0))){
  const reason='Parità insufficientemente informativa: '+rows.length+' coppie, intervallo strike '+strikeRange.toFixed(1)+' punti.';
  if(mode==='implied')throw Error(reason);
  return {...base,mode:'auto-manual',source:'Fallback esplicito al tasso impostato',pairs:rows.length,reason};
 }
 let low=Math.exp(-.35*T),high=Math.exp(.15*T),witness=null;
 for(let i=0;i<rows.length;i++)for(let j=0;j<rows.length;j++){
  const a=rows[i],b=rows[j],diff=a.K-b.K;
  if(Math.abs(diff)<1e-12){if(a.lo>b.hi+1e-9)witness={a:a.K,b:b.K,reason:'Call-put interval crossed'};continue;}
  const bound=(b.hi-a.lo)/diff;
  if(diff>0){if(bound<high){high=bound;witness={a:a.K,b:b.K,limiting:'upper',bound};}}
  else if(bound>low){low=bound;witness={a:a.K,b:b.K,limiting:'lower',bound};}
 }
 if(!(low>0&&high>0&&low<=high+1e-9)){
  const reason='I bid/ask di parità non consentono un unico fattore D positivo nell’intervallo di tassi dichiarato. D minimo '+low.toFixed(8)+'; massimo '+high.toFixed(8)+'.';
  if(mode==='implied')throw Error(reason);
  return {...base,mode:'auto-manual',source:'Fallback al tasso impostato, INCOERENZA segnalata',pairs:rows.length,reason,witness};
 }
 // Robust mid-quote slope: median of pairwise parity slopes over
 // materially distinct strikes. This is a point ESTIMATE, not identified
 // uniquely by the bid/ask intervals. The hard market-box projection is
 // what makes the resulting D admissible, independent of mid noise.
 const slopes=[];const minSpan=Math.max(30,.006*median(rows.map(p=>p.K)));
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const dk=rows[j].K-rows[i].K;
  if(Math.abs(dk)>=minSpan)slopes.push((rows[i].mid-rows[j].mid)/dk);
 }
 const Dmid=median(slopes);
 const target=finite(Dmid)&&Dmid>0?Dmid:Dinput;
 const D=Math.min(high,Math.max(low,target));
 const l=Math.max(...rows.map(p=>p.lo+D*p.K)),h=Math.min(...rows.map(p=>p.hi+D*p.K));
 if(l>h+1e-6){const reason='Intersezione di parità instabile per arrotondamento nel fattore di sconto.';if(mode==='implied')throw Error(reason);return {...base,mode:'auto-manual',reason,pairs:rows.length};}
 return {D,mode:'market-implied',source:'Stima robusta della pendenza dei mid di parità, proiettata sull’intersezione dei bid/ask',pairs:rows.length,
  discountRange:[low,high],midSlopeEstimate:Dmid,midSlopeSamples:slopes.length,inputDiscount:Dinput,
  impliedRate:-Math.log(D)/T,impliedRateRange:[-Math.log(high)/T,-Math.log(low)/T],
  interceptRange:[l,h],forwardRange:[l/D,h/D],witness,reason:null};
}
function buildSlice(dataset,groupId,expiry,options={}){
 const cfg={...defaults,...options};const g=typeof groupId==='string'?dataset.groups.find(o=>o.id===groupId):groupId;
 if(!g||!g.expiries.includes(expiry))throw Error('Gruppo storico o scadenza assente.');
 for(const f of ['maxAge','maxPairGap','minBid','maxSpread','rate','huber'])if(!finite(cfg[f]))throw Error('Parametro non finito: '+f+'.');
 if(!(cfg.maxAge>0&&cfg.maxPairGap>=0&&cfg.minBid>=0&&cfg.maxSpread>0&&cfg.huber>0))throw Error('Parametri dei filtri fuori dominio.');
 const t=epochET(cfg.asof??g.timeMs),asof=timeET(t),fixMs=epochET(expiry+'T'+cfg.fixing);
 if(!finite(t)||asof.slice(0,10)!==g.date)throw Error('L’as-of deve appartenere alla giornata ET selezionata.');
 if(!(fixMs>t))throw Error('Fixing non valido o già trascorso allo snapshot.');
 const T=(fixMs-t)/(365*DAY),Dinput=Math.exp(-cfg.rate*T);if(!finite(Dinput)||Dinput<=0)throw Error('Fattore di sconto non valido.');
 const counts={raw:0,future:0,duplicates:0,conflicts:0,stale:0,invalid:0,itm:0,wide:0,empty:0,boundary:0,accepted:0,twoSided:0,askOnly:0,bidOnly:0};
 const latest=new Map(),conflicts=new Set();
 for(const r of dataset.rows){if(r.symbol!==g.symbol||r.date!==g.date||r.expiry!==expiry)continue;counts.raw++;if(r.ms>t){counts.future++;continue;}const key=r.side+'|'+r.K,old=latest.get(key);
 if(old){counts.duplicates++;if(old.ms>r.ms)continue;if(old.ms===r.ms){if(old.malformed!==r.malformed||old.bid!==r.bid||old.ask!==r.ask)conflicts.add(key);continue;}}
 conflicts.delete(key);latest.set(key,r);}
 counts.conflicts=conflicts.size;
 if(conflicts.size)throw Error('Quote discordanti alla stessa ora per '+[...conflicts].slice(0,4).join(', ')+'.');
 const selected=[];for(const r of latest.values()){if(t-r.ms>cfg.maxAge*1000){counts.stale++;continue;}if(!marketOK(r)){counts.invalid++;continue;}selected.push(r);}
 const discount=discountFromParity(selected,cfg,T,Dinput),D=discount.D,pa=pairsFor(selected,cfg,D),F=pa.F,points=[],excluded=[];
 for(const r of selected){const {K,side,bid,ask}=r,k=Math.log(K/F);
 if(side!==(K<F?'PUT':'CALL')){counts.itm++;continue;}
 const usableBid=bid!==null&&bid>0&&bid>=cfg.minBid,usableAsk=ask!==null&&ask>0;
 if(!usableBid&&!usableAsk){counts.empty++;continue;}
 const midRaw=usableBid&&usableAsk?(bid+ask)/2:null;
 if(midRaw!==null&&(ask-bid)/Math.max(midRaw,1e-12)>cfg.maxSpread){counts.wide++;excluded.push({K,side,reason:'spread relativo',bid,ask});continue;}
 const wBid=usableBid?implied(F,K,D,bid,side):null,wAsk=usableAsk?implied(F,K,D,ask,side):null,wMid=midRaw!==null?implied(F,K,D,midRaw,side):null;
 if((usableBid&&!(wBid>0))||(usableAsk&&!(wAsk>0))||(midRaw!==null&&!(wMid>0))){counts.boundary++;excluded.push({K,side,reason:'prezzo fuori dominio Black',bid,ask});continue;}
 const kind=midRaw!==null?'MID':usableAsk?'ASK':'BID',v=wMid??wAsk??wBid;
 counts[kind==='MID'?'twoSided':kind==='ASK'?'askOnly':'bidOnly']++;
 points.push({K,k,side,bid,ask,mid:midRaw,wBid,wAsk,wMid,vega:vega(F,k,D,v,T),vegaBid:vega(F,k,D,wBid,T),vegaAsk:vega(F,k,D,wAsk,T),kind,age:(t-r.ms)/1000,ms:r.ms,source:dataset.files[r.sourceIndex].name,row:r.row});
 }
 points.sort((a,b)=>a.K-b.K);counts.accepted=points.length;
 const bil=points.filter(p=>p.wMid>0),left=bil.filter(p=>p.k<0).at(-1),right=bil.find(p=>p.k>=0);
 if(bil.length<6||!left||!right)throw Error('Supporto ATM insufficiente: minime sei OTM bilaterali con strike da entrambi i lati del forward.');
 const atmW=(left.wMid*right.k-right.wMid*left.k)/(right.k-left.k),anchor=Math.sqrt(atmW/T);if(!(anchor>0&&finite(anchor)))throw Error('Anchor ATM non identificabile.');
 return {symbol:g.symbol,asof,timeMs:t,expiry,fixMs,fixing:cfg.fixing,T,F,D,rate:discount.mode==='market-implied'?discount.impliedRate:cfg.rate,anchor,points,audit:{...counts,parity:pa,discount,leftATM:left.K,rightATM:right.K,anchorMethod:'Interpolazione locale in k della varianza mid ai due strike OTM che racchiudono F',config:cfg,excluded,earliest:Math.min(...points.map(p=>p.ms)),latest:Math.max(...points.map(p=>p.ms))}};
}
root.CVIData={csv,parseFiles,buildSlice,black,normalizedCall,implied,normalPDF,normalCDF,vega,epochET,timeET,defaults};
})(globalThis);
