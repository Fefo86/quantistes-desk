(function(root){
'use strict';
const $=s=>document.getElementById('rg'+s),num=(a,d=3)=>Number.isFinite(a)?a.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(h,rows)=>'<div class="tablewrap"><table><thead><tr>'+h.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
let state=null;
function reset(){state=null;$('State').textContent='In attesa del replay.';$('Summary').innerHTML='';$('Info').textContent='';$('Forecast').innerHTML='';$('Date').innerHTML='';$('Date').disabled=true;}
function select(){
 const v=state?.rows[Number($('Date').value)];if(!v)return;
 const percent=n=>Number.isFinite(n)?num(100*n,3)+'%':'—';
 $('Info').textContent=v.reason+'. F '+num(v.forward,2)+' · ampiezza '+percent(v.width)+' · soglia del training '+percent(v.threshold)+' · gruppo '+({narrow:'stretto',wide:'ampio'}[v.group]||'—')+' · N gruppo / training '+v.groupCount+' / '+v.train+' · peso del gruppo '+percent(v.weight)+' · violazioni training '+v.breaches+'. '+(v.pending?'Fixing in attesa.':'Fixing presente nel replay.');
 const rows=['q','pooled','regime'].map((k,i)=>{const f=v.forecast[k],s=v.score?.[k];return [['Q','P comune','P per regime'][i],percent(f?.aboveForward),...Array.from({length:5},(_,j)=>num(f?.quantiles[j],2)),num(s?.crps),s?.zeroDensity?'∞':num(s?.negativeLog)];});
 $('Forecast').innerHTML=table(['Previsione','Pr(S > F)','5%','25%','Mediana','75%','95%','CRPS','Log loss'],rows);
}
function render(r){
 reset();state=r;if(!r?.rows.length)return;
 const n=r.rows.filter(z=>z.forecast.regime).length,p=r.rows.filter(z=>z.pending&&z.forecast.regime).length;
 $('State').textContent=r.rows.length+' curve Q · '+n+' previsioni per regime · '+p+' con fixing in attesa. P resta indisponibile quando il suo training non supera i controlli.';
 const panel=r.cohorts.map(c=>{
  const names={q:'Q',pooled:'P comune',regime:'P per regime'};
  const avg=Object.entries(c.models).map(([k,s])=>[names[k],num(s.crps,4),c.zeroDensity?'∞':num(s.negativeLog,4)]);
  const diff=[];for(const [k,pair] of Object.entries(c.differences))for(const [n,v] of Object.entries(pair)){
   const [a,b]=k.split('-');diff.push([names[a]+' − '+names[b],n==='crps'?'CRPS':'Log loss',num(v.estimate,4),v.interval95?v.interval95.map(y=>num(y,4)).join(' … '):'—',v.lag??'—']);
  }
  return '<p class="smalltext">'+esc(c.cohort)+' · '+c.paired+' test appaiati · '+c.zeroDensity+' fixing a densità nulla.</p>'+table(['Modello','CRPS medio','Log loss medio'],avg)+table(['Differenza appaiata','Loss','Media','IC 95% HAC','Ritardi'],diff);
 }).join('');
 $('Summary').innerHTML=panel;
 $('Date').innerHTML=r.rows.map((v,i)=>'<option value="'+i+'">'+esc(v.asof+' · '+v.series+(v.pending?' · fixing in attesa':''))+'</option>').join('');
 $('Date').value=String(r.rows.length-1);$('Date').disabled=false;select();
}
$('Date').onchange=select;
root.RegimeUI={render,reset};
})(globalThis);
