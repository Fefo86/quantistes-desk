/* Independent exact verifier. Its input consists solely of serialized CVI
   parameters and optional contract context. No fitted grid values are used. */
(function installCVICert(root){
'use strict';
const VERSION='cvi-rational-bernstein-1.0', ZERO=[0n,1n], ONE=[1n,1n], TWO=[2n,1n];
const abs=x=>x<0n?-x:x;
function gcd(a,b){a=abs(a);b=abs(b);while(b){const t=a%b;a=b;b=t;}return a;}
function frac(a,b=1n){if(!b)throw Error('Denominatore nullo.');if(!a)return ZERO;if(b<0n){a=-a;b=-b;}const g=gcd(a,b);return [a/g,b/g];}
const I=n=>[BigInt(n),1n];
function add(a,b){if(!a[0])return b;if(!b[0])return a;const g=gcd(a[1],b[1]),x=b[1]/g,y=a[1]/g,n=a[0]*x+b[0]*y;if(!n)return ZERO;const gg=gcd(n,g);return [n/gg,y*(b[1]/gg)];}
const neg=a=>[-a[0],a[1]],sub=(a,b)=>add(a,neg(b));
function mul(a,b){if(!a[0]||!b[0])return ZERO;const x=gcd(a[0],b[1]),y=gcd(b[0],a[1]);return [(a[0]/x)*(b[0]/y),(a[1]/y)*(b[1]/x)];}
function div(a,b){if(!b[0])throw Error('Divisione per zero.');return mul(a,b[0]<0n?[-b[1],-b[0]]:[b[1],b[0]]);}
const cmp=(a,b)=>{const d=a[0]*b[1]-b[0]*a[1];return d<0n?-1:d>0n?1:0;};
const rmin=(a,b)=>cmp(a,b)<=0?a:b,rmax=(a,b)=>cmp(a,b)>=0?a:b;
function dyadic(x){
 if(!Number.isFinite(x))throw Error('Il blob contiene un parametro non finito.');
 if(x===0)return ZERO;
 const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,x,false);
 const hi=d.getUint32(0,false),lo=d.getUint32(4,false),exp=(hi>>>20)&2047;
 let mant=(BigInt(hi&0xfffff)<<32n)|BigInt(lo);if(exp)mant+=1n<<52n;if(hi>>>31)mant=-mant;
 const shift=(exp||1)-1023-52;return shift>=0?[mant<<BigInt(shift),1n]:frac(mant,1n<<BigInt(-shift));
}
function approx(q){
 if(!q[0])return 0;const n=abs(q[0]),d=q[1],sn=Math.max(0,n.toString(2).length-53),sd=Math.max(0,d.toString(2).length-53);
 return (q[0]<0n?-1:1)*Number(n>>BigInt(sn))/Number(d>>BigInt(sd))*2**(sn-sd);
}
const exact=q=>q[1]===1n?String(q[0]):String(q[0])+'/'+String(q[1]);
const descr=q=>({display:Number.isFinite(approx(q))?approx(q):null,exact:exact(q)});
function trim(a){while(a.length>1&&!a.at(-1)[0])a.pop();return a;}
const plus=(a,b)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>add(a[i]||ZERO,b[i]||ZERO)));
const scale=(p,b)=>trim(p.map(v=>mul(v,b)));
function product(a,b){const c=Array(a.length+b.length-1).fill(ZERO);for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)c[i+j]=add(c[i+j],mul(a[i],b[j]));return trim(c);}
function compose(p,a,b){let r=[p.at(-1)];for(let i=p.length-2;i>=0;i--)r=plus(product(r,[a,b]),[p[i]]);return r;}
function choose(n,k){let v=1n;for(let i=1;i<=k;i++)v=v*BigInt(n-i+1)/BigInt(i);return v;}
function bernstein(p){
 const n=p.length-1;return p.map((_,i)=>{let acc=ZERO;for(let j=0;j<=i;j++)acc=add(acc,mul(p[j],frac(choose(i,j),choose(n,j))));return acc;});
}
// Pg = 16 w² g, evaluated as a polynomial in the local independent variable.
function butterfly(k,w,wp,wpp){
 const a=product(w,w),b=product(wp,wp);
 const products=[scale(a,I(16)),scale(product(product(k,w),wp),I(-16)),scale(product(product(k,k),b),I(4)),scale(product(w,b),I(-4)),scale(product(a,b),I(-1)),scale(product(a,wpp),I(8))];
 return products.reduce(plus,[ZERO]);
}
function canonical(c){
 if(!c||!Array.isArray(c.knots)||!Array.isArray(c.curvature)||c.knots.length!==c.curvature.length||c.knots.length<2||c.knots.length>256)throw Error('Dimensione della spline non valida (2–256 nodi).');
 if(c.knots.some((x,i)=>!Number.isFinite(x)||(i&&x<=c.knots[i-1])))throw Error('I nodi devono essere finiti e strettamente crescenti.');
 if(c.curvature[0]!==0||c.curvature.at(-1)!==0)throw Error('Il raccordo naturale richiede curvatura nulla ai due estremi.');
 const k=c.knots.map(dyadic),d=c.curvature.map(dyadic),spans=[];
 let a=dyadic(c.v0),b=dyadic(c.slope0);
 for(let i=0;i<k.length-1;i++){
  const h=sub(k[i+1],k[i]),h2=mul(h,h),delta=sub(d[i+1],d[i]);
  const w=[a,mul(b,h),div(mul(d[i],h2),TWO),div(mul(delta,h2),I(6))];
  const wp=[b,mul(d[i],h),div(mul(delta,h),TWO)],wpp=[d[i],delta];
  spans.push({lo:k[i],hi:k[i+1],h,w:trim(w),wp:trim(wp),wpp:trim(wpp)});
  a=w.reduce(add,ZERO);b=wp.reduce(add,ZERO);
 }
 return {k,spans,left:{edge:k[0],a:dyadic(c.v0),b:dyadic(c.slope0),direction:-1},right:{edge:k.at(-1),a,b,direction:1}};
}
const SHA_CONSTANTS=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256(text){
 const bytes=[];for(const ch of String(text)){let cp=ch.codePointAt(0);if(cp>=0xd800&&cp<=0xdfff)cp=0xfffd;if(cp<128)bytes.push(cp);else if(cp<2048)bytes.push(192|(cp>>6),128|(cp&63));else if(cp<65536)bytes.push(224|(cp>>12),128|((cp>>6)&63),128|(cp&63));else bytes.push(240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63));}
 const bits=BigInt(bytes.length)*8n;bytes.push(128);while((bytes.length%64)!==56)bytes.push(0);
 for(let i=7;i>=0;i--)bytes.push(Number((bits>>BigInt(i*8))&255n));
 const state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),ror=(x,n)=>(x>>>n)|(x<<(32-n));
 for(let off=0;off<bytes.length;off+=64){
  for(let i=0;i<16;i++){const j=off+4*i;w[i]=(bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3];}
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=w[i-16]+(ror(x,7)^ror(x,18)^(x>>>3))+w[i-7]+(ror(y,17)^ror(y,19)^(y>>>10));}
  let [a,b,c,d,e,f,g,h]=state;
  for(let i=0;i<64;i++){const s1=(ror(e,6)^ror(e,11)^ror(e,25)),ch=(e&f)^(~e&g),t1=(h+s1+ch+SHA_CONSTANTS[i]+w[i])>>>0,t2=((ror(a,2)^ror(a,13)^ror(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  [a,b,c,d,e,f,g,h].forEach((n,i)=>state[i]=(state[i]+n)>>>0);
 }
 return state.map(x=>x.toString(16).padStart(8,'0')).join('');
}
function stableJSON(v){
 if(Array.isArray(v))return '['+v.map(stableJSON).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableJSON(v[k])).join(',')+'}';
 if(typeof v==='number'&&!Number.isFinite(v))throw Error('Parametro non finito.');
 const s=JSON.stringify(v);if(s===undefined)throw Error('Dato non serializzabile.');return s;
}
function fingerprint(c,context={}){return sha256(stableJSON({representation:'CVI:w(k):natural-cubic:linear-wings:v1',knots:c.knots,curvature:c.curvature,v0:c.v0,slope0:c.slope0,context}));}
let verifierHash;
function setBudget(o={}){
 const bound=(x,def,lo,hi)=>Number.isInteger(x)?Math.max(lo,Math.min(hi,x)):def;
 return {maxDepth:bound(o.maxDepth,18,0,64),maxNodes:bound(o.maxNodes,20000,1,100000),totalLimit:bound(o.totalLimit,65000,1,250000),used:0};
}
function proof(coeff,strict,budget){
 const den=coeff.reduce((d,r)=>d/gcd(d,r[1])*r[1],1n),b0=coeff.map(r=>r[0]*(den/r[1])),n=coeff.length-1;
 const stack=[{b:b0,den,level:0,idx:0n}];let nodes=0,leaves=0,min=null;
 while(stack.length){
  const {b,den:d,level,idx}=stack.pop();const divisor=1n<<BigInt(level);
  const undecided=reason=>({status:'INCONCLUSIVE',reason,nodes,leaves,parameterInterval:[exact(frac(idx,divisor)),exact(frac(idx+1n,divisor))]});
  if(nodes>=budget.maxNodes||budget.used>=budget.totalLimit)return undecided('Budget dei nodi esaurito');
  ++nodes;++budget.used;
  const smallest=b.reduce((a,v)=>a<v?a:v);
  if(strict?smallest>0n:smallest>=0n){const lower=frac(smallest,d);min=min?rmin(min,lower):lower;++leaves;continue;}
  const bad=x=>strict?x<=0n:x<0n,hit=(t,v)=>({status:'VIOLATION',reason:'Controesempio razionale',nodes,leaves,t,value:v});
  if(bad(b[0]))return hit(frac(idx,divisor),frac(b[0],d));
  if(bad(b[n]))return hit(frac(idx+1n,divisor),frac(b[n],d));
  const left=Array(n+1),right=Array(n+1);let row=b.slice();
  // Integer de Casteljau. All child coefficients use denominator d*2^n.
  for(let r=0;r<=n;r++){left[r]=row[0]<<BigInt(n-r);right[n-r]=row[n-r]<<BigInt(n-r);row=row.slice(1).map((v,j)=>row[j]+v);}
  const childDen=d<<BigInt(n);if(bad(left[n]))return hit(frac(2n*idx+1n,2n*divisor),frac(left[n],childDen));
  if(level>=budget.maxDepth)return undecided('Profondità Bernstein esaurita');
  stack.push({b:right,den:childDen,level:level+1,idx:2n*idx+1n},{b:left,den:childDen,level:level+1,idx:2n*idx});
 }
 return {status:'CERTIFIED',nodes,leaves,min};
}
function mapResult(check,label,domain,map){
 const r={kind:label,domain,status:check.status,nodes:check.nodes||0,leaves:check.leaves||0};
 if(check.reason)r.reason=check.reason;
 if(check.parameterInterval)r.parameterInterval=check.parameterInterval;
 if(check.min)r.lower=descr(check.min);
 if(check.t){const x=map(check.t);r.witness={kind:label,k:x===null?null:approx(x),kExact:x===null?null:exact(x),asymptotic:x===null,value:descr(check.value),parameter:exact(check.t)};}
 return r;
}
function validateContext(ctx={}){
 for(const name of ['F','D','T'])if(ctx[name]!==undefined&&!(Number.isFinite(ctx[name])&&ctx[name]>0))throw Error(name+' deve essere positivo e finito.');
}
function finish(checks,meta,budget){
 const worst=checks.find(c=>c.status==='VIOLATION')||checks.find(c=>c.status==='INCONCLUSIVE');
 if(!verifierHash)verifierHash=sha256(installCVICert.toString());
 return {version:VERSION,verifierSha256:verifierHash,status:worst?.status||'CERTIFIED',reason:worst?.reason||'Prova esatta su tutti gli intervalli e sulle due semirette.',witness:worst?.witness||null,components:checks,budget:{...budget},...meta};
}
function invalid(error,kind,budget){return finish([{kind,status:'VIOLATION',reason:error.message}],{domain:'k ∈ ℝ',fingerprint:null},budget);}
function slice(c,options={}){
 const budget=setBudget(options);
 try{
  const ctx=options.context||{};validateContext(ctx);const sl=canonical(c),checks=[];let gBound=null,varBound=null;
  for(const span of sl.spans){
   const {lo,hi,h,w,wp,wpp}=span,domain=[approx(lo),approx(hi)],map=t=>add(lo,mul(h,t)),wb=bernstein(w);
   const wpProof=proof(wb,true,budget),gpProof=proof(bernstein(butterfly([lo,h],w,wp,wpp)),false,budget);
   checks.push(mapResult(wpProof,'variance',domain,map),mapResult(gpProof,'butterfly',domain,map));
   if(wpProof.min)varBound=varBound?rmin(varBound,wpProof.min):wpProof.min;
   const maxW=wb.reduce(rmax);if(gpProof.min&&maxW[0]>0n){const lower=div(gpProof.min,mul(I(16),mul(maxW,maxW)));gBound=gBound?rmin(gBound,lower):lower;}
  }
  const slopes=[];
  for(const side of [sl.left,sl.right]){
   const {edge,a,b,direction}=side,sgn=I(direction),beta=mul(b,sgn),label=direction<0?'sinistra':'destra';
   slopes.push(approx(beta));
   const admissible=a[0]>0n&&beta[0]>=0n&&cmp(beta,TWO)<0;
   checks.push({kind:'wing_positive_lee',domain:label,status:admissible?'CERTIFIED':'VIOLATION',outwardSlope:descr(beta),edgeVariance:descr(a),reason:admissible?'Raccordo positivo e 0 ≤ β < 2.':'Valore al raccordo o pendenza di Lee fuori dai vincoli.',
    ...(!admissible?{witness:{kind:'wing_positive_lee',k:approx(edge),kExact:exact(edge),outwardSlope:descr(beta),edgeVariance:descr(a)}}:{})});
   if(a[0]>0n)varBound=varBound?rmin(varBound,a):a;
   const pg=butterfly([edge,sgn],[a,beta],[b],[ZERO]),n=pg.length-1;
   // y=t/(1-t): (1-t)^n Pg(edge+direction*y) is in Bernstein form directly.
   const transformed=pg.map((v,i)=>div(v,[choose(n,i),1n])),pr=proof(transformed,false,budget);
   const map=t=>cmp(t,ONE)===0?null:add(edge,mul(sgn,div(t,sub(ONE,t))));
   checks.push(mapResult(pr,'wing_butterfly',label,map));
   if(pr.min&&admissible&&(n===0||n===2)){const maxW=n===0?a:rmax(a,beta),lower=div(pr.min,mul(I(16),mul(maxW,maxW)));gBound=gBound?rmin(gBound,lower):lower;}
  }
  const good=checks.every(x=>x.status==='CERTIFIED');
  return finish(checks,{fingerprint:fingerprint(c,ctx),domain:'−∞ < log(K/F) < +∞',coordinate:'log(K/F)',arithmetic:'Frazioni esatte BigInt del blob IEEE-754; Bernstein e de Casteljau.',carry:'Opzioni europee omogenee, forward positivo, sconto positivo e carry proporzionale deterministico.',minimumVarianceBound:good&&varBound?approx(varBound):null,minimumGBound:good&&gBound?approx(gBound):null,wingSlopes:slopes,context:ctx},budget);
 }catch(e){return invalid(e,'canonical_or_context',budget);}
}
function at(sl,lo,hi){
 const h=sub(hi,lo);if(cmp(hi,sl.k[0])<=0||cmp(lo,sl.k.at(-1))>=0){
  const z=cmp(hi,sl.k[0])<=0?sl.left:sl.right;return trim([add(z.a,mul(z.b,sub(lo,z.edge))),mul(z.b,h)]);
 }
 const s=sl.spans.find(z=>cmp(z.lo,lo)<=0&&cmp(z.hi,hi)>=0);
 if(!s)throw Error('Intervallo fuori partizione.');
 return compose(s.w,div(sub(lo,s.lo),s.h),div(h,s.h));
}
function calendar(first,second,options={}){
 const budget=setBudget(options);
 try{
  const a=canonical(first),b=canonical(second),x1=options.nearContext||{},x2=options.farContext||{};validateContext(x1);validateContext(x2);
  if((x1.T!==undefined||x2.T!==undefined)&&!(x2.T>x1.T))throw Error('Scadenze non ordinate o maturity mancante.');
  for(const key of ['symbol','asof','asofMs','settlementConvention','root'])if((key in x1||key in x2)&&x1[key]!==x2[key])throw Error('Le due slice hanno '+key+' diversi.');
  const union=[...new Map([...a.k,...b.k].map(k=>[exact(k),k])).values()].sort(cmp),checks=[];let calBound=null;
  for(let i=1;i<union.length;i++){
   const lo=union[i-1],hi=union[i],h=sub(hi,lo),diff=plus(at(b,lo,hi),scale(at(a,lo,hi),I(-1))),p=proof(bernstein(diff),false,budget);
   checks.push(mapResult(p,'calendar',[approx(lo),approx(hi)],t=>add(lo,mul(h,t))));
   if(p.min)calBound=calBound?rmin(calBound,p.min):p.min;
  }
  for(const key of ['left','right']){
   const e=key==='left'?union[0]:union.at(-1),p=a[key],q=b[key],sgn=I(p.direction),slope=mul(sub(q.b,p.b),sgn),value=z=>add(z.a,mul(z.b,sub(e,z.edge))),diff=sub(value(q),value(p));
   const ok=slope[0]>=0n&&diff[0]>=0n;
   const witness=diff[0]<0n?e:slope[0]<0n?add(e,mul(sgn,add(ONE,div(diff,neg(slope))))):null;
   checks.push({kind:'wing_calendar',domain:key,status:ok?'CERTIFIED':'VIOLATION',reason:ok?'Ordine sulla semiretta.':'Incrocio calendar su semiretta.',outwardSlopeDifference:descr(slope),edgeDifference:descr(diff),...(witness?{witness:{kind:'wing_calendar',k:approx(witness),kExact:exact(witness),value:descr(sub(valueAt(q,witness),valueAt(p,witness)))}}:{})});
   if(ok)calBound=calBound?rmin(calBound,diff):diff;
  }
  const fingerprints=[fingerprint(first,x1),fingerprint(second,x2)];
  return finish(checks,{fingerprint:sha256(stableJSON({version:VERSION,inputs:fingerprints})),inputs:fingerprints,domain:'−∞ < log(K/F) < +∞',coordinate:'log(K/F) comune',minimumDifferenceBound:checks.every(r=>r.status==='CERTIFIED')&&calBound?approx(calBound):null,scope:'Solo ordine calendar; i certificati individuali delle due slice e il contesto contrattuale sono richiesti separatamente.'},budget);
 }catch(e){return invalid(e,'calendar_input',budget);}
}
function valueAt(w,k){return add(w.a,mul(w.b,sub(k,w.edge)));}
function numericalPair(sl,k){
 const wing=cmp(k,sl.k[0])<=0?sl.left:cmp(k,sl.k.at(-1))>=0?sl.right:null;
 if(wing)return {w:valueAt(wing,k),wp:wing.b};
 const s=sl.spans.find(p=>cmp(k,p.hi)<=0),t=div(sub(k,s.lo),s.h);
 const horner=p=>p.reduceRight((a,b)=>add(mul(a,t),b),ZERO);
 return {w:horner(s.w),wp:horner(s.wp)};
}
function nextFloat(x,up){
 if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;
 const buf=new DataView(new ArrayBuffer(8));buf.setFloat64(0,x);
 let raw=buf.getBigUint64(0);raw+=(x>0)===up?1n:-1n;buf.setBigUint64(0,raw);return buf.getFloat64(0);
}
function outward(q,up){
 let x=approx(q);if(!Number.isFinite(x))return x;
 while((up?1:-1)*cmp(dyadic(x),q)<0)x=nextFloat(x,up);return x;
}
function integerRoot(x){
 if(x<0n)throw Error('Radicando negativo.');if(x<2n)return x;
 let y=1n<<BigInt(Math.ceil(x.toString(2).length/2));
 while(true){const z=(y+x/y)>>1n;if(z>=y)return y;y=z;}
}
const floorRatio=(n,d)=>{const q=n/d;return n<0n&&n%d!==0n?q-1n:q;};
const ceilRatio=(n,d)=>-floorRatio(-n,d);
// Fixed-point interval arithmetic. Every elementary operation rounds down/up.
// Transcendentals use integer-series bounds. Only input k and exported display
// bounds go through binary64; the scalar input is recoded as its exact dyadic.
function intervalFactory(bits){
 const unit=1n<<BigInt(bits),zero=[0n,0n],one=[unit,unit],half=[unit/2n,unit/2n];
 const from=q=>[floorRatio(q[0]*unit,q[1]),ceilRatio(q[0]*unit,q[1])];
 const sum=(a,b)=>[a[0]+b[0],a[1]+b[1]],negative=a=>[-a[1],-a[0]],minus=(a,b)=>sum(a,negative(b));
 const timesInteger=(a,n)=>n>=0n?[a[0]*n,a[1]*n]:[a[1]*n,a[0]*n];
 const divideInteger=(a,n)=>[floorRatio(a[0],n),ceilRatio(a[1],n)];
 function times(a,b){const p=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return [floorRatio(p.reduce((x,y)=>x<y?x:y),unit),ceilRatio(p.reduce((x,y)=>x>y?x:y),unit)];}
 function reciprocal(a){if(a[0]<=0n&&a[1]>=0n)throw Error('Intervallo di divisione contiene zero.');if(a[1]<0n)return negative(reciprocal(negative(a)));return [floorRatio(unit*unit,a[1]),ceilRatio(unit*unit,a[0])];}
 function squareRoot(a){if(a[0]<0n)throw Error('Varianza non positiva alla precisione corrente.');const hi=integerRoot(a[1]*unit);return [integerRoot(a[0]*unit),hi*hi===a[1]*unit?hi:hi+1n];}
 function atanInverse(n){
  let out=zero,power=n;
  for(let j=0;j<1800;j++){const d=BigInt(2*j+1)*power,term=[floorRatio(unit,d),ceilRatio(unit,d)];
   if(term[1]<=1n)return sum(out,j%2?[-term[1],0n]:[0n,term[1]]);
   out=sum(out,j%2?negative(term):term);power*=n*n;
  }throw Error('Budget arctan esaurito.');
 }
 const pi=minus(timesInteger(atanInverse(5n),16n),timesInteger(atanInverse(239n),4n));
 const phi0=reciprocal(squareRoot(timesInteger(pi,2n)));
 function expPositive(x){
  let shifts=0n;while(x>(unit<<shifts)/4n)shifts++;
  const y=[floorRatio(x,1n<<shifts),ceilRatio(x,1n<<shifts)];let acc=one,term=one;
  for(let j=1;j<=400;j++){term=divideInteger(times(term,y),BigInt(j));if(term[1]<=2n){
   // y<=1/4, so the whole positive remainder from this term is at most 2*term.
   acc=[acc[0],acc[1]+2n*term[1]];
   for(let r=0n;r<shifts;r++)acc=times(acc,acc);return acc;
  }acc=sum(acc,term);}
  throw Error('Budget esponenziale esaurito.');
 }
 const expAt=x=>x<0n?reciprocal(expPositive(-x)):expPositive(x);
 const exp=a=>[expAt(a[0])[0],expAt(a[1])[1]];
 function phiAt(x){
  const s=abs(x);if(s>32n*unit){
   // exp(-z) <= 2^(-floor(z)) for z>=0 and phi(0)<1.
   const n=s*s/(2n*unit*unit);return [0n,n>=BigInt(bits)?1n:unit>>n];
  }
  const ww=divideInteger(times([s,s],[s,s]),2n);return times(phi0,exp(negative(ww)));
 }
 function pdf(a){const near=a[0]<=0n&&a[1]>=0n?0n:(abs(a[0])<abs(a[1])?abs(a[0]):abs(a[1])),far=abs(a[0])>abs(a[1])?abs(a[0]):abs(a[1]);return [phiAt(far)[0],phiAt(near)[1]];}
 function cdfPos(x){
  if(x===0n)return half;
  if(x>=12n*unit){const bound=times(phiAt(x),reciprocal([x,x]));return [unit-bound[1],unit];}
  const x2=times([x,x],[x,x]);let acc=zero,term=[x,x];
  for(let j=0;j<1600;j++){
   acc=sum(acc,j%2?negative(term):term);
   const num=BigInt(2*j+1),den=BigInt(2*(j+1)*(2*j+3));
   const next=divideInteger(timesInteger(times(term,x2),num),den);
   // The alternating integral's next term bounds the remainder once the
   // absolute terms start decreasing and keep decreasing thereafter.
   if(next[1]<=3n&&x2[1]<=BigInt(2*(j+1))*unit){
    const tail=j%2?[0n,next[1]]:[-next[1],0n],out=sum(half,times(phi0,sum(acc,tail)));
    return [out[0]>0n?out[0]:0n,out[1]<unit?out[1]:unit];
   }term=next;
  }throw Error('Budget CDF normale esaurito.');
 }
 const cdfAt=x=>x<0n?minus(one,cdfPos(-x)):cdfPos(x);
 const cdf=a=>[cdfAt(a[0])[0],cdfAt(a[1])[1]];
 function output(a){const lo=outward(frac(a[0],unit),false),hi=outward(frac(a[1],unit),true);
  if(!Number.isFinite(lo)||!Number.isFinite(hi))throw Error('Limiti fuori da binary64.');
  return {lo,hi,width:outward(sub(dyadic(hi),dyadic(lo)),true)};
 }
 return {from,half,sum,minus,negative,times,reciprocal,squareRoot,exp,pdf,cdf,output};
}
function probe(c,k,options={}){
 let digest=null;
 try{
  const ctx=options.context||{};validateContext(ctx);digest=fingerprint(c,ctx);
  if(!Number.isFinite(k)||Math.abs(k)>32)throw Error('La sonda numerica accetta |k| ≤ 32.');
  const sl=canonical(c),rk=dyadic(k),pair=numericalPair(sl,rk);if(pair.w[0]<=0n)throw Error('Varianza non positiva al punto richiesto.');
  const pt=options.priceTolerance??1e-10,ut=options.probTolerance??1e-8;
  if(!Number.isFinite(pt)||pt<=0||!Number.isFinite(ut)||ut<=0)throw Error('Budget di errore non validi.');
  let latest,reason;
  for(const bits of [128,256,512,1024]){
   try{
    const z=intervalFactory(bits),x=z.from(rk),w=z.from(pair.w),wp=z.from(pair.wp),inv=z.reciprocal(z.squareRoot(w)),hw=z.times(w,z.half);
    const d1=z.times(z.minus(hw,x),inv),d2=z.times(z.negative(z.sum(x,hw)),inv),n2=z.cdf(d2);
    const normalizedCall=z.output(z.minus(z.cdf(d1),z.times(z.exp(x),n2)));
    const survival=z.output(z.minus(n2,z.times(z.times(wp,z.times(inv,z.half)),z.pdf(d2))));
    latest={status:'NUMERIC_INCONCLUSIVE',bits,k,normalizedCall,survival,fingerprint:digest,priceTolerance:pt,probTolerance:ut,coordinate:'k IEEE-754 esatto',method:'Intervalli BigInt, arrotondamento diretto, serie con limiti dei resti.'};
    if(normalizedCall.width<=pt&&survival.width<=ut)return {...latest,status:'ENCLOSED'};
    reason='Ampiezza degli intervalli oltre il budget.';
   }catch(e){reason=e.message;}
  }
  return {...latest,status:'NUMERIC_INCONCLUSIVE',bits:1024,k,fingerprint:digest,reason};
 }catch(e){return {status:'INVALID_INPUT',reason:e.message,k:Number.isFinite(k)?k:null,fingerprint:digest};}
}

root.CVICert=Object.freeze({version:VERSION,slice,calendar,fingerprint,hash:sha256,probe});
})(globalThis);
