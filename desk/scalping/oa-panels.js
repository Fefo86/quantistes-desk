
(function (w) {
'use strict';

const M = 60000, finite = Number.isFinite;
const timeNY = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const day = ts => timeNY.format(ts);
const value = x => finite(x) ? x : null;
const positive = x => finite(x) && x>0;
const minOf = a => a.length ? a.reduce((a,b)=>Math.min(a,b)) : null;
const maxOf = a => a.length ? a.reduce((a,b)=>Math.max(a,b)) : null;
const sumComplete = a => a.length && a.every(finite) ? a.reduce((s,v)=>s+v,0) : null;
const mean = a => a.length ? sumComplete(a)/a.length : null;
const period = p => p?.modelPeriod || p?.timeframe;
const fields = ['source','kind','perspective','coverage','expiry','optionClass','lastTradeAt','pmSettled','comparableId','windowMinutes'];
const same = (a,b,keys) => keys.every(k=>(a[k]??null)===(b[k]??null));

function normalized(frame,row,k) {
 if(!row || !finite(row[k]))return null;
 const factor=frame.factors?.[k], dealer=frame.perspective==='dealer';
 if(!dealer || !['signed_flow','inventory'].includes(frame.kind) || !finite(factor) || (k==='charm' ? factor===0 : factor<=0))return null;
 if(k==='gamma' && frame.gammaSign!=='dealer_long_positive')return null;
 return row[k]*factor;
}
function ranks(values,spot) {
 return values.filter(r=>finite(r.value)&&r.value!==0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||
  (positive(spot)?Math.abs(a.price-spot)-Math.abs(b.price-spot):0)||a.price-b.price).slice(0,3)
  .map((r,i)=>({...r,rank:i+1}));
}
const gridOK = s => Array.isArray(s?.rows) && s.rows.length>0 && s.rows.every(r=>positive(r?.strike)) && new Set(s.rows.map(r=>r.strike)).size===s.rows.length;

function effectiveFrames(pack,cutoff,now) {
 // One admissible edition per timestamp. Incompatible or ambiguous editions break continuity.
 const byTime=new Map(),targetDay=day(now);
 for(const f of pack.frames||[]) {
  if(!finite(f?.ts)||!finite(f.availableAt)||f.ts>now||f.ts<now-3*60*M||f.availableAt<f.ts||f.availableAt>cutoff)continue;
  const prior=byTime.get(f.ts);
  if(!prior||f.availableAt>prior.release)byTime.set(f.ts,{release:f.availableAt,f});
  else if(f.availableAt===prior.release&&f!==prior.f)prior.f=null;
 }
 const grid=[...byTime].sort((a,b)=>a[0]-b[0]),last=grid.at(-1)?.[1].f;
 if(!last || !gridOK(last))return [];
 let history=[];
 for(const [stamp,ed] of grid){
  const f=ed.f;
  if(!f||!gridOK(f)||day(stamp)!==targetDay||!same(last,f,fields)||
   !same(last,f,['timeframe','modelPeriod','charmClock','gammaSign','convention','pressureBasis','mode'])||
   ['charm','gamma','speed','delta'].some(k=>(last.units?.[k]??null)!==(f.units?.[k]??null))){history=[];continue;}
  history.push({ts:f.ts,availableAt:f.availableAt,by:new Map(f.rows.map(r=>[r.strike,r])),f});
 }
 return history;
}
function cadenceOf(history,p) {
 if(positive(p.intervalMinutes))return p.intervalMinutes*M;
 const d=history.slice(-32).flatMap((r,i,a)=>i?[r.ts-a[i-1].ts]:[]).filter(positive).sort((a,b)=>a-b);
 // Infer a spacing only after repeated observations, otherwise use the native minute grid.
 return d.length>=3?d[Math.floor((d.length-1)/2)]:M;
}
function coherent(pack,daily,curr,ref) {
 if(!pack||!daily||!curr||!ref||!pack.comparableId||!same(pack,daily,fields)||pack.mode!==daily.mode||period(pack)===period(daily))return false;
 return curr.ts===ref.ts && curr.f.rows.length===ref.f.rows.length && curr.f.rows.every(r=>ref.by.has(r.strike));
}
function timeWindow(h,k,at,span,cadence,metric='charm') {
 const from=at-span*M;
 let i=h.findIndex(f=>f.ts>from)-1;
 if(i<0)return null;
 const start=h[i],end=h.at(-1);
 if(end.ts!==at||from-start.ts>cadence*1.5)return null;
 let left=null,right=null;
 for(let j=i;j<h.length;j++){
  const f=h[j],z=f.by.get(k);
  if(!z||(j>i && f.ts-h[j-1].ts>1.5*cadence))return null;
  const v=normalized(f.f,z,metric);
  if(!finite(v))return null;
  if(j===i){
   if(start.ts===from)left=v;
   else{
    const next=h[i+1],v2=normalized(next.f,next.by.get(k),metric);
    if(!finite(v2)||next.ts<=start.ts)return null;
    left=v+(v2-v)*(from-start.ts)/(next.ts-start.ts);
   }
  }
  if(j===h.length-1)right=v;
 }
 return finite(right)&&finite(left)?(right-left)/span:null;
}
function timeWeightedHour(history,cadence,when) {
 const start=when-60*M,stream=[];
 // Revisions learned after a newer edition cannot replace the then-current value retroactively.
 for(const ed of history.slice().sort((a,b)=>a.availableAt-b.availableAt||a.ts-b.ts)){
  if(ed.availableAt>when)continue;
  if(!stream.length || ed.ts>stream.at(-1).ts)stream.push(ed);
 }
 if(stream.length<2 || stream[0].availableAt>start)return {levels:[],complete:false};
 const current=history.at(-1);
 if(!current || when-current.ts>1.5*cadence)return {levels:[],complete:false};
 const total=new Map(current.f.rows.map(r=>[r.strike,0]));
 for(let i=0;i<stream.length;i++){
  const ed=stream[i],a=Math.max(start,ed.availableAt),b=Math.min(when,stream[i+1]?.availableAt??when);
  if(b<=a)continue;
  if(b-ed.ts>1.5*cadence || current.by.size!==ed.by.size)return {levels:[],complete:false};
  for(const [k,acc] of total){
   const v=normalized(ed.f,ed.by.get(k),'charm');
   if(!finite(v))return {levels:[],complete:false};
   total.set(k,acc+(b-a)*v/(60*M));
  }
 }
 return {levels:ranks([...total].map(([price,value])=>({price,value})),current.f.spot),complete:true};
}
function concentration(frame,metric) {
 const readings=frame?.rows?.map(r=>({price:r.strike,value:normalized(frame,r,metric)}))||[];
 return readings.length&&readings.every(r=>finite(r.value))?ranks(readings,frame.spot):[];
}
function modelPair(pack,selected,opts,cutoff) {
 const result={daily:null,intraday:null};
 const model=period(pack);if(!['daily','intraday'].includes(model))return result;
 result[model]={p:pack,h:selected};
 const other=model==='daily'?'intraday':'daily';
 const pool=(opts.companions||[]).filter(p=>p.id!==pack.id && period(p)===other && p.mode===pack.mode && same(p,pack,fields));
 if(pool.length===1 && pack.comparableId){
  const target=selected.at(-1),h=effectiveFrames(pool[0],cutoff,target.ts);
  if(coherent(pack,pool[0],target,h.at(-1)))result[other]={p:pool[0],h};
 }
 return result;
}
function charmPanels(pack,h,opts,cutoff,now) {
 const pair=modelPair(pack,h,opts,cutoff),d=pair.daily,i=pair.intraday;
 const avg=d?timeWeightedHour(d.h,cadenceOf(d.h,d.p),now):{levels:[],complete:false};
 const daily=avg.complete?avg.levels:d?concentration(d.h.at(-1).f,'charm'):[];
 const intra=i?concentration(i.h.at(-1).f,'charm'):[];
 const first=daily[0],second=intra[0];
 const unique=a=>a.length>0&&(a.length===1||Math.abs(a[0].value)!==Math.abs(a[1].value));
 const comparable=unique(daily)&&unique(intra);
 const atSame=comparable&&first.price===second.price,aligned=atSame&&Math.sign(first.value)===Math.sign(second.value);
 const label=!comparable?'Confronto in attesa':aligned?'Strike e segni concordi':atSame?'Stesso strike · segni opposti':'Livelli distinti';
 const note='Confronto fra il primo livello daily e il primo intraday. La corrispondenza indica uno strike condiviso.';
 const convergence={price:atSame?first.price:null,daily:first?.value??null,intraday:second?.value??null,dailyPrice:first?.price??null,
  intradayPrice:second?.price??null,aligned:comparable?aligned:null,label,note};
 const charmDaily={minutes:avg.complete?60:null,levels:daily.map(r=>({...r,label:avg.complete?'MEDIA 60 MIN':'SNAPSHOT DAILY'})),
  note:avg.complete?'Media temporale del charm sui 60 minuti precedenti. Ordinamento per valore assoluto, in ES eq./min.':
    'Con una sola edizione daily è disponibile il ranking istantaneo. La media richiede un’ora di copertura continua.'};
 const intraFrame=i?.h.at(-1)?.f;
 const session=intraFrame?.pmSettled&&intraFrame.expiry===day(now)?w.DeskCalendar10?.fixing?.(intraFrame.expiry):null;
 const lastTrade=finite(intraFrame?.lastTradeAt)?intraFrame.lastTradeAt:session?.verified&&session?.isSession?session.epochMs:null;
 const remaining=finite(lastTrade)?(lastTrade-now)/M:null;
 const phase=!intra.length?'In attesa':finite(remaining)&&remaining<=0?'Scadenza terminata':finite(remaining)&&remaining<=60?'Ultima ora · '+Math.ceil(remaining)+' min':'Intraday';
 const charmTactical={phase,levels:intra.map((r,j)=>({...r,name:'IDPIN'+(j+1),label:'CONCENTRAZIONE',
  aligned:unique(daily)?daily[0].price===r.price&&Math.sign(daily[0].value)===Math.sign(r.value):null})),note:'Concentrazioni del charm nell’ultima edizione intraday, in ES eq./min.'};
 return {convergence,charmDaily,charmTactical};
}
function deltaPanel(frame) {
 const vals=frame.rows.map(r=>({price:r.strike,delta:normalized(frame,r,'delta'),raw:r})),a=vals.map(v=>v.delta);
 const net=sumComplete(a),complete=finite(net),paired=complete&&frame.rows.every(r=>finite(r.putDelta)&&finite(r.callDelta)&&Math.abs(r.putDelta+r.callDelta-r.delta)<=.011+1e-9*Math.abs(r.delta));
 const puts=paired?sumComplete(vals.map(r=>r.raw.putDelta*frame.factors.delta)):null,calls=paired?sumComplete(vals.map(r=>r.raw.callDelta*frame.factors.delta)):null;
 const nearest=sign=>positive(frame.spot)?vals.filter(v=>finite(v.delta)&&Math.sign(frame.spot-v.price)===sign&&Math.sign(-v.delta)===sign)
  .sort((a,b)=>Math.abs(a.price-frame.spot)-Math.abs(b.price-frame.spot)||Math.abs(b.delta)-Math.abs(a.delta))
  .slice(0,3).map(({price,delta})=>({price,delta,distance:price-frame.spot})):[];
 const nature=frame.kind==='signed_flow'?'flusso della finestra':'inventario';
 const note='Delta del '+nature+' in ES equivalenti. Rapporto |ΣΔ put| / |ΣΔ call| sulla coorte. I livelli usano −Δ sotto e sopra spot. '+(frame.kind==='inventory'?'La quantità misura l’hedge totale del book a neutralità iniziale; il ribilanciamento successivo dipende dallo shock.':'La quantità misura l’hedge teorico dei nuovi contratti identificati.');
 return {net,bias:!complete?'N/D':net>0?'Delta positivo':net<0?'Delta negativo':'Bilanciato',ratio:paired&&calls!==0?Math.abs(puts)/Math.abs(calls):null,
  min:complete?minOf(a):null,max:complete?maxOf(a):null,avg:complete?mean(a):null,supports:nearest(1),resistances:nearest(-1),note};
}
function tacticalPanel(frame,out) {
 const ok=!out.stale&&!out.clockMissing&&!out.reason;
 const proven=ok?out.rows.filter(r=>r.status==='confermato'&&['LONG','SHORT'].includes(r.direction)):[];
 const sides=new Set(proven.map(r=>r.direction)),bias=!ok?'SOSPESO':sides.size===1?[...sides][0]:sides.size>1?'MISTO':'NEUTRALE';
 const nonzero=out.rows.filter(r=>finite(r.localGamma)&&r.localGamma!==0).sort((a,b)=>Math.abs(b.localGamma)-Math.abs(a.localGamma)||a.strike-b.strike);
 const levels=positive(frame.spot)?nonzero.filter(r=>r.strike!==frame.spot).slice(0,3).map(r=>({price:r.strike,
  side:r.strike>frame.spot?'Resistance':'Support',strength:r.localGamma>0?'Smorzamento':'Amplificazione',value:r.localGamma})):[];
 const qualifier=out.reason||(sides.size===1?'Retest osservato e pressioni concordi':sides.size>1?'Retest di segno opposto fra i livelli':'Attendere il test del livello');
 return {pivot:null,regime:out.regime,gamma:finite(out.globalGamma)?(out.globalGamma>0?'Long':out.globalGamma<0?'Short':'Neutral'):null,
  charm:sumComplete(frame.rows.map(r=>normalized(frame,r,'charm'))),bias,qualifier,levels,
  note:'Gamma dal book identificato. Livelli ordinati per |gamma di inventario|. Il bias richiede conferma del prezzo; il pivot a gamma zero richiede una curva del medesimo book rispetto allo spot.'};
}
function momentumPanel(focus,history,cadence,now) {
 const windows=[15,30].map(minutes=>{const velocity=positive(focus)?timeWindow(history,focus,now,minutes,cadence):null;
  return {minutes,velocity,label:!finite(velocity)?'Copertura insufficiente':velocity>0?'Charm crescente':velocity<0?'Charm decrescente':'Stabile'};});
 const [a,b]=windows.map(p=>p.velocity);
 const prior=finite(a)&&finite(b)?2*b-a:null;
 const state=!finite(prior)?'N/D':a*prior<0?'Inversione':Math.abs(a)>Math.abs(prior)?'Accelerazione':Math.abs(a)<Math.abs(prior)?'Decelerazione':'Ritmo costante';
 return {focus,windows,strikes:positive(focus)?[{price:focus,velocity:a,state}]:[],
  note:'Variazione del charm per minuto allo strike focus. Le due metà della finestra 30m distinguono accelerazione e inversione; unità ES eq./min².'};
}
function projectionsPanel(h,focus,momentum,cadence,now,frame,out) {
 const horizons=[15,30,45,60],sr=out.rows.find(r=>r.strike===focus),row=frame.rows.find(r=>r.strike===focus);
 // Use the session calendar independently of the emission cadence. With a ten-minute feed
 // a 15-minute slope may be observable from interpolated endpoints even if the native
 // one-minute chart has no precomputed projection for the strike.
 const eligible=new Set((sr?.projection||[]).map(r=>r.minutes)),slope=momentum.windows[0].velocity;
 const session=w.DeskCalendar10?.fixing?.(day(now));
 const sessionEnd=session?.verified&&session.isSession&&finite(session.epochMs)?session.epochMs:null;
 const lastTrade=finite(frame.lastTradeAt)?frame.lastTradeAt:null;
 if(sessionEnd!==null){
  const boundary=lastTrade===null?sessionEnd:Math.min(sessionEnd,lastTrade);
  for(const minutes of horizons){if(now+minutes*M<=boundary)eligible.add(minutes);else eligible.delete(minutes);}
 }else if(lastTrade!==null){
  for(const minutes of [...eligible])if(now+minutes*M>lastTrade)eligible.delete(minutes);
 }
 const g0=normalized(frame,row,'gamma'),c0=normalized(frame,row,'charm');
 const gSlope=positive(focus)?timeWindow(h,focus,now,15,cadence,'gamma'):null;
 const usable=!out.stale&&!out.clockMissing&&!out.reason;
 const projection=horizons.map(minutes=>{
  const valid=usable&&eligible.has(minutes);
  const gamma=valid&&finite(g0)&&finite(gSlope)?g0+minutes*gSlope:null;
  const charm=valid&&finite(c0)&&finite(slope)?c0+minutes*slope:null;
  const trend=!finite(charm)?null:slope>0?'Charm crescente':slope<0?'Charm decrescente':'Stabile';
  return {minutes,gamma,charm,confidence:null,convergence:null,trend};
 });
 const any=projection.filter(r=>finite(r.charm)||finite(r.gamma)),through=maxOf(any.map(r=>r.minutes));
 const next=through?[[g0,gSlope,'gamma'],[c0,slope,'charm']].flatMap(([level,rate,type])=>{
  if(!finite(level)||!finite(rate)||rate===0||level===0)return [];
  const minutes=-level/rate;
  return minutes>0&&minutes<=through?[{minutes,type:'Attraversamento dello zero · '+type,description:'Se persiste il ritmo degli ultimi 15 minuti'}]:[];
 }).sort((a,b)=>a.minutes-b.minutes)[0]||null:null;
 return {quality:any.length?'Scenario lineare':'Copertura insufficiente',horizon:through,rows:projection,next,focus,
  note:'Scenario sullo strike focus: ultimo valore + variazione media degli ultimi 15m × orizzonte. Le percentuali richiedono una calibrazione storica su esiti osservati. Γ ES eq./pt SPX; charm ES eq./min.'};
}
function speedPanel(h,cadence,frame) {
 const a=h.at(-2),b=h.at(-1),watch=[];
 const factor=f=>positive(f.factors?.speed)&&f.gammaSign==='dealer_long_positive'&&f.perspective==='dealer';
 if(a&&b&&factor(a.f)&&factor(b.f)&&b.ts-a.ts<=1.5*cadence&&a.availableAt<=b.ts){
  for(const r of b.f.rows){
   const p=a.by.get(r.strike),u=p?.speed,v=r.speed;
   if(!finite(u)||!finite(v)||u===0||v===0||Math.sign(u)===Math.sign(v))continue;
   watch.push({price:r.strike,score:null,distance:positive(frame.spot)?r.strike-frame.spot:null,zone:null,from:u,to:v,
    regime:v>0?'Speed passata positiva':'Speed passata negativa'});
  }
 }
 watch.sort((a,b)=>Math.abs(a.distance??Infinity)-Math.abs(b.distance??Infinity)||a.price-b.price);
 const haveSpeed=!!b&&factor(b.f)&&b.f.rows.some(r=>finite(r.speed));
 const comparable=!!a&&haveSpeed&&factor(a.f)&&b.ts-a.ts<=1.5*cadence&&a.availableAt<=b.ts&&a.f.rows.some(r=>finite(r.speed)&&finite(b.by.get(r.strike)?.speed));
 return {counts:{confirmed:null,likely:null,watch:comparable?watch.length:null},confirmed:[],likely:[],watch,insights:watch.map(r=>({price:r.price,regime:r.regime})),
  note:haveSpeed?'Watch = cambio di segno della speed allo stesso strike tra edizioni contigue. Le classi OA confirmed (≥65) e likely (55–64) richiedono lo score originale.':'Per il monitor speed occorre una speed firmata in due snapshot confrontabili. Le soglie OA si applicano al punteggio del provider.'};
}
function calculate(pack,frame,out,rows,opts={}) {
 if(!pack || !frame || !out?.ok || frame.ts!==out.asof||frame.availableAt!==out.availableAt||!gridOK(frame))return {};
 const asof=frame.ts,cutoff=finite(opts.cutoff)?opts.cutoff:Math.max(asof,frame.availableAt);
 if(frame.ts>cutoff||frame.availableAt>cutoff)return {};
 const history=effectiveFrames(pack,cutoff,asof);
 if(!history.length||history.at(-1).ts!==asof||history.at(-1).availableAt!==frame.availableAt)return {};
 const priceRows=frame.rows.map(r=>r.strike),cadence=cadenceOf(history,pack),charm=charmPanels(pack,history,opts,cutoff,asof);
 const focus=positive(opts.focus)&&priceRows.includes(opts.focus)?opts.focus:charm.charmTactical.levels[0]?.price??
  (positive(frame.spot)?frame.rows.reduce((a,b)=>Math.abs(b.strike-frame.spot)<Math.abs(a.strike-frame.spot)?b:a).strike:null);
 const momentum=momentumPanel(focus,history,cadence,asof);
 const header={title:'SPX · Flussi per strike',spot:value(out.spot),es:value(out.esSpot),basis:value(out.basis),range:[minOf(priceRows),maxOf(priceRows)],
  coordinate:'SPX',asof:new Date(asof).toISOString(),scope:frame.scope||frame.expiry,regime:out.regime,regimePct:value(out.gammaBalancePct),regimeConfidence:null,
  regimeMinutes:positive(pack.windowMinutes)?pack.windowMinutes:null,refreshMinutes:null,note:'Data e ora dello snapshot. La percentuale di regime è il rapporto fra gamma netta e gamma lorda del book identificato.'+(frame.scope==='0DTE'?' Le letture 0DTE si riferiscono all’ora esposta.':'')};
 return {header,...charm,tactical:tacticalPanel(frame,out),delta:deltaPanel(frame),momentum,
  projections:projectionsPanel(history,focus,momentum,cadence,asof,frame,out),speed:speedPanel(history,cadence,frame)};
}
w.OAPanels=Object.freeze({calculate});
})(window);

