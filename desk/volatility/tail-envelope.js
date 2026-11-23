
/* Non-parametric restrictions derived directly from European quote boxes at a common forward. */
(function(root){
'use strict';
const Q=root.QuantCore,finite=Number.isFinite,tol=2e-11;
function quoteSet(r,data,mode){
 if(!r?.ws?.model||r.cfg.quoteSource!=='mid'||r.cfg.overrideHours>0||!r.cfg.symbol||!(r.cfg.maxAge>0))throw Error('Servono bid/ask osservati, root, fixing e un limite positivo di età.');
 const {F,D}=r.ws.model,now=Q.nyEpoch(r.cfg.asof);
 if(!(F>0&&D>0&&finite(now)))throw Error('Forward, fattore di sconto o as-of non validi.');
 const goodTime=s=>{const t=Q.nyEpoch(s);return !!s&&finite(t)&&now>=t&&now-t<=1000*r.cfg.maxAge;};
 let quotes;
 if(mode==='fit'){
  if(!r.ws.cvi?.markReleased)throw Error('Mark CVI non disponibile.');
  quotes=r.ws.cvi.points.map(o=>({k:o.K,right:o.side,bid:o.bid,ask:o.ask}));
 }
 else if(mode==='extended'){
 const rows=Q.selectSnapshot(data.filter(o=>o.expiry===r.cfg.expiry&&o.symbol===r.cfg.symbol&&o.time),r.cfg).rows;
 quotes=rows.filter(o=>goodTime(o.time)&&o.right===(o.strike<F?'PUT':'CALL')&&!(o.quoteConflict||o.conflict||o.conflictingQuote)).map(o=>({k:o.strike,right:o.right,bid:o.bid,ask:o.ask,time:o.time}));}
 else throw Error('Insieme di quote sconosciuto.');
 quotes=quotes.filter(o=>finite(o.k)&&o.k>0&&['PUT','CALL'].includes(o.right)&&(mode==='fit'?(finite(o.bid)||finite(o.ask)):finite(o.bid)&&finite(o.ask)&&o.bid>=0&&o.ask>=o.bid&&o.ask>0));
 if(quotes.length<2)throw Error('Almeno due quote OTM valide con timestamp.');
 return {quotes,F,D};
}
// Prices and strikes below are normalized by DF and F respectively.
function boxes(quotes,F,D){
 if(!(F>0&&D>0&&finite(F)&&finite(D)))throw Error('Forward e discount factor devono essere positivi.');
 const rows=new Map([[0,{x:0,lo:1,hi:1}]]),scale=F*D;
 for(const o of quotes){
 if(!finite(o.k)||o.k<=0||(!finite(o.bid)&&!finite(o.ask))||o.bid!=null&&(!finite(o.bid)||o.bid<0)||o.ask!=null&&(!finite(o.ask)||o.ask<0)||finite(o.bid)&&finite(o.ask)&&o.bid>o.ask||!['CALL','PUT'].includes(o.right))throw Error('Prezzo o contratto non valido.');
 const x=o.k/F,base=o.right==='PUT'?1-x:0,node=rows.get(x)||{x,lo:Math.max(0,1-x),hi:1};
 if(finite(o.bid))node.lo=Math.max(node.lo,base+o.bid/scale);if(finite(o.ask))node.hi=Math.min(node.hi,base+o.ask/scale);rows.set(x,node);}
 const ns=[...rows.values()].sort((a,b)=>a.x-b.x);
 for(let i=1;i<ns.length;i++)ns[i].hi=Math.min(ns[i].hi,ns[i-1].hi);
 for(let i=ns.length-2;i>=0;i--)ns[i].hi=Math.min(ns[i].hi,ns[i+1].hi+ns[i+1].x-ns[i].x);
 return ns;
}
function convexMinorant(points){
 const h=[];for(const n of points){while(h.length>=2){const a=h[h.length-2],b=h.at(-1);
 if((b.hi-a.hi)*(n.x-b.x)<(n.hi-b.hi)*(b.x-a.x))break;h.pop();}h.push(n);}return h;
}
function evaluate(h,nodes){
 let j=1,worst=0,where=0;
 for(const n of nodes){while(j<h.length-1&&h[j].x<n.x)j++;const a=h[j-1],b=h[j],v=a.hi+(b.hi-a.hi)*(n.x-a.x)/(b.x-a.x),gap=n.lo-v;
 if(gap>worst){worst=gap;where=n.x;}}
 return {worst,where};
}
function witness(ns){
 if(ns.length<2)return {ok:false,reason:'Almeno due strike distinti.'};
 const rule=evaluate(convexMinorant(ns),ns);
 if(rule.worst>tol)return {ok:false,reason:'Le scatole bid/ask violano la convessità o i vincoli di prezzo al forward impostato.',breach:rule};
 const xmax=ns.at(-1).x;
 for(const width of [1,10,100,10000,1000000]){
 const nodes=[...ns,{x:xmax+width,lo:0,hi:0}],h=convexMinorant(nodes),check=evaluate(h,nodes);if(check.worst>tol)continue;
 const slopes=h.slice(1).map((n,i)=>(n.hi-h[i].hi)/(n.x-h[i].x));
 const atoms=h.map((n,i)=>({x:n.x,p:(i<slopes.length?slopes[i]:0)-(i?slopes[i-1]:-1)}));
 const total=atoms.reduce((a,z)=>a+z.p,0),mean=atoms.reduce((a,z)=>a+z.p*z.x,0);
 const call=k=>atoms.reduce((s,z)=>s+z.p*Math.max(z.x-k,0),0);
 const error=ns.reduce((v,z)=>Math.max(v,z.lo-call(z.x),call(z.x)-z.hi),0);
 if(atoms.some(z=>z.p< -tol)||Math.abs(total-1)>1e-9||Math.abs(mean-1)>1e-9||error>3*tol)continue;
 return {ok:true,atoms,h,terminal:xmax+width,error,mass:total,mean,largest:xmax,tailCall:call(xmax)};
 }
 return {ok:false,reason:'Nessuna distribuzione-test riprezza le quote entro la tolleranza sui supporti provati.'};
}
// Point t can be a p-quantile only if C(k)+(1-p)k is minimized there. A
// quote upper bounds that minimum at every traded strike. Convexity propagates
// the extra cap at t to other strikes, where observed bids impose floors.
function quoteQuantile(ns,w,p){
 if(!(p>0&&p<1&&w.ok))throw Error('Quantile o distribuzione-test non validi.');
 const tail=1-p,cap=Math.min(...ns.map(n=>n.hi+tail*n.x));
 function can(t){
  const bound=cap-tail*t,floor=Math.max(0,1-t);if(bound<floor-tol)return false;
  const added={x:t,lo:floor,hi:bound};let i=0;while(i<ns.length&&ns[i].x<t)i++;
  const nodes=ns.slice();if(i<nodes.length&&nodes[i].x===t)nodes[i]={...nodes[i],hi:Math.min(nodes[i].hi,bound)};else nodes.splice(i,0,added);
  return evaluate(convexMinorant(nodes),nodes).worst<=tol;
 }
 let cum=0,seed=w.atoms.at(-1).x;for(const z of w.atoms){cum+=z.p;if(cum>=p){seed=z.x;break;}}
 if(!can(seed))return {ok:false,reason:'Precisione insufficiente per certificare il quantile-test.'};
 // Use the rejected (outer) side of each bisection; tolerate boundary atoms.
 let lo=0,inside=seed;if(!can(0))for(let j=0;j<55;j++){const m=(lo+inside)/2;if(can(m))inside=m;else lo=m;}
 const markov=(cap+tol)/tail;let hi=Math.max(seed,markov),inHi=seed;
 if(!can(hi))for(let j=0;j<55;j++){const m=(hi+inHi)/2;if(can(m))inHi=m;else hi=m;}
 return {ok:true,p,lo:Math.max(0,lo-2*tol),hi:hi+2*tol,seed};
}
function integrateMaxLine(a,b,flat,slopeAtA,slope){
 const delta=b-a,va=slopeAtA-flat,vb=va+slope*delta;
 if(va<=0&&vb<=0)return flat*delta;if(va>=0&&vb>=0)return (flat+(va+vb)/2)*delta;
 const pos=Math.max(va,vb),area=pos*pos/(2*Math.abs(slope));return flat*delta+area;
}
function varianceFloor(ns){
 // E[(S-F)^2]/F² = twice the integral of discounted-to-expiry OTM
 // premiums in normalized strike. Lipschitz monotone bid envelopes lower-bound them.
 const xs=[...new Set([0,1,...ns.map(z=>z.x)])].sort((a,b)=>a-b);
 let integral=0;for(let i=1;i<xs.length;i++){const a=xs[i-1],b=xs[i],mid=(a+b)/2,put=b<=1,side=put?1:-1;
  let flat=0,sloped=-Infinity;for(const n of ns){const bid=put?n.lo+n.x-1:n.lo;
   if(put?n.x<=mid:n.x>=mid)flat=Math.max(flat,bid);else sloped=Math.max(sloped,bid+side*(a-n.x));}
  integral+=integrateMaxLine(a,b,flat,sloped,side);}
 // Beyond the largest strike a positive call bid forces a triangular lower tail.
 const end=xs.at(-1),last=Math.max(0,...ns.map(n=>n.lo-Math.max(0,end-n.x)));
 integral+=last*last/2;return Math.max(0,2*integral);
}
function varianceEvidence(ns,w,F){
 const floor=F*Math.sqrt(varianceFloor(ns)),wVar=w.atoms.reduce((s,z)=>s+z.p*(z.x-1)**2,0),end=w.terminal,K=w.largest,last=w.atoms.at(-1);
 const demonstrable=last.x>K&&last.p>1e-13&&w.tailCall>3*tol;
 // Split the last mass between K and B preserving its mean. All original
 // option payoffs are affine above K, while the second moment increases without bound.
 const B=K+10*(end-K),increment=last.p*(end-K)*(B-end);
 return {sdFloor:floor,witnessSD:F*Math.sqrt(Math.max(0,wVar)),rightTailFree:demonstrable,stretchSD:demonstrable?F*Math.sqrt(Math.max(0,wVar+increment)):null,
  lastStrike:K*F,initialTailAtom:end*F,stretchedAtom:demonstrable?B*F:null,positiveTailCall:w.tailCall*F};
}
function analyze(quotes,F,D,requested){
 const nodes=boxes(quotes,F,D),w=witness(nodes);if(!w.ok)return {ok:false,quoteCount:quotes.length,reason:w.reason,worstGap:w.breach?w.breach.worst*F*D:null,strike:w.breach?w.breach.where*F:null};
 return {ok:true,quoteCount:quotes.length,strikes:nodes.length-1,loStrike:nodes[1].x*F,hiStrike:nodes.at(-1).x*F,F,D,
 maxQuoteError:w.error*D*F,atomCount:w.atoms.filter(z=>z.p>1e-13).length,variance:varianceEvidence(nodes,w,F),
 levels:requested.map(({p,z})=>{const v=quoteQuantile(nodes,w,p);return {...v,z,lo:v.ok?v.lo*F:null,hi:v.ok?v.hi*F:null,witnessQuantile:v.ok?v.seed*F:null};})};
}
root.QuoteTailEnvelope={quoteSet,boxes,witness,analyze,quoteQuantile,varianceFloor};
})(globalThis);
