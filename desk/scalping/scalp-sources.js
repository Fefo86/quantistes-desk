
(function(w){
'use strict';
const finite=Number.isFinite,greeks=['delta','gamma','charm','vanna','speed','color'];
const unit={delta:'ES equivalenti',gamma:'ES / punto SPX',charm:'ES / minuto',vanna:'ES / punto vol',speed:'ES / punto SPX²',color:'ES / punto SPX / minuto'};
const norm=s=>String(s||'').trim().toLowerCase().normalize('NFKC').replace(/\s+/g,'').replace(/equivalenti|equivalents/g,'eq').replace(/punti/g,'punto').replace(/minuto/g,'min');
const aliases={delta:['ES','ES eq','ES_DELTA_EQUIVALENT'],gamma:['ES / punto SPX','ES / SPX pt','ES_PER_SPX_POINT'],charm:['ES / min','ES_PER_MINUTE'],vanna:['ES / punto vol','ES / vol pt','ES_PER_VOL_POINT'],speed:['ES / punto SPX²','ES_PER_SPX_POINT2'],color:['ES / punto SPX / min','ES_PER_SPX_POINT_PER_MINUTE']};
const rawUSD={delta:['USD','USD delta','USD delta notional'],gamma:['USD/1% SPX','USD / 1% spot'],vanna:['USD delta / pt vol','USD delta / punto vol'],charm:['USD delta / min']};
function factor(name,raw,spot){
 const u=norm(raw);if(!u)return null;
 if([unit[name],...(aliases[name]||[])].some(x=>norm(x)===u))return 1;
 // One ES futures contract changes $50 per index point. A 1:1 local ES/SPX response is assumed.
 if(spot>0&&(rawUSD[name]||[]).some(x=>norm(x)===u))return name==='gamma'?1/(.01*50*spot*spot):1/(50*spot);
 return null;
}
const party=p=>['dealer','customer','aggressor'].includes(p)?p:'unspecified';
const stringKey=(...z)=>JSON.stringify(z);
const addEvent=()=>w.dispatchEvent(new CustomEvent('desk:scalp-sources'));
function dateET(t){return w.DeskMeasures?.clock?.(new Date(t).toISOString())?.date||new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);}
function basePack(id,suffix,p){
 return {id,source:p.source,optionClass:p.optionClass||null,lastTradeAt:finite(p.lastTradeAt)?p.lastTradeAt:null,pmSettled:p.pmSettled??(p.optionClass==='SPXW'?true:null),kind:p.kind,mode:p.mode||'observed',expiry:p.expiry,windowMinutes:p.windowMinutes||null,intervalMinutes:p.intervalMinutes||null,coverage:p.coverage==='full_book'?'full_book':'partial',
 perspective:party(p.perspective),timeframe:p.timeframe||null,modelPeriod:p.timeframe||null,charmClock:p.charmClock||null,comparableId:p.comparableId||null,units:p.units||{},gammaSign:p.gammaSign||null,label:[p.source,suffix,p.timeframe,p.optionClass,p.expiry].filter(Boolean).join(' · '),frames:[]};
}
function marks(ts,meta){
 const mark=w.DeskMarkets?.scalpMark?.(ts),cash=(meta?.bar?{v:meta.bar.close,ts:meta.bar.end}:null)||meta?.cash||(mark?.cash?{v:mark.cash.price,ts:mark.cash.t}:null);
 const es=meta?.es||(mark?.es?{v:mark.es.price,ts:mark.es.t}:null);
 const synced=cash&&es&&Math.abs(cash.ts-es.ts)<=30000;
 return {spot:cash?.v??null,esSpot:synced?es.v:null,spotTs:cash?.ts??null,esTs:synced?es.ts:null,esContract:synced?(meta?.esContract||mark?.es?.contract||null):null,bar:meta?.bar||(mark?.cash?.t===ts&&(!meta?.cash||meta.cash.v===mark.cash.price)?mark.cash.ohlc:null)||null,iv:null};
}
function makeFrame(pack,ts,availableAt,point){
 const factors=Object.fromEntries(greeks.map(k=>[k,factor(k,pack.units[k],point.spot)]));
 if(factors.charm!=null){if(pack.charmClock==='time_to_expiry')factors.charm*=-1;else if(pack.charmClock!=='calendar_elapsed')factors.charm=null;}
 return {ts,availableAt,...point,optionClass:pack.optionClass??null,lastTradeAt:pack.lastTradeAt,pmSettled:pack.pmSettled,source:pack.source,expiry:pack.expiry,mode:pack.mode,kind:pack.kind,timeframe:pack.timeframe,modelPeriod:pack.timeframe,charmClock:pack.charmClock,comparableId:pack.comparableId,perspective:pack.perspective,
 coverage:pack.coverage,windowMinutes:pack.windowMinutes,scope:pack.expiry===dateET(ts)?'0DTE':pack.expiry==='ALL'?'ALL':'EXPIRY',gammaSign:pack.gammaSign,units:pack.units,factors,regimeVerified:false,globalGamma:null,pressureBasis:null,rows:[]};
}
function fieldPacks(books,cut){
 const out=[];
 for(const b of books){
  const p=basePack('field:'+(b.seriesKey||b.label),({inventory:'inventario',signed_flow:'flusso '+b.windowMinutes+'m',provider_field:'campo'})[b.kind],{...b,mode:b.dataOrigin==='synthetic'||b.dataOrigin==='sample'?'sample':'observed',perspective:b.participant});
  for(const t of b.times){
   const ts=Date.parse(t),a=b.available.get(t);if(ts>cut||a>cut)continue;
   const f=makeFrame(p,ts,a,marks(ts,b.meta?.get(t)));f.convention=b.convention;
   for(const [strike,r] of b.per.get(t)){
    const z={strike,...Object.fromEntries(greeks.map(g=>[g,finite(r[g])?r[g]:null])),dp:null,cp:null,inventoryGamma:null};
    if(p.perspective==='dealer'&&b.pressureSign==='buy_positive'){
     for(const [key,field] of [['dp','delta_pressure'],['cp','charm_pressure']]){const mult=factor('delta',b.units[field],f.spot);if(mult!=null&&finite(r[field]))z[key]=r[field]*mult;}
    }
    if(z.dp!=null||z.cp!=null)f.pressureBasis='provider';
    f.rows.push(z);
   }
   f.rows.sort((a,b)=>b.strike-a.strike);p.frames.push(f);
  }
  if(p.frames.length)out.push(p);
 }
 return out;
}
function ladderPack(l,cut){
 if(!l?.signed||!Array.isArray(l.rows)||!l.rows.length)return null;
 const ts=Date.parse(l.asof),availableAt=Date.parse(l.available_at||l.asof);if(!finite(ts)||!finite(availableAt)||ts>cut||availableAt>cut)return null;
 const identified=l.provenance==='PROVIDER_OBSERVED'&&l.dealer_position_identified===true;
 const p=basePack('ladder:'+stringKey(l.source,l.expiry,l.option_class||null,l.lastTradeAt??null),'ladder', {optionClass:l.option_class||null,lastTradeAt:l.lastTradeAt,pmSettled:l.pmSettled,kind:'inventory',charmClock:'calendar_elapsed',source:l.source,mode:l.provenance==='PROVIDER_OBSERVED'?'observed':'sample',perspective:identified?'dealer':'unspecified',expiry:l.expiry,units:unit,gammaSign:identified?'dealer_long_positive':null});
 const esValue=l.spot_spx+l.es_basis,parsedES=finite(l.es_basis)&&l.spot_spx>0&&l.es_contract&&w.DeskMeasures?.onTick?.(esValue);
 const point=marks(ts,{cash:l.spot_spx>0?{v:l.spot_spx,ts}:null,es:parsedES?{v:esValue,ts}:null,esContract:parsedES?l.es_contract:null});
 const f=makeFrame(p,ts,availableAt,point);
 f.rows=l.rows.map(r=>({strike:r.strike,...Object.fromEntries(greeks.map(g=>[g,finite(r[g])?r[g]:null])),dp:null,cp:null,inventoryGamma:null})).sort((a,b)=>b.strike-a.strike);p.frames.push(f);return p;
}
const tapeUnit={...unit};
const tapeKey=e=>stringKey(e.source,e.basis,e.expiry,e.origin||'observed',e.optionClass||null,e.lastTradeAt??null);
function tapePacks(versions,cut){
 const packs=new Map(),buckets=new Map(),releases=new Map();
 for(const seq of versions){
  const known=seq.filter(v=>v.a<=cut),e=known.at(-1);if(!e)continue;
  const changes=known.filter(v=>v.action==='trade');for(const old of changes){const key=stringKey(tapeKey(old),Math.ceil(old.e/60000)*60000);releases.set(key,Math.max(releases.get(key)||0,e.a));}
  if(e.action==='cancel')continue;
  // Use completed (start, end] one-minute buckets at their actual publication time.
  const ts=Math.ceil(e.e/60000)*60000;if(ts>cut)continue;
  const id=tapeKey(e),time=stringKey(id,ts);
  if(!packs.has(id))packs.set(id,basePack('tape:'+id,'eseguiti 1m · '+e.basis,{source:e.source,optionClass:e.optionClass,lastTradeAt:e.lastTradeAt,mode:e.origin&&e.origin!=='observed'?'sample':'observed',perspective:e.basis,kind:'signed_flow',charmClock:'calendar_elapsed',expiry:e.expiry,windowMinutes:1,intervalMinutes:1,units:tapeUnit,timeframe:'intraday',gammaSign:e.basis==='dealer'?'dealer_long_positive':null}));
  if(!buckets.has(time))buckets.set(time,{id,ts,a:ts,rows:new Map(),lastTrade:-Infinity,spot:null,conflict:false});const b=buckets.get(time);b.a=Math.max(b.a,e.a);
  if(e.e>b.lastTrade){b.lastTrade=e.e;b.spot=e.spot;b.conflict=false;}else if(e.e===b.lastTrade&&b.spot!==e.spot)b.conflict=true;
  if(!b.rows.has(e.strike))b.rows.set(e.strike,{strike:e.strike,delta:0,callDelta:0,putDelta:0,gamma:0,vanna:0,charm:0,speed:0,color:0,dp:null,cp:null,inventoryGamma:null});
  const row=b.rows.get(e.strike),mult=e.side*e.quantity*e.multiplier/50;
  if(!finite(e.delta)||!['C','P'].includes(e.right)){row.callDelta=null;row.putDelta=null;}else if(row.callDelta!=null){row[e.right==='C'?'callDelta':'putDelta']+=mult*e.delta;}
  for(const [k,f] of [['delta','delta'],['gamma','gamma'],['charm','charm_delta_per_min'],['vanna','vanna_delta_per_volpt'],['speed','speed_raw'],['color','color_gamma_per_min']])row[k]=finite(row[k])&&finite(e[f])?row[k]+mult*e[f]:null;
 }
 for(const [bucket,b] of buckets){b.a=Math.max(b.a,releases.get(bucket)||0);const p=packs.get(b.id),m=marks(b.ts,null);
  if(m.spot==null&&!b.conflict&&b.spot>0){m.spot=b.spot;m.spotTs=b.lastTrade;}
  const f=makeFrame(p,b.ts,b.a,m);f.rows=[...b.rows.values()].sort((x,y)=>y.strike-x.strike);p.frames.push(f);
 }
 for(const p of packs.values())p.frames.sort((a,b)=>a.ts-b.ts);return [...packs.values()];
}
function markInventories(packs){
 const index=new Map();const key=(p,f)=>stringKey(p.mode,p.source,f.ts);
 for(const p of packs){
  if(p.kind!=='inventory'||p.perspective!=='dealer'||p.gammaSign!=='dealer_long_positive')continue;
  for(const f of p.frames){
   const k=key(p,f);if(!index.has(k))index.set(k,[]);index.get(k).push(f);
   for(const r of f.rows)r.inventoryGamma=finite(f.factors.gamma)&&finite(r.gamma)?r.gamma*f.factors.gamma:null;
  }
 }
 for(const p of packs)for(const f of p.frames){
  const candidates=(index.get(key(p,f))||[]).filter(a=>a.availableAt<=f.availableAt&&a.comparableId===f.comparableId);
  const same=candidates.filter(a=>a.expiry===f.expiry&&a.timeframe===f.timeframe&&a.optionClass===f.optionClass&&a.lastTradeAt===f.lastTradeAt&&a.pmSettled===f.pmSettled);
  if(p.kind!=='inventory'&&same.length===1){const map=new Map(same[0].rows.map(r=>[r.strike,r.inventoryGamma]));
   for(const r of f.rows)r.inventoryGamma=map.get(r.strike)??null;
  }
  const full=candidates.filter(a=>a.timeframe===f.timeframe&&(!a.optionClass||a.optionClass===f.optionClass)&&a.coverage==='full_book'&&a.expiry==='ALL'&&a.rows.length&&a.rows.every(r=>finite(r.inventoryGamma)));
  if(full.length===1){f.globalGamma=full[0].rows.reduce((s,r)=>s+r.inventoryGamma,0);f.globalGrossGamma=full[0].rows.reduce((s,r)=>s+Math.abs(r.inventoryGamma),0);f.regimeVerified=finite(f.globalGamma);f.regimeSource=full[0].source;}
 }
}
let demoPacks=null;
function buildDemo(){
 if(demoPacks)return demoPacks;
 const date='2025-11-12',start=Date.parse(date+'T10:00:00-05:00'),source='Replay sintetico SPX',family='SPX · quattro greche';
 const intraday=basePack('demo','scalping', {source,mode:'demo',optionClass:'SPXW',pmSettled:true,lastTradeAt:Date.parse(date+'T16:00:00-05:00'),kind:'signed_flow',charmClock:'calendar_elapsed',perspective:'dealer',expiry:date,timeframe:'intraday',comparableId:family,windowMinutes:5,intervalMinutes:1,units:unit,gammaSign:'dealer_long_positive'});
 const daily={...intraday,id:'demo-daily',label:source+' · modello daily · '+date,timeframe:'daily',modelPeriod:'daily',frames:[]};
 const inv=basePack('demo-inventory','inventario', {source,mode:'demo',kind:'inventory',charmClock:'calendar_elapsed',coverage:'full_book',perspective:'dealer',expiry:'ALL',intervalMinutes:1,timeframe:'intraday',comparableId:family,units:unit,gammaSign:'dealer_long_positive'});
 const snap=x=>Math.round(100*x)/100,round=x=>Math.round(x*100)/100;
const triggerPath={60:6872,61:6868.5,62:6868,73:6877,74:6876,75:6876.75};
 const path=m=>triggerPath[m]??(6870+.10*m+6.8*Math.sin(m*.083)+1.28*Math.cos(m*.34));
 for(let j=0;j<76;j++){
  const ts=start+j*60000,open=snap(path(j-1)),close=snap(path(j)),iv=18.7-.04*(close-6870)+.15*Math.sin(j*.15);
  const point={spot:close,spotTs:ts,esSpot:Math.round((close+26.75)*4)/4,esTs:ts,esContract:'ESZ25',iv,bar:{open,high:snap(Math.max(open,close)+.36+.25*Math.abs(Math.sin(j))),low:snap(Math.min(open,close)-.31-.33*Math.abs(Math.cos(j))),close,start:ts-60000,end:ts}};
  const barRange={61:[6868,6873],62:[6867.5,6870.15],74:[6874.60,6878],75:[6874.80,6877.50]}[j];if(barRange){point.bar.low=barRange[0];point.bar.high=barRange[1];}
  const a=makeFrame(intraday,ts,ts,point),b=makeFrame(daily,ts,ts,point),c=makeFrame(inv,ts,ts,point);
  a.pressureBasis=b.pressureBasis='modeled';
  for(let k=6810;k<=6940;k+=5){
   const x=(k-6870)/5,weight=.14+Math.exp(-.5*((k-close)/24)**2),local=Math.sin(.68*x+j*.009),special=k===6875&&j>=73?'reclaim':k===6870&&j>=60&&j<=62?'break':null,g=special==='reclaim'?10:round(17*weight*(.52+1.13*local+.94*Math.sin(j*.043))),v=round(21*weight*Math.cos(.64*x+j*.054)),ch=special==='reclaim'?-4:special==='break'?4:round(3*weight*Math.sin(x*.51-j*.027)),dt=round(115*weight*Math.sin(.72*x+.045*j));
   c.rows.push({strike:k,delta:dt,gamma:g,charm:ch,vanna:v,speed:null,color:null,inventoryGamma:g,dp:null,cp:null});
   for(const [frame,scale,phase] of [[a,1,.055*j],[b,.72,.014*j+.4]]){
    const dFlow=special==='reclaim'?-40:special==='break'?40:round(17*scale*weight*Math.sin(x*.77+phase)),gFlow=round(3.4*scale*weight*Math.cos(.4*x+phase*.5)),vFlow=round(4.7*scale*weight*Math.cos(.53*x-phase)),cFlow=round(.9*scale*weight*Math.sin(x*.63-phase));
    const callDelta=round(.45*dFlow+12*scale*weight*Math.sin(x*.31+phase)),putDelta=round(dFlow-callDelta);
    frame.rows.push({strike:k,delta:dFlow,callDelta,putDelta,gamma:gFlow,vanna:vFlow,charm:cFlow,speed:null,color:null,inventoryGamma:g,dp:round(-(dFlow+g*(frame===b?.35:.50)+v*(frame===b?-.08:-.1)+5*ch*(frame===b?.86:1))),cp:round(-5*ch*(frame===b?.86:1))});
   }
  }
  for(const f of [a,b,c]){
   f.globalGamma=round(c.rows.reduce((n,r)=>n+r.gamma,0));f.globalGrossGamma=round(c.rows.reduce((n,r)=>n+Math.abs(r.gamma),0));f.regimeVerified=true;f.regimeSource=source+' · inventario simulato ALL';
   f.rows.reverse();f.convention='Quantità dealer, greche per unità ES. DP di scenario = −(delta dei contratti nuovi + gamma inventario × ΔSPX + vanna inventario × ΔIV + charm × 5 min). CP isola il contributo tempo. Delta call e put derivano da due componenti simulate con somma pari al flusso delta. Shock intraday +0,50 pt e −0,10 pt IV; daily +0,35 pt e −0,08 pt IV e charm di modello 0,86×.';
  }
  intraday.frames.push(a);daily.frames.push(b);inv.frames.push(c);
 }
 return demoPacks=[intraday,daily,inv];
}
let cacheSignature=null,cache=null,version=0;
function refresh(){
 const f=w.DeskFields,market=w.DeskMarkets,t=w.InstTape,lad=w.QuantistesConfluence?.evidence?.()?.ladder||null;
 const sig=[f?.scalpRevision?.()||0,market?.revision?.()||0,t?.revision?.()||0,lad];
 if(cacheSignature&&sig.every((x,i)=>x===cacheSignature[i]))return;
 cacheSignature=sig;version++;const books=f?.strikeBooks?.()||[],versions=[...(t?.strikeVersions?.()||[])],edges=new Set();
 for(const b of books)for(const when of b.times)edges.add(Math.max(Date.parse(when),b.available.get(when)));
 for(const seq of versions)for(const v of seq)edges.add(Math.max(Math.ceil(v.e/60000)*60000,v.a));
 if(lad?.asof)edges.add(Date.parse(lad.available_at||lad.asof));
 cache={books,versions,lad,edges:[...edges].sort((a,b)=>a-b),views:new Map()};
}
function visible(cut=Date.now()){
 refresh();if(!finite(cut))return [];
 const {books,versions,lad,edges,views}=cache;let lo=0,hi=edges.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(edges[mid]<=cut)lo=mid+1;else hi=mid;}
 if(views.has(lo))return views.get(lo);
 const packs=fieldPacks(books,cut),ladder=ladderPack(lad,cut);if(ladder)packs.push(ladder);packs.push(...tapePacks(versions,cut));markInventories(packs);
 views.set(lo,packs);if(views.size>6)views.delete(views.keys().next().value);return packs;
}
function list(cut=Date.now()){
 const demos=buildDemo().map(p=>({...p,frames:p.frames.filter(f=>f.availableAt<=cut)})).filter(p=>p.frames.length);
 return visible(cut).concat(demos,w.OAReplay?.list?.(cut)||[]);
}
function revision(){refresh();return version;}
w.ScalpSources=Object.freeze({list,at:(cut=Date.now())=>visible(cut).filter(p=>p.mode==='observed'),revision,unit,factor});
for(const name of ['desk:dealer-fields','desk:tape-updated','desk:dealer-ladder','desk:markets','quantistes:v12-feed'])w.addEventListener(name,addEvent);
})(window);

