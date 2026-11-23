
(function(w){
'use strict';
const finite=Number.isFinite;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basic=new Intl.NumberFormat('it-IT',{maximumFractionDigits:4,useGrouping:false});
const sci=new Intl.NumberFormat('it-IT',{notation:'scientific',maximumFractionDigits:3});
const ny=new Intl.DateTimeFormat('it-IT',{timeZone:'America/New_York',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function value(v){
 if(!finite(v))return 'N/D';
 const m=Math.abs(v);return m>0&&(m<.0001||m>=1e7)?sci.format(v):basic.format(v===0?0:v);
}
const signed=v=>finite(v)?(v>0?'+':'')+value(v):'N/D';
const hedge=x=>!finite(x)?'N/D':x>0?'Acquisto '+value(x):x<0?'Vendita '+value(-x):'0';
function edition(pack,frame,out){
 const matches=f=>f&&f.ts===out?.asof&&f.availableAt===out?.availableAt;
 if(!out?.ok||!finite(out.asof)||!finite(out.availableAt))return null;
 return matches(frame)?frame:pack?.frames?.find(matches)||null;
}
function paired(r){
 return !!r&&finite(r.delta)&&finite(r.putDelta)&&finite(r.callDelta)&&Math.abs(r.putDelta+r.callDelta-r.delta)<=.011+1e-9*Math.abs(r.delta);
}
function ratio(p,c){
 if(!finite(p)||!finite(c))return 'N/D';
 if(c===0)return 'N/D · Δ call nullo';
 return value(Math.abs(p)/Math.abs(c));
}
function ratioRead(f,raw){
 const filled=f.rows.filter(paired),complete=filled.length===f.rows.length;
 const local=paired(raw)?ratio(raw.putDelta,raw.callDelta):'N/D';
 const total=complete?ratio(filled.reduce((s,r)=>s+r.putDelta,0),filled.reduce((s,r)=>s+r.callDelta,0)):'N/D';
 return '<dl><div><dt>Strike · |Δ put| / |Δ call|</dt><dd>'+esc(local)+'</dd></div>'+
 '<div><dt>Coorte · |Σ Δ put| / |Σ Δ call|</dt><dd>'+esc(total)+'</dd></div></dl>'+
 '<p>'+filled.length+' / '+f.rows.length+' strike con componenti riconciliate al delta netto.</p>';
}
function speedRead(f,raw){
 const unit=typeof f.units?.speed==='string'?f.units.speed.trim():'';
 if(!finite(raw.speed)||!unit)return '<p>Speed locale <b>N/D</b> · '+(!finite(raw.speed)?'dato per strike assente.':'unità nativa assente.')+'</p>';
 const sorted=[...f.rows].sort((a,b)=>a.strike-b.strike),idx=sorted.indexOf(raw),lo=sorted[idx-1],hi=sorted[idx+1];
 const edges=[];
 const changed=(a,b)=>finite(a?.speed)&&finite(b?.speed)&&a.speed!==0&&b.speed!==0&&Math.sign(a.speed)!==Math.sign(b.speed);
 if(changed(lo,raw))edges.push([lo.strike,raw.strike]);
 if(changed(raw,hi))edges.push([raw.strike,hi.strike]);
 if(raw.speed===0&&changed(lo,hi))edges.push([lo.strike,hi.strike]);
 const band=edges.map(([a,b])=>value(a)+'–'+value(b)).join(' · ');
 return '<p>Speed locale <b>'+esc(signed(raw.speed)+' '+unit)+'</b></p>'+
 (edges.length?'<p>Segni opposti tra strike osservati <b>'+esc(band)+'</b> SPX. Il confronto descrive la composizione per strike.</p>':'');
}
function shock(f,row){
 const known=f.perspective==='dealer'&&['inventory','signed_flow'].includes(f.kind);
 const g=known?row.contributions?.gamma:null,c=known?row.contributions?.charm:null;
 let relation='Confronto N/D';
 if(finite(g)&&finite(c)){
  if(g===0&&c===0)relation='Entrambi nulli';
  else if(g===0||c===0)relation=g===0?'Solo charm contribuisce':'Solo gamma contribuisce';
  else relation=Math.sign(g)!==Math.sign(c)?'Pressioni opposte':g>0?'Concordi in acquisto':'Concordi in vendita';
 }
 return '<p class="sd10-pressure"><b>'+relation+'</b><span>Γ '+esc(signed(g))+' · charm '+esc(signed(c))+' ES eq.</span></p>';
}
function neighbors(f,out){
 if(!finite(out.spot)||out.spot<=0)return '<p>Livelli delta N/D · serve uno spot SPX al cutoff.</p>';
 const unit=String(f.units?.delta||'unità n/d');
 const converted=f.perspective==='dealer'&&['inventory','signed_flow'].includes(f.kind)&&finite(f.factors?.delta)&&f.factors.delta>0;
 const metric=f.kind==='inventory'?'stockHedge':'tradeHedge',ncol=converted?3:2;
 const north=out.rows.filter(r=>r.strike>out.spot).sort((a,b)=>a.strike-b.strike).slice(0,3);
 const south=out.rows.filter(r=>r.strike<out.spot).sort((a,b)=>b.strike-a.strike).slice(0,3);
 const groups=[['Sopra spot',north],['Sotto spot',south]].map(([label,rows])=>{
  let html='<tbody><tr class="sd10-group"><th scope="rowgroup" colspan="'+ncol+'">'+label+'</th></tr>';
  for(const r of rows){
   html+='<tr><th scope="row">'+esc(value(r.strike))+' <small>'+esc(signed(r.strike-out.spot))+' pt</small></th>'+
    '<td>'+esc(signed(r.delta))+'</td>'+(converted?'<td>'+esc(hedge(r[metric]))+'</td>':'')+'</tr>';
  }
  return html+(rows.length?'':'<tr><td colspan="'+ncol+'">Nessuno strike nella serie.</td></tr>')+'</tbody>';
 }).join('');
 return '<table><caption>Strike più vicini a SPX '+esc(value(out.spot))+'</caption><thead><tr><th scope="col">SPX / dist.</th><th scope="col">Δ <small>'+esc(unit)+'</small></th>'+
 (converted?'<th scope="col">−Δ '+(f.kind==='inventory'?'stock':'nuovo flusso')+' <small>ES eq.</small></th>':'')+'</tr></thead>'+groups+'</table>';
}
function html(pack,frame,out,row){
 const f=edition(pack,frame,out);
 if(!f||!row||!Array.isArray(f.rows)||!Array.isArray(out.rows))return '';
 const raw=f.rows.find(r=>r.strike===row.strike);if(!raw)return '';
 return '<section class="sd10"><h3>Delta per lato, speed e pressioni</h3><div class="sd10-body">'+
 '<header>Strike SPX <b>'+esc(value(raw.strike))+'</b><time>'+esc(ny.format(f.ts))+' ET</time></header>'+
 ratioRead(f,raw)+speedRead(f,raw)+shock(f,row)+neighbors(f,out)+'</div></section>';
}
w.StrikeDiagnostics=Object.freeze({html});
})(window);

