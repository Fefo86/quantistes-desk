
/* European forward CVI marks, common-cutoff calendar validation and normalized-price interpolation. */
(function(root){
'use strict';
const D=root.CVIData, Fit=root.CVIFit, Cert=root.CVICert, Lab=root.CVILab;
const finite=Number.isFinite;
const settingsBase=Object.freeze({fixing:'16:00',rate:0,discountMode:'auto',maxAge:300,maxPairGap:30,minBid:.05,maxSpread:1,lambdaTV:.0003});

const bilateral=(c,k)=>k>=c.lo-2e-15&&k<=c.hi+2e-15;

function readWide(file){
  const data=root.QuantCore.parseCSV(file.text);
  const rows=[];
  for(const q of data.rows){
    const ms=D.epochET(q.time);
    if(q.assumedSymbol||!q.expiry||!finite(ms))continue;
    rows.push({symbol:q.symbol,expiry:q.expiry,side:q.right,K:q.strike,bid:finite(q.bid)?q.bid:null,
      ask:finite(q.ask)?q.ask:null,malformed:!!q.cviMalformed,ms,date:D.timeET(ms).slice(0,10),row:q.sourceRow});
  }
  if(!rows.length)throw Error('Contratti con simbolo, scadenza e orario osservati assenti.');
  return {files:[{name:file.name,rows:rows.length,rejected:data.rows.length-rows.length+data.bad.length}],rows,issues:data.warnings};
}
function readSources(files){
  const inputs=[],duplicates=[],issues=[],records=[],byHash=new Map(),groups=new Map();
  for(const f of files){
    if(typeof f?.text!=='string'){issues.push('Sorgente senza testo CSV.');continue;}
    const file={text:f.text,name:String(f.name||'CSV')},sha256=Cert.hash(file.text),prior=byHash.get(sha256);
    if(prior&&prior.text===file.text){
      duplicates.push({name:file.name,original:prior.name,sha256});
      continue;
    }
    byHash.set(sha256,file);
    const entry={name:file.name,sha256,rows:0,rejected:0},sourceIndex=inputs.length;
    inputs.push(entry);
    try{
      const header=file.text.split(/[\r\n]/,1)[0].replace(/[^A-Za-z0-9,;\t]/g,'').toLowerCase();
      const wide=/(?:^|[,;\t])(?:callbid|bidcall|callask|askcall|putbid|bidput|putask|askput)(?:$|[,;\t])/.test(header)
        &&!/(?:^|[,;\t])(?:right|optiontype|side)(?:$|[,;\t])/.test(header);
      const parsed=wide?readWide(file):D.parseFiles([file]);
      Object.assign(entry,parsed.files[0]);issues.push(...parsed.issues);
      for(const q of parsed.rows){
        const id=q.symbol+'|'+q.date;let g=groups.get(id);
        if(!g){g={id,symbol:q.symbol,date:q.date,timeMs:q.ms,rows:0,expiries:new Set(),sources:new Set()};groups.set(id,g);}
        g.timeMs=Math.max(g.timeMs,q.ms);g.expiries.add(q.expiry);g.sources.add(file.name);g.rows++;
        records.push({...q,sourceIndex});
      }
    }catch(err){entry.error=String(err.message||err);issues.push(file.name+' · '+entry.error);}
  }
  const cohorts=[...groups.values()].sort((a,b)=>b.timeMs-a.timeMs||a.symbol.localeCompare(b.symbol)).map(g=>({
    ...g,asof:D.timeET(g.timeMs),expiries:[...g.expiries].sort(),sources:[...g.sources]}));
  return {dataset:{rows:records,files:inputs,groups:cohorts,issues},duplicates};
}
function releaseCurve(f,wing,origin){
  const r=root.CVIIntraday.analyze(f,wing),m=r.marks;
  if(!r.markReleased||r.book.status!=='FEASIBLE'||m.certificate?.status!=='CERTIFIED')
    throw Error(r.reason||m.reason||'Mark CVI sospeso.');
  const fingerprint=Cert.fingerprint(m.canonical,m.context);
  if(fingerprint!==m.candidateFingerprint||fingerprint!==m.certificate.fingerprint)throw Error('Identità del mark CVI incoerente.');
  const points=f.points.map(p=>{
    const markW=Fit.evaluate(m.canonical,p.k).w;
    return {...p,observedIV:p.wMid>0?Math.sqrt(p.wMid/f.T):null,markIV:Math.sqrt(markW/f.T),mark:D.black(f.F,p.K,f.D,markW,p.side)};
  });
  const [lo,hi]=f.observed,market=m.market,representative={
    all:market.total,mids:market.bilateral,bilateral:market.bilateral,inside:market.inside,within:market.inside/market.bilateral,
    allInside:market.accepted,oneSide:market.unilateral,rmse:market.rmse,rmsSpread:market.rmsHalfSpread,maxBreach:market.maxBreach};
  return {symbol:f.symbol,asof:f.asof,date:f.asof.slice(0,10),timeMs:f.timeMs,expiry:f.expiry,fixMs:f.fixMs,fixing:f.fixing,T:f.T,F:f.F,D:f.D,lo,hi,
    observed:[lo,hi],sourceId:fingerprint,fingerprint,profile:m.profile,origin,context:m.context,canonical:m.canonical,
    points,stats:representative,market,certificate:m.certificate,marketPass:true,baseFingerprint:f.certificate.fingerprint,
    tape:r.tape,sources:[...new Set(points.map(p=>p.source))],discount:f.audit?.discount||null,atmIV:Math.sqrt(Fit.evaluate(m.canonical,0).w/f.T)};
}
function settingsFor(g,opts){
  const s={...settingsBase};
  for(const k of ['rate','discountMode','maxAge','maxPairGap','minBid','maxSpread','clocks','rates'])if(opts[k]!=null)s[k]=opts[k];
  s.fixing=opts.fixing??opts.expiryTime??s.fixing;
  s.asof=g.timeMs;
  if(opts.asof!=null&&opts.asof!==''){
    const t=D.epochET(opts.asof);
    if(!finite(t))throw Error('Cutoff non valido o ambiguo nel fuso di New York.');
    if(D.timeET(t).slice(0,10)===g.date)s.asof=t;
  }
  if(opts.asofByGroup?.[g.id]!=null)s.asof=D.epochET(opts.asofByGroup[g.id]);
  return s;
}
function verifyJointSlice(f,profile,origin){
  // The joint CVI solution is the source of truth; never mark it as a released
  // single-maturity solution unless the entire quote box and continuous certificate pass.
  const cert=Cert.slice(f.canonical,{context:f.context});
  if(cert.status!=='CERTIFIED'||Cert.fingerprint(f.canonical,f.context)!==cert.fingerprint)throw Error('Verifica butterfly continua della slice congiunta incompleta.');
  if(f.solver?.status==='MARKET_BOX_FEASIBLE'){
    if(f.solver?.marketRepair?.success!==true)throw Error('Riparazione prezzi non verificata.');
  }else if(f.solver?.status!=='CONVERGED'||f.solver?.kkt?.passes!==true)throw Error('Solver congiunto senza convergenza/KKT verificati.');
  if(!f.parityPass)throw Error('Intervallo put–call parity incompatibile.');
  const pts=f.points.map(p=>{
    const w=Fit.evaluate(f.canonical,p.k).w,mark=D.black(f.F,p.K,f.D,w,p.side);
    if(!finite(mark))throw Error('Premio non finito durante la verifica congiunta.');
    const breach=Math.max(0,p.wBid==null?0:p.bid-mark,p.wAsk==null?0:mark-p.ask);
    return {...p,mark,markIV:Math.sqrt(w/f.T),observedIV:p.wMid>0?Math.sqrt(p.wMid/f.T):null,breach};
  });
  const bad=pts.filter(p=>p.breach>1e-7);
  if(bad.length){const p=bad.sort((x,y)=>y.breach-x.breach)[0];throw Error(bad.length+' premi fuori dai bid/ask; peggiore '+f.expiry+' '+p.side+' '+p.K.toFixed(2)+
     ' · book '+p.bid+' / '+p.ask+' · mark '+p.mark.toFixed(6)+' · scarto '+p.breach.toFixed(6)+' pt SPX.');}
  const bilateral=pts.filter(p=>p.wMid!=null),within=bilateral.length;
  const rmse=Math.sqrt(bilateral.reduce((z,p)=>z+(p.mark-p.mid)**2,0)/Math.max(1,bilateral.length));
  const book=root.CVIBounds.compute(f);
  if(book.status!=='FEASIBLE')throw Error('Limiti market-implied incompatibili con la slice congiunta.');
  const market={total:pts.length,bilateral:within,inside:within,unilateral:pts.length-within,accepted:pts.length,maxBreach:0,rmse,rmsHalfSpread:Math.sqrt(bilateral.reduce((z,p)=>z+((p.mark-p.mid)/Math.max(.005,(p.ask-p.bid)/2))**2,0)/Math.max(1,within))};
  const [lo,hi]=f.observed;
  return {symbol:f.symbol,asof:f.asof,date:f.asof.slice(0,10),timeMs:f.timeMs,expiry:f.expiry,fixMs:f.fixMs,fixing:f.fixing,T:f.T,F:f.F,D:f.D,lo,hi,observed:[lo,hi],sourceId:cert.fingerprint,fingerprint:cert.fingerprint,
    profile,origin,context:f.context,canonical:f.canonical,points:pts,stats:{all:pts.length,mids:within,bilateral:within,inside:within,within:1,allInside:pts.length,oneSide:pts.length-within,rmse,rmsSpread:market.rmsHalfSpread,maxBreach:0},market,certificate:cert,marketPass:true,baseFingerprint:f.certificate?.fingerprint,
    sources:[...new Set(pts.map(p=>p.source))],discount:f.audit?.discount||null,atmIV:Math.sqrt(Fit.evaluate(f.canonical,0).w/f.T),jointSolver:f.solver};
}
function pairsOf(curves){
  const out=[];
  for(let i=1;i<curves.length;i++){
    const a=curves[i-1],b=curves[i];
    const proof=Cert.calendar(a.canonical,b.canonical,{nearContext:a.context,farContext:b.context});
    out.push({near:a.expiry,far:b.expiry,...proof});
  }
  return out;
}
function calendarBoxObstruction(ds,g,settings,expiries){
  // Necessary, model-free calendar inequality for European forward-normalized
  // option prices, conditional on proportional deterministic carry.
  // Compare conservative Lipschitz envelopes of quoted puts and calls at
  // the same x=K/F; these can only prove infeasibility, never feasibility.
  const slices=[];
  for(const expiry of expiries){try{
    slices.push(D.buildSlice(ds,g.id,expiry,{...settings,rate:settings.rates?.[expiry]??settings.rate??0,fixing:settings.clocks?.[expiry]||settings.fixing}));
  }catch(error){return null;}}
  slices.sort((a,b)=>a.T-b.T);
  for(let j=1;j<slices.length;j++){
    const near=slices[j-1],far=slices[j];
    for(const side of ['PUT','CALL']){
      const a=near.points.filter(p=>p.side===side&&p.wBid!=null&&Number.isFinite(p.bid)),
        b=far.points.filter(p=>p.side===side&&p.wAsk!=null&&Number.isFinite(p.ask));
      if(!a.length||!b.length)continue;
      const xvals=a.map(p=>p.K/near.F).concat(b.map(p=>p.K/far.F));
      for(const x of xvals){
        let lo=0,hi=Infinity;
        for(const p of a){const q=p.K/near.F,v=p.bid/(near.D*near.F);
          lo=Math.max(lo,v-(side==='PUT'?Math.max(0,q-x):Math.max(0,x-q)));}
        for(const p of b){const q=p.K/far.F,v=p.ask/(far.D*far.F);
          hi=Math.min(hi,v+(side==='PUT'?Math.max(0,x-q):Math.max(0,q-x)));}
        if(lo>hi+1e-9)return {near:near.expiry,far:far.expiry,side,x,lower:lo,upper:hi,
          reason:'Quote incompatibili con il calendar ('+near.expiry+' / '+far.expiry+', '+side+', log-moneyness '+Math.log(x).toFixed(5)+'): '+
          'limite inferiore vicino '+lo.toFixed(7)+' > limite superiore lontano '+hi.toFixed(7)+' in premio normalizzato. Nessuna calibrazione può conciliarle senza cambiare i dati o le convenzioni.'};
      }
    }
  }
  return null;
}
function joinCurves(ds,g,settings,expiries,wing,maxPlans=9){
  const obstruction=calendarBoxObstruction(ds,g,settings,expiries);
  if(obstruction)return {accepted:false,attempts:[],category:'QUOTE_BOX_CALENDAR_CONFLICT',reason:obstruction.reason,obstruction};
  const attempts=[],seen=new Set(),plans=[
    {knotCount:15,lambdaTV:.0003,maxOuter:20},
    {knotCount:15,lambdaTV:.00008,maxOuter:24},
    {knotCount:19,lambdaTV:.00008,maxOuter:24},
    {knotCount:19,lambdaTV:.00002,maxOuter:28},
    {knotCount:15,lambdaTV:1e-7,maxOuter:28},
    {knotCount:19,lambdaTV:0,maxOuter:28},
    {knotCount:23,lambdaTV:.00002,maxOuter:32},
    {knotCount:23,lambdaTV:0,maxOuter:32},
    {knotCount:27,lambdaTV:0,maxOuter:36}
  ];
  for(const [index,config] of plans.slice(0,maxPlans).entries()){
    const attempt={id:index+1,knots:config.knotCount,regularization:config.lambdaTV,status:'PENDING',reason:''};
    attempts.push(attempt);
    try{
      // The native solver takes ALL expiries simultaneously, with linear calendar
      // constraints and nonlinear butterfly constraints on every maturity.
      const result=Lab.build(ds,{...g,expiries}, {...settings,...config,strictQuotes:true});
      if(!result.joint||result.curves.length!==expiries.length){
        throw Error('Solver congiunto non convergente: '+result.errors.map(e=>e.reason).join(' / '));
      }
      const shaped=result.curves.map(f=>verifyJointSlice(f,wing?'wing':'desk','joint'));
      const checks=pairsOf(shaped);
      if(checks.some(p=>p.status!=='CERTIFIED'))throw Error('Calendar continuo non certificato '+checks.filter(p=>p.status!=='CERTIFIED').map(p=>p.near+' → '+p.far).join(', '));
      attempt.status='ACCEPTED';attempt.reason='Tutte le slice nei bid/ask, butterfly e calendar certificati.';
      return {accepted:true,curves:shaped,pairs:checks,attempts,solver:result.jointDiag,reason:attempt.reason};
    }catch(error){attempt.status='REJECTED';attempt.reason=String(error.message||error).slice(0,360);}
  }
  const reasons=attempts.map(a=>a.reason||'').filter(Boolean);
  const category=reasons.every(r=>/NO_FEASIBLE_SEED|incompleto|NON CONVER|non convergente|BUDGET_OR_PROGRESS_LIMIT|nessun passo|QP_|KKT|limite|punto iniziale/i.test(r))?'SOLVER_INCONCLUSIVE':'RELEASE_NOT_CERTIFIED';
  return {accepted:false,attempts,category,reason:category==='SOLVER_INCONCLUSIVE'?
    'Il solver non ha trovato un candidato certificabile con i parametri correnti. Non è dimostrato che i dati contengano un arbitraggio: verifica i dettagli e la sincronia prima di riprovare.':
    'Le calibrazioni candidate non soddisfano contemporaneamente gli spread, il butterfly e il calendar. Esamina il registro per i vincoli responsabili.'};
}
function buildGroup(ds,g,opts){
  const settings=settingsFor(g,opts),profile=opts.profile??opts.cviWingProfile??'desk',wing=profile==='wing',mode=opts.jointMode||'auto';
  const group={...g,asof:D.timeET(settings.asof),timeMs:settings.asof,settings,profile,curves:[],pairs:[],errors:[],missing:[],joint:{attempted:false,accepted:false,attempts:[],reason:''},
    marketReady:false,geometryReady:false,mode:'empty',reason:'',sourceRows:g.rows};
  if(g.symbol!=='SPXW'){group.reason='Il motore richiede opzioni europee SPXW con fixing PM.';group.missing=g.expiries.slice();return group;}
  if(!['desk','wing'].includes(profile))throw Error('Profilo CVI sconosciuto.');
  if(!['auto','force','slices'].includes(mode))throw Error('Modalità congiunta non riconosciuta.');
  const latest=new Map(),excluded=[];
  for(const q of ds.rows)if(q.symbol===g.symbol&&q.date===g.date&&q.ms<=settings.asof)
    latest.set(q.expiry,Math.max(latest.get(q.expiry)??-Infinity,q.ms));
  const expiries=g.expiries.filter(expiry=>{
    const fixing=D.epochET(expiry+'T'+(settings.clocks?.[expiry]||settings.fixing)),last=latest.get(expiry);
    const reason=last==null?'Nessuna quotazione entro il cutoff.':fixing<=settings.asof?'Fixing già trascorso.':
      settings.asof-last>1000*settings.maxAge?'Tutte le quotazioni superano il limite di età.':null;
    if(reason)excluded.push({expiry,reason});return !reason;
  });
  group.availableExpiries=g.expiries;group.expiries=expiries;group.excluded=excluded;
  group.qualityByExpiry=g.expiries.map(expiry=>{
    const rows=ds.rows.filter(q=>q.symbol===g.symbol&&q.date===g.date&&q.expiry===expiry);
    const last=latest.get(expiry);
    const base=last==null?null:Math.max(0,(settings.asof-last)/1000);
    const excludedRow=excluded.find(x=>x.expiry===expiry);
    return {expiry,rows:rows.length,latest:last==null?null:D.timeET(last),lagSeconds:base,excluded:!!excludedRow,reason:excludedRow?.reason||''};
  });
  if(!expiries.length){group.reason=excluded.map(v=>v.expiry+' · '+v.reason).join(' / ');return group;}
  const curves=new Map(),errors=new Map();
  for(const expiry of expiries){
    try{
      const result=Lab.build(ds,{...g,expiries:[expiry]},settings),f=result.curves[0];
      if(!f)throw Error(result.errors.map(e=>e.reason).join(' / ')||'Nessun fit per questa scadenza.');
      curves.set(expiry,releaseCurve(f,wing,'standalone'));
    }catch(e){errors.set(expiry,String(e.message||e));}
  }
  let released=[...curves.values()].sort((a,b)=>a.T-b.T),pairs=pairsOf(released),complete=released.length===expiries.length,
    certified=complete&&pairs.every(p=>p.status==='CERTIFIED');
  // AUTO: an independently released skew is not enough. Whenever its calendar
  // crosses, re-fit EVERY maturity jointly and certify the resulting surface.
  if(expiries.length>=2&&mode!=='slices'&&(mode==='force'||!certified)){
    const r=joinCurves(ds,g,settings,expiries,wing);
    group.joint={attempted:true,accepted:r.accepted,attempts:r.attempts,reason:r.reason,category:r.category||null,obstruction:r.obstruction||null,solver:r.solver||null};
    if(r.accepted){released=r.curves;pairs=r.pairs;complete=true;certified=true;errors.clear();}
  }
  // An unavailable tenor must not suppress a separately certified *subset*.
  // Never extrapolate that subset beyond its own observed maturity interval.
  // Prefer an existing coherent set of standalone released slices; otherwise
  // attempt one-lost-tenor joint refits and audit every excluded expiry.
  if(expiries.length>=3&&mode!=='slices'&&(!complete||!certified)){
    const suspects=[...errors.keys()].filter(e=>expiries.includes(e)).concat(expiries.filter(e=>!released.some(c=>c.expiry===e)));
    const trials=[...new Set(suspects)].slice(0,2),partialAttempts=[];
    for(const absent of trials){
      const subset=expiries.filter(e=>e!==absent);
      if(subset.length<2)continue;
      if(released.length>=subset.length&&pairs.length>=released.length-1&&pairs.every(p=>p.status==='CERTIFIED'))break;
      const r=joinCurves(ds,g,settings,subset,wing,6);
      partialAttempts.push({excluded:absent,attempted:subset.length,accepted:r.accepted,reason:r.reason,attempts:r.attempts});
      if(r.accepted&&r.curves.length>=2&&r.curves.length>released.length){
        released=r.curves;pairs=r.pairs;
        complete=false;certified=true;
        for(const c of released)errors.delete(c.expiry);
        group.joint.subset={excluded:absent,marketReady:true,reason:'Sottoinsieme indipendentemente certificato: '+r.curves.length+' su '+expiries.length+' scadenze.',solver:r.solver};
        break;
      }
    }
    if(partialAttempts.length)group.joint.partialAttempts=partialAttempts;
  }
  group.curves=released;group.pairs=pairs;group.missing=expiries.filter(e=>!released.some(x=>x.expiry===e));
  group.errors=[...errors].map(([expiry,reason])=>({expiry,reason}));
  group.geometryReady=released.length>=2&&pairs.length===released.length-1&&pairs.every(p=>p.status==='CERTIFIED');
  group.marketReady=group.geometryReady;  // certified ONLY on released tenor interval
  group.partial=group.marketReady&&group.missing.length>0;
  group.complete=group.marketReady&&!group.partial;
  group.coverage=group.marketReady?{from:released[0].expiry,to:released[released.length-1].expiry,tenors:released.length,requested:expiries.length}:null;
  group.mode=group.marketReady?'surface':released.length>=2?'slices':released.length===1?'slice':'empty';
  const pair=pairs.find(p=>p.status!=='CERTIFIED');
  if(!released.length)group.reason=group.errors.map(e=>e.expiry+' · '+e.reason).join(' / ')||'Nessuna scadenza ammessa.';
  else if(group.missing.length){
    const reasons=group.missing.map(expiry=>{
      const detail=group.errors.find(e=>e.expiry===expiry)?.reason||group.excluded.find(e=>e.expiry===expiry)?.reason||'rilascio individuale non disponibile';
      return expiry+' ('+detail+')';
    });
    group.reason=(group.partial?'SUPERFICIE PARZIALE CERTIFICATA sulle sole '+released.length+' scadenze ammesse ('+released[0].expiry+' → '+released[released.length-1].expiry+'). NON include tenor mancanti. ':'Superficie completa NON certificata. ')+
      'Mark mancanti: '+reasons.join(' · ').slice(0,900)+(group.joint.attempted?' · FIT CONGIUNTO: '+group.joint.reason:'');
  }
  else if(released.length===1)group.reason='Una sola scadenza coeva. Per la superficie servono almeno due maturità.';
  else if(!group.marketReady)group.reason='Le skew sono valide singolarmente, ma '+(pair?'il calendar '+pair.near+' / '+pair.far+' non è certificato. ':'il rilascio congiunto è incompleto. ')+
    (group.joint.attempted?group.joint.reason+' Vedi i tentativi nel registro congiunto.':'Richiedi la calibrazione congiunta.');
  else group.reason=(group.joint.accepted?'Ricalibrazione congiunta riuscita. ':'Curve indipendenti compatibili. ')+
    'Prezzi nei book, butterfly e calendar continui certificati; superficie pubblicata.';
  if(excluded.length)group.reason+=' Escluse al cutoff: '+excluded.map(e=>e.expiry+' ('+e.reason+')').join(', ');
  return group;
}

function calculate(files,opts={}){
  if(!Array.isArray(files))throw Error('Selezione CSV non valida.');
  const {dataset,duplicates}=readSources(files);
  const issues=dataset.issues.slice(),onlySymbol=String(opts.onlySymbol||'').toUpperCase(),onlyDate=opts.onlyDate;
  let cohorts=dataset.groups.filter(g=>(!onlyDate||g.date===onlyDate)&&(!onlySymbol||g.symbol===onlySymbol));
  if(opts.asof!=null&&opts.asof!==''){
    const cut=D.epochET(opts.asof);
    if(!finite(cut)||onlyDate&&D.timeET(cut).slice(0,10)!==onlyDate){
      cohorts=[];issues.push('Cutoff invalido o incompatibile con la seduta richiesta.');
    }
  }
  if(!cohorts.length&&(onlyDate||onlySymbol))issues.push('Nessun gruppo di quote per la selezione '+[onlySymbol,onlyDate].filter(Boolean).join(' ')+'.');
  return {groups:cohorts.map(g=>buildGroup(dataset,g,opts)),files:dataset.files,duplicates,issues};
}
function point(c,k){
  if(!c?.canonical||!finite(k)||Math.abs(k)>32)return null;
  const w=Fit.evaluate(c.canonical,k).w;
  if(!(w>0&&finite(w)))return null;
  return {iv:Math.sqrt(w/c.T),variance:w,w,F:c.F,D:c.D,strike:c.F*Math.exp(k),k,T:c.T,observed:bilateral(c,k),
    source:'node',sourceId:c.sourceId,expiry:c.expiry};
}
function probe(g,T,k){
 const model=root.CVIModelRouter?.get(g);
 return model?.ok?model.at(T,k,{allowWings:false}):null;
}
// Backward-compatible read-only entry point. Alternative pricing kernels have
// been removed: chart, point inspector, test tools and export use the same
// canonical European-call contract.
function probePresentation(g,T,k,{allowWings=false}={}){
 const model=root.CVIModelRouter?.get(g);
 return model?.ok?model.at(T,k,{allowWings}):null;
}
function inspect(file){
  const {dataset}=readSources([file]),meta=dataset.files[0];
  if(!meta||meta.error)throw Error(meta?.error||'CSV non leggibile.');
  const quotes=dataset.rows;
  if(!quotes.length)throw Error(dataset.issues[0]||'Il CSV non contiene contratti con simbolo, scadenza e timestamp validi.');
  const other=[...new Set(quotes.map(q=>q.symbol).filter(symbol=>symbol!=='SPXW'))];
  if(other.length)throw Error('Radice '+other.join(', ')+' nel file. Seleziona una chain SPXW con fixing PM.');
  const groups=dataset.groups.map(g=>({date:g.date,latest:g.timeMs,expiries:g.expiries}));
  return {hash:meta.sha256,rows:quotes.length,rejected:meta.rejected||0,groups,expiries:[...new Set(groups.flatMap(g=>g.expiries))].sort()};
}
root.CVISurface9=Object.freeze({build:calculate,inspect,point,probe,probePresentation});

})(globalThis);

