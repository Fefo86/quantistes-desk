

(function(w){
'use strict';
const I=w.ReportIntel,C=w.InstCore,observed=f=>['estimate','published','chart'].includes(f.mode)&&!f.scenario;
const num=v=>Number.isFinite(v)?v.toLocaleString('it-IT',{maximumFractionDigits:2}):'—';
function changes(rows,active,cut){
 const by=new Map(),out=[];
 for(const r of rows){if(!observed(r)||!r.enabled||r.review||!Number.isFinite(r.pub)||r.pub>cut||!r.asof||!r.series||!C.allowed(r.k,r.v))continue;
 const key=I.comparable(r);if(!by.has(key))by.set(key,[]);by.get(key).push(r);}
 for(const f of active){if(!observed(f)||!f.series)continue;const prev=(by.get(I.comparable(f))||[]).filter(r=>r.asof<f.asof&&r.pub<=f.pub&&r.asof<=new Date(r.pub).toLocaleDateString('en-CA',{timeZone:'America/New_York'})).sort((a,b)=>b.asof.localeCompare(a.asof)||b.pub-a.pub);
 if(!prev.length)continue;const p=prev[0];if(prev.some(r=>r.asof===p.asof&&r.pub===p.pub&&r.v!==p.v))continue;
 const d=C.metrics[f.k]?.[1],unit=f.k==='custom'?(f.unit==='%'?'pp':f.unit):(d==='gamma'||d==='cashperpct'?(f.currency||'')+' / 1%':d==='moneyvol'?(f.currency||'')+' / punto vol':f.currency||({percent:'pp',percentile:'punti percentile',multiple:'×',ratio:'rapporto',bp:'pb',points:'punti',pp:'pp',sessions:'sedute',volpt:'punti vol'}[d]||d));
 out.push({k:f.k,name:f.name||C.metrics[f.k][0],v:f.v-p.v,unit,prev:p.v,now:f.v,g:f.g,scope:f.scope,term:f.term,from:p.asof,to:f.asof,provider:f.provider,series:f.series,page:f.page,seg:f.seg,id:f.id,previousPage:p.page,previousSeg:p.seg,previousId:p.id,doc:f.doc,previousDoc:p.doc});}
 return out;
}
function gate(id,view,decide,obs){
 const us=f=>['ES','SPX','US'].includes(f.scope);
 if(id==='P10'||id==='P11'){
  const sell=id==='P10',levels=view.active.filter(f=>f.g==='cta'&&f.scope==='SPX'&&f.k===(sell?'triggerSell':'triggerBuy')&&['threshold','published','estimate'].includes(f.mode)&&!f.scenario);
  const get=w.DeskMarkets?.state;
  if(levels.length&&get){
   const now=get(view.cut)?.spx,prior=now&&get(now.t-60000)?.spx;
   if(prior&&now&&prior.day===now.day&&Number.isFinite(now.t)&&Number.isFinite(prior.t)&&now.t-prior.t===60000&&now.t<=view.cut&&view.cut-now.t<60000){
    const crossed=levels.filter(f=>f.pub<=prior.t&&(sell?prior.price>=f.v&&now.price<f.v:prior.price<=f.v&&now.price>f.v));
    decide(0,crossed.map(f=>({...f,marketProof:'SPX '+num(prior.price)+' → '+num(now.price)+' · '+new Date(now.t).toISOString()})),()=>true);
   }
  }
 }
 if(id==='P14'){const day=new Date(view.cut).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),reset=view.derived.filter(f=>us(f)&&f.id==='H227'&&f.asof===day);decide(0,reset.filter(f=>f.product),()=>true);decide(1,reset,()=>true);}
 if(id==='P16'){decide(0,view.active.filter(f=>f.k==='vixCallVega'&&f.scope==='VIX'&&['published','estimate'].includes(f.mode)&&!f.scenario),f=>f.v>0);}
 if(id==='P17'){decide(0,(view.changes||[]).filter(f=>us(f)&&f.k==='impliedCorr'&&f.series),f=>f.v!==0);decide(2,obs.filter(f=>f.g==='disp'&&f.k==='dispPosition'),f=>f.v!==0);}
 if(id==='P18'){decide(0,obs.filter(f=>f.g==='hf'&&f.k==='captureGap'),f=>f.v>0);decide(1,obs.filter(f=>f.g==='hf'&&f.k==='betaHeadroom'),f=>f.v>0);}
 if(id==='P12'){const d=view.changes||[];decide(0,d.filter(f=>us(f)&&f.g==='vc'&&f.k==='forecastVol'&&f.series),f=>f.v<0);decide(1,d.filter(f=>us(f)&&f.g==='vc'&&f.k==='targetLev'&&f.series),f=>f.v>0);}
}
let cashMemo=null;
function cashMark(session,origin,cut){
 const M=w.DeskMeasures,r=w.Desk?.state,arch=w.DeskMarkets?.state?.(cut)?.spx;
 let candidate=arch?{spot:arch.price,at:arch.t}:null;
 if(!session||!M.recent(origin,cut,60)||!r?.parsed?.rows||r.stale||!r.result?.cfg?.asof||w.QuantCore.nyEpoch(r.result.cfg.asof)!==origin)return candidate;
 if(!cashMemo||cashMemo.session!==session||cashMemo.parsed!==r.parsed||cashMemo.origin!==origin){
  let best=null,conflict=false;const seen=new Map();
  const epoch=v=>{if(!v)return NaN;if(!seen.has(v))seen.set(v,w.QuantCore.nyEpoch(v));return seen.get(v);};
  for(const q of r.parsed.rows){
   if(!q.spotTime||q.symbol!=='SPXW'||q.expiry!==session.expiry||!(q.spot>0))continue;
   const t=epoch(q.spotTime),quote=epoch(q.time);
   if(!M.recent(t,origin,60)||!Number.isFinite(quote)||quote>origin)continue;
   if(!best||t>best.at){best={at:t,spot:q.spot};conflict=false;}
   else if(t===best.at&&best.spot!==q.spot)conflict=true;
  }
  cashMemo={parsed:r.parsed,session,origin,price:conflict?null:best};
 }
 const quote=cashMemo.price;
 if(quote&&M.recent(quote.at,cut,60)){
  if(candidate&&candidate.at===quote.at&&Math.abs(candidate.spot-quote.spot)>.011)return null;
  if(!candidate||quote.at>candidate.at)candidate=quote;
 }
 return candidate;
}
function market(c){
 if(!c)return {};const snap=w.QuantistesConfluence?.evidence?.()?.snapshot,M=w.DeskMeasures;
 const es=snap&&M.recent(M.stamp(snap.es?.asof),c.cutMs,90)&&M.stamp(snap.asof)<=c.cutMs?{spot:snap.es.last,contract:snap.es.contract,at:M.stamp(snap.es.asof)}:null;
 const core=w.QuantistesDynamicCore,s=core?.state?.session;
 const ct=s&&w.QuantCore.nyEpoch(s.date+'T'+s.cutoff),model=w.QuantistesDynamic?.get?.();
 const cash=cashMark(s,ct,c.cutMs);
 if(cash&&s&&ct===c.cutMs){cash.p=model?.kind!=='BLOCKED'&&model?.date===s.date&&model?.cutoff===s.cutoff&&Math.abs(model.spot-cash.spot)<=.011?model:null;cash.q=core?.liveQ?.();}
 return {ES:es,SPX:cash,priorCash:w.DeskMarkets?.priorCash(c.date,c.cutMs)||null,gamma:w.DeskFields?.dealerGamma?.(c.cutMs)||[]};
}
function integrate(view,c,m=market(c)){
 const indicators=[];if(!view||!c||view.cut!==c.cutMs)return indicators;
 for(const f of view.active.filter(f=>f.k==='commentary')){const origin=f.provider+' · '+f.asof+' · p. '+f.page;indicators.push({group:'Tesi istituzionale',stage:'reports',tool:'report-archive',role:'Contesto qualitativo',origin,provenance:I.provenance(f),value:C.groups[f.g]+' · '+C.scopes[f.scope],detail:f.source});}
 for(const f of view.active.filter(observed)){
 const origin=f.provider+' · '+f.asof+' · p. '+f.page;const provenance=I.provenance(f);
 if(['trigger','triggerBuy','triggerSell'].includes(f.k)&&['ES','SPX'].includes(f.scope)){
 const p=m[f.scope];if(!p||f.scope==='ES'&&(!p.contract||!f.term||f.term.toUpperCase()!==p.contract.toUpperCase()))continue;
 const d=f.v-p.spot,name=C.metrics[f.k][0],ref={group:'Livello CTA × prezzo',stage:'path',tool:'dynamic-p',role:'Distanza al trigger',origin,provenance,priceAt:p.at,scope:f.scope,level:f.v,spot:p.spot,distance:d,unit:'punti'};
 if(f.g!=='cta')continue;
 if(f.scope==='SPX'&&p.p&&p.p.H>0){ref.pTouch=w.QuantistesDynamicCore.touch(p.p,f.v);ref.pEndAbove=w.QuantistesDynamicCore.terminal(p.p,f.v);ref.terminal=p.p.H;}
 if(f.scope==='SPX'&&p.q){const domain=w.Desk?.state?.result?.ws?.nativeLiquid;if(domain?.length===2&&f.v>=domain[0]&&f.v<=domain[1])ref.qEndAbove=p.q.survival(f.v);}
 ref.value=name+' '+num(f.v)+' · '+(d>0?'+':'')+num(d)+' pt';ref.detail='Prezzo '+num(p.spot)+' · '+new Date(p.at).toISOString()+(ref.pTouch!=null?' · P tocco '+num(ref.pTouch*100)+'% / P chiusura sopra '+num(ref.pEndAbove*100)+'%, orizzonte '+ref.terminal+' min':'')+(ref.qEndAbove!=null?' · Q chiusura sopra '+num(ref.qEndAbove*100)+'% al fixing SPXW':'');
 indicators.push(ref);}
 if(f.k==='etfSensitivity'&&f.g==='letf'&&f.scope==='SPX'&&f.currency==='USD'&&f.v>=0&&m.SPX&&m.priorCash?.price>0&&f.asof<=c.date){
 const ret=100*(m.SPX.spot/m.priorCash.price-1),pressure=f.v*ret;indicators.push({group:'ETF a leva × SPX',stage:'reports',tool:'report-charts',role:'Scenario di chiusura',origin,provenance,value:(pressure>0?'+':'')+num(pressure/1e6)+' mln USD',detail:'Coefficiente report '+num(f.v/1e6)+' mln USD per 1% × rendimento cash '+num(ret)+'% da '+num(m.priorCash.price)+'. Stima lineare a coefficiente invariato e prima di creazioni o riscatti.',observedReturnPct:ret,priorClose:m.priorCash.price,priceAt:m.SPX.at,projected:pressure});}
 if(f.g==='dealer'&&f.k==='gex'&&f.scope==='SPX'&&f.currency==='USD'&&f.v!==0){
 for(const g of (m.gamma||[])){const equal=Math.sign(f.v)===Math.sign(g.value);indicators.push({group:'Gamma report × dealer',stage:'dealer',tool:'gammaatlas',role:'Regime dealer',origin:origin+' / '+g.source,provenance,value:g.value===0?'Gamma dealer corrente nullo':equal?'Segno concorde':'Segno divergente',detail:'Gamma report '+num(f.v/1e9)+' mld USD/1% · campo dealer '+num(g.value/1e9)+' mld USD/1% · '+g.asof+'. Confronto di segno tra due osservazioni datate.',live:g.value,reported:f.v,priceAt:Date.parse(g.asof),agreement:equal});}}
 }
 for(const f of (view.changes||[]))indicators.push({group:'Variazione fra report',stage:'reports',tool:'report-charts',role:'Variazione osservata',origin:f.provider+' · '+f.from+' / '+f.to,value:(f.v>0?'+':'')+num(f.v)+' '+f.unit,detail:f.name+' · '+C.scopes[f.scope]+' · '+f.series+' · pp. '+f.previousPage+' / '+f.page,comparison:f});
 return indicators;
}
w.ReportSignals={changes,gate,market,integrate};
})(window);


