(function(root){
'use strict';
const D=root.CVIData,B=root.CVIFit,P=root.CVICert,finite=Number.isFinite;
const YEAR=365*86400000;
function normalPdf(z){return Math.exp(-.5*z*z)/Math.sqrt(2*Math.PI);}
function point(f,k){
 const m=B.evaluate(f.canonical,k),w=m.w,wp=m.wp,wpp=m.wpp,K=f.F*Math.exp(k);
 if(!(w>0&&finite(w)&&finite(wp)&&finite(wpp)))return {k,K,w,wp,wpp,iv:null,g:null,density:null};
 const s=Math.sqrt(w),g=(1-k*wp/(2*w))**2-wp*wp*(1/w+.25)/4+wpp/2;
 const d2=-k/s-s/2,skew=normalPdf(d2)*wp/(2*s);
 return {k,K,w,wp,wpp,iv:Math.sqrt(w/f.T),probAbove:D.normalCDF(d2)-skew,probBelow:D.normalCDF(-d2)+skew,g,density:normalPdf(-k/s-s/2)*g/(K*s),call:D.black(f.F,K,f.D,w,'CALL'),put:D.black(f.F,K,f.D,w,'PUT')};
}
function score(points,f){
 const rows=points.map(p=>{const m=point(f,p.k),price=p.side==='PUT'?m.put:m.call;if(!finite(price))return {...p,price:null,ivFit:null,inside:false};
 const bid=finite(p.wBid)&&finite(p.bid)?p.bid:null,ask=finite(p.wAsk)&&finite(p.ask)?p.ask:null,mid=finite(p.wMid)&&finite(p.mid)&&bid!==null&&ask!==null?p.mid:null,half=mid==null?null:Math.max(.005,(ask-bid)/2);
 const residual=mid===null?null:price-mid;
 return {...p,price,ivFit:m.iv,inside:(bid===null||price>=bid-1e-7)&&(ask===null||price<=ask+1e-7),residual,z:residual===null?null:residual/half,beyond:Math.max(0,bid==null?0:bid-price,ask==null?0:price-ask)};
 });
 const mids=rows.filter(p=>finite(p.z)),count=mids.length,inside=mids.filter(p=>p.inside).length,rms=key=>count?Math.sqrt(mids.reduce((s,p)=>s+p[key]*p[key],0)/count):null;
 return {rows,stats:{all:rows.length,mids:count,oneSide:rows.length-count,inside,within:count?inside/count:null,allInside:rows.filter(p=>p.inside).length,rmse:rms('residual'),rmsSpread:rms('z'),maxBreach:rows.reduce((a,p)=>Math.max(a,p.beyond||0),0),left:mids.filter(p=>p.k<0).length,right:mids.filter(p=>p.k>0).length}};
}
function quoteFingerprint(points){return P.hash(JSON.stringify(points.map(p=>[p.K,p.side,p.bid,p.ask,p.wBid,p.wAsk,p.wMid,p.ms,p.source,p.row])));}
function build(dataset,group,settings={},round=0){
 const errors=[],inputs=[],maps=settings.clocks||{},byTime=(a,b)=>a.fixMs-b.fixMs;
 for(const expiry of group.expiries){try{inputs.push(D.buildSlice(dataset,group.id,expiry,{...settings,rate:settings.rates?.[expiry]??settings.rate??0,fixing:maps[expiry]||settings.fixing||'16:00'}));}catch(e){errors.push({expiry,reason:e.message});}}
 inputs.sort(byTime);const proven=[],pairs=[];let fits=[],joint=true,jointDiag=null;
 if(inputs.length){try{if(inputs.length===1){fits=[B.fitSlice(inputs[0],settings)];}else{const result=B.fitSurface(inputs,settings);fits=result.slices;jointDiag=result.diagnostics;if(!Array.isArray(fits)||fits.length!==inputs.length)throw Error('Risultato congiunto incompleto.');}}
 catch(e){joint=false;errors.push({expiry:'Solver',reason:e.message});fits=inputs.map(s=>{try{return B.fitSlice(s,settings);}catch(ex){errors.push({expiry:s.expiry,reason:ex.message});return null;}});}}
 for(let i=0;i<inputs.length;i++){const s=inputs[i],fit=fits[i];if(!fit?.canonical){errors.push({expiry:s.expiry,reason:fit?.diagnostics?.status||'Fit senza coefficienti.'});continue;}
 try{const {points,...metadata}=s,quoteHash=quoteFingerprint(points),context={symbol:group.symbol,asof:s.asof,asofMs:s.timeMs,settlementConvention:'European cash · '+group.symbol,expiry:s.expiry,fixMs:s.fixMs,T:s.T,F:s.F,D:s.D,quoteHash},certificate=P.slice(fit.canonical,{context});
 const f={...metadata,symbol:group.symbol,canonical:fit.canonical,solver:fit.diagnostics,solverTrace:fit.solver??null,context,quoteHash,certificate};
 const {rows,stats}=score(points,f);f.points=rows;f.stats=stats;
 const parity=s.audit.parity;f.parityPass=parity.converged&&parity.commonInterval&&parity.inside===parity.count;
 f.premiumPass=stats.mids>=12&&stats.left>=3&&stats.right>=3&&stats.within>=.85&&stats.rmsSpread<=1.25;
 f.marketPass=f.premiumPass&&f.parityPass;
 f.atm=point(f,0);const mids=rows.filter(o=>finite(o.z));f.observed=[Math.min(...mids.map(r=>r.k)),Math.max(...mids.map(r=>r.k))];proven.push(f);
 }catch(e){errors.push({expiry:s.expiry,reason:e.message});}}
 for(let i=1;i<proven.length;i++){const a=proven[i-1],b=proven[i];const compatible=a.timeMs===b.timeMs&&a.symbol===b.symbol&&b.T>a.T;
 const pair=compatible?P.calendar(a.canonical,b.canonical,{nearContext:a.context,farContext:b.context}):{status:'INCONCLUSIVE',reason:'Cutoff, simbolo o orizzonte incompatibile.'};
 pairs.push({near:a.expiry,far:b.expiry,...pair});}
 const refinementLog=[];
 if(joint&&proven.length===inputs.length&&round<2&&proven.length){
  const sliceKs=proven.map((f,i)=>[...(settings.extraSliceK?.[i]||[])]),calendarKs=[...(settings.extraCalendarK||[])];
  const collect=(proof,list,tag)=>{for(const c of proof.components||[]){const k=c.witness?.k;
   if(c.status==='VIOLATION'&&finite(k)&&!list.includes(k)){list.push(k);refinementLog.push({round:round+1,reason:c.kind,k,scope:tag});}}};
  proven.forEach((f,i)=>collect(f.certificate,sliceKs[i],f.expiry));pairs.forEach(p=>collect(p,calendarKs,p.near+' / '+p.far));
  if(refinementLog.length){
   const rerun=build(dataset,group,{...settings,extraSliceK:sliceKs,extraCalendarK:calendarKs},round+1);
   if(rerun.joint&&rerun.curves.length===proven.length){
    rerun.refinements=refinementLog.concat(rerun.refinements||[]);rerun.settings=settings;return rerun;
   }
   errors.push({expiry:'Raffinamento',reason:'Ricalibrazione sui controesempi non riuscita. Rimane il candidato con il suo esito originale.'});
  }
 }
 const geometrySurface=joint&&proven.length===group.expiries.length&&proven.length>=2&&proven.every(x=>x.certificate.status==='CERTIFIED')&&pairs.every(x=>x.status==='CERTIFIED');
 const fitPass=proven.length>0&&proven.every(x=>x.marketPass&&x.solver.status==='CONVERGED'&&x.solver.kkt?.passes===true);
 const surface=geometrySurface&&fitPass;
 return {id:group.id,symbol:group.symbol,date:group.date,asof:proven[0]?.asof||group.asof,sourceRows:group.rows,settings,errors,refinements:refinementLog,curves:proven,pairs,surface,geometrySurface,fitPass,joint,jointDiag,marketPass:surface,missing:group.expiries.filter(e=>!proven.some(x=>x.expiry===e))};
}
function mix(r,t,k){
 if(!r.surface||!finite(t)||!finite(k))throw Error('Superficie coeva certificata richiesta.');const cs=r.curves;
 for(const f of cs)if(Math.abs(t-f.T)<=1e-14)return point(f,k).w;
 const j=cs.findIndex(f=>f.T>t);if(j<1)throw Error('Orizzonte esterno alle maturità certificate.');
 const a=cs[j-1],b=cs[j],u=(t-a.T)/(b.T-a.T),x=Math.exp(k),side=k<0?'PUT':'CALL',pa=D.black(1,x,1,B.evaluate(a.canonical,k).w,side),pb=D.black(1,x,1,B.evaluate(b.canonical,k).w,side);
 return D.implied(1,x,1,(1-u)*pa+u*pb,side);
}
function shortEnd(r,t,k){
 if(!r.surface||!finite(t)||!finite(k)||!(t>0&&t<r.curves[0].T))throw Error('La miscela con intrinseco richiede un tempo fra zero e la prima scadenza.');
 const first=r.curves[0],u=t/first.T,x=Math.exp(k),w=B.evaluate(first.canonical,k).w,side=k<0?'PUT':'CALL';
 const otm=D.black(1,x,1,w,side);
 return {w:D.implied(1,x,1,u*otm,side),atomATM:1-u};
}
function holdout(curve,settings){
 const mid=curve.points.filter(p=>finite(p.wMid)).sort((a,b)=>a.k-b.k),out=new Set(mid.filter((p,i)=>i%5===2).map(x=>x.K));
 if(out.size<4)throw Error('Servono almeno quattro strike di verifica.');const clean=p=>{const {price,ivFit,inside,residual,z,beyond,...raw}=p;return raw;};
 const train=curve.points.filter(p=>!out.has(p.K)).map(clean),test=mid.filter(p=>out.has(p.K)).map(clean),fit=B.fitSlice({...curve,points:train},settings);
 if(!fit.canonical)throw Error('Fit di verifica senza candidato.');const f={...curve,canonical:fit.canonical},cert=P.slice(fit.canonical),q=score(test,f);
 return {training:train.length,testing:test.length,certificate:cert.status,stats:q.stats,holdoutKs:test.map(p=>p.K),comparison:score(test,curve).stats};
}
root.CVILab={YEAR,point,score,build,mix,shortEnd,holdout};
})(globalThis);
