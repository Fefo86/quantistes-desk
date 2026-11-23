/* Conditional market bounds from European option quotes at a common F,D. */
(function(root){
'use strict';
const zero={n:0n,d:1n},one={n:1n,d:1n},view=new DataView(new ArrayBuffer(8));
const tailScale=10n**36n;
// floor(10^36 Φ(−j/2)), j=1,…,8. Each threshold is enclosed using adjacent integers.
const smallTail=[308537538725986896362295389391662260n,158655253931457051414767454367962077n,66807201268858066004494040979886079n,22750131948179207200282637166533437n,6209665325776135166978104574192221n,1349898031630094526651814767594977n,232629079035525036349925886727984n,31671241833119921253770756722151n];
function dyadic(x){
 view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),exp=Number((bits>>52n)&2047n),mantissa=bits&0xfffffffffffffn;
 return exp===0?{n:mantissa,e:-1074}:{n:(1n<<52n)+mantissa,e:exp-1075};
}
function product(a,b){return {n:a.n*b.n,e:a.e+b.e};}
function cmp(a,b){const x=a.n*b.d-b.n*a.d;return x>0n?1:x<0n?-1:0;}
function min(a,b){return a<b?a:b;}
function max(a,b){return a>b?a:b;}
// Exact directed conversion for nonnegative ratios, including subnormals.
function endpoint(q,upper){
 if(q.n===0n)return 0;if(q.n===q.d)return 1;
 let exp=q.n.toString(2).length-q.d.toString(2).length;
 if(exp<0?(q.n<<BigInt(-exp))<q.d:q.n<(q.d<<BigInt(exp)))exp--;
 if(exp>1023)return upper?Infinity:Number.MAX_VALUE;
 const shift=Math.min(1074,52-exp),scaled=shift>=0?q.n<<BigInt(shift):q.n,den=shift>=0?q.d:q.d<<BigInt(-shift),rounded=scaled/den+(upper&&scaled%den!==0n?1n:0n);
 return Number(rounded)*2**(-shift);
}
function result(status,reason,extra={}){
 return {status,reason,quoteCount:0,bilateral:0,oneSided:0,support:null,rows:[],digitals:[],...extra};
}
function makeBook(f){
 const dd=dyadic(f.D),df=product(dd,dyadic(f.F)),raw=[];let e=df.e,bilateral=0;
 for(const p of f.points){
  const bOk=p.wBid!=null,aOk=p.wAsk!=null;
  if(!aOk&&!bOk)continue;
  if(!(p.K>0&&Number.isFinite(p.K))||!['CALL','PUT'].includes(p.side)||bOk&&!(Number.isFinite(p.bid)&&p.bid>=0)||aOk&&!(Number.isFinite(p.ask)&&p.ask>=0))throw Error('Chiave, lato o premio ammesso non valido.');
  const x=product(dd,dyadic(p.K)),bid=bOk?dyadic(p.bid):null,ask=aOk?dyadic(p.ask):null;
  e=Math.min(e,x.e,...[bid,ask].filter(v=>v&&v.n!==0n).map(v=>v.e));if(bOk&&aOk)bilateral++;
  raw.push({K:p.K,x,bid,ask,isPut:p.side==='PUT'});
 }
 if(!raw.length)throw Error('Servono almeno una quota e un lato di mercato ammesso.');
 const units=q=>q.n===0n?0n:q.n<<BigInt(q.e-e),m=units(df),merged=new Map();
 for(const p of raw){
  const x=units(p.x),intr=max(0n,m-x),parity=p.isPut?m-x:0n,old=merged.get(p.K);
  const lo=max(old?old.lo:intr,p.bid?units(p.bid)+parity:intr),hi=min(old?old.hi:m,p.ask?units(p.ask)+parity:m);
  merged.set(p.K,{K:p.K,x,lo,hi});
 }
 const book=[{K:0,x:0n,lo:m,hi:m},...[...merged.values()].sort((a,b)=>a.K-b.K)];
 return {book,meta:{quoteCount:raw.length,bilateral,oneSided:raw.length-bilateral,support:[book[1].K,book.at(-1).K]}};
}
function slopeTurn(a,b,c){return (b.hi-a.hi)*(c.x-b.x)-(c.hi-b.hi)*(b.x-a.x);}
function hullOf(book){
 const verts=[];for(const p of book){
  while(verts.length>=2&&slopeTurn(verts.at(-2),verts.at(-1),p)>=0n)verts.pop();
  verts.push(p);
 }
 return verts;
}
function check(book){
 // A decreasing convex call is bounded by previous call offers, by future
 // bids and by slope ≥−1 in the discounted-strike coordinate.
 for(let i=1;i<book.length;i++){book[i].hi=min(book[i].hi,book[i-1].hi);book[i].lo=max(book[i].lo,book[i-1].lo-(book[i].x-book[i-1].x));}
 for(let i=book.length-2;i>=0;i--)book[i].lo=max(book[i].lo,book[i+1].lo);
 const crossed=book.find(p=>p.lo>p.hi);
 if(crossed)return {error:'Incompatibilità tra bid/ask, parità, intrinseco o monotonia.',strike:crossed.K};
 const hull=hullOf(book);
 // The greatest convex minorant of the offers is the maximal feasible call grid.
 for(let i=0,j=1;i<book.length;i++){
  const p=book[i];while(hull[j].x<p.x)j++;
  const l=hull[j-1],r=hull[j];
  if(p.lo*(r.x-l.x)>l.hi*(r.x-p.x)+r.hi*(p.x-l.x))return {error:'Un bid supera il massimo compatibile con la convessità delle call.',strike:p.K,witness:[l.K,p.K,r.K]};
 }
 // A strictly falling final segment may be extended linearly to zero.
 // A positive final plateau can be tilted down arbitrarily little only
 // if every downstream lower bound leaves slack. A forced positive flat
 // spread is impossible for a terminal law of finite mean.
 const last=hull.at(-1),prev=hull.at(-2);
 if(last.hi>0n&&prev.hi===last.hi){
  const tight=book.find(p=>p.x>prev.x&&p.lo===last.hi);
  if(tight)return {error:'Uno spread verticale impone due prezzi call uguali e positivi a strike distinti. La coda non può decadere a zero.',strike:tight.K,witness:[prev.K,tight.K]};
 }
 return {hull};
}
function bestSecant(hull,first,last,quote,isRight){
 const base=isRight?zero:one;if(first>last)return base;
 const ratio=i=>isRight?{n:quote.lo-hull[i].hi,d:hull[i].x-quote.x}:{n:hull[i].hi-quote.lo,d:quote.x-hull[i].x};
 // The convex hull slopes are ordered. Secants from an interior/lower point
 // to either side therefore have a single extremum.
 while(first<last){
  const mid=(first+last)>>1,c=cmp(ratio(mid),ratio(mid+1));
  if(isRight?c<0:c>0)first=mid+1;else last=mid;
 }
 const hit=ratio(first),c=cmp(hit,base);
 return (isRight?c>0:c<0)?hit:base;
}
// A single quoted payoff gives information even when a percentile falls beyond
// the final liquid strike. For p=Φ(z), q_p ≥ K−P/(Dp) and q_p ≤ K+C/[D(1−p)].
// Clipping at the greatest convex minorant of offers (an upper bound) on admissible call prices preserves these
// inequalities. Both objectives are affine along a hull face, so inspect vertices.
function toStrike(q,F,m,up){
 const ff=dyadic(F),n=q.n*ff.n,d=q.d*m;
 return endpoint(ff.e>=0?{n:n<<BigInt(ff.e),d}:{n,d:d<<BigInt(-ff.e)},up);
}
function payoffLimits(hull,m,F,pMin,sMin){
 let bottom=zero,top={n:m*tailScale,d:sMin},floorK=null,capK=0;
 for(const h of hull){
  const put=h.hi+h.x-m,low={n:h.x*pMin-put*tailScale,d:pMin},high={n:h.x*sMin+h.hi*tailScale,d:sMin};
  if(cmp(low,bottom)>0){bottom=low;floorK=h.K;}
  if(cmp(high,top)<0){top=high;capK=h.K;}
 }
 return {low:toStrike(bottom,F,m,false),high:toStrike(top,F,m,true),floorK,capK};
}
// Two explicit terminal laws can agree on every option price through the last
// strike and still have different upper quantiles. Keep the same convex call
// curve to K_last. Beyond it use a straight line of slope −p, followed by zero.
// A mass p then sits at K_last + C_last/(D p); remaining mass from the previous
// slope is placed at K_last. Price, mean and all earlier quotes are identical.
function tailWitness(hull,f,m,sLow,sHigh){
 const l=hull.at(-2),r=hull.at(-1);if(r.hi===0n||l.hi<=r.hi)return null;
 const cap={n:l.hi-r.hi,d:r.x-l.x},small={n:sLow,d:2n*tailScale},large={n:101n*sHigh,d:100n*tailScale};
 if(cmp(cap,large)<0)return null;
 const point={n:r.x*large.n+r.hi*large.d,d:large.n};
 const low=toStrike(point,f.F,m,false),hi=toStrike(point,f.F,m,true);
 if(!Number.isFinite(hi))return null;
 return {quantileA:r.K,quantileBLo:low,quantileBHi:hi,lastStrike:r.K,
  tailMassALo:endpoint(small,false),tailMassAHi:endpoint(small,true),tailMassBLo:endpoint(large,false),tailMassBHi:endpoint(large,true)};
}
function compute(f){
 if(!f||!Number.isFinite(f.D)||f.D<=0||!Number.isFinite(f.F)||f.F<=0||!Array.isArray(f.points))return result('INVALID_INPUT','Forward, sconto e quote non validi.');
 let prepared;try{prepared=makeBook(f);}catch(err){return result('INVALID_INPUT',err.message);}
 const {book,meta}=prepared,par=f.audit?.parity;
 if(par?.commonInterval===false||typeof par?.inside==='number'&&par.inside<par.count)return result('INFEASIBLE','Forward incompatibile con almeno una coppia call/put di parità ammessa.',meta);
 if(par?.converged===false||f.parityPass===false)return result('INCONCLUSIVE','Forward non convalidato per la scadenza selezionata.',meta);
 const valid=check(book);
 if(valid.error)return result('INFEASIBLE',valid.error,{...meta,witness:valid.witness||[valid.strike]});
 const hull=valid.hull,ds=[];
 for(let i=0,j=0;i<book.length;i++){
  const q=book[i];while(j<hull.length&&hull[j].x<q.x)j++;
  const right=j+(j<hull.length&&hull[j].x===q.x?1:0);
  ds.push({K:q.K,lo:bestSecant(hull,right,hull.length-1,q,true),hi:bestSecant(hull,0,j-1,q,false)});
 }
 for(let i=ds.length-2;i>=0;i--)if(cmp(ds[i+1].lo,ds[i].lo)>0)ds[i].lo=ds[i+1].lo;
 for(let i=1;i<ds.length;i++)if(cmp(ds[i-1].hi,ds[i].hi)<0)ds[i].hi=ds[i-1].hi;
 const rows=[];
 for(let j=-8;j<=8;j++)if(j!==0){
  const n=smallTail[Math.abs(j)-1],survLo=j<0?tailScale-n-1n:n,survHi=survLo+1n;
  let lo=null,hi=null;
  for(const q of ds.slice(1)){
   if(q.lo.n*tailScale>survHi*q.lo.d)lo=q.K;
   if(hi===null&&q.hi.n*tailScale<survLo*q.hi.d)hi=q.K;
  }
  const tail=endpoint({n,d:tailScale},false),survMin=endpoint({n:survLo,d:tailScale},false);
  // Coarse Markov ceiling for display only, distinct from quote-supported bounds.
  const markov=f.F/survMin,markovUpper=Number.isFinite(markov*(1+2*Number.EPSILON))?markov*(1+2*Number.EPSILON):null;
  const payoff=payoffLimits(hull,book[0].hi,f.F,tailScale-survHi,survLo);
  rows.push({z:j/2,tail,p:j<0?tail:1-tail,lo,hi,
   sameMarksWitness:j>0?tailWitness(hull,f,book[0].hi,survLo,survHi):null,
   payoffLo:Math.max(lo??0,payoff.low),payoffHi:Number.isFinite(Math.min(hi??Infinity,payoff.high))?Math.min(hi??Infinity,payoff.high):null,
   putBoundStrike:payoff.floorK,callBoundStrike:payoff.capK,status:lo!=null?(hi!=null?'TWO_SIDED':'LOWER_ONLY'):(hi!=null?'UPPER_ONLY':'NO_QUOTE_BOUND'),markovUpper});
 }
 return result('FEASIBLE','Quote ammesse compatibili con almeno una legge terminale non negativa di media pari al forward.',{...meta,rows,digitals:ds.slice(1).map(q=>({K:q.K,lo:endpoint(q.lo,false),hi:endpoint(q.hi,true)})),hullVertices:hull.length,assumptions:'Forward e sconto fissati; opzioni europee sulla stessa distribuzione. I limiti di spread sono esterni e ammettono atomi. Null indica un lato non delimitato dagli strike quotati.'});
}
root.CVIBounds=Object.freeze({compute});
})(globalThis);
