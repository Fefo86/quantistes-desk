/* QUANTISTES DYNAMIC PHYSICAL PROBABILITY · TIME-OF-DAY MODEL */
(function(root){
'use strict';
const $=id=>document.getElementById(id),F=Number.isFinite;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const fmt=(v,n=2)=>F(v)?Number(v).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pct=(v,n=1)=>F(v)?fmt(100*v,n)+'%':'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const state={loaded:false,raw:null,days:[],archive:[],session:null,model:null,rows:[],q:null,selected:null,sort:'K',sortDesc:false,pin:10,react:12,reactWindow:30,prefix:null,
 scene:'auto',lastNativeKey:'',lastSignature:'',computing:false,ready:false,active:false,renderToken:0,latestAudit:[],modelSessionHash:null};
function status(str,tone='info'){const el=$('dxStatus');if(el){el.textContent=str;el.dataset.tone=tone}}
function setState(text){const e=$('dxState');if(e)e.textContent=text}
async function unzipBase64(s){if(typeof DecompressionStream==='undefined')throw Error('DecompressionStream non disponibile: usa Chrome/Edge aggiornato.');const bin=atob(s.trim()),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return JSON.parse(await new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip'))).text())}
function parseCSV(text){
 const head=text.split(/\r?\n/,1)[0],sep=[',',';','\t'].sort((a,b)=>head.split(b).length-head.split(a).length)[0];
 const lines=[];let buf='',arr=[],quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){buf+='"';i++}else quoted=!quoted;}
  else if(!quoted&&c===sep){arr.push(buf);buf=''}
  else if(!quoted&&(c==='\r'||c==='\n')){if(c==='\r'&&text[i+1]==='\n')i++;arr.push(buf);buf='';if(arr.some(x=>x.trim()))lines.push(arr);arr=[]}
  else buf+=c;
 }
 if(arr.length||buf){arr.push(buf);lines.push(arr)}
 if(lines.length<2)throw Error('CSV vuoto o senza intestazioni');
 const hdr=lines.shift().map(x=>String(x).trim().toLowerCase().replace(/[\s-]+/g,'_'));
 return lines.filter(r=>r.length===hdr.length).map(row=>{const obj={};hdr.forEach((h,i)=>obj[h]=row[i]?.trim()||'');return obj});
}
function get(row,...keys){for(const k of keys)if(row[k]!=null&&row[k]!=='')return row[k];return ''}
function num(x){if(x==null||String(x).trim()==='')return NaN;if(typeof x==='number')return x;const z=Number(String(x??'').trim().replace(',','.'));return F(z)?z:NaN}
const timeParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function etTime(x){const s=String(x??'').trim();if(!s)return null;
 if(/(?:Z|[+\-]\d\d:\d\d)$/i.test(s)||/^\d{13}$/.test(s)||/^\d{10}$/.test(s)){
  const d=/^\d{13}$/.test(s)?new Date(+s):/^\d{10}$/.test(s)?new Date(+s*1000):new Date(s);
  if(!F(d.getTime()))return null;const p=timeParts.formatToParts(d);const v=k=>p.find(z=>z.type===k)?.value||'';
  return {date:v('year')+'-'+v('month')+'-'+v('day'),time:v('hour')+':'+v('minute')+':'+v('second')};
 }
 const m=s.match(/^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d)(?::(\d\d))?/);return m?{date:m[1],time:m[2]+':'+(m[3]||'00')}:null;
}
function dateVal(x){const s=String(x??'').trim();if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);if(/^\d{8}$/.test(s))return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);return ''}
function h2min(hhmm){const p=String(hhmm).slice(0,5).split(':').map(Number);return p[0]*60+p[1]}
function med(xs){const a=xs.filter(F).sort((a,b)=>a-b);return a.length?(.5*(a[(a.length-1)>>1]+a[a.length>>1])):NaN}
function quotesFromRaw(raw){const rows=parseCSV(raw),quotes=[];
 for(const r of rows){const time=etTime(get(r,'timestamp','quote_timestamp','datetime','time','date_time'));
  const expiry=dateVal(get(r,'expiration','expiration_date','expiry','expirationdate'));
  const side=String(get(r,'right','option_type','type','call_put_flag','cp')).toUpperCase(),symbol=String(get(r,'symbol','root','underlying_symbol')||'SPXW').toUpperCase();
  const K=num(get(r,'strike','strike_price')),bid=num(get(r,'bid')),ask=num(get(r,'ask')),delta=num(get(r,'delta'));
  let iv=num(get(r,'implied_vol','iv','implied_volatility'));if(iv>3)iv/=100;
  const spot=num(get(r,'underlying_price','spot','underlying'));
  if(!time||!expiry||!['C','P','CALL','PUT'].includes(side)||symbol!=='SPXW'||!F(K)||K<=0||!F(bid)||!F(ask)||ask<bid||bid<0)continue;
  quotes.push({time,expiry,side:side[0]==='C'?'CALL':'PUT',K,bid,ask,delta,iv,spot,gamma:num(get(r,'gamma')),charm:num(get(r,'charm')),vanna:num(get(r,'vanna'))});
 }
 if(quotes.length<30)throw Error('Chain non supportata: servono quote SPXW con strike, scadenza, timestamp, bid/ask');
 const byExp=new Map();for(const q of quotes){const a=byExp.get(q.expiry)||[];a.push(q);byExp.set(q.expiry,a)}
 const exp=[...byExp.keys()].sort((a,b)=>byExp.get(b).length-byExp.get(a).length)[0];
 const contract=byExp.get(exp);const dates=[...new Set(contract.map(q=>q.time.date))];if(dates.length!==1)throw Error('CSV con date multiple: importa un singolo snapshot');
 const allTime=contract.map(q=>h2min(q.time.time)*60+Number(q.time.time.slice(6,8))).sort((a,b)=>a-b);
 const sec=allTime[Math.floor((allTime.length-1)*.98)];const hh=Math.floor(sec/3600),mm=Math.floor((sec%3600)/60),ss=sec%60;
 const cutoff=[hh,mm,ss].map(v=>String(v).padStart(2,'0')).join(':');
 const near=contract.filter(q=>{const t=h2min(q.time.time)*60+Number(q.time.time.slice(6,8));return t<=sec&&t>=sec-300});
 if(near.length<25)throw Error('Quotazioni fresche insufficienti presso il cutoff '+cutoff+' ET');
 const by=new Map();for(const q of near){const cur=by.get(q.K)||{K:q.K};const prev=cur[q.side];if(!prev||q.time.time>prev.time.time)cur[q.side]=q;by.set(q.K,cur)}
 const spot=med(near.map(q=>q.spot));if(!(spot>0))throw Error('Spot SPX mancante o non valido');
 const strikes=[...by.keys()].sort((a,b)=>a-b);
 if(strikes.length<15)throw Error('Strike distinti insufficienti ('+strikes.length+')');
 const pairs=[...by.values()].filter(o=>o.CALL&&o.PUT&&o.CALL.ask>o.CALL.bid&&o.PUT.ask>o.PUT.bid);
 let atmIV=NaN,rs25=NaN,rs10=NaN,sigma=NaN,feature=null;
 if(pairs.length>=8){const atm=pairs.reduce((a,b)=>Math.abs(a.K-spot)<Math.abs(b.K-spot)?a:b);
  atmIV=(atm.CALL.iv+atm.PUT.iv)/2;sigma=((atm.CALL.bid+atm.CALL.ask+atm.PUT.bid+atm.PUT.ask)*.5)*Math.sqrt(Math.PI/2);
  const wing=(side,d)=>{const xs=near.filter(q=>q.side===side&&F(q.iv)&&q.iv>0&&q.iv<3&&F(q.delta)&&Math.abs(q.delta)>.005&&(side==='PUT'?q.K<spot:q.K>spot));return xs.length?xs.reduce((a,b)=>Math.abs(Math.abs(a.delta)-d)<Math.abs(Math.abs(b.delta)-d)?a:b):null};
  const p25=wing('PUT',.25),c25=wing('CALL',.25),p10=wing('PUT',.10),c10=wing('CALL',.10);
  if(atmIV>.025&&atmIV<3&&sigma>0&&p25&&c25&&p10&&c10){rs25=(p25.iv-c25.iv)/atmIV;rs10=(p10.iv-c10.iv)/atmIV;
   feature={date:dates[0],spot_quote:spot,quote_atm_K:atm.K,iv_atm:atmIV,q_sigma_pts:sigma,q_sigma_pct:sigma/spot,rr25:rs25,rr10:rs10,
    strikes,quotes:strikes.map(K=>{const a=by.get(K);return [K,a.CALL?.bid||0,a.CALL?.ask||0,a.PUT?.bid||0,a.PUT?.ask||0]}),hasOutcome:false,source:'SPXW ETA snapshot'};
  }
 }
 const normalized=['symbol,expiration,strike,right,timestamp,bid,ask,delta,gamma,charm,vanna,implied_vol,underlying_price'];
 for(const q of near)normalized.push(['SPXW',q.expiry,q.K,q.side,q.time.date+'T'+q.time.time,q.bid,q.ask,F(q.delta)?q.delta:'',F(q.gamma)?q.gamma:'',F(q.charm)?q.charm:'',F(q.vanna)?q.vanna:'',F(q.iv)?q.iv:'',F(q.spot)?q.spot:''].join(','));
 return {date:dates[0],cutoff,expiry:exp,spot,quotes:near,strikes,by,feature,pairs:pairs.length,rawCount:rows.length,nearCount:near.length,normalized:normalized.join('\n')};
}
function dayCutoff(session){const t=h2min(session.cutoff)-585+(Number(session.cutoff.slice(6,8))>0?1:0);return F(t)?t:-1}
function sourceBefore(date){return state.days.filter(d=>d.d<date).sort((a,b)=>a.d.localeCompare(b.d))}
function convertDay(day,t){const l=day.l,h=day.h,c=day.c,H=375-t,base=t===0?0:c[t-1],den=100000+base;const low=new Float32Array(H),high=new Float32Array(H),close=new Float32Array(H);
 for(let j=0;j<H;j++){low[j]=(l[j+t]-base)/den;high[j]=(h[j+t]-base)/den;close[j]=(c[j+t]-base)/den;}
 return {d:day.d,l:low,h:high,c:close};
}
function extractPrefixFromPath(bars,t,spot){if(!Array.isArray(bars)||t<15)return null;const prefix=bars.filter(b=>b.minute>=0&&b.minute<t).sort((a,b)=>a.minute-b.minute);
 if(prefix.length!==t||prefix.some((x,i)=>x.minute!==i||![x.open,x.high,x.low,x.close].every(F)))return null;
 const anchor=prefix[0].open;if(!(anchor>0))return null;
 const last=prefix.at(-1).close;if(Math.abs(last-spot)>Math.max(spot*.0025,5))return null;
 let high=anchor,low=anchor;
 for(const b of prefix){high=Math.max(high,b.high);low=Math.min(low,b.low)}
 return [(spot/anchor-1),(high/anchor-1),(low/anchor-1)];
}
function featDay(day,t){const factor=100000,at=Math.max(0,t-1),h=day.h,l=day.l,c=day.c;
 let max=0,min=0;for(let j=0;j<t;j++){max=Math.max(max,h[j]);min=Math.min(min,l[j])}
 return [c[at]/factor,max/factor,min/factor];
}
function makeModel(session){const t=dayCutoff(session),base={date:session.date,cutoff:session.cutoff,expiry:session.expiry,t,spot:session.spot,H:375-t,kind:'BLOCKED',reason:'',monitorStart:t+585,n:0,ESS:0};
 const fixing=root.DeskCalendar10?.fixing?.(session.date);
 if(fixing?.verified&&(!fixing.isSession||fixing.early))return {...base,reason:fixing.early?'Chiusura anticipata alle 13:00 ET. Il modello storico fino alle 16:00 è sospeso.':'Calendario SPX chiuso per la data selezionata.'};
 if(t<0||h2min(session.cutoff)<585){return {...base,reason:'Premarket: nessuna distribuzione SPX cash verificata prima delle 09:45 ET. Q disponibile se la chain è valida.'};}
 if(t>=375){return {...base,reason:'La sessione SPX cash delle 09:45–16:00 ET è terminata; la P intraday residua non è applicabile.'};}
 let prior=sourceBefore(session.date);if(prior.length<70)return {...base,reason:'Campione storico anteriore alla data selezionata insufficiente: '+prior.length+' sedute'};
 const mode=$('dxMode')?.value||'auto';
 if(t===0&&session.cutoff==='09:45:00'&&mode==='auto'&&session.expiry===session.date&&session.feature&&root.QuantistesDailyBridge?.ready?.()){
  try{
   const bridge=root.QuantistesDailyBridge;
   const exist=bridge.getSnapshot(session.date);
   if(exist&&Math.abs(exist.spot-session.spot)>Math.max(2,session.spot*.001))throw Error('Snapshot archivio P09 dello stesso giorno non allineato alla chain corrente');
   if(!exist&&session.date>'2026-11-16')bridge.ingestSnapshot(session.feature);
   else bridge.select(session.date);
   const ens=bridge.getEnsemble?.();
   if(ens&&ens.date===session.date&&ens.records.length>=75){const scale=ens.sigma/session.spot;
    const rec=ens.records.map(r=>({d:r.d||'2026 options',l:Float32Array.from(r.l,x=>x*scale),h:Float32Array.from(r.h,x=>x*scale),c:Float32Array.from(r.c,x=>x*scale)}));
    const m={...base,kind:'P09_OPTION',H:375,records:rec,weights:Float64Array.from(ens.weights),n:rec.length,ESS:ens.ESS,modeLabel:ens.mode==='pool'?'P 09:45 · storico equiponderato, scala straddle':'P 09:45 · kernel di chain',trainedThrough:ens.trainedThrough,calibration:'OOS 145 · edge non validato'};
    attachExtremes(m);return m;
   }
  }catch(err){console.warn('P09 feature',err?.message||err)}
 }
 const raw=prior.map(d=>convertDay(d,t));const n=raw.length;let weights=new Float64Array(n).fill(1/n),kind='P_TIME',note='Distribuzione storica pooled per orario; non condizionata alla skew corrente.';
 const prefix=(Number(session.cutoff.slice(6,8)||0)===0&&mode!=='pool'&&t>=15&&state.prefix?.date===session.date)?extractPrefixFromPath(state.prefix.bars,t,session.spot):null;
 if(prefix){const f=prior.map(d=>featDay(d,t)),scale=[0,1,2].map(i=>{const mean=f.reduce((a,x)=>a+x[i],0)/n;return Math.max(.0004,Math.sqrt(f.reduce((a,x)=>a+(x[i]-mean)**2,0)/n))});
  const kernel=f.map(x=>{const z0=(x[0]-prefix[0])/scale[0],z1=(x[1]-prefix[1])/scale[1],z2=(x[2]-prefix[2])/scale[2];return Math.exp(-.5*Math.min(300,z0*z0+.25*z1*z1+.25*z2*z2))});
  const total=kernel.reduce((a,b)=>a+b,0);
  if(total>1e-12){for(let i=0;i<n;i++)weights[i]=.65/n+.35*kernel[i]/total;
   const ess=1/weights.reduce((a,w)=>a+w*w,0);
   if(ess>=60){kind='P_PREFIX';note='P condizionata a movimento/range SPX osservati fino al cutoff, con shrinkage storico 65/35.';}
   else weights.fill(1/n);
  }
 }else if(mode==='prefix')note='Percorso SPX precedente al cutoff non importato o non allineato: utilizzata P TIME pooled.';
 const sum=weights.reduce((a,b)=>a+b,0);if(Math.abs(sum-1)>1e-9)weights=Float64Array.from(weights,x=>x/sum);
 const ESS=1/weights.reduce((a,b)=>a+b*b,0);
 const m={...base,kind,n,H:375-t,records:raw,weights,ESS,modeLabel:(kind==='P_PREFIX'?'P PATH · prefisso osservato':'P TIME · storico per orario')+(Number(session.cutoff.slice(6,8))>0?' · dal minuto successivo, frazione iniziale esclusa':''),trainedThrough:prior.at(-1).d,note,calibration:'Walk-forward OOS 2026 · probability baseline'};
 attachExtremes(m);return m;
}
function attachExtremes(m){for(const r of m.records){const H=m.H,up=new Float32Array(H),dn=new Float32Array(H);let hi=-Infinity,lo=Infinity;
 for(let i=0;i<H;i++){hi=Math.max(hi,r.h[i]);lo=Math.min(lo,r.l[i]);up[i]=hi;dn[i]=lo;}
 r.up=up;r.dn=dn;r.terminal=r.c[H-1];
 }m.min=Math.min(...m.records.map(r=>r.dn[m.H-1]));m.max=Math.max(...m.records.map(r=>r.up[m.H-1]));}
function nearest(data,spot){return data.reduce((a,b)=>Math.abs(a-spot)<=Math.abs(b-spot)?a:b)}
function terminal(m,K){if(!m||m.kind==='BLOCKED')return null;const z=K/m.spot-1;let p=0;for(let i=0;i<m.n;i++)if(m.records[i].terminal>z)p+=m.weights[i];return p}
function touch(m,K,steps=m.H){if(!m||m.kind==='BLOCKED')return null;const z=K/m.spot-1;if(K===m.spot)return 1;if(steps<=0)return 0;const t=Math.max(1,Math.min(m.H,steps))-1,up=z>=0;let p=0;
 for(let i=0;i<m.n;i++){const r=m.records[i];if(up?r.up[t]>=z:r.dn[t]<=z)p+=m.weights[i]}return p;
}
function firstHit(r,z){if(Math.abs(z)<1e-9)return 0;const arr=z>=0?r.up:r.dn,H=arr.length;
 if(z>=0?arr[H-1]<z:arr[H-1]>z)return -1;
 let lo=0,hi=H-1;while(lo<hi){const mid=(lo+hi)>>1;if(z>=0?arr[mid]>=z:arr[mid]<=z)hi=mid;else lo=mid+1}return lo;
}
function physicalEvent(m,K,{details=true}={}){if(!m||m.kind==='BLOCKED')return null;
 const z=K/m.spot-1,up=z>=0,pin=state.pin,buffer=state.react/m.spot,reactWindow=state.reactWindow;
 let hitCount=0,close=0,hit=0,pinProb=0,hitW2=0,rev=0,brk=0,amb=0,none=0;
 for(let i=0;i<m.n;i++){const r=m.records[i],w=m.weights[i],last=r.terminal;if(last>z)close+=w;if(Math.abs((last-z)*m.spot)<=pin)pinProb+=w;
  const j=firstHit(r,z);if(j<0)continue;
  hitCount++;hit+=w;hitW2+=w*w;
  if(!details)continue;
  let event=0;
  for(let step=Math.abs(z)<1e-9?0:j+1;step<Math.min(m.H,Math.abs(z)<1e-9?reactWindow:j+reactWindow+1);step++){
   const reversed=up?r.l[step]<=z-buffer:r.h[step]>=z+buffer;
   const broken=up?r.h[step]>=z+buffer:r.l[step]<=z-buffer;
   if(reversed&&broken){event=3;break}if(reversed){event=1;break}if(broken){event=2;break}
  }
  if(event===1)rev+=w;else if(event===2)brk+=w;else if(event===3)amb+=w;else none+=w;
 }
 const hitESS=hitW2>0?hit*hit/hitW2:0,valid=hitESS>=30;
 return {K,distance:K-m.spot,pAbove:close,pTouch:hit,pPin:pinProb,hitESS,hitMass:hit,hitCount,
  pReversal:valid&&details?rev/hit:null,pBreakout:valid&&details?brk/hit:null,pAmbiguous:valid&&details?amb/hit:null,pNeutral:valid&&details?none/hit:null,
  condValid:valid};
}
function levelRows(m,s){const q=liveQ(s),ret=[];
 for(const K of s.strikes){const a=physicalEvent(m,K,{details:true});if(!a)continue;a.qAbove=q?.survival?.(K)??null;ret.push(a)}
 return ret.sort((a,b)=>a.K-b.K);
}
function liveQ(s=state.session){const d=root.Desk,model=d?.state?.result?.ws?.model,cfg=d?.state?.result?.cfg;
 if(!d||d.state.stale||!model||!s||!cfg)return null;
 const matchDate=String(cfg.asof||'').slice(0,10)===s.date,matchTime=String(cfg.asof||'').slice(11,16)===s.cutoff.slice(0,5),exp=String(cfg.expiry||'').slice(0,10);
 if(Number(s.cutoff.slice(6,8))>0)return null;const qms=Number(root.QuantCore?.nyEpoch(cfg.asof)),pms=Number(root.QuantCore?.nyEpoch(s.date+'T'+s.cutoff));if(!Number.isFinite(qms)||qms!==pms||!d.state.result?.ws?.qAudit?.passed||!matchDate||!matchTime||exp!==s.date||s.expiry!==s.date||!String(cfg.target||'').startsWith(s.date+'T16:00'))return null;
 return model;
}
function levels(){const r=root.Desk?.state?.result;
 if(!liveQ()||!r)return [];
 return [...(r.ippo?.levels||[]),...(r.ws?.levels||[])].filter(x=>F(Number(x.price))).map(x=>({price:Number(x.price),family:x.family||'CVI',name:x.name||x.z||x.family||'L'})).sort((a,b)=>a.price-b.price);
}
function pairEvents(m,target,stop){if(!m||m.kind==='BLOCKED')return null;
 const a={target:0,stop:0,both:0,none:0};if(target===m.spot||stop===m.spot){a[target===m.spot&&stop===m.spot?'both':target===m.spot?'target':'stop']=1;return a;}const zT=target/m.spot-1,zS=stop/m.spot-1;
 for(let i=0;i<m.n;i++){const r=m.records[i],w=m.weights[i],t=firstHit(r,zT),s=firstHit(r,zS);
  if(t<0&&s<0)a.none+=w;else if(t>=0&&(s<0||t<s))a.target+=w;else if(s>=0&&(t<0||s<t))a.stop+=w;else a.both+=w;
 }
 return a;
}
function modelAudit(m){if(!m||m.kind==='BLOCKED')return [{name:'AVAILABLE',pass:false}];const sum=m.weights.reduce((a,b)=>a+b,0);
 const r=state.rows;
 return [{name:'NO_LOOKAHEAD',pass:m.records.every(x=>x.d==='2026 options'||x.d<m.date)},
  {name:'WEIGHTS_NORMALIZED',pass:Math.abs(sum-1)<1e-7},{name:'ESS_VALID',pass:m.ESS>0&&m.ESS<=m.n+1e-5},
  {name:'HORIZON_MATCH',pass:m.H===375-m.t},{name:'STRIKE_COMPLETE',pass:r.length===state.session.strikes.length},
  {name:'TOUCH_GE_CLOSE_BEYOND',pass:r.every(a=>a.pTouch+1e-7>= (a.K>=m.spot?a.pAbove:1-a.pAbove))},
  {name:'EVENT_PARTITION',pass:r.every(a=>a.pReversal===null||Math.abs(a.pReversal+a.pBreakout+a.pAmbiguous+a.pNeutral-1)<1e-6)}];
}
root.QuantistesDynamicCore={state,fmt,pct,esc,clamp,parseCSV,etTime,quotesFromRaw,makeModel,terminal,touch,physicalEvent,firstHit,levels,liveQ,levelRows,pairEvents,modelAudit,dayCutoff,sourceBefore,nearest,extractPrefixFromPath,status,setState,unzipBase64};
})(window);
