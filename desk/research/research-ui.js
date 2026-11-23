(function(root){
'use strict';
const $=id=>document.getElementById(id),Q=root.QuantCore,R=root.ResearchMath,V=root.SurfaceResearch;
const esc=x=>String(x??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
const f=(v,n=3)=>Number.isFinite(v)?v.toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—',pc=(v,n=2)=>Number.isFinite(v)?f(v*100,n)+'%':'—';
const txt=(id,s)=>{$(id).textContent=s;},html=(id,s)=>{$(id).innerHTML=s;};
const table=(heads,rows)=>'<div class="tablewrap"><table><thead><tr>'+heads.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const state=()=>root.DistributionUI.getState();
function valid(){const s=state();if(!s.valid||!s.result?.ws||s.bundle?.diagnostics.quality==='red')throw Error('Aggiorna il desk con un fit utilizzabile.');return s;}
function native(){const s=valid();if(s.bundle.settings.coordinate!=='native'||s.bundle.diagnostics.synthetic||s.result.cfg.overrideHours>0)throw Error('Seleziona Q cash nativa con bid/ask e orologio osservato.');return s;}
function method(p){return !p?'P indisponibile':p.status==='empirical_pit'?'P storica':Number.isFinite(p.tilt?.gamma)?'P scenario CRRA':'P scenario momenti';}
let surface=null,lastResult=null,generation=0;
const reports=new Map(),sections={rsSurfaceOut:'surface',rsInterpolation:'interpolation',rsEventOut:'event',rsDynamicsOut:'dynamics',rsLawsOut:'laws',rsStrategyOut:'strategy'};
function attach(key,data){const r=valid().result;reports.set(key,{config:{...r.cfg},quality:r.quality?.level,files:root.Desk.state.files.map(v=>v.name),data});}
function invalidateOutput(id){reports.delete(sections[id]);txt(id,'');}
function saveScope(keys){const parts=Object.fromEntries(keys.filter(k=>reports.has(k)).map(k=>[k,reports.get(k)]));if(!Object.keys(parts).length)throw Error('Calcola prima almeno un risultato corrente.');
 const blob=new Blob([JSON.stringify({format:'quantistes-native-research-v1',sections:parts},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Quantistes_'+keys[0]+'_'+valid().result.cfg.expiry+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const outputs=['rsSurfaceOut','rsDynamicsOut','rsInterpolation','rsEventOut','rsStrategyOut','rsLawsOut'];
function reset(all){if(all){generation++;surface=null;lastResult=null;}for(const id of all?outputs:['rsStrategyOut','rsLawsOut'])invalidateOutput(id);}
root.addEventListener('quantistes:research-stale',e=>reset(e.detail?.all===true));
root.addEventListener('quantistes:distribution',e=>{
 const s=e.detail;if(s.result!==lastResult){reset(true);lastResult=s.result;const m=s.result?.ws?.model;
 if(m){const strikes=m.fitted.map(z=>z.K);if(strikes.length){const nearest=strikes.reduce((a,b)=>Math.abs(a-m.F)<Math.abs(b-m.F)?a:b);for(let i=0;i<4;i++)$('rsK'+i).value=String(nearest);}}
 }else reset(false);
});
function action(id,out,fn){$(id).onclick=async()=>{const button=$(id);button.disabled=true;reports.delete(sections[out]);try{await fn();}catch(e){txt(out,e.message);}finally{button.disabled=false;}};}
function clearOn(ids,dest){ids.forEach(id=>$(id).addEventListener('input',()=>invalidateOutput(dest)));}
action('rsLaws','rsLawsOut',()=>{
 const s=native(),b=s.bundle,coord=$('rsHDCoord').value,unit=coord==='return'?'log-rendimento':'prezzo',show=v=>coord==='return'?pc(v,3):f(v,2),calc=R.lawMetrics(b,+$('rsHD').value,coord),bands=a=>a.ranges.map(([lo,hi])=>show(lo)+' – '+show(hi)).join('  ∪  ');
 let out=table(['Misura','Regione di massima densità · '+unit,'Massa integrata','Precisione'],[[ 'Q',bands(calc.qHD),pc(calc.qHD.actual,4),calc.qHD.resolved?'raggiunta':'soglia numerica o plateau'],...(calc.pHD?[[method(b.p),bands(calc.pHD),pc(calc.pHD.actual,4),calc.pHD.resolved?'raggiunta':'soglia numerica o plateau']]:[])]);
 if(b.p){out+=table(['Metrica · '+method(b.p),'Valore'],[['Jensen–Shannon · nat',f(calc.js,7)],['KL(P‖Q) · nat',f(calc.kl,7)],['Wasserstein W1 · punti',f(calc.w1)],['Wasserstein W2 · punti',f(calc.w2)],['Scarto W2 su 48 / 96 nodi · punti',f(calc.w2Delta,5)],['W1 condizionata sotto il 5° percentile di P · punti',f(calc.w1left)],['Soglia del 5° percentile P · punti',f(calc.threshold,2)],['Massa coda sinistra Q / P',pc(calc.qTail,4)+' / '+pc(calc.pTail,4)],['Q − P alla soglia fisica · punti percentuali',f(100*(calc.qTail-calc.pTail),4)],['Q/P per S ≤ '+f(calc.threshold,2),f(calc.ratio,5)],...calc.quantileGaps.map(z=>['Quantile '+pc(z.u,0)+' · differenza log-rendimenti Q − P',pc(z.gap,4)]),['Entropia differenziale Q − P · log-rendimento, nat',f(calc.entropyGap,6)],['Skewness Q − P · log-rendimento',f(calc.skewPremium,5)],['Curtosi in eccesso Q − P · log-rendimento',f(calc.kurtPremium,5)],['log(q/p) al forward',f(calc.logKernelAtForward,6)],['Derivata locale ∂k log(q/p)',f(calc.slope,4)],['Curvatura locale ∂²k log(q/p)',f(calc.curvature,3)]]);}
 else out+='<p>'+esc(b.diagnostics.pReason||'P assente. Per i confronti serve una P storica o uno scenario esplicito.')+'</p>';
 out+='<p>HDI nella coordinata selezionata. W1 e W2 usano il prezzo sulla finestra di quadratura. Derivate locali per passo 0,001 in log-moneyness. Per P scenario tutte le differenze dipendono dai parametri scelti.</p>';attach('laws',{coordinateHDI:coord,reference:s.reference,provenance:b.diagnostics.pCalibration,physicalSettings:b.settings,...calc});html('rsLawsOut',out);
});
clearOn(['rsHD','rsHDCoord'],'rsLawsOut');
action('rsStrategy','rsStrategyOut',()=>{
 const s=native(),r=s.result,cfg=r.cfg,issue=root.DistributionCore.sourceFailure(r,s.bundle.settings);if(issue)throw Error(issue);
 const rows=Q.selectSnapshot(s.rows.filter(z=>z.symbol===cfg.symbol&&z.expiry===cfg.expiry&&z.time),cfg).rows,now=Q.nyEpoch(cfg.asof),legs=[];
 for(let i=0;i<4;i++){const n=$('rsN'+i).valueAsNumber;if(n===0)continue;const K=$('rsK'+i).valueAsNumber,side=$('rsSide'+i).value;
 const row=rows.find(z=>z.strike===K&&z.right===side);if(!row)throw Error('Gamba '+(i+1)+': strike o lato assente dalla chain.');
 const age=(now-Q.nyEpoch(row.time))/1000;if(!(age>=0&&age<=cfg.maxAge&&row.bid>=0&&row.ask>0&&row.ask>=row.bid&&(n>0||row.bid>0)))throw Error('Gamba '+(i+1)+': bid/ask o età non utilizzabili.');
 legs.push({K,n,side,price:n>0?row.ask:row.bid,bid:row.bid,ask:row.ask,time:row.time,age});}
 const mult=$('rsMultiplier').valueAsNumber,fee=$('rsFee').valueAsNumber,st=R.prepareStrategy(legs,r.forward.D,fee,mult),b=s.bundle;
 let out=table(['Q.tà','Tipo','Strike','Bid / ask','Premio impiegato','Quote ET','Età s'],legs.map(l=>[l.n,l.side,f(l.K,2),f(l.bid,2)+' / '+f(l.ask,2),f(l.price,2),l.time,f(l.age,2)]));
 out+='<p>Premio netto iniziale '+f(st.paid*mult,2)+' USD · commissioni '+f(st.fees*mult,2)+' USD · costo totale al fixing '+f(st.carry*mult,2)+' USD.</p>';
 const details=[];out+=table(['Misura','P&L medio USD','Utile','Perdita','Pari','VaR perdita 95% USD','ES perdita 95% USD','Min / max USD nella finestra'],[b.q,b.p].filter(Boolean).map(d=>{const z=R.strategyRisk(d,st);details.push({measure:d===b.q?'Q':method(d),...z});return[d===b.q?'Q implicita':method(d),f(z.expected*mult,2),pc(z.probWin),pc(z.probLoss),pc(z.probFlat),f(z.var95*mult,2),f(z.es95*mult,2),f(z.minOnSupport*mult,2)+' / '+f(z.maxOnSupport*mult,2)];}));
 out+='<p>VaR è il quantile inferiore della perdita; ES integra la frazione necessaria di un eventuale atomo. I tratti a payoff costante possono concentrare probabilità su un solo valore. Gli estremi descrivono la finestra numerica del report. Un payoff può proseguire oltre tale finestra. Il moltiplicatore e i costi sono ipotesi modificabili.</p>';attach('strategy',{legs,multiplier:mult,feePerContractUSD:fee,netPremiumPoints:st.paid,carriedCostPoints:st.carry,physicalSettings:b.settings,resultsInPoints:details});html('rsStrategyOut',out);
});
clearOn(['rsMultiplier','rsFee',...[0,1,2,3].flatMap(i=>['rsK'+i,'rsSide'+i,'rsN'+i])],'rsStrategyOut');
const candidates=(s,expiry,asof)=>s.rows.filter(z=>z.symbol===s.result.cfg.symbol&&z.expiry===expiry&&z.time&&z.time.slice(0,10)===asof.slice(0,10)&&Q.nyEpoch(z.time)<=Q.nyEpoch(asof));
function checked(r){if(!r?.ws||r.quality?.level==='red')throw Error(r?.errors?.ws||'Fit non utilizzabile.');const issue=root.DistributionCore.sourceFailure(r,{coordinate:'native'});if(issue)throw Error(issue);return r;}
function starting(){const s=native();if(s.result.cfg.forward>0)throw Error('Per scadenze e istanti diversi seleziona il forward automatico da parità.');checked(s.result);return s;}
async function slice(s,expiry,asof){
 const cfg=s.result.cfg,rows=candidates(s,expiry,asof);
 if(!rows.length)throw Error('Nessuna quota datata entro lo snapshot.');
 const expiryTime=expiry===cfg.expiry?cfg.expiryTime:root.DeskCalendar10.fixing(expiry).etClose;if(!expiryTime)throw Error('Fixing assente per '+expiry);const target=expiry+'T'+expiryTime;
 if(Q.nyEpoch(target)<=Q.nyEpoch(asof))throw Error('Fixing già trascorso.');
 if(expiry===cfg.expiry&&asof===cfg.asof)return checked(s.result);
 return checked(await computeAsync(rows,{...cfg,asof,expiry,expiryTime,target,forward:0,sensitivity:false},-1));
}
function guardGeneration(g){if(g!==generation)throw Error('I dati del desk sono cambiati. Ricalcola l’analisi.');}
action('rsSurface','rsSurfaceOut',async()=>{
 surface=null;invalidateOutput('rsInterpolation');invalidateOutput('rsEventOut');
 const s=starting(),stamp=s.result.cfg.asof,g=generation,exp=[...new Set(s.rows.filter(z=>z.symbol===s.result.cfg.symbol&&z.time?.slice(0,10)===stamp.slice(0,10)&&z.expiry>=stamp.slice(0,10)).map(z=>z.expiry))].sort();
 const slices=[],miss=[];for(const e of exp){guardGeneration(g);txt('rsSurfaceOut','Calcolo della scadenza '+e+'…');try{slices.push(await slice(s,e,stamp));}catch(err){miss.push([e,err.message]);}guardGeneration(g);}
 if(!slices.length)throw Error('Nessuna scadenza utilizzabile. '+miss.map(a=>a.join(' · ')).join(' / '));
 const ks=[-.05,-.025,-.01,0,.01,.025,.05],pairs=[];
 let out=table(['Scadenza ET','Forward','Fit / usate',...ks.map(k=>'IV k='+f(k*100,1)+'%')],slices.map(r=>[r.cfg.expiry,f(r.forward.F,2),r.quality.level+' / '+r.quoteAudit.used,...ks.map(k=>{const z=R.ivAt(r,k);return pc(z.iv)+(z.within?'':' *');})]));
 out+='<p>* Strike esterno all’intervallo liquido. k = ln(K/F). Tassi e orario di fixing provengono dalle impostazioni del desk.</p>';
 for(let i=1;i<slices.length;i++){const a=slices[i-1],b=slices[i],cal=R.calendar(a,b),dt=b.T-a.T,fw=k=>{const wa=R.ivAt(a,k).w,wb=R.ivAt(b,k).w;return wa==null||wb==null?NaN:(wb-wa)/dt;};
  const at=fw(0),slope=(fw(.001)-fw(-.001))/.002,ivSlope=(R.ivAt(b,0).iv-R.ivAt(a,0).iv)/dt;
  pairs.push({a,b,cal,at,slope,ivSlope});}
 if(pairs.length)out+=table(['Coppia','Limite inferiore Δw','K/F con violazione','Ordine calendar continuo','Vol forward ATM','∂k varianza forward','Δ IV ATM / anno'],pairs.map(p=>[p.a.cfg.expiry+' → '+p.b.cfg.expiry,f(p.cal.margin,9),f(p.cal.worstU,4),p.cal.status,p.at>=0?pc(Math.sqrt(p.at)):'varianza negativa',f(p.slope,5),f(p.ivSlope,5)]));
 else out+='<p>Una sola scadenza utilizzabile. La struttura a termine e il test calendar richiedono almeno due scadenze.</p>';
 if(slices.length>=3)out+=table(['Scadenza centrale','Curvatura ATM IV / anno² · differenze divise'],pairs.slice(1).map((p,i)=>[p.a.cfg.expiry,f(2*(p.ivSlope-pairs[i].ivSlope)/(p.b.T-pairs[i].a.T),5)]));
 if(pairs.length)out+='<p>Il test calendar verifica l’ordine della varianza totale su ciascuna cella CVI e su entrambe le semirette in log(K/F). Presuppone carry proporzionale deterministico e contratti omogenei. Nessuna riparazione viene applicata.</p>';
 if(pairs.length)out+=table(['Varianza forward annualizzata',...V.ks.map(k=>'k '+f(k))],pairs.map(({a,b})=>[a.cfg.expiry+' → '+b.cfg.expiry,...V.ks.map(k=>{const x=R.ivAt(a,k),y=R.ivAt(b,k);return x.w!=null&&y.w!=null?f((y.w-x.w)/(b.T-a.T),6)+(x.within&&y.within?'':' *'):'—';})]));
 if(miss.length)out+=table(['Scadenza esclusa','Motivo'],miss);surface={slices,pairs,stamp};attach('surface',{asof:stamp,excluded:miss,slices:slices.map(r=>({expiry:r.cfg.expiry,T:r.T,forward:r.forward.F,quality:r.quality.level,implied:ks.map(k=>R.ivAt(r,k))})),pairs:pairs.map(({a,b,cal,at,slope,ivSlope})=>({from:a.cfg.expiry,to:b.cfg.expiry,cal,atmForwardVariance:at,forwardSkew:slope,atmIVSlope:ivSlope}))});html('rsSurfaceOut',out);
});
action('rsInterpolate','rsInterpolation',()=>{
 if(!surface?.pairs.length)throw Error('Calcola almeno due scadenze utilizzabili.');
 const t=Q.nyEpoch($('rsMaturity').value),a0=Q.nyEpoch(surface.stamp);if(!Number.isFinite(t))throw Error('Inserisci una maturità ET valida.');
 const y=(t-a0)/(365*864e5),p=surface.pairs.find(({a,b})=>a.T<=y&&y<=b.T);
 if(!p)throw Error('L’orizzonte deve essere compreso fra le scadenze caricate.');if(!p.cal.passes)throw Error('Interpolazione sospesa. Ordine calendar non verificato fra le due scadenze.');
 const data=V.ks.map(k=>{const z=V.interp(p.a,p.b,y,k),long=R.ivAt(p.b,k).w;return {k,...z,frozenRollDown:long!=null&&z.iv!=null?z.iv*z.iv*y-long:null};});attach('interpolation',{targetET:$('rsMaturity').value,from:p.a.cfg.expiry,to:p.b.cfg.expiry,rows:data});html('rsInterpolation',table(['k = ln(K/F)','IV interpolata','Premio OTM / (DF)','Roll-down w dalla scadenza lunga'],data.map(z=>[f(z.k,3),pc(z.iv),f(z.premium,7),f(z.frozenRollDown,7)]))+'<p>Combinazione convessa lineare nel tempo delle curve di prezzo normalizzato tra '+esc(p.a.cfg.expiry)+' e '+esc(p.b.cfg.expiry)+'.</p>');
});
action('rsEvent','rsEventOut',()=>{
 if(!surface)throw Error('Calcola prima le scadenze.');if(surface.pairs.some(p=>!p.cal.passes))throw Error('Ordine calendar non verificato per tutte le scadenze.');const t=Q.nyEpoch($('rsEventTime').value);if(!(t>Q.nyEpoch(surface.stamp)))throw Error('Inserisci un evento ET successivo allo snapshot.');
 const z=V.eventVariance(surface.slices,t);attach('event',{eventET:$('rsEventTime').value,baseAnnualVariance:z.v,eventVariance:z.j,rmseTotalVariance:z.err});html('rsEventOut',table(['Vol continua annua','Dev. std. evento','RMSE varianza totale'],[[pc(Math.sqrt(z.v)),pc(Math.sqrt(z.j)),f(z.err,8)]])+'<p>Modello condizionale wATM(T) = vT + J per scadenze che includono l’evento, con v e J non negativi. Una pendenza di fondo variabile o altri eventi possono cambiare la stima.</p>');
});
clearOn(['rsEventTime'],'rsEventOut');clearOn(['rsMaturity'],'rsInterpolation');clearOn(['rsStart','rsStride'],'rsDynamicsOut');
action('rsDynamics','rsDynamicsOut',async()=>{
 const s=starting(),cfg=s.result.cfg,b=cfg.asof,a=$('rsStart').value,g=generation,ms=Q.nyEpoch(a),end=Q.nyEpoch(b),step=+$('rsStride').value;
 if(!(a&&a.slice(0,10)===b.slice(0,10)&&end>ms))throw Error('Scegli un inizio precedente allo snapshot nella stessa seduta ET.');
 const stamps=[a],series=[],skips=[];for(let tick=ms+step*60000;tick<end-1;tick+=step*60000)stamps.push(Q.nyFormat(tick)+'.'+String(tick%1000).padStart(3,'0'));stamps.push(b);
 for(let i=0;i<stamps.length;i++){guardGeneration(g);const t=stamps[i];txt('rsDynamicsOut','Ricostruzione '+(i+1)+' / '+stamps.length+' · '+t);
 try{series.push(await slice(s,cfg.expiry,t));}catch(err){if(i===0||i===stamps.length-1)throw Error('Estremo '+t+' indisponibile. '+err.message);skips.push(t);}guardGeneration(g);}
 const first=series[0],last=series.at(-1);if(first.quoteAudit.latestQuote===last.quoteAudit.latestQuote)throw Error('Gli estremi usano la stessa ultima quota. Carica due snapshot effettivamente distinti.');
 const K=s.reference,fa=first.ws.model,fb=last.ws.model;let out=table(['k fisso','IV iniziale','IV finale','Δ punti vol'],V.ks.map(k=>{const a=R.ivAt(first,k),b=R.ivAt(last,k);return[f(k),pc(a.iv),pc(b.iv),a.within&&b.within?f((b.iv-a.iv)*100,3):'esterno agli strike liquidi'];}));
 out+=table(['Strike fisso','Q(S > K) iniziale','Q(S > K) finale','Δ punti %'],[[f(K,2),pc(fa.survival(K)),pc(fb.survival(K)),f((fb.survival(K)-fa.survival(K))*100)]]);
 const unique=series.filter((r,i)=>!i||r.quoteAudit.latestQuote!==series[i-1].quoteAudit.latestQuote),z=V.factors(unique,step);
 const timePath=unique.map(r=>({asof:r.cfg.asof,t:Q.nyEpoch(r.cfg.asof),pr:r.ws.model.survival(K),smile:R.ivAt(r,0).iv}));for(let i=1;i<timePath.length;i++){const a=timePath[i-1],b=timePath[i],minutes=(b.t-a.t)/60000;if(Math.abs(minutes-step)>.001)continue;
 b.dProb=(b.pr-a.pr)/minutes;b.dIV=(b.smile-a.smile)/minutes;
 if(Number.isFinite(a.dProb)){b.ddProb=(b.dProb-a.dProb)/minutes;b.ddIV=(b.dIV-a.dIV)/minutes;}}
 out+=table(['Snapshot ET','Q(S > K)','Δ probabilità · pp/min','Δ² prob. · pp/min²','Δ IV ATM · pt vol/min','Δ² IV ATM · pt vol/min²'],timePath.map(z=>[z.asof,pc(z.pr),f(z.dProb*100,6),f(z.ddProb*100,7),f(z.dIV*100,6),f(z.ddIV*100,7)]));
 attach('dynamics',{from:a,to:b,intervalMinutes:step,timePath,excluded:skips,threshold:K,probabilityAboveStart:fa.survival(K),probabilityAboveEnd:fb.survival(K),observations:series.map(r=>({asof:r.cfg.asof,latestQuote:r.quoteAudit.latestQuote,observed:V.observe(r)})),factors:z});
 out+='<p>'+series.length+' fit utilizzabili, '+skips.length+' intervalli esclusi, '+z.n+' incrementi regolari sul supporto comune. Gli snapshot intermedi escludono i test di sensibilità aggiuntivi.</p>';
 if(z.pca)out+=table(['Fattore PCA','Varianza spiegata',...V.ks.map(k=>'k '+f(k,2))],z.pca.map((p,i)=>[i+1,pc(p.variance),...p.loads.map(v=>f(v,3))]));
 if(z.n>=6)out+=table(['Beta IV ATM / log-forward','Beta skew / log-forward','Innovazione IV ATM ultimo intervallo · punti vol'],[[f(z.ivBeta,4),f(z.skewBeta,4),f(z.lastResidual==null?null:z.lastResidual*100,4)]]);
 out+='<p>PCA descrittiva su variazioni di IV per cinque coordinate di smile. Almeno sei incrementi per la decomposizione e venti precedenti per il residuo dell’ultima variazione condizionato alla variazione contemporanea del forward.</p>';html('rsDynamicsOut',out);
});
action('rsSaveSurface','rsSurfaceSaveNote',()=>{saveScope(['surface','interpolation','event','dynamics']);txt('rsSurfaceSaveNote','Report JSON esportato.');});
action('rsSaveRisk','rsRiskSaveNote',()=>{saveScope(['laws','strategy']);txt('rsRiskSaveNote','Report JSON esportato.');});
})(globalThis);
