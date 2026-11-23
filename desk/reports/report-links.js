
(function(w){
'use strict';
const predicates={
 P05:f=>f.g==='dealer'&&['expiryGamma','gex','gamma0','zeroDte'].includes(f.k),
 P06:f=>f.g==='vol'&&['skew','rv5'].includes(f.k),
 P07:f=>f.g==='vol'&&['rv5','skew'].includes(f.k),
 P10:f=>f.g==='cta'&&['weight','position','flow','trend','trigger','triggerSell','targetLev','target'].includes(f.k),
 P11:f=>f.g==='cta'&&['weight','position','flow','trend','trigger','triggerBuy','targetLev','target'].includes(f.k),
 P12:f=>f.g==='vc'||f.k==='rv5'&&f.scope==='SPX',
 P13:f=>f.g==='rp',
 P14:f=>f.g==='letf',
 P15:f=>f.k==='vixCallVega'||f.g==='vixetn'&&['vega','cashflow'].includes(f.k),
 P16:f=>['vix','vvix','vixTouched','vixCallVega'].includes(f.k)||f.g==='vixetn',
 P17:f=>f.g==='disp'||['advancing','above200','breadth'].includes(f.k),
 P18:f=>f.g==='hf'&&['net','gross','captureGap','betaHeadroom','netPct','grossPct'].includes(f.k)||['advancing','above200','breadth'].includes(f.k),
 P19:f=>f.g==='hf'&&['leverage','gross','net','position','grossPct','netPct'].includes(f.k),
 P20:f=>['cta','sys'].includes(f.g)&&['flow','target','weight','trend'].includes(f.k),
 P21:f=>['cta','sys'].includes(f.g)&&['flow','target','weight','trend'].includes(f.k),
 P24:f=>['cta','vc','rp','letf','pension','sys'].includes(f.g)&&['cashflow','flow','etfSensitivity'].includes(f.k)
};
const focus=f=>!['UNKNOWN','OTHER','EUR','EM'].includes(f.scope);
const noteFamily={P10:'cta',P11:'cta',P12:'vc',P13:'rp',P14:'letf',P17:'disp',P19:'hf'};
const derivedBooks={H221:['P11'],H215:['P12'],H224:['P13'],H227:['P14'],H223:['P10','P11'],CTA_SPREAD:['P10','P11'],CTA_TREND_CHANGE:['P10','P11'],RP_VOL:['P13'],RP_EQUITY_RC:['P13'],RP_SLEEVE_GAP:['P13'],PENSION_GAP:['P24'],SYS_RANGE:['P20','P21'],GAMMA_RECON:['P05']};
function applies(id,f){return predicates[id]?.(f)||(['custom','commentary'].includes(f.k)&&noteFamily[id]===f.g);}
function playbooks(f){if(!focus(f))return [];return f.calc?derivedBooks[f.k.slice(5)]||[]:Object.keys(predicates).filter(id=>applies(id,f));}
function context(id,view){
 if(!view?.active||!predicates[id])return [];
 return view.active.filter(f=>focus(f)&&applies(id,f)).map(f=>({doc:f.doc,seg:f.seg,id:f.id,page:f.page,g:f.g,k:f.k,scope:f.scope,term:f.term,h:f.h,mode:f.mode,asof:f.asof,scenario:f.scenario,provider:f.provider,name:f.name||w.InstCore.metrics[f.k]?.[0],raw:f.v,h:f.h,currency:f.currency,value:w.InstEngine.display(f)}));
}
function combine(row,extra){
 if(!extra)return row;
 row.reportEvidence=extra;
 const known=row.known,disputed=new Set(extra.evidence.filter(e=>e.conflict).map(e=>e.index));
 if(!known){
  row.known={...extra,gates:extra.gates.slice()};row.state=disputed.size?'Fonti discordanti':extra.gates.includes(false)?'Inattivo':'Dati parziali';
  row.detail=(row.detail?row.detail+' ':'')+'Il report documenta '+extra.gates.filter(x=>x!==null).length+' di '+extra.gates.length+' condizioni.';
  return row;
 }
 const gates=known.gates.slice();let filled=0;
 for(let i=0;i<gates.length;i++){
  const v=extra.gates[i];if(v==null)continue;
  if(gates[i]==null){gates[i]=v;filled++;}
  else if(v!==gates[i]){disputed.add(i);const e=extra.evidence.find(x=>x.index===i);if(e){e.nativeConflict=true;e.nativeValue=gates[i];}}
 }
 if(!disputed.size&&!filled)return row;
 for(const i of disputed)gates[i]=null;
 row.known={...known,gates,source:known.source+' / '+extra.source};
 row.detail=(row.detail?row.detail+' ':'')+(disputed.size?'Fonti discordanti sulle condizioni '+[...disputed].map(i=>i+1).join(', ')+'.':'Il report completa '+filled+' condizioni osservate.');
 row.state=known.veto?'Veto':disputed.size?'Fonti discordanti':gates.includes(false)?'Inattivo':gates.includes(null)||known.veto==null?'Dati parziali':'Attivo · da calibrare';
 row.estimate={...row.estimate,p:null};return row;
}
w.ReportLinks={playbooks,context,combine};
})(window);

