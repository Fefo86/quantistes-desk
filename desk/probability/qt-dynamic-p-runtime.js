/* QUANTISTES · Dynamic P daily workstation */
(function(root){
'use strict';
const C=root.QuantistesDynamicCore,$=id=>document.getElementById(id),F=Number.isFinite;
const {state,fmt,pct,esc,clamp}=C;
const charts=()=>root.QuantistesDynamicCharts;
const val=id=>Number($(id)?.value),safeStr=x=>String(x||'');
function kpi(title,big,desc){return `<div class="dx-kpi"><small>${esc(title)}</small><strong>${esc(big)}</strong><em>${esc(desc)}</em></div>`}
function event(title,v,note){return `<div class="dx-event"><small>${esc(title)}</small><strong>${v==null?'—':pDisplay(v)}</strong><em>${esc(note)}</em></div>`}
function pDisplay(v,m=state.model){if(!F(v))return '—';const n=m?.ESS||100;const tail=clamp(3/n,0,.2);if(v<=1e-12)return '≤~'+pct(tail,1);if(v>=1-1e-12)return '≥~'+pct(1-tail,1);return pct(v,1)}
function shade(v,kind='prob'){
 if(!F(v))return '';const x=kind==='difference'?clamp(Math.abs(v)*3,0,1):kind==='ess'?clamp(v/200,0,1):clamp(v,0,1),alpha=(.045+.52*Math.pow(x,.72)).toFixed(3);
 const rgb=kind==='difference'?(v>=0?'153,222,255':'245,239,222'):'135,181,255';return `background:rgba(${rgb},${alpha})`;
}
function noteNoModel(){const m=state.model,s=state.session;
 $('dxKpis').innerHTML=s?kpi('DATA / SPX',s.date,fmt(s.spot,2))+'\n'+kpi('CUTOFF ET',s.cutoff,'0DTE · orizzonte non disponibile')+'\n'+kpi('STATO P','—',m?.reason||'Nessun modello disponibile'):'<div class="dx-readout">Carica un CSV ThetaData o sincronizza una chain CVI.</div>';
 $('dxQuality').textContent=m?.reason||'MODELLO P IN ATTESA';$('dxEvents').innerHTML='';$('dxTable').querySelector('tbody').innerHTML='';$('dxLevels').innerHTML='';$('dxAudit').textContent=m?.reason||'Nessun modello disponibile';
}
function changeSelected(K){const m=state.model;if(!m||m.kind==='BLOCKED')return;if(!F(K)||K<0)return;
 state.selected=K;$('dxStrike').value=String(K);renderFocused();renderTable();renderLevels();charts()?.renderCharts();}
function renderFocused(){const m=state.model,s=state.session;if(!m||m.kind==='BLOCKED')return;
 const k=state.selected||s.spot,e=C.physicalEvent(m,k,{details:true}),q=C.liveQ(s),qAbove=q?.survival?.(k)??null;
 $('dxEvents').innerHTML=[event('P CLOSE ABOVE',e.pAbove,'ultimo SPX pre-16:00'),event('P FIRST TOUCH',e.pTouch,'sull’orizzonte residuo'),
  event('P REVERSAL | HIT',e.pReversal,e.hitESS<30?'ESS < 30: non rilasciata':`rifiuto entro ${state.reactWindow}m`),
  event('P BREAKOUT | HIT',e.pBreakout,e.hitESS<30?'ESS < 30: non rilasciata':'continuazione oltre soglia'),
  event('P PIN ±'+state.pin+' PT',e.pPin,'intervallo ultimo SPX pre-16:00'),event('Q CLOSE ABOVE',qAbove,q?'CVI stessa scadenza / cutoff':'cutoff Q non comparabile')].join('');
 $('dxEventRead').innerHTML=`Strike <b>${fmt(k,2)}</b> · Δ spot ${fmt(k-m.spot,2)} · ${e.hitESS>=30?'ESS condizionato '+fmt(e.hitESS,1):'evento raro o supporto insufficiente'} · ambiguità intraminuto ${e.pAmbiguous==null?'—':pct(e.pAmbiguous,1)} · N storico ${m.n} · P non dealer-condizionata.`;
}
function renderTable(){const m=state.model,s=state.session;if(!m||m.kind==='BLOCKED')return;
 const filter=$('dxSearch').value.trim(),range=$('dxRange').value;let rows=state.rows.filter(r=>
  (range==='ALL'||Math.abs(r.K-m.spot)<=m.spot*Number(range)/100)&&(!filter||String(r.K).includes(filter)));
 const key=state.sort,dir=state.sortDesc?-1:1;rows.sort((a,b)=>dir*((a[key]??-1e99)-(b[key]??-1e99)));
 function td(v,kind='prob'){return v==null?'<td class="dx-muted">—</td>':`<td style="${shade(v,kind)}">${kind==='ess'?fmt(v,0):kind==='q'?pct(v,1):pDisplay(v)}</td>`}
 const tbody=$('dxTable').querySelector('tbody');tbody.innerHTML=rows.map(r=>`<tr data-k="${r.K}" class="${r.K===state.selected?'selected':''}">
  <td>${fmt(r.K,2)}</td><td>${fmt(r.distance,2)}</td>${td(r.pAbove)}${td(r.qAbove,'q')}${td(r.pTouch)}${td(r.pReversal)}${td(r.pBreakout)}${td(r.pAmbiguous)}${td(r.pPin)}${td(r.hitESS,'ess')}</tr>`).join('')||'<tr><td colspan="10">Nessuno strike corrisponde al filtro</td></tr>';
 $('dxTableCount').textContent=rows.length+' / '+state.rows.length+' strike';
 tbody.querySelectorAll('tr[data-k]').forEach(tr=>tr.onclick=()=>changeSelected(Number(tr.dataset.k)));
}
function renderLevels(){const m=state.model;if(!m||m.kind==='BLOCKED')return;const l=C.levels();const table=$('dxLevels');
 if(!l.length){table.innerHTML='<div class="dx-readout">Livelli Q e P collegabili dopo il fitting CVI dello stesso cutoff, sulla stessa scadenza 0DTE. I livelli di altri orizzonti rimangono separati.</div>';return}
 const q=C.liveQ();let html='<table class="dx-table"><thead><tr><th>FAMIGLIA</th><th>LIVELLO</th><th>SPX</th><th>P CLOSE &gt;</th><th>Q CVI CLOSE &gt;</th><th>Δ P−Q</th><th>P TOUCH</th><th>REV | HIT</th><th>BRK | HIT</th><th>HIT ESS</th></tr></thead><tbody>';
 for(const x of l){const p=C.physicalEvent(m,x.price),qv=q?.survival?.(x.price)??null,delta=qv!=null?p.pAbove-qv:null;
  html+=`<tr data-level="${x.price}"><td>${esc(x.family)}</td><td>${esc(x.name)}</td><td>${fmt(x.price,2)}</td><td style="${shade(p.pAbove)}">${pDisplay(p.pAbove)}</td><td style="${shade(qv)}">${pct(qv)}</td><td style="${shade(delta,'difference')}">${pct(delta)}</td><td style="${shade(p.pTouch)}">${pDisplay(p.pTouch)}</td><td>${p.pReversal==null?'—':pct(p.pReversal)}</td><td>${p.pBreakout==null?'—':pct(p.pBreakout)}</td><td>${fmt(p.hitESS,0)}</td></tr>`;
 }
 html+='</tbody></table>';table.innerHTML=html;table.querySelectorAll('tr[data-level]').forEach(row=>row.onclick=()=>changeSelected(Number(row.dataset.level)));
}
function renderPair(){const m=state.model;if(!m||m.kind==='BLOCKED')return;const target=val('dxTarget'),stop=val('dxStop');
 if(!F(target)||!F(stop)||target===stop){$('dxPairMetrics').innerHTML='';$('dxPairRead').textContent='Imposta target e stop distinti.';return}
 const ans=C.pairEvents(m,target,stop);
 $('dxPairMetrics').innerHTML=[event('TARGET FIRST',ans.target,'primo evento'),event('STOP FIRST',ans.stop,'primo evento'),event('PARITÀ / INCERTO',ans.both,'stesso minuto / spot'),event('NESSUNO',ans.none,'fino ultimo SPX pre-16:00')].join('');
 $('dxPairRead').innerHTML=`Primo evento su ${m.n} percorsi · P(target)+P(stop)+P(incerto)+P(none) = <b>${fmt(ans.target+ans.stop+ans.both+ans.none,6)}</b>. Nello stesso minuto OHLC non si deduce l'ordine di esecuzione.`;
}
function renderStructure(){const m=state.model,s=state.session;if(!m||m.kind==='BLOCKED')return;
 const kind=$('dxStructureType').value,K1=val('dxLongK'),K2=val('dxShortK'),q=C.liveQ();
 const x1=s.by.get(K1),x2=s.by.get(K2),long=x1?.[kind],short=x2?.[kind];
 if(s.expiry!==s.date||!long||!short||K1===K2||!(long.ask>long.bid&&short.ask>short.bid)){
  $('dxStructureMetrics').innerHTML='';$('dxStructureRead').textContent='Serve una chain SPXW 0DTE con bid/ask coerenti su entrambi gli strike e scadenza odierna.';return}
 const debit=long.ask-short.bid,payoff=spot=>{const fn=K=>kind==='CALL'?Math.max(spot-K,0):Math.max(K-spot,0);return fn(K1)-fn(K2)-debit};
 let pp=0,expP=0;for(let i=0;i<m.n;i++){const v=payoff(m.spot*(1+m.records[i].terminal)),w=m.weights[i];pp+=w*Number(v>0);expP+=w*v}
 let qwin=0,qexp=0;if(q?.quantile){for(let i=0;i<550;i++){const spot=q.quantile((i+.5)/550),p=payoff(spot);if(F(p)){qexp+=p/550;qwin+=Number(p>0)/550}}}
 $('dxStructureMetrics').innerHTML=[event('P PROFIT',pp,'non include fill/slippage'),event('Q CVI PROFIT',q?qwin:null,'solo sul fixing coevo')].join('');
 $('dxStructureRead').innerHTML=`${kind} long <b>${fmt(K1,0)}</b> @ ask ${fmt(long.ask,2)} / short <b>${fmt(K2,0)}</b> @ bid ${fmt(short.bid,2)} · Premio netto ${fmt(debit,2)} pt · E[P&amp;L] su Last pre-16:00 <b>${fmt(expP*100,0)} USD</b> / E<sub>Q</sub>[P&amp;L] ${q?fmt(qexp*100,0):'—'} USD · Moltiplicatore SPX ×100 · Nessun edge OOS attestato.`;
}
function audit(){const m=state.model,s=state.session;if(!m||m.kind==='BLOCKED')return;const audits=C.modelAudit(m);state.latestAudit=audits;const wf=root.QuantistesDynamicValidation||null;
 let rows='';if(wf)for(const v of wf.metrics||[]){if(!['09:45','10:30','12:00','14:30','15:30'].includes(v.cutoff_et))continue;if(!['close_up','touch_up_0p25','touch_down_0p25'].includes(v.event))continue;
  rows+=`<tr><td>${esc(v.cutoff_et)}</td><td>${esc(v.event)}</td><td>${v.n_test}</td><td>${fmt(v.brier_pooled,4)}</td><td>${fmt(v.brier_prefix,4)}</td><td style="color:${v.prefix_improves?'#85cae5':'#ebe3cd'}">${v.prefix_improves?'PATH':'TIME'}</td></tr>`;
 }
 $('dxAudit').innerHTML=`<div><b>MODELLO</b> ${esc(m.modeLabel)} · Cutoff ${esc(s.cutoff)} ET → fixing 16:00 · TRAIN anteriore ${m.n} · ESS ${fmt(m.ESS,1)} · Ultima seduta addestramento ${esc(m.trainedThrough)}</div>
  <div><b>ASSUNZIONI</b> ${esc(m.note||'Skew 09:45 storica su 2026; valori non dealer-condizionati.')}</div>
  <div><b>CONTROLLI</b> ${audits.filter(x=>x.pass).length}/${audits.length} · ${audits.filter(x=>!x.pass).map(x=>x.name).join(', ')||'nessuna violazione rilevata'}</div>
  <div><b>FIXING</b> Il riferimento empirico è l'ultimo SPX osservato nella barra delle 15:59 ET: proxy del fixing ufficiale, non sostituto del settlement per opzioni.</div>
  <div><b>RISCHIO</b> P empirica non prova mispricing o hedge MM eseguito; Q CVI usata solo per stessa scadenza/cutoff. Quota 0DTE non equivalente a overnight.</div>
  <div class="dx-walk"><table><thead><tr><th>CUTOFF ET</th><th>EVENTO</th><th>TEST</th><th>BRIER P TIME</th><th>BRIER P PATH</th><th>MINORE</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="dx-note">Backtest 2026 walk-forward sullo storico SPX 2023–2026, con train composto esclusivamente da sedute precedenti. P PATH usa l'intero prefisso SPX osservato all'ora scelta; non è applicabile quando carichi soltanto una chain opzioni.</div>`;
}
function renderAll(){const s=state.session,m=state.model;
 if(!s||!m||m.kind==='BLOCKED'){noteNoModel();return}
 const q=C.liveQ(s);const spotEV=C.physicalEvent(m,s.spot,{details:false});
 $('dxQuality').textContent=m.modeLabel+' · '+s.cutoff+' ET';
 $('dxKpis').innerHTML=[kpi('SPX · CUTOFF',fmt(s.spot,2),s.date),kpi('ORA · NEW YORK',s.cutoff.slice(0,5),m.H+' minuti residui'),
  kpi('P · STATO',m.kind==='P09_OPTION'?'P09':m.kind==='P_PREFIX'?'P PATH':'P TIME',m.modeLabel),
  kpi('STORICO',String(m.n)+' days','solo precedenti'),kpi('EFFECTIVE N',fmt(m.ESS,0),'pesi storici'),
  kpi('P CLOSE UP',pct(spotEV.pAbove,1),q?'Q CVI '+pct(q.survival(s.spot),1):'Q CVI non allineata')].join('');
 renderFocused();renderTable();renderLevels();renderPair();renderStructure();audit();charts()?.renderCharts();
}
function summaryModules(){const s=state.session,m=state.model,q=C.liveQ(s);const ids=['view-monitor','view-levels','view-smile','view-implied','view-distributions','view-tailbook','view-crash','view-research','view-systematic','view-history','view-surface','view-export','flow-panel-ops','flow-panel-position','flow-panel-hedge'];
 const selected=state.selected||s?.spot||NaN,a=m&&m.kind!=='BLOCKED'?C.physicalEvent(m,selected,{details:true}):null;
 for(const id of ids){const host=$('q10-join-'+id);if(!host)continue;
  if(!m||m.kind==='BLOCKED'){
   host.innerHTML=`<h4>P DYNAMIC · MODELLO NON DISPONIBILE</h4><div class="q10-note">${esc(m?.reason||'Carica una chain per stimare le probabilità di sessione.')}</div>`;continue;
  }
  host.innerHTML=`<h4>Q × P · UNIFIED PROBABILITY CONTEXT · ${esc(s.date)} · ${esc(s.cutoff)} ET</h4>
   <div class="q10-cells"><div><span>SPX CUTOFF</span><strong>${fmt(s.spot,2)}</strong></div><div><span>STRIKE</span><strong>${fmt(selected,2)}</strong></div><div><span>P CLOSE &gt;</span><strong>${pct(a.pAbove,1)}</strong></div><div><span>P TOUCH</span><strong>${pct(a.pTouch,1)}</strong></div><div><span>Q CVI CLOSE &gt;</span><strong>${q?pct(q.survival(selected),1):'N/A'}</strong></div></div>
   <div class="q10-note">${esc(m.modeLabel)} · N=${m.n}, ESS=${fmt(m.ESS,0)} · ${q?'Q e P coeve · fixing 16:00 ET':'Q non comparabile: scadenza, data o cutoff differente'} · R_flow non convalidata con dealer sample storici · <a href="#flow-panel-dynamic" class="dx-goto">Apri workstation dinamica</a></div>`;
  host.querySelector('.dx-goto')?.addEventListener('click',e=>{e.preventDefault();root.Desk?.tab?.('flows');$('dxNav')?.click()});
 }
}
function refreshDock(){const s=state.session,m=state.model;
 if(!s){$('dxStrip').textContent='Nessuno snapshot corrente · 859 sedute SPX 2023–2026 disponibili · P sulle ore regolari 09:45–15:59 ET.';return}
 if(!m||m.kind==='BLOCKED'){$('dxStrip').textContent=esc(s.date+' '+s.cutoff+' ET · '+(m?.reason||'P non disponibile'));return}
 const q=C.liveQ(s);$('dxStrip').innerHTML=`<b>${esc(s.date)} ${esc(s.cutoff)} ET</b> · SPX <b>${fmt(s.spot,2)}</b> · <b>${esc(m.modeLabel)}</b> · N ${m.n} · ESS ${fmt(m.ESS,0)} · Q CVI ${q?'ALLINEATA':'NON ALLINEATA'} · Scadenza ${esc(s.expiry)} · R dealer sample NON COEVA`;
}
function commitModel(source){const s=state.session;if(!s)return;const m=C.makeModel(s);state.model=m;state.modelSessionHash=[s.date,s.cutoff,s.expiry,s.spot,$('dxMode')?.value,state.prefix?.date,state.prefix?.bars?.length].join('|');
 if(m.kind!=='BLOCKED'){
  const strikes=s.strikes;state.rows=C.levelRows(m,s);
  if(!F(state.selected)||Math.abs(state.selected-s.spot)>s.spot*.3)state.selected=C.nearest(strikes,s.spot);
  if(!$('dxStrike').value||!strikes.includes(Number($('dxStrike').value)))$('dxStrike').value=String(state.selected);
  if(!F(val('dxTarget'))||!F(val('dxStop'))||val('dxTarget')===val('dxStop')){
   const gap=Math.max(10,Math.round(Math.sqrt(state.rows.reduce((a,r)=>a+Math.abs(r.distance),0)/Math.max(1,state.rows.length))/5)*5);
   $('dxTarget').value=String(Math.round((s.spot+gap)/5)*5);$('dxStop').value=String(Math.round((s.spot-gap)/5)*5);
  }
  const near=C.nearest(strikes,s.spot);$('dxLongK').value=String(near);$('dxShortK').value=String(C.nearest(strikes,near+10));
 }else{state.rows=[]}
 renderAll();summaryModules();refreshDock();
 C.status(m.kind==='BLOCKED'?m.reason:`${s.date} ${s.cutoff} ET · ${m.modeLabel} · ${m.n} sedute · ESS ${fmt(m.ESS,1)} · ${s.strikes.length} strike · ${C.liveQ(s)?'CVI Q allineata':'Q da verificare'}`,m.kind==='BLOCKED'?'err':'ok');
 C.setState(m.kind==='BLOCKED'?'P BLOCCATA · Q INDIPENDENTE':`${m.modeLabel} · ${m.H} MINUTI RESIDUI`);
 root.dispatchEvent(new CustomEvent('quantistes:dynamicP',{detail:{date:s.date,cutoff:s.cutoff,mode:m.kind,source}}));
}
function normalizeFromNative(r){const cfg=r.cfg,parsed=root.Desk?.state?.parsed;if(!parsed?.rows?.length)return null;const exp=String(cfg.expiry).slice(0,10),asof=String(cfg.asof||'');
 const date=asof.slice(0,10),cutoff=asof.slice(11,16)+':'+(asof.slice(17,19)||'00');if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/\d\d:\d\d:\d\d/.test(cutoff))return null;
 const t=dayMinutes(cutoff),rows=parsed.rows.filter(row=>row.expiry===exp&&row.symbol==='SPXW'&&F(row.strike));
 const by=new Map();for(const row of rows){const side=row.right==='CALL'||row.right==='C'?'CALL':'PUT',q=by.get(row.strike)||{K:row.strike};
  q[side]={K:row.strike,side,bid:Number(row.bid),ask:Number(row.ask),delta:Number(row.delta),iv:Number(row.iv),spot:Number(row.spot),time:{date,time:row.time.slice(11,19)}};by.set(row.strike,q)}
 const spot=Number(parsed.meta?.spot||cfg.settlement);if(!F(spot)||spot<=0)return null;
 const strikes=[...by.keys()].sort((a,b)=>a-b);
 // Builds 09:45 option features only when the native import carries full greeks and strictly valid quote timestamps.
 let feature=null;
 if(cutoff==='09:45:00'&&exp===date){try{
  const data=rows.map(x=>({symbol:'SPXW',expiration:exp,strike:x.strike,right:x.right,timestamp:x.time,bid:x.bid,ask:x.ask,delta:x.delta,implied_vol:x.iv,underlying_price:x.spot}));
  const asCsv=['symbol,expiration,strike,right,timestamp,bid,ask,delta,implied_vol,underlying_price',...data.map(x=>Object.values(x).join(','))].join('\n');
  feature=C.quotesFromRaw(asCsv).feature;
 }catch(e){feature=null}}
 return {date,cutoff,expiry:exp,spot,strikes,by,quotes:rows,feature,source:'native-cvi',pairs:0,nearCount:rows.length,rawCount:rows.length};
}
function dayMinutes(h){return Number(h.slice(0,2))*60+Number(h.slice(3,5))-585}
async function nativeImport(session){const fileName='Quantistes_Dynamic_SPXW_'+session.date+'_'+session.cutoff.replaceAll(':','')+'.csv',file=new File([session.normalized],fileName,{type:'text/csv'}),input=$('csvFile'),d=root.Desk;
 if(!input||!d)throw Error('Importatore CVI non disponibile');if(typeof DataTransfer==='undefined')throw Error('Browser non supportato: necessaria gestione file DataTransfer');
 const tr=new DataTransfer();tr.items.add(file);input.files=tr.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 let accepted=false;
 for(let n=0;n<180;n++){await new Promise(res=>setTimeout(res,65));if(d.state.parsed?.rows?.length&&d.state.files?.some(f=>f.name===fileName)){accepted=true;break}}
 if(!accepted)throw Error('CSV non acquisito dal parser CVI');
 const set=(id,value)=>{const el=$(id);if(el){el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}))}};
 const expiry=session.expiry,dt=session.date,cutoff=session.cutoff.slice(0,5);
 set('symbol','SPXW');set('expirySelect',expiry);set('expiry',expiry);set('asof',dt+'T'+cutoff);
 set('expiryTime','16:00');set('target',expiry+'T16:00');set('ivUnit','decimal');set('maxAge',300);
 const sett=$('settlement');if(sett&&!(Number(sett.value)>0))sett.value=String(session.spot.toFixed(2));
 C.status(`Chain ${session.date} ${session.cutoff} ET · stima P calcolata · fitting CVI Q in corso…`);
 await d.calculate();if(!d.state.result?.ws?.model||d.state.stale)throw Error('La chain è stata importata ma il mark Q CVI non è disponibile: verifica età delle quote, bid/ask, tasso e diagnostica fitting.');
 state.lastNativeKey=[d.state.result.cfg.asof,d.state.result.cfg.expiry,d.state.result.ws.cvi?.marks?.candidateFingerprint].join('|');return true;
}
async function importDaily(file){if(!file)throw Error('Seleziona un CSV ThetaData');if(file.size>40e6)throw Error('CSV superiore a 40 MB: seleziona uno snapshot');
 const parsed=C.quotesFromRaw(await file.text());state.computing=true;state.session=parsed;state.selected=C.nearest(parsed.strikes,parsed.spot);
 $('dxStrike').value=String(state.selected);
 commitModel('CSV');
 try{await nativeImport(parsed);commitModel('CSV + CVI');}catch(e){C.status('P pronta · Q CVI non rilasciata: '+String(e.message||e),'err');console.warn('Q import',e?.message)}
 state.computing=false;$('dxNav')?.click();return {cutoff:parsed.cutoff,date:parsed.date,strikes:parsed.strikes.length,mode:state.model?.kind};
}
function syncNative({force=false}={}){const d=root.Desk,r=d?.state?.result;if(!r||d.state.stale||!r?.ws?.model)return false;
 if(!force&&state.replayQKey){const k=[r.cfg?.asof,r.cfg?.expiry].join('|');if(k===state.replayQKey)return false;state.replayQKey=null;}
 const key=[r.cfg.asof,r.cfg.expiry,r.ws?.cvi?.marks?.candidateFingerprint].join('|');if(!force&&key===state.lastNativeKey)return false;
 const parsed=normalizeFromNative(r);if(!parsed)return false;
 state.lastNativeKey=key;const old=state.session;
 if(!old||old.date!==parsed.date||old.cutoff.slice(0,5)!==parsed.cutoff.slice(0,5)||old.expiry!==parsed.expiry||Math.abs(old.spot-parsed.spot)>1){
  state.session=parsed;state.selected=C.nearest(parsed.strikes,parsed.spot);$('dxStrike').value=String(state.selected);
 }else if(!state.session.by?.size){state.session=parsed}
 commitModel('CVI / API');return true;
}
function parseSpXBars(fileText,day){const raw=C.parseCSV(fileText),out=[];
 for(const row of raw){const date=String(row.session_date_et||row.date||'').slice(0,10);if(date!==day)continue;
  const minuteRaw=row.minute_index_from_0945??row.minute_index;let minute=minuteRaw==null||minuteRaw===''?NaN:Number(minuteRaw);if(!F(minute)&&/^\d\d:\d\d$/.test(row.minute_et||''))minute=dayMinutes(row.minute_et);
  const low=Number(row.low_spx??row.low),high=Number(row.high_spx??row.high),close=Number(row.close_spx??row.close),open=Number(row.open_spx??row.open);
  if(![minute,low,high,close,open].every(F)||minute<0||minute>=375||low>high||close<low-.5||close>high+.5)continue;
  out.push({date,minute,low,high,close,open});
 }
 const map=new Map();for(const b of out)map.set(b.minute,b);return [...map.values()].sort((a,b)=>a.minute-b.minute);
}
function archiveDay(bars,date){if(bars.length!==375||bars.some((x,i)=>x.minute!==i))throw Error('Per aggiornare P servono 375 barre consecutive 09:45–15:59 ET');
 const anchor=bars[0].open;if(!(anchor>2000))throw Error('Prezzo SPX alla prima barra non valido');const encode=x=>Math.round((x/anchor-1)*100000);
 return {d:date,a:anchor,l:bars.map(x=>encode(x.low)),h:bars.map(x=>encode(x.high)),c:bars.map(x=>encode(x.close))};
}
function download(name,body,mime='application/json'){const blob=new Blob([body],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
function exportCSV(){if(!state.rows.length)return;const keys=['K','distance','pAbove','qAbove','pTouch','pReversal','pBreakout','pAmbiguous','pNeutral','pPin','hitESS','hitMass'];const s=[keys.join(',')];
 for(const row of state.rows)s.push(keys.map(k=>F(row[k])?String(row[k]):'').join(','));download(`Quantistes_P_Dynamic_${state.session.date}_${state.session.cutoff.slice(0,5).replace(':','')}_strikes.csv`,s.join('\n'),'text/csv;charset=utf-8');
}
function exportJSON(){if(!state.session||!state.model)return;const s=state.session,m=state.model;download(`Quantistes_P_Dynamic_${s.date}_audit.json`,JSON.stringify({schema:'quantistes.dynamic.physical.v10.audit',date:s.date,cutoff:s.cutoff,spot:s.spot,expiry:s.expiry,
 mode:m.kind,trainingN:m.n,ESS:m.ESS,trainThrough:m.trainedThrough,horizonMinutes:m.H,nativeQMatched:!!C.liveQ(s),walkforward:root.QuantistesDynamicValidation?.metrics,checks:state.latestAudit,levels:C.levels(),strikes:state.rows},null,2));}
function updateModel(){if(!state.session)return;state.pin=clamp(val('dxPin')||10,1,250);state.react=clamp(val('dxReact')||12,1,250);state.reactWindow=clamp(val('dxReactWindow')||30,5,180);commitModel('parameters')}
function applyFocus(){if(!state.session||!state.model||state.model.kind==='BLOCKED')return;
 const K=val('dxStrike');if(F(K)&&K>0)changeSelected(K);
}
function addPanels(){if(state.ready||!$('view-flows'))return;state.ready=true;
 const nav=document.querySelector('#view-flows .flow-subnav'),panel=$('flow-panel-dynamic');if(!nav||!panel)return;
 const button=document.createElement('button');button.id='dxNav';button.dataset.flowPanel='dynamic';button.textContent='01 · DYNAMIC P / Q';nav.prepend(button);
 nav.addEventListener('click',e=>{const btn=e.target.closest('button[data-flow-panel]');if(!btn)return;
  if(btn.dataset.flowPanel==='dynamic'){
   e.preventDefault();e.stopImmediatePropagation();nav.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===btn));document.querySelectorAll('#view-flows .flow-inner').forEach(x=>x.classList.toggle('active',x===panel));root.requestAnimationFrame(()=>charts()?.renderCharts());
  }else{panel.classList.remove('active');button.classList.remove('on')}
 },true);
 const h=$('qtWorkArea');h?.querySelector('.heading')?.after($('dx-global-dock'));
 for(const id of ['view-monitor','view-levels','view-smile','view-implied','view-distributions','view-tailbook','view-crash','view-research','view-systematic','view-history','view-surface','view-export','flow-panel-ops','flow-panel-position','flow-panel-hedge']){
  const el=$(id);if(!el)continue;const info=document.createElement('section');info.id='q10-join-'+id;info.className='q10-joined';info.innerHTML='<h4>Q × P · LIVE CONTEXT</h4><div class="q10-note">Seleziona una chain per iniziare.</div>';
  el.prepend(info);
 }
 $('dxImport').onclick=async()=>{const btn=$('dxImport');btn.disabled=true;try{
  const file=$('dxImportFile').files?.[0];await importDaily(file);
 }catch(e){C.status(e.message||String(e),'err');console.warn('Import dynamic',e)}finally{btn.disabled=false}};
 $('dxSyncNative').onclick=()=>{try{if(!syncNative({force:true}))throw Error('Nessun mark CVI contemporaneo disponibile. Carica una chain e premi CALCOLA LIVELLI.');$('dxNav').click()}catch(e){C.status(e.message,'err')}};
 $('dxOpenDesk').onclick=()=>{root.Desk?.tab?.('flows');$('dxNav').click()};
 $('dxImportFile').onchange=()=>C.status('CSV selezionato. Premi IMPORTA E CALCOLA; puoi caricare la chain a qualsiasi orario.');
 $('dxPathFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{
  if(!state.session)throw Error('Carica prima la chain della stessa data');const day=state.session.date,bars=parseSpXBars(await file.text(),day),t=C.dayCutoff(state.session);
  if(bars.length>=Math.min(t,15)&&t>=15&&bars.slice(0,t).every((b,i)=>b.minute===i)){
   state.prefix={date:day,bars:bars.slice(0,t)};
  }else state.prefix=null;
  if(bars.length===375&&bars.every((b,i)=>b.minute===i)){
   const checkIndex=Math.max(0,Math.min(t-1,bars.length-1)),spotAtCutoff=t>0?bars[checkIndex].close:bars[0].open;
   if(Math.abs(spotAtCutoff-state.session.spot)>Math.max(6,state.session.spot*.005))throw Error('Percorso e chain non sincronizzati sul prezzo SPX al cutoff: differenza '+fmt(Math.abs(spotAtCutoff-state.session.spot),2)+' punti.');
   const item=archiveDay(bars,day);if(item.d<=state.raw.days.at(-1).d)throw Error('Impossibile sostituire lo storico SPX originale; la sessione è già presente.');
   const map=new Map(state.archive.map(r=>[r.d,r]));map.set(item.d,item);state.archive=[...map.values()].sort((a,b)=>a.d.localeCompare(b.d));
   state.days=[...state.raw.days,...state.archive].sort((a,b)=>a.d.localeCompare(b.d));
   // Add the completed outcome to the 09:45 feature archive only if there is a matching 09:45 option snapshot.
   try{const bridge=root.QuantistesDailyBridge,ss=bridge?.getSnapshot(day);
    if(ss&&!ss.hasOutcome){bridge.ingestOutcome(day,bars)}}catch(_){}
   C.status(day+' · percorso SPX importato · 375 barre · esito salvato nella sessione. Esporta l’archivio per conservarlo.','ok');
  }else if(state.prefix){C.status(day+' · percorso SPX fino a '+state.session.cutoff+' ET verificato: P PATH attivabile.','ok')}
  else throw Error('Le barre devono iniziare alle 09:45 ed essere consecutive almeno fino al cutoff per abilitare P PATH.');
  commitModel('SPX path');
 }catch(err){C.status('Percorso SPX: '+String(err.message||err),'err')}};
 $('dxSaveArchive').onclick=()=>{const pArchive=root.QuantistesDailyBridge?.exportArchive?.()||[];
  download('Quantistes_P_Dynamic_Archive_v10.json',JSON.stringify({schema:'quantistes.dynamic.archive.v10',generatedAt:new Date().toISOString(),sessions:state.archive,optionsArchive:pArchive},null,2));C.status('Archivio esportato: conserva il file JSON per le prossime sessioni.','ok')};
 $('dxLoadArchive').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{
  const payload=JSON.parse(await file.text());if(payload.schema!=='quantistes.dynamic.archive.v10')throw Error('Schema archivio non compatibile');
  const max=state.raw.days.at(-1).d;const map=new Map();
  for(const d of payload.sessions||[]){if(!d||d.d<=max||!/^\d{4}-\d\d-\d\d$/.test(d.d)||![d.l,d.h,d.c].every(a=>Array.isArray(a)&&a.length===375&&a.every(Number.isFinite)))continue;map.set(d.d,d)}
  state.archive=[...map.values()].sort((a,b)=>a.d.localeCompare(b.d));state.days=[...state.raw.days,...state.archive].sort((a,b)=>a.d.localeCompare(b.d));
  const b=root.QuantistesDailyBridge;if(Array.isArray(payload.optionsArchive)&&b?.ready())b.importArchive(payload.optionsArchive);
  updateModel();C.status('Archivio importato: '+state.archive.length+' giornate SPX aggiuntive.','ok');
 }catch(err){C.status('Archivio non valido: '+err.message,'err')}};
 $('dxStrike').onchange=applyFocus;
 $('dxRecompute').onclick=updateModel;
 for(const id of ['dxMode','dxPin','dxReact','dxReactWindow'])$(id).onchange=updateModel;
 $('dxSearch').oninput=renderTable;$('dxRange').onchange=renderTable;
 $('dxTable').querySelectorAll('th[data-col]').forEach(e=>e.onclick=()=>{const key=e.dataset.col;state.sortDesc=state.sort===key?!state.sortDesc:false;state.sort=key;renderTable()});
 $('dxRunPair').onclick=renderPair;$('dxRunStructure').onclick=renderStructure;
 $('dxExportCSV').onclick=exportCSV;$('dxExportJSON').onclick=exportJSON;
 root.addEventListener('resize',()=>{if(panel.classList.contains('active'))charts()?.renderCharts()});
 // Native API/CSV source: a completed CVI mark updates P without a second import.
 root.setInterval(()=>{if(!state.computing){try{syncNative()}catch(e){console.warn('CVI sync',e?.message)}}},1800);
}

function replayHistorical(date,cutoff='10:30:00'){
 if(!state.loaded||!state.days.length)throw Error('Archivio SPX non ancora disponibile');
 const day=(date?state.days.find(x=>x.d===date):state.days.at(-1));
 if(!day)throw Error('Seduta SPX non disponibile nello storico');
 const t=Math.floor(Number(cutoff.slice(0,2))*60+Number(cutoff.slice(3,5))-585);
 if(!(t>=1&&t<=300))throw Error('Cutoff replay fuori range 09:46–14:45 ET');
 const spot=day.a*(1+Number(day.c[t-1])/100000);
 if(!(spot>2000))throw Error('Prezzo SPX storico non valido');
 const centre=Math.round(spot/5)*5, strikes=Array.from({length:41},(_,i)=>centre+(i-20)*5);
 state.session={date:day.d,cutoff,expiry:day.d,spot,strikes,by:new Map(),quotes:[],feature:null,source:'SPX 2023–2026 HISTORICAL P-ONLY REPLAY'};
 const nr=root.Desk?.state?.result;state.replayQKey=nr?.cfg?[nr.cfg.asof,nr.cfg.expiry].join('|'):null;
 state.prefix=null;state.selected=C.nearest(strikes,spot);
 $('dxStrike').value=String(state.selected);
 commitModel('REPLAY STORICO P (NO CHAIN Q)');
 if(state.model?.kind==='BLOCKED')throw Error(state.model?.reason||'Replay P bloccato');
 return {date:day.d,cutoff,spot,n:state.model.n,kind:state.model.kind,ESS:state.model.ESS,qMatched:false};
}

async function init(){addPanels();try{const tag=$('qt-dynamic-p-history');if(!tag)throw Error('Archivio storico embedded assente');
 const obj=await C.unzipBase64(tag.textContent);if(obj.schema!=='qt.dynamic.paths.v1'||obj.days.length<800)throw Error('Archivio storico incompleto');
 state.raw=obj;state.days=obj.days;state.loaded=true;C.setState(obj.days.length+' SESSIONI SPX · MODELLO PRONTO');C.status(obj.days.length+' sedute SPX reali 2023–2026 · importa una chain a qualsiasi orario o calcola dal modulo CVI.','ok');
 root.QuantistesDynamicValidation=JSON.parse($('qt-dynamic-p-validation').textContent);
 syncNative({force:true});
 }catch(err){C.status('ERRORE STORICO P: '+String(err.message||err),'err');C.setState('ARCHIVIO STORICO NON CARICATO');console.error(err)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
root.QuantistesDynamic=Object.freeze({replayHistorical,version:'10.0.0',ready:()=>state.loaded,stats:()=>state.model?.kind==='BLOCKED'?null:state.model?{date:state.session.date,cutoff:state.session.cutoff,kind:state.model.kind,n:state.model.n,ESS:state.model.ESS,strikes:state.rows.length,horizon:state.model.H,qMatched:!!C.liveQ()}:null,
 validate:()=>C.modelAudit(state.model),get:()=>state.model,levels:()=>C.levels(),getRows:()=>state.rows.slice(),ingest:importDaily,refresh:()=>{commitModel('refresh')}});
})(window);
