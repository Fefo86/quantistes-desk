(function(root){
'use strict';
const $=id=>document.getElementById(id);
let livePage='monitor';
function csv(name,header,rows){
 const field=v=>{
  if(v==null)return '';if(typeof v==='number')return Number.isFinite(v)?String(v):'';
  let s=String(v);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';
 };
 const data=[header,...rows].map(r=>r.map(field).join(',')).join('\r\n')+'\r\n';
 const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function tape(){
 const s=root.Desk.state,r=s.result,w=r?.ws;if(s.stale||!w?.cvi?.markReleased)return;
 const c=w.cvi,mark=c.marks.candidateFingerprint;
 const h=['symbol','cutoff_ET','expiry','engine','mark_sha256','F','discount','T_ACT365','strike','side','kind','age_seconds','bid','ask','mid','mark_points','mark_iv_annual','residual_vs_mid','within_admitted_sides','inside_bilateral_range'];
 const rows=c.points.map(a=>[c.symbol,c.asof,c.expiry,r.cfg.cviWingProfile||'desk',mark,c.F,c.D,c.T,a.K,a.side,a.kind,a.ageSeconds,a.bid,a.ask,a.mid,a.mark,a.markIV,Number.isFinite(a.mid)?a.mark-a.mid:null,a.markWithin,a.K>=c.observedStrike[0]-1e-8&&a.K<=c.observedStrike[1]+1e-8]);
 csv('Quantistes_CVI_Repricing_'+c.expiry+'.csv',h,rows);
}

function clear(){root.CrashTerminal?.clear();$('crTape').disabled=true;}
function refresh(){const s=root.Desk?.state;if(!s||s.stale||!s.result){clear();return;}
 $('crTape').disabled=!s.result.ws?.cvi?.markReleased;if(livePage==='crash')root.CrashTerminal?.refresh();}
function open(name){livePage=name;if(name==='crash')root.CrashTerminal?.refresh();}
$('crTape').onclick=tape;root.CVIDeskFiles={csv,clear,refresh,open};refresh();
})(globalThis);