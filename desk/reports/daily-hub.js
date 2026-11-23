
(function(w){
'use strict';
const $=id=>document.getElementById(id), num=x=>Number.isFinite(x)?x.toLocaleString('it-IT',{maximumFractionDigits:2}):'—';
let interval=null,request=null,generation=0,lastSuccess=null;
function output(id,msg){const n=$(id);if(n)n.textContent=msg;}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
const controls=(...bs)=>bs.map(([id,name])=>'<button type="button" data-rd="'+id+'">'+name+'</button>').join('');
const rows=[
 ['Prima della seduta','Chain SPXW','Seleziona la scadenza ThetaData. Verifica snapshot ET, fixing e settlement SPX di riferimento. Per C-FLEX servono più scadenze allo stesso cutoff.',[['chain','Chain CSV'],['api','Scadenza / API'],['reference','Riferimenti SPX'],['calculate','Calcola CVI'],['surface','Multiscadenza']]],
 ['All’origine della previsione','ES e VIX','Carica una fotografia con contratto ES e due orari distinti, oppure attiva il bridge prezzi. Per la P cash con opzioni delle 09:45 ET acquisisci la chain a quell’ora.',[['snapshot','Snapshot ES / VIX'],['snapFormat','Tracciato snapshot'],['pricebridge','Connetti / ferma prezzi']]],
 ['Durante la seduta','OptionsDepth','Collega le greche con natura, unità e orario. Per gli eseguiti con lato esplicito usa il tracciato eseguiti. Verifica la fonte e il tempo in Dealer Flow.',[['od','Connessione dealer'],['fields','Greche / eseguiti'],['odfiles','CSV nativi OptionsDepth'],['oaFile','Output indicatore JSON']]],
 ['Quando arriva un report','Report istituzionali','Carica una o più edizioni. Trovi grafici, storico e pagine originali in Report.',[]],
 ['Dopo la chiusura','Archivi di mercato','Carica i prezzi ES e VIX a 1 minuto per la P. Aggiungi VVIX e i primi due VX mensili per il regime. Per la seduta SPX usa le barre OHLC della stessa data della chain e conserva l’archivio esportato.',[['prices','Prezzi ES / volatilità'],['cash','Barre SPX 1m'],['cashFormat','Tracciato SPX'],['archive','Esporta archivio P SPX'],['restore','Ripristina archivio P SPX']]],
 ['Alla decisione','Scoreboard','Imposta orario di New York, orizzonte, target, stop e costo. Leggi sedute comparabili, playbook e contributo istituzionale al cutoff.',[['score','Apri scoreboard']]]
];
function html(){return '<details id="rdRoutine" open><summary>Routine giornaliera</summary><div class="rd-rows">'+rows.map(r=>'<section class="rd-line"><div><small>'+r[0]+'</small><strong>'+r[1]+'</strong></div><div><p>'+r[2]+'</p><div class="rd-actions">'+(r[1]==='Report istituzionali'?'<div id="irUploadDock"></div>':controls(...r[3]))+'</div></div></section>').join('')+'</div></details>'+
 '<input id="rdOAFile" type="file" accept=".json,application/json" hidden><details id="rdDealer"><summary>Connessione dealer · OptionsDepth</summary><p>Indica l’URL del tuo servizio che restituisce le serie del desk. Il tracciato definisce coordinate, scadenze, natura e unità dei campi. Puoi usare un endpoint che il browser può leggere, oppure il tuo bridge. Per le risposte a righe, importa un esempio JSON e associa i campi una volta.</p><div class="ir-form"><label>URL del feed dealer<input id="rdUrl" type="url" spellcheck="false" placeholder="https://…"></label><label>Autenticazione<select id="rdAuth"><option value="">Gestita dal servizio</option><option value="bearer">Bearer</option><option value="key">X-API-Key</option></select></label><label>Chiave di sessione<input type="password" autocomplete="off" id="rdSecret"></label><label>Intervallo in secondi<input id="rdGap" type="number" min="15" max="3600" value="60"></label></div><div class="rd-actions">'+controls(['once','Leggi una volta'],['poll','Avvia aggiornamento'],['stop','Ferma'],['format','Tracciato greche'])+'</div><output id="rdFeedState" aria-live="polite">In attesa della sorgente.</output>'+w.DealerAdapter.controls()+'<p>Per confrontare il gamma totale con quello del report, la serie deve dichiarare inventario dealer, coordinate strike, scadenze ALL, copertura integrale, convenzione dealer long positiva e unità USD/1% SPX. Una risposta limitata a un intervallo di scadenze, per esempio 0–90 DTE, alimenta i grafici per quel perimetro.</p></details>'+
 '<details id="rdMarket"><summary>Archivio prezzi ES, VIX, VVIX e VX</summary><p>CSV con ultima osservazione per minuto e ora effettiva di disponibilità. Il timestamp è quello di fine barra, con fuso. Per ES indica il contratto. Per VX usa i due mensili standard più vicini, simbolo, scadenza e tenore M1 o M2. Il tipo 1m alimenta il confronto intraday. Per i trigger e il reset ETF puoi includere anche SPX a 1 minuto. Il reset richiede la chiusura ufficiale SPX della seduta precedente. Le chiusure degli indici hanno tipo close e i settlement dei futures tipo settlement.</p><div class="rd-actions">'+controls(['prices','Carica CSV prezzi'],['template','Tracciato prezzi CSV'])+'<input type="file" hidden multiple id="rdPriceFile" accept=".csv,text/csv"></div><output id="rdPriceState" aria-live="polite"></output></details><output id="rdStatus" aria-live="polite"></output>';}
function reveal(n){if(!n)return;for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;n.scrollIntoView?.({block:'center'});n.focus?.({preventScroll:true});}
function route(stage,tool){if($('q15Settings')?.classList.contains('open'))$('q15SettingsClose')?.click();w.QuantistesFlatDesk?.go(stage,tool);}
function stop(){generation++;clearInterval(interval);interval=null;request?.abort();request=null;}
async function fetchDealer(urlText,gen=generation){
 if(request)return;const url=new URL(urlText);if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Usa HTTPS o un servizio HTTP locale.');
 const ctl=new AbortController();request=ctl;const timer=setTimeout(()=>ctl.abort(),15000);
 try{const headers={Accept:'application/json'},auth=$('rdAuth')?.value,secret=$('rdSecret')?.value?.trim();if(auth){if(url.protocol!=='https:'||!secret)throw Error('Per autenticare il feed servono HTTPS e la chiave di sessione.');headers[auth==='bearer'?'Authorization':'X-API-Key']=auth==='bearer'?'Bearer '+secret:secret;}const res=await fetch(url.href,{headers,redirect:'error',credentials:'omit',cache:'no-store',signal:ctl.signal});if(!res.ok)throw Error('Risposta HTTP '+res.status);const json=await res.json();if(gen!==generation)return;const d=w.DealerAdapter.adapt(json,w.DealerAdapter.current());
 if(d?.schema!=='quantistes.greek_fields.v1')throw Error('Risposta incompatibile. Il feed deve fornire quantistes.greek_fields.v1.');
 const now=Date.now(),n=w.DeskFields.installLive(d,now),times=d.series.flatMap(s=>s.rows.map(r=>Date.parse(r.asof))),latest=times.reduce((m,v)=>Math.max(m,v),-Infinity);
 lastSuccess=latest;w.DealerAdapter.rememberEndpoint(url);output('rdFeedState',(now-latest>300000?'Dati storici':'Dati coevi')+' · ultimo dato '+new Date(latest).toISOString()+' · '+n+' nuovi snapshot.');
 }finally{clearTimeout(timer);if(request===ctl)request=null;}
}
async function click(e){const id=e.target.closest?.('[data-rd]')?.dataset.rd;if(!id)return;try{
 const files={oaFile:'rdOAFile',chain:'csvFile',snapshot:'q13SnapshotFile',fields:'stFlowFile',pdf:'irFiles',cash:'dxPathFile',restore:'dxLoadArchive',prices:'rdPriceFile'};
 if(files[id]){if(id==='prices')$('rdMarket').open=true;if(id==='cash'||id==='restore')route('path','dynamic-p');const input=$(files[id]);if(!input)throw Error('Il modulo di caricamento si sta avviando.');input.click();return;}
 if(id==='snapFormat')return download('Quantistes_snapshot_ES_VIX_esempio.csv','asof,contract,es_last,es_asof,vix,vix_asof\n2026-11-20T09:45:00-05:00,ESZ26,6900.25,2026-11-20T09:45:00-05:00,20.10,2026-11-20T09:44:55-05:00');
 if(id==='reference'){reveal($('settlement'));return;}
 if(id==='api'){reveal($('skApiDate-side'));return;}if(id==='calculate'){reveal($('settlement'));$('q15Calculate')?.click();return;}
 if(id==='surface')return route('market','volcube');if(id==='score')return route('score','decision');
 if(id==='odfiles'){route('dealer','flow-ops');requestAnimationFrame(()=>reveal($('flowGammaFile')));return;}
 if(id==='archive'){route('path','dynamic-p');$('dxSaveArchive')?.click();return;}
 if(id==='pricebridge'){const b=$('q13Bridge');b?.click();output('rdStatus','Bridge ES/VIX · '+(b?.textContent||'stato in Data Hub'));return;}
 if(id==='reports'){route('reports','report-charts');return;}
 if(id==='od'){$('rdDealer').open=true;reveal($('rdUrl'));return;}
 if(id==='cashFormat')return download('Quantistes_barre_SPX_esempio.csv','session_date_et,minute_et,open_spx,high_spx,low_spx,close_spx\n2026-11-20,09:45,6900,6901,6898,6900.50\n2026-11-20,09:46,6900.50,6902,6899,6901.25');
 if(id==='template')return download('Quantistes_prezzi_es_volatilita_esempio.csv',w.DeskMarkets.template());
 if(id==='format'){const spec=w.DeskFields.template();spec.comparison_fields={participant:'dealer',coverage:'full_book',gamma_sign:'dealer_long_positive',gamma_unit:'USD/1% SPX',available_at:'ISO 8601, su ciascuna riga'};return download('Quantistes_greche_tracciato.json',JSON.stringify(spec,null,2));}
 if(id==='stop'){stop();output('rdFeedState','Aggiornamento fermato.'+(lastSuccess?' Ultimo dato '+new Date(lastSuccess).toISOString():''));return;}
 if(['once','poll'].includes(id)){const url=$('rdUrl').value.trim(),gap=$('rdGap').valueAsNumber;if(!url||id==='poll'&&!(gap>=15&&gap<=3600))throw Error('Indica URL e intervallo da 15 a 3.600 secondi.');stop();const gen=generation;output('rdFeedState','Lettura del feed…');await fetchDealer(url,gen);if(id==='poll'&&gen===generation)interval=setInterval(()=>fetchDealer(url,gen).catch(e=>{if(gen===generation)output('rdFeedState','Feed in attesa · '+e.message);}),gap*1000);return;}
 }catch(err){output(['once','poll'].includes(id)?'rdFeedState':'rdStatus',err.message);}}
function marketPanel(){const anchor=$('qt360RegimePlot');if(!anchor)return;let el=$('rdVolState');if(!el){el=document.createElement('section');el.id='rdVolState';el.className='ir-shell';anchor.before(el);}
 const cut=w.InstitutionalDesk?.clock?.(),x=w.DeskMarkets.state(cut);if(!Number.isFinite(cut)){el.hidden=true;return;}
 const day=w.DeskMeasures.clock(new Date(cut).toISOString()).date;let previous=null;for(const d of w.DeskMarkets.dates().reverse()){if(d>=day)continue;const v=w.DeskMarkets.closes(d,cut);if(v.VIX||v.VVIX||v.VX?.length){previous={d,...v};break;}}
 el.hidden=!(x?.vix||x?.vvix||x?.one||previous);if(el.hidden)return;const lines=[];
 if(x?.vix||x?.vvix)lines.push('Indici al cutoff · VIX '+num(x.vix?.price)+' / VVIX '+num(x.vvix?.price));
 if(x?.one)lines.push('Futures mensili · '+[x.one,x.two].filter(Boolean).map(r=>r.contract+' ('+r.expiry+') '+num(r.price)).join(' / ')+' · basis '+num(x.basis)+' · pendenza '+num(x.slope));
 if(previous){lines.push('Chiusura disponibile '+previous.d+' · VIX '+num(previous.VIX?.price)+' / VVIX '+num(previous.VVIX?.price));if(previous.VX?.length)lines.push('Settlement VX · '+previous.VX.map(r=>r.contract+' '+num(r.price)).join(' / '));}
 const txt=lines.join('\n');if(el.dataset.last!==txt){el.dataset.last=txt;el.replaceChildren();const h=document.createElement('h3');h.textContent='Prezzi di volatilità della sessione';el.append(h);for(const t of lines){const p=document.createElement('p');p.textContent=t;el.append(p);}}
}
function mount(){const hub=$('q15ParamsMount');if(!hub||$('rdHub'))return;
 const el=document.createElement('section');el.id='rdHub';el.className='ir-shell rd-hub';el.innerHTML=html();hub.prepend(el);w.InstPanels?.mount?.();w.DealerAdapter.bind();el.addEventListener('click',click);
 const oaFile=$('rdOAFile');if(oaFile)oaFile.onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{const frame=await w.OANative.importFile(file);output('rdStatus',frame.rows.length+' strike archiviati · '+frame.source);closeHubOA(frame);}
  catch(error){output('rdStatus',error?.message||String(error));}
 };
 function closeHubOA(frame){route('scalp','scalp-indicator');w.OADashboard?.openAt('native:'+frame.seriesId,Math.min(Date.now(),frame.availableAt));}
 $('rdPriceFile').onchange=async e=>{const files=[...e.target.files];e.target.value='';try{let n=0;for(const f of files){output('rdPriceState','Lettura · '+f.name);const a=w.DeskMarkets.parse(await f.text());await w.DeskMarkets.save(a);n+=a.length;}output('rdPriceState',n+' osservazioni lette · '+w.DeskMarkets.dates().length+' sedute in archivio.');marketPanel();}catch(err){output('rdPriceState',err.message);}};
 w.DeskMarkets.ready().then(()=>output('rdPriceState',w.DeskMarkets.dates().length+' sedute importate.')).catch(e=>output('rdPriceState',e.message));
}
function boot(){mount();const mo=new MutationObserver(m=>{if(m.some(z=>[...z.addedNodes].some(n=>n.nodeType===1&&['q15Settings','q13App'].includes(n.id))))requestAnimationFrame(mount);});mo.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',e=>{if(e.target.closest('#qlOpenData,#q15DataButton'))requestAnimationFrame(()=>{mount();if($('rdHub'))$('q15ParamsMount')?.prepend($('rdHub'));});});for(const event of ['desk:route','desk:markets','desk:frame-changed','quantistes:v12-feed','desk:reports-ready'])w.addEventListener(event,marketPanel);}
w.DeskDailyHub={mount,fetchDealer,stop,marketPanel};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);

