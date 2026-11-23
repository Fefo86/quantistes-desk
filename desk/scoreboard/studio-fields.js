

(function(w){
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=['delta','gamma','vanna','charm','speed','color'],metrics=[...main,'vega','theta','rho','epsilon','vomma','veta','vera','zomma','ultima','dual_delta','dual_gamma','lambda'];
const colors={delta:'#87bbff',gamma:'#edb675',vanna:'#c0a5ef',charm:'#7ed5df',speed:'#76d2a7',color:'#f29aa1'};
const kinds={signed_flow:'Flusso firmato',inventory:'Inventario firmato',provider_field:'Campo pubblicato'};
const units={delta:'ES equivalenti',gamma:'ES / punto SPX',vanna:'ES / punto vol',charm:'ES / minuto',speed:'ES / punto SPX²',color:'ES / punto SPX / minuto'};
const escPlot=s=>esc(s).slice(0,230);
const present=v=>v!==null&&v!==undefined&&(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
let books=[],selected='native',revision=0,importTime=-1,native=null,csvProjection=null,clock=0,csvClock=0,archiveTimeSet=false,csvTimeSet=false,ladRef=null,ladBook=null,modelMode='2D';
const last=new WeakMap(),sources=new WeakMap();
function parse(o){
 if(o?.schema!=='quantistes.greek_fields.v1'||!Array.isArray(o.series)||!o.series.length||o.series.length>250)throw Error('Atteso quantistes.greek_fields.v1 con 1–250 serie.');
 const ids=new Set();let count=0;
 return o.series.map((s,i)=>{
  const fail=m=>{throw Error('Serie '+(i+1)+' · '+m);};
  if(!s||!['spot','strike'].includes(s.coordinate)||!Object.hasOwn(kinds,s.kind)||typeof s.source!=='string'||!s.source.trim()||s.underlying!=='SPX'||!/^\d{4}-\d\d-\d\d$/.test(s.expiry)&&s.expiry!=='ALL'||!Array.isArray(s.rows)||!s.rows.length||!s.units)fail('dichiarare fonte, SPX, coordinate, scadenza, unità e osservazioni.');
  if(s.expiry!=='ALL'&&(!Number.isFinite(Date.parse(s.expiry+'T00:00:00Z'))||new Date(s.expiry+'T00:00:00Z').toISOString().slice(0,10)!==s.expiry))fail('scadenza non valida.');
  if(s.kind==='signed_flow'&&(!s.window_minutes||!Number.isInteger(s.window_minutes)||s.window_minutes<1||s.window_minutes>1440))fail('specificare window_minutes per i flussi.');
  const lastTradeAt=s.last_trade_at==null?null:w.DeskMeasures.stamp(s.last_trade_at),optionClass=s.option_class||null;
  if(s.last_trade_at!=null&&(lastTradeAt===null||s.expiry!=='ALL'&&w.DeskMeasures.clock(s.last_trade_at).date>s.expiry))fail('Ultimo orario di negoziazione privo di fuso o successivo alla scadenza.');
  if(optionClass&&!['SPX','SPXW'].includes(optionClass)||s.pm_settled!=null&&typeof s.pm_settled!=='boolean'||optionClass==='SPXW'&&s.pm_settled===false)fail('Classe opzioni o settlement incoerente.');
  const pmSettled=s.pm_settled??(optionClass==='SPXW'?true:null);
  const seriesKey=JSON.stringify([s.source,s.kind,s.coordinate,s.expiry,s.window_minutes||0,s.participant||null,s.timeframe||null,s.comparable_id||null,s.data_origin||'observed',optionClass,lastTradeAt,pmSettled]);const key=[s.source,s.kind,s.coordinate,s.expiry,s.window_minutes||0,...[optionClass,lastTradeAt!=null&&'stop='+new Date(lastTradeAt).toISOString(),s.participant&&'lato='+s.participant,s.timeframe&&'timeframe='+s.timeframe,s.comparable_id&&'series='+s.comparable_id,s.data_origin&&s.data_origin!=='observed'&&'data='+s.data_origin].filter(Boolean)].join(' / ');if(ids.has(seriesKey))fail('serie duplicata.');ids.add(seriesKey);
  if(s.charm_clock!=null&&!['calendar_elapsed','time_to_expiry'].includes(s.charm_clock))fail('Convenzione temporale del charm non riconosciuta.');
  if(s.pressure_sign!=null&&s.pressure_sign!=='buy_positive')fail('La pressione di copertura richiede buy_positive.');
  if(s.timeframe!=null&&!['daily','intraday'].includes(s.timeframe))fail('Timeframe non riconosciuto.');
  if(s.data_origin!=null&&!['observed','sample','synthetic'].includes(s.data_origin))fail('Natura della sorgente non riconosciuta.');
  const meta=new Map(),per=new Map(),covered=new Map(),available=new Map(),touch=new Set(),convention=String(s.convention||'').trim();
  if(!convention)fail('specificare la convenzione di segno e di scala.');
  for(const row of s.rows){
   if(++count>200000)fail('massimo 200.000 righe.');
   if(!present(row.x)||Number(row.x)<=0||w.DeskMeasures.stamp(row.asof)===null)fail('x o asof non valido.');
   const t=new Date(row.asof).toISOString(),x=Number(row.x);const av=row.available_at==null?Date.parse(t):w.DeskMeasures.stamp(row.available_at);if(!Number.isFinite(av)||av<Date.parse(t))fail('orario di disponibilità non valido.');available.set(t,Math.max(available.get(t)||0,av));
   if(s.expiry!=='ALL'&&t.slice(0,10)>s.expiry)fail('osservazione successiva alla scadenza.');
   if(row.mark||row.bar){
    const m=row.mark||{},bar=row.bar||null;
    const getPrice=(k,tm)=>{if(m[k]==null)return null;const stamp=w.DeskMeasures.stamp(m[tm]);if(!present(m[k])||Number(m[k])<=0||stamp===null||stamp>Date.parse(t)||Date.parse(t)-stamp>60000)fail('Prezzo o orario della quotazione non coevi.');return {v:Number(m[k]),ts:stamp};};
    const cash=getPrice('spot_spx','spot_asof'),es=getPrice('spot_es','es_asof');let closed=null;
    if(es&&(typeof m.es_contract!=='string'||!m.es_contract.trim()||!w.DeskMeasures.onTick(es.v)))fail('Per ES indicare il contratto della quotazione e un prezzo sul tick da 0,25.');
    if(bar){const start=w.DeskMeasures.stamp(bar.start),end=w.DeskMeasures.stamp(bar.end),v=['open','high','low','close'].map(k=>present(bar[k])?Number(bar[k]):NaN);
     if(bar.underlying!=='SPX'||start===null||end===null||start>=end||end!==Date.parse(t)||v.some(p=>!(p>0))||v[1]<Math.max(v[0],v[2],v[3])||v[2]>Math.min(v[0],v[1],v[3]))fail('La barra richiede SPX e OHLC chiuso al timestamp dello snapshot.');
     closed={start,end,open:v[0],high:v[1],low:v[2],close:v[3]};}
    if(cash&&closed&&cash.ts===closed.end&&cash.v!==closed.close)fail('Spot SPX e chiusura della barra discordanti al medesimo orario.');
    const z={cash,es,esContract:es?m.es_contract.trim():null,bar:closed};
    if(meta.has(t)&&JSON.stringify(meta.get(t))!==JSON.stringify(z))fail('Quotazioni o barre discordanti nello stesso snapshot.');meta.set(t,z);
   }
   const tags=metrics.filter(g=>Object.hasOwn(row,g)&&row[g]!=null);
   if(!tags.length&&row.delta_pressure==null&&row.charm_pressure==null)fail('nessuna greca o pressione presente.');if(!covered.has(t))covered.set(t,new Set());for(const g of tags)covered.get(t).add(g);
   const usingContracts=row.signed_qty!=null||row.multiplier!=null;
   if(usingContracts&&(s.kind==='provider_field'||!present(row.signed_qty)||!Number.isInteger(Number(row.signed_qty))||!present(row.multiplier)||Number(row.multiplier)<=0||!String(row.leg_id||'').trim()))fail('sono obbligatori signed_qty, multiplier positivo e leg_id univoco.');
   const leg=usingContracts?String(row.leg_id):'@aggregate',uid=t+'|'+x+'|'+leg;if(touch.has(uid))fail('riga o leg_id duplicati.');touch.add(uid);
   if(!per.has(t))per.set(t,new Map());const time=per.get(t);if(!time.has(x))time.set(x,{});const dest=time.get(x);
   for(const k of ['delta_pressure','charm_pressure'])if(row[k]!=null){
    if(usingContracts||!present(row[k])||!s.units[k]||s.pressure_sign!=='buy_positive'||Object.hasOwn(dest,k))fail('Pressione hedge non verificabile per strike.');
    dest[k]=Number(row[k]);
   }
   if(usingContracts){const keys=tags.join('|');if(dest._components&&dest._components!==keys)fail('copertura delle greche diversa tra contratti dello stesso aggregato.');dest._components=keys;}
   for(const g of tags){
    if(!present(row[g])||typeof s.units[g]!=='string'||!s.units[g].trim())fail('valore o unità assenti per '+g);
    if(usingContracts&&g==='lambda')fail('lambda richiede una misura aggregata del provider con definizione esplicita.');
    if(dest[g]!==undefined&&(!usingContracts||dest['_'+g]!==true))fail('aggregato duplicato o mescolato a contributi individuali.');
    const value=Number(row[g])*(usingContracts?Number(row.signed_qty)*Number(row.multiplier):1);if(!Number.isFinite(value+(dest[g]||0)))fail('valore fuori scala.');
    dest[g]=(dest[g]||0)+value;dest['_'+g]=usingContracts;
   }
  }
  return {seriesKey,optionClass,lastTradeAt,pmSettled,meta,charmClock:s.charm_clock||null,windowMinutes:s.window_minutes||null,timeframe:s.timeframe||null,comparableId:s.comparable_id||null,dataOrigin:s.data_origin||'observed',pressureSign:s.pressure_sign||null,id:'u'+i,label:key,participant:s.participant,coverage:s.coverage,gammaSign:s.gamma_sign,available,kind:s.kind,coordinate:s.coordinate,expiry:s.expiry,source:s.source,units:Object.fromEntries([...metrics,'delta_pressure','charm_pressure'].filter(k=>typeof s.units[k]==='string').map(k=>[k,s.units[k]])),convention,times:[...per.keys()].sort(),per,covered};
 });
}
function parseCSV(text){
 const table=w.CVIData.csv(text),keys=table.shift()?.map(k=>k.toLowerCase());
 if(!keys||new Set(keys).size!==keys.length||['source','kind','coordinate','expiry','underlying','convention','asof','x','metric','value','unit'].some(k=>!keys.includes(k)))throw Error('Colonne CSV richieste: source, kind, coordinate, expiry, underlying, convention, asof, x, metric, value, unit.');
 const series=new Map();for(const [i,cells] of table.entries()){if(cells.length!==keys.length)throw Error('CSV · numero di colonne alla riga '+(i+2));const r=Object.fromEntries(keys.map((k,j)=>[k,cells[j]])),g=r.metric.toLowerCase();if(![...metrics,'delta_pressure','charm_pressure'].includes(g))throw Error('Greca ignota alla riga '+(i+2));
  const id=JSON.stringify([r.source,r.kind,r.coordinate,r.underlying,r.expiry,r.window_minutes||'',r.convention,r.participant||'',r.timeframe||'',r.comparable_id||'',r.data_origin||'',r.option_class||'',r.last_trade_at||'',r.pm_settled||'']);
  if(!series.has(id))series.set(id,{source:r.source,kind:r.kind,coordinate:r.coordinate,underlying:r.underlying,expiry:r.expiry,window_minutes:r.window_minutes?Number(r.window_minutes):undefined,convention:r.convention,participant:r.participant||undefined,coverage:r.coverage||undefined,gamma_sign:r.gamma_sign||undefined,pressure_sign:r.pressure_sign||undefined,charm_clock:r.charm_clock||undefined,timeframe:r.timeframe||undefined,comparable_id:r.comparable_id||undefined,data_origin:r.data_origin||undefined,option_class:r.option_class||undefined,last_trade_at:r.last_trade_at||undefined,pm_settled:r.pm_settled==null||r.pm_settled===''?undefined:r.pm_settled==='true'?true:r.pm_settled==='false'?false:r.pm_settled,units:{},points:new Map()});
  const s=series.get(id);if(['participant','coverage','gamma_sign','pressure_sign','charm_clock'].some(k=>(r[k]||'')!==(s[k]||'')))throw Error('Provenienza o segno discordanti alla riga '+(i+2));if(s.units[g]&&s.units[g]!==r.unit)throw Error('Unità discordanti per '+g);s.units[g]=r.unit;
  const key=JSON.stringify([r.asof,r.x,r.leg_id||'']);if(!s.points.has(key)){const o={asof:r.asof,x:r.x,available_at:r.available_at||undefined};for(const k of ['leg_id','signed_qty','multiplier'])if(r[k])o[k]=r[k];s.points.set(key,o);}const p=s.points.get(key);
  if((r.available_at||'')!==(p.available_at||''))throw Error('Disponibilità discordante alla riga '+(i+2));if(Object.hasOwn(p,g)||String(p.signed_qty||'')!==(r.signed_qty||'')||String(p.multiplier||'')!==(r.multiplier||''))throw Error('Duplicato o quantità discordante alla riga '+(i+2));p[g]=r.value;
 }
 return {schema:'quantistes.greek_fields.v1',series:[...series.values()].map(({points,...s})=>({...s,rows:[...points.values()]}))};
}
function install(o){const next=parse(o);books=next;selected=next[0].id;importTime=-1;revision++;refresh();w.dispatchEvent(new CustomEvent('desk:dealer-fields'));return next.length;}
function pickLadder(){
 const l=w.QuantistesConfluence?.evidence?.()?.ladder||null;if(l===ladRef)return ladBook;ladRef=l;ladBook=null;if(!l?.signed)return null;
 const t=l.asof,m=new Map(l.rows.map(r=>[r.strike,Object.fromEntries(main.filter(g=>present(r[g])).map(g=>[g,Number(r[g])]))]));
 ladBook={id:'ladder',label:'Ladder firmata / '+l.expiry,coordinate:'strike',kind:'inventory',source:l.source,units,convention:l.provenance||'Convenzione dichiarata',expiry:l.expiry,times:[t],per:new Map([[t,m]])};revision++;return ladBook;
}
const isDerived = g => g === 'speed' || g === 'color';
const displayNumber = new Intl.NumberFormat('it-IT', {maximumFractionDigits: 5});
function modelMinute(value) {
  const match = /^(\d{2}):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?$/.exec(value);
  return match && +match[1] < 24 ? 60 * +match[1] + +match[2] + Number(match[3] || 0) / 60 : NaN;
}
function ordered(axis) {
  return axis.length > 0 && axis.every((value, i) => Number.isFinite(value) && (!i || value > axis[i - 1]));
}
// A partial derivative on a fixed scenario grid. Interior points use a three-point
// stencil with the actual spacings. At a boundary only the adjacent segment is used.
function slope(values, position, step, axis, i) {
  const n = axis.length;
  if (n < 2 || i < 0 || i >= n || !Number.isFinite(values[position])) return null;
  const here = values[position];
  const left = i > 0 ? (here - values[position - step]) / (axis[i] - axis[i - 1]) : null;
  const right = i + 1 < n ? (values[position + step] - here) / (axis[i + 1] - axis[i]) : null;
  if (i > 0 && !Number.isFinite(values[position - step])) return null;
  if (i + 1 < n && !Number.isFinite(values[position + step])) return null;
  const value = i === 0 ? right : i === n - 1 ? left :
    ((axis[i + 1] - axis[i]) * left + (axis[i] - axis[i - 1]) * right) / (axis[i + 1] - axis[i - 1]);
  return Number.isFinite(value) ? value : null;
}
function nativeBook(d) {
  if (!d?.spots?.length || !d.times?.length) return null;
  if (sources.has(d)) return sources.get(d);
  const x = d.spots, times = d.times, minutes = times.map(modelMinute), n = x.length, m = times.length;
  const validSpot = ordered(x), validTime = ordered(minutes);
  const hasGamma = d.gamma?.length === n * m, hasCharm = d.charm?.length === n * m;
  const upload = !!d.matrixImports;
  const fieldUnits = {};
  if (hasGamma) {
    fieldUnits.gamma = 'unità native Γ';
    if (validSpot && n > 1) fieldUnits.speed = 'unità Γ / punto SPX';
    if (validTime && m > 1) fieldUnits.color = 'unità Γ / min';
  }
  if (hasCharm) fieldUnits.charm = 'unità native charm';
  function value(g, t, s) {
    if (!fieldUnits[g] || !Number.isInteger(t) || !Number.isInteger(s) || t < 0 || s < 0 || t >= m || s >= n) return null;
    const at = t * n + s;
    if (g === 'speed') return slope(d.gamma, at, 1, x, s);
    if (g === 'color') return slope(d.gamma, at, n, minutes, t);
    return Number.isFinite(d[g]?.[at]) ? d[g][at] : null;
  }
  // The 2:1 scale is an empirical property of these two archived surfaces only.
  // Reconcile their numerical values before offering the charm comparison.
  let checked = false, check = null;
  function reconciliation() {
    if (checked) return check;
    checked = true;
    if (upload || !fieldUnits.speed || !fieldUnits.color || !hasCharm || n < 3 || m < 3 ||
        d.sourceDates?.gamma !== '2025-01-31' || d.sourceDates?.charm !== d.sourceDates.gamma ||
        d.source?.gamma !== 'daily_gamma_20250131.csv' || d.source?.charm !== 'daily_charm_20250131.csv') return null;
    let count = 0, maxError = 0, maxSignal = 0;
    for (let t = 1; t < m - 1; t++) {
      for (let s = 1; s < n - 1; s++) {
        const dc = slope(d.charm, t * n + s, 1, x, s), dt = value('color', t, s);
        if (dc === null || dt === null) return null;
        maxError = Math.max(maxError, Math.abs(dc - 2 * dt));
        maxSignal = Math.max(maxSignal, Math.abs(dt));
        count++;
      }
    }
    if (count && maxSignal > 1e-5 && maxError <= 1e-6) check = {factor: 2, count, maxError};
    return check;
  }
  function colorFromCharm(t, s) {
    if (t <= 0 || s <= 0 || t >= m - 1 || s >= n - 1 || !reconciliation()) return null;
    const derivative = slope(d.charm, t * n + s, 1, x, s);
    return derivative === null ? null : derivative / check.factor;
  }
  const rows = new Map();
  function profileAt(g, t) {
    if (!fieldUnits[g] || !Number.isInteger(t) || t < 0 || t >= m) return null;
    const key = g + '/' + t;
    if (rows.has(key)) return rows.get(key);
    const sourceGreek = isDerived(g) ? 'gamma' : g;
    const modelDate = d.sourceDates?.[sourceGreek];
    const y = isDerived(g) ? x.map((_, s) => value(g, t, s)) : d[g].slice(t*n, (t+1)*n);
    if (!y.some(Number.isFinite)) return null;
    const row = {x, y, time: modelDate ? modelDate+' '+times[t] : times[t]};
    if (n*m <= 450000) rows.set(key, row);
    return row;
  }
  const model = {id:upload?'projection-csv':'native', label:upload?'CSV / proiezione SPX':'OptionsDepth / scenario storico',
    kind:'provider_field',coordinate:'spot',expiry:'ALL',source:upload?'CSV di scenario':'OptionsDepth',
    units:fieldUnits,convention:'Scala e segno della fonte',times,d,value,profileAt,reconciliation,colorFromCharm};
  sources.set(d,model);
  return model;
}
function choices() {
  const data = w.FlowDesk?.fieldArchive?.(), archive = w.FlowDesk?.sampleProjection?.();
  if (archive) native = nativeBook(archive);
  if (data?.matrixImports) csvProjection = nativeBook(data);
  else if (data) native = nativeBook(data);
  return [native,csvProjection,pickLadder(),...books].filter(Boolean);
}
function nearestSpot(xs, spot) {
  let low=0, high=xs.length-1;
  while(high-low>1){const mid=Math.floor((high+low)/2);if(xs[mid]<=spot)low=mid;else high=mid;}
  return Math.abs(xs[low]-spot)<=Math.abs(xs[high]-spot)?low:high;
}
function scenarioPoint(d, t, spot) {
  const b=nativeBook(d);
  if(!b || !Number.isFinite(spot) || !Number.isInteger(t) || t<0 || t>=b.times.length ||
     spot<d.spots[0] || spot>d.spots.at(-1)) return null;
  const s=nearestSpot(d.spots,spot);
  return {source:b.source, date:d.sourceDates?.gamma||null, time:b.times[t], spot:d.spots[s],
    speed:b.value('speed',t,s),color:b.value('color',t,s),units:b.units};
}
function scenarioEvidence() {
  const list=choices(), b=list.find(v=>v.id===selected && v.d) || csvProjection || native;
  if(!b?.d) return null;
  const d=b.d, anchor=b.id==='native'?d.sourceAnchor:null;
  const inRange=Number.isFinite(anchor) && anchor>=d.spots[0] && anchor<=d.spots.at(-1);
  const point=scenarioPoint(d, Math.max(0,Math.min(b.times.length-1,b.id==='native'?clock:csvClock)),
    inRange?anchor:d.spots[Math.floor(d.spots.length/2)]);
  return point&&(point.speed!==null||point.color!==null)?{...point,reference:inRange?'riferimento fonte':'centro griglia'}:null;
}

function profile(b,g,i){
 if(!b||!b.units[g])return null;const t=b.times[i];if(t==null)return null;
 if(b.d)return (b.profileAt?b:nativeBook(b.d))?.profileAt(g,i) || null;
 const pairs=[...(b.per.get(t)||[])].filter(([,v])=>Number.isFinite(v[g])).sort((a,b)=>a[0]-b[0]);if(!pairs.length)return null;return {x:pairs.map(p=>p[0]),y:pairs.map(p=>p[1][g]),time:t};
}
function lattice(b,g){
 if(!b||!b.units[g])return null;
 if(b.d){
  const source=b.profileAt?b:nativeBook(b.d),x=b.d.spots,m=b.times.length;
  if(x.length*m>450000)throw Error('La griglia supera 450.000 celle. Il profilo per singolo orario è disponibile.');
  const rows=b.times.map((_,t)=>source.profileAt(g,t));
  if(!rows.some(Boolean))return null;
  const date=b.d.sourceDates?.[isDerived(g)?'gamma':g]||'';
  return {x,times:b.times.map(t=>(date?date+' ':'')+t),z:rows.map(row=>row?.y||Array(x.length).fill(null))};
 }
 const series=b.times.map((_,i)=>profile(b,g,i)),ok=series.map((p,i)=>p?i:-1).filter(i=>i>=0);
 if(!ok.length)return null;
 const x=[...new Set(ok.flatMap(i=>series[i].x))].sort((a,b)=>a-b),times=ok.map(i=>series[i].time);
 if(x.length*times.length>450000)throw Error('La griglia eccede 450.000 celle. Seleziona una finestra più corta nel file.');
 return {x,times,z:ok.map(i=>{const p=series[i],map=new Map(p.x.map((v,j)=>[v,p.y[j]]));return x.map(v=>map.get(v)??null);})};
}
function controls(surface=false){
 return '<div class="field-tools"><label>Fonte / coordinata<select data-studio-source></select></label>'+(surface?'<label>Greca<select id="stFieldGreek">'+metrics.map(g=>'<option value="'+g+'" '+(g==='gamma'?'selected':'')+'>'+g.toUpperCase()+'</option>').join('')+'</select></label><label>Vista<select id="stFieldMode"><option>2D</option><option>3D</option></select></label>':'')+'<label>Osservazione<select data-studio-time></select></label></div>';
}
function sync(list,b,i){document.querySelectorAll('[data-studio-source]').forEach(el=>{const sig=list.map(v=>v.id+v.label).join('|');if(el._sig!==sig){el._sig=sig;el.innerHTML=list.length?list.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.label)+'</option>').join(''):'<option value="native">In attesa dei dati</option>';}el.value=b?.id||'native';});
 document.querySelectorAll('[data-studio-time]').forEach(el=>{if(el._book!==b){el._book=b;el.innerHTML=b?.times.map((t,j)=>'<option value="'+j+'">'+esc(t)+'</option>').join('')||'<option>—</option>';}if(b)el.value=String(i);});}
const axis=title=>({title:{text:title,standoff:15},automargin:true,showspikes:true,spikemode:'across',spikesnap:'cursor',showline:true,gridcolor:'#1f3b54',zerolinecolor:'#5b7791'});
function plot(el,traces,layout){const cfg={displaylogo:false,responsive:true,scrollZoom:true,modeBarButtonsToRemove:['select2d','lasso2d'],toImageButtonOptions:{format:'png',scale:2,filename:'Quantistes_Campo'}};
 const base={autosize:true,height:el.id==='stSurface'?480:346,margin:{l:72,r:30,t:30,b:70},paper_bgcolor:'#0e1924',plot_bgcolor:'#0e1924',font:{family:'Consolas',color:'#ece4cd',size:11},showlegend:false,hovermode:'closest',uirevision:el.id+':'+selected,...layout};
 if(w.Plotly){const render=last.get(el),result=w.Plotly.react(el,traces,base,cfg);result?.catch?.(e=>{if(last.get(el)===render){el.textContent=e.message;last.delete(el);}});}}
function empty(el,g,b,detail){if(el.classList.contains('js-plotly-plot'))w.Plotly?.purge(el);el.innerHTML='<div class="field-empty"><span>'+esc(g.toUpperCase())+'</span><strong>Campo non disponibile</strong><p>'+esc(detail||('Per '+(b?.label||'questa fonte')+' serve una serie '+g+' con coordinate, orario e unità dichiarati.'))+'</p></div>';}
function scenarioCaption(b,g) {
  if (!b?.d || !isDerived(g)) return '';
  if (g==='speed') return 'Variazione di Γ per un punto SPX, a orario fisso. Agli estremi di prezzo la stima usa il solo intervallo adiacente.';
  const r=b.reconciliation();
  const base='Variazione di Γ per minuto trascorso, a spot fisso. Al primo e all’ultimo orario la stima usa il solo intervallo adiacente.';
  return r?base+' Nel campione del 31/01/2025, (∂Charm/∂S) ÷ 2 coincide con ∂Γ/∂t sui '+r.count.toLocaleString('it-IT')+' nodi interni.':base;
}
function scenarioHover(b,g,t,s,verified) {
  const edge=g==='speed'?(s===0||s===b.d.spots.length-1):(t===0||t===b.times.length-1);
  let line='<br>Stima '+(edge?'unilaterale al bordo':'centrata');
  if(verified){
    const v=b.colorFromCharm(t,s);
    if(v!==null)line+='<br>Color da charm ÷ 2 · '+displayNumber.format(v)+' Γ/min';
  }
  return line;
}

function view(id,b,g,i,mode='line'){
 const el=$(id);if(!el||!el.getClientRects().length||el.clientWidth<40)return;
 const tag=[revision,b?.id,g,mode,mode==='line'?i:'*',b?.times.length].join('|');
 const previous=last.get(el);if(previous?.tag===tag&&previous.book===b)return;
 last.set(el,{tag,book:b});
 const isLine=mode==='line',p=profile(b,g,i);let lat=null;try{if(!isLine)lat=lattice(b,g);}catch(e){empty(el,g,b,e.message);return;}
 if((isLine&&!p)||(!isLine&&!lat)){const meta=$(id+'Meta');if(meta)meta.textContent='';empty(el,g,b);return;}
 const model=b.d && isDerived(g) ? (b.value?b:nativeBook(b.d)) : null;
 const horizontal=b.coordinate==='spot'?'Spot di scenario SPX':'Strike SPX',unit=escPlot(b.units[g]),gname=g.toUpperCase()+(model?' DI SCENARIO':'');
 let layout={xaxis:axis(horizontal),yaxis:axis(unit)},traces=[];
 if(!isLine&&lat.x.length===1&&lat.times.length>1){const x=lat.times,y=lat.z.map(z=>z[0]);layout.xaxis=axis('Orologio fonte');layout.xaxis.nticks=5;traces=[{type:'scatter',mode:'lines+markers',x,y,connectgaps:false,name:gname,line:{color:colors[g]||'#8cb6ed'},hovertemplate:horizontal+' '+lat.x[0]+'<br>%{x}<br>'+gname+' %{y:,.6g} '+unit+'<extra></extra>'}];}
 else if(isLine||lat.times.length===1){
  const curve=p||(!isLine?{x:lat.x,y:lat.z[0],time:lat.times[0]}:null);
  if(!curve){empty(el,g,b);return;}
  traces=[{type:'scatter',mode:curve.x.length>45?'lines':'lines+markers',x:curve.x,y:curve.y,connectgaps:false,marker:{size:5},line:{color:colors[g]||'#aecdf7',width:2.4},name:gname,hovertemplate:horizontal+' %{x:,.2f}<br>'+gname+' %{y:,.6g} '+unit+'<br>'+escPlot(curve.time)+'<extra></extra>'}];
  layout.hovermode='x unified';layout.shapes=[{type:'line',xref:'paper',x0:0,x1:1,y0:0,y1:0,line:{color:'#7d98b1',dash:'dot',width:1}}];layout.yaxis.zeroline=true;
 }else{
  const t=lat.times,z=lat.z,scale=[[0,'#ed969f'],[.25,'#955e71'],[.5,'#152635'],[.75,'#397e80'],[1,'#83dcc0']];
  let mx=0;for(const row of z)for(const val of row)if(val!=null)mx=Math.max(mx,Math.abs(val));mx=mx||1;
  if(mode==='3D'){traces=[{type:'surface',x:lat.x,y:t.map((_,j)=>j),z,customdata:t.map(v=>lat.x.map(()=>v)),colorscale:scale,cmin:-mx,cmax:mx,showscale:false,connectgaps:false,hovertemplate:horizontal+' %{x:,.2f}<br>%{customdata}<br>'+gname+' %{z:,.6g} '+unit+'<extra></extra>'}];const inds=[...new Set([0,Math.floor((t.length-1)/2),t.length-1])];layout.scene={xaxis:{title:horizontal},yaxis:{title:'Orologio fonte',tickvals:inds,ticktext:inds.map(j=>t[j].split(/[ T]/).at(-1).slice(0,8))},zaxis:{title:unit},camera:{eye:{x:1.65,y:-1.5,z:1.0}}};}
  else{traces=[{type:'heatmap',x:lat.x,y:t,z,zmin:-mx,zmax:mx,colorscale:scale,hoverongaps:false,connectgaps:false,showscale:true,colorbar:{thickness:10,len:.78,tickformat:'.2s'},hovertemplate:horizontal+' %{x:,.2f}<br>%{y}<br>'+gname+' %{z:,.6g} '+unit+'<extra></extra>'}];layout.yaxis=axis('Orologio fonte');layout.yaxis.nticks=6;layout.yaxis.type='category';layout.margin={l:120,r:58,b:62,t:24};}
 }
 if(model){
  const trace=traces[0],verify=g==='color'&&!!model.reconciliation();
  if(trace.type==='heatmap'||trace.type==='surface'){
    trace.text=lat.z.map((row,t)=>row.map((v,s)=>Number.isFinite(v)?scenarioHover(model,g,t,s,verify):''));
  }else if(!isLine && lat.x.length===1 && lat.times.length>1){
    trace.text=lat.z.map((row,t)=>Number.isFinite(row[0])?scenarioHover(model,g,t,0,verify):'');
  }else{
    trace.text=(p?.x||lat.x).map((_,s)=>scenarioHover(model,g,i,s,verify));
  }
  trace.hovertemplate=trace.hovertemplate.replace('<extra>','%{text}<extra>');
 }
 el.replaceChildren&& !el.classList.contains('js-plotly-plot')&&el.replaceChildren();plot(el,traces,layout);
 const info=$(id+'Meta');if(info)info.textContent=[model?'Stima di scenario':kinds[b.kind],b.d?.matrixImports?.[isDerived(g)?'gamma':g]?.name||b.source,
  b.expiry==='ALL'?'Scadenze aggregate':b.expiry,isLine?p?.time:lat.times[0]+' → '+lat.times.at(-1),
  model?scenarioCaption(model,g):b.convention].filter(Boolean).join(' · ');
}
function refresh(){
 const list=choices(),b=list.find(v=>v.id===selected)||(selected==='native'?list[0]:null);
 const i=b?Math.max(0,Math.min(b.times.length-1,b.id==='native'?clock:b.id==='projection-csv'?csvClock:importTime<0?b.times.length-1:importTime)):0;
 sync(list,b,i);for(const g of main)view('stOverview'+g,b,g,i);
 const sg=$('stFieldGreek')?.value||'gamma';modelMode=$('stFieldMode')?.value||'2D';view('stSurface',b,sg,i,modelMode);
 const ag=$('q16FlowMode')?.value||'gamma';view('q16FlowHeat',b,ag,i,'2D');view('q16FlowCurve',b,ag,i);
}
function nativeUpdate(d,t,selectSource=false,origin=''){
 if(!d)return;
 const b=nativeBook(d);if(!b)return;
 const active=w.QuantistesFlatDesk?.state?.()?.tool;
 const initial=b.id==='native'?!archiveTimeSet:!csvTimeSet;
 const updateTime=initial || selectSource || !origin || !active || origin===active;
 if(b.id==='native'){native=b;if(Number.isInteger(t)&&updateTime){clock=t;archiveTimeSet=true;}}
 else{csvProjection=b;if(Number.isInteger(t)&&updateTime){csvClock=t;csvTimeSet=true;}}
 if(selectSource)selected=b.id;
 refresh();
}
function template(){return {schema:'quantistes.greek_fields.v1',scalping:{greeks:'delta, gamma, charm, vanna',expiry:'Se disponibili, fornire option_class (SPX o SPXW), last_trade_at ISO con fuso, oppure pm_settled. SPX generico non identifica il settlement.',charm_clock:'calendar_elapsed oppure time_to_expiry',pressure:'Per DP e CP fornire delta_pressure e charm_pressure per strike, units e pressure_sign buy_positive. Utilizzare il lato dealer identificato.',regime:'Solo inventario dealer ALL con copertura full_book e gamma_sign dealer_long_positive.',quote:'In row.mark si possono dichiarare spot_spx, spot_asof, spot_es, es_asof, es_contract. In row.bar si può dichiarare underlying SPX, start, end, open, high, low, close. Orari ISO con fuso.'},guide:'Una serie per fonte, natura, coordinata, scadenza e finestra. Ogni valore è nella sua unità finale dichiarata. Per contributi individuali inserire greca per unità di sottostante, signed_qty, multiplier e leg_id univoco. Per la greca già scalata per contratto usare multiplier 1. Un aggregato non richiede quantità. Per signed_flow indicare la durata di osservazione in minuti. Nessuna conversione implicita di vol o tempo.',metrics,csv_columns:['source','kind','coordinate','expiry','underlying','convention','asof','x','metric','value','unit','window_minutes','leg_id (se per contratto)','signed_qty (se per contratto)','multiplier (se per contratto)','available_at','participant','coverage','gamma_sign','pressure_sign','charm_clock','timeframe','comparable_id','data_origin','option_class','pm_settled','last_trade_at'],series:[{underlying:'SPX',source:'',kind:'signed_flow',coordinate:'strike',expiry:'YYYY-MM-DD',window_minutes:5,convention:'',units:{delta:'',gamma:'',vanna:'',charm:'',speed:'',color:''},rows:[]}],row_fields:['asof (ISO con fuso)','x (strike oppure spot scenario)','delta, gamma, vanna, charm, speed, color o altra greca dichiarata']};}
function bind(){
 document.addEventListener('change',e=>{const t=e.target;if(t.matches('[data-studio-source]')){selected=t.value;importTime=-1;refresh();}else if(t.matches('[data-studio-time]')){if(selected==='native'||selected==='projection-csv'){
 const index=Number(t.value);if(selected==='native'){clock=index;archiveTimeSet=true;}else{csvClock=index;csvTimeSet=true;}
 const tool=w.QuantistesFlatDesk?.state?.()?.tool,csvActive=!!w.FlowDesk?.fieldArchive?.()?.matrixImports;
 const slider=$(selected==='native'&&tool==='gammaatlas'?'q16FlowTime':tool==='flow-overview'&&csvActive===(selected==='projection-csv')?'flowTime':'');if(slider){slider.value=String(index);slider.dispatchEvent(new Event('input',{bubbles:true}));}}else importTime=+t.value;refresh();}else if(['stFieldMode','stFieldGreek','q16FlowMode'].includes(t.id))refresh();});
}
function visibleAt(b,cut){for(let i=b.times.length-1;i>=0;i--){const t=b.times[i];if(Date.parse(t)<=cut&&(b.available?.get(t)??Date.parse(t))<=cut)return t;}return null;}
function dealerGamma(cut){if(!Number.isFinite(cut))return [];const out=[];
 for(const b of books){if(b.dataOrigin!=='observed'||b.participant!=='dealer'||b.coverage!=='full_book'||b.gammaSign!=='dealer_long_positive'||b.expiry!=='ALL'||b.coordinate!=='strike'||b.kind!=='inventory'||b.units.gamma!=='USD/1% SPX')continue;const t=visibleAt(b,cut);if(!t||!w.DeskMeasures.recent(Date.parse(t),cut,300))continue;
 const rows=[...b.per.get(t).values()];if(rows.length&&rows.every(r=>Number.isFinite(r.gamma)))out.push({source:b.source,asof:t,value:rows.reduce((n,r)=>n+r.gamma,0)});}return out;}
function installLive(payload,received=Date.now()){
 const obj={...payload,series:payload.series?.map(s=>({...s,rows:s.rows.map(r=>({...r,available_at:r.available_at??new Date(received).toISOString()}))}))};
 const incoming=parse(obj);const by=new Map(books.map(b=>[b.seriesKey,b]));let count=0;
 for(const b of incoming){if(b.times.some(t=>b.available.get(t)>received))throw Error('Il campo contiene osservazioni con disponibilità futura.');
  const old=by.get(b.seriesKey);if(!old){by.set(b.seriesKey,b);count+=b.times.length;continue;}
  if(old.charmClock!==b.charmClock||old.pressureSign!==b.pressureSign||old.convention!==b.convention||old.coverage!==b.coverage||old.participant!==b.participant||old.gammaSign!==b.gammaSign||Object.keys({...b.units,...old.units}).some(k=>b.units[k]!==old.units[k]))throw Error('Definizione o unità della serie live cambiate.');
  const next={...old,meta:new Map(old.meta),per:new Map(old.per),covered:new Map(old.covered),available:new Map(old.available)};
  for(const t of b.times){if(next.per.has(t)){const a=next.per.get(t),n=b.per.get(t);if(JSON.stringify(old.meta.get(t))!==JSON.stringify(b.meta.get(t))||a.size!==n.size||[...n].some(([x,row])=>!a.has(x)||[...metrics,'delta_pressure','charm_pressure'].some(g=>a.get(x)[g]!==row[g])))throw Error('Revisione al medesimo timestamp: conserva la versione precedente e usa una serie distinta per la rettifica.');continue;}
    count++;if(b.meta.has(t))next.meta.set(t,b.meta.get(t));next.per.set(t,b.per.get(t));next.covered.set(t,b.covered.get(t));next.available.set(t,b.available.get(t));}
  next.times=[...next.per.keys()].sort();by.set(b.seriesKey,next);
 }
 if(count){const selectKey=books.find(b=>b.id===selected)?.seriesKey;books=[...by.values()].map((b,i)=>({...b,id:'u'+i}));selected=(books.find(b=>b.seriesKey===selectKey)||books[0]).id;revision++;importTime=-1;refresh();w.InstitutionalDesk?.refreshPlaybooks?.();w.dispatchEvent(new CustomEvent('desk:dealer-fields'));}return count;
}
let savedSummary=null;
function describe(cut){
 const cutoff=Number.isFinite(cut)?new Date(cut).toISOString():null;
 if(savedSummary?.cutoff===cutoff&&savedSummary.data.revision===revision&&savedSummary.data.source===selected)return savedSummary.data;
 const eligible=cutoff?books.filter(b=>b.dataOrigin==='observed'):books;const metrics=eligible.map(b=>{const at=cutoff?visibleAt(b,cut):b.times.at(-1);return {source:b.source,kind:b.kind,coordinate:b.coordinate,expiry:b.expiry,last:at||null,metrics:at?[...b.covered.get(at)]:[]};});
 const data={series:eligible.length,source:selected,revision,metrics};savedSummary={cutoff,data};return data;
}
w.DeskFields=Object.freeze({strikeBooks:()=>books.filter(b=>b.coordinate==='strike'),scalpRevision:()=>revision,metrics,main,parse,parseCSV,install,installLive,dealerGamma,template,controls,refresh,nativeUpdate,profile,lattice,view,bind,scenarioPoint,scenarioEvidence,summary:describe});
})(window);


