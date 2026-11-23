

(function(w){
'use strict';
const M=w.DeskMeasures;
const groups=new Map();let rev=0,dbp=null,loaded=null,channel=null,refreshTicket=0;
const fmtDay=n=>String(n).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
const header=['symbol','contract','expiry','timestamp','available_at','close','kind'];
const exampleRows=[
 ['ES','ESZ26','','2026-11-20T09:45:00-05:00','2026-11-20T09:45:00-05:00','6900.25','1m',''],
 ['VIX','','','2026-11-20T09:45:00-05:00','2026-11-20T09:45:00-05:00','20.10','1m',''],
 ['VVIX','','','2026-11-20T09:45:00-05:00','2026-11-20T09:45:00-05:00','102.5','1m',''],
 ['SPX','','','2026-11-20T09:45:00-05:00','2026-11-20T09:45:00-05:00','6898.36','1m',''],
 ['SPX','','','2026-11-19T16:00:00-05:00','2026-11-19T16:02:00-05:00','6894.75','close',''],
 ['VX','VXZ26','2026-12-16','2026-11-20T09:45:00-05:00','2026-11-20T09:45:00-05:00','20.60','1m','M1'],
 ['VX','VXF27','2027-01-20','2026-11-20T09:45:00-05:00','2026-11-20T09:45:00-05:00','21.25','1m','M2']
 ];
function template(){return [...header,'tenor','open','high','low','data_origin'].join(',')+'\n'+exampleRows.map(r=>r.concat(r[0]==='SPX'&&r[6]==='1m'?['6897.80','6899.00','6897.55']:['','',''],'sample').join(',')).join('\n');}
const legacyExamples=new WeakSet();
const priceSignature=r=>JSON.stringify([r.symbol,r.contract,r.kind,r.expiry,r.tenor||'',r.t,r.a,r.price]);
const exampleSignatures=new Set(exampleRows.filter(r=>r[6]==='1m').map(r=>priceSignature({symbol:r[0],contract:r[1],expiry:r[2],t:Date.parse(r[3]),a:Date.parse(r[4]),price:Number(r[5]),kind:r[6],tenor:r[7]})));
function parse(text,now=Date.now()){
 const grid=w.CVIData.csv(text),cols=grid.shift()?.map(t=>t.toLowerCase().trim());
 if(!cols||new Set(cols).size!==cols.length||header.some(k=>!cols.includes(k)))throw Error('Usa il tracciato prezzi del Data Hub.');const out=[];
 for(const [i,cells] of grid.entries()){if(cells.every(s=>!s.trim()))continue;
  const r=Object.fromEntries(cols.map((k,j)=>[k,(cells[j]||'').trim()])),symbol=r.symbol.toUpperCase(),kind=r.kind.toLowerCase(),contract=r.contract.toUpperCase(),tenor=(r.tenor||'').toUpperCase(),t=M.stamp(r.timestamp),a=M.stamp(r.available_at),price=M.number(r.close);
  const fail=()=>{throw Error('Prezzi · controlla strumento, contratto, scadenza, prezzo e orari alla riga '+(i+2));};
  if(!['ES','SPX','VIX','VVIX','VX'].includes(symbol)||!Number.isFinite(t)||!Number.isFinite(a)||a<t||a>now||!(price>0)||!['1m','close','settlement'].includes(kind)||kind==='1m'&&t%60000||cells.length!==cols.length)fail();
  const et=M.clock(r.timestamp),day=et.date;
  if(symbol==='ES'&&(!contract||!M.onTick(price))||symbol==='VX'&&(!contract||!['M1','M2'].includes(tenor)||/^VX\d{1,2}\//.test(contract)||!/^\d{4}-\d\d-\d\d$/.test(r.expiry)||!Number.isFinite(Date.parse(r.expiry))||new Date(r.expiry+'T00:00Z').toISOString().slice(0,10)!==r.expiry||r.expiry<day))fail();
  if(kind==='settlement'&&!['ES','VX'].includes(symbol)||kind==='close'&&['VX','ES'].includes(symbol))fail();if(['SPX','VIX','VVIX'].includes(symbol)&&!!(contract||r.expiry)||symbol!=='VX'&&r.expiry)fail();
  const supplied=['open','high','low'].some(k=>r[k]!=null&&r[k]!=='');let ohlc=null;
  if(supplied){const fields=['open','high','low'].map(k=>M.number(r[k]));if(kind!=='1m'||fields.some(v=>!(v>0))||fields[1]<Math.max(price,fields[0],fields[2])||fields[2]>Math.min(price,fields[0],fields[1]))fail();ohlc={open:fields[0],high:fields[1],low:fields[2],close:price,start:t-60000,end:t};}
  const origin=(r.data_origin||'').toLowerCase(),isExample=/^example$/i.test(r.source||'');if(origin&&!['sample','synthetic','example','observed'].includes(origin))fail();
  const dataOrigin=isExample||origin==='example'?'sample':origin||undefined;
  out.push({...(dataOrigin?{dataOrigin}:{}),symbol,kind,contract,tenor,expiry:r.expiry,t,a,price,day,minute:et.minute,...(ohlc?{ohlc}:{})});
 }if(!out.length)throw Error('Il CSV è vuoto.');return out;
}
const rowKey=r=>[r.symbol,r.contract,r.kind,r.t,r.a,r.dataOrigin||''].join('|');
function merge(day,extra){const m=new Map(day.map(r=>[rowKey(r),r]));for(const r of extra){const k=rowKey(r),old=m.get(k);if(old&&(JSON.stringify(old.ohlc)!==JSON.stringify(r.ohlc)||old.price!==r.price||old.expiry!==r.expiry||old.tenor!==r.tenor))throw Error('Prezzi discordanti alla stessa ora di disponibilità. Indica la data effettiva della rettifica.');m.set(k,r);}return [...m.values()].sort((a,b)=>a.t-b.t||a.a-b.a);}
function group(rows){const m=new Map();for(const r of rows){if(!m.has(r.day))m.set(r.day,[]);m.get(r.day).push(r);}return m;}
function index(day,rows){
 // V9's untagged example has a unique simultaneous six-instrument price vector.
 // Leave independently submitted single prices and explicit observed records usable.
 if(day==='2026-11-20'){const exact=rows.filter(r=>!r.dataOrigin&&exampleSignatures.has(priceSignature(r)));if(new Set(exact.map(priceSignature)).size===exampleSignatures.size)for(const r of exact)legacyExamples.add(r);}
 const idx=new Map();for(const r of rows){const k=r.symbol+'|'+r.kind;if(!idx.has(k))idx.set(k,new Map());const minutes=idx.get(k);if(!minutes.has(r.minute))minutes.set(r.minute,[]);minutes.get(r.minute).push(r);}groups.set(day,idx);}
function db(){if(!dbp)dbp=new Promise((res,rej)=>{const r=indexedDB.open('quantistes.market.minute.archive',1);r.onupgradeneeded=()=>r.result.createObjectStore('days',{keyPath:'day'});r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>{d.close();dbp=loaded=null;};res(d);};r.onerror=()=>rej(r.error);}).catch(e=>{dbp=null;throw e;});return dbp;}
function changed(){rev++;w.dispatchEvent(new CustomEvent('desk:markets'));}
async function readAll(){const ticket=++refreshTicket,d=await db();const values=await new Promise((res,rej)=>{const q=d.transaction('days').objectStore('days').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});if(ticket!==refreshTicket)return;groups.clear();for(const g of values)index(g.day,g.rows);if(values.length)changed();}
function ready(){if(!loaded)loaded=readAll().catch(e=>{loaded=null;throw e;});return loaded;}
async function save(rows){await ready();const d=await db(),days=group(rows),updated=new Map();let error;
 await new Promise((res,rej)=>{const t=d.transaction('days','readwrite'),s=t.objectStore('days');for(const [day,extra] of days){const q=s.get(day);q.onsuccess=()=>{try{const before=q.result?.rows||[],after=merge(before,extra);if(after.length!==before.length){s.put({day,rows:after});updated.set(day,after);}}catch(e){error=e;t.abort();}};}t.oncomplete=res;t.onerror=t.onabort=()=>rej(error||t.error||Error('Archivio prezzi non salvato.'));});
 if(updated.size){refreshTicket++;for(const [day,v] of updated)index(day,v);changed();channel?.postMessage('update');}return updated.size;}
function values(idx,symbol,minute,cut,kind='1m',eligible=null){
 const rows=idx?.get(symbol+'|'+kind)?.get(minute)||[],by=new Map();for(const r of rows)if(r.t<=cut&&r.a<=cut&&(!eligible||eligible(r))){const old=by.get(r.contract);if(!old||r.t>old.t||r.t===old.t&&r.a>old.a)by.set(r.contract,r);}return [...by.values()];
}
function point(idx,symbol,minute,cut){const rows=values(idx,symbol,minute,cut);return rows.length===1?rows[0]:null;}
function paths(c,existing){const out=[];if(!c.before)return out;
 const cutoff=w.QuantCore.nyEpoch(fmtDay(c.before)+'T'+M.timeET(c.start)+':00');for(const [date,idx] of groups){const d=M.dateKey(date);if(d>=c.before||existing.has(d))continue;
 const t0=w.QuantCore.nyEpoch(date+'T'+M.timeET(c.start)+':00'),v=point(idx,'VIX',c.start,t0),first=point(idx,'ES',c.start,t0);
 if(!first||!v||Math.abs(v.price-c.vix)>c.band)continue;const arr=new Float64Array(c.h+1);let ok=true;
 for(let i=1;i<=c.h;i++){const a=point(idx,'ES',c.start+i,cutoff);if(!a||a.contract!==first.contract){ok=false;break;}arr[i]=a.price-first.price;}
 if(ok)out.push({date:d,vix:v.price,values:arr,end:arr[c.h]});
 }return out;}
function origin(date,minute){const d=fmtDay(date),t=w.QuantCore.nyEpoch(d+'T'+M.timeET(minute)+':00'),i=groups.get(d);return {vix:point(i,'VIX',minute,t)?.price,spot:point(i,'ES',minute,t)?.price};}
function state(cut){if(!Number.isFinite(cut))return null;const clock=M.clock(new Date(cut).toISOString()),idx=groups.get(clock.date);if(!idx)return null;
 const latest=(s,minutes)=>{const latest=new Map();for(let i=0;i<=minutes;i++)for(const r of values(idx,s,clock.minute-i,cut))if(cut-r.t<=minutes*60000&&!latest.has(r.contract))latest.set(r.contract,r);return [...latest.values()];};
 const spx=latest('SPX',1)[0],vix=latest('VIX',3)[0],vvix=latest('VVIX',3)[0],curve=latest('VX',2).filter(r=>r.expiry>clock.date).sort((a,b)=>a.expiry.localeCompare(b.expiry));
 const role=k=>{const x=curve.filter(r=>r.tenor===k);return x.length===1?x[0]:null;};const one=role('M1'),two=role('M2');
 const sync=(a,b)=>a&&b&&Math.abs(a.t-b.t)<=60000;return {spx,vix,vvix,one,two,basis:sync(one,vix)?one.price-vix.price:null,slope:sync(one,two)&&one.expiry<two.expiry?two.price-one.price:null};}
function closes(day,cut){const idx=groups.get(day);if(!idx)return {};const r={};for(const k of ['SPX','VIX','VVIX','VX']){const a=[...(idx.get(k+(k==='VX'?'|settlement':'|close'))?.values()||[])].flat().filter(x=>x.a<=cut&&x.t<=cut).sort((a,b)=>b.t-a.t||b.a-a.a);if(k==='VX'){const distinct=new Map();for(const x of a)if(!distinct.has(x.contract))distinct.set(x.contract,x);r.VX=[...distinct.values()].sort((a,b)=>a.expiry.localeCompare(b.expiry));}else if(a.length)r[k]=a[0];}return r;}
try{channel=new BroadcastChannel('quantistes.market.minute.archive');channel.onmessage=()=>{loaded=readAll().catch(()=>{loaded=null;});};}catch{}
function priorCash(day,cut){for(let i=1;i<=10;i++){const d=new Date(Date.parse(day+'T12:00Z')-i*86400000).toISOString().slice(0,10),fix=w.DeskCalendar10?.fixing?.(d);if(!fix?.verified)return null;if(fix.isSession){const r=closes(d,cut).SPX;return r&&r.t===fix.epochMs?r:null;}}return null;}
function scalpMark(ts){
 if(!Number.isFinite(ts))return null;const clock=M.clock(new Date(ts).toISOString()),idx=groups.get(clock.date);if(!idx)return null;
 const observed=r=>!['sample','synthetic','example'].includes(String(r.dataOrigin||'').toLowerCase())&&!legacyExamples.has(r);
 const latest=symbol=>{for(let m=clock.minute;m>=clock.minute-1;m--){const a=values(idx,symbol,m,ts,'1m',observed).filter(r=>ts-r.t<=60000);if(a.length)return a.length===1?a[0]:null;}return null;};
 return {cash:latest('SPX'),es:latest('ES')};
}
w.DeskMarkets={scalpMark,priorCash,parse,template,ready,save,paths,origin,state,closes,dates:()=>[...groups.keys()].sort(),esDates:()=>[...groups].filter(([,idx])=>idx.has('ES|1m')&&idx.has('VIX|1m')).map(([d])=>d).sort(),revision:()=>rev};
})(window);


