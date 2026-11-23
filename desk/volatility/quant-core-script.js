/* Quantistes Volatility Desk — auditable local numerical engine.
 * No network dependencies. Price-space C2 cubic spline with nonnegative
 * piecewise-linear density. This is NOT a proprietary fund model.
 * Implementation prepared for the Quantistes project.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuantCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
'use strict';
const VERSION='3.0.0-cvi-mark', YEAR=365*86400000;
const finite=Number.isFinite, sum=a=>a.reduce((s,v)=>s+v,0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function median(a){const b=a.filter(finite).slice().sort((a,b)=>a-b);return b.length?(b[(b.length-1)>>1]+b[b.length>>1])/2:NaN;}
function weightedMedian(a,w){const ix=a.map((_,i)=>i).sort((i,j)=>a[i]-a[j]);const half=sum(w)/2;let c=0;for(const i of ix){c+=w[i];if(c>=half)return a[i];}return a[ix[ix.length-1]];}
function number(s) {
  if(typeof s==='number')return finite(s)?s:NaN;
  if(s==null)return NaN;
  let t=String(s).trim().replace(/[\u2212\u2013]/g,'-').replace(/[\s\u00a0%$€']/g,'');
  if(!t || /^(na|nan|null|none|n\/a|--|-)$/i.test(t))return NaN;
  if(/^\(.*\)$/.test(t))t='-'+t.slice(1,-1);
  const c=t.lastIndexOf(','),d=t.lastIndexOf('.');
  if(c>=0&&d>=0)t=c>d?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');
  else if(c>=0){if((t.match(/,/g)||[]).length>1)t=t.replace(/,/g,'');else t=t.replace(',','.');}
  return Number(t);
}
function canonical(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function records(text,delimiter){
  text=String(text).replace(/^\ufeff/,''); const rows=[];let row=[],v='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(v);v='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))rows.push(row);row=[];v='';}
    else v+=c;
  }
  if(quoted)throw new Error('CSV: virgolette non chiuse. Riesporta il file senza troncarlo.');
  if(v.length||row.length){row.push(v);if(row.some(x=>x.trim()))rows.push(row);}
  return rows;
}
function table(text){
  const ds=[',',';','\t','|']; let best=null;
  for(const d of ds){
    let r;try{r=records(text,d);}catch(e){continue;}
    let idx=r.findIndex(v=>v.some(s=>['strike','strikeprice','prezzostrike','exerciseprice'].includes(canonical(s)))||
      (v.some(s=>['time','timestamp','date','datetime','data'].includes(canonical(s)))&&v.some(s=>['close','chiusura','last','underlyingprice'].includes(canonical(s)))));
    if(idx<0)continue;
    const score=r[idx].length;if(!best||score>best.score)best={delimiter:d,rows:r.slice(idx+1),headers:r[idx].map(s=>s.trim()),score,preamble:idx};
  }
  if(!best)throw new Error('Intestazione CSV non riconosciuta. Opzioni: strike + right/type + IV oppure bid/ask. Prezzi: time + open/high/low/close.');
  return best;
}
function dateText(s){
  if(s==null)return '';
  let t=String(s).trim();
  if(/^\d{8}$/.test(t))return t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8);
  if(/^\d{4}-\d{2}-\d{2}/.test(t))return t.slice(0,10);
  let m=t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
}
const nyFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function nyFormat(ms){
  const parts=nyFormatter.formatToParts(new Date(ms));
  const p={};parts.forEach(x=>p[x.type]=x.value);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
function timestampText(s){
  if(s==null||!String(s).trim())return '';
  const t=String(s).trim();
  const zoned=ms=>finite(ms)?nyFormat(ms)+'.'+String((ms%1000+1000)%1000).padStart(3,'0'):'';
  if(/^\d{10}(\.\d+)?$/.test(t))return zoned(Math.round(Number(t)*1000));
  if(/^\d{13}$/.test(t))return zoned(Number(t));
  if(/[zZ]$|[+-]\d\d:\d\d$/.test(t))return zoned(Date.parse(t));
  const d=dateText(t);if(!d)return '';
  const midnight=Date.parse(d+'T00:00:00Z');if(!finite(midnight)||new Date(midnight).toISOString().slice(0,10)!==d)return '';
  const m=t.match(/[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if(!m)return d+'T16:00:00';
  if(+m[1]>23||+m[2]>59||+(m[3]||0)>59)return '';
  return d+'T'+m[1].padStart(2,'0')+':'+m[2]+':'+(m[3]||'00')+(m[4]?'.'+m[4].slice(0,3).padEnd(3,'0'):'');
}
const epochCache=new Map();
function nyEpoch(text){
  if(epochCache.has(text))return epochCache.get(text);
  const s=timestampText(text);if(!s)return NaN;
  const target=Date.parse(s+'Z');if(!finite(target))return NaN;
  const ms=target%1000,seconds=target-ms;let t=seconds;
  for(let i=0;i<3;i++){const local=Date.parse(nyFormat(t)+'Z');t+=seconds-local;}
  if(nyFormat(t).slice(0,19)!==s.slice(0,19))return NaN;
  if(epochCache.size>=12000)epochCache.clear();
  epochCache.set(text,t+ms);return t+ms;
}
function nextWeekday(d){let t=new Date(d+'T12:00:00Z');do{t.setUTCDate(t.getUTCDate()+1);}while(t.getUTCDay()===0||t.getUTCDay()===6);return t.toISOString().slice(0,10);}
const aliases={
  strike:['strike','strikeprice','exerciseprice','prezzostrike'],right:['right','type','optiontype','optionright','putcall','cp'],
  expiry:['expiration','expiry','expirationdate','expirydate','scadenza','expirationdateyyyymmdd'],
  bid:['bid','bidprice'],ask:['ask','askprice','offer'],iv:['impliedvol','impliedvolatility','iv','volatility','vol','impliedvolatilitypercent'],
  spot:['underlyingprice','underlyinglast','underlyinglastprice','spot','spotprice'],time:['timestamp','quotetime','quotedatetime','datetime','time','date','data'],
  spotTime:['underlyingtimestamp','underlyingtime'],symbol:['symbol','underlyingsymbol','root','underlying'],
  delta:['delta'],vega:['vega'],ivError:['iverror'],mid:['mid','midprice','mark','markprice']
};
function optionClock(raw,date,msText){
 const value=String(raw??'').trim(),dayPattern=/^(?:\d{8}|\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})$/;
 const day=dateText(dayPattern.test(value)?value:date);
 if(value&&!dayPattern.test(value)){
   if(/^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))return day?timestampText(day+'T'+value):'';
   if(!/^(?:\d{10}(?:\.\d+)?|\d{13})$/.test(value)&&!/[T ]\d{1,2}:\d{2}/.test(value))return '';
   return timestampText(value);
 }
 const ms=number(msText);
 return day&&String(msText??'').trim()!==''&&Number.isInteger(ms)&&ms>=0&&ms<86400000?timestampText(day+'T'+new Date(ms).toISOString().slice(11,23)):'';
}

function parseCSV(text, opts={}){
  const t=table(text), hs=t.headers.map(canonical), warnings=[], bad=[];
  const idx={};for(const[k,a]of Object.entries(aliases))idx[k]=hs.findIndex(h=>a.includes(h));
  const cidx={CALL:{},PUT:{}};
  for(const side of ['CALL','PUT'])for(const[k,a]of Object.entries(aliases)){const p=side.toLowerCase();cidx[side][k]=hs.findIndex(h=>a.some(v=>h===p+v||h===v+p||(k==='iv'&&(h===p+'iv'||h===p+'impliedvol'))));}
  const timeFields=['timestamp','quotetime','quotedatetime','datetime','time'];
  const dayCol=hs.findIndex(h=>h==='date'||h==='data'),msCol=hs.indexOf('msofday');
  for(const key of timeFields){const pos=hs.indexOf(key);if(pos>=0){idx.time=pos;break;}}
  for(const side of ['CALL','PUT']){
    const p=side.toLowerCase();for(const key of timeFields){const pos=hs.findIndex(h=>h===p+key||h===key+p);if(pos>=0){cidx[side].time=pos;break;}}
  }
  const wide=idx.right<0 && (cidx.CALL.iv>=0||cidx.CALL.bid>=0||cidx.PUT.iv>=0||cidx.PUT.bid>=0);
  if(idx.strike<0||(!wide&&idx.right<0))throw new Error('Mancano strike e/o right (CALL/PUT). Non è una chain opzioni compatibile.');
  const out=[];let ivRaw=[];
  for(let i=0;i<t.rows.length;i++){
    const r=t.rows[i];if(r.length!==t.headers.length){bad.push({row:i+t.preamble+2,reason:'Numero di colonne diverso dall’intestazione'});continue;}
    const get=k=>idx[k]>=0?r[idx[k]]:'';
    const K=number(get('strike'));if(!(K>0)){bad.push({row:i+t.preamble+2,reason:'Strike non valido'});continue;}
    const sides=wide?['PUT','CALL']:[String(get('right')).trim().toUpperCase()];
    for(let side of sides){side=side==='C'?'CALL':side==='P'?'PUT':side;if(!['CALL','PUT'].includes(side))continue;
      const val=k=>wide&&cidx[side][k]>=0?r[cidx[side][k]]:get(k);
      const rawiv=val('iv');const iv=number(rawiv);if(finite(iv)&&iv>0)ivRaw.push({v:iv,explicit:String(rawiv).includes('%')});
      const rawTime=val('time'),dateCell=dayCol>=0?r[dayCol]:'',time=optionClock(rawTime,dateCell,msCol>=0?r[msCol]:'');
      const quoteDate=dateText(rawTime)||dateText(dateCell),spotTime=optionClock(val('spotTime'),dateCell,''),spotDate=dateText(val('spotTime'));
      if(String(rawTime||'').trim()&&!time&&!/^(?:\d{8}|\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})$/.test(String(rawTime).trim())||
         !time&&msCol>=0&&String(r[msCol]??'').trim()){bad.push({row:i+t.preamble+2,reason:'Timestamp quotazione o ms_of_day non valido'});continue;}
      const ivCol=wide&&cidx[side].iv>=0?cidx[side].iv:idx.iv;
      out.push({strike:K,right:side,expiry:dateText(get('expiry')),bid:number(val('bid')),ask:number(val('ask')),mid:number(val('mid')),iv,
        cviMalformed:['bid','ask'].some(k=>{const s=String(val(k)).trim();return s&&!/^(?:null|na|n\/a|nan)$/i.test(s)&&!finite(number(s));}),ivPercent:String(rawiv).includes('%')||/percent/.test(hs[ivCol]||''),spot:number(val('spot')),time,spotTime,...(!spotTime&&spotDate?{spotDate}:{}),
        ...(!time&&quoteDate?{quoteDate}:{}),...(!String(get('symbol')).trim()?{assumedSymbol:true}:{}),
        symbol:String(get('symbol')||'SPX').trim().toUpperCase(),delta:number(val('delta')),vega:number(val('vega')),ivError:number(val('ivError')),sourceRow:i+t.preamble+2});
    }
  }
  if(!out.length)throw new Error('Nessuna riga opzioni valida. Controlla separatori, intestazioni e valori numerici.');
  let unit=opts.ivUnit||'auto';
  if(unit==='auto'){
    const knownDecimal=idx.iv>=0&&['impliedvol','impliedvolatility'].includes(hs[idx.iv]);
    const v=ivRaw.filter(x=>!x.explicit).map(x=>x.v);unit=knownDecimal?'decimal':(median(v)>2?'percent':'decimal');
    if(!knownDecimal&&median(v)>1)warnings.push('Unità IV generica: rilevata '+unit+'. Verifica il selettore IV; non vengono riscalate singole righe in base alla grandezza.');
  }
  out.forEach(r=>{r.iv=r.iv/(r.ivPercent||unit==='percent'?100:1);delete r.ivPercent;if(!(r.iv>0))r.iv=NaN;});
  if(bad.length)warnings.push(`${bad.length} righe malformate escluse (dettagli nel report importazione).`);
  if(t.preamble)warnings.push(`${t.preamble} righe introduttive ignorate prima dell’intestazione.`);
  if(out.some(r=>!r.expiry))warnings.push('Scadenza assente in alcune righe: usa la scadenza manuale, senza dedurla dal nome del file.');
  if(out.some(r=>r.quoteDate&&!r.time))warnings.push('Data senza orario: nessuna ora di quotazione dedotta. Le righe datate senza ora restano utilizzabili solo come snapshot manuale della stessa data.');
  if(out.some(r=>!r.time)&&out.some(r=>r.time))warnings.push('Per ogni scadenza con timestamp si usano soltanto le righe con ora osservata.');
  if(out.some(r=>!r.expiry)&&out.some(r=>r.expiry))warnings.push('Se la radice contiene scadenze esplicite, le righe senza scadenza sono escluse.');
  if(out.every(r=>!r.time))warnings.push('Timestamp assente: imposta manualmente data e ora dello snapshot.');
  return {rows:out,headers:t.headers,delimiter:t.delimiter,ivUnit:unit,warnings,bad,
    meta:{count:out.length,expiries:[...new Set(out.map(r=>r.expiry).filter(Boolean))].sort(),dates:[...new Set(out.map(r=>r.time.slice(0,10)).filter(Boolean))].sort(),
      symbols:[...new Set(out.map(r=>r.symbol))].sort(),spot:median(out.map(r=>r.spot)),latest:out.map(r=>r.time).filter(Boolean).sort().pop()||'',zeroIV:out.filter(r=>!finite(r.iv)).length,zeroBid:out.filter(r=>r.bid===0).length}};
}
function parseOHLC(text){
  const t=table(text), h=t.headers.map(canonical);const find=a=>h.findIndex(x=>a.includes(x));
  const ix={time:find(['time','timestamp','datetime','date','data']),open:find(['open','apertura']),high:find(['high','massimo']),low:find(['low','minimo']),close:find(['close','chiusura','last','underlyingprice'])};
  if(ix.time<0||ix.close<0)throw new Error('OHLC: richiesti time/timestamp e close (open/high/low facoltativi).');
  const rows=[],bad=[];t.rows.forEach((r,i)=>{const ts=timestampText(r[ix.time]),close=number(r[ix.close]);if(!ts||!finite(close)||close<=0){bad.push(i+2);return;}
    const o=ix.open>=0?number(r[ix.open]):close,hg=ix.high>=0?number(r[ix.high]):close,lo=ix.low>=0?number(r[ix.low]):close;
    if(![o,hg,lo].every(finite)||hg<Math.max(o,close)||lo>Math.min(o,close)||lo<=0){bad.push(i+2);return;}
    rows.push({time:ts,ms:nyEpoch(ts),open:o,high:hg,low:lo,close});});
  const m=new Map();rows.forEach(r=>m.set(r.ms,r));const result=[...m.values()].sort((a,b)=>a.ms-b.ms);if(!result.length)throw new Error('OHLC: nessuna barra valida.');
  return {rows:result,bad};
}
// Normal CDF evaluated by a convergent central series and a Mills-ratio
// continued fraction in the tails. Independently checked against scipy.special.ndtr.
function phi(x){return Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);}
function Phi(x){
  if(Number.isNaN(x))return NaN;if(x===0)return .5;
  const a=Math.abs(x);if(a>38.5)return x<0?0:1;
  let tail;
  if(a>=4){let v=0;for(let k=180;k>0;k--)v=k/(a+v);tail=phi(a)/(a+v);}
  else{let b=a,s=a;for(let j=3;j<401;j+=2){b*=a*a/j;const t=s+b;if(t===s)break;s=t;}tail=.5-s*phi(a);}
  return x<0?tail:1-tail;
}
function bisect(fn,a,b,tol=1e-12,iterations=100){let fa=fn(a),fb=fn(b);if(!finite(fa)||!finite(fb)||fa*fb>0)throw new Error('Radice non racchiusa nell’intervallo numerico.');for(let i=0;i<iterations;i++){const c=(a+b)/2,fc=fn(c);if(Math.abs(b-a)<tol||fc===0)return c;if(fa*fc<=0){b=c;fb=fc;}else{a=c;fa=fc;}}return(a+b)/2;}
// Generalized inverse. Keep the first point with F(x) >= p, including a flat CDF.
/* Linear density. Both probability tails are accumulated from the nearest
   support edge. Integrals and model prices retain the original fitted masses. */
function linearTailLaw(nodes,heights){
  const n=nodes.length;
  if(n<2||heights.length!==n||nodes.some((x,i)=>!finite(x)||(i&&x<=nodes[i-1]))||heights.some(h=>!(h>=0&&finite(h))))throw Error('Profilo lineare non valido.');
  const areas=nodes.slice(1).map((b,i)=>(b-nodes[i])*(heights[i]+heights[i+1])/2);
  function accum(values){const out=[0];let value=0,error=0;for(const v of values){const y=v-error,t=value+y;error=(t-value)-y;value=t;out.push(value);}return out;}
  const left=accum(areas),right=accum(areas.slice().reverse()).reverse(),mass=left[n-1];
  if(!(mass>0&&finite(mass)))throw Error('Massa totale non positiva.');
  const first=areas.findIndex(v=>v>0);let last=n-2;while(areas[last]===0)last--;
  const lo=nodes[first],hi=nodes[last+1],clip=v=>Math.max(0,Math.min(1,v));
  function find(test){let a=first,b=last+1;while(a<b){const mid=(a+b)>>1;if(test(mid))b=mid;else a=mid+1;}return a;}
  function cell(x){const upper=find(i=>nodes[i]>=x);return Math.max(first,upper-1);}
  function at(x,upper){
    if(Number.isNaN(x))return NaN;
    if(x<=lo)return upper?1:0;if(x>=hi)return upper?0:1;
    const i=cell(x),a=nodes[i],b=nodes[i+1],h0=heights[i],h1=heights[i+1],y=(h0*(b-x)+h1*(x-a))/(b-a);
    return clip(upper?(right[i+1]+(b-x)*(y+h1)/2)/mass:(left[i]+(x-a)*(y+h0)/2)/mass);
  }
  function quant(p,upper){
    if(!(p>=0&&p<=1))throw Error('Probabilità del quantile fuori da [0,1].');
    if(p===0)return upper?hi:lo;if(p===1)return upper?lo:hi;
    if(p>.5)return quant(1-p,!upper);
    const want=p*mass,j=find(i=>upper?right[i]<=want:left[i]>=want);
    if((upper?right[j]:left[j])===want)return nodes[j];
    const i=Math.max(first,j-1),width=nodes[i+1]-nodes[i],area=areas[i];
    let amt=upper?want-right[j]:want-left[i],fromRight=upper;
    if(amt>area/2){amt=area-amt;fromRight=!fromRight;}
    amt=Math.max(0,amt);
    const h=heights[i+Number(fromRight)],other=heights[i+Number(!fromRight)];
    const denom=h+Math.sqrt(Math.max(0,h*h+2*(other-h)*amt/width));
    const dx=denom>0?Math.max(0,Math.min(width,2*amt/denom)):0;
    return Math.max(nodes[i],Math.min(nodes[j],fromRight?nodes[j]-dx:nodes[i]+dx));
  }
  function pdf(x){if(x<lo||x>hi||Number.isNaN(x))return Number.isNaN(x)?NaN:0;const i=cell(x),a=nodes[i],b=nodes[i+1];return ((b-x)*heights[i]+(x-a)*heights[i+1])/((b-a)*mass);}
  return {nodes,heights,mass,lo,hi,cdf:x=>at(x,false),survival:x=>at(x,true),quantile:p=>quant(p,false),isf:p=>quant(p,true),pdf};
}
function splineTailLaw(knots,masses){
  return linearTailLaw(knots,[0,...masses.map((p,i)=>2*p/(knots[i+2]-knots[i])),0]);
}

function activeKnotIndices(masses){
  const first=masses.findIndex(v=>v>0);
  let last=masses.length-1;
  while(last>=0&&!(masses[last]>0))last--;
  if(first<0)throw new Error('La densità non ha massa positiva.');
  return [first,last+2];
}
function lowerQuantile(cdf,lo,hi,p){
  if(!(p>=0&&p<=1))throw new Error('Probabilità del quantile fuori da [0,1].');
  if(p===0)return lo;
  if(p===1)return hi;
  for(let i=0;i<85;i++){
    const mid=lo+(hi-lo)/2;
    if(mid===lo||mid===hi)break;
    if(cdf(mid)>=p)hi=mid;else lo=mid;
  }
  return hi;
}
function black(F,K,v,D=1,side='CALL'){
  if(!(F>0&&K>0&&v>=0&&D>0&&[F,K,v,D].every(finite))||!['CALL','PUT'].includes(side))return NaN;
  if(v<1e-10)return D*Math.max(side==='CALL'?F-K:K-F,0);
  const d1=Math.log(F/K)/v+v/2,d2=d1-v;
  return D*(side==='CALL'?F*Phi(d1)-K*Phi(d2):K*Phi(-d2)-F*Phi(-d1));
}
function impliedTotal(F,K,price,D=1,side='CALL'){
  const lower=D*Math.max(side==='CALL'?F-K:K-F,0),upper=D*(side==='CALL'?F:K);
  if(!(price>lower+1e-9&&price<upper-1e-9))return NaN;
  try{return bisect(v=>black(F,K,v,D,side)-price,1e-9,8,1e-12,85);}catch(e){return NaN;}
}
function solveLinear(A,b,tolerance=1e-18){
  const n=b.length,M=A.map(r=>Array.from(r)),y=Array.from(b);
  for(let k=0;k<n;k++){
    let im=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[im][k]))im=i;
    if(Math.abs(M[im][k])<tolerance||!finite(M[im][k]))throw new Error('Sistema numerico singolare.');
    if(im!==k){[M[im],M[k]]=[M[k],M[im]];[y[im],y[k]]=[y[k],y[im]];}
    for(let i=k+1;i<n;i++){const f=M[i][k]/M[k][k];if(!f)continue;M[i][k]=0;for(let j=k+1;j<n;j++)M[i][j]-=f*M[k][j];y[i]-=f*y[k];}
  }
  const x=new Float64Array(n);for(let i=n-1;i>=0;i--){let v=y[i];for(let j=i+1;j<n;j++)v-=M[i][j]*x[j];x[i]=v/M[i][i];}return Array.from(x);
}
function cubicNotAKnot(x,y){
  const n=x.length;if(n<4||y.length!==n)throw new Error('Spline cubica: occorrono almeno 4 strike distinti.');
  if(x.some((v,i)=>!finite(v)||!finite(y[i])||(i&&v<=x[i-1])))throw new Error('Nodi spline non finiti o duplicati.');
  const h=x.slice(1).map((v,i)=>v-x[i]),A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
  A[0][0]=-h[1];A[0][1]=h[0]+h[1];A[0][2]=-h[0];
  for(let i=1;i<n-1;i++){A[i][i-1]=h[i-1];A[i][i]=2*(h[i-1]+h[i]);A[i][i+1]=h[i];b[i]=6*((y[i+1]-y[i])/h[i]-(y[i]-y[i-1])/h[i-1]);}
  A[n-1][n-3]=-h[n-2];A[n-1][n-2]=h[n-3]+h[n-2];A[n-1][n-1]=-h[n-3];
  const M=solveLinear(A,b);
  function at(v,derivative=0){let i=0;if(v>=x[n-1])i=n-2;else{let l=0,r=n-1;while(r-l>1){const m=(l+r)>>1;if(x[m]>v)r=m;else l=m;}i=l;}
    const t=v-x[i],hi=h[i],a=y[i],bb=(y[i+1]-y[i])/hi-hi*(2*M[i]+M[i+1])/6,c=M[i]/2,d=(M[i+1]-M[i])/(6*hi);
    if(derivative===1)return bb+2*c*t+3*d*t*t;if(derivative===2)return 2*c+6*d*t;return a+bb*t+c*t*t+d*t*t*t;
  }
  return {at,x:x.slice(),y:y.slice(),second:M};
}
function selectSnapshot(rows,cfg){
  const date=cfg.asof.slice(0,10),now=nyEpoch(cfg.asof);
  const rootRows=rows.filter(r=>!cfg.symbol||r.symbol===cfg.symbol);
  if(!cfg.symbol&&new Set(rootRows.map(r=>r.symbol).filter(Boolean)).size>1)throw Error('Scegli una sola radice per il calcolo.');
  const hasMaturities=rootRows.some(r=>r.expiry);
  const chain=rootRows.filter(r=>hasMaturities?r.expiry===cfg.expiry:true);
  const dated=chain.some(r=>r.time||r.quoteDate),dayTimed=chain.some(r=>r.time?.slice(0,10)===date);
  const latest=new Map(),conflicts=new Set();let duplicates=0;
  for(const raw of chain){
    if(raw.quoteDate&&raw.quoteDate!==date)continue;
    const stamp=raw.time?nyEpoch(raw.time):-Infinity;
    if(raw.time?(raw.time.slice(0,10)!==date||!finite(stamp)||stamp>now):(raw.quoteDate?dayTimed:dated))continue;
    const row=(raw.spotTime&&nyEpoch(raw.spotTime)>now||raw.spotDate&&raw.spotDate>=date)?{...raw,spot:NaN,spotTime:'',futureSpotRemoved:true}:raw;
    const key=row.strike+'|'+row.right,prev=latest.get(key);
    if(prev){
      duplicates++;
      if(stamp<prev.stamp)continue;
      if(stamp===prev.stamp){
        const fields=['bid','ask','iv','spot','spotTime','delta','vega','mid','ivError'];
        if(fields.some(k=>!(row[k]===prev.row[k]||Number.isNaN(row[k])&&Number.isNaN(prev.row[k]))))conflicts.add(key);
        continue;
      }
    }
    conflicts.delete(key);latest.set(key,{row,stamp});
  }
  if(conflicts.size)throw Error('Quote discordanti per contratto allo stesso timestamp selezionato: '+[...conflicts].slice(0,4).join(', ')+'. Verifica i file o la sequenza delle revisioni.');
  return {rows:[...latest.values()].map(v=>v.row),duplicates};
}

// Find timestamps only within the selected instrument/expiry, not other files.
// A requested historical date is preserved when it exists in that chain.
// This helper never uses the computer clock and never changes a settlement.
function snapshotInfo(rows, cfg={}){
  const pool=rows.filter(r=>(!cfg.symbol||r.symbol===cfg.symbol)&&(!cfg.expiry||!r.expiry||r.expiry===cfg.expiry));
  const dated=pool.filter(r=>r.time&&finite(nyEpoch(r.time))),dates=[...new Set(dated.map(r=>r.time.slice(0,10)))].sort();
  const date=cfg.date||'',same=date?dated.filter(r=>r.time.slice(0,10)===date):dated;
  const used=same.length?same:dated,times=used.map(r=>r.time).sort();
  return {latest:times.at(-1)||'',earliest:times[0]||'',dates,rows:pool.length,timestampedRows:used.length,
    requestedDate:date,requestedDateMatched:!date||same.length>0,
    selection:cfg.symbol||'tutti i simboli',expiry:cfg.expiry||'tutte le scadenze'};
}
function inferForward(rows,cfg,T){
  const D=Math.exp(-cfg.rate*T);if(cfg.forward>0)return {F:cfg.forward,D,source:'Forward manuale',pairs:0,mad:0};
  const spot=median(rows.map(r=>r.spot)),mp=new Map(),now=nyEpoch(cfg.asof);let asynchronous=0;
  for(const r of rows){if(!(r.bid>=0&&r.ask>=r.bid&&r.ask>0))continue;
    if(r.time&&cfg.maxAge>0&&Math.abs(now-nyEpoch(r.time))>cfg.maxAge*1000)continue;
    let a=mp.get(r.strike);if(!a){a={};mp.set(r.strike,a);}a[r.right]=r;}
  const p=[];for(const[K,a]of mp){if(!a.CALL||!a.PUT)continue;
    const c=a.CALL,q=a.PUT,gap=c.time&&q.time?Math.abs(nyEpoch(c.time)-nyEpoch(q.time))/1000:0;
    if(cfg.maxPairGap>0&&gap>cfg.maxPairGap){asynchronous++;continue;}
    const spread=c.ask-c.bid+q.ask-q.bid;
    if(spread>Math.max(4,.4*(c.ask+c.bid+q.ask+q.bid)/2))continue;
    p.push({K,F:K+((c.bid+c.ask-q.bid-q.ask)/2)/D,w:1/(spread*spread+.04),lower:K+(c.bid-q.ask)/D,upper:K+(c.ask-q.bid)/D,gap,spread});
  }
  const seed=spot>0?spot:p.length?p.slice().sort((a,b)=>Math.abs(a.F-a.K)-Math.abs(b.F-b.K))[0].K:NaN;
  p.sort((a,b)=>Math.abs(a.K-seed)-Math.abs(b.K-seed));const near=p.slice(0,21);
  if(near.length>=3){const fm=weightedMedian(near.map(x=>x.F),near.map(x=>x.w)),mad=median(near.map(x=>Math.abs(x.F-fm)));
    const good=near.filter(x=>Math.abs(x.F-fm)<=Math.max(.5,6*mad));
    const estimated=weightedMedian(good.map(x=>x.F),good.map(x=>x.w));
    const lower=Math.max(...good.map(x=>x.lower)),upper=Math.min(...good.map(x=>x.upper));
    const nearLower=Math.max(...near.map(x=>x.lower)),nearUpper=Math.min(...near.map(x=>x.upper));
    const F=nearLower<=nearUpper?Math.max(nearLower,Math.min(nearUpper,estimated)):lower<=upper?Math.max(lower,Math.min(upper,estimated)):estimated;
    return {F,D,source:'Parità put–call (mediana pesata)',pairs:good.length,mad,asynchronousExcluded:asynchronous,
      maxPairGap:Math.max(...good.map(q=>q.gap)),intervalLower:lower,intervalUpper:upper,nearLower,nearUpper,
      nearPairs:near.length,unclippedMedian:estimated,pairEstimates:good};
  }
  const ref=spot>0?spot:cfg.settlement;
  return {F:ref*Math.exp((cfg.rate-cfg.dividend)*T),D,source:'Ipotesi carry da spot (parità insufficiente)',pairs:near.length,mad:NaN,asynchronousExcluded:asynchronous,
    warning:'Forward non identificato da parità: usati spot (oppure riferimento manuale se assente), r e dividend yield. Imposta un forward documentato per evitarlo.'};
}
function ippo(rows,cfg,T,forward){
  const S=median(rows.map(r=>r.spot))||forward.F,all=[...new Set(rows.map(r=>r.strike))].sort((a,b)=>a-b);
  if(!all.length)throw new Error('Nessuna riga per data/scadenza selezionate.');
  const atm=all.reduce((a,b)=>Math.abs(a-S)<=Math.abs(b-S)?a:b),targets=[50,100,150,200,250].flatMap(d=>[atm-d,atm+d]);
  const reprice=cfg.ippoIV==='reprice',now=nyEpoch(cfg.asof);
  if(reprice&&!(T>0))throw new Error('Ippo da bid/ask richiede un tempo residuo positivo.');
  const audit={source:reprice?'bid_ask_repriced':'vendor_iv',otmRows:0,validCandidates:0,excluded:{},requestedNodes:targets.length,exactNodes:0,selectedNodes:0};
  function skip(reason){audit.excluded[reason]=(audit.excluded[reason]||0)+1;}
  const candidates=[];
  for(const r of rows){
    if(!(r.strike<S&&r.right==='PUT'||r.strike>S&&r.right==='CALL'))continue;
    audit.otmRows++;
    let iv=r.iv;
    if(reprice){
      if(!(finite(r.bid)&&finite(r.ask)&&r.bid>=0&&r.ask>=r.bid&&r.ask>0)){skip('bid_ask_invalid');continue;}
      if(r.bid<(cfg.minBid??.1)-1e-10){skip('bid_filter');continue;}
      const mid=(r.ask+r.bid)/2,age=r.time?(now-nyEpoch(r.time))/1000:NaN;
      if(cfg.maxAge>0&&!(age>=0&&age<=cfg.maxAge)){skip('stale_or_undated');continue;}
      if((r.ask-r.bid)/Math.max(.05,mid)>(cfg.maxSpread??1.5)){skip('spread_filter');continue;}
      iv=impliedTotal(forward.F,r.strike,mid,forward.D,r.right)/Math.sqrt(T);
    }
    if(!(finite(iv)&&iv>0)){skip(reprice?'no_implied_vol':'missing_vendor_iv');continue;}
    candidates.push({...r,iv});
  }
  audit.validCandidates=candidates.length;
  let points=candidates.filter(r=>targets.some(k=>Math.abs(k-r.strike)<1e-7)),adapted=false;
  audit.exactNodes=points.length;
  if(!cfg.strictIppo&&(points.length<4||!points.some(p=>p.strike<S)||!points.some(p=>p.strike>S))){
    const chosen=new Map();for(const k of targets){const side=k<atm?'PUT':'CALL';const pool=candidates.filter(r=>r.right===side);if(pool.length){const r=pool.reduce((a,b)=>Math.abs(a.strike-k)<=Math.abs(b.strike-k)?a:b);chosen.set(r.strike,r);}}
    points=[...chosen.values()];adapted=true;
  }
  points.sort((a,b)=>a.strike-b.strike);audit.selectedNodes=points.length;
  if(points.length<4)throw new Error('Ippo: meno di quattro nodi utilizzabili per la fonte selezionata. Verifica copertura, bid/ask, timestamp e scelta della replica stretta.');
  const ks=points.map(p=>Math.log(p.strike/S));if(!(ks[0]<0&&ks[ks.length-1]>0))throw new Error('Ippo: riferimento della spline esterno ai nodi OTM validi.');
  const spline=cubicNotAKnot(ks,points.map(p=>p.iv)),iv=spline.at(0);if(!(iv>0&&finite(iv)))throw new Error('Ippo: IV ATM interpolata non positiva.');
  const H=cfg.ippoClock==='legacy252'?1/252:cfg.targetT;if(!(H>0))throw new Error('Ippo: orizzonte non positivo.');
  const v=iv*Math.sqrt(H),levels=makeSigma(cfg).map(z=>({z,price:cfg.settlement*Math.exp(z*v),family:'Ippo',p:NaN,tail:z===0?'Riferimento':'Banda tecnica',source:'ATM spline',direction:z<0?'left':z>0?'right':'reference',tailProbability:null,standardizedDistance:null,conditionalTail:null,sensitivityCount:0}));
  if(levels.some(l=>!(l.price>0&&finite(l.price))))throw new Error('Ippo: bande tecniche fuori dal dominio numerico.');
  const warnings=[];
  if(adapted)warnings.push('Selezione adattiva dei nodi IPPO.');
  else if(points.length<targets.length)warnings.push('Replica su '+points.length+' dei '+targets.length+' nodi nominali.');
  return {variant:'legacy',fitReference:S,iv,volT:v,atmStrike:atm,skew:spline.at(0,1),convexity:spline.at(0,2),points,spline,levels,adapted,nodeAudit:audit,
    exact:!adapted&&points.length===targets.length&&cfg.ippoClock==='legacy252'&&!reprice,clock:cfg.ippoClock,warning:warnings.join(' ')};
}
function makeSigma(cfg){const m=cfg.maxSigma||4,step=cfg.step||.5,n=Math.round(m/step);if(!(m>0&&m<=5&&step>0&&n<=40&&Math.abs(n*step-m)<1e-8))throw new Error('Griglia sigma non valida.');return Array.from({length:2*n+1},(_,i)=>Math.round((i-n)*step*1000)/1000);}
function triangle(a,b,c){const mu=(a+b+c)/3;return {a,b,c,mu,
  call(x){if(x<=a)return mu-x;if(x<b)return mu-x+(x-a)**3/(3*(c-a)*(b-a));if(x<c)return(c-x)**3/(3*(c-a)*(c-b));return 0;},
  put(x){if(x<=a)return 0;if(x<b)return(x-a)**3/(3*(c-a)*(b-a));if(x<c)return x-mu+(c-x)**3/(3*(c-a)*(c-b));return x-mu;},
  pdf(x){if(x<=a||x>=c)return 0;return x<b?2*(x-a)/((c-a)*(b-a)):2*(c-x)/((c-a)*(c-b));},
  cdf(x){if(x<=a)return 0;if(x>=c)return 1;return x<b?(x-a)**2/((c-a)*(b-a)):1-(c-x)**2/((c-a)*(c-b));},
  m2:(a*a+b*b+c*c+a*b+a*c+b*c)/6,
  m4:sum(Array.from({length:5},(_,i)=>sum(Array.from({length:5-i},(_,j)=>a**i*b**j*c**(4-i-j)))))/15
};}
function qpNonnegative(H,g,mu){
  const n=g.length,scale=Math.max(...H.map((r,i)=>Math.abs(r[i]))),h=H.map((r,i)=>r.map((v,j)=>v/scale+(i===j?1e-12:0))),gg=g.map(v=>v/scale);
  let neg=-1,pos=-1;for(let i=0;i<n;i++){if(mu[i]<0&&(neg<0||mu[i]>mu[neg]))neg=i;if(mu[i]>0&&(pos<0||mu[i]<mu[pos]))pos=i;}
  if(neg<0||pos<0)throw new Error('Supporto spline non bilanciato attorno al forward.');
  let x=Array(n).fill(0);x[neg]=mu[pos]/(mu[pos]-mu[neg]);x[pos]=1-x[neg];const free=Array(n).fill(true);let iterations=0,dual=Infinity;
  for(;iterations<8*n*n;iterations++){
    const ids=free.flatMap((v,i)=>v?[i]:[]),m=ids.length;if(m<2)throw new Error('QP: insieme attivo degenerato.');
    const K=Array.from({length:m+2},()=>Array(m+2).fill(0)),rhs=Array(m+2).fill(0);rhs[m]=1;
    for(let i=0;i<m;i++){rhs[i]=-gg[ids[i]];for(let j=0;j<m;j++)K[i][j]=h[ids[i]][ids[j]];K[i][m]=K[m][i]=1;K[i][m+1]=K[m+1][i]=mu[ids[i]];}
    const sol=solveLinear(K,rhs),z=Array(n).fill(0);ids.forEach((j,i)=>z[j]=sol[i]);
    let alpha=1,hit=-1;
    for(const j of ids)if(z[j]<-1e-12){const a=x[j]/(x[j]-z[j]);if(a<alpha){alpha=Math.max(0,a);hit=j;}}
    if(hit>=0){for(let j=0;j<n;j++)x[j]+=alpha*(z[j]-x[j]);x[hit]=0;free[hit]=false;continue;}
    x=z.map(v=>v<0&&v>-1e-11?0:v);
    let worst=-1,best=-1e-13;for(let j=0;j<n;j++)if(!free[j]){let v=gg[j]+sol[m]+sol[m+1]*mu[j];for(let k=0;k<n;k++)v+=h[j][k]*x[k];if(v<best){best=v;worst=j;}}
    dual=best;if(worst<0){const mass=sum(x),mean=sum(x.map((v,i)=>v*mu[i]));if(Math.abs(mass-1)>1e-7||Math.abs(mean)>1e-7||Math.min(...x)<-1e-9)throw new Error('QP: vincoli di massa/media non soddisfatti.');const grad=x.map((_,j)=>gg[j]+sol[m]+sol[m+1]*mu[j]+sum(h[j].map((v,k)=>v*x[k])));
      const kkt={freeStationarity:Math.max(0,...grad.filter((_,j)=>free[j]).map(Math.abs)),dualViolation:Math.max(0,...grad.filter((_,j)=>!free[j]).map(v=>-v)),complementarity:Math.max(0,...grad.map((v,j)=>Math.abs(v*x[j]))),massError:Math.abs(mass-1),meanError:Math.abs(mean),ridge:scale*1e-12};
      if(Math.max(kkt.freeStationarity,kkt.dualViolation,kkt.complementarity)>1e-7)throw new Error('QP: condizioni KKT oltre la tolleranza; nessun risultato pubblicato.');
      return {p:x,iterations:iterations+1,dual,scale,mass,mean,kkt,multipliers:[sol[m],sol[m+1]],effectiveH:h.map(row=>row.map(v=>v*scale))};}
    free[worst]=true;
  }
  throw new Error('QP: iterazioni esaurite. Nessun risultato Wall Street pubblicato.');
}
function buildDensity(points,F,D,cfg){
  const atm=points.slice().sort((a,b)=>Math.abs(a.K-F)-Math.abs(b.K-F)).slice(0,5),volT=median(atm.map(q=>impliedTotal(F,q.K,q.mid,D,q.side)));
  if(!(volT>0&&finite(volT)))throw new Error('IV ATM da prezzi non identificabile: controlla forward e quotazioni.');
  const scale=F*volT,xs=points.map(q=>(q.K-F)/scale),guard=cfg.guard||1;
  const raw=[];const step=cfg.knotStep||.25;for(let j=0;j<=Math.round(6/step);j++)raw.push(-3+6*j/Math.round(6/step));
  const ext=[3.5,4,4.5,5.5,7,9,11,14];ext.forEach(x=>{raw.push(3+(x-3)*guard);raw.push(-3-(x-3)*guard);});
  if(Math.min(...xs)<Math.min(...raw)+1)raw.push(Math.min(...xs)-Math.max(2,3*guard));
  if(Math.max(...xs)>Math.max(...raw)-1)raw.push(Math.max(...xs)+Math.max(2,3*guard));
  const floor=-F/scale*.999;const knots=[...new Set(raw.filter(x=>x>floor))].sort((a,b)=>a-b);if(knots[0]>Math.min(-3,...xs))knots.unshift(floor);
  const tris=knots.slice(1,-1).map((b,i)=>triangle(knots[i],b,knots[i+2])),n=tris.length;
  const V=Array.from({length:n},()=>Array(n).fill(0)),left=tris.map((t,i)=>t.b<=-1.5?i:-1).filter(i=>i>=0),right=tris.map((t,i)=>t.b>=1.5?i:-1).filter(i=>i>=0);
  for(let i=0;i<n;i++){
    let inds=[i];if(cfg.regularTails!==false){if(left.includes(i))inds=Array.from({length:left[left.length-1]-i+1},(_,j)=>i+j);else if(right.includes(i))inds=Array.from({length:i-right[0]+1},(_,j)=>right[0]+j);}
    const norm=sum(inds.map(j=>(tris[j].c-tris[j].a)/2));for(const j of inds)V[j][i]=(tris[j].c-tris[j].a)/(2*norm);
  }
  const transform=v=>Array.from({length:n},(_,i)=>sum(v.map((x,j)=>x*V[j][i])));
  const mu=transform(tris.map(t=>t.mu)),m4=transform(tris.map(t=>t.m4));
  const M=points.map((q,l)=>transform(tris.map(t=>q.side==='PUT'?t.put(xs[l]):t.call(xs[l]))));
  const rough=Array.from({length:n},()=>Array(n).fill(0));
  for(let l=0;l<knots.length-1;l++){
    const lo=knots[l],hi=knots[l+1],dx=hi-lo;const d=transform(tris.map(t=>(t.pdf(lo+.75*dx)-t.pdf(lo+.25*dx))/(.5*dx)));
    for(let i=0;i<n;i++)if(d[i])for(let j=0;j<n;j++)if(d[j])rough[i][j]+=dx*d[i]*d[j];
  }
  const y=points.map(q=>q.mid/(D*scale)),errs=points.map(q=>Math.max((q.ask-q.bid)/2,.05)/(D*scale)),weights=errs.map(v=>1/(v*v));
  let sol,H,g,model,robust=Array(points.length).fill(1),usedRobust=robust.slice(),robustIterations=0,robustChange=0;
  for(let it=0;it<(cfg.robust===false?1:12);it++){
    robustIterations=it+1;usedRobust=robust.slice();
    H=rough.map(r=>r.map(v=>(cfg.smoothing??100)*v));g=m4.map(v=>(cfg.tailPenalty??.1)*v);
    for(let k=0;k<points.length;k++){const w=weights[k]*robust[k],a=M[k];for(let i=0;i<n;i++)if(a[i]){g[i]-=w*a[i]*y[k];for(let j=0;j<n;j++)if(a[j])H[i][j]+=w*a[i]*a[j];}}
    sol=qpNonnegative(H,g,mu);model=M.map(a=>sum(a.map((v,i)=>v*sol.p[i])));
    let change=0;robust=robust.map((v,i)=>{const z=Math.abs((model[i]-y[i])/errs[i]),nv=z>3?3/z:1;change=Math.max(change,Math.abs(nv-v));return nv;});robustChange=change;if(change<.001)break;
  }
  const p=Array.from({length:n},(_,j)=>sum(V[j].map((v,i)=>v*sol.p[i]))),cdfX=x=>sum(tris.map((t,i)=>p[i]*t.cdf(x))),pdfX=x=>sum(tris.map((t,i)=>p[i]*t.pdf(x)));
  const tailLaw=splineTailLaw(knots,p);
  const cdf=K=>tailLaw.cdf((K-F)/scale),pdf=K=>pdfX((K-F)/scale)/scale,
    survival=K=>tailLaw.survival((K-F)/scale),isf=prob=>F+scale*tailLaw.isf(prob),quantile=prob=>F+scale*tailLaw.quantile(prob),
    price=(K,side='CALL')=>D*scale*sum(tris.map((t,i)=>p[i]*(side==='PUT'?t.put((K-F)/scale):t.call((K-F)/scale))));
  const fitted=points.map((q,i)=>({...q,fit:model[i]*D*scale,residual:(model[i]-y[i])*D*scale,z:(model[i]-y[i])/errs[i],robustWeight:usedRobust[i],inside:model[i]*D*scale>=q.bid-1e-6&&model[i]*D*scale<=q.ask+1e-6}));
  const mass=sum(p),meanX=sum(p.map((v,i)=>v*tris[i].mu)),varianceX=sum(p.map((v,i)=>v*tris[i].m2))-meanX*meanX;
  const info={mass,mean:F+scale*meanX,martingaleError:scale*meanX,minMass:Math.min(...p),rmsSpread:Math.sqrt(sum(fitted.map(q=>q.z*q.z))/fitted.length),
    rmsePrice:Math.sqrt(sum(fitted.map(q=>q.residual*q.residual))/fitted.length),within:sum(fitted.map(q=>q.inside?1:0))/fitted.length,iterations:sol.iterations,
    supportLower:F+scale*knots[0],supportUpper:F+scale*knots[knots.length-1],sd:scale*Math.sqrt(Math.max(0,varianceX)),knotCount:knots.length,observations:fitted.length,robustIterations,robustChange,robustConverged:cfg.robust===false||robustChange<.001,kkt:sol.kkt,knotStep:step};
  const atmW=impliedTotal(F,F,price(F),D,'CALL')**2;
  return {F,D,scale,volT,knots,tris,p,cdf,pdf,quantile,survival,isf,price,info,fitted,atmW,qp:{H:sol.effectiveH,originalH:H,g,mu,p:sol.p,V,multipliers:sol.multipliers,kkt:sol.kkt}};
}
function quotePoints(rows,cfg,forward,T,inspectionOnly=false){
  const points=[],excluded=[],now=nyEpoch(cfg.asof),F=forward.F,D=forward.D;
  for(const r of rows){const side=r.strike<F?'PUT':'CALL';if(r.right!==side){excluded.push({K:r.strike,side:r.right,reason:'Lato ITM, non utilizzato nel fit'});continue;}
    let bid=r.bid,ask=r.ask,synthetic=false;
    if(cfg.quoteSource==='iv'){
      if(!(r.iv>0)){excluded.push({K:r.strike,side,reason:'IV non valida'});continue;}
      const mid=black(F,r.strike,r.iv*Math.sqrt(T),D,side);bid=Math.max(0,mid-Math.max(.05,.02*mid));ask=mid+Math.max(.05,.02*mid);synthetic=true;
    }
    let reason='';if(!(bid>=0&&ask>=bid&&ask>0))reason='Bid/ask assenti o incrociati';
    else if(!synthetic&&bid<(cfg.minBid??.1)-1e-10)reason='Bid inferiore alla soglia di qualità';
    else if(!synthetic&&cfg.maxAge>0&&r.time&&Math.abs(now-nyEpoch(r.time))>cfg.maxAge*1000)reason='Quote fuori finestra temporale';
    else if((ask-bid)/Math.max(.05,(ask+bid)/2)>(cfg.maxSpread??1.5))reason='Spread relativo troppo ampio';
    const mid=(bid+ask)/2;
    if(!reason && mid>=D*(side==='PUT'?r.strike:F))reason='Prezzo oltre limite di non arbitraggio';
    if(reason){excluded.push({K:r.strike,side,reason,time:r.time,sourceRow:r.sourceRow});continue;}
    points.push({K:r.strike,side,mid,bid,ask,sourceIV:r.iv,time:r.time,synthetic,sourceRow:r.sourceRow});
  }
  points.sort((a,b)=>a.K-b.K);const l=points.filter(q=>q.side==='PUT').length,u=points.length-l;
  const reasons={};for(const e of excluded)reasons[e.reason]=(reasons[e.reason]||0)+1;
  const times=rows.map(r=>r.time).filter(t=>t&&finite(nyEpoch(t))).sort(),latest=times.at(-1)||'';
  const diagnostics={selectedRows:rows.length,used:points.length,puts:l,calls:u,
    otmCandidates:rows.length-(reasons['Lato ITM, non utilizzato nel fit']||0),reasons,
    asof:cfg.asof,latestQuote:latest,earliestQuote:times[0]||'',maxAgeSeconds:cfg.maxAge,
    ageLatestSeconds:latest?(now-nyEpoch(latest))/1000:null,source:cfg.quoteSource||'mid',
    missingBidAsk:rows.filter(r=>!finite(r.bid)||!finite(r.ask)).length,
    missingTimestamps:rows.filter(r=>!r.time).length,
    ...(rows.some(r=>r.assumedSymbol||!r.expiry)?{unverifiedContractIdentity:rows.filter(r=>r.assumedSymbol||!r.expiry).length}:{}),
    otmZeroBid:rows.filter(r=>r.right===(r.strike<F?'PUT':'CALL')&&r.bid===0).length,
    otmMaxBid:Math.max(0,...rows.filter(r=>r.right===(r.strike<F?'PUT':'CALL')&&finite(r.bid)).map(r=>r.bid))};
  if(!inspectionOnly&&(points.length<8||l<2||u<2)){
    const details=Object.entries(reasons).filter(([k])=>k!=='Lato ITM, non utilizzato nel fit').map(([k,v])=>`${k}: ${v}`).join('; ');
    let timing='';
    if(reasons['Quote fuori finestra temporale'])timing=` Snapshot ${cfg.asof.replace('T',' ')} ET; ultima quota ${latest.replace('T',' ')} ET; limite età ${cfg.maxAge} s. Riallinea lo snapshot ai timestamp del CSV (pulsante “Sincronizza snapshot CSV”); non usare l’ora di caricamento o del target.`;
    const error=new Error(`Wall Street: solo ${points.length} quote OTM utilizzabili (${l} put, ${u} call). Servono almeno 8 quote, con almeno 2 per lato. Esclusioni OTM: ${details||'copertura strike insufficiente'}.${timing}`);
    error.quoteAudit=diagnostics;error.excluded=excluded;throw error;
  }
  return {points,excluded,diagnostics};
}
const GLX=[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const GLW=[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
function expectation(model,fn){if(model.cvi)return model.expect(fn);let s=0;for(let j=0;j<model.knots.length-1;j++){const a=model.F+model.scale*model.knots[j],b=model.F+model.scale*model.knots[j+1],h=(b-a)/2,m=(a+b)/2;for(let i=0;i<GLX.length;i++){const x=m+h*GLX[i];s+=h*GLW[i]*fn(x)*model.pdf(x);}}return s;}
function mapped(model,cfg,T){
  const alpha=Math.sqrt(cfg.targetT/T),anchor=cfg.anchor==='native'?model.F:cfg.settlement;
  const norm=Math.abs(alpha-1)<1e-10?1:expectation(model,K=>(K/model.F)**alpha);
  if(!(norm>0&&finite(norm)))throw new Error('Trasformazione orizzonte non valida.');
  const map=K=>anchor*(K/model.F)**alpha/norm,unmap=L=>model.F*(L*norm/anchor)**(1/alpha),
    q=p=>map(model.quantile(p)),cdf=L=>model.cdf(unmap(L)),pdf=L=>{const K=unmap(L);return model.pdf(K)*K/(alpha*L);};
  return {alpha,anchor,norm,map,unmap,quantile:q,cdf:L=>L<=0?0:cdf(L),pdf:L=>L<=0?0:pdf(L),survival:L=>L<=0?1:model.survival(unmap(L)),isf:p=>map(model.isf(p))};
}
function normalizedSkew(model,T){
  // Forward delta convention. This is a diagnostic; it never multiplies the level volatility.
  const vAt=K=>{if(model.cvi)return Math.sqrt(model.varianceAt(K));const side=K<model.F?'PUT':'CALL';return impliedTotal(model.F,K,model.price(K,side),model.D,side);};
  const delta=K=>{const v=vAt(K);return v>0?Phi(Math.log(model.F/K)/v+v/2):NaN;};
  const xs=[];
  for(let j=1;j<model.knots.length;j++){
    const a=model.F+model.scale*model.knots[j-1],b=model.F+model.scale*model.knots[j];
    for(let k=0;k<4;k++)xs.push(a+(b-a)*k/4);
  }
  xs.push(model.F+model.scale*model.knots.at(-1));
  const deltas=xs.map(delta);
  function roots(target){
    const found=[];for(let i=1;i<xs.length;i++){
      const a=deltas[i-1]-target,b=deltas[i]-target;
      if(!finite(a)||!finite(b))continue;
      if(a===0)found.push(xs[i-1]);else if(a*b<0)found.push(bisect(k=>delta(k)-target,xs[i-1],xs[i],1e-9,65));
    }
    if(deltas.at(-1)===target)found.push(xs.at(-1));
    return found;
  }
  const puts=roots(.75),calls=roots(.25),atms=roots(.5);
  const unique=roots=>roots.length===1?roots[0]:NaN;
  const kp=unique(puts),kc=unique(calls),ka=unique(atms),iv=K=>finite(K)?vAt(K)/Math.sqrt(T):NaN;
  const ivPut25=iv(kp),ivCall25=iv(kc),iv50=iv(ka);
  return{put25:kp,call25:kc,ivPut25,ivCall25,iv50,ratio:(ivPut25-ivCall25)/iv50,
    rootCounts:{put25:puts.length,call25:calls.length,delta50:atms.length},convention:'Absolute forward delta, OTM inversion; multiple or unresolved crossings omitted.'};
}
// End-of-day admissibility check. 60 seconds is a disclosed application
// safeguard for extrapolating a terminal chain beyond expiry, NOT an exchange rule.
// Original expiry and real clock are inspected even if overrideHours is supplied.
function horizonCheck(rows,cfg={}){
  const expiryTime=cfg.expiryTime||'16:00',asof=nyEpoch(cfg.asof),expiry=nyEpoch((cfg.expiry||'')+'T'+expiryTime),target=nyEpoch(cfg.target);
  const valid=[asof,expiry,target].every(finite),seconds=valid?(expiry-asof)/1000:null;
  const targetBeyond=valid&&target>expiry;
  const terminal=valid&&seconds>=0&&seconds<=60;
  const expired=valid&&seconds<=0;
  const blocked=valid&&(expired||(terminal&&targetBeyond));
  const targetDate=(cfg.target||'').slice(0,10),date=(cfg.asof||'').slice(0,10);
  const eligible=valid?[...new Set(rows.filter(r=>(!cfg.symbol||r.symbol===cfg.symbol)&&r.expiry&&
    (!r.time||(r.time.slice(0,10)===date&&nyEpoch(r.time)<=asof))&&
    nyEpoch(r.expiry+'T'+expiryTime)>=target&&nyEpoch(r.expiry+'T'+expiryTime)>asof).map(r=>r.expiry))].sort():[];
  const code=!valid?'INCOMPLETE_TIME_INPUT':expired?'EXPIRED_CHAIN':blocked?'TERMINAL_CHAIN_FOR_LATER_TARGET':targetBeyond?'TARGET_AFTER_EXPIRY':target<expiry?'TARGET_BEFORE_EXPIRY':'TARGET_MATCHES_EXPIRY';
  let message='';
  if(blocked){
    message=expired?'Scadenza già chiusa rispetto allo snapshot.':'Chain a fine vita: restano '+seconds.toFixed(3)+' secondi alla scadenza reale.';
    message+=' Scadenza CSV '+(cfg.expiry||'')+' '+expiryTime+' ET; target '+(cfg.target||'').replace('T',' ')+' ET. Questa chain non supporta i livelli per il target richiesto.';
    message+=eligible.length?' Nel CSV è presente la scadenza '+eligible[0]+' compatibile con il target: selezionala.':' Carica una chain quotata allo snapshot e con scadenza non precedente al target '+targetDate+'. Non cambiare soltanto la data nel CSV.';
  }else if(targetBeyond){message='Il target è successivo alla scadenza: il risultato è uno scenario di scala, non una distribuzione osservata per il target. Preferisci una scadenza che copra il target.';}
  else if(valid&&target<expiry){message='La scadenza copre il target, ma è successiva: il ridimensionamento temporale rimane uno scenario.';}
  else if(valid){message='Target coincidente con la scadenza scelta. Restano da verificare bid/ask, filtri e qualità del fit.';}
  return {code,blocked,secondsToExpiry:seconds,terminalGuardSeconds:60,targetBeyondExpiry:targetBeyond,expiry:cfg.expiry||'',expiryTime,target:cfg.target||'',asof:cfg.asof||'',eligibleExpiries:eligible,recommendedExpiry:eligible[0]||'',message};
}
// The professional baseline is the flat-ATM projection of the *same* clean
// price spline. This avoids two contradictory definitions of ATM or time.
// Bounds on the forward-ATM option from the nearest quoted strikes. The
// vertical-spread Lipschitz constant D and convexity are in price space.
function localAtmEnvelope(model,cfg){
  if(cfg.quoteSource!=='mid'||cfg.overrideHours>0)return {available:false,reason:'Servono bid/ask osservati e orologio effettivo.'};
  if(!(cfg.maxAge>0))return {available:false,reason:'Imposta un filtro di freschezza positivo per documentare i prezzi usati.'};
  const {F,D}=model,now=nyEpoch(cfg.asof);
  const quotes=model.fitted.filter(q=>{
    const age=q.time?(now-nyEpoch(q.time))/1000:NaN;
    return !q.synthetic&&q.bid>=0&&q.ask>=q.bid&&q.ask>0&&age>=0&&age<=cfg.maxAge;
  }).sort((a,b)=>a.K-b.K);
  const nearLow=quotes.filter(q=>q.K<F).at(-1),nearHigh=quotes.find(q=>q.K>F),at=quotes.find(q=>q.K===F);
  if(!at&&!(nearLow&&nearHigh))return {available:false,reason:'Strike liquidi ai due lati di F o una quota ATM necessari.'};
  let lower=at?at.bid:0,upper=at?at.ask:D*F;
  let leftCallAsk=null,rightCallAsk=null;
  if(nearLow){
    const {K,bid,ask,side}=nearLow,parity=side==='PUT'?D*(F-K):0;
    leftCallAsk=ask+parity;lower=Math.max(lower,side==='PUT'?bid:bid-D*(F-K));upper=Math.min(upper,leftCallAsk);
  }
  if(nearHigh){
    const {K,bid,ask,side}=nearHigh,parity=side==='PUT'?D*(F-K):0;
    rightCallAsk=ask+parity;lower=Math.max(lower,bid+parity);upper=Math.min(upper,rightCallAsk+D*(K-F));
  }
  if(nearLow&&nearHigh){
    const f=(F-nearLow.K)/(nearHigh.K-nearLow.K);
    upper=Math.min(upper,(1-f)*leftCallAsk+f*rightCallAsk);
  }
  if(!(upper>=lower&&lower>=0&&upper<D*F))return {available:false,reason:'Vincoli ATM incompatibili o limite superiore non finito per la volatilità.'};
  // At K=F, C/(DF) = erf(v/sqrt(8)). Use the central normal-density
  // expansion for tiny premiums. No arbitrary bid floor is inserted.
  function invert(premium){
    if(premium===0)return 0;
    const fraction=premium/(D*F);
    if(fraction<1e-6){const y=fraction*Math.sqrt(2*Math.PI);return y*(1+y*y/24);}
    let hi=1;const residual=v=>2*Phi(v/2)-1-fraction;
    while(residual(hi)<0&&hi<32)hi*=2;
    return bisect(residual,0,hi,1e-13,90);
  }
  const fittedPremium=model.price(F,'CALL'),tol=1e-9*Math.max(1,upper);
  return {available:true,forward:F,discount:D,lowerPremium:lower,upperPremium:upper,lowerVolT:invert(lower),upperVolT:invert(upper),
    fittedPremium,fitInside:fittedPremium>=lower-tol&&fittedPremium<=upper+tol,
    quotes:[nearLow,at,nearHigh].filter(Boolean).map(q=>({strike:q.K,side:q.side,bid:q.bid,ask:q.ask,time:q.time})),
    definition:'Vincoli locali necessari del premio ATM, a forward e discount fissati. Le due ali, le quote escluse e il rischio sul forward richiedono analisi distinte.'};
}
function ippoEnvelopeRange(A,z,vLow,vHigh){
  const at=v=>A*Math.exp(v*(z-.5*v)),ends=[at(vLow),at(vHigh)];
  if(z>vLow&&z<vHigh)ends.push(at(z));
  return {low:Math.min(...ends),high:Math.max(...ends)};
}
function flatTailMoments(anchor,v,z){
  if(z===0)return null;
  const sign=z<0?-1:1,K=anchor*Math.exp(v*(z-.5*v));
  function logPhi(x){
    if(x>=-2)return Math.log(Phi(x));
    const a=-x;let cf=0;for(let j=180;j>=1;j--)cf=j/(a+cf);
    return -.5*x*x-.5*Math.log(2*Math.PI)-Math.log(a+cf);
  }
  const logP=logPhi(-Math.abs(z)),tail=Math.exp(logP),logP1=logPhi(sign*(v-z)),logP2=logPhi(sign*(2*v-z));
  const logMean=Math.log(anchor)+logP1-logP,relLog=Math.max(0,v*v+logP2+logP-2*logP1);
  let mean=Math.exp(logMean),sd=relLog<1?mean*Math.sqrt(Math.expm1(relLog)):Math.exp(logMean+.5*(relLog+Math.log1p(-Math.exp(-relLog))));
  if(v<.35){
    // Center at K and integrate relative excesses. This avoids subtracting
    // two nearly equal asset-price moments when approaching expiration.
    let weight=0,m1=0,m2=0;
    for(let step=0;step<14;step++)for(let j=0;j<GLX.length;j++){
      const dz=sign*(step+(1+GLX[j])/2),u=z+dz,w=.5*GLW[j]*phi(u)/tail,excess=Math.expm1(v*dz);
      weight+=w;m1+=w*excess;m2+=w*excess*excess;
    }
    m1/=weight;m2/=weight;mean=K*(1+m1);sd=K*Math.sqrt(Math.max(0,m2-m1*m1));
  }
  return {probability:tail,mean,sd,meanExcess:sign*(mean-K),direction:sign<0?'left':'right'};
}
function ippoDesk(model,cfg,T,alternativeAtm=[]){
  if(!(T>0&&cfg.targetT>0&&model.atmW>0))throw new Error('Ippo Desk: varianza/tempo non validi.');
  const iv=Math.sqrt(model.atmW/T),ratio=cfg.targetT/T,wH=model.atmW*ratio,v=Math.sqrt(wH),A=cfg.anchor==='native'?model.F:cfg.settlement;
  const sd=A*Math.sqrt(Math.expm1(wH));if(!(sd>0&&finite(sd)))throw new Error('Ippo Desk: deviazione standard fuori dal dominio numerico.');
  const cdf=L=>L>0?Phi((Math.log(L/A)+wH/2)/v):0,survival=L=>L>0?Phi(-(Math.log(L/A)+wH/2)/v):1;
  const atmEnvelope=localAtmEnvelope(model,cfg);
  if(atmEnvelope.available){
    const low=atmEnvelope.lowerVolT*Math.sqrt(ratio),high=atmEnvelope.upperVolT*Math.sqrt(ratio);
    Object.assign(atmEnvelope,{targetVolTLow:low,targetVolTHigh:high,targetSDLow:A*Math.sqrt(Math.expm1(low*low)),targetSDHigh:A*Math.sqrt(Math.expm1(high*high))});
  }
  const alternatives=alternativeAtm.filter(w=>finite(w)&&w>0);
  const levels=makeSigma(cfg).map(z=>{
    const price=z===0?cfg.settlement:A*Math.exp(v*(z-.5*v));
    const vals=[price,...alternatives.map(w=>z===0?cfg.settlement:A*Math.exp(Math.sqrt(w*ratio)*(z-.5*Math.sqrt(w*ratio))))];
    const conditionalTail=flatTailMoments(A,v,z),range=atmEnvelope.available&&z!==0?ippoEnvelopeRange(A,z,atmEnvelope.targetVolTLow,atmEnvelope.targetVolTHigh):null;
    return {z,price,family:'Ippo',p:z===0?cdf(cfg.settlement):Phi(z),tail:z===0?'Riferimento':'Baseline lognormale ATM',source:'ATM-forward da spline prezzi C²',
      direction:z<0?'left':z>0?'right':'reference',standardizedDistance:(price-A)/sd,tailProbability:conditionalTail?.probability??null,
      conditionalTail,atmQuoteRange:range,sensitivityCount:alternatives.length,sensitivityLow:alternatives.length?Math.min(...vals):null,sensitivityHigh:alternatives.length?Math.max(...vals):null,sensitivityWidth:alternatives.length?Math.max(...vals)-Math.min(...vals):null};
  });
  if(levels.some(l=>!(l.price>0&&finite(l.price))))throw new Error('Ippo Desk: livelli fuori dal dominio numerico.');
  return {variant:'desk',iv,atmW:model.atmW,wH,volT:v,fitReference:model.F,atmStrike:model.F,clock:'priceVariance',exact:false,adapted:false,skew:0,convexity:0,
    mean:A,median:A*Math.exp(-wH/2),sd,cdf,survival,levels,atmEnvelope,
    points:model.fitted.map(q=>({strike:q.K,iv:impliedTotal(model.F,q.K,q.mid,model.D,q.side)/Math.sqrt(T)})),spline:{at:()=>iv},warning:''};
}
// Deterministic interleaved strike validation. It selects smoothness, not a
// trading signal. Held-out quotes are never used to score their own fit.
function calibrateDensity(points,F,D,cfg){
  const candidates=cfg.autoSmoothing===false?[cfg.smoothing]:[3,30,300];
  const audit={mode:cfg.autoSmoothing===false?'manual':'cross_validation',folds:3,candidates:[],selectedLambda:cfg.smoothing,
    scoring:'Huber (3), errore su quote trattenute / max(half-spread, 0.05). Punteggio = media per quota; soglia 1-SE per regolarità.',
    forecastValidation:false};
  if(cfg.autoSmoothing!==false){
    for(const lambda of candidates){
      const foldLoss=[],losses=[];let ok=true;
      for(let fold=0;fold<3;fold++){
        if(typeof cfg.progress==='function')cfg.progress('Validazione spline · λ '+lambda+' · fold '+(fold+1)+'/3');
        const train=points.filter((q,i)=>i%3!==fold),test=points.filter((q,i)=>i%3===fold);
        if(train.length<8||train.filter(q=>q.side==='PUT').length<2||train.filter(q=>q.side==='CALL').length<2){ok=false;break;}
        try{
          const m=buildDensity(train,F,D,{...cfg,smoothing:lambda}),e=test.map(q=>{
            const z=Math.abs((m.price(q.K,q.side)-q.mid)/Math.max((q.ask-q.bid)/2,.05));return z<=3?.5*z*z:3*(z-1.5);
          });
          foldLoss.push(sum(e)/e.length);losses.push(...e);
        }catch(e){ok=false;audit.candidates.push({lambda,ok:false,error:e.message});break;}
      }
      if(ok){const score=sum(losses)/losses.length,mean=sum(foldLoss)/foldLoss.length,se=Math.sqrt(sum(foldLoss.map(v=>(v-mean)**2))/(foldLoss.length-1))/Math.sqrt(foldLoss.length);
        audit.candidates.push({lambda,ok:true,score,se,foldLoss,observations:losses.length});}
    }
    const good=audit.candidates.filter(a=>a.ok).sort((a,b)=>a.score-b.score);
    if(!good.length)throw new Error('Validazione spline non riuscita per nessuna regolarizzazione. Nessun fallback nascosto.');
    const best=good[0],threshold=best.score+best.se;
    audit.bestLambda=best.lambda;audit.oneSEThreshold=threshold;
    audit.selectedLambda=Math.max(...good.filter(a=>a.score<=threshold+1e-12).map(a=>a.lambda));
  }
  if(typeof cfg.progress==='function')cfg.progress('Fit completo · λ '+audit.selectedLambda);
  const model=buildDensity(points,F,D,{...cfg,smoothing:audit.selectedLambda});
  return {model,audit};
}
function atmAudit(model,points,T){
  const F=model.F,D=model.D,sqrtT=Math.sqrt(T),nearest=points.slice().sort((a,b)=>Math.abs(a.K-F)-Math.abs(b.K-F)).slice(0,10).sort((a,b)=>a.K-b.K);
  const puts=points.filter(q=>q.K<F),calls=points.filter(q=>q.K>=F),left=puts.at(-1),right=calls[0];
  const call=model.price(F),put=model.price(F,'PUT');
  let localCubicIV=NaN;
  try{const ns=nearest.map(q=>({x:Math.log(q.K/F),v:impliedTotal(F,q.K,q.mid,D,q.side)})).filter(q=>q.v>0);
    if(ns.length>=4&&ns[0].x<0&&ns.at(-1).x>0){const w=cubicNotAKnot(ns.map(q=>q.x),ns.map(q=>q.v*q.v)).at(0);if(w>0)localCubicIV=Math.sqrt(w/T);}
  }catch(e){}
  const iv=Math.sqrt(model.atmW/T),sd=F*Math.sqrt(model.atmW),h=.0001;
  const smile=k=>{const K=F*Math.exp(k),side=K<F?'PUT':'CALL';return impliedTotal(F,K,model.price(K,side),D,side)/sqrtT;};
  return {definition:'ATM-forward, K=F; totale v invertito da prezzo C²; IV annualizzata ACT/365',F,call,put,straddle:call+put,callPutDifference:call-put,
    totalStd:Math.sqrt(model.atmW),totalVariance:model.atmW,iv,localCubicIV,differenceLocalIV:iv-localCubicIV,
    nearestPutStrike:left?.K??null,nearestCallStrike:right?.K??null,leftGap:left?F-left.K:Infinity,rightGap:right?right.K-F:Infinity,
    maxGapInAtmStd:Math.max(left?F-left.K:Infinity,right?right.K-F:Infinity)/sd,
    nearQuoteCount:points.filter(q=>Math.abs(q.K-F)<=sd/2).length,
    nearRMSE:Math.sqrt(sum(nearest.map(q=>(model.price(q.K,q.side)-q.mid)**2))/nearest.length),
    dIVdLogK:(smile(h)-smile(-h))/(2*h),d2IVdLogK2:(smile(h)-2*iv+smile(-h))/(h*h)};
}
function asymmetry(levels,S){
  const positive=levels.filter(l=>l.z>0),out=[];
  for(const hi of positive){const lo=levels.find(l=>l.z===-hi.z);if(!lo)continue;const down=S-lo.price,up=hi.price-S;
    out.push({z:hi.z,lower:lo.price,upper:hi.price,downPoints:down,upPoints:up,ratioDownUp:up>0?down/up:null,difference:down-up,fullWidth:hi.price-lo.price});}
  return out;
}
function excludedPriceAudit(rows,model,cfg){
  const data=[],now=nyEpoch(cfg.asof);if(cfg.quoteSource!=='mid')return {count:0,inside:0,violations:0,usedInFit:false,data};
  for(const q of rows){const side=q.strike<model.F?'PUT':'CALL';
    if(q.right!==side||!(q.bid>=0&&q.bid<cfg.minBid&&q.ask>=q.bid&&q.ask>0))continue;
    if(!q.time||!finite(nyEpoch(q.time)))continue;
    const age=(now-nyEpoch(q.time))/1000;if(age<0||cfg.maxAge>0&&age>cfg.maxAge)continue;
    const price=model.price(q.strike,side),inside=price>=q.bid-1e-6&&price<=q.ask+1e-6;
    data.push({K:q.strike,side,bid:q.bid,ask:q.ask,fit:price,inside,ageSeconds:age});
  }
  return {count:data.length,inside:data.filter(q=>q.inside).length,violations:data.filter(q=>!q.inside).length,usedInFit:false,
    note:'Controllo ex post sulle quote fresche escluse dalla soglia bid; non usate per calibrare il fit base. Una violazione segnala dipendenza dal filtro, non densità negativa.',data};
}
// Price derivatives and bid/ask bounds are verified in native expiry coordinates.
function digitalBounds(result,K){
  const off=reason=>({available:false,consistent:false,reason,lower:null,upper:null,lowerPair:null,upperPair:null,eligible:0});
  if(!Number.isFinite(K)||!(K>0))return off('Serve una soglia cash nativa positiva.');
  const model=result?.ws?.model;
  if(!model||!(model.D>0)||result.cfg?.quoteSource!=='mid'||result.cfg?.overrideHours>0)return off('Servono bid/ask osservati per la stessa scadenza.');
  const rows=model.fitted.filter(o=>!o.synthetic&&o.bid>=0&&o.ask>=o.bid).sort((a,b)=>a.K-b.K);
  let lower=0,upper=1,lowerPair=null,upperPair=null,eligible=0;
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i];
    for(let j=i+1;j<rows.length;j++){
      const b=rows[j],width=(b.K-a.K)*model.D;
      if(b.side!==a.side||width<=0)continue;
      // For a put spread, use C(a)-C(b)=P(a)-P(b)+D*(b-a).
      const parity=a.side==='PUT'?1:0;
      if(b.K<=K){
        eligible++;
        const askSpread=parity+(a.ask-b.bid)/width;
        if(askSpread<upper){upper=askSpread;upperPair=[a.K,b.K];}
      }
      if(a.K>=K){
        eligible++;
        const bidSpread=parity+(a.bid-b.ask)/width;
        if(bidSpread>lower){lower=bidSpread;lowerPair=[a.K,b.K];}
      }
    }
  }
  if(!eligible)return off('Nessuno spread verticale idoneo attorno alla soglia.');
  const consistent=lower<=upper+1e-10;
  return{available:true,consistent,reason:consistent?'Vincoli unilaterali da spread verticali dello stesso lato, condizionati a quote compatibili.':'Vincoli incrociati fra bid e ask. Nessun intervallo utilizzabile.',
    eligible,lower:consistent?Math.min(1,Math.max(0,lower)):null,upper:consistent?Math.min(1,Math.max(0,upper)):null,
    lowerPair,upperPair,rawLower:lower,rawUpper:upper};
}
function verifyNativeDensity(model){if(model.cvi)return cviQA(model);
  const {F,D,scale}=model,knots=model.knots.map(k=>F+scale*k);
  function integrate(f,split){
    let total=0;
    // A piecewise linear density times a piecewise linear payoff has degree <= 2.
    const segment=(a,b)=>{const h=(b-a)/2,m=(a+b)/2,dx=h/Math.sqrt(3);
      return h*(f(m-dx)*model.pdf(m-dx)+f(m+dx)*model.pdf(m+dx));};
    for(let i=1;i<knots.length;i++){
      const a=knots[i-1],b=knots[i];
      total+=split>a&&split<b?segment(a,split)+segment(split,b):segment(a,b);
    }
    return total;
  }
  const mass=integrate(()=>1),meanOffset=integrate(s=>s-F);
  let maxPayoffError=0,maxParityError=0,maxDigitalError=0,maxDensityError=0,maxQuoteBreach=0;
  for(const o of model.fitted){
    const value=D*integrate(o.side==='CALL'?x=>Math.max(x-o.K,0):x=>Math.max(o.K-x,0),o.K);
    maxPayoffError=Math.max(maxPayoffError,Math.abs(value-o.fit));
    maxParityError=Math.max(maxParityError,Math.abs(model.price(o.K)-model.price(o.K,'PUT')-D*(F-o.K)));
    maxQuoteBreach=Math.max(maxQuoteBreach,o.bid-o.fit,o.fit-o.ask);
  }
  for(let i=1;i<knots.length;i++){
    const k=(knots[i-1]+knots[i])/2,h=(knots[i]-knots[i-1])/8,side=k<F?'PUT':'CALL';
    const v=j=>model.price(k+j*h,side)/D;
    const d1=(v(-2)-8*v(-1)+8*v(1)-v(2))/(12*h);
    const d2=(v(1)-2*v(0)+v(-1))/(h*h);
    maxDigitalError=Math.max(maxDigitalError,Math.abs(d1-(model.cdf(k)-(side==='CALL'?1:0))));
    maxDensityError=Math.max(maxDensityError,Math.abs(d2-model.pdf(k)));
  }
  const scaledError=Math.max(Math.abs(mass-1),Math.abs(meanOffset)/scale,maxPayoffError/(D*scale),maxParityError/(D*scale),maxDigitalError,maxDensityError*scale);
  return{mass,meanOffset,maxPayoffError,maxParityError,maxDigitalError,maxDensityError,maxQuoteBreach,scaledError,passed:Number.isFinite(scaledError)&&scaledError<1e-7,
    outsideQuotes:model.fitted.filter(o=>!o.inside).map(o=>({K:o.K,side:o.side,bid:o.bid,ask:o.ask,fit:o.fit,breach:Math.max(0,o.bid-o.fit,o.fit-o.ask)})),
    observations:model.fitted.length,derivativeIntervals:knots.length-1};
}
function qualityAudit(r){
  const w=r.ws,m=w.model,info=w.info,a=w.atmCheck,red=[],amber=[],checks=[];
  function check(name,ok,severity,message){checks.push({name,ok,severity});if(!ok)(severity==='red'?red:amber).push(message);}
  check('Numerical constraints',Math.abs(info.mass-1)<1e-8&&Math.abs(info.martingaleError)<1e-5&&info.minMass>=-1e-10,'red','Vincoli della distribuzione non superati.');
  check('KKT',info.kkt&&Math.max(info.kkt.freeStationarity,info.kkt.dualViolation,info.kkt.complementarity)<1e-7,'red','Certificato KKT non valido.');
  check('ATM bracket',a.maxGapInAtmStd<=1,'red','ATM non coperta: manca una quota su almeno un lato entro una deviazione ATM. Il fitting centrale sarebbe poco identificato.');
  check('Quote repricing',info.within>=.7&&info.rmsSpread<=2,'red','Fit prezzi insufficiente: meno del 70% entro spread oppure RMS oltre 2 half-spread.');
  check('Bid/ask fit quality',info.within>=.9&&info.rmsSpread<=.75,'amber','Fit non pienamente entro le tolleranze preferite (90% entro spread e RMS ≤0.75).');
  check('Robust convergence',info.robustConverged,'amber','Pesi robusti non stabilizzati entro il limite di iterazioni.');
  check('Forward identified',r.forward.source.startsWith('Parità')||r.forward.source==='Forward manuale','amber','Forward da ipotesi di carry, non identificato dalle coppie call/put.');
  check('Forward parity dispersion',!finite(r.forward.mad)||r.forward.mad<=Math.max(1,m.scale*.05),'amber','Dispersione delle stime forward elevata rispetto alla scala ATM.');
  if(finite(r.forward.nearLower))check('Simultaneous parity bands',r.forward.nearLower<=r.forward.nearUpper+1e-8,'amber','Le bande di parità bid/ask delle coppie ATM selezionate non hanno un forward comune.');
  if(w.qAudit)check('Independent payoff and derivative checks',w.qAudit.passed,'red','Verifica indipendente di massa, payoff, parità o derivate di prezzo oltre la tolleranza numerica.');
  check('Quote source',r.cfg.quoteSource==='mid','amber','Prezzi sintetici da IV: assenza di arbitraggio del fit non equivale a validazione sui bid/ask.');
  check('Quote timestamps',r.quoteAudit?.missingTimestamps===0&&r.cfg.maxAge>0,'amber','Sincronia delle quote non interamente verificata.');
  if(w.skew25&&!finite(w.skew25.ratio))check('25-delta diagnostics',false,'amber','Skew 25Δ non univoco o non risolto sul supporto del fit. Consulta le radici nel report.');
  check('Observed target',!r.isScenario,'amber','Target diverso dalla scadenza: distribuzione trasformata mediante ipotesi temporale.');
  check('Sensitivity complete',r.cfg.sensitivity&&w.sensitivityFits===(w.sensitivityRequested??10),'amber','Sensibilità non eseguita o incompleta: stabilità dei livelli non completamente verificata.');
  const central=w.levels.filter(l=>l.z&&Math.abs(l.z)<=2),centralMax=Math.max(0,...central.map(l=>l.sensitivityWidth||0));
  if(w.excludedPriceCheck?.violations)amber.push(w.excludedPriceCheck.violations+' / '+w.excludedPriceCheck.count+' quote fresche escluse per bid minimo non sono riprezzate entro bid/ask: la copertura delle ali dipende dal filtro.');
  check('Central stability',centralMax<=Math.max(3,w.sd*.1),'amber','Livelli fino a ±2σ sensibili ai parametri o alle quote oltre la soglia applicativa.');
  if(w.levels.some(l=>Math.abs(l.z)>=3&&(l.sensitivityWidth>5||l.tail==='Ala extrapolata')))amber.push('Code estreme sensibili: ±3σ/±4σ non hanno precisione operativa al centesimo.');
  return {level:red.length?'red':amber.length?'amber':'green',label:red.length?'REVISIONE NECESSARIA':amber.length?'CALCOLO VALIDO · LIMITI SEGNALATI':'CONTROLLI NUMERICI SUPERATI',checks,messages:[...red,...amber],centralSensitivityMax:centralMax,
    thresholds:{insidePreferred:.9,insideMinimum:.7,rmsPreferred:.75,rmsMaximum:2,atmMaxGapStd:1,kktTolerance:1e-7},
    note:'Soglie di controllo di questa implementazione, non standard normativi né garanzia di rendimento. Nessun backtest previsionale.'};
}
// Reconstruct callable models from a JSON report, so the browser can calibrate
// in an inline Web Worker and keep the UI responsive. No network dependency.
function hydrate(rep){
  const r={...rep,warnings:rep.warnings||[],errors:rep.errors||{}};
  if(rep.ws?.cvi){
    const a=rep.ws,c=a.cvi,profile=r.cfg.cviWingProfile??'desk';
    if(!['desk','wing'].includes(profile)||c.marks?.profile!==(profile==='wing'?'CVI_WING_MID_BOX_1':'CVI_INTRADAY_BOX_PROJECTION_2')||c.marks?.profile!==c.marks?.context?.markProfile)throw Error('Profilo e impronta del report CVI incoerenti.');
    if(!c.markReleased||c.status!=='MARK_RELEASED'||c.book?.status!=='FEASIBLE'||c.marks.status!=='VERIFIED_MARK'||c.marks.context.F!==a.F||c.marks.context.D!==a.D)throw Error('Report CVI sospeso o incoerente.');
    const model=cviModel({canonical:c.marks.canonical,context:c.marks.context,certificate:c.marks.certificate},a.fitted,r.T,Math.max(4,4*Math.sqrt(r.cfg.targetT/r.T)));
    if(c.marks.candidateFingerprint!==c.marks.certificate.fingerprint||!a.qAudit?.passed)throw Error('Report CVI privo di verifica completa.');
    model.info={...a.info,...model.info};r.ws={...a,model,mapping:mapped(model,r.cfg,r.T)};
  }else if(rep.ws){
    const a=rep.ws,knots=a.knots,tris=knots.slice(1,-1).map((b,i)=>triangle(knots[i],b,knots[i+2])),p=a.masses,F=a.F,D=a.D,scale=a.scale;
    const model={F,D,scale,knots,tris,p,info:a.info,fitted:a.fitted,atmW:a.atmW};
    const tailLaw=splineTailLaw(knots,p);model.cdf=K=>tailLaw.cdf((K-F)/scale);model.survival=K=>tailLaw.survival((K-F)/scale);
    model.pdf=K=>sum(tris.map((t,i)=>p[i]*t.pdf((K-F)/scale)))/scale;
    model.price=(K,side='CALL')=>D*scale*sum(tris.map((t,i)=>p[i]*(side==='PUT'?t.put((K-F)/scale):t.call((K-F)/scale))));
    model.quantile=prob=>F+scale*tailLaw.quantile(prob);model.isf=prob=>F+scale*tailLaw.isf(prob);
    r.ws={...a,model,mapping:mapped(model,r.cfg,r.T)};
  }
  if(rep.ippo){const i=rep.ippo;r.ippo={...i};
    if(i.variant==='desk'){
      if(r.ws&&i.levels.some(l=>l.z!==0&&!l.conditionalTail)){
        const alternatives=(r.ws.sensitivityDetails||[]).filter(v=>v.ok&&v.ivATM>0).map(v=>v.ivATM*v.ivATM*r.T);
        r.ippo=ippoDesk(r.ws.model,r.cfg,r.T,alternatives);
      }else{
        const anchor=r.cfg.anchor==='native'?r.forward.F:r.cfg.settlement,vol=Math.sqrt(i.wH);
        r.ippo.spline={at:()=>i.iv};r.ippo.mean=anchor;
        r.ippo.cdf=L=>L>0?Phi((Math.log(L/anchor)+i.wH/2)/vol):0;
        r.ippo.survival=L=>L>0?Phi(-(Math.log(L/anchor)+i.wH/2)/vol):1;
      }
    }
    else{const ref=i.fitReference||r.cfg.settlement;r.ippo.spline=cubicNotAKnot(i.points.map(p=>Math.log(p.strike/ref)),i.points.map(p=>p.iv));}
  }
  return r;
}

/* Single-expiry CVI mark. The canonical variance spline, its slope and curvature
   determine every price, digital and density below, including both linear wings. */
function cviModel(spec,fitted,T,maxMoment=4){
 const {canonical,context,certificate}=spec,{F,D}=context;
 if(context.T!==T||!(F>0&&D>0&&T>0)||certificate?.status!=='CERTIFIED'||CVICert.fingerprint(canonical,context)!==certificate.fingerprint)throw Error('Impronta o contesto del mark CVI non valido.');
 const evalW=k=>CVIFit.evaluate(canonical,k),atmW=evalW(0).w,volT=Math.sqrt(atmW),scale=F*volT;
 const pdfLog=k=>{const {w,wp,wpp}=evalW(k),s=Math.sqrt(w),d2=-k/s-s/2,g=(1-k*wp/(2*w))**2-wp*wp*(1/w+.25)/4+wpp/2;return CVIData.normalPDF(d2)*g/s;};
 const digital=(k,upper)=>{const {w,wp}=evalW(k),s=Math.sqrt(w),d2=-k/s-s/2,cor=CVIData.normalPDF(d2)*wp/(2*s);return upper?CVIData.normalCDF(d2)-cor:CVIData.normalCDF(-d2)+cor;};
 const cdf=K=>K<=0?0:K===Infinity?1:digital(Math.log(K/F),false);
 const survival=K=>K<=0?1:K===Infinity?0:digital(Math.log(K/F),true);
 function inverse(p,upper){
  if(!(p>=0&&p<=1))return NaN;
  if(p===0||p===1)return (upper?p===0:p===1)?Infinity:0;
  if(p>.5)return inverse(1-p,!upper);
  const test=k=>upper?p-digital(k,true):digital(k,false)-p;
  let l=-volT,h=volT;while(l>-700&&test(l)>0)l=Math.max(-700,l*2);while(h<700&&test(h)<0)h=Math.min(700,h*2);
  if(test(l)>0||test(h)<0)return NaN;
  for(let j=0;j<85;j++){const m=(l+h)/2;if(l===m||h===m)break;if(test(m)<0)l=m;else h=m;}
  return F*Math.exp((l+h)/2);
 }
 const pdf=K=>K>0&&finite(K)?pdfLog(Math.log(K/F))/K:0;
 const price=(K,side='CALL')=>K===0?(side==='PUT'?0:D*F):K>0?CVIData.black(F,K,D,evalW(Math.log(K/F)).w,side):NaN;
 const knotsK=canonical.knots;
 function wingLimits(direction,order){
  const edge=direction<0?knotsK[0]:knotsK.at(-1),{wp,w}=evalW(edge);
  const b=direction*wp,a=w-wp*edge,critical=b>0?1/(2*b)+direction*.5+b/8:Infinity;
  if(b<0||order>=critical)throw Error('Momento di ordine '+order.toFixed(3)+' fuori dal dominio dell’ala CVI. Ridurre l’orizzonte dello scenario.');
  let radius=Math.max(direction*edge,4*volT,.0001);
  for(let i=0;i<80&&radius<30;i++,radius*=1.32){
   const wr=a+b*radius,B=Math.max(b,wr/radius),decay=1/(2*B)+direction*.5+b/8-order;
   if(!(wr>0&&decay>0))continue;
   // log-density times exp(order*u), u=|k|. k/w is monotone on each linear wing.
   const gMax=Math.max(1,(1-radius*b/(2*wr))**2);
   const logBound=Math.log(gMax)-.5*Math.log(2*Math.PI*wr)-a/8-decay*radius-Math.log(decay);
   if(logBound<Math.log(2e-18))return {radius,remainder:Math.exp(logBound),critical:finite(critical)?critical:null};
  }
  throw Error('Ali CVI troppo estese per valutare il momento richiesto con la precisione numerica del desk.');
 }
 const left=wingLimits(-1,0),right=wingLimits(1,maxMoment);
 const breaks=[-left.radius,...knotsK,right.radius,0].sort((a,b)=>a-b);
 const ks=[];for(let i=0;i<breaks.length-1;i++){
  const a=breaks[i],b=breaks[i+1];if(b-a<1e-15)continue;
  // Density can change rapidly at the centre. Geometric cells keep external wings resolved.
  let z=a;while(z<b-1e-14){ks.push(z);const h=Math.max(.20*volT,.10*Math.abs(z));z=Math.min(b,z+h);}
 }ks.push(breaks.at(-1));
 const prices=ks.map(k=>F*Math.exp(k)),knots=prices.map(v=>(v-F)/scale);
 const weightCache=[];
 for(let j=1;j<ks.length;j++){const mid=(ks[j]+ks[j-1])/2,h=(ks[j]-ks[j-1])/2;
  for(let i=0;i<GLX.length;i++){const k=mid+h*GLX[i];weightCache.push([F*Math.exp(k),h*GLW[i]*pdfLog(k)]);}}
 const expect=fn=>{let total=0,c=0;for(const [K,p] of weightCache){const t=p*fn(K)-c,next=total+t;c=(next-total)-t;total=next;}return total;};
 const mass=expect(()=>1),meanOffset=expect(K=>K-F),sd=Math.sqrt(expect(K=>(K-F)**2));
 if(!(Math.abs(mass-1)<1e-9&&Math.abs(meanOffset)<1e-6&&finite(sd)&&sd>0))throw Error('Quadratura CVI non convergente su massa, media o deviazione standard.');
 return {cvi:spec,F,D,T,scale,volT,knots,atmW,pdf,cdf,survival,quantile:p=>inverse(p,false),isf:p=>inverse(p,true),price,expect,pdfLog,
   varianceAt:K=>evalW(Math.log(K/F)).w,fitted,limits:{left,right,maxMoment,prices:[prices[0],prices.at(-1)]},
   info:{mass,mean:F+meanOffset,martingaleError:meanOffset,sd,supportLower:0,supportUpper:null,integrationRange:[prices[0],prices.at(-1)],knotCount:knotsK.length}};
}
function cviQA(m){
 const {F,D,scale}=m,prices=m.knots.map(k=>F+scale*k);
 function quad(a,b,fn){const mid=(a+b)/2,h=(b-a)/2;let v=0;for(let j=0;j<GLX.length;j++){const x=mid+h*GLX[j];v+=GLW[j]*m.pdf(x)*fn(x);}return h*v;}
 const cumulative=[0],first=[0];for(let j=1;j<prices.length;j++){const a=prices[j-1],b=prices[j];cumulative.push(cumulative.at(-1)+quad(a,b,()=>1));first.push(first.at(-1)+quad(a,b,x=>x-F));}
 const mass=cumulative.at(-1),meanOffset=first.at(-1);let maxPayoffError=0,maxParityError=0,maxQuoteBreach=0,maxDigitalError=0,maxDensityError=0,maxCDFError=0;
 for(const o of m.fitted){const K=o.K;let i=0;while(i<prices.length-2&&prices[i+1]<=K)i++;
  const left=K<=prices[0]?0:K>=prices.at(-1)?mass:cumulative[i]+quad(prices[i],K,()=>1);
  const off=K<=prices[0]?0:K>=prices.at(-1)?meanOffset:first[i]+quad(prices[i],K,x=>x-F);
  const pv=o.side==='PUT'?D*((K-F)*left-off):D*((F-K)*(mass-left)+meanOffset-off);
  maxPayoffError=Math.max(maxPayoffError,Math.abs(pv-o.fit));maxCDFError=Math.max(maxCDFError,Math.abs(left-m.cdf(K)));
  maxParityError=Math.max(maxParityError,Math.abs(m.price(K)-m.price(K,'PUT')-D*(F-K)));
  maxQuoteBreach=Math.max(maxQuoteBreach,o.bid-o.fit,o.fit-o.ask);
 }
 // Evaluate at geometric cell centres away from knots. Differentiate the OTM price.
 const s=m.cvi.canonical.knots;
 for(let j=1;j<s.length;j++){const lo=F*Math.exp(s[j-1]),hi=F*Math.exp(s[j]),K=(lo+hi)/2;
  const h=Math.min((hi-lo)/8,scale*.0005),side=K<F?'PUT':'CALL',v=d=>m.price(K+d*h,side)/D;
  const first=(v(-2)-8*v(-1)+8*v(1)-v(2))/(12*h),second=(-v(-2)+16*v(-1)-30*v(0)+16*v(1)-v(2))/(12*h*h);
  maxDigitalError=Math.max(maxDigitalError,Math.abs(first-(side==='PUT'?m.cdf(K):-m.survival(K))));
  maxDensityError=Math.max(maxDensityError,Math.abs(second-m.pdf(K)));
 }
 const scaledError=Math.max(Math.abs(mass-1),Math.abs(meanOffset)/scale,maxCDFError,maxPayoffError/(D*scale),maxParityError/(D*scale),maxDigitalError);
 // Curvature finite differences are noisier than the analytic certificate.
 const passed=finite(scaledError)&&scaledError<1e-7&&maxDensityError*scale<2e-5;
 return {mass,meanOffset,maxCDFError,maxPayoffError,maxParityError,maxDigitalError,maxDensityError,maxQuoteBreach,
   scaledError,passed,observations:m.fitted.length,outsideQuotes:m.fitted.filter(v=>!v.inside),derivativeIntervals:s.length-1};
}
function cviDataset(raw,rows,cfg){
 const symbol=cfg.symbol||rows.find(r=>r.symbol)?.symbol,date=cfg.asof.slice(0,10),id=symbol+'|'+date;
 const files=[],records=[],issues=[];
 function normalized(part,name){
  const sourceIndex=files.length;files.push({name});
  for(const [i,r] of part.entries())if(!r.assumedSymbol&&r.symbol===symbol&&r.time?.slice(0,10)===date){
   records.push({symbol,expiry:r.expiry,K:r.strike,side:r.right,bid:finite(r.bid)?r.bid:null,ask:finite(r.ask)?r.ask:null,
    malformed:r.cviMalformed===true,ms:CVIData.epochET(r.time),date,sourceIndex,row:r.sourceRow??i+2});
  }
 }
 if(raw?.length){
  for(const file of raw){
   const headers=table(file.text).headers.map(canonical);
   const wide=!headers.some(h=>aliases.right.includes(h)||h==='side')&&headers.some(h=>['callbid','bidcall','callask','askcall','putbid','bidput','putask','askput'].includes(h));
   if(wide){normalized(parseCSV(file.text).rows,file.name);continue;}
   const src=CVIData.parseFiles([file]),offset=files.length;files.push(...src.files);issues.push(...src.issues);
   for(const r of src.rows)if(r.symbol===symbol&&r.date===date)records.push({...r,sourceIndex:r.sourceIndex+offset});
  }
 }else normalized(rows,'chain normalizzata');
 return {files,issues,rows:records,groups:[{id,symbol,date,rows:records.length,expiries:[...new Set(records.map(r=>r.expiry).filter(Boolean))]}]};
}
function computeCVI(rows,cfg,T,time,selected){
 const {cviFiles,...savedCfg}=cfg;
 const warnings=[],errors={},out={version:VERSION,cfg:savedCfg,T,selectedRows:selected.rows.length,duplicates:selected.duplicates,warnings,errors,ippo:null,ws:null,quoteAudit:null,wsExcluded:[],forward:{source:'Parità CVI in attesa',F:null,D:Math.exp(-cfg.rate*T),pairs:0,mad:null}};
 out.inputCheck=horizonCheck(rows,cfg);out.isScenario=Math.abs(cfg.targetT-T)>1e-13||cfg.overrideHours>0;
 // Historical notebook mode is a user-selected technical calculation, independent of CVI.
 if(cfg.ippoIV!=='desk'){try{
   const techForward=inferForward(selected.rows,cfg,Math.max(T,0));out.forward=techForward;
   out.ippo=ippo(selected.rows,cfg,T,techForward);if(out.ippo.warning)warnings.push(out.ippo.warning);
   if(out.inputCheck.blocked){out.ippo.unsuitableForTarget=true;for(const z of out.ippo.levels)z.tail='IV terminale · sola replica tecnica';}
  }catch(e){errors.ippo=e.message;}}
 try{
  if(out.inputCheck.blocked)throw Error(out.inputCheck.message);
  if(cfg.quoteSource!=='mid'||cfg.overrideHours>0||cfg.forward>0||!(cfg.maxAge>0))throw Error('Il mark CVI richiede bid/ask osservati, tempo effettivo, filtro di età positivo e forward da parità.');
  const symbol=cfg.symbol||selected.rows[0].symbol;
  if(symbol!=='SPXW')throw Error('Il profilo verificato richiede opzioni europee SPXW con scadenza e fixing PM identificati.');
  const d=cviDataset(cviFiles,rows,cfg),group=d.groups.find(g=>g.symbol===symbol&&g.date===cfg.asof.slice(0,10)&&g.expiries.includes(cfg.expiry));
  if(!group)throw Error('La seduta, la scadenza e la radice richieste non sono presenti nei CSV.');
  if(cviFiles?.length){
   // The raw source must describe the actual selection, including both legs
   // of every strike. Subset replays cannot accidentally refit excluded quotes.
   const rawLatest=new Map();
   for(const r of d.rows)if(r.expiry===cfg.expiry&&r.ms<=time){const id=r.side+'|'+r.K;
    if(!rawLatest.has(id)||rawLatest.get(id).ms<r.ms)rawLatest.set(id,r);}
   if(rawLatest.size!==selected.rows.length||selected.rows.some(r=>{
    const v=rawLatest.get(r.right+'|'+r.strike);
    return !v||v.ms!==CVIData.epochET(r.time)||v.bid!==(finite(r.bid)?r.bid:null)||v.ask!==(finite(r.ask)?r.ask:null);
   }))throw Error('I CSV sorgente e le righe selezionate descrivono snapshot diversi.');
  }
  const options={asof:time,fixing:cfg.expiryTime,rate:cfg.rate,maxAge:cfg.maxAge,maxPairGap:cfg.maxPairGap,minBid:cfg.minBid,maxSpread:cfg.maxSpread,lambdaTV:.0003};
  if(!Object.is(time,CVIData.epochET(cfg.asof)))throw Error('Cutoff ambiguo o incompatibile con il calendario di New York.');
  const fit=lambda=>{const g=CVILab.build(d,{...group,expiries:[cfg.expiry]},{...options,lambdaTV:lambda});const f=g.curves[0];
   if(!f)throw Error(g.errors.map(v=>v.reason).join(' · ')||'Calibrazione CVI indisponibile.');
   if(f.T!==T)throw Error('Fixing o tempo CVI incoerente con l’orologio della piattaforma.');
   if(cfg.cviWingProfile!=null&&!['desk','wing'].includes(cfg.cviWingProfile))throw Error('Profilo CVI sconosciuto.');
   const c=CVIIntraday.analyze(f,cfg.cviWingProfile==='wing');
   if(!c.markReleased||c.marks.certificate?.status!=='CERTIFIED'||c.book.status!=='FEASIBLE')throw Error(c.reason||'Il mark CVI non supera tutti i controlli.');
   const fitted=f.points.filter(v=>finite(v.mid)&&v.wMid>0).map(p=>{
    const fit=CVIData.black(f.F,p.K,f.D,CVIFit.evaluate(c.marks.canonical,p.k).w,p.side);
    return {K:p.K,side:p.side,bid:p.bid,ask:p.ask,mid:p.mid,fit,residual:fit-p.mid,z:(fit-p.mid)/Math.max(.005,(p.ask-p.bid)/2),inside:fit>=p.bid&&fit<=p.ask,
     synthetic:false,source:p.source,sourceRow:p.row,time:CVIData.timeET(p.ms),sourceIV:Math.sqrt(p.wMid/T),ageSeconds:p.age};});
   const spec={canonical:c.marks.canonical,context:c.marks.context,certificate:c.marks.certificate};
   const alpha=Math.sqrt(cfg.targetT/T),model=cviModel(spec,fitted,T,Math.max(4,4*alpha));const market=c.marks.market,kkt=c.marks.solver;
   Object.assign(model.info,{within:market.inside/market.bilateral,minMass:0,rmsSpread:market.rmsHalfSpread,rmsePrice:market.rmse,observations:market.bilateral,
    bilateral:market.bilateral,unilateral:market.unilateral,unilateralInside:market.sidedInside,iterations:kkt.sweeps,robustConverged:true,
    kkt:{freeStationarity:kkt.stationarity,dualViolation:Math.max(0,-kkt.dualMin),complementarity:kkt.absoluteComplementarity,primal:kkt.scaledPrimalViolation}});
   return {f,c,model};};
  if(typeof cfg.progress==='function')cfg.progress('CVI · smile, verifica continua e riprezzamento bid/ask');
  const {f,c,model}=fit(options.lambdaTV),a=f.audit,pa=a.parity;
  const lower=model.fitted[0].K,upper=model.fitted.at(-1).K,mp=mapped(model,cfg,T);
  out.forward={F:f.F,D:f.D,source:'Parità CVI · Huber su call/put sincrone',pairs:pa.count,mad:pa.mad,nearLower:pa.lo,nearUpper:pa.hi,maxPairGap:cfg.maxPairGap,asynchronousExcluded:pa.asyncPairs};
  const simple=quotePoints(selected.rows,cfg,out.forward,T,true);
  out.quoteAudit={...simple.diagnostics,used:a.accepted,bilateral:a.twoSided,oneSided:a.askOnly+a.bidOnly,puts:c.points.filter(p=>p.side==='PUT').length,calls:c.points.filter(p=>p.side==='CALL').length,
    cviCounts:{future:a.future,stale:a.stale,invalid:a.invalid,itm:a.itm,wide:a.wide,empty:a.empty,boundary:a.boundary},reasons:{ITM:a.itm,'Quote obsolete':a.stale,'Bid/ask non validi':a.invalid,'Spread eccessivo':a.wide,'Senza un lato utilizzabile':a.empty,'Fuori dominio Black':a.boundary}};
  out.wsExcluded=a.excluded;out.calibration={mode:'CVI_MARK',selectedLambda:options.lambdaTV,candidates:[],notes:[],engine:c.marks.profile,fingerprint:c.marks.candidateFingerprint,market:c.marks.market,certificate:c.marks.certificate.status};
  const grid=makeSigma(cfg),probs=grid.map(z=>CVIData.normalCDF(-Math.abs(z)));
  const levelPrices=(model,mp)=>grid.map((z,i)=>z===0?cfg.settlement:(z<0?mp.quantile(probs[i]):mp.isf(probs[i])));
  const central=levelPrices(model,mp),alts=[],altATM=[],details=[];
  const lambdas=cfg.sensitivity?[options.lambdaTV/2,options.lambdaTV*2]:[];
  for(const lambda of lambdas){const label='CVI λTV '+lambda;try{if(typeof cfg.progress==='function')cfg.progress(label);
    const alt=fit(lambda),am=mapped(alt.model,cfg,T),prices=alt.model.knots.map(v=>alt.model.F+alt.model.scale*v);
    const levels=levelPrices(alt.model,am);alts.push(levels);altATM.push(alt.model.atmW);
    details.push({label,ok:true,nativeProfile:{prices,densities:prices.map(k=>alt.model.pdf(k)),cumulative:prices.map(k=>alt.model.cdf(k)),cvi:alt.model.cvi},mapping:{alpha:am.alpha,anchor:am.anchor,norm:am.norm},nativeLiquid:[lower,upper],observations:alt.model.info.observations,ivATM:Math.sqrt(alt.model.atmW/T),within:alt.model.info.within,levels});
   }catch(e){details.push({label,ok:false,error:e.message});warnings.push(label+' · '+e.message);}}
  const sigma=mp.alpha===1?model.info.sd*mp.anchor/model.F:Math.sqrt(model.expect(K=>(mp.map(K)-mp.anchor)**2));
  const levels=grid.map((z,i)=>{const price=central[i],nativePrice=mp.unmap(price),p=z===0?mp.cdf(price):CVIData.normalCDF(z),inside=nativePrice>=lower&&nativePrice<=upper;
   const v=alts.length?[price,...alts.map(a=>a[i])]:[],slo=v.length?Math.min(...v):null,shi=v.length?Math.max(...v):null;
   return {z,price,nativePrice,family:'Wall Street',p,tail:z===0?'Riferimento':!inside?'Ala extrapolata':Math.abs(z)>=3?'Coda fragile':'Interpolazione fra quote',
    source:'CVI mark · smile completa',sensitivityLow:slo,sensitivityHigh:shi,sensitivityWidth:v.length?shi-slo:null,sensitivityCount:alts.length,withinLiquid:inside,
    direction:z<0?'lower':z>0?'upper':'reference',tailProbability:z===0?null:z<0?mp.cdf(price):mp.survival(price),standardizedDistance:(price-mp.anchor)/sigma};});
  const before=atmAudit(model,model.fitted,T);before.definition='ATM-forward CVI. Varianza totale w(0), IV ACT/365.';
  const admitted=new Set(f.points.map(p=>p.side+'|'+p.K));
  const exCheck=excludedPriceAudit(selected.rows.filter(r=>!admitted.has(r.right+'|'+r.strike)),model,cfg);
  const qa=cviQA(model);if(!qa.passed)throw Error('Il controllo indipendente di payoff, derivate, media o massa del mark CVI è fuori tolleranza.');
  out.ws={cvi:c,model,mapping:mp,levels,excluded:out.wsExcluded,info:model.info,ivATM:Math.sqrt(model.atmW/T),median:mp.quantile(.5),sd:sigma,skew25:normalizedSkew(model,T),
   nativeLiquid:[lower,upper],sensitivityFits:alts.length,sensitivityRequested:lambdas.length,sensitivityDetails:details,calibration:out.calibration,atmCheck:before,
   excludedPriceCheck:exCheck,asymmetry:asymmetry(levels,cfg.settlement),qAudit:qa};
  if(cfg.ippoIV==='desk'){out.ippo=ippoDesk(model,cfg,T,altATM);out.ippo.levels.forEach(v=>v.source='CVI mark · ATM-forward');}
  out.quality=qualityAudit(out);if(out.quality.level==='red')throw Error(out.quality.messages.join(' '));warnings.push(...out.quality.messages);
  if(out.isScenario)warnings.push('Orizzonte trasformato: i quantili si riferiscono allo scenario temporale selezionato.');
  if(cfg.anchor!=='native'&&Math.abs(cfg.settlement/model.F-1)>.005)warnings.push('Settlement distante dal forward di oltre 0,5%. I livelli sono ribasati sul riferimento inserito.');
 }catch(e){out.ws=null;out.calibration=null;out.quality=null;errors.ws='Mark CVI sospeso · '+e.message;if(cfg.ippoIV==='desk'){out.ippo=null;errors.ippo=errors.ws;}}
 return out;
}

function compute(rows, settings={}){
  const cfg={settlement:NaN,asof:'',expiry:'',expiryTime:'16:00',target:'',symbol:'',rate:0,dividend:0,forward:0,minBid:.05,maxAge:300,maxSpread:1,
    smoothing:100,autoSmoothing:true,knotStep:.25,maxPairGap:30,tailPenalty:.1,regularTails:true,robust:true,guard:1,quoteSource:'mid',ippoClock:'calendar',ippoIV:'desk',strictIppo:false,anchor:'settlement',maxSigma:4,step:.5,sensitivity:true,...settings};
  if(!(cfg.settlement>0&&finite(cfg.settlement)))throw new Error('Inserisci un settlement SPX positivo.');
  for(const k of ['rate','dividend','forward','minBid','maxAge','maxSpread','smoothing','tailPenalty','guard','knotStep','maxPairGap'])if(!finite(cfg[k]))throw new Error('Parametro numerico non valido: '+k);
  if(!['calendar','legacy252'].includes(cfg.ippoClock))throw new Error('Orologio Ippo non riconosciuto.');
  if(!['desk','csv','reprice'].includes(cfg.ippoIV))throw new Error('Metodo Ippo non riconosciuto.');
  if(!['mid','iv'].includes(cfg.quoteSource)||!['settlement','native'].includes(cfg.anchor))throw new Error('Convenzione quote/ancoraggio non valida.');
  if(cfg.forward<0||cfg.knotStep<.1||cfg.knotStep>.5||cfg.maxPairGap<0)throw new Error('Forward, griglia o sincronia call/put non validi.');
  if(cfg.overrideHours!=null&&(!finite(cfg.overrideHours)||cfg.overrideHours<0))throw new Error('Ore forzate non valide.');
  makeSigma(cfg);
  if(cfg.minBid<0||cfg.maxAge<0||cfg.maxSpread<=0||cfg.smoothing<0||cfg.tailPenalty<0||cfg.guard<=0)throw new Error('I parametri di qualità e regolarizzazione devono rispettare i limiti indicati.');
  if(!cfg.asof||!cfg.expiry||!cfg.target)throw new Error('Data/ora snapshot, scadenza e target sono obbligatori.');
  const asof=nyEpoch(cfg.asof),expiry=nyEpoch(cfg.expiry+'T'+cfg.expiryTime),target=nyEpoch(cfg.target);
  let T=(expiry-asof)/YEAR;cfg.targetT=(target-asof)/YEAR;
  if(cfg.overrideHours>0)T=cfg.overrideHours/(365*24);
  if(![asof,expiry,target].every(finite))throw new Error('Data o ora non valida: controlla snapshot, scadenza e target.');
  if(!(cfg.targetT>0))throw new Error('Il target deve essere successivo allo snapshot del CSV, non alla data del computer.');
  const selected=selectSnapshot(rows,cfg);if(!selected.rows.length)throw new Error('Nessuna opzione per la combinazione data/scadenza/simbolo selezionata.');
  return computeCVI(rows,cfg,T,asof,selected);
}
function levelMeasurement(result,level){
  const isIppo=level.family==='Ippo',ws=result.ws,flat=isIppo&&result.ippo?.variant==='desk';
  const model=flat?'IPPO_ATM_LOGNORMAL':isIppo?'TECHNICAL_LEVEL':'FITTED_SMILE',K=level.price;
  const map=ws?.mapping,cdf=map?Math.max(0,Math.min(1,map.cdf(K))):null;
  // On earlier report formats the reconstructed curve may not expose an SF.
  const sf=map?Math.max(0,Math.min(1,map.survival?map.survival(K):1-cdf)):null;
  const tail=level.z<0?cdf:level.z>0?sf:null;
  const center=isIppo?(flat?(result.ippo.mean??(result.cfg.anchor==='native'?result.forward.F:result.cfg.settlement)):null):map?.anchor;
  const sigma=flat?result.ippo.sd:!isIppo?ws?.sd:null;
  const sigmaDistance=finite(center)&&finite(sigma)&&sigma>0?(K-center)/sigma:null;
  const source=!ws?'UNAVAILABLE':result.cfg.quoteSource==='iv'?'SYNTHETIC_IV':result.isScenario||result.cfg.anchor!=='native'?'MAPPED_Q':'NATIVE_Q';
  return {model,modelCDF:finite(level.p)?level.p:null,modelTail:isIppo?(flat&&level.z!==0?Phi(-Math.abs(level.z)):null):tail,
    smileCDF:cdf,smileTail:tail,smileMeasure:source,priceStandardDeviations:sigmaDistance};
}

function exportText(result,family='ws',basis=0,tick=.01){
  if(result.inputCheck?.blocked&&family!=='ippo')throw new Error('Wall Street non disponibile: chain scaduta o terminale non adatta al target. Per la sola replica tecnica seleziona Ippo; non è una previsione validata per il target. Il report diagnostico resta disponibile.');
  if(!['ws','ippo','both'].includes(family))throw new Error('Famiglia export non valida.');
  if(result.quality?.level==='red' && (family!=='ippo'||result.ippo?.variant==='desk'))throw new Error('Export sospeso: controlli di qualità non superati. Leggi Audit e correggi dati/parametri.');
  if(!finite(basis)||!(tick>0&&finite(tick)))throw new Error('Basis e tick non validi.');
  const objects=family==='both'?[result.ippo,result.ws]:[result[family]];
  if(objects.some(o=>!o))throw new Error('Famiglia selezionata non disponibile: scegli una famiglia calcolata.');
  return objects.filter(Boolean).flatMap(o=>o.levels).filter(l=>finite(l.price)).sort((a,b)=>(a.price-b.price)||a.family.localeCompare(b.family)).map(l=>{
    const price=Math.round((l.price+basis)/tick)*tick,label=l.z===0?'0':l.z<0?'−'+Math.abs(l.z):'+'+l.z;
    const kind=l.z===0?'SETTLEMENT':l.z<0?'LOWER':'UPPER',model=l.z===0?'':l.family==='Wall Street'?' · percentile smile':result.ippo?.variant==='desk'?' · percentile ATM':' · banda tecnica';
    const crossing=l.z!==0&&(l.z<0?l.price>=result.cfg.settlement:l.price<=result.cfg.settlement);
    return `${price.toFixed(2)}, ${label}σ ${l.family} ${kind}${model}${crossing?' · '+(l.price>result.cfg.settlement?'sopra':l.price<result.cfg.settlement?'sotto':'sul')+' riferimento':''}`;
  }).join('\n');
}
function exportPine(result,family='ws',basis=0,tick=.01){
  const rows=exportText(result,family,basis,tick).split('\n').filter(Boolean);
  const head=['//@version=6','indicator("Quantistes — livelli SPX/ES", overlay=true)','// Snapshot '+result.cfg.asof+' ET; target '+result.cfg.target+' ET.',
    '// Ippo: '+(result.ippo?.variant==='desk'?'ATM lognormal, curva comune; varianza target':'replica notebook')+'.',
    '// Livelli statici. Sigma Wall Street = percentile equivalente normale, non probabilità di inversione.','// Basis manuale ES-SPX: '+basis+' punti. Nessun aggiornamento automatico.'];
  for(const row of rows){const at=row.indexOf(','),v=row.slice(0,at),label=row.slice(at+2),color=label.includes('SETTLEMENT')?'color.silver':label.includes('Ippo')?'color.aqua':'color.orange';head.push(`hline(${v}, "${label}", color=${color}, linestyle=${label.includes('SETTLEMENT')?'hline.style_solid':'hline.style_dotted'})`);}
  return head.join('\n');
}
function report(result){
  const {cfg,T,forward,selectedRows,duplicates,warnings,errors}=result;
  return {version:VERSION,cfg:Object.fromEntries(Object.entries(cfg).filter(([k,v])=>typeof v!=='function')),T,forward,selectedRows,duplicates,warnings,errors,quality:result.quality,calibration:result.calibration,inputCheck:result.inputCheck,isScenario:result.isScenario,quoteAudit:result.quoteAudit,wsExcluded:result.wsExcluded,
    ippo:result.ippo?{variant:result.ippo.variant,fitReference:result.ippo.fitReference,clock:result.ippo.clock,nodeAudit:result.ippo.nodeAudit,atmEnvelope:result.ippo.atmEnvelope,mean:result.ippo.mean,median:result.ippo.median,sd:result.ippo.sd,wH:result.ippo.wH,atmW:result.ippo.atmW,iv:result.ippo.iv,volT:result.ippo.volT,atmStrike:result.ippo.atmStrike,skew:result.ippo.skew,convexity:result.ippo.convexity,exact:result.ippo.exact,unsuitableForTarget:!!result.ippo.unsuitableForTarget,adapted:result.ippo.adapted,points:result.ippo.points,levels:result.ippo.levels.map(l=>({...l,measurement:levelMeasurement(result,l)}))}:null,
    ws:result.ws?{cvi:result.ws.cvi,sensitivityRequested:result.ws.sensitivityRequested,qAudit:result.ws.qAudit,excludedPriceCheck:result.ws.excludedPriceCheck,atmCheck:result.ws.atmCheck,asymmetry:result.ws.asymmetry,calibration:result.ws.calibration,sensitivityDetails:result.ws.sensitivityDetails,F:result.ws.model.F,D:result.ws.model.D,scale:result.ws.model.scale,atmW:result.ws.model.atmW,info:result.ws.info,ivATM:result.ws.ivATM,median:result.ws.median,sd:result.ws.sd,skew25:result.ws.skew25,levels:result.ws.levels,nativeLiquid:result.ws.nativeLiquid,sensitivityFits:result.ws.sensitivityFits,excluded:result.ws.excluded,
      knots:result.ws.model.knots,masses:result.ws.model.p,fitted:result.ws.model.fitted,mapping:{alpha:result.ws.mapping.alpha,anchor:result.ws.mapping.anchor,norm:result.ws.mapping.norm}}:null};
}
function forwardVariance(w1,T1,w2,T2){if(!(T2>T1&&T1>0&&finite(w1)&&finite(w2)))return {error:'Due scadenze positive e ordinate sono necessarie.'};const variance=(w2-w1)/(T2-T1);return variance<0?{variance,error:'Varianza forward negativa: confronto non utilizzabile. Non viene tagliata a zero.'}:{variance,volatility:Math.sqrt(variance)};}
return {VERSION,cviModel,number,median,weightedMedian,canonical,records,table,parseCSV,parseOHLC,dateText,timestampText,nyFormat,nyEpoch,nextWeekday,phi,Phi,bisect,black,impliedTotal,solveLinear,cubicNotAKnot,
  linearTailLaw,lowerQuantile,verifyNativeDensity,digitalBounds,triangle,qpNonnegative,buildDensity,quotePoints,inferForward,selectSnapshot,snapshotInfo,horizonCheck,ippo,ippoDesk,calibrateDensity,atmAudit,asymmetry,excludedPriceAudit,qualityAudit,hydrate,makeSigma,compute,levelMeasurement,ippoEnvelopeRange,exportText,exportPine,report,forwardVariance,expectation,mapped};
});
