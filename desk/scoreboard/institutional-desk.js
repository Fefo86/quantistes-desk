

(function(root){
'use strict';
const M=root.DeskMeasures,$=id=>document.getElementById(id);
const fmt=(v,n=1)=>Number.isFinite(v)?v.toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const signed=(v,n=1)=>Number.isFinite(v)?(v>0?'+':'')+fmt(v,n):'—';
const pct=v=>Number.isFinite(v)?fmt(100*v,1)+'%':'—';
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const txt=(id,t)=>{const node=$(id);if(node&&node.textContent!==String(t))node.textContent=t;};
const stageNames={score:'Scoreboard',market:'Volatilità',dealer:'Dealer flow',path:'Probabilità fisica',audit:'Ricerca',reports:'Report istituzionali',scalp:'Scalping su flussi'};
const stageSubs={score:'Decisione ES',market:'Mark CVI · distribuzione Q · livelli',dealer:'Inventario · scenari di copertura',path:'Percorsi · eventi · rischio',audit:'Qualità del modello · verifica storica',reports:'Letture datate e grafici per indicatore',scalp:'Strike e copertura condizionale'};
const roles={
 'scalp-indicator':'Flussi, coperture e retest allo strike e al cutoff ES',decision:'Segnale storico e validità del campione',atlas:'Livelli SPX, eventi e focus strike',skewfit:'Mark e digitali Q al fixing',levels:'Riferimenti di prezzo SPX',implied:'Sensibilità per contratto',volcube:'Dominio multiscadenza',surface:'Varianza forward',tailrisk:'Rischio e limiti di identificazione',export:'Livelli per il chartbook',
 'flow-ops':'Sorgenti dealer e orologi','flow-overview':'Campi delle greche da flussi e inventario','flow-position':'Concentrazione di inventario','flow-hedge':'Sensibilità della copertura','flow-paths':'Scenari di flusso',signed:'Inventario per strike',gammaatlas:'Campi per strike o spot e concentrazione',
 'dynamic-p':'Distribuzione SPX dal cutoff','physical-p':'SPX alle 09:45 ET',espath:'Corridoi ES a cinque minuti',realized:'Legge fisica ES a orizzonte selezionato',distributions:'Confrontabilità Q e P',history:'Provenienza delle osservazioni',research:'Rischio sugli eventi',
 regime:'Regime VIX/VVIX e copertura fuori campione',audit:'Qualità mark e osservazioni',systematic:'Risultati storici','report-charts':'Serie dei report con fonte, data e unità','report-archive':'Report, pagine e osservazioni',method:'Definizione degli eventi',registry:'Fonti degli indicatori',matrix:'Copertura delle fonti'
};
let archive=null,cache=null,frame=null,cohort=null,side=1,chartMode='fan',inspected=null,ledgerKey='',chartKey='',busy=false,manual=false,activeOrigin=null,staleReason='',evidenceCache=null,lastSnapshot='',lastMark=null,scheduled=0,settled=false;
const plotId='deskOutcomeChart';
const templates={
 controls:`<form id="deskParameters" class="desk-parameters"><label>Fonte ES<select id="deskMode"><option value="archive">Archivio ES</option><option value="feed">Snapshot ES</option></select></label><label>Seduta ET<input id="deskDate" type="date" required></label><label>Partenza ET<input id="deskStart" type="time" min="09:30" max="15:54" step="60" value="09:45" required></label><label>Orizzonte<select id="deskH">${[5,10,15,20,30,45,60,90,120,180,240,300,360,'close'].map(n=>'<option '+(n===30?'selected':'')+' value="'+n+'">'+(n==='close'?'→ 15:59 ET':n+' min')+'</option>').join('')}</select></label><label>VIX ± banda<input id="deskBand" type="number" min="0.1" max="100" step="0.1" value="8" required></label><label>Target · tick<input id="deskTarget" type="number" min="1" max="1200" value="16" required></label><label>Stop · tick<input id="deskStop" type="number" min="1" max="1200" value="12" required></label><label>Costo A/R · tick<input id="deskCost" type="number" min="0" max="100" step="0.1" value="1" required></label><button class="desk-apply" type="submit">APPLICA ↵</button></form>`,
 body:`<div class="desk-lead"><div class="desk-decision"><div class="desk-kicker"><i></i> SEGNALE ES <span id="deskRun">ARCHIVIO</span></div><strong class="desk-verdict" id="deskVerdict">ATTESA</strong><p id="deskReason">Seleziona la seduta e l’orizzonte.</p><div class="desk-split"><div><small>Orizzonte ES</small><b id="deskBias">—</b></div><div><small>Misura</small><b>P storica</b></div></div></div><div class="desk-readout"><div><small>SEDUTA / NEW YORK</small><strong id="deskSession">—</strong><span id="deskPeriod">—</span></div><div><small>VIX ALL’ORIGINE</small><strong id="deskVix">—</strong><span id="deskVixContext">—</span></div><div><small>SEDUTE AMMESSE</small><strong id="deskCount">—</strong><span id="deskSupport">—</span></div></div></div>
 <section id="deskImpact" class="da-panel" aria-label="Attribuzione del segnale e priorità dei playbook"><div id="deskImpactMain"></div></section>
 <section id="deskScalpTape" hidden aria-label="Conferme tattiche da option flow"></section>
 <div class="desk-main-grid"><section class="desk-figure" aria-labelledby="deskFigTitle"><div class="desk-chart-head"><div><div class="desk-kicker">ES / LEGGE FISICA</div><h2 id="deskFigTitle">Percorsi a termine</h2></div><div class="desk-switch" aria-label="Vista del grafico"><button data-desk-mode="fan" aria-pressed="true">FAN</button><button data-desk-mode="events" aria-pressed="false">EVENTI</button></div></div><div id="deskLegend" class="desk-legend"></div><div class="desk-plot-wrap"><svg font-family="Consolas" id="deskOutcomeChart" class="desk-chart" viewBox="0 0 930 389" tabindex="0" role="img" aria-label="Distribuzione empirica ES. Usa le frecce per ispezionare i minuti."></svg></div><div class="desk-readline" id="deskReadLine">—</div><output id="deskCellData"></output></section>
 <section class="desk-payoff"><div class="desk-chart-head"><div><div class="desk-kicker">ES / BARRIERE</div><h2>Esito del setup</h2></div><div class="desk-switch"><button data-desk-side="1" aria-pressed="true">LONG</button><button data-desk-side="-1" aria-pressed="false">SHORT</button></div></div><div id="deskEvents" class="desk-events"></div><div class="desk-pay-bottom"><small>RISULTATO MEDIO DOPO COSTO IPOTIZZATO</small><strong id="deskMean">—</strong><span id="deskCI">—</span></div><div id="deskOutnote" class="desk-outnote"></div></section></div>
 <section class="desk-ledger"><div class="desk-ledger-head"><h2>Indicatori della seduta</h2></div><div class="desk-table-scroll"><table><thead><tr><th>Indicatore</th><th>Misura osservata</th><th>Origine / orizzonte</th><th>Uso nella decisione</th><th></th></tr></thead><tbody id="deskLedgerRows"></tbody></table></div></section>
`
};
function setup(){
 if($('deskBoard'))return;
 const parent=document.querySelector('[data-q13-panel="score"]');if(!parent||!root.QuantistesFlatDesk)return;
 const el=document.createElement('div');el.id='deskBoard';el.innerHTML=templates.controls+'<div id="deskStatus" class="desk-status" role="status" hidden></div>'+templates.body;parent.append(el);root.DeskPlaybooks.mount(el);
 const title=parent.querySelector('.q13-screen-title');
 const path=document.querySelector('[data-q13-panel="path"]'),inputs=$('q13Spot')?.closest('.q13-inputgrid');
 if(path&&inputs){inputs.classList.add('desk-path-inputs');const anchor=path.querySelector('.q25-toolbar')||path.querySelector('.q13-screen-title');anchor?.after(inputs);}
 for(const [key,name] of Object.entries(stageNames)){
   const h=document.querySelector('[data-q13-panel="'+key+'"] .q13-screen-title h1');
   if(h)h.textContent=name;
 }
 const brand=document.querySelector('.q13-header .q13-brand strong');if(brand)brand.textContent='QUANTISTES';
 if(title){const btn=document.createElement('button');btn.type='button';btn.className='desk-title-action';btn.textContent='Parametri sessione ↗';btn.onclick=()=>root.Quantistes15.settings();title.append(btn);}
 $('deskParameters').addEventListener('submit',ev=>{ev.preventDefault();manual=false;staleReason='';calculate();});
 $('deskParameters').addEventListener('input',ev=>{if(ev.target.id==='deskMode')syncLocks();manual=false;staleReason='Parametri modificati. Applica per aggiornare il frame.';invalidate(staleReason);});
 $('deskParameters').addEventListener('invalid',()=>invalidate('Controlla orologio, soglie, banda VIX e costo.'),true);
 el.addEventListener('click',ev=>{const mode=ev.target.closest('[data-desk-mode]'),dir=ev.target.closest('[data-desk-side]'),jump=ev.target.closest('[data-desk-go]');
   if(jump){if(jump.dataset.deskGo==='scalp-indicator'&&root.ScalpAttribution&&frame?.settings){root.ScalpAttribution.open(frame.settings.cutMs);return;}if(jump.dataset.deskGo==='report-charts'&&root.ReportWorkspace)root.ReportWorkspace.atDesk();else root.QuantistesFlatDesk.go(jump.dataset.stage,jump.dataset.deskGo);return;}
   if(dir){side=Number(dir.dataset.deskSide);chartKey='';drawSetup();}if(mode){chartMode=mode.dataset.deskMode;chartKey='';drawSetup();}
 });
 const svg=$(plotId);svg.addEventListener('pointermove',ev=>{if(!frame?.ready||svg._pinned)return;const point=svg.createSVGPoint();point.x=ev.clientX;point.y=ev.clientY;const transform=svg.getScreenCTM();if(!transform)return;const xy=point.matrixTransform(transform.inverse()),i=Math.max(0,Math.min(frame.settings.h,Math.round((xy.x-58)*frame.settings.h/754)));inspect(i);if(xy.x>=58&&xy.x<=812)root.DeskStudio.cell(ev,svg,svg._desk,xy,i);});
 svg.addEventListener('click',()=>{if(frame?.ready)svg._pinned=!svg._pinned;});svg.addEventListener('pointerleave',()=>{if(svg._pinned)return;inspect(frame?.settings?.h);if($('deskHorizontal'))$('deskHorizontal').style.display='none';if(svg._desk?.mesh)txt('deskCellData','Clic per fissare la fascia selezionata.');});
 svg.addEventListener('keydown',ev=>{if(ev.key==='Escape'){svg._pinned=false;return;}if(!frame?.ready||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const h=frame.settings.h;inspect(ev.key==='Home'?0:ev.key==='End'?h:Math.min(h,Math.max(0,(inspected??h)+(ev.key==='ArrowLeft'?-1:1))));});
 document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='k'&&!ev.repeat){ev.preventDefault();root.Quantistes15?.search?.();}});
 settled=true;
}
function syncLocks(){const feed=$('deskMode').value==='feed';$('deskDate').disabled=feed;$('deskStart').disabled=feed;}
function loadArchive(){
 const rev=root.DeskMarkets?.revision()||0;
 if(archive){if(archive.rev!==rev){archive.rev=rev;archive.dates=[...new Set([...archive.days.keys(),...(root.DeskMarkets?.esDates()||[]).map(M.dateKey)])].sort((a,b)=>a-b);}return true;}
 const data=root.Quantistes360?.data?.();if(!data?.rows?.length)return false;
 const map=new Map();for(const row of data.rows){let day=map.get(row[9]);if(!day){day=new Map();map.set(row[9],day);}day.set(row[1],row[0]/100);}
 archive={days:map,rev,dates:[...new Set([...map.keys(),...(root.DeskMarkets?.esDates()||[]).map(M.dateKey)])].sort((a,b)=>a-b)};return true;
}
function source(){return root.QuantistesConfluence?.evidence?.()||{};}
function read(originOverride){
 const feed=$('deskMode').value==='feed',snap=source().snapshot;
 let date=$('deskDate').value,t=$('deskStart').value,vix=null,cutMs=null,spot=null,vixStamp=null;
 if(feed){
   const c=M.clock(snap?.asof);if(!c)throw Error('Carica uno snapshot ES con data, ora e fuso nel Data Hub.');
   // The historical cohort begins on whole-minute boundaries. A later quote cannot condition the previous boundary.
   date=c.date;const t0=c.minute+(c.second>0||M.stamp(snap.asof)%1000!==0?1:0);t=M.timeET(t0);
   $('deskDate').value=date;$('deskStart').value=t;
   const timing=M.priceClockError(snap);if(timing)throw Error(timing);cutMs=M.stamp(snap.asof);vixStamp=M.stamp(snap.vix?.asof);
   vix=M.number(snap.vix.value);spot=snap.es?.last;
 }
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^\d\d:\d\d$/.test(t))throw Error('Seleziona una seduta e un minuto ET validi.');
 const parts=t.split(':').map(Number),start=parts[0]*60+parts[1],before=M.dateKey(date),band=M.number($('deskBand').value),h=$('deskH').value==='close'?959-start:Number($('deskH').value),target=M.number($('deskTarget').value),stop=M.number($('deskStop').value),cost=M.number($('deskCost').value);
 if(start<570||start>954||parts[1]>59||!Number.isInteger(h)||h<=0||start+h>959)throw Error('L’archivio ES copre le partenze 09:30–15:54 ET e termina alle 15:59 ET. Riduci l’orizzonte.');
 if(!feed){
   const imported=root.DeskMarkets?.origin(before,start);vix=originOverride?.vix??archive.days.get(before)?.get(start)??imported?.vix??null;
   spot=originOverride?.spot??imported?.spot??null;
   cutMs=root.QuantCore.nyEpoch(date+'T'+t+':00');
 }
 if(!(vix>=6&&vix<=100))throw Error('VIX di origine assente per la seduta e il minuto selezionati.');
 if(!(band>=.1&&band<=100)||![target,stop].every(x=>Number.isSafeInteger(x)&&x>=1&&x<=1200)||cost===null||cost<0||cost>100)throw Error('Usa target e stop in tick interi positivi, una banda VIX e un costo A/R validi.');
 return {date,before,start,h,spot:spot??null,vix,band,target,stop,cost,cutMs,source:feed?'SNAPSHOT ES':originOverride?'SCENARIO ES':'ARCHIVIO ES'};
}
function invalidate(reason,settings=null,count=null){
 frame={ready:false,settings,reason,n:count??null};cohort=null;cache=null;chartKey='';activeOrigin=settings;
 if($('deskBoard'))$('deskBoard').dataset.signal='ATTESA';txt('deskReason',reason);txt('deskVerdict','ATTESA');txt('deskBias','—');txt('deskRun',$('deskMode').value==='feed'?'SNAPSHOT ES':'ARCHIVIO ES');
 txt('deskSession',settings?.date||'—');txt('deskPeriod',settings?M.timeET(settings.start)+' ET':'—');txt('deskVix',fmt(settings?.vix,2));txt('deskCount',Number.isFinite(count)?String(count):'—');txt('deskVixContext','VIX spot');txt('deskSupport','Minimo 25 sedute');
 $('deskStatus').hidden=false;txt('deskStatus',reason);drawSetup();refreshEvidence();root.dispatchEvent(new CustomEvent('desk:frame-changed'));
}
function calculate(override){
 if(!loadArchive()||!settled)return;
 let c;try{c=read(override);const s=root.QuantistesRealizedMulti.analyze({before:c.before,start:c.start,h:c.h,spot:c.spot??0,vix:c.vix,band:c.band,target:c.target*M.tick});
 if(s.N<M.minSessions){invalidate('Campione insufficiente · '+s.N+' sedute ammesse su un minimo di '+M.minSessions+'.',c,s.N);return;}
 const long=M.barriers(s.sel,1,c.target,c.stop,c.cost),short=M.barriers(s.sel,-1,c.target,c.stop,c.cost);
 cohort=s;cache={long,short};frame={ready:true,settings:c,n:s.N,long,short,bias:M.choice(long,short),walk:M.foldTest(long,short),trainFrom:s.sel[0].date,trainThrough:s.sel.at(-1).date};activeOrigin=c;
 $('deskStatus').hidden=true;txt('deskRun',c.source);txt('deskVerdict',frame.bias==='NEUTRALE'?'NEUTRALE':'BIAS '+frame.bias);txt('deskBias',c.h+' min');txt('deskSession',c.date);txt('deskPeriod',M.timeET(c.start)+' → '+M.timeET(c.start+c.h)+' ET');
 txt('deskVix',fmt(c.vix,2));txt('deskVixContext','banda ±'+fmt(c.band,1)+' punti');txt('deskCount',String(s.N));txt('deskSupport','1 finestra per seduta');chartKey='';drawSetup();refreshEvidence();root.dispatchEvent(new CustomEvent('desk:frame-changed'));
 }catch(err){invalidate(err.message||String(err),c);}
}
function exportFrame(){
 const c=frame?.settings;const resolved=decision();
 const brief=v=>v?{counts:v.count,probabilities:v.p,netTicks:v.risk}:null;
 return {schema:'quantistes.es.analysis_frame.2',asof:c?new Date(c.cutMs).toISOString():null,generatedAt:new Date().toISOString(),instrument:{root:'ES',contract:c?.source==='SNAPSHOT ES'?source().snapshot?.es?.contract||null:null,tickSize:.25},
 setup:c||null,monitoring:'1m close, first observed barrier or timeout; model marking at observed close',institutional_fusion:c?root.ReportSignals?.integrate(root.InstReports?.peek(c.cutMs),c)||[]:[],decision:{institutionalFilter:resolved.filter,signal:frame?.ready?resolved.signal:'ATTESA',historicalPreference:frame?.bias??null,reason:$('deskReason').textContent},scalping_observed:c?root.ScalpAttribution?.at(c.cutMs)||null:null,decision_attribution:root.DeskTriage?.compactDecision(frame,resolved,root.DeskPlaybooks.snapshot())||null,cohort:{n:frame?.n,from:frame?.trainFrom||null,through:frame?.trainThrough||null},long:brief(frame?.long),short:brief(frame?.short),rolling:frame?.walk||null,evidence:evidenceCache||[],studies:studiesCache,institutional_history:root.InstHistory?.peek(frame,cohort)||[],institutional_reports:c?root.InstReports?.peek(c.cutMs)||null:null,option_trades:c?root.InstTape?.at(c.cutMs)||[]:[],playbooks:root.DeskPlaybooks.snapshot(),greekSources:root.DeskFields.summary(c?.cutMs)};
}
function drawSetup(){
 if(!settled)return;document.querySelectorAll('[data-desk-side]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.deskSide===side)));document.querySelectorAll('[data-desk-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.deskMode===chartMode)));
 const a=side===1?cache?.long:cache?.short,n=frame?.n;
 const events=[['target','Target prima dello stop','positive'],['stop','Stop prima del target','negative'],['timeout','Scadenza del tempo','quiet']];
 $('deskEvents').innerHTML=events.map(([k,name,col])=>`<div class="desk-event ${col}"><div><label>${name}</label><b>${pct(a?.p?.[k])}</b></div><div class="desk-meter"><i style="width:${a?100*a.p[k]:0}%"></i></div><small>${a?a.count[k]+' / '+n+' sedute':'—'}</small></div>`).join('');
 txt('deskMean',a?signed(a.risk.mean,2)+' tick':'—');txt('deskCI',a?'IC 95% media  '+signed(a.risk.lo,2)+'  /  '+signed(a.risk.hi,2)+' tick':'—');
 txt('deskOutnote',a?'Costo A/R '+fmt(frame.settings.cost,1)+' tick · uscite osservate al minuto.':'In attesa di un campione utilizzabile.');
 const f=frame?.walk;txt('deskWF',f?f.test+' origini di test · '+f.active+' preferenze direzionali · '+signed(f.total,1)+' tick modellati cumulati · '+signed(f.perOrigin,2)+' tick per origine (flat inclusi).':'—');
 drawChart();
}
const palette={gold:'#efbb77',mid:'#efbb77',lo:'#9bbde0',grid:'#2e4453',red:'#ed939f',green:'#75d5b2',open:'#89b7ff',muted:'#adbfcb'};
function drawChart(){
 const svg=$(plotId),c=frame?.settings,h=c?.h||0;
 txt('deskFigTitle',chartMode==='fan'?'Distribuzione dei percorsi':'Raggiungimento delle barriere');
 $('deskLegend').innerHTML=chartMode==='fan'?'<span><i class="heatkey"></i>Massa per fascia · 0,4% / 2,7% / 12% / ≥50%</span><span><i class="legMed"></i>Mediana / P05–P95</span><span>Profilo terminale a destra</span>':'<span><i class="legTarget"></i>Target prima</span><span><i class="legStop"></i>Stop prima</span><span><i class="legOpen"></i>Ancora aperti</span>';
 if(!frame?.ready){svg._pinned=false;svg._desk=null;txt('deskCellData','');svg.innerHTML='<text x="465" y="175" text-anchor="middle" fill="#98b1ca" font-size="15">Campione non disponibile per questi parametri</text>';txt('deskReadLine','—');return;}
 const q=cohort.qr,a=side===1?frame.long:frame.short,ev=chartMode==='events';svg.setAttribute('viewBox',ev?'0 0 840 389':'0 0 930 389');
 const hitT=Array(h+1).fill(0),hitS=Array(h+1).fill(0);
 for(const o of a.outcomes)if(o.event==='target')hitT[o.minute]++;else if(o.event==='stop')hitS[o.minute]++;
 const curves=[];let kt=0,ks=0;for(let i=0;i<=h;i++){kt+=hitT[i];ks+=hitS[i];curves.push([kt/a.n,ks/a.n,(a.n-kt-ks)/a.n]);}
 const take=side*c.target/4,cut=-side*c.stop/4;
 const lo=ev?0:Math.min(0,cut,take,...q.map(v=>v[0])),hi=ev?1:Math.max(0,cut,take,...q.map(v=>v[4]));
 const pad=ev?0:Math.max(.25,(hi-lo)*.06),bottom=lo-pad,top=hi+pad;
 const X=t=>58+754*t/h,Y=v=>342-315*(v-bottom)/(top-bottom);
 const pts=f=>Array.from({length:h+1},(_,i)=>X(i).toFixed(2)+','+Y(f(i)).toFixed(2));
 const line=(f,color,w=2,d='')=>'<polyline points="'+pts(f).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="'+w+'" '+(d?'stroke-dasharray="'+d+'"':'')+'/>';
 const fill=(i,j,col)=>'<polygon points="'+pts(t=>q[t][i]).concat(pts(t=>q[t][j]).reverse()).join(' ')+'" fill="'+col+'"/>';
 let mesh=null;let chart='';for(let i=0;i<=6;i++){const v=bottom+(top-bottom)*i/6,y=Y(v);chart+=`<path d="M58 ${y}H812" stroke="${palette.grid}" stroke-dasharray="2 5"/><text x="49" y="${y+4}" text-anchor="end">${ev?Math.round(v*100)+'%':fmt(v,1)}</text>`;}
 for(const t of [...new Set(Array.from({length:6},(_,i)=>Math.round(h*i/5)))])chart+=`<path d="M${X(t)} 27V342" stroke="#1f3a53"/><text x="${X(t)}" y="369" text-anchor="middle">${M.timeET(c.start+t)}</text>`;
 if(!ev){
   mesh=root.DeskStudio.densityMesh(cohort.sel,h,bottom,top,X,Y);chart+=mesh.svg+line(t=>q[t][0],palette.lo,1.25,'4 3')+line(t=>q[t][4],palette.lo,1.25,'4 3')+line(t=>q[t][2],'#0a2035',4.7)+line(t=>q[t][2],palette.gold,2.65);
   chart+=`<path d="M58 ${Y(0)}H812" stroke="#99b3ca" stroke-dasharray="2 6"/><path d="M58 ${Y(take)}H812" stroke="${palette.green}" stroke-dasharray="6 5"/><path d="M58 ${Y(cut)}H812" stroke="${palette.red}" stroke-dasharray="2 5"/>`;
 }else chart+=line(t=>curves[t][0],palette.green,2.6)+line(t=>curves[t][1],palette.red,2.6,'8 4')+line(t=>curves[t][2],palette.open,2,'2 4');
 chart+='<text x="58" y="14">'+(ev?'FREQUENZA CUMULATA / STATO APERTO':'Δ ES · PUNTI')+'</text><text x="812" y="14" text-anchor="end">ET</text><g class="desk-cursor" pointer-events="none"><line id="deskHorizontal" x1="58" x2="812" stroke="#9fc3f4" opacity=".65" stroke-dasharray="3 4" style="display:none"/><line id="deskCross" y1="27" y2="342" stroke="#ede4ce" stroke-dasharray="3 4"/><circle id="deskDot" r="4" stroke="#081829" stroke-width="2" fill="#dcdaca"/></g>';
 svg.innerHTML=chart;svg._desk={X,Y,q,curves,h,ev,mesh};svg._pinned=false;txt('deskCellData',ev?'La somma dei tre stati è il 100% a ogni minuto.':'Muovi il cursore per leggere la frequenza nella fascia. Clic per fissare.');inspect(h);
}
function inspect(i){
 if(!Number.isInteger(i)||!frame?.ready)return;const v=$(plotId)._desk;if(!v||i>v.h)return;
 inspected=i;const p=v.q[i],c=v.curves[i],t=v.X(i);
 $('deskCross').setAttribute('x1',t);$('deskCross').setAttribute('x2',t);$('deskDot').setAttribute('cx',t);$('deskDot').setAttribute('cy',v.Y(v.ev?c[0]:p[2]));
 txt('deskReadLine',M.timeET(frame.settings.start+i)+' ET   /   '+(v.ev?'Target '+pct(c[0])+'   ·   Stop '+pct(c[1])+'   ·   Aperti '+pct(c[2]):'P05 '+signed(p[0],2)+'   ·   P50 '+signed(p[2],2)+'   ·   P95 '+signed(p[4],2)+' pt ES'));
}
function row(group,stage,tool,value,origin,role,status='context',detail=''){return {group,stage,tool,value,origin,role,status,detail};}
function makeEvidence(){
 const e=source(),snap=e.snapshot,c=frame?.settings,cut=c?.cutMs,qstate=root.Desk?.state,r=!qstate?.stale?qstate?.result:null;
 const q=r?.ws?.qAudit?.passed&&r?.calibration?.certificate==='CERTIFIED'?r:null,qt=q?root.QuantCore.nyEpoch(q.cfg.asof):null;
 const qCo=!!q&&M.recent(qt,cut,300),p=root.QuantistesDynamic?.stats?.(),p09=root.QuantistesPhysical?.stats?.(),lad=e.ladder;
 const verified=!!(lad?.signed&&lad.provenance==='PROVIDER_OBSERVED'&&lad.dealer_position_identified&&qCo&&q.cfg.expiry===lad.expiry&&M.recent(M.stamp(lad.asof),cut,300));
 const lsum=lad?.rows?.reduce((v,x)=>v+x.gamma,0),surf=root.CVIModelRouter?.group?.(),flex=surf&&root.CVIModelRouter?.peekFlexible?.(surf);
 const flow=root.FlowDesk?.stats?.(),sel=root.Quantistes16?.lastStrike;
 const rows=[];
 rows.push(row('P fisica ES','path','realized',frame?.ready?frame.n+' sedute · P↑ '+pct(cohort.up/cohort.N):'Campione in attesa',c?c.date+' · '+M.timeET(c.start)+' ET / '+c.h+' min':'ES · storico a 1 minuto',frame?.ready?'Payoff e barriere':'Sospeso',frame?.ready?'used':'missing',frame?.ready?'Train '+M.dayISO(frame.trainFrom)+' → '+M.dayISO(frame.trainThrough):''));
 rows.push(row('Regime VIX','path','espath',c?'VIX '+fmt(c.vix,2)+' ± '+fmt(c.band):'Origine assente',c?c.source+' · '+M.timeET(c.start)+' ET':'VIX spot / ET',c?'Filtro del campione':'In attesa',c?'used':'missing','Il VIX seleziona le sedute una volta.'));
 rows.push(row('Mark CVI / Q','market','skewfit',q?'IV ATM '+pct(q.ws.ivATM)+' · F '+fmt(q.forward.F,2):'Chain in attesa',q?q.cfg.asof.replace('T',' ')+' ET → '+q.cfg.expiry:'SPXW · fixing PM',q?(qCo?'Prezzi coevi':'Altro cutoff'):'In attesa',q?'context':'missing',q?'Massa '+fmt(q.ws.qAudit.mass,6)+' · '+q.ws.qAudit.observations+' prezzi verificati':''));
 const lv=q?[...(q.ippo?.levels||[]),...(q.ws?.levels||[])]:[];
 const lower=q?.ws?.levels?.find(x=>x.z===-1),upper=q?.ws?.levels?.find(x=>x.z===1);
 rows.push(row('IPPO / Wall Street','market','levels',lower&&upper?fmt(lower.price,2)+' – '+fmt(upper.price,2)+' SPX':'Livelli in attesa',q?q.cfg.target+' ET · WS ±1σ':'SPX · orizzonte del mark',q?'Riferimenti di prezzo':'In attesa',q?'context':'missing',lv.length+' livelli · nessuna traslazione automatica sul future'));
 rows.push(row('Superficie / code','market','volcube',flex?.promotable?'C-FLEX · '+flex.quoteCoverage.included+' quote':surf?'Dominio da verificare':'Multiscadenza in attesa',surf?String(surf.asof||surf.date||'SPXW'):'SPXW · almeno due scadenze',flex?.promotable?'Rischio di forma':'Copertura parziale',flex?.promotable?'context':'missing'));
 rows.push(row('P fisica SPX','path','dynamic-p',p?'N '+p.n+' · N eff. '+fmt(p.ESS,0):p09?'N '+p09.train+' · N eff. '+fmt(p09.ess,0):'Modello in attesa',p?p.date+' '+p.cutoff+' ET → chiusura':p09?p09.date+' 09:45 ET → chiusura':'SPX cash · fixing','Contesto SPX',p||p09?'context':'missing','Il terminale SPX e il setup ES hanno orizzonti propri.'));
 rows.push(row('Inventario dealer','dealer','signed',lad?'ΣΓ '+signed(lsum,1)+' ES/pt · '+lad.rows.length+' strike':'Inventario non identificato',lad?lad.asof+' / '+lad.expiry:'Ladder firmata · SPXW',verified?'Sensibilità coeva':lad?'Origine da allineare':'Dato richiesto',verified?'context':'missing'));
 const sc=root.DeskFields?.scenarioEvidence?.();
 const fieldValue=sc?['Speed '+signed(sc.speed,3)+' Γ/pt','Color '+signed(sc.color,3)+' Γ/min'].join(' · '):null;
 rows.push(row('Flussi e hedge','dealer','flow-overview',fieldValue||(flow?.ready?'Profili gamma / charm':'Profili in attesa'),
   sc?[sc.source,sc.date||'data non dichiarata',sc.time,fmt(sc.spot,2)+' SPX'].join(' · '):flow?.sourceDates?.gamma||'Scenario provider',
   sc||flow?.ready?'Contesto di scenario':'In attesa',sc||flow?.ready?'context':'missing',
   sc?'Unità native di Γ. Speed varia con lo spot, Color con i minuti. Punto di lettura · '+sc.reference+'. La verifica tramite charm descrive lo stesso Color.':'Gamma e charm del profilo spot.'));

 if(sel&&Number.isFinite(sel.price))rows.push(row('Strike selezionato','market','atlas',fmt(sel.price,2)+' SPX · touch '+pct(sel.touch),sel.asof+' ET','Focus sul livello','context','Evento storico del grafico SPX.'));
 rows.push(row('Verifica cronologica','audit','systematic',frame?.walk?frame.walk.test+' origini · '+frame.walk.active+' direzionali':'Verifica in attesa',c?'ES '+c.h+' min · costo ipotizzato '+fmt(c.cost,1)+' tick':'ES · costo per contratto',frame?.walk?'Verifica esplorativa':'In attesa',frame?.walk?'context':'missing','Ogni scelta usa soltanto le sedute precedenti. Il costo è un parametro del setup.'));
 const reports=root.InstReports?.peek(cut);
 if(reports?.active.length||reports?.conflicts.length){
 const prov=[...new Set(reports.active.map(f=>f.provider))].join(' / ');const cutText=new Date(cut).toISOString();
 rows.push(row('Report istituzionali','reports','report-charts',reports.active.length+' letture · '+reports.derived.length+' calcoli',prov+' · '+cutText,'Posizionamento e scenari','context',reports.conflicts.length+' letture discordanti sospese. Totali e componenti conservano il proprio universo.'));
 }
 const vol=root.DeskMarkets?.state(cut);
 if(vol&&(vol.vix||vol.vvix||vol.one))rows.push(row('VIX / VVIX / VX','market','regime',[vol.vix?'VIX '+fmt(vol.vix.price,2):'',vol.vvix?'VVIX '+fmt(vol.vvix.price,2):'',vol.basis!=null?'basis '+signed(vol.basis,2):'',vol.slope!=null?'pendenza '+signed(vol.slope,2):''].filter(Boolean).join(' · '),'Archivio prezzi · '+new Date(cut).toISOString(),'Regime e curva','context','Basis VX1 − VIX e pendenza VX2 − VX1 sui mensili con prezzi sincronizzati.'));
 const fused=root.ReportSignals?.integrate(reports,c)||[];for(const a of fused.filter(f=>!['Contesto qualitativo','Variazione osservata'].includes(f.role)))rows.push(row(a.group,a.stage,a.tool,a.value,a.origin,a.role,'context',a.detail));
 const shifts=fused.filter(a=>a.comparison),notes=fused.filter(a=>a.role==='Contesto qualitativo');if(shifts.length)rows.push(row('Variazioni fra edizioni','reports','report-charts',shifts.length+' confronti omogenei',shifts[0].origin,'Variazioni osservate','context',shifts.slice(0,5).map(a=>a.detail+' '+a.value).join(' / ')));if(notes.length)rows.push(row('Tesi pubblicate','reports','report-archive',notes.length+' passaggi al cutoff',notes[0].origin,'Contesto qualitativo','context',notes[0].detail));
 for(const stat of root.InstHistory?.peek(frame,cohort)||[])rows.push(row('P ES · '+(stat.g==='cta'?'stato CTA':stat.name),'reports','report-charts',stat.n<25?stat.n+' date report · minimo 25':'Long '+pct(stat.long.p)+' / short '+pct(stat.short.p),stat.provider+' / '+stat.scope+' / '+(stat.band?'fascia '+stat.band:(stat.term||stat.series)),'Frequenza storica','context',stat.event+' '+stat.unit+'. '+(stat.check?'Test sequenziale su '+stat.check.n+' edizioni · '+(stat.check.validated?'vantaggio univariato verificato':'vantaggio univariato non dimostrato'):'Confronto descrittivo sul setup.')));
 for(const b of root.InstTape?.at(cut)||[])rows.push(row('Eseguiti opzioni','dealer','flow-ops',b.n+' gambe · premio '+signed(b.values.H002,0)+' USD',b.source+' / '+b.basis+' · finestra 5 min','Flusso firmato','context','Premio, nozionali e greche per unità. Un campo mancante sospende il relativo totale.'));
 const field=root.DeskFields.summary(cut).metrics;
 if(field.length){const valid=field.filter(f=>M.recent(M.stamp(f.last),cut,300));rows.push(row('Serie greche importate','dealer','gammaatlas',field.length+' serie · '+valid.length+' coeve',field.map(g=>g.source+' / '+g.expiry).join(' · '),[...new Set(field.map(g=>({signed_flow:'Flusso firmato',inventory:'Inventario',provider_field:'Campo provider'})[g.kind]))].join(' / '),'context','Fonte, unità e natura sono dichiarate per ogni serie.'));}
 const monitor=root.ScalpAttribution?.at(cut);
 if(monitor){const overview=monitor.text;rows.push(row('Scalping per strike','scalp','scalp-indicator',overview,monitor.origin,monitor.role,monitor.n?'context':'missing',monitor.detail));}
 const dec=decision(),states=dec.model?.features||[];
 for(const r of rows){
  const id=r.group==='Mark CVI / Q'?['skew25']:r.group==='P fisica ES'?['rv5']:r.group==='VIX / VVIX / VX'?['vx','vxBasis','volPair']:r.group==='Inventario dealer'?['dealer']:r.group==='Eseguiti opzioni'?states.filter(x=>x.id.startsWith('tape')).map(x=>x.id):[];
  const matched=states.filter(x=>x.used&&id.includes(x.id));
  if(!matched.length)continue;
  const tested=dec.model?.market?.validated||dec.applied;r.role+=(tested?' · stato convalidato':' · confronto storico');r.detail+=' '+matched.map(x=>x.label+' '+x.state+' ('+x.coverage+' origini)').join(' / ')+'.';
 }
 return rows;
}
let metricInventory=null,studyKey='',studiesCache=[];
function studyReadings(rows){
 const dict=new Map(rows.map(r=>[r.tool,r]));
 const es=dict.get('realized'),reg=dict.get('espath'),mark=dict.get('skewfit'),levels=dict.get('levels'),surface=dict.get('volcube'),spx=dict.get('dynamic-p'),signedL=dict.get('signed'),flow=dict.get('flow-overview'),validation=rows.find(r=>r.group==='Verifica cronologica')||dict.get('systematic');
 const st=root.Desk?.state,qr=st&&!st.stale&&st.result?.ws?.qAudit?.passed?st.result:null;
 const dist=root.DistributionUI?.getState?.(),bundle=dist?.valid&&qr&&dist.result===qr?dist.bundle:null;
 const sf=root.CVIModelRouter?.group?.(),f=sf?root.CVIModelRouter?.peekFlexible?.(sf):null;
 const fp=root.FlowProbability?.stats?.(),fo=root.QuantistesOpsV7?.stats?.(),fs=root.FlowDesk?.stats?.(),p0=root.QuantistesPhysical?.stats?.();
 const sy=root.SystematicUI?.snapshot?.(),e=source(),group=root.QuantistesFlatDesk?.catalog?.()||[];
 const s25=qr?.ws.skew25,delta=s25&&Number.isFinite(s25.ivPut25)&&Number.isFinite(s25.ivCall25)?100*(s25.ivPut25-s25.ivCall25):null;
 const dom=qr?.ws.nativeLiquid,tail=dom?.length===2?qr.ws.model.cdf(dom[0])+qr.ws.model.survival(dom[1]):null;
 if(!metricInventory){try{const a=JSON.parse($('qtMetricCatalog').textContent);metricInventory={n:a.length,need:a.filter(row=>row.status==='DATI / MODELLO').length};}catch{metricInventory={n:0,need:0};}}
 const daily=root.Quantistes360?.data?.()?.validation?.regime_daily||[],day=frame?.settings?.date;
 const regimeRow=day?[...daily].reverse().find(r=>r[0]<day&&(r[1]>0||r[2]>0)):null;
 const regimeAt=regimeRow?{date:regimeRow[0],vix:M.number(regimeRow[1]),vvix:M.number(regimeRow[2])}:null;
 const inherited={'scalp-indicator':dict.get('scalp-indicator'),'report-charts':dict.get('report-charts'),'report-archive':dict.get('report-archive')||dict.get('report-charts'),decision:validation,atlas:dict.get('atlas')||levels,skewfit:mark,levels,implied:mark,volcube:surface,surface,tailrisk:mark,export:levels,'flow-ops':flow,'flow-overview':flow,'flow-position':flow,'flow-hedge':signedL,'flow-paths':flow,signed:signedL,gammaatlas:flow,'dynamic-p':spx,'physical-p':spx,espath:reg,realized:es,distributions:mark,history:es,research:validation,regime:null,audit:mark,systematic:validation,method:null,registry:null,matrix:null};
 const str=(v,fallback)=>v||fallback;
 const detail={
  decision:frame?.ready?'Preferenza '+frame.bias+' · '+frame.n+' sedute':null,
  implied:delta!==null?'IV put 25Δ − call 25Δ '+signed(delta,2)+' punti vol':null,
  tailrisk:Number.isFinite(tail)?'Massa Q oltre gli strike liquidi '+pct(tail):null,
  export:qr?(qr.ippo.levels.length+qr.ws.levels.length)+' livelli SPX per il chartbook':null,
  surface:null,
  'flow-position':fs?.ready?fmt(fs.positions,0)+' righe di posizionamento provider':null,
  'flow-ops':fs?.ready?fmt(fs.times,0)+' orari · '+fmt(fs.spots,0)+' prezzi di scenario':null,
  'flow-hedge':e.ladder?'Σ vanna '+signed(e.ladder.rows.reduce((v,x)=>v+x.vanna,0),1)+' ES/punto IV · Σ charm '+signed(e.ladder.rows.reduce((v,x)=>v+x.charm,0),1)+' ES/min':null,
  'flow-paths':fp?fmt(fp.paths,0)+' path di scenario · N eff. '+fmt(fp.ESS,0):null,
  gammaatlas:fo?fmt(fo.strikes,0)+' strike di scenario · '+fmt(fo.paths,0)+' percorsi':null,
  'physical-p':p0?'N '+p0.train+' · '+(p0.mode==='pool'?'equiponderata':'kernel')+' · Brier ↑ '+fmt(p0.brierUpPool,4)+' pool / '+fmt(p0.brierUpKernel,4)+' kernel · OOS '+p0.walkForward+' fino al '+p0.validationThrough:'P delle 09:45 in attesa',
  distributions:bundle?'Q al fixing · '+({PIT_ESTIMATE:'P da PIT storici',SCENARIO_ASSUMED:'P di scenario',UNAVAILABLE:'P empirica indisponibile'}[bundle.diagnostics.pCalibration]||'P da verificare'):null,
  history:archive?archive.dates.length+' sedute ES · '+M.dayISO(archive.dates[0])+' / '+M.dayISO(archive.dates.at(-1)):null,
  research:frame?.ready?'IC 95% long '+signed(frame.long.risk.lo,1)+' / '+signed(frame.long.risk.hi,1)+' tick':null,
  regime:regimeAt?regimeAt.date+' · '+[regimeAt.vix!==null?'VIX '+fmt(regimeAt.vix,2):null,regimeAt.vvix!==null?'VVIX '+fmt(regimeAt.vvix,2):null].filter(Boolean).join(' / '):null,
  audit:qr?'Scarti fuori spread '+qr.ws.qAudit.outsideQuotes.length+' / '+qr.ws.qAudit.observations:null,
  systematic:sy?'Scenario SPX cash · '+sy.asofUTC:'Scenari RV / vol-control in attesa',
  method:'Definizioni · unità · assunzioni',registry:metricInventory.n+' voci · '+metricInventory.need+' richiedono fonti aggiuntive',matrix:'Copertura per famiglia e fonte'
 };
 if(f?.promotable){const fw=f.model?.forwardVarianceATM?.().filter(v=>v.nonnegative)||[];detail.surface=fw.length?'Vol forward ATM '+pct(Math.sqrt(fw[0].forwardVariance))+' · '+fw[0].from+' / '+fw[0].to:'C-FLEX · '+f.quoteCoverage.included+' quote nel dominio';}
 return group.map(t=>{const r=inherited[t.id];return {id:t.id,stage:t.stage,name:t.name,measure:str(detail[t.id],r?.value||'In attesa'),role:roles[t.id]||t.name,origin:t.id==='physical-p'&&p0?p0.date+' 09:45 ET':r?.origin||'Riferimento operativo'};});
}
function refreshStudies(rows){const out=studyReadings(rows),key=JSON.stringify(out);studiesCache=out;if(key===studyKey)return;studyKey=key;
 if($('deskStudyRows'))$('deskStudyRows').innerHTML=out.map(v=>'<tr><td><button class="desk-study-jump" data-desk-go="'+esc(v.id)+'" data-stage="'+esc(v.stage)+'">'+esc(v.name)+' ↗</button></td><td>'+esc(v.measure)+'</td><td>'+esc(v.role)+'</td></tr>').join('');
}

function decision(){const base=frame?.ready?frame.bias:'ATTESA';if(root.DeskFusion)return root.DeskFusion.decide(base,root.DeskFusion.peek(frame,cohort));return root.InstHistory?.decision(base,root.InstHistory.peek(frame,cohort))||{signal:base,filter:null};}
function refreshEvidence(){
 if(!settled)return;
 const rows=makeEvidence(),key=JSON.stringify(rows);evidenceCache=rows;refreshStudies(rows);root.DeskPlaybooks.update(frame,cohort);if(root.DeskTriage)root.DeskTriage.render(frame,decision(),root.DeskPlaybooks.assess(frame,cohort));
 root.ScalpAttribution?.render(frame?.settings?.cutMs,decision().signal);
 if(key!==ledgerKey){ledgerKey=key;$('deskLedgerRows').innerHTML=rows.filter(r=>r.group!=='Verifica cronologica').map(r=>`<tr><td>${esc(r.group)}</td><td title="${esc(r.detail)}">${esc(r.value)}</td><td>${esc(r.origin)}</td><td><span class="desk-role ${esc(r.status)}">${esc(r.role)}</span></td><td><button data-desk-go="${esc(r.tool)}" data-stage="${esc(r.stage)}" aria-label="Apri ${esc(r.group)}">↗</button></td></tr>`).join('');}
 if(frame?.ready){
  const c=frame.settings,now=Date.now(),s=source().snapshot;
  const decisionAt=decision();if($('deskBoard'))$('deskBoard').dataset.signal=decisionAt.signal;txt('deskVerdict',decisionAt.signal==='NEUTRALE'?'NEUTRALE':'BIAS '+decisionAt.signal);const ref=frame.bias==='NEUTRALE'?'neutrale dopo i costi':frame.bias;
  const selected=decisionAt.applied?decisionAt.model.combined:decisionAt.model?.market?.validated?decisionAt.model.market:null;
  const rationale='Riferimento ES/VIX '+ref+'. '+(selected?(decisionAt.applied?'Mercato con report':'Mercato senza PDF')+' · '+selected.preference+' su '+selected.n+' origini omogenee, '+selected.wf+' verifiche successive. ':'');
  const msg=c.source!=='SNAPSHOT ES'?'Archivio ES · solo sedute precedenti all’origine.':M.recent(M.stamp(s?.asof),now,90)?'Snapshot ES coevo. Frequenze stimate sulle sedute precedenti.':'Snapshot storico. Frequenze stimate alla data e all’ora indicate.';
  const active=root.DeskPlaybooks.snapshot().filter(p=>p.state==='Attivo');const pb=active.length?' Playbook con target stimabile: '+active.map(p=>p.id+' '+pct(p.estimate.p)).join(' · ')+'.':'';txt('deskReason',rationale+msg+pb+(decisionAt.filter?' '+decisionAt.filter:''));
 }
}
function exportMark(){
 const st=root.Desk?.state,r=st?.stale?null:st?.result;
 const chart=$('q16Chart');
 if(!chart?.contentWindow)return;
 if(!r?.ws?.qAudit?.passed){if(lastMark){chart.contentWindow.postMessage({type:'QT_DESK_CLEAR'},'*');lastMark=null;}return;}
 if(r===lastMark)return;
 const m=r.ws.model,ws=r.ws.levels.map(x=>({price:x.price,z:x.z,family:'WALL'})),ippo=(r.ippo?.levels||[]).map(x=>({price:x.price,z:x.z,family:'IPPO'}));
 const [a,b]=r.ws.nativeLiquid||[];if(!(a>0&&b>a))return;
 chart.contentWindow.postMessage({type:'QT_DESK_MARK',model:{asof:r.cfg.asof,expiry:r.cfg.expiry,cutoff:r.cfg.expiryTime,spot:r.cfg.settlement,forward:m.F,ws,ippo,iv:r.ws.ivATM,qStatus:'CVI',qGrid:Array.from({length:201},(_,i)=>{const k=a+(b-a)*i/200;return [k,m.cdf(k)];})}},'*');lastMark=r;
}
function route(){
 const state=root.QuantistesFlatDesk?.state?.();if(!state)return;
 const stage=state.stage,tool=state.tool,host=$('q25-toolbar-'+stage);if(!host)return;
 document.title='Quantistes | '+stageNames[stage];txt('q24StageTitle',stageNames[stage].toUpperCase());
 const pit=host.querySelector('.q25-pit');
 if(pit){pit.textContent=roles[tool]||stageSubs[stage];pit.title='Ruolo nella scoreboard';}
 const rt=$('q13StampBar');if(rt&&!source().snapshot)txt('q13StampBar','ARCHIVIO ES  /  SPXW SU SNAPSHOT');
 if(stage==='score')refreshEvidence();
}
function poll(){
 setup();if(!settled)return;
 if(!loadArchive())return;
 if(!busy){busy=true;$('deskDate').value=M.dayISO(archive.dates.at(-1));if(source().snapshot)$('deskMode').value='feed';syncLocks();calculate();route();}
 const src=source().snapshot,sig=JSON.stringify([src?.asof,src?.es?.last,src?.vix?.value,src?.vix?.asof]);
 if(sig!==lastSnapshot){const old=lastSnapshot;lastSnapshot=sig;if(src&&old){$('deskMode').value='feed';syncLocks();staleReason='';calculate();}else if(!src&&$('deskMode').value==='feed')invalidate('Snapshot ES assente. Seleziona Archivio ES per il replay.');}
 refreshEvidence();exportMark();
 const r=root.QuantistesFlatDesk.state();if(r.stage==='score')txt('q24SourceNote','· '+($('deskMode').value==='feed'?'SNAPSHOT ES':'ARCHIVIO ES'));
}
root.addEventListener('desk:markets',()=>{if(settled&&busy)calculate();});
root.addEventListener('desk:atlas-ready',()=>{lastMark=null;exportMark();});
root.addEventListener('desk:route',()=>{requestAnimationFrame(route);});
root.addEventListener('quantistes:v12-feed',()=>{if(!settled||!loadArchive())return;
 const feed=!!source().snapshot;$('deskMode').value=feed?'feed':'archive';
 if(!feed){$('deskDate').value=M.dayISO(archive.dates.at(-1));$('deskStart').value='09:45';}
 syncLocks();manual=false;staleReason='';calculate();
});
root.addEventListener('desk:realized',ev=>{
 if(!settled||!busy||!ev.detail?.settings)return;const c=ev.detail.settings;
 if(!c.before)return;$('deskMode').value='archive';syncLocks();$('deskDate').value=M.dayISO(c.before);$('deskStart').value=M.timeET(c.start);$('deskH').value=c.close?'close':String(c.h);$('deskBand').value=c.band;
 if(c.target!==0){$('deskTarget').value=Math.abs(c.target)/M.tick;side=c.target<0?-1:1;}
 manual=true;staleReason='';calculate({vix:c.vix,spot:c.spot});
});
root.addEventListener('desk:realized-invalid',()=>{if(settled){staleReason='Parametri Realized P non validi. Correggili oppure applica il setup ES.';invalidate(staleReason);}});
root.InstitutionalDesk=Object.freeze({clock:()=>frame?.settings?.cutMs??null,side:()=>side,origin:()=>activeOrigin,frame:()=>frame?exportFrame():null,roles,refresh:poll,refreshPlaybooks:()=>{if(settled)refreshEvidence();}});
function start(){poll();setInterval(poll,1400);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);


