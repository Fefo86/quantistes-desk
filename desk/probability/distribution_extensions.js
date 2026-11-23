
/* Quantistes terminal risk and scenario extensions. No refitting of options. */
(function(){'use strict';
const $=id=>document.getElementById(id),fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—',pct=v=>Number.isFinite(v)?(100*v).toFixed(2)+'%':'—';
let current=null,revision=0;
const cell=v=>'<td class="num">'+v+'</td>';
function render(detail){
 current=detail;revision++;const {bundle:b,result:r,reference:ref}=detail,container=$('pdExtensions');if(!container||!b||!r)return;
 const levels=[...(r.ippo?.levels||[]),...(r.ws?.levels||[])].sort((a,b)=>a.price-b.price||a.family.localeCompare(b.family));
 const horizon=(b.settings.coordinate==='native'?r.cfg.expiry+'T'+r.cfg.expiryTime:r.cfg.target).replace('T',' ');
 let html='<div class="card"><div class="cardhead"><div><h2>Probabilità sui tuoi livelli</h2><div class="smalltext muted">Le soglie IPPO e Wall Street originali, interrogate sulla distribuzione selezionata.</div></div><span class="badge neutral">SOLO EVENTI TERMINALI</span></div>'+"<details class=\"tool-help\" id=\"uso-probabilita-sui-tuoi-livelli\" data-tool-guide=\"probabilita-sui-tuoi-livelli\"><summary>Guida operativa</summary><div class=\"tool-help-content\"><b>Interrogare Q e P sulle soglie del desk</b><dl><dt>Dati</dt><dd>Livelli IPPO/Wall Street e distribuzioni con orizzonte dichiarato.</dd><dt>Come usarlo</dt><dd>Individua la riga del tuo livello e leggi le colonne sopra/sotto. Verifica che il target dei livelli coincida con quello della probabilità utilizzata.</dd><dt>Come leggerlo</dt><dd>Se i target differiscono, il calcolo applica lo stesso prezzo numerico a una data diversa. La linea 0σ può avere cumulata diversa dal 50%.</dd></dl></div></details>"+'<div class="cardbody smalltext muted">Probabilità riferite al prezzo a '+horizon+' ET. I livelli restano quelli del target del desk: '+r.cfg.target.replace('T',' ')+' ET. Se gli orizzonti differiscono, questa tabella valuta soltanto gli stessi prezzi numerici alla scadenza indicata. Il livello 0σ è il riferimento, non necessariamente il quantile 50%.</div><div class="tablewrap" style="max-height:430px"><table><thead><tr><th>Famiglia · livello</th><th class="num">Prezzo SPX</th><th class="num">Q sotto</th><th class="num">Q sopra</th><th class="num">P sotto¹</th><th class="num">P sopra¹</th></tr></thead><tbody>';
 for(const l of levels){const q=b.q.cdf(l.price),p=b.p?b.p.cdf(l.price):NaN;html+='<tr><td>'+(l.family==='Ippo'?'IPPO':'Wall Street')+' · '+(l.z>0?'+':'')+l.z+'σ</td>'+cell(fmt(l.price))+cell(pct(q))+cell(pct(b.q.survival(l.price)))+cell(pct(p))+cell(pct(b.p?.survival(l.price)))+'</tr>';}
 html+='</tbody></table></div><div class="cardbody smalltext muted">¹ '+(b.p?b.p.provenance:b.diagnostics.pReason)+' “Sopra” e “sotto” indicano dove termina il prezzo; non la probabilità di reazione, breakout o inversione.</div></div>';
 html+='<div class="card"><div class="cardhead"><div><h2>Rischio terminale · long e short</h2><div class="smalltext muted">VaR ed Expected Shortfall in punti SPX, rispetto al riferimento '+fmt(ref)+'.</div></div><span class="badge neutral">SENZA COSTI · SENZA STOP</span></div>'+"<details class=\"tool-help\" id=\"uso-rischio-terminale-long-e-short\" data-tool-guide=\"rischio-terminale-long-e-short\"><summary>Guida operativa</summary><div class=\"tool-help-content\"><b>Calcolare VaR ed ES sul prezzo finale</b><dl><dt>Dati</dt><dd>Riferimento di prezzo, direzione e misura Q o P.</dd><dt>Come usarlo</dt><dd>Per una posizione long leggi la coda inferiore; per una short leggi quella superiore. Confronta VaR alla confidenza scelta con ES nella coda peggiore.</dd><dt>Come leggerlo</dt><dd>Le unità sono punti SPX e riguardano la perdita relativa al riferimento. Moltiplicatore, size, costi ed escursioni intraday richiedono trattazione separata.</dd></dl></div></details>"+'<div class="tablewrap"><table><thead><tr><th>Misura · confidenza</th><th class="num">Long VaR</th><th class="num">Long ES</th><th class="num">Short VaR</th><th class="num">Short ES</th></tr></thead><tbody>';
 for(const [name,d]of[['Q',b.q],[b.p?.status==='empirical_pit'?'P storica':'P scenario',b.p]].filter(([,d])=>d))for(const confidence of [.90,.95,.99]){
  const a=1-confidence,lo=d.quantile(a),hi=d.quantile(confidence);
  const low=d.integrate(x=>x,d.support[0],lo)/a,high=d.integrate(x=>x,hi,d.support[1])/a;
  html+='<tr><td>'+name+' · '+pct(confidence)+'</td>'+cell(fmt(ref-lo))+cell(fmt(ref-low))+cell(fmt(hi-ref))+cell(fmt(high-ref))+'</tr>';
 }
 html+='</tbody></table></div><div class="cardbody smalltext muted">Long: perdita L = riferimento − S<sub>T</sub>. Short: L = S<sub>T</sub> − riferimento. ES = perdita media nella coda peggiore; un numero negativo rappresenta un guadagno. Queste misure riguardano solo il valore finale e non includono escursioni intraday. Q misura il rischio sotto i prezzi degli stati; La misura fisica dipende dal modello P attivo.</div></div>';
 container.innerHTML=html;
}
window.addEventListener('quantistes:distribution',e=>render(e.detail));
function report(){
 if(!current?.bundle)return null;
 const {bundle:b,result:r,reference:ref}=current;
 const levels=[...(r.ippo?.levels||[]),...(r.ws?.levels||[])].map(l=>({family:l.family,sigma:l.z,price:l.price,qBelow:b.q.cdf(l.price),qAbove:b.q.survival(l.price),pBelow:b.p?b.p.cdf(l.price):null,pAbove:b.p?b.p.survival(l.price):null}));
 const terminalRisk=[];
 for(const [measure,d]of[['Q',b.q],[b.diagnostics.pCalibration,b.p]].filter(([,d])=>d))for(const confidence of [.90,.95,.99]){const a=1-confidence,lo=d.quantile(a),hi=d.quantile(confidence);terminalRisk.push({measure,confidence,longVaR:ref-lo,longES:ref-d.integrate(x=>x,d.support[0],lo)/a,shortVaR:hi-ref,shortES:d.integrate(x=>x,hi,d.support[1])/a-ref});}
 return{reference:ref,unit:'SPX index points',pCalibration:b.diagnostics.pCalibration,levelTarget:r.cfg.target,probabilityTarget:b.diagnostics.target,levels,terminalRisk};
}
window.DistributionExtensions={render,report,invalidate(){current=null;revision++;const x=$('pdExtensions');if(x)x.innerHTML='';}};
})();

