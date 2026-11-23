
/* Quantistes · Daily 09:45 Q/P synchronization and persisted local archive */
(function(root){
'use strict';
const $=id=>document.getElementById(id),F=Number.isFinite;
const fmt=(v,n=2)=>F(+v)?(+v).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pct=(v,n=1)=>F(+v)?fmt(+v*100,n)+'%':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const state={busy:false,activeFile:null,lastSignature:'',joined:false,mode:'none',selected:null,sourceRows:0,date:null,archiveImported:false,graph:null};
function status(message,tone='info'){
 const t=$('qdStatus');if(t){t.textContent=message;t.dataset.tone=tone;}
 const b=$('qdMeta');if(b)b.textContent=tone==='bad'?'DATI DA VERIFICARE':tone==='ok'?'SCENARIO P ATTIVO':'STATO DELLA SESSIONE';
}
function normalEpoch(value){
 const s=String(value??'').trim();if(!s)return null;
 if(/^\d{13}$/.test(s))return +s;
 if(/^\d{10}$/.test(s))return +s*1000;
 if(/(?:Z|[+-]\d\d:\d\d)$/.test(s)){
  const d=Date.parse(s);return F(d)?d:null;
 }
 return null;
}
const dt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function timeNY(value){
 const ms=normalEpoch(value);
 if(ms!=null){const parts=dt.formatToParts(new Date(ms)),get=k=>parts.find(x=>x.type===k)?.value||'';
  return {date:get('year')+'-'+get('month')+'-'+get('day'),time:get('hour')+':'+get('minute')+':'+get('second')};}
 const s=String(value??'').trim(),m=s.match(/^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d)(?::(\d\d))?/);
 return m?{date:m[1],time:m[2]+':'+(m[3]||'00')}:null;
}
function dateFmt(x){const s=String(x??'').trim();
 if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);
 if(/^\d{8}$/.test(s))return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
 if(/^\d{5}$/.test(s)){const d=new Date(+s*86400000);return d.toISOString().slice(0,10);}
 if(/^\d{13}$/.test(s))return new Date(+s).toISOString().slice(0,10);
 return '';
}
function readCSV(raw){
 const out=[];let record=[],buf='',quoted=false;const first=raw.split(/\r?\n/,1)[0];
 const seps=[',',';','\t'],sep=seps.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 for(let i=0;i<raw.length;i++){
  const c=raw[i];if(c==='"'){
   if(quoted&&raw[i+1]==='"'){buf+='"';i++}else quoted=!quoted;
  }else if(c===sep&&!quoted){record.push(buf);buf='';}
  else if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&raw[i+1]==='\n')i++;
   record.push(buf);buf='';if(record.some(x=>x.trim()))out.push(record);record=[];
  }else buf+=c;
 }
 if(record.length||buf){record.push(buf);out.push(record);}
 if(out.length<2)throw Error('CSV vuoto o senza intestazione');
 const hdr=out.shift().map(s=>String(s).trim().toLowerCase().replace(/[\s-]/g,'_'));
 return out.filter(r=>r.length===hdr.length).map(r=>{const o={};hdr.forEach((k,i)=>o[k]=r[i]?.trim()||'');return o;});
}
function get(row,...keys){for(const k of keys){const x=row[k];if(x!==undefined&&x!=='')return x;}return ''}
function num(x){if(typeof x==='number')return x;const v=Number(String(x??'').trim().replace(',','.'));return F(v)?v:NaN}
function median(a){const b=a.filter(F).slice().sort((x,y)=>x-y);if(!b.length)return NaN;return .5*(b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)]);}
function optionsFromCSV(raw){
 const source=readCSV(raw),clean=[];
 for(const r of source){
  const ts=timeNY(get(r,'timestamp','quote_timestamp','datetime','time'));
  const expiry=dateFmt(get(r,'expiration','expiration_date','expiry','expirationdate'));
  const symbol=String(get(r,'symbol','root','underlying_symbol')||'SPXW').toUpperCase();
  const rSide=String(get(r,'right','option_type','type','call_put_flag','cp')).toUpperCase();
  const side=/^C/.test(rSide)?'CALL':/^P/.test(rSide)?'PUT':'';
  let iv=num(get(r,'implied_vol','implied_volatility','iv'));
  if(iv>3)iv/=100;
  const o={ts,expiry,symbol,side,K:num(get(r,'strike','strike_price')),bid:num(get(r,'bid')),ask:num(get(r,'ask')),
   spot:num(get(r,'underlying_price','spot','underlying')),delta:num(get(r,'delta')),iv,
   gamma:num(get(r,'gamma')),charm:num(get(r,'charm')),vanna:num(get(r,'vanna'))};
  if(!ts||!expiry||symbol!=='SPXW'||!side||!F(o.K)||!F(o.spot)||!F(o.delta)||
    !F(o.bid)||!F(o.ask)||!(o.ask>o.bid)||o.bid<0||!(iv>0&&iv<3))continue;
  clean.push(o);
 }
 const dates=[...new Set(clean.map(o=>o.ts.date))];
 if(dates.length!==1)throw Error('Serve un solo snapshot SPXW per data; date valide: '+dates.length);
 const date=dates[0];
 const age=date&&clean.filter(o=>o.expiry===date&&o.ts.date===date);
 if(age.length<60)throw Error('Chain non 0DTE o troppo piccola per P 09:45');
 const cutoff=9*3600+45*60;
 const timely=age.filter(o=>{const t=o.ts.time.split(':').map(Number),sec=t[0]*3600+t[1]*60+t[2];return sec<=cutoff&&sec>=cutoff-300});
 if(timely.length<60)throw Error('Non ci sono almeno 60 quote con timestamp entro le 09:45:00 ET (nessun dato futuro accettato).');
 const per=new Map();for(const r of timely){
  const x=per.get(r.K)||{K:r.K};if(!x[r.side]||r.ts.time>=x[r.side].ts.time)x[r.side]=r;
  per.set(r.K,x);
 }
 const pairs=[...per.values()].filter(x=>x.CALL&&x.PUT);
 if(pairs.length<12)throw Error('Coppie CALL/PUT allo stesso strike insufficienti ('+pairs.length+')');
 const spot=median(timely.map(x=>x.spot));
 if(!(spot>0))throw Error('Sottostante SPX non valido');
 const atm=pairs.reduce((a,b)=>Math.abs(a.K-spot)<Math.abs(b.K-spot)?a:b);
 const mid=q=>(q.bid+q.ask)*.5;
 const sigma=(mid(atm.CALL)+mid(atm.PUT))*Math.sqrt(Math.PI/2);
 const ivATM=(atm.CALL.iv+atm.PUT.iv)*.5;
 if(!(ivATM>0.025&&ivATM<2&&sigma>0&&sigma/spot<.09))throw Error('Straddle o IV ATM non plausibili');
 function wing(side,target){
  const os=timely.filter(x=>x.side===side&&(side==='PUT'?x.K<spot:x.K>spot)&&
     Math.abs(x.delta)>.01&&Math.abs(x.delta)<.8&&x.ask>0&&x.iv>0);
  if(!os.length)throw Error('Ala '+side+' '+target+' delta assente');
  return os.reduce((a,b)=>Math.abs(Math.abs(a.delta)-target)<Math.abs(Math.abs(b.delta)-target)?a:b);
 }
 const iv25p=wing('PUT',.25).iv,iv25c=wing('CALL',.25).iv,iv10p=wing('PUT',.10).iv,iv10c=wing('CALL',.10).iv;
 const strikes=[...per.keys()].sort((a,b)=>a-b);
 const quotes=strikes.map(K=>{const q=per.get(K);return [K,q.CALL?.bid||0,q.CALL?.ask||0,q.PUT?.bid||0,q.PUT?.ask||0];});
 const snapshot={date,spot_quote:spot,quote_atm_K:atm.K,iv_atm:ivATM,q_sigma_pts:sigma,q_sigma_pct:sigma/spot,
  rr25:(iv25p-iv25c)/ivATM,rr10:(iv10p-iv10c)/ivATM,
  iv25_put:iv25p,iv25_call:iv25c,iv10_put:iv10p,iv10_call:iv10c,
  strikes,quotes,raw_contracts:timely.length,strike_count:strikes.length,hasOutcome:false,source:'Imported SPXW 09:45 ET'};
 const headers=['symbol','expiration','strike','right','timestamp','bid','ask','delta','gamma','charm','vanna','implied_vol','underlying_price'];
 const rows=timely.map(o=>['SPXW',date,o.K,o.side,date+'T'+o.ts.time,o.bid,o.ask,o.delta,F(o.gamma)?o.gamma:'',F(o.charm)?o.charm:'',F(o.vanna)?o.vanna:'',o.iv,o.spot]);
 const normalized=[headers.join(','),...rows.map(row=>row.join(','))].join('\n');
 return {snapshot,normalized,rows:timely.length,sourceCount:source.length,strikes:strikes.length};
}
function download(name,body,type='application/json'){
 const obj=new Blob([body],{type}),url=URL.createObjectURL(obj),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),7000);
}
async function bridge(){const b=root.QuantistesDailyBridge;
 if(b?.ready())return b;
 for(let i=0;i<90;i++){await new Promise(ok=>setTimeout(ok,80));if(root.QuantistesDailyBridge?.ready())return root.QuantistesDailyBridge;}
 throw Error('Archivio P non disponibile: riapri il documento in Chrome o Edge recente');
}
function sameCutoff(){
 const d=root.Desk,ctx=d?.state?.result,cfg=ctx?.cfg||{};
 const b=root.QuantistesDailyBridge;
 const p=b?.model?.();
 const asof=String(cfg.asof||''),expiry=String(cfg.expiry||'').slice(0,10);
 const stamp=asof.match(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)(?::(\d\d))?/);
 const matched=!!ctx?.ws?.model&&!!ctx?.ws?.qAudit?.passed&&!d?.state?.stale&&!!p&&!!stamp&&stamp[1]===p.date&&expiry===p.date&&stamp[2]==='09:45'&&(!stamp[3]||+stamp[3]===0)&&
  String(cfg.target||'').startsWith(p.date+'T16:00');
 return {matched,q:matched?ctx.ws.model:null,p,ctx,expiry,asof,reason:matched?'OK':(!p?'Motore P non disponibile':!ctx?.ws?.model?'CVI Q non calcolato':'Data, scadenza o cutoff Q/P non coincidenti')};
}
function buildLevels(ctx){return [...(ctx?.ippo?.levels||[]),...(ctx?.ws?.levels||[])].filter(x=>F(+x.price)).map(x=>({family:x.family||'CVI',name:x.name||x.z||x.family||'L',K:+x.price})).sort((a,b)=>a.K-b.K)}
function csvNativeImport(normalized,date,spot){
 return new Promise(async(resolve,reject)=>{
  const native=$('csvFile'),d=root.Desk;if(!native||!d){reject(Error('Importatore CVI non trovato'));return;}
  try{
   const file=new File([normalized],`Quantistes_SPXW_${date}_0945_CVI.csv`,{type:'text/csv'});
   const transfer=new DataTransfer();transfer.items.add(file);
   $('ivUnit').value='decimal';
   native.files=transfer.files;
   native.dispatchEvent(new Event('change',{bubbles:true}));
   let valid=false;
   for(let n=0;n<100;n++){
    await new Promise(r=>setTimeout(r,70));
    const pp=d.state.parsed;
    if(pp?.rows?.length&&pp?.meta?.dates?.includes(date)&&d.state.files?.some(f=>f.name===file.name)){valid=true;break;}
   }
   if(!valid)throw Error('La nuova chain non è stata accettata dal parser CVI');
   const set=(id,v)=>{const e=$(id);if(e)e.value=String(v)};
   set('symbol','SPXW');set('expirySelect',date);set('expiry',date);set('asof',date+'T09:45:00');
   const close=root.DeskCalendar10?.fixing?.(date)?.etClose||'16:00';
   set('expiryTime',close);set('target',date+'T'+close);
   set('settlement',spot.toFixed(2));set('maxAge',300);
   set('ivUnit','decimal');
   set('cviFitMode','desk');
   status('Chain '+date+' importata · P aggiornata · calibrazione CVI Q in corso…');
   await d.calculate();
   if(!d.state?.result?.ws?.model||d.state.stale)throw Error('CVI non disponibile sul cutoff 09:45: controlla diagnostica bid/ask e spread');
   if(sameCutoff().matched)status(date+' · Q CVI + P storica allineate · '+d.state.result.ws.levels.length+' livelli Wall Street · verifica la qualità del fit','ok');
   else status(date+' · Q CVI calcolata; P non applicabile a un orizzonte differente da 09:45–16:00 ET','bad');
   resolve(true);
  }catch(e){reject(e)}
 });
}
async function importDaily(file){
 if(!file)throw Error('Nessun CSV selezionato');
 if(file.size>35e6)throw Error('CSV superiore a 35 MB');
 if(state.busy)throw Error('Importazione già in corso');
 state.busy=true;$('qdImport').disabled=true;
 try{
  status('Lettura CSV SPXW 09:45…');
  const raw=await file.text(),parsed=optionsFromCSV(raw),b=await bridge();
  const result=b.ingestSnapshot(parsed.snapshot);
  state.date=result.date;state.sourceRows=parsed.rows;
  status(`${result.date} · P stimata su ${result.n} sedute · ESS ${fmt(result.ess,0)} · caricamento Q…`);
  await csvNativeImport(parsed.normalized,parsed.snapshot.date,parsed.snapshot.spot_quote);
  render();
  return {...result,joined:sameCutoff().matched};
 }catch(error){status('Verifica importazione: '+String(error.message||error),'bad');render();throw error}
 finally{state.busy=false;$('qdImport').disabled=false}
}
function parseOutcome(raw,date){
 const rows=readCSV(raw);const out=[];
 for(const r of rows){
  const rowDate=String(get(r,'session_date_et','date','session_date')).slice(0,10);
  if(rowDate!==date)continue;
  let minute=num(get(r,'minute_index_from_0945','minute_index'));
  if(!F(minute)){
   const t=String(get(r,'minute_et','time'));
   if(!/^\d\d:\d\d$/.test(t))throw Error('Barra senza indice 09:45');
   minute=(+t.slice(0,2))*60+(+t.slice(3,5))-585;
  }
  out.push({minute,low:num(get(r,'low_spx','low')),high:num(get(r,'high_spx','high')),close:num(get(r,'close_spx','close'))});
 }
 out.sort((a,b)=>a.minute-b.minute);
 return out;
}
const cssTarget=['view-monitor','view-levels','view-distributions','view-export','view-research','flow-panel-ops'];
function create(){
 if($('qdBar'))return;
 const bar=document.createElement('section');bar.id='qdBar';bar.className='qd-daily-bar';
 bar.innerHTML=`<div class="qd-bar-head"><div><span class="qd-eyebrow">QUANTISTES / DAILY DESK</span><h3>Q × P <em>MARKET INTELLIGENCE</em></h3></div><span id="qdMeta">STATO DELLA SESSIONE</span></div>
 <div class="qd-bar-tools"><label>CHAIN SPXW 0DTE · 09:45 ET<input type="file" id="qdDailyFile" accept=".csv,.txt,.tsv"/></label>
 <button id="qdImport" class="qd-action">IMPORTA E CALCOLA Q + P</button>
 <label>ESITO SPX 1 MIN · FINE SESSIONE<input type="file" id="qdOutcome" accept=".csv,.txt"/></label>
 <button id="qdArchiveExport">ESPORTA ARCHIVIO P</button>
 <label>RICARICA ARCHIVIO P<input type="file" id="qdArchiveImport" accept=".json"/></label>
 <button id="qdGoP">APRI CONSOLE P</button></div>
 <div class="qd-bar-message" id="qdStatus" data-tone="info">Carica una chain 0DTE con quotazioni alle 09:45 ET. CVI e P verranno aggiornate sul medesimo cutoff.</div>
 <div class="qd-bar-audit">P = stima empirica 09:45 · Q = distribuzione CVI · R_flow = scenario indipendente. L'edge di P non è validato OOS; i dealer Sample 2025 non vengono usati per calibrare P.</div>`;
 const work=$('qtWorkArea');const head=work?.querySelector('.heading');
 if(head)head.after(bar);else work?.prepend(bar);
 for(const id of cssTarget){const view=$(id);if(!view)continue;
  const panel=document.createElement('section');panel.className='qd-joined-panel';panel.id='qdJoin-'+id;
  panel.innerHTML=`<div class="qd-join-head"><b>Q / P · INTEGRATED LEVEL INTELLIGENCE</b><span class="qd-join-state">In attesa di una chain contemporanea</span></div><div class="qd-join-content"></div>`;
  const h=view.querySelector('.flow-hero, .op-tophead, .pd-hero');
  if(h&&h.parentElement===view)h.after(panel);else view.prepend(panel);
 }
 $('qdImport').onclick=async()=>{
  try{const f=$('qdDailyFile').files?.[0];if(!f)throw Error('Seleziona il CSV 0DTE delle 09:45');await importDaily(f)}catch(e){console.warn('Daily import',e)}
 };
 $('qdOutcome').onchange=async(e)=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
   const b=await bridge(),current=b.model();if(!current)throw Error('Seleziona prima lo snapshot quotidiano P');
   const bars=parseOutcome(await f.text(),current.date),out=b.ingestOutcome(current.date,bars);
   status(`Esito ${out.date} registrato (${fmt(out.returnPct,3)}%). Esporta l'archivio P per conservarlo.`,'ok');render();
  }catch(error){status('Esito non importato: '+error.message,'bad');}
 };
 $('qdArchiveExport').onclick=async()=>{try{const b=await bridge();download('Quantistes_P_Daily_Archive.json',JSON.stringify({schema:'quantistes.physical.daily.archive.v1',dateCreated:new Date().toISOString(),snapshots:b.exportArchive()},null,2));status('Archivio scaricato: conserva il JSON per le sessioni future.','ok')}
  catch(e){status(e.message,'bad')}};
 $('qdArchiveImport').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{
  const a=JSON.parse(await f.text());if(a.schema!=='quantistes.physical.daily.archive.v1')throw Error('Archivio non compatibile');
  const b=await bridge(),n=b.importArchive(a.snapshots);status('Importate '+n+' sedute giornaliere.','ok');render();
 }catch(err){status('Archivio non caricato: '+err.message,'bad')}};
 $('qdGoP').onclick=()=>{root.Desk?.tab?.('flows');document.querySelector('[data-flow-panel="physical"]')?.click();};
 $('qdDailyFile').addEventListener('change',()=>{if($('qdDailyFile').files?.length)status('CSV selezionato. Premi «IMPORTA E CALCOLA Q + P».')});
}
function tableHTML(join){
 const b=root.QuantistesDailyBridge,ctx=join.ctx,q=join.q,levels=buildLevels(ctx);
 const rows=[];
 for(const lev of levels){
  const p=b.predict(join.p.date,lev.K);if(!p)continue;
  const qAbove=clamp(q.survival(lev.K),0,1);
  const diff=p.pAbove-qAbove;
  rows.push(`<tr><td>${esc(lev.family)}</td><td>${esc(String(lev.name))}</td><td>${fmt(lev.K,2)}</td>
    <td class="qd-prob" style="--power:${clamp(p.pAbove,0,1)}">${pct(p.pAbove,1)}</td>
    <td class="qd-prob" style="--power:${clamp(qAbove,0,1)}">${pct(qAbove,1)}</td>
    <td class="qd-diff ${diff<0?'neg':'pos'}" style="--power:${clamp(Math.abs(diff)*5,0,1)}">${diff>0?'+':''}${pct(diff,1)}</td>
    <td class="qd-prob" style="--power:${clamp(p.pTouch,0,1)}">${pct(p.pTouch,1)}</td>
    <td>${p.pReversal===null?'—':pct(p.pReversal,1)}</td><td>${p.pBreakout===null?'—':pct(p.pBreakout,1)}</td><td>${pct(p.pPin,1)}</td><td>${fmt(p.hitESS,0)}</td></tr>`);
 }
 return `<div class="qd-kpis">
  <div><small>SPX 09:45</small><b>${fmt(join.p.spot)}</b></div>
  <div><small>TRAIN PRECEDENTE</small><b>${join.p.n}</b></div>
  <div><small>ESS</small><b>${fmt(join.p.ess,0)}</b></div>
  <div><small>P CLOSE UP</small><b>${pct(b.predict(join.p.date,join.p.spot).pAbove,1)}</b></div>
  <div><small>Q CVI CLOSE UP</small><b>${pct(q.survival(join.p.spot),1)}</b></div>
  <div><small>OOS / EDGE</small><b class="qd-warn">NON VALIDATO</b></div></div>
 <div class="qd-joined-tablewrap"><table class="qd-joined-table"><thead><tr><th>FAMIGLIA</th><th>LIVELLO</th><th>SPX</th><th>P CLOSE &gt;</th><th>Q CLOSE &gt;</th><th>Δ P−Q</th><th>P TOUCH</th><th>P REV|HIT</th><th>P BRK|HIT</th><th>P PIN</th><th>HIT ESS</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
 <div class="qd-small">Probabilità P condizionate alle caratteristiche della chain 09:45 · Q completa da CVI. Reversal/breakout richiedono almeno 30 hit ESS; nessuna probabilità dealer-condizionata è stata stimata.</div>`;
}
function plotJoint(id,join){
 const node=$(id);if(!node||!node.offsetWidth)return;
 const c=node.querySelector('canvas');if(!c)return;
 const w=Math.max(320,node.clientWidth-14),h=260,ratio=Math.min(2,window.devicePixelRatio||1);
 if(c.width!==Math.round(w*ratio)||c.height!==Math.round(h*ratio)){c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);}
 c.style.width=w+'px';c.style.height=h+'px';
 const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
 const p=join.p,q=join.q,b=root.QuantistesDailyBridge;
 const low=p.spot-3.2*p.sigma,high=p.spot+3.2*p.sigma,L=60,R=w-16,T=22,B=h-42;
 const X=x=>L+(x-low)/(high-low)*(R-L),Y=y=>B-clamp(y,0,1)*(B-T);
 function base(){ctx.fillStyle='#0a1c2e';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(79,131,188,.22)';ctx.fillStyle='#7ba9e4';ctx.font='11px Consolas';
  for(let i=0;i<=5;i++){const y=i/5;ctx.beginPath();ctx.moveTo(L,Y(y));ctx.lineTo(R,Y(y));ctx.stroke();ctx.textAlign='right';ctx.fillText(fmt(y*100,0)+'%',L-7,Y(y)+4)}
  for(let i=0;i<=6;i++){const x=low+i*(high-low)/6;ctx.beginPath();ctx.moveTo(X(x),T);ctx.lineTo(X(x),B);ctx.stroke();ctx.textAlign='center';ctx.fillText(fmt(x,0),X(x),B+18)}
 }
 base();
 const pts=101;function line(fn,color){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2.2;for(let i=0;i<pts;i++){
  const x=low+i*(high-low)/(pts-1),y=Y(fn(x));i?ctx.lineTo(X(x),y):ctx.moveTo(X(x),y);
 }ctx.stroke();}
 const cached=[];for(let i=0;i<pts;i++){const K=low+i*(high-low)/(pts-1);cached.push({x:K,p:b.predict(p.date,K)?.pAbove??null,q:q.survival(K)})}
 line(x=>{const i=Math.round((x-low)/(high-low)*(pts-1));return cached[clamp(i,0,pts-1)].p},'#7dc4e1');
 line(x=>q.survival(x),'#e4dfcc');
 ctx.font='11px Consolas';ctx.fillStyle='#7dc4e1';ctx.fillText('P EMPIRICA',L+10,T+16);ctx.fillStyle='#e4dfcc';ctx.fillText('Q CVI',L+110,T+16);
 const info=node.querySelector('.qd-plot-read');const ov=node.querySelector('.qd-cross');
 // Pointer redraws only the overlay; the base graph retains its backing store.
 if(ov){if(ov.width!==c.width||ov.height!==c.height){ov.width=c.width;ov.height=c.height;}ov.style.width=c.style.width;ov.style.height=c.style.height;
  const ovCtx=ov.getContext('2d');ovCtx.setTransform(ratio,0,0,ratio,0,0);
  ov.onmousemove=e=>{
   const rect=ov.getBoundingClientRect(),px=e.clientX-rect.left;if(px<L||px>R){ovCtx.clearRect(0,0,w,h);return;}
   ovCtx.clearRect(0,0,w,h);ovCtx.strokeStyle='#c9cdc6';ovCtx.setLineDash([4,4]);ovCtx.beginPath();ovCtx.moveTo(px,T);ovCtx.lineTo(px,B);ovCtx.stroke();ovCtx.setLineDash([]);
   const x=low+(px-L)/(R-L)*(high-low),pv=b.predict(p.date,x)?.pAbove??NaN,qv=q.survival(x);
   if(info)info.textContent='Strike '+fmt(x,2)+' · P close>'+pct(pv,2)+' · Q CVI>'+pct(qv,2)+' · Δ '+pct(pv-qv,2);
  };ov.onmouseleave=()=>{ovCtx.clearRect(0,0,w,h)};
 }
}
function render(){
 const join=sameCutoff(),b=root.QuantistesDailyBridge,active=document.querySelector('.view.active')?.id||'';
 const model=b?.model?.()||null;
 const key=[join.matched,join.ctx?.ws?.cvi?.marks?.candidateFingerprint||'',root.Desk?.state?.revision,join.p?.date||'',join.p?.ess||'',model?.n||'',active].join('|');
 if(key===state.lastSignature)return;state.lastSignature=key;state.joined=join.matched;
 if(join.matched){
  $('qdMeta').textContent=`Q/P · ${join.p.date} · 09:45 ET`;
 }else if(model){$('qdMeta').textContent=`P ${model.date} · Q NON ALLINEATA`}
 for(const target of cssTarget){const el=$('qdJoin-'+target);if(!el)continue;
  const label=el.querySelector('.qd-join-state'),content=el.querySelector('.qd-join-content');
  if(join.matched){
   label.textContent=`SINCRONIZZATE · ${join.p.date} · 09:45 ET`;
   content.innerHTML=tableHTML(join);
   if(target==='view-distributions'||target==='view-monitor'){
    const chart=document.createElement('div');chart.className='qd-joint-plot';chart.id='qdPlot-'+target;
    chart.innerHTML='<canvas></canvas><canvas class="qd-cross"></canvas><div class="qd-plot-read">Muovi il cursore: probabilità di chiusura Q e P sullo stesso prezzo.</div>';
    content.prepend(chart);if(el.getBoundingClientRect().width>0)plotJoint(chart.id,join);
   }
  }else{
   label.textContent=model?`P ${model.date} · Q NON ALLINEATA`:'NESSUN MODELLO P';
   content.innerHTML=`<div class="qd-small">${esc(join.reason)}. Il confronto P/Q richiede la chain SPXW 0DTE della stessa data alle 09:45:00 ET e un mark CVI disponibile. I Sample dealer 2025 non sono sovrapposti a P.</div>`;
  }
 }
}
function schedule(){render()}
function init(){if(!$('qtWorkArea'))return;create();
 root.addEventListener('qt:physical-updated',()=>{state.lastSignature='';render()});
 document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>setTimeout(()=>{state.lastSignature='';render()},120)));
 setInterval(schedule,1400);
 root.QuantistesDaily=Object.freeze({version:'9.0.0',import:importDaily,parse:optionsFromCSV,join:sameCutoff,refresh:()=>{state.lastSignature='';render()},stats:()=>({date:root.QuantistesDailyBridge?.model?.()?.date||null,matched:sameCutoff().matched,sourceRows:state.sourceRows})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);

