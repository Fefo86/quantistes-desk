
(function(root){
 'use strict';
 const R=root.ImpliedResearch,Q=root.QuantCore,$=id=>document.getElementById(id),finite=Number.isFinite;
 const fmt=(n,d=4)=>finite(n)?n.toLocaleString('it-IT',{maximumFractionDigits:d,minimumFractionDigits:Math.min(2,d)}):'—';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=n=>finite(n)?fmt(n*100,2)+'%':'—';
 const fact=(n,v)=>'<div><div class="factlabel">'+esc(n)+'</div><div class="factvalue">'+esc(v)+'</div></div>';
 const table=(headers,rows)=>'<table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const fields=[
 ['value','Prezzo Black','pt'],['deltaF','Delta forward','pt/pt F'],['gammaF','Gamma forward','pt/(pt F)²'],['vegaVolPoint','Vega per punto vol','pt/+1 pp IV'],['vegaSpotNorm','Vega normalizzata spot','vega unitario / (spot × √T)'],['vannaFVol','Vanna','∂²V/∂F∂σ'],['vommaVol2','Vomma','∂²V/∂σ²'],['speedF','Speed','∂³V/∂F³'],['zommaF2Vol','Zomma','∂³V/∂F²∂σ'],['ultimaVol3','Ultima','∂³V/∂σ³'],['timePassagePerDay','Theta forward congelato','pt/giorno'],['charmPassagePerDay','Charm','∆ forward/giorno'],['colorPassagePerDay','Color','Γ forward/giorno'],['vetaPassagePerDay','Veta','vega unitario/giorno'],['forwardVol2','Delta · curvatura in IV','∂³V/∂F∂σ²'],['forwardVolPassage','Vanna · decadimento','vanna/giorno'],['forwardPassage2','Charm · decadimento','∆ forward/giorno²'],['snapF','Snap del valore Black','∂⁴V/∂F⁴'],['discountRhoBP','Rho sconto · F fermo','pt/bp tasso continuo'],['discountVeraBP','Vera sconto · F fermo','vega 1 pp IV/bp tasso'],['stickyMoneynessDelta','Delta · smile traslata con F','∂V/∂F a smile σ(K/F) fissa'],['stickyMoneynessGamma','Gamma · smile traslata con F','∂²V/∂F² a smile σ(K/F) fissa'],['elasticity','Elasticità','×'],['dualDeltaBlack','Dual delta Black','∂V/∂K a IV fissa'],['dualGammaBlack','Dual gamma Black','∂²V/∂K² a IV fissa'],['dualDeltaFit','Dual delta CVI','∂V/∂K sulla curva'],['dualGammaFit','Dual gamma CVI','D × densità per punto']
 ];
 const S={r:null,rows:[],all:[],slice:[],cache:new Map(),strip:null,smile:null,p:null,lastBundle:null,plot:[],report:null};
 function visible(){return $('view-implied')?.classList.contains('active');}
 function ready(){const state=root.Desk?.state;return state&&!state.stale&&!state.busy&&state.result?.ws;}
 function reset(){root.QuantistesPlots.cleanGeometry();S.r=null;S.report=null;S.rows=[];S.all=[];S.cache.clear();S.lastBundle=null;$('imContent').hidden=true;$('imExport').disabled=true;$('imContext').textContent='Ricalcola lo snapshot per aggiornare i risultati.';}
 function selectOptions(id,options,value){
   const e=$(id);e.innerHTML=options.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
   if(options.some(([v])=>String(v)===String(value)))e.value=String(value);
 }
 function rawFields(){
   const r=S.r,side=$('imSide').value,old=Number($('imStrike').value);
   S.slice=S.all.filter(o=>o.right===side);
   const picked=S.slice.reduce((b,x)=>Math.abs(x.strike-r.forward.F)<Math.abs(b-r.forward.F)?x.strike:b,Infinity);
   selectOptions('imStrike',S.slice.map(x=>[x.strike,fmt(x.strike,4)]),S.slice.some(x=>x.strike===old)?old:picked);
   const h=new Set();
   for(const o of S.slice)for(const [k,v] of Object.entries(o.raw))if(finite(Q.number(v)))h.add(k);
   const metric=$('imProfile').value||'gammaF';
   selectOptions('imProfile',[...fields.map(([k,l])=>[k,l+' · fit']),...Array.from(h).map(k=>['raw:'+k,k+' · CSV'])],metric);
 }
 function source(result){
   const state=root.Desk.state,m=result.ws.model;
   S.r=result;S.selected=null;S.cache.clear();S.lastBundle=null;S.all=R.records(state.files,result.cfg,$('ivUnit')?.value||'auto');
   S.smile=R.smiles(result);const q=S.smile;renderGeometry(result);
   $('imContext').textContent=result.cfg.symbol+' · '+result.cfg.asof+' ET → '+result.cfg.expiry+' '+result.cfg.expiryTime+' ET · F '+fmt(m.F,2)+' · '+(result.cfg.quoteSource==='mid'?'bid/ask':'prezzi sintetici da IV')+(result.cfg.overrideHours>0?' · tempo residuo imposto':'')+' · '+(result.quality?.label||'');
   const asof=Q.nyEpoch(result.cfg.asof),snap=S.all.filter(o=>o.spot>0&&o.spotTime&&Q.nyEpoch(o.spotTime)<=asof).sort((a,b)=>Q.nyEpoch(b.spotTime)-Q.nyEpoch(a.spotTime))[0];
   const fresh=snap&&result.cfg.maxAge>0&&(asof-Q.nyEpoch(snap.spotTime))/1000<=result.cfg.maxAge;
   $('imSmileFacts').innerHTML=[fact('IV ATM forward',pct(q.atm)),fact('IV allo spot cash corrente',fresh?pct(R.vol(m,result.T,snap.spot)):'n.d. · spot assente o obsoleto'),fact('Straddle ATM · punti',fmt(q.atmStraddle)),fact('Premio straddle ATM forward / spot',fresh?pct(q.atmStraddle/snap.spot):'n.d. · spot assente o obsoleto'),fact('Varianza totale ATM',fmt(q.atmTotal,9)),fact('∂σ/∂log(K/F)',fmt(q.ivSlope,6)),fact('∂w/∂log(K/F)',fmt(q.varianceSlope,9)),fact('∂²w/∂log(K/F)²',fmt(q.varianceCurve,9))].join('');
   $('imRR').innerHTML=q.rows.map(x=>'<tr>'+[(x.delta*100).toFixed(0),fmt(x.put.strike,2),pct(x.put.iv),fmt(x.call.strike,2),pct(x.call.iv),finite(x.rr)?fmt(x.rr*100,3):'—',finite(x.bf)?fmt(x.bf*100,3):'—',x.covered?'Entrambi':x.call.roots===1&&x.put.roots===1?'Ala extrapolata':'Radici '+x.put.roots+' / '+x.call.roots].map(t=>'<td>'+esc(t)+'</td>').join('')+'</tr>').join('');
   $('imLo').value=Number(m.quantile(.05).toPrecision(10));$('imHi').value=Number(m.quantile(.95).toPrecision(10));
   S.wings=result.ws.nativeLiquid.map(k=>R.wing(result,k));
   $('imWings').innerHTML=table(['Bordo del fit','Strike','w','∂w/∂k','∂²w/∂k²','Fit − mid (pt)'],S.wings.map((a,i)=>[i===0?'Sinistro':'Destro',fmt(result.ws.nativeLiquid[i],2),fmt(a?.w,8),fmt(a?.wk,8),fmt(a?.wkk,8),fmt(a?.quoteFitError,5)]));
   $('imSpecVerified').checked=false;benchmarks();
   rawFields();updateStrip();showProfile();$('imContent').hidden=false;$('imExport').disabled=false;
 }
 function benchmarks(){
   if(!S.r)return;const b=R.sameExpiryPayoffs(S.r,S.all,$('imSpecVerified').checked),h=b.hedge;S.bench=b;
   $('imHedge').textContent=h?(h.canonicalEligible?'Put 95% spot a tre mesi':'Put 95% spot · scadenza selezionata')+' · K '+fmt(h.K,3)+' · spot '+fmt(h.spot,2)+' al '+h.spotTime+' ET · premio '+fmt(h.price,4)+' pt ('+fmt(h.costPct,4)+'% spot) · bid/ask allo strike esatto '+fmt(h.bid)+' / '+fmt(h.ask)+' · vega per punto vol '+fmt(h.vegaVolPoint,4)+' · theta forward per giorno '+fmt(h.thetaForwardDay,4)+' · '+(h.inQuotedRange?'strike nel dominio quotato':'strike in extrapolazione')+'. Data contrattuale 3M richiesta '+b.threeMonths+'.':'Put 95% spot indisponibile. Servono spot contemporaneo e positivo, curva bid/ask con prezzi compatibili con le quote e tempo contrattuale. La put a tre mesi richiede la scadenza del '+b.threeMonths+'.';
   $('imVix').textContent=finite(b.vixVariance)?'Varianza Q del settlement VIX '+fmt(b.vixVariance,5)+' punti VIX².':b.vixSource?'Per calcolare Var_Q(VIX_T) servono curva verificata da bid/ask e conferma del settlement VIX.':'Var_Q(VIX_T) richiede opzioni sul settlement VIX e il relativo forward. La scadenza attiva è '+S.r.cfg.symbol+'.';
 }
 function updateStrip(){
   const r=S.r;if(!r)return;
   const l=$('imLo').valueAsNumber,u=$('imHi').valueAsNumber;
   if(!(l>0&&u>l)){S.strip=null;$('imStripValue').textContent='Inserisci due soglie positive ordinate.';$('imExport').disabled=true;return;}
   const t=R.strip(r,l,u),z=t.market;S.strip=t;
   $('imStripFacts').innerHTML=[fact('Log-contract integrato',fmt(t.total,9)),fact('Tasso annualizzato',fmt(t.annualRate,6)),fact('Vol equivalente',pct(t.volEq)),fact('Contributo put / call',fmt(t.down,9)+' / '+fmt(t.up,9)),fact('Contributo oltre gli strike usati',t.total>0?pct(t.beyondLiquid/t.total):'—'),fact('Scarto strip vs −2 E[log(S/F)]',t.replicationDifference.toExponential(2))].join('');
   const wingNames={mass:'Massa',logContract:'Log-contract −2 log(S/F)',putATM:'Put ATM in punti',callATM:'Call ATM in punti'};
   $('imWingShare').innerHTML=table(['Payoff','Quota assoluta nelle ali','Contributo sinistro firmato','Contributo destro firmato'],Object.entries(t.wingShares).map(([k,z])=>[wingNames[k],pct(z.share),fmt(z.leftSigned,8),fmt(z.rightSigned,8)]));
   $('imStripValue').textContent='Intervallo '+fmt(l,2)+' – '+fmt(u,2)+' · contributo '+fmt(t.corridorValue,9)+' · '+pct(t.total>0?t.corridorValue/t.total:NaN)+' della strip.';
   $('imMarket').innerHTML=z?table(['Griglia osservata','Bid','Mid','Ask','Fit sugli stessi nodi'],[['2 × strip / D',fmt(z.bid,9),fmt(z.mid,9),fmt(z.ask,9),fmt(z.fit,9)],['Segmenti '+z.segments,'Put '+(z.putRange||[]).map(k=>fmt(k,0)).join('–'),'Call '+(z.callRange||[]).map(k=>fmt(k,0)).join('–'),'','']]):'<p class="smalltext muted">Bid/ask osservati insufficienti per la quadratura di mercato.</p>';
   $('imExport').disabled=false;premium(true);
 }
 function premium(force=false){
   if(!S.r||!S.strip)return;
   const live=root.DistributionUI?.getState(),b=live?.valid&&live.result===S.r&&live.bundle?.settings.coordinate==='native'?live.bundle:null;
   if(!force&&b===S.lastBundle)return;S.lastBundle=b;
   S.p=R.payoffComparison(S.r,b?.p);const q=S.strip.reference,p=S.p;
   $('imPremiumSource').textContent='Q nativa della scadenza. '+(p?'P · '+p.provenance:(!b?'Seleziona e applica una P in coordinate native per il confronto.':'P indisponibile per la configurazione corrente.'));
   const rows=[['Media log-return','logMean'],['Varianza centrale del log-return','logVariance'],['Skewness log-return','logSkew'],['Curtosi in eccesso log-return','logExcess'],['Secondo momento E[R²]','logSecond'],['Semivarianza E[min(R,0)²]','downside'],['Semivarianza E[max(R,0)²]','upside'],['E[S/F − 1]','linearExpected'],['Payoff log −2E[R]','logContract'],['Put ATM · payoff medio in punti','forwardPut'],['Call ATM · payoff medio in punti','forwardCall']];
   $('imTerminal').innerHTML=table(['Misura','Q','P','Q − P'],rows.map(([label,k])=>[label,fmt(q[k],8),fmt(p?.[k],8),fmt(p?q[k]-p[k]:null,8)]));
   renderMove(b?.p);if(S.selected)showTrade();
 }
  function renderMove(physical){
  const g=S.geometry;if(!g)return;
  S.pMove=physical?.coordinate==='native'?root.NativeFeatures.move(g.F,fn=>physical.expect(fn)):null;
  const row=(l,m)=>[l,fmt(m?.mean,3),fmt(m?.meanMove,3),fmt(m?.sd,3),fmt(m?.rms,3)];
  $('gfMoves').innerHTML=table(['Legge in prezzo','Media · pt','Media − F · pt','SD · pt','EM RMS da F · pt'],[row('Q nativa',g.qMove),row(physical?'P · '+physical.status:'P indisponibile',S.pMove)]);
 }
 function renderGeometry(r){
  const g=root.NativeFeatures.geometry(r);S.geometry=g;S.pMove=null;
  $('gfMeta').textContent='Strike liquidi '+fmt(g.liquid[0],2)+' – '+fmt(g.liquid[1],2)+' · '+g.valid+'/'+g.grid+' valori wₖₖ utilizzabili · griglia fine di '+g.subdivisions+' intervalli per tratto · passo massimo '+fmt(g.maxPriceStep,3)+' pt / '+fmt(g.maxLogStep,7)+' log(K/F).';
  $('gfFeatures').innerHTML=table(['Candidato','Strike','k','wₖₖ','Due griglie'],[...g.pivots.map(v=>['Pivot '+(v.leftSign>0?'+ → −':'− → +'),fmt(v.K,3),fmt(v.k,6),'0',v.coarseMatch?'Concordi':'Solo fine']),...g.extrema.map(v=>[v.type,fmt(v.K,3),fmt(v.k,6),fmt(v.v,7),v.coarseMatch?'Concordi':'Solo fine'])]);
  $('gfRanges').innerHTML=table(['Estremo rilevato sul dominio','Strike','wₖₖ'],g.global.map((a,i)=>[i?'Massimo':'Minimo',fmt(a.K,3),fmt(a.v,7)]));
  $('gfSaddleNote').textContent='Selle Q in log-return · '+g.saddles.length+' candidati con entrambi i modi nel dominio liquido. Profili di sensibilità verificabili: '+g.profiles+'.';
  $('gfSaddles').innerHTML=g.saddles.length?table(['Strike minimo o plateau','log(S/F)','Picco sinistro / destro · K','Profondità','Riscontri','Strike nei profili concordi'],g.saddles.map(a=>[a.lo===a.hi?fmt(a.K,3):fmt(a.lo,3)+' – '+fmt(a.hi,3),fmt(a.logReturn,6),fmt(a.leftMode,2)+' / '+fmt(a.rightMode,2),pct(a.depth),a.matched.length+' / '+a.profiles,a.matched.length?fmt(Math.min(...a.matched.map(v=>v.K)),2)+' – '+fmt(Math.max(...a.matched.map(v=>v.K)),2):'—'])):'';
  root.QuantistesPlots.geometry(r,g);
 }

 function normalize(g){if(g)g.vegaSpotNorm=S.bench?.spot>0?g.vegaUnit/(S.bench.spot*Math.sqrt(S.r.T)):null;return g;}
 function risk(row){
   const key=row.right+'|'+row.strike;
   if(!S.cache.has(key))S.cache.set(key,normalize(R.contract(S.r,row.strike,row.right,0,0)));
   return S.cache.get(key);
 }
 function profileValue(o,kind){
   return kind.startsWith('raw:')?Q.number(o.raw[kind.slice(4)]):risk(o)?.[kind];
 }
 function showProfile(){
   if(!S.r)return;
   const kind=$('imProfile').value;
   S.plot=S.slice.map((o,i)=>({K:o.strike,v:profileValue(o,kind),index:i})).filter(z=>finite(z.v));
   const p=S.plot,box=$('imChart');if(p.length<2){box.innerHTML='Profilo non disponibile.';showContract();return;}
   const W=Math.max(310,QuantistesPlots.width(box,900)),H=W<500?330:415,A=W<500?64:84,B=W-23,T=32,Y=H-47,left=p[0].K,right=p.at(-1).K;
   let low=Math.min(...p.map(v=>v.v)),high=Math.max(...p.map(v=>v.v));
   if(low===high){const gap=Math.max(Math.abs(low)*.02,1e-8);low-=gap;high+=gap;}
   const X=k=>A+(k-left)/(right-left)*(B-A),y=v=>Y-(v-low)/(high-low)*(Y-T);
   const small=(x,v,l,anc)=>'<text x="'+x+'" y="'+v+'" text-anchor="'+anc+'" fill="#99b2ca" font-size="11">'+esc(l)+'</text>';
   let s='<svg font-family="Consolas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Profilo per strike a scadenza">';
   for(let j=0;j<=3;j++){const v=low+(high-low)*j/3,yy=y(v);s+='<path d="M'+A+' '+yy+'H'+B+'" stroke="#172f46"/>'+small(A-6,yy+4,Math.abs(v)<.01&&v!==0?v.toExponential(2):fmt(v,2),'end');}
   for(let j=0;j<=4;j++){const k=left+(right-left)*j/4;s+=small(X(k),Y+19,fmt(k,1),'middle');}
   const fragments=[];for(let i=0;i<p.length;i++){const newPath=i===0||p[i].index!==p[i-1].index+1;fragments.push((newPath?'M':'L')+X(p[i].K).toFixed(3)+' '+y(p[i].v).toFixed(3));}
   const current=Number($('imStrike').value);s+=small(A,17,$('imProfile').selectedOptions?.[0]?.textContent||kind,'start');
   if(current>=left&&current<=right)s+='<path d="M'+X(current)+' '+T+'V'+Y+'" stroke="#c1d3e3" stroke-dasharray="3 3"/>';
   s+='<path fill="none" stroke="'+(kind.startsWith('raw:')?'#87cbe6':'#87b5ff')+'" stroke-width="2" d="'+fragments.join(' ')+'"/><g id="stImProbe"></g></svg>';box.innerHTML=s;
   box.onpointermove=e=>{const rect=box.querySelector('svg').getBoundingClientRect();if(!rect.width)return;const k=left+((e.clientX-rect.left)/rect.width*W-A)/(B-A)*(right-left),z=p.reduce((a,b)=>Math.abs(b.K-k)<Math.abs(a.K-k)?b:a,p[0]),xx=X(z.K),yy=y(z.v),out=$('stImRead');if(out)out.textContent='Strike '+fmt(z.K,2)+' · '+($('imProfile').selectedOptions?.[0]?.textContent||kind)+' '+fmt(z.v,7)+' · '+$('imSide').value+'. Clic per selezionare il contratto.';const marker=$('stImProbe');if(marker)marker.innerHTML='<path d="M'+xx+' '+T+'V'+Y+'M'+A+' '+yy+'H'+B+'" stroke="#7eace6" stroke-dasharray="3 4" fill="none"/><circle cx="'+xx+'" cy="'+yy+'" r="4" fill="#a0c3f4"/>';};

   box.onpointerdown=e=>{const rect=box.querySelector('svg').getBoundingClientRect();if(!rect.width)return;const k=left+((e.clientX-rect.left)/rect.width*W-A)/(B-A)*(right-left);const z=p.reduce((a,v)=>Math.abs(v.K-k)<Math.abs(a.K-k)?v:a,p[0]);$('imStrike').value=String(z.K);showProfile();};
   box.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const input=$('imStrike');input.selectedIndex=Math.max(0,Math.min(input.options.length-1,input.selectedIndex+(e.key==='ArrowRight'?1:-1)));showProfile();};
   showContract();
 }
 function showTrade(){
   const trade=R.trade(S.r,S.selected.row,S.lastBundle?.p);S.selected.trade=trade;
   $('imTrade').innerHTML=trade?table(['Al fixing','Premio ingresso','Pareggio','E[P&L] Q · pt','E[P&L] P · pt','Pr(utile) Q','Pr(utile) P'],trade.map(t=>[t.position,fmt(t.cost),fmt(t.breakEven),fmt(t.qNet,5),fmt(t.pNet,5),pct(t.qWin),pct(t.pWin)])):'Bid/ask datati e validi richiesti per stimare il risultato al fixing.';
 }
 function showContract(){
   const row=S.slice.find(o=>o.strike===Number($('imStrike').value));if(!row)return;
   const kind=$('imProfile').value,iv=$('imShockV').valueAsNumber,df=$('imShockF').valueAsNumber;
   const output=normalize(R.contract(S.r,row.strike,row.right,df,iv));S.selected={row,computed:output};showTrade();
   const v=profileValue(row,kind);
   $('imProbe').textContent=row.right+' '+fmt(row.strike,2)+'  ·  '+$('imProfile').options[$('imProfile').selectedIndex]?.textContent+'  '+fmt(v,8);
   const age=row.time?(Q.nyEpoch(S.r.cfg.asof)-Q.nyEpoch(row.time))/1000:null;
   $('imQuote').textContent='Bid '+fmt(row.bid)+' / ask '+fmt(row.ask)+' · '+(row.time||'timestamp assente')+' ET · età '+fmt(age,1)+' s'+(row.futureSpotRemoved?' · timestamp del sottostante successivo allo snapshot, spot escluso dal fit':'')+' · origine '+row.file+' riga '+row.sourceRow+'.';
   $('imRaw').innerHTML=table(['Campo ThetaData originale','Valore CSV'],Object.entries(row.raw));
   $('imGreeks').innerHTML=output?table(['Greca del fit al contratto','Valore','Unità o convenzione'],fields.map(([key,label,unit])=>[label,fmt(output[key],9),unit])):'IV positiva non identificata allo strike selezionato. Sono disponibili i campi originali.';
   const s=output?.shock;
   $('imShockResult').textContent=s&&finite(s.pnl)?'Smile fissa allo strike · prezzo '+fmt(s.price,4)+' pt  ·  Δ premio '+fmt(s.pnl,4)+' pt  ·  Taylor di secondo ordine '+fmt(s.quadratic,4)+' pt  ·  residuo '+fmt(s.residual,5)+' pt. Smile fissa in K/F · prezzo '+fmt(s.smilePrice,4)+' pt · Δ premio '+fmt(s.smilePnL,4)+' pt.':'Shock indisponibile. Verifica IV, variazione del forward e strike.';
 }
 function refresh(){
   if(!visible())return;
   if(!ready()){reset();return;}
   try{
     const r=root.Desk.state.result;
     if(S.r!==r)source(r);
     else premium();
   }catch(e){reset();$('imContext').textContent=e.message;}
 }
 function later(){setTimeout(refresh,0);}
 $('imSpecVerified').onchange=benchmarks;
 $('imSide').onchange=()=>{if(S.r){rawFields();showProfile();}};
 $('imStrike').onchange=showProfile;$('imProfile').onchange=showProfile;
 $('imRange').onclick=updateStrip;for(const id of ['imLo','imHi'])$(id).oninput=()=>{S.strip=null;$('imStripValue').textContent='Applica i nuovi limiti.';$('imExport').disabled=true;};
 for(const id of ['imShockF','imShockV'])$(id).oninput=()=>{if(S.r)showContract();};
 $('imExport').onclick=()=>{
   if(!ready()||!S.strip||S.r!==root.Desk.state.result)return;
   premium(true);
   const report={module:'ImpliedResearch/1',sourceFiles:root.Desk.state.files.map(f=>f.name),snapshot:S.r.cfg.asof,expiry:S.r.cfg.expiry+'T'+S.r.cfg.expiryTime,clock:S.r.T,quoteSource:S.r.cfg.quoteSource,quality:S.r.quality?.level,model:'CVI mark',fingerprint:S.r.ws.model.cvi.certificate.fingerprint,smile:S.smile,wings:S.wings,nativeGeometry:S.geometry,physicalMove:S.pMove,conditionalBenchmarks:S.bench,strip:S.strip,pTerminal:S.p,contract:S.selected,units:'Integrated log payoff in decimal units. RR/BF as decimal IV; quote prices and contract P&L in index points.'};
   const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));link.href=url;link.download='Quantistes_metriche_implicite_'+S.r.cfg.expiry+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 };
 root.addEventListener('quantistes:distribution',later);
 root.ImpliedScreen={refresh:later,reset};
})(globalThis);

