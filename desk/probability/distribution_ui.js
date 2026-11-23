
(function(root){'use strict';
const $=id=>document.getElementById(id),D=()=>root.DistributionCore;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x),finite=Number.isFinite,fmt=(v,n=2)=>finite(v)?v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—',pct=(v,n=2)=>finite(v)?(100*v).toFixed(n)+'%':'—',signed=(v,n=2)=>(v>0?'+':'')+fmt(v,n);
const C={q:'#87b5ff',p:'#99deff',text:'#c1d9fb',muted:'#aec3d7',grid:'#29445e',red:'#f5efde',white:'#f5efde',bg:'#091c2e'};
const S={result:null,rows:[],bundle:null,qSummary:null,pSummary:null,reference:NaN,valid:false,pending:false,revision:0,view:null};
function put(id,value){if($(id))$(id).textContent=value;}
function message(value,bad=false){put('pdMessage',value);$('pdMessage').classList.toggle('pd-alert',bad);}
function svg(W,H,title){return `<svg font-family="Consolas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" style="font-family:Consolas"><title>${esc(title)}</title><rect width="${W}" height="${H}" fill="${C.bg}"/>`;}
function st(x,y,t,col=C.muted,size=11,anchor='start',extra=''){return `<text x="${x}" y="${y}" fill="${col}" font-size="${size}" text-anchor="${anchor}" ${extra}>${esc(t)}</text>`;}
function ln(x1,y1,x2,y2,col=C.grid,w=1,dash=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;}
function path(data,x,y){return data.map((v,i)=>(i?'L':'M')+x(v[0]).toFixed(3)+' '+y(v[1]).toFixed(3)).join(' ');}
function extent(){const {q,p}=S.bundle,c=num($('pdWindow').value),a=(1-c)/2;if(!p)return c===1?q.support.slice():[q.quantile(a),q.quantile(1-a)];return c===1?[Math.min(q.support[0],p.support[0]),Math.max(q.support[1],p.support[1])]:[Math.min(q.quantile(a),p.quantile(a)),Math.max(q.quantile(1-a),p.quantile(1-a))];}
const historyBook={rows:[],archive:null};
function pitContext(cfg){
 const end=root.QuantCore.nyEpoch(cfg.expiry+'T'+cfg.expiryTime),origin=root.QuantCore.nyEpoch(cfg.asof);
 const symbol=String(cfg.symbol||'').trim().toUpperCase(),clock=cfg.expiryTime.slice(0,5);
 return {series:symbol+'@'+clock+(cfg.cviWingProfile==='wing'?'ET-CVIWING1':'ET-CVIMARK1'),origin,end};
}
function settings(){
 const physicalMode=$('pdPhysicalMode').value, gamma=$('pdGamma').valueAsNumber, m=$('pdMean').valueAsNumber,v=$('pdVol').valueAsNumber;
 if(physicalMode==='entropy'&&(!finite(m)||Math.abs(m)>1||!finite(v)||v<.4||v>1.6))throw new Error('Usa spostamento fra −1 e +1 σQ e rapporto fra 0.40 e 1.60.');
 if(physicalMode==='crra'&&(!finite(gamma)||gamma<0||gamma>30))throw new Error('Usa γ compreso fra 0 e 30.');
 return {coordinate:$('pdCoordinate').value,physicalMode,meanShift:physicalMode==='entropy'?m:0,volRatio:physicalMode==='entropy'?v:1,gamma:physicalMode==='crra'?gamma:null,pitContext:pitContext(S.result.cfg),manualForward:S.result.forward?.source==='Forward manuale'?{source:$('pdManualForwardSource').value,timestamp:$('pdManualForwardTime').value}:null,history:historyBook.rows};
}
function pLabel(b=S.bundle){return !b?.p?'P indisponibile':b.p.status==='empirical_pit'?'P storica':b.settings.physicalMode==='crra'?'P scenario CRRA':'P scenario momenti';}
function physicalControls(){
 const mode=$('pdPhysicalMode').value;
 for(const [id,visible] of [['pdGammaBox',mode==='crra'],['pdMeanBox',mode==='entropy'],['pdVolBox',mode==='entropy'],['pdEntropyPresets',mode==='entropy']])$(id).hidden=!visible;
}
function makeForecast(){
 if(!S.valid||S.pending||!S.bundle||S.bundle.settings.coordinate!=='native'||S.bundle.diagnostics.synthetic||S.bundle.diagnostics.quality==='red'||S.result.cfg.overrideHours>0)throw new Error('Serve una Q cash nativa, da bid/ask, con orologio osservato e fit utilizzabile.');
 const issue=D().sourceFailure(S.result,S.bundle.settings);if(issue)throw new Error(issue);
 return root.TimeResearchCore.archive(S.result,S.bundle.settings);
}
function openForecast(doc){
 if(doc?.format==='quantistes-cvi-mark-v1'){
  D().historyRow({...doc,available_utc:doc.expiry_utc,pit_q:.5});root.TimeResearchCore.archiveLaw(doc);return doc;
 }
 if(!doc?.series?.endsWith('ET-QSPLINE1'))throw Error('Serie della previsione non compatibile con il formato.');

 if(doc?.format!=='quantistes-native-linear-density-v1'||!Array.isArray(doc.x)||!Array.isArray(doc.density)||doc.x.length!==doc.density.length||doc.x.length<3||doc.x.length>5000)throw new Error('File previsione Q non compatibile.');
 D().historyRow({...doc,available_utc:doc.expiry_utc,pit_q:.5});const clock=doc.series.match(/@(\d{2}:\d{2})ET-/);
 if(!clock||clock[1]!==D().fixingClock(Date.parse(doc.expiry_utc)))throw new Error('Fixing ET del file incompatibile con il timestamp di scadenza.');
 let mass=0;for(let i=0;i<doc.x.length;i++){const x=doc.x[i],y=doc.density[i];if(!(finite(x)&&x>0&&finite(y)&&y>=0&&(i===0||x>doc.x[i-1])))throw new Error('Curva Q archiviata non valida.');if(i)mass+=(x-doc.x[i-1])*(doc.density[i-1]+y)/2;}
 if(Math.abs(mass-1)>2e-6)throw new Error('Massa archiviata diversa da uno.');return doc;
}
function archivedPIT(doc,price){
 if(!(finite(price)&&price>0))throw new Error('Settlement positivo richiesto.');
 if(doc.format==='quantistes-cvi-mark-v1')return root.TimeResearchCore.archiveLaw(doc).cdf(price);
 let u=0;for(let i=1;i<doc.x.length;i++){const a=doc.x[i-1],b=doc.x[i];if(price<=a)break;const dx=Math.min(price,b)-a,y=doc.density[i-1];u+=dx*(y+.5*(doc.density[i]-y)*dx/(b-a));}
 return price<=doc.x[0]?0:price>=doc.x.at(-1)?1:Math.max(0,Math.min(1,u));
}
function archivedBreach(doc,price){
 if(doc.format==='quantistes-cvi-mark-v1')return Number(root.TimeResearchCore.archiveLaw(doc).breach(price));
 // A zero at an isolated knot still belongs to the closure of a positive interval.
 for(let i=1;i<doc.x.length;i++)if(price>=doc.x[i-1]&&price<=doc.x[i]&&(doc.density[i-1]>0||doc.density[i]>0))return 0;
 return 1;
}
function validationGraphic(detail){
 if(!detail||!detail.n)return '';
 const {n,bucketsQ,bucketsP,difference,lag,interval}=detail;
 const W=600,H=205,L=43,R=583,T=24,B=160;
 const top=Math.max(.16,Math.ceil(20*Math.max(...bucketsQ,...bucketsP)/n)/20);
 const y=p=>B-(B-T)*p/top,step=(R-L)/10;
 const text=(x,v,label,anchor='middle')=>'<text x="'+x+'" y="'+v+'" text-anchor="'+anchor+'" fill="#adc3d7" font-size="11">'+label+'</text>';
 let svg='<svg font-family="Consolas" viewBox="0 0 '+W+' '+H+'" style="max-width:none;width:100%;height:auto;display:block" role="img" aria-label="Distribuzione dei percentili realizzati fuori campione nelle previsioni Q e P">'+text(L,T-8,'Frequenza','start');
 for(const f of [0,.10,top]){
  svg+='<path d="M'+L+' '+y(f)+'H'+R+'" stroke="'+(f===.10?'#adc3d7':'#2b4964')+'" stroke-dasharray="'+(f===.10?'4 3':'0')+'"/>'+text(L-5,y(f)+4,Math.round(100*f)+'%','end');
 }
 for(let j=0;j<10;j++){
  const mid=L+(j+.5)*step;
  for(const [values,color,offset,name] of [[bucketsQ,'#87b5ff',-13,'Q'],[bucketsP,'#87cbe6',1,'P']]){
   const f=values[j]/n;
   svg+='<rect x="'+(mid+offset)+'" y="'+y(f)+'" width="12" height="'+(B-y(f))+'" fill="'+color+'"><title>'+name+' · percentile '+(j*10)+'–'+((j+1)*10)+'% · '+values[j]+' / '+n+'</title></rect>';
  }
  svg+=text(mid,B+15,(j*10)+'–'+((j+1)*10));
 }
 svg+=text((R+L)/2,H-5,'Percentile del settlement nella distribuzione prevista (%)')+'</svg>';
 const ci=interval?'Intervallo approssimativo al 95% ['+fmt(interval[0],5)+', '+fmt(interval[1],5)+'], errore standard HAC con '+lag+' ritardi.':'Intervallo di incertezza attivo da 30 sedute di test.';
 return '<details class="stress-detail"><summary>Calibrazione per decile e incertezza del Brier</summary><p><span class="gold">Q</span> · <span class="blue">P storica</span> · '+n+' sedute walk-forward. Con una previsione calibrata ciascuna fascia accoglie in media il 10% degli esiti. Le altezze possono oscillare molto con pochi casi.</p>'+svg+'<p>Guadagno Brier medio (Q − P) '+fmt(difference,5)+'. '+ci+' Un valore positivo favorisce P sugli eventi valutati. L’intervallo si riferisce alla differenza di score fra modelli.</p></details>';
}

function showValidation(){
 const b=S.bundle,g=b.diagnostics,f=g.pitValidation,c=b.settings;
 $('pdManualSourceBox').hidden=S.result.forward?.source!=='Forward manuale';
 $('pdModelStamp').textContent=pLabel();
 if(c.physicalMode==='empirical')put('pdScenarioCaption',b.p?'P storica stimata su '+f.n+' PIT. La qualità previsionale si valuta nel confronto walk-forward.':g.pReason);
 else if(c.physicalMode==='crra')put('pdScenarioCaption','γ = '+c.gamma+'. Sulla finestra numerica di scenario, con M ∝ S_T⁻ᵞ si ottiene p(s) = q(s)·(s/F)ᵞ / E_Q[(S/F)ᵞ]. Media P '+fmt(b.p.mean)+' · scarto da Q '+signed(b.p.mean-b.q.mean)+' punti. Ipotesi strutturale su indice e ricchezza, scelta dall’utente.');
 else put('pdScenarioCaption','Scenario a minima divergenza da Q sulla finestra numerica. E_P[S] = '+fmt(b.p.mean)+' · σP = '+fmt(b.p.sd)+' punti. '+(b.p.isIdentity?'Media e dispersione coincidono con quelle di Q. Il peso di ogni esito resta identico.':'Le ipotesi sui primi due momenti determinano la variazione delle probabilità.'));
 const gammaBox=$('pdGammaStress');gammaBox.hidden=c.physicalMode!=='crra';gammaBox.innerHTML='';
 if(!gammaBox.hidden){
  const q=b.q,baseline=q.survival(S.reference),gammas=[...new Set([0,1,3,5,10,c.gamma])].sort((a,b)=>a-b);
  const scenarios=gammas.map(gamma=>{const w=s=>(s/q.mean)**gamma,Z=gamma===0?1:q.expect(w),probability=gamma===0?baseline:q.integrate(w,S.reference,q.support[1])/Z;return {gamma,probability,deltaPoints:100*(probability-baseline)};});
  g.crraSensitivity={reference:S.reference,event:'terminal_above_reference',scenarios};
  gammaBox.innerHTML='<p class="pd-small">Probabilità di chiudere sopra '+fmt(S.reference)+' al variare di γ. Scegli una riga per attivare lo scenario.</p><div class="tablewrap"><table><thead><tr><th>γ assunto</th><th>Probabilità terminale</th><th>Differenza da Q</th></tr></thead><tbody>'+scenarios.map(row=>'<tr><td><button type="button" class="small" data-gamma-value="'+row.gamma+'" aria-pressed="'+(row.gamma===c.gamma)+'">'+row.gamma+(row.gamma===c.gamma?' · attivo':'')+'</button></td><td>'+pct(row.probability)+'</td><td>'+signed(row.deltaPoints)+' pp</td></tr>').join('')+'</tbody></table></div>';
 }
 if(!f){$('pdBacktest').textContent=c.physicalMode==='empirical'?g.pReason:'Attiva P storica per esaminare il campione compatibile.';return;}
 const m=f.metrics,info=f.rejected;
 let html='<p><strong>'+f.n+' osservazioni ammesse · '+m.n+' fuori campione</strong><br>Serie '+esc(c.pitContext.series)+' · importate '+historyBook.rows.length+' · esclusioni per serie '+info.series+', fixing ET '+info.fixing+', durata '+info.horizon+', esito ancora ignoto '+info.notKnown+', sovrapposizione '+info.overlap+'. PIT a 0 o 1: '+f.endpointHits+'. Violazioni del supporto dichiarate: '+f.supportBreaches+'. Esiti senza verifica del supporto: '+f.supportUnverified+'.</p>';
 if(f.endpointHits||f.supportBreaches)html+='<p>Gli esiti agli estremi del supporto segnalano un limite delle ali. Una ripesatura non aggiunge massa dove Q vale zero.</p>';
 if(m.n)html+='<div class="tablewrap"><table><thead><tr><th>Metrica walk-forward</th><th>Q</th><th>P storica</th></tr></thead><tbody><tr><td>Brier medio · minore è migliore</td><td>'+fmt(m.brierQ,4)+'</td><td>'+fmt(m.brierP,4)+'</td></tr><tr><td>Copertura centrale nominale 80%</td><td>'+pct(m.cover80Q,1)+'</td><td>'+pct(m.cover80P,1)+'</td></tr><tr><td>Copertura centrale nominale 95%</td><td>'+pct(m.cover95Q,1)+'</td><td>'+pct(m.cover95P,1)+'</td></tr></tbody></table></div><p>Brier su cinque eventi annidati definiti dai quantili Q del giorno (5%, 25%, 50%, 75%, 95%). Log-score medio relativo ln(p/q) = '+fmt(m.meanLogGain,4)+' nat. Un valore positivo favorisce P. Non disponibile quando si osserva un PIT limite nel test.</p>';
 else html+='<p>Il primo test fuori campione richiede una previsione successiva alle 40 osservazioni disponibili per l’addestramento iniziale.</p>';
 $('pdBacktest').innerHTML=html+validationGraphic(m.detail);
}
function bindPhysical(){
 const notice=(s)=>put('pdHistoryFeedback',s);
 $('pdManualForwardSource').oninput=dirty;$('pdManualForwardTime').oninput=dirty;
 $('pdPhysicalMode').onchange=()=>{physicalControls();update();};$('pdGamma').oninput=dirty;
 $('pdForecastSave').onclick=()=>{try{const doc=makeForecast();download('Q_'+doc.series.replace(/[^a-z0-9]/gi,'_')+'_'+doc.asof_utc.replace(/[:.]/g,'-')+'.json',JSON.stringify(doc),'application/json');notice('Previsione Q pronta per l’archivio.');}catch(e){notice(e.message);}};
 $('pdArchivePick').onclick=()=>$('pdArchiveFile').click();$('pdArchiveFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('File Q oltre 1 MB.');const doc=openForecast(JSON.parse(await file.text()));historyBook.archive=doc;put('pdArchiveInfo',doc.series+' · previsione '+doc.asof_utc+' → scadenza '+doc.expiry_utc);$('pdSettleBox').hidden=false;$('pdSettlePrice').value='';$('pdAvailable').value='';notice('Inserisci il settlement e il suo effettivo timestamp di disponibilità.');}catch(error){historyBook.archive=null;$('pdSettleBox').hidden=true;notice(error.message);}finally{e.target.value='';}};
 $('pdHistPick').onclick=()=>$('pdHistFile').click();$('pdHistFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>8000000)throw new Error('Archivio PIT oltre 8 MB.');historyBook.rows=D().mergeHistory(historyBook.rows,D().readHistory(await file.text()));update();notice('Storico caricato · '+historyBook.rows.length+' osservazioni uniche.');}catch(error){notice(error.message);}finally{e.target.value='';}};
 $('pdHistSave').onclick=()=>{const fields=D().HIST_FIELDS;download('Quantistes_storico_PIT.csv',[fields.join(','),...historyBook.rows.map(r=>fields.map(f=>r[f]).join(','))].join('\n')+'\n','text/csv;charset=utf-8');};
 $('pdSettleAdd').onclick=()=>{try{const doc=historyBook.archive;if(!doc)throw new Error('Apri prima una previsione Q archiviata.');const u=archivedPIT(doc,$('pdSettlePrice').valueAsNumber);historyBook.rows=D().mergeHistory(historyBook.rows,[{...doc,available_utc:$('pdAvailable').value.trim(),pit_q:u,support_breach:archivedBreach(doc,$('pdSettlePrice').valueAsNumber)}]);update();const z=root.TimeResearchCore?.scores(doc,root.TimeResearchCore.archiveLaw(doc),$('pdSettlePrice').valueAsNumber);notice('PIT '+fmt(u,6)+' registrato'+(z?' · CRPS Q '+fmt(z.crps,4)+' punti':'')+'. Scarica lo storico per conservarlo.');}catch(e){notice(e.message);}};
 $('pdGammaStress').onclick=e=>{const button=e.target.closest('[data-gamma-value]');if(button){$('pdGamma').value=button.dataset.gammaValue;update();}};
 physicalControls();
}

function toggleExports(){const blocked=!S.valid||S.pending||S.bundle?.diagnostics.quality==='red';for(const id of ['pdCSV','pdSaveSVG'])$(id).disabled=blocked;$('pdJSON').disabled=!S.valid||S.pending;}
function prepare(){if(!S.result?.ws)throw new Error('La distribuzione richiede la curva Wall Street. Controlla i dati e la qualità delle quotazioni.');S.bundle=D().build(S.result,settings());S.qSummary=D().summary(S.bundle.q,S.reference);S.pSummary=S.bundle.p?D().summary(S.bundle.p,S.reference):null;}
function render(result,rows=[]){S.result=result;S.rows=rows||[];S.revision++;S.valid=false;S.pending=false;S.bundle=null;$('pdWorkspace').hidden=true;
 if(!result?.ws||result.inputCheck?.blocked){message(result?.errors?.ws||'Distribuzione non disponibile: completa prima il fit della curva opzioni.',true);toggleExports();return;}
 S.reference=result.cfg.settlement;$('pdReference').value=Number(S.reference).toFixed(2);
 try{prepare();$('pdLower').value=S.bundle.q.quantile(.05).toFixed(2);$('pdUpper').value=S.bundle.q.quantile(.95).toFixed(2);S.valid=true;$('pdWorkspace').hidden=false;renderEverything();}catch(e){message(e.message,true);toggleExports();}
}
function update(){if(!S.result?.ws)return;try{S.reference=num($('pdReference').value);if(!(S.reference>0))throw new Error('Inserisci un riferimento di rendimento positivo.');prepare();S.pending=false;S.valid=true;S.revision++;$('pdWorkspace').hidden=false;renderEverything();}catch(e){dirty();message(e.message,true);toggleExports();}}
function invalidate(text='Dati o parametri del desk modificati: ricalcola i livelli per aggiornare tutte le distribuzioni.'){resetCDF();clearPDFProbe();S.valid=false;S.pending=false;S.result=null;S.bundle=null;S.revision++;root.dispatchEvent(new CustomEvent('quantistes:research-stale',{detail:{all:true}}));$('pdWorkspace').hidden=true;message(text);put('pdQualityBadge','DA RICALCOLARE');toggleExports();}
function renderEverything(){document.querySelectorAll('#view-distributions .pd-dirty').forEach(el=>el.classList.remove('pd-dirty'));const {q,p,diagnostics:g,settings:c}=S.bundle;put('pdCoordinateBadge',c.coordinate==='native'?(g.synthetic?'Q · PREZZI SINTETICI':q.status==='option_implied_assumed_clock'?'Q · OROLOGIO FORZATO':'Q · CASH NATIVO'):'Q · SCENARIO RIBASATO');put('pdPBadge',pLabel().toUpperCase());put('pdLegendP',p?pLabel():'P indisponibile');put('pdQualityBadge',g.qualityLabel||'FIT CALCOLATO');$('pdQualityBadge').className='badge '+(g.quality==='red'?'err':g.quality==='amber'?'warn':'ok');
 put('pdHorizon','Snapshot '+g.snapshot.replace('T',' ')+' ET → '+g.target.replace('T',' ')+' ET. '+(c.coordinate==='native'?'Prezzo cash SPX; media vincolata al forward.':'Trasformazione del desk sul settlement/target scelti.'));
 put('pdMeanHint',p?'Media Q '+fmt(q.mean)+' → media P '+fmt(p.mean)+' · '+signed(p.mean-q.mean)+' pt.':'');
 const mapped=c.coordinate==='mapped',ql=g.quality==='red';
 message([ql?'Fit non idoneo: uso diagnostico.':'',mapped?'Coordinate di scenario.':g.synthetic?'Prezzi sintetici da IV.':q.status==='option_implied_assumed_clock'?'Q con orologio forzato per sconto e volatilità.':'Q cash implicita nelle opzioni alla scadenza.',p?p.provenance:g.pReason].filter(Boolean).join(' '),ql);showValidation();
 put('pdDensitySub',(mapped?'Scenario SPX al target':'Cash SPX a scadenza')+' · '+g.target.replace('T',' ')+' ET · densità per punto di indice');
 const ippook=ippoAvailable();$('pdShowIppo').disabled=!ippook;if(!ippook)$('pdShowIppo').checked=false;put('pdIppoHint',ippook?'IPPO: riferimenti del desk, non quantili di P.':'Disponibili nella vista ribasata/target; nel cash solo se coordinate e orizzonte coincidono.');
 renderKpis();renderDensity();renderCDF();renderBins();renderTables();renderTails();renderEvents();renderAudit();$('pdSensitivityGrid').className='pd-sensitivity-empty';$('pdSensitivityGrid').textContent='Premi «Calcola 9 scenari» per confrontare le ipotesi.';toggleExports();
 root.dispatchEvent(new CustomEvent('quantistes:distribution',{detail:getState()}));
}
function kpi(label,q,p,detail){return `<div class="pd-kpi"><div class="pd-kpi-label">${esc(label)}</div><div class="pd-kpi-value">${esc(q)}</div><div class="pd-kpi-sub">${esc(pLabel())} · ${esc(p)}</div><div class="pd-kpi-detail">${esc(detail)}</div></div>`;}
function renderKpis(){const q=S.qSummary,p=S.pSummary,i68=q.intervals.find(x=>x.coverage===.68),p68=p?.intervals.find(x=>x.coverage===.68);$('pdKpis').innerHTML=kpi('Sopra riferimento '+fmt(S.reference),pct(q.pAbove),pct(p?.pAbove),'Probabilità terminale · oro Q / azzurro P')+kpi('Mediana · 50° percentile',fmt(q.median),fmt(p?.median),'Metà della massa per ciascun lato')+kpi('Dispersione · σ in punti',fmt(q.sd),fmt(p?.sd),'Deviazione standard sull’intero supporto')+kpi('Intervallo centrale 68%',fmt(i68.lower,0)+' — '+fmt(i68.upper,0),p68?fmt(p68.lower,0)+' — '+fmt(p68.upper,0):'—','16° → 84° percentile · code uguali');}
function ippoAvailable(){const r=S.result,c=S.bundle.settings.coordinate;if(!r.ippo)return false;if(c==='mapped')return true;return r.ippo.variant==='desk'&&r.cfg.anchor==='native'&&!r.isScenario;}
function renderDensity(){
 const {q,p,diagnostics:g,settings}=S.bundle,[lo,hi]=extent(),host=$('pdDensity'),W=QuantistesPlots.width(host,880),small=W<530,H=small?375:485,L=small?65:75,R=Math.max(L+2,W-20),T=41,B=H-43;
 if(!(finite(lo)&&finite(hi)&&hi>lo)){host.textContent='Finestra di prezzo non disponibile.';return;}
 const N=Math.min(2800,Math.max(1024,Math.round(2*(R-L)))),x=v=>L+(v-lo)/(hi-lo)*(R-L);
 const xs=Array.from({length:N+1},(_,i)=>lo+(hi-lo)*i/N);
 // Sample the actual bodies even when the numerical support extends far into the wings.
 for(const law of [q,p].filter(Boolean)){
   for(const k of law._edges||[])if(k>lo&&k<hi)xs.push(k);
   for(const a of [.001,.01,.05,.25,.5,.75,.95,.99,.999]){const k=law.quantile(a);if(k>lo&&k<hi)xs.push(k);}
 }
 const grid=Array.from(new Set(xs)).sort((a,b)=>a-b),qd=grid.map(k=>[k,q.pdf(k)]),pd=p?grid.map(k=>[k,p.pdf(k)]):[];
 const max=Math.max(1e-12,...qd.map(v=>v[1]).filter(finite),...pd.map(v=>v[1]).filter(finite))*1.08,y=v=>B-v/max*(B-T);
 let s=svg(W,H,'Distribuzioni terminali per punto indice');
 s+='<defs><linearGradient id="pdGoldFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+C.q+'" stop-opacity=".32"/><stop offset="1" stop-color="'+C.q+'" stop-opacity=".035"/></linearGradient><clipPath id="pdDensityClip"><rect x="'+L+'" y="'+T+'" width="'+(R-L)+'" height="'+(B-T)+'"/></clipPath></defs>';
 s+=st(L,17,'Densità / punto SPX',C.muted,11);
 if(W>560)s+=st(R,17,settings.coordinate==='native'?'Cash SPX a scadenza':'Orizzonte ribasato',C.muted,11,'end');
 for(const t of QuantistesPlots.niceTicks(0,max,5))s+=ln(L,y(t.v),R,y(t.v),C.grid)+st(L-8,y(t.v)+4,t.s,C.muted,10,'end');
 for(const t of QuantistesPlots.niceTicks(lo,hi,Math.max(2,Math.min(10,(R-L)/76))))s+=ln(x(t.v),T,x(t.v),B,C.grid,.8,'2 5')+st(x(t.v),B+18,t.s,C.muted,11,'middle');
 s+='<g clip-path="url(#pdDensityClip)">';
 for(const [a,b,opacity] of [[.05,.95,.035],[.25,.75,.065]]){const xx=x(q.quantile(a)),xx2=x(q.quantile(b));s+='<rect x="'+xx+'" y="'+T+'" width="'+(xx2-xx)+'" height="'+(B-T)+'" fill="'+C.q+'" opacity="'+opacity+'"/>';}
 for(const k of g.liquid||[])if(k>lo&&k<hi)s+=ln(x(k),T,x(k),B,C.red,1,'2 4');
 const main=path(qd,x,y);s+='<path d="'+main+' L'+R+' '+B+' H'+L+'Z" fill="url(#pdGoldFill)"/>';
 const qs=[.01,.05,.25,.5,.75,.95,.99],labels=small?[.05,.5,.95]:qs;
 for(const a of qs){const k=q.quantile(a);if(k<=lo||k>=hi)continue;s+=ln(x(k),T,x(k),B,C.q,a===.5?1.25:.65,a===.5?'5 3':'2 6');}
 if($('pdShowIppo').checked&&ippoAvailable())for(const level of S.result.ippo.levels.filter(v=>v.z&&Math.abs(v.z)<=2&&Number.isInteger(v.z))){
   if(level.price>lo&&level.price<hi)s+=ln(x(level.price),T,x(level.price),B,'#88b3eb',.9,'2 4')+st(x(level.price)+3,level.z<0?B-8:B-19,(level.z>0?'+':'')+level.z+'σ I','#b6d2f9',9);
 }
 if(S.reference>lo&&S.reference<hi)s+=ln(x(S.reference),T,x(S.reference),B,C.white,1,'5 4');
 s+='<path d="'+main+'" fill="none" stroke="'+C.q+'" stroke-width="2.3"/>'+(p?'<path d="'+path(pd,x,y)+'" fill="none" stroke="'+C.p+'" stroke-width="2.1" stroke-dasharray="6 4"/>':'')+'</g>';
 let lastX=-Infinity;for(const a of labels){
   const k=q.quantile(a),xx=x(k);if(k<=lo||k>=hi||xx-lastX<33)continue;
   s+=st(xx,T-6,'Q'+Math.round(100*a),C.q,10,'middle');lastX=xx;
 }
 s+=st(R,H-6,'Prezzo SPX',C.muted,11,'end')+'<g id="pdCrosshair" pointer-events="none"><line id="pdHairLine" y1="'+T+'" y2="'+B+'" stroke="#b0cef7" stroke-width="1" stroke-dasharray="3 4"/><circle id="pdQDot" r="3.4" fill="'+C.q+'" stroke="#071727"/><circle id="pdPDot" visibility="'+(p?'visible':'hidden')+'" r="3.4" fill="'+C.p+'" stroke="#071727"/></g><rect id="pdHoverSurface" x="'+L+'" y="'+T+'" width="'+(R-L)+'" height="'+(B-T)+'" fill="#f5f3e9" fill-opacity="0" pointer-events="all"/></svg>';
 host.innerHTML=s;S.view={lo,hi,W,H,L,R,T,B,max};
 const slider=$('pdDensitySlider');slider.min=String(lo);slider.max=String(hi);slider.step=String((hi-lo)/1500);slider.disabled=false;
 const show=k=>{
   if(!S.valid||S.pending||!finite(k))return;
   k=Math.max(lo,Math.min(k,hi));const xx=x(k),density=q.pdf(k),set=(id,key,val)=>$(id)?.setAttribute(key,val);
   S.pdfCursor=k;slider.value=String(k);slider.setAttribute('aria-valuetext','SPX '+fmt(k)+' · Q ≤ K '+pct(q.cdf(k)));
   set('pdHairLine','x1',xx);set('pdHairLine','x2',xx);set('pdQDot','cx',xx);set('pdQDot','cy',y(density));
   if(p){set('pdPDot','cx',xx);set('pdPDot','cy',y(p.pdf(k)));}
   $('pdHover').innerHTML='<strong>SPX '+fmt(k)+'</strong> <span class="pd-q">Q ≤ '+pct(q.cdf(k))+' · Q &gt; '+pct(q.survival(k))+'</span> '+(p?'<span class="pd-p">P ≤ '+pct(p.cdf(k))+' · P &gt; '+pct(p.survival(k))+'</span>':'')+'<span class="pd-inline-label">Densità per punto · Q '+fmt(density,6)+(p?' / P '+fmt(p.pdf(k),6):'')+'</span>';
 };
 slider.oninput=()=>show(+slider.value);const surface=$('pdHoverSurface');
 const pointer=e=>{const frame=host.getBoundingClientRect();if(frame.width&&e.isPrimary!==false)show(lo+(hi-lo)*(((e.clientX-frame.left)*W/frame.width-L)/(R-L)));};
 surface.onpointermove=surface.onpointerdown=pointer;
 if(S.pdfResult!==S.result||S.pdfCoordinate!==settings.coordinate){S.pdfCursor=q.quantile(.5);S.pdfResult=S.result;S.pdfCoordinate=settings.coordinate;}
 show(finite(S.pdfCursor)?S.pdfCursor:q.quantile(.5));
 $('pdQuantileStrip').innerHTML=qs.map(pr=>'<div class="pd-quantile-chip"><label>Q'+Math.round(100*pr)+'</label><b>'+fmt(q.quantile(pr))+'</b><small>P '+fmt(p?.quantile(pr))+'</small></div>').join('');
 put('pdDensityNote','Massa nella finestra · Q '+pct(q.cdf(hi)-q.cdf(lo))+(p?' / P '+pct(p.cdf(hi)-p.cdf(lo)):'')+'. Bande ombreggiate Q 5–95% e 25–75%. Linea bianca al riferimento '+fmt(S.reference)+'. Linee rosate ai limiti degli strike utilizzati.');
}

const cdfCursor={frame:null,price:null,result:null,coordinate:'',resize:0};
function resetCDF(){
 cdfCursor.frame=null;cdfCursor.price=null;cdfCursor.result=null;
 put('pdCdfReadout','Ricalcola la distribuzione per interrogare il prezzo.');
 const node=$('pdCDF');
 if(node){node.setAttribute('aria-disabled','true');node.setAttribute('aria-valuetext','Distribuzione da ricalcolare');node.removeAttribute?.('aria-valuenow');node.replaceChildren();}
 for(const id of ['pdCdfPrice','pdCdfLocate'])if($(id))$(id).disabled=true;
 put('pdCdfFeedback','');
}
function renderCDF(){
 if(!S.bundle||!S.valid||S.pending){resetCDF();return;}
 const host=$('pdCDF'),{q,p,settings}=S.bundle,[lo,hi]=extent();
 const W=QuantistesPlots.width(host,650),H=W<460?345:428;
 const L=W<460?38:49,R=W-16,T=29,B=H-38,steps=W<430?3:W<700?4:6;
 const x=k=>L+(k-lo)/(hi-lo)*(R-L),y=v=>B-v*(B-T),surv=$('pdCumulative').value==='survival';
 if(cdfCursor.result!==S.result||cdfCursor.coordinate!==settings.coordinate)cdfCursor.price=S.reference;
 cdfCursor.result=S.result;cdfCursor.coordinate=settings.coordinate;
 cdfCursor.frame={W,H,L,R,T,B,lo,hi,x,y,surv};
 let out=svg(W,H,surv?'Probabilità di chiusura sopra il prezzo':'Probabilità di chiusura fino al prezzo');
 out+=st(L,16,surv?'Probabilità sopra K':'Probabilità fino a K',C.muted,11);
 const bounds=S.bundle.diagnostics.liquid||[];
 for(const k of bounds){if(k<=lo||k>=hi)continue;out+=ln(x(k),T,x(k),B,C.red,.8,'3 5');}
 for(let i=0;i<=4;i++){const v=i/4;out+=ln(L,y(v),R,y(v),v===.5?'#2d567e':C.grid,1)+st(L-5,y(v)+4,i*25+'%',C.muted,10,'end');}
 for(let j=0;j<=steps;j++){
   const v=lo+(hi-lo)*j/steps;
   out+=ln(x(v),T,x(v),B,C.grid,.65,'2 4')+st(x(v),B+17,fmt(v,hi-lo<12?1:0),C.muted,10,j===0?'start':j===steps?'end':'middle');
 }
 out+=st(R,H-4,settings.coordinate==='native'?'Prezzo SPX cash':'Prezzo nello scenario ribasato',C.muted,10,'end');
 if(S.reference>=lo&&S.reference<=hi)out+=ln(x(S.reference),T,x(S.reference),B,C.muted,.9,'5 4');
 const count=Math.max(220,Math.min(680,Math.ceil(R-L)));
 for(const [d,color,dash] of [[q,C.q,''],[p,C.p,'5 3']]){
   if(!d)continue;
   const points=Array.from({length:count+1},(_,i)=>{const k=lo+(hi-lo)*i/count,v=surv?d.survival(k):d.cdf(k);return[k,v];});
   if(d===q)out+='<path d="'+path(points,x,y)+' L'+R+' '+B+' H'+L+'Z" fill="'+C.q+'" opacity=".055"/>';
   out+='<path d="'+path(points,x,y)+'" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-dasharray="'+dash+'"/>';
 }
 out+='<g id="pdCdfMarks" pointer-events="none"><line id="pdCdfVertical" y1="'+T+'" y2="'+B+'" stroke="'+C.white+'" stroke-width=".9" stroke-dasharray="3 3"/><line id="pdCdfHorizontal" x1="'+L+'" x2="'+R+'" stroke="'+C.q+'" stroke-opacity=".38" stroke-dasharray="3 4"/><circle id="pdCdfQMark" r="4" fill="'+C.q+'" stroke="#071525" stroke-width="1.2"/><circle id="pdCdfPMark" r="3.8" fill="'+C.p+'" stroke="#071525" stroke-width="1.2"/><g id="pdCdfTag"><rect x="-37" width="74" height="17" fill="'+C.white+'"/><text id="pdCdfTagValue" y="12" text-anchor="middle" fill="#061423" font-size="10"></text></g></g></svg>';
 host.innerHTML=out;
 host.setAttribute('aria-disabled','false');$('pdCdfPrice').disabled=false;$('pdCdfLocate').disabled=false;
 host.setAttribute('aria-valuemin',lo.toFixed(4));host.setAttribute('aria-valuemax',hi.toFixed(4));
 showCDFPrice(Number.isFinite(cdfCursor.price)?cdfCursor.price:q.quantile(.5));
}
function showCDFPrice(requested){
 const z=cdfCursor.frame;
 if(!z||!S.bundle||!S.valid||S.pending||!Number.isFinite(requested))return;
 const k=Math.max(z.lo,Math.min(z.hi,requested)),{q,p}=S.bundle;
 const qBelow=q.cdf(k),pBelow=p?p.cdf(k):NaN,qAbove=q.survival(k),pAbove=p?p.survival(k):NaN;
 const xpos=z.x(k),yq=z.y(z.surv?qAbove:qBelow);
 const attr=(id,props)=>{const node=$(id);if(node)for(const [key,value] of Object.entries(props))node.setAttribute(key,value);};
 cdfCursor.price=k;
 attr('pdCdfVertical',{x1:xpos,x2:xpos});attr('pdCdfHorizontal',{y1:yq,y2:yq});
 attr('pdCdfTag',{transform:'translate('+Math.max(z.L+37,Math.min(z.R-37,xpos))+','+(z.T+4)+')'});put('pdCdfTagValue',fmt(k));
 attr('pdCdfQMark',{cx:xpos,cy:yq});attr('pdCdfPMark',{visibility:p?'visible':'hidden',cx:xpos,cy:p?z.y(z.surv?pAbove:pBelow):0});
 attr('pdCDF',{'aria-valuenow':k.toFixed(4),'aria-valuetext':(S.bundle.settings.coordinate==='native'?'SPX cash ':'Prezzo ribasato ')+fmt(k)+', Q sotto '+pct(qBelow)+', Q sopra '+pct(qAbove)+'. '+(p?pLabel()+', sotto '+pct(pBelow)+', sopra '+pct(pAbove):'P indisponibile')});
 const zone=S.bundle.diagnostics.liquid;
 const wing=Array.isArray(zone)&&(k<zone[0]||k>zone[1])?' · ala estrapolata':'';
 const pInfo=p?'<span class="pd-p">'+esc(pLabel())+' ≤K '+pct(pBelow)+' · &gt;K '+pct(pAbove)+'</span>':'<span class="pd-p">P indisponibile</span>';
 $('pdCdfReadout').innerHTML='<strong>K '+fmt(k)+'</strong><span class="pd-q">Q ≤K '+pct(qBelow)+' · &gt;K '+pct(qAbove)+'</span>'+pInfo+'<small>'+esc(S.bundle.diagnostics.target.replace('T',' '))+' ET'+wing+'</small>';
 put('pdCdfFeedback','');
}
function bindCDF(){
 const host=$('pdCDF');
 const choosePointer=e=>{
   const z=cdfCursor.frame;if(!z||S.pending||!S.valid||e.isPrimary===false)return;
   const image=host.querySelector('svg');if(!image)return;
   const box=image.getBoundingClientRect();if(!(box.width>0))return;
   const ratio=(e.clientX-box.left)/box.width,local=(ratio*z.W-z.L)/(z.R-z.L);
   showCDFPrice(z.lo+local*(z.hi-z.lo));
 };
 host.addEventListener('pointerdown',e=>{
   if(e.isPrimary===false||e.button>0)return;choosePointer(e);
   if(e.pointerType==='touch'&&host.setPointerCapture)host.setPointerCapture(e.pointerId);
 });
 host.addEventListener('pointermove',choosePointer);
 host.addEventListener('keydown',e=>{
   const z=cdfCursor.frame;if(!z||S.pending||!S.valid)return;
   const prev=Number.isFinite(cdfCursor.price)?cdfCursor.price:S.reference;
   const step=(z.hi-z.lo)/Math.max(100,z.R-z.L);
   const one=(e.shiftKey?10:1)*step;
   const moves={ArrowLeft:prev-one,ArrowDown:prev-one,ArrowRight:prev+one,ArrowUp:prev+one,PageUp:prev+step*20,PageDown:prev-step*20,Home:z.lo,End:z.hi};
   if(Object.hasOwn(moves,e.key)){e.preventDefault();showCDFPrice(moves[e.key]);}
 });
 const locate=()=>{
   const node=$('pdCdfPrice'),v=node.valueAsNumber,z=cdfCursor.frame;if(!z||S.pending||!S.valid)return;
   if(!finite(v)||v<z.lo||v>z.hi){put('pdCdfFeedback','Inserisci un prezzo tra '+fmt(z.lo)+' e '+fmt(z.hi)+', oppure amplia la finestra grafica.');return;}
   showCDFPrice(v);
 };
 $('pdCdfLocate').addEventListener('click',locate);
 $('pdCdfPrice').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();locate();}});
 if(typeof ResizeObserver==='function'){
   const ro=new ResizeObserver(()=>{
     if(!host.clientWidth||!S.valid||S.pending||!S.bundle)return;
     const W=QuantistesPlots.width(host);
     if(cdfCursor.frame?.W===W||cdfCursor.resize)return;
     cdfCursor.resize=requestAnimationFrame(()=>{cdfCursor.resize=0;if(S.valid&&!S.pending&&S.bundle&&host.clientWidth)renderCDF();});
   });ro.observe(host);
 }
}

function renderBins(){
 const {q,p}=S.bundle,probs=[0,.01,.05,.16,.5,.84,.95,.99,1],inner=probs.slice(1,-1).map(a=>q.quantile(a)),cut=[-Infinity,...inner,Infinity];
 const pAccum=p?[0,...inner.map(k=>p.cdf(k)),1]:null;
 const bins=probs.slice(1).map((a,i)=>({q:a-probs[i],p:pAccum?pAccum[i+1]-pAccum[i]:null,
   label:i===0?'≤ Q1':i===7?'> Q99':'Q'+Math.round(100*probs[i])+'–Q'+Math.round(100*a),
   bounds:i===0?'S ≤ '+fmt(cut[1]):i===7?'S > '+fmt(cut[7]):fmt(cut[i])+' < S ≤ '+fmt(cut[i+1])}));
 const host=$('pdBins'),W=QuantistesPlots.width(host,610),H=348,L=76,R=Math.max(L+10,W-56),T=38,step=34,B=T+8*step;
 const top=Math.max(.01,...bins.map(b=>Math.max(b.q,b.p??0)))*1.04,X=v=>L+v/top*(R-L);
 let out=svg(W,H,'Massa per fasce di prezzo delimitate dai quantili Q');
 for(const t of QuantistesPlots.niceTicks(0,100*top,Math.max(2,Math.min(6,(R-L)/63))))out+=ln(X(t.v/100),T-8,X(t.v/100),B,C.grid,1,'2 3')+st(X(t.v/100),T-14,t.s+'%',C.muted,10,'middle');
 bins.forEach((b,i)=>{const y=T+i*step,desc=b.bounds+' · Q '+pct(b.q)+(p?' · P '+pct(b.p):'');
   out+='<g data-prob-bin="'+i+'" tabindex="0" role="button" aria-label="'+esc(desc)+'"><title>'+esc(desc)+'</title><rect x="0" y="'+(y-3)+'" width="'+W+'" height="25" fill="#c9defc" fill-opacity="0"/>'+st(L-8,y+11,b.label,C.muted,10,'end');
   out+='<rect x="'+L+'" y="'+y+'" width="'+(X(b.q)-L)+'" height="'+(p?6:9)+'" fill="'+C.q+'" opacity=".85"/>';
   if(p)out+='<rect x="'+L+'" y="'+(y+8)+'" width="'+Math.max(0,X(b.p)-L)+'" height="5" fill="'+C.p+'" opacity=".88"/>';
   out+=st(R+7,y+10,pct(b.q,1),C.q,10)+'</g>';
 });
 host.innerHTML=out+st(L,H-6,p?'Oro Q · azzurro P':'Massa per fascia · Q',C.muted,10)+'</svg>';
 const upd=i=>{const b=bins[i];if(b&&S.valid&&!S.pending)put('pdBinRead',b.bounds+'  ·  Q '+pct(b.q)+(p?'  ·  P '+pct(b.p):''));};
 host.querySelectorAll?.('[data-prob-bin]').forEach(el=>{const f=()=>upd(+el.getAttribute('data-prob-bin'));el.onfocus=el.onpointerenter=el.onclick=f;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
 put('pdBinRead','Seleziona una fascia per leggere gli estremi in punti SPX.');
}
function renderIntervalsChart(){
 const q=S.qSummary,p=S.pSummary,rows=q.intervals,host=$('pdIntervalChart'),W=QuantistesPlots.width(host,610),L=52,R=Math.max(L+4,W-24),T=41,step=41,B=T+rows.length*step,H=B+38;
 const all=rows.concat(p?.intervals||[]),lower=Math.min(...all.map(v=>v.lower)),upper=Math.max(...all.map(v=>v.upper)),pad=Math.max(1e-8,(upper-lower)*.045),lo=lower-pad,hi=upper+pad,x=v=>L+(v-lo)/(hi-lo)*(R-L);
 let out=svg(W,H,'Intervalli centrali a code uguali');
 for(const t of QuantistesPlots.niceTicks(lo,hi,Math.max(2,Math.min(6,(R-L)/72))))out+=ln(x(t.v),T-9,x(t.v),B,C.grid,.8,'2 4')+st(x(t.v),B+17,t.s,C.muted,10,'middle');
 out+=st(L,15,p?'Intervalli · Q / P':'Intervalli · Q',C.muted,11);
 rows.forEach((v,i)=>{const yy=T+i*step,pv=p?.intervals[i],range=(z,y,col)=>ln(x(z.lower),y,x(z.upper),y,col,3)+ln(x(z.lower),y-3,x(z.lower),y+3,col)+ln(x(z.upper),y-3,x(z.upper),y+3,col);
  out+='<g><title>'+esc(pct(v.coverage,1)+' · Q '+fmt(v.lower)+' – '+fmt(v.upper)+(pv?' / P '+fmt(pv.lower)+' – '+fmt(pv.upper):''))+'</title>'+st(L-8,yy+6,pct(v.coverage,Math.abs(v.coverage*100-Math.round(v.coverage*100))>.01?1:0),C.muted,10,'end')+range(v,yy,C.q)+(pv?range(pv,yy+7,C.p):'')+'</g>';
 });
 host.innerHTML=out+st(R,H-3,'Prezzo SPX',C.muted,10,'end')+'</svg>';
}

function renderTables(){const q=S.qSummary,p=S.pSummary,l=S.bundle.diagnostics.liquid;$('pdQuantiles').innerHTML=q.quantiles.map((v,i)=>{const pv=p?.quantiles[i].price??NaN,tail=v.price<l[0]||v.price>l[1];return `<tr class="${v.p===.5?'pd-row-mid':''}"><td>${pct(v.p,Math.abs(100*v.p-Math.round(100*v.p))>1e-8?1:0)}</td><td class="num pd-q">${fmt(v.price)}</td><td class="num pd-p">${fmt(pv)}</td><td class="num">${signed(pv-v.price)}</td><td><span class="pd-tag ${tail?'pd-tail':''}">${tail?'Ala extrapolata':'Fra strike quotati'}</span></td></tr>`;}).join('');$('pdIntervals').innerHTML=q.intervals.map((v,i)=>`<tr><td>${pct(v.coverage,0)}</td><td class="num pd-q">${fmt(v.lower)} — ${fmt(v.upper)}</td><td class="num pd-p">${fmt(p?.intervals[i].lower)} — ${fmt(p?.intervals[i].upper)}</td></tr>`).join('');
 renderIntervalsChart();}
function stat(label,q,p,unit=''){return `<div><div class="pd-stat-label">${esc(label)}</div><div class="pd-stat-line"><span class="pd-q">Q ${fmt(q)}${esc(unit)}</span><br><span class="pd-p">P ${fmt(p)}${esc(unit)}</span></div></div>`;}
function renderTails(){const q=S.qSummary,p=S.pSummary;$('pdTailStats').innerHTML=stat('Media del prezzo',q.mean,p?.mean)+stat('Moda numerica',q.mode,p?.mode)+stat('Asimmetria',q.skew,p?.skew)+stat('Curtosi in eccesso',q.excess,p?.excess)+stat('Movimento assoluto atteso',q.expectedAbsMove,p?.expectedAbsMove,' pt')+stat('Parte positiva E[(S−R)+]',q.upside,p?.upside,' pt')+stat('Parte negativa E[(R−S)+]',q.downside,p?.downside,' pt')+stat('Rendimento medio vs riferimento',q.expectedReturn*100,p?.expectedReturn*100,'%');$('pdTails').innerHTML=q.tailExpected.map((v,i)=>`<tr><td>${pct(v.alpha,1)}</td><td class="num pd-q">${fmt(v.lowerES)}</td><td class="num pd-p">${fmt(p?.tailExpected[i].lowerES)}</td><td class="num pd-q">${fmt(v.upperES)}</td><td class="num pd-p">${fmt(p?.tailExpected[i].upperES)}</td></tr>`).join('');}
function renderEvents(){if(!S.bundle)return;try{const a=num($('pdLower').value),b=num($('pdUpper').value);if(!(a>0&&b>0))throw new Error('Le soglie devono essere prezzi positivi.');const eq=D().event(S.bundle.q,a,b),ep=S.bundle.p?D().event(S.bundle.p,a,b):{};put('pdEventError','');$('pdEvents').innerHTML=[['Sotto la soglia inferiore','below','S ≤ '+fmt(a)],['Dentro l’intervallo','inside',fmt(a)+' < S ≤ '+fmt(b)],['Sopra la soglia superiore','above','S > '+fmt(b)]].map(([title,key,rule])=>`<div class="pd-event"><div class="pd-event-title">${title}</div><div class="pd-event-values"><span class="pd-q"><small>Q</small> ${pct(eq[key])}</span><span class="pd-p"><small>P</small> ${pct(ep[key])}</span></div><div class="pd-event-rule">${rule}</div></div>`).join('');put('pdEventNote','Rendimento dell’intervallo rispetto a '+fmt(S.reference)+': '+signed(100*(a/S.reference-1))+'% → '+signed(100*(b/S.reference-1))+'%. Le tre regioni sommano a 100% per ciascuna misura. Non è la probabilità che il prezzo resti nel range durante la seduta.');}catch(e){put('pdEventError',e.message);$('pdEvents').innerHTML='';}}
function audit(label,value){return `<div class="pd-audit-item"><label>${esc(label)}</label><div>${esc(value)}</div></div>`;}
function renderAudit(){const {q,p,diagnostics:g}=S.bundle;let stale='Nessun timestamp sottostante disponibile';const times=root.QuantCore.selectSnapshot(S.rows,S.result.cfg).rows.map(r=>r.spotTime).filter(Boolean).sort();if(times.length){const lag=(root.QuantCore.nyEpoch(g.snapshot)-root.QuantCore.nyEpoch(times.at(-1)))/60000;stale=times.at(-1).replace('T',' ')+' ET · '+fmt(lag,1)+' min prima delle quote';}const masserr=g.normalizationError;const items=[audit('Quote / fit',S.result.ws.info.observations+' quote · '+pct(S.result.ws.info.within,1)+' entro bid/ask'),audit('Forward nativo',fmt(S.result.ws.model.F)+' · fonte '+(S.result.forward?.source||S.result.forward?.method||'controllo delle quote')),audit('Sottostante nel CSV',stale),audit('Tempo usato per sconto e IV',S.result.cfg.overrideHours>0?'Ore forzate · '+fmt(S.result.cfg.overrideHours,3)+' h':fmt(S.result.T*365*24,3)+' h effettive'),audit('Finestra numerica di quadratura',fmt(q.support[0])+' → '+fmt(q.support[1])+' SPX'),audit('Massa Q oltre la finestra',g.omittedMass.toExponential(2)),audit('Massa oltre gli strike bilaterali','Q '+pct(g.qTailOutsideQuotes)+' · P '+pct(g.pTailOutsideQuotes)),audit('Errore di normalizzazione',finite(masserr)?masserr.toExponential(2):'—'),audit('Vincoli P · errore numerico',finite(p?.tilt?.error)?p.tilt.error.toExponential(2):'—'),audit('Divergenza KL(P ‖ Q)',finite(g.kl)?g.kl.toExponential(4):'—'),audit('Stato probabilità fisiche',p?p.provenance:g.pReason)];$('pdAudit').innerHTML=items.join('');}
async function sensitivity(){if(!S.valid||S.pending)return;const rev=S.revision,ref=S.reference,q=S.bundle.q,button=$('pdSensitivity');button.disabled=true;put('pdSensitivityGrid','Calcolo degli scenari…');try{const rows=[];for(const m of[-.25,0,.25]){const out=[];for(const v of[.8,1,1.2]){await new Promise(r=>setTimeout(r,0));if(rev!==S.revision)return;try{const p=D().physical(q,m,v);out.push({v,p:p.survival(ref)});}catch(e){out.push({v,error:e.message});}}rows.push({m,out});}if(rev!==S.revision)return;$('pdSensitivityGrid').className='';$('pdSensitivityGrid').innerHTML='<div class="tablewrap pd-sensitivity-table"><table><thead><tr><th>Media Δ / σQ</th><th>σP/σQ 0.80</th><th>σP/σQ 1.00</th><th>σP/σQ 1.20</th></tr></thead><tbody>'+rows.map(r=>'<tr><th>'+signed(r.m,2)+'</th>'+r.out.map(v=>v.error?'<td title="'+esc(v.error)+'">—</td>':`<td style="background:rgba(142,209,234,${.03+.19*v.p})" title="Media spostata ${r.m}σQ; dispersione ${v.v}×">${pct(v.p,1)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div><div class="pd-small">Evento: S > '+fmt(ref)+'. Scenario di media 0 = stessa media di Q. Tutte le celle sono P non calibrate.</div>';}catch(e){put('pdSensitivityGrid',e.message);}finally{button.disabled=false;}}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportCheck(diagnostic=false){if(!S.valid||S.pending||!S.bundle)throw new Error('Aggiorna prima la distribuzione.');if(!diagnostic&&S.bundle.diagnostics.quality==='red')throw new Error('Export sospeso: controlli di qualità non superati.');}
function filename(ext){return'Quantistes_Distribuzioni_'+S.result.cfg.expiry+'_'+S.bundle.settings.coordinate+'.'+ext;}
function saveCSV(){exportCheck();const lines=['measure,calibration,coordinate,horizon,reference,quantile,price,return_vs_reference'];for(const [name,s]of[['Q',S.qSummary],['P',S.pSummary]].filter(([,summary])=>summary))for(const v of s.quantiles)lines.push([name,name==='P'?S.bundle.diagnostics.pCalibration:S.bundle.settings.coordinate==='mapped'?'TRANSFORMED_SCENARIO':S.bundle.diagnostics.synthetic?'SYNTHETIC_IV_SCENARIO':S.bundle.q.status.toUpperCase(),S.bundle.settings.coordinate,S.bundle.diagnostics.target,S.reference,v.p,v.price,v.price/S.reference-1].join(','));download(filename('csv'),lines.join('\n'),'text/csv;charset=utf-8');}
function saveJSON(){exportCheck(true);const report=D().report(S.bundle,S.reference);report.input={files:root.Desk?.state.files.map(f=>f.name)||[],quoteRows:S.rows.length};report.fitAudit=root.QuantCore.report(S.result);report.scope='Terminal probabilities only; no path probabilities';const eventLower=num($('pdLower').value),eventUpper=num($('pdUpper').value);if(eventLower>0&&eventUpper>=eventLower)report.selectedEvent={lower:eventLower,upper:eventUpper,reference:S.reference,q:D().event(S.bundle.q,eventLower,eventUpper),p:S.bundle.p?D().event(S.bundle.p,eventLower,eventUpper):null};report.levelRisk=root.DistributionExtensions?.report?.()||null;report.references=['https://www.gsb.stanford.edu/faculty-research/working-papers/prices-state-contingent-claims-implicit-option-prices','https://www.bankofengland.co.uk/working-paper/2012/estimating-probability-distributions-of-future-asset-prices','https://www.newyorkfed.org/research/staff_reports/sr677.html'];report.qualityUsage=S.bundle.diagnostics.quality==='red'?'DIAGNOSTIC_ONLY':'MODEL_CONDITIONAL';download(filename('json'),JSON.stringify(report,null,2),'application/json');}
function saveSVG(){exportCheck();const sv=$('pdDensity').querySelector('svg').cloneNode(true);sv.querySelector('#pdHoverSurface')?.remove();sv.querySelector('#pdCrosshair')?.remove();const disclaimer=document.createElementNS('http://www.w3.org/2000/svg','text');const ow=S.view.W,oh=S.view.H;sv.setAttribute('viewBox','0 0 '+ow+' '+(oh+30));sv.setAttribute('width',ow);sv.setAttribute('height',oh+30);const foot=document.createElementNS('http://www.w3.org/2000/svg','rect');foot.setAttribute('x','0');foot.setAttribute('y',oh);foot.setAttribute('width',ow);foot.setAttribute('height','30');foot.setAttribute('fill',C.bg);sv.appendChild(foot);disclaimer.setAttribute('x','12');disclaimer.setAttribute('y',oh+18);disclaimer.setAttribute('font-size','10');disclaimer.setAttribute('fill',C.muted);disclaimer.textContent=(ow<480?'':pLabel()+' · ')+S.bundle.diagnostics.target+' ET';sv.appendChild(disclaimer);download(filename('svg'),new XMLSerializer().serializeToString(sv),'image/svg+xml;charset=utf-8');}
function guard(fn){return(...args)=>{try{const p=fn(...args);if(p&&typeof p.catch==='function')p.catch(e=>message(e.message,true));}catch(e){message(e.message,true);}};}
function dirty(referenceOnly=false){resetCDF();clearPDFProbe();S.pending=true;S.revision++;root.dispatchEvent(new CustomEvent('quantistes:research-stale',{detail:{all:false}}));toggleExports();for(const id of ['pdKpis','pdDensity','pdHover','pdQuantileStrip','pdCDF','pdBins','pdEvents','pdQuantiles','pdIntervals','pdIntervalChart','pdTailStats','pdTails','pdSensitivityGrid','pdAudit','pdExtensions'])$(id)?.classList.add('pd-dirty');put('pdScenarioCaption',referenceOnly===true?'Riferimento modificato: premi «Calcola probabilità». I risultati attenuati appartengono al riferimento precedente.':'Ipotesi modificate: premi «Applica modello». I risultati attenuati appartengono allo scenario precedente.');}
function getState(){return{bundle:S.bundle,result:S.result,reference:S.reference,valid:S.valid&&!S.pending,rows:S.rows};}
function clearPDFProbe(){$('pdDensitySlider').oninput=null;$('pdDensitySlider').disabled=true;put('pdBinRead','');put('pdHover','—');}
function init(){if(!$('view-distributions'))return;
 for(const [id,draw] of [['pdDensity',renderDensity],['pdBins',renderBins],['pdIntervalChart',renderIntervalsChart]])QuantistesPlots.onWidth($(id),()=>{if(S.valid&&!S.pending&&S.bundle&&$('view-distributions').classList.contains('active'))draw();});
 bindPhysical();bindCDF();$('pdApply').onclick=guard(update);for(const id of ['pdMean','pdVol'])$(id).addEventListener('input',dirty);$('pdCoordinate').onchange=guard(update);$('pdWindow').onchange=guard(()=>{if(S.valid){renderDensity();renderCDF();}});$('pdCumulative').onchange=guard(()=>{if(S.valid)renderCDF();});$('pdShowIppo').onchange=guard(()=>{if(S.valid)renderDensity();});for(const id of ['pdLower','pdUpper'])$(id).addEventListener('input',()=>{$('pdEvents').innerHTML='';put('pdEventError','');put('pdEventNote','Soglie modificate: premi «Calcola probabilità» per aggiornare le tre regioni.');});$('pdReference').addEventListener('input',()=>dirty(true));$('pdEventApply').onclick=guard(()=>{if(!S.valid)throw new Error('Calcola prima la distribuzione.');update();});$('pdSensitivity').onclick=guard(sensitivity);$('pdCSV').onclick=guard(saveCSV);$('pdJSON').onclick=guard(saveJSON);$('pdSaveSVG').onclick=guard(saveSVG);document.querySelectorAll('[data-pd-preset]').forEach(b=>b.onclick=guard(()=>{$('pdMean').value='0';$('pdVol').value=b.dataset.pdPreset==='compression'?'.85':b.dataset.pdPreset==='stress'?'1.2':'1';update();}));toggleExports();}
root.DistributionUI={render,invalidate,getState,update,mergePIT(rows){historyBook.rows=D().mergeHistory(historyBook.rows,rows);if(S.result?.ws&&S.valid&&!S.pending)update();return historyBook.rows.length;}};init();
})(globalThis);

