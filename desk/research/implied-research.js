
(function(root) {
  'use strict';
  const Q=root.QuantCore;
  const finite=Number.isFinite;
  const GX=[.1834346424956498,.5255324099163290,.7966664774136267,.9602898564975363];
  const GW=[.3626837833783620,.3137066458778873,.2223810344533745,.1012285362903763];

  function integrate(fn,lo,hi,breaks){
    if(!(lo>0&&hi>=lo))throw Error('Dominio di integrazione non positivo.');
    const mesh=[lo,...breaks.filter(v=>v>lo&&v<hi),hi].sort((a,b)=>a-b);
    let total=0;
    for(let j=1;j<mesh.length;j++){
      const a=Math.log(mesh[j-1]),b=Math.log(mesh[j]),half=(b-a)/2,mid=(a+b)/2;
      for(let i=0;i<GX.length;i++){
        const left=Math.exp(mid-half*GX[i]),right=Math.exp(mid+half*GX[i]);
        total+=half*GW[i]*(left*fn(left)+right*fn(right));
      }
    }
    return total;
  }
  function nativeModel(result){
    if(!result?.ws?.model||!(result.T>0))throw Error('Serve una curva prezzi valida con tempo positivo.');
    return result.ws.model;
  }
  function vol(model,T,K){
    if(model.cvi){const w=root.CVIFit.evaluate(model.cvi.canonical,Math.log(K/model.F)).w;return Math.sqrt(w/T);}
    const side=K<model.F?'PUT':'CALL';
    return Q.impliedTotal(model.F,K,model.price(K,side),model.D,side)/Math.sqrt(T);
  }
  function smiles(result){
    const model=nativeModel(result),F=model.F,T=result.T,atm=result.ws.atmCheck;
    const nodes=model.knots.map(x=>F+model.scale*x);
    const rootGrid=[];
    for(let i=1;i<nodes.length;i++){
      for(let j=0;j<8;j++)rootGrid.push(nodes[i-1]+(nodes[i]-nodes[i-1])*j/8);
    }
    rootGrid.push(nodes.at(-1));
    function forwardCallDelta(K){
      const width=vol(model,T,K)*Math.sqrt(T);
      return width>0?Q.Phi(Math.log(F/K)/width+width/2):NaN;
    }
    const ds=rootGrid.map(forwardCallDelta);
    function rootFor(u){
      const found=[];
      for(let i=0;i<rootGrid.length;i++){
        if(!finite(ds[i]))continue;
        if(ds[i]===u)found.push(rootGrid[i]);
        else if(i>0&&finite(ds[i-1])&&(ds[i]-u)*(ds[i-1]-u)<0){
          found.push(Q.bisect(k=>forwardCallDelta(k)-u,rootGrid[i-1],rootGrid[i],1e-9,75));
        }
      }
      if(found.length!==1)return {roots:found.length,strike:null,iv:null};
      const strike=found[0];return {roots:1,strike,iv:vol(model,T,strike)};
    }
    const rows=[.1,.16,.25].map(delta=>{
      const put=rootFor(1-delta),call=rootFor(delta);
      const available=finite(put.iv)&&finite(call.iv);
      return {delta,put,call,rr:available?call.iv-put.iv:null,bf:available?(call.iv+put.iv)/2-atm.iv:null,
        covered:available&&put.strike>=result.ws.nativeLiquid[0]&&call.strike<=result.ws.nativeLiquid[1]};
    });
    return {atm:atm.iv,atmTotal:atm.totalVariance,atmStraddle:atm.straddle,ivSlope:atm.dIVdLogK,
      varianceSlope:2*T*atm.iv*atm.dIVdLogK,
      varianceCurve:2*T*(atm.dIVdLogK**2+atm.iv*atm.d2IVdLogK2),rows};
  }
  function logMoments(m,amount,expect){
    const F=m.F,x=s=>Math.log(s/F),mean=expect(x),s2=expect(s=>(x(s)-mean)**2);
    const left=expect(s=>Math.min(0,x(s))**2),right=expect(s=>Math.max(0,x(s))**2);
    return {logMean:mean,logVariance:s2,logSD:Math.sqrt(s2),logSkew:s2>0?expect(s=>(x(s)-mean)**3)/s2**1.5:null,
      logExcess:s2>0?expect(s=>(x(s)-mean)**4)/s2**2-3:null,logSecond:left+right,downside:left,upside:right,
      linearExpected:expect(s=>s/F-1),forwardPut:expect(s=>Math.max(F-s,0)),forwardCall:expect(s=>Math.max(s-F,0)),
      logContract:-2*mean,coverage:amount};
  }
  function rawStrip(model){
    const out={bid:0,mid:0,ask:0,fit:0,segments:0,putRange:null,callRange:null};
    const quoted=model.fitted.filter(row=>!row.synthetic&&finite(row.bid)&&finite(row.ask));
    for(const side of ['PUT','CALL']){
      const rows=quoted.filter(q=>q.side===side).sort((a,b)=>a.K-b.K);
      if(rows.length<2)continue;
      out[side==='PUT'?'putRange':'callRange']=[rows[0].K,rows.at(-1).K];
      for(let i=1;i<rows.length;i++){
        const a=rows[i-1],b=rows[i],weight=(b.K-a.K)/model.D;
        for(const name of ['bid','mid','ask','fit'])out[name]+=weight*(a[name]/a.K**2+b[name]/b.K**2);
        out.segments++;
      }
    }
    return out.segments?out:null;
  }
  function strip(result,L,U){
    const model=nativeModel(result),F=model.F,lo=F+model.scale*model.knots[0],hi=F+model.scale*model.knots.at(-1);
    if(!(lo>0&&hi>lo))throw Error('Il log-contract richiede supporto strettamente positivo.');
    if(!(finite(L)&&finite(U)&&U>L&&L>0))throw Error('Il corridoio richiede 0 < L < U.');
    const nodes=model.knots.map(z=>F+model.scale*z);
    const breaks=[...nodes,F];
    function piece(a,b,side){
      const l=Math.max(lo,a),u=Math.min(hi,b);
      if(u<=l)return 0;
      return integrate(k=>2*model.price(k,side)/(model.D*k*k),l,u,breaks);
    }
    const integral=(a,b)=>piece(a,Math.min(b,F),'PUT')+piece(Math.max(a,F),b,'CALL');
    const down=piece(lo,F,'PUT'),up=piece(F,hi,'CALL'),total=down+up;
    const quoted=result.ws.nativeLiquid;
    const distInt=(fn,a,b)=>b>a?integrate(x=>fn(x)*model.pdf(x),a,b,breaks):0;
    const wingShares={};
    const payoffs={mass:s=>1,logContract:s=>-2*Math.log(s/F),putATM:s=>Math.max(F-s,0),callATM:s=>Math.max(s-F,0)};
    for(const [name,fn] of Object.entries(payoffs)){
      const low=Math.max(lo,Math.min(hi,quoted[0])),high=Math.max(lo,Math.min(hi,quoted[1])),abs=s=>Math.abs(fn(s));
      const left=distInt(abs,lo,low),right=distInt(abs,high,hi),allAbs=distInt(abs,lo,hi);
      wingShares[name]={share:allAbs>0?(left+right)/allAbs:null,leftAbs:left,rightAbs:right,totalAbs:allAbs,
        leftSigned:distInt(fn,lo,low),rightSigned:distInt(fn,high,hi)};
    }
    const reference=logMoments(model,'native',fn=>integrate(x=>fn(x)*model.pdf(x),lo,hi,breaks));
    return {support:[lo,hi],T:result.T,F,D:model.D,down,up,total,annualRate:total/result.T,volEq:Math.sqrt(total/result.T),
      corridor:[L,U],corridorValue:integral(L,U),liquid:quoted.slice(),beyondLiquid:integral(lo,quoted[0])+integral(quoted[1],hi),
      wingShares,reference,replicationDifference:total-reference.logContract,market:rawStrip(model)};
  }
  function payoffComparison(result,p){
    if(!p||p.coordinate!=='native')return null;
    const m=nativeModel(result),F=m.F,full=p.support;
    function expect(fn){return p.integrate(fn,full[0],Math.min(F,full[1]))+p.integrate(fn,Math.max(F,full[0]),full[1]);}
    return {status:p.status,provenance:p.provenance,...logMoments(m,'native',expect)};
  }
  function frozen(F,K,D,T,sigma,side){
    if(!(F>0&&K>0&&D>0&&T>0&&sigma>0)||!['CALL','PUT'].includes(side))return null;
    const sqrt=Math.sqrt(T),v=sigma*sqrt,logFK=Math.log(F/K),d1=logFK/v+v/2,d2=d1-v,phi=Q.phi(d1);
    const call=side==='CALL',sign=call?1:-1;
    const value=Q.black(F,K,v,D,side),delta=D*sign*Q.Phi(sign*d1),gamma=D*phi/(F*v),vega=D*F*phi*sqrt;
    const vanna=-D*phi*d2/sigma,vomma=vega*d1*d2/sigma;
    const speed=-gamma*(1+d1/v)/F;
    const ultima=vega/(sigma*sigma)*((d1*d2)**2-d1*d1-d2*d2-d1*d2);
    const zomma=gamma*(d1*d2-1)/sigma;
    const snap=gamma*((1+d1/v)*(2+d1/v)-1/(v*v))/(F*F);
    const forwardVol2=D*phi*(d1+d2-d1*d2*d2)/(sigma*sigma);
    const forwardVolPassage=D*phi*d1*(d2*d2-1)/(2*T*sigma*365);
    const forwardPassage2=D*phi*(d1+2*d2-d1*d2*d2)/(4*(T*365)**2);
    const dtD1=-d2/(2*T),vetaT=vega*(1+d1*d2)/(2*T);
    return {F,K,D,T,sigma,side,value,d1,d2,deltaF:delta,gammaF:gamma,vegaUnit:vega,vegaVolPoint:vega*.01,
      vannaFVol:vanna,vommaVol2:vomma,snapF:snap,forwardVol2,forwardVolPassage,forwardPassage2,discountRhoBP:-T*value*1e-4,discountVeraBP:-T*vega*.01*1e-4,speedF:speed,zommaF2Vol:zomma,ultimaVol3:ultima,
      timePassagePerDay:-D*F*phi*sigma/(2*sqrt*365),charmPassagePerDay:-D*phi*dtD1/365,
      colorPassagePerDay:-gamma*(d1*d2-1)/(2*T*365),vetaPassagePerDay:-vetaT/365,
      elasticity:value>1e-10?F*delta/value:null,
      dualDeltaBlack:-D*sign*Q.Phi(sign*d2),dualGammaBlack:D*Q.phi(d2)/(K*v)};
  }
  function contract(result,K,side,dF,dIV){
    const m=nativeModel(result),iv=vol(m,result.T,K);
    const base=frozen(m.F,K,m.D,result.T,iv,side);
    if(!base)return null;
    const price=m.price(K,side),shockIV=iv+dIV*.01;
    const good=finite(dF)&&finite(dIV)&&m.F+dF>0&&shockIV>0;
    const shocked=good?Q.black(m.F+dF,K,shockIV*Math.sqrt(result.T),m.D,side):null;
    const approx=good?base.deltaF*dF+base.vegaVolPoint*dIV+.5*base.gammaF*dF*dF+base.vannaFVol*dF*dIV*.01+.5*base.vommaVol2*(dIV*.01)**2:null;
    const dualDeltaFit=m.D*(m.cdf(K)-(side==='CALL'?1:0)),dualGammaFit=m.D*m.pdf(K);
    const stickyMoneynessDelta=(price-K*dualDeltaFit)/m.F,stickyMoneynessGamma=(K/m.F)**2*dualGammaFit;
    let smilePrice=null;
    if(finite(dF)&&finite(dIV)&&m.F+dF>0){
      const ratio=(m.F+dF)/m.F,shiftedK=K/ratio;
      if(dIV===0)smilePrice=ratio*m.price(shiftedK,side);
      else{
        const shiftedIV=vol(m,result.T,shiftedK)+dIV*.01;
        if(shiftedIV>0)smilePrice=Q.black(m.F+dF,K,shiftedIV*Math.sqrt(result.T),m.D,side);
      }
    }
    return {...base,fitPrice:price,dualDeltaFit,dualGammaFit,stickyMoneynessDelta,stickyMoneynessGamma,
      shock:{dF,dIV,price:shocked,pnl:good?shocked-price:null,quadratic:approx,residual:good?shocked-price-approx:null,
        smilePrice,smilePnL:finite(smilePrice)?smilePrice-price:null}};
  }
  // Preserve source values and choose a contract with the same time filter and
  // duplicate policy as the original parser, for both long and wide CSVs.
  function records(files,cfg,ivUnit){
    let all=[];
    for(const file of files){
      const table=Q.table(file.text),parsed=Q.parseCSV(file.text,{ivUnit});
      for(const row of parsed.rows){
        const raw=table.rows[row.sourceRow-table.preamble-2];
        all.push({...row,file:file.name,raw:Object.fromEntries(table.headers.map((h,i)=>[h,raw[i]]))});
      }
    }
    return Q.selectSnapshot(all,cfg).rows.sort((a,b)=>a.strike-b.strike||a.right.localeCompare(b.right));
  }
  function trade(r,row,p){
    const m=nativeModel(r),K=row.strike,call=row.right==='CALL',D=m.D,quoted=finite(row.bid)&&finite(row.ask)&&row.bid>=0&&row.ask>0&&row.ask>=row.bid;
    const age=row.time?(Q.nyEpoch(r.cfg.asof)-Q.nyEpoch(row.time))/1000:null;
    if(!quoted||!finite(age)||age<0||!(r.cfg.maxAge>0&&age<=r.cfg.maxAge))return null;
    const qPayoff=m.price(K,row.right)/D,physical=p?.coordinate==='native'?p:null;
    const pPayoff=physical?(call?physical.integrate(s=>Math.max(0,s-K),Math.max(K,physical.support[0]),physical.support[1]):physical.integrate(s=>Math.max(0,K-s),physical.support[0],Math.min(K,physical.support[1]))):null;
    return [{position:'Long · ask',cost:row.ask,sign:1},{position:'Short · bid',cost:row.bid,sign:-1}].map(({position,cost,sign})=>{
      if(sign<0&&cost<=0)return {position,cost,qNet:null,pNet:null,qWin:null,pWin:null};
      const breakEven=K+(call?1:-1)*cost/D;
      const win=dist=>(call===(sign>0))?dist.survival(breakEven):dist.cdf(breakEven);
      return {position,cost,breakEven,qNet:sign*(qPayoff-cost/D),pNet:physical?sign*(pPayoff-cost/D):null,qWin:win(m),pWin:physical?win(physical):null};
    });
  }
  function wing(result,K){
    const m=nativeModel(result),F=m.F,k=Math.log(K/F),put=K<F,side=put?'PUT':'CALL';
    const row=m.fitted.find(o=>o.K===K&&o.side===side),a=root.CVIFit.evaluate(m.cvi.canonical,k);
    if(!(a.w>0))return null;
    return {K,k,side,iv:Math.sqrt(a.w/result.T),w:a.w,wk:a.wp,wkk:a.wpp,source:row?'quota':'mark CVI interpolato o estrapolato',quoteFitError:row?.residual??null,spreadError:row?.z??null};
  }
  function plusCalendarMonths(value,months){
    const day=value.slice(0,10),a=new Date(day+'T00:00:00Z');
    const last=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+months+1,0)).getUTCDate();
    return new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+months,Math.min(a.getUTCDate(),last))).toISOString().slice(0,10);
  }
  function sameExpiryPayoffs(r,records,verified){
    const m=nativeModel(r),cfg=r.cfg,time=Q.nyEpoch(cfg.asof),current=(s,limit)=>!!s&&limit>0&&time>=Q.nyEpoch(s)&&time-Q.nyEpoch(s)<=1000*limit;
    const snap=records.filter(z=>z.spot>0&&current(z.spotTime,cfg.maxAge)).sort((a,b)=>Q.nyEpoch(b.spotTime)-Q.nyEpoch(a.spotTime))[0];
    const threeMonths=plusCalendarMonths(cfg.asof,3),ok=r.ws.qAudit?.passed&&cfg.quoteSource==='mid'&&!(cfg.overrideHours>0);
    let hedge=null;
    if(snap&&ok){
      const K=.95*snap.spot,inside=K>=r.ws.nativeLiquid[0]&&K<=r.ws.nativeLiquid[1],x=records.find(o=>o.right==='PUT'&&Math.abs(o.strike-K)<=Math.max(1e-8,K*1e-10)&&current(o.time,cfg.maxAge)&&o.bid>=0&&o.ask>=o.bid);
      const price=m.price(K,'PUT'),g=contract(r,K,'PUT',0,0);
      hedge={spot:snap.spot,spotTime:snap.spotTime,K,price,costPct:100*price/snap.spot,threeMonthTarget:threeMonths,
        exactExpiry:threeMonths===cfg.expiry,inQuotedRange:inside,canonicalEligible:inside&&threeMonths===cfg.expiry&&verified,
        bid:x?.bid??null,ask:x?.ask??null,vegaVolPoint:g?.vegaVolPoint??null,thetaForwardDay:g?.timePassagePerDay??null};
    }
    const vixSource=/^VIXW?$/i.test(cfg.symbol)&&/^parit/i.test(r.forward.source)&&m.quantile(0)>=0;
    const vixEligible=Boolean(ok&&vixSource&&verified);
    const vixVariance=vixEligible?Q.expectation(m,s=>(s-m.F)**2):null;
    return {hedge,threeMonths,vixVariance,vixSource,verified,spot:snap?.spot??null,spotTime:snap?.spotTime??null};
  }
  root.ImpliedResearch={vol,smiles,strip,frozen,contract,payoffComparison,records,wing,sameExpiryPayoffs,trade};
})(globalThis);

