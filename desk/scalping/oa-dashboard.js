
(function(w,doc){
'use strict';
const id=x=>doc.getElementById('oa'+x),F=Number.isFinite;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}),precise=new Intl.NumberFormat('it-IT',{maximumFractionDigits:9});
const dateFmt=new Intl.DateTimeFormat('it-IT',{timeZone:'America/New_York',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const val=x=>F(x)?fmt.format(x):x===null||x===undefined||x===''?'—':String(x);
const sv=x=>F(x)?(x>0?'+':'')+fmt.format(x):'—';
const stamp=x=>F(x)?x:typeof x==='string'?Date.parse(x):NaN;
const et=t=>F(stamp(t))?dateFmt.format(stamp(t))+' ET':'—';
const label=x=>x===null||x===undefined||x===''?'—':String(x);
const asArray=v=>Array.isArray(v)?v:[];
const stock=()=>w.QuantistesFlatDesk?.state?.()?.tool==='scalp-indicator';
const state={source:'',filter:'all',clock:'latest',cut:null,key:null,range:0,find:'',focus:'all',coord:'',fixed:null,inferred:false,nativeScale:false,view:'ladder',ds:1,div:0,dt:1,band:.5,scoreLink:false};
let shell=null,all=[],set=null,book=null,model=null,under=null,current=null,editions=[],rows=[],shown=[],pending=false,deadline=0;
const pageSize=120;
const columns=[['price','Price'],['gamma','Gamma/CPT'],['charm','Charm'],['esgFlow','ESGFlow'],['escFlow','ESCFlow'],['gTag','G-Tag'],['velocity','Velocity'],['flip','Flip'],['cg','C/G'],['alert','Alert'],['trade','Trade'],['dealerAction','Dealer Action']];
const columnInfo=['Strike nella coordinata selezionata','Gamma e coefficiente CPT secondo la fonte','Charm nella convenzione della fonte','Flusso gamma cumulato della fonte','Flusso charm cumulato della fonte','Classificazione gamma locale','Stato del momentum','Transizione direzionale','Relazione charm / gamma','Evento al livello','Segnale della fonte','Comportamento di copertura indicato'];
const cell=(tag,body,cls='')=>'<'+tag+(cls?' class="'+cls+'"':'')+'>'+body+'</'+tag+'>';
const button=(act,txt,title='',extra='')=>'<button type="button" data-oa="'+act+'"'+(title?' title="'+esc(title)+'"':'')+extra+'>'+esc(txt)+'</button>';
const opt=(k,txt)=>'<option value="'+esc(k)+'">'+esc(txt)+'</option>';
const options=(el,items,value)=>{const s=items.map(([k,v])=>opt(k,v)).join('');if(el.innerHTML!==s)el.innerHTML=s;el.value=value;};
const tone=v=>!F(v)||v===0?'oa-neutral':v>0?'oa-pos':'oa-neg';
const stat=(k,v,sub='')=>'<div class="oa-stat"><span>'+esc(k)+'</span><strong>'+esc(label(v))+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';
const empty=s=>'<p class="oa-none">'+esc(s)+'</p>';
const rec=(k,v)=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(label(v))+'</dd></div>';
const notesOf=x=>[x?.note,...asArray(x?.notes)].filter(s=>typeof s==='string'&&s);
const note=x=>notesOf(x).map(t=>'<p class="oa-foot">'+esc(t)+'</p>').join('');
const jump=(raw,v)=>F(raw)?button('strike',v??val(display(raw)),'Seleziona lo strike',' data-price="'+raw+'"'):'—';
function nativeCoord(){return model?.coordinate==='ES'?'ES':'SPX';}
function basis(){return F(model?.basis)?model.basis:F(model?.panels?.header?.basis)?model.panels.header.basis:null;}
function display(p){
 if(!F(p))return null;
 if(state.coord===nativeCoord())return p;
 const d=basis();return F(d)?p+(state.coord==='ES'?d:-d):null;
}
function spotNative(){
 if(F(model?.priceSpot))return model.priceSpot;
 if(nativeCoord()==='SPX')return F(model?.spot)?model.spot:null;
 if(F(model?.panels?.header?.spot))return model.panels.header.spot;
 return F(model?.spot)&&F(basis())?model.spot+basis():F(model?.esSpot)?model.esSpot:null;
}
function scopeOf(set){
 if(set.scope)return set.scope;
 const nativeScope=String(set.models?.at(-1)?.scope||'').toUpperCase();if(nativeScope)return nativeScope==='ALL'?'ALL_EXP':nativeScope;
 const f=set.pack?.frames?.at(-1)||set.models?.at(-1)?.panels?.header||{};
 const s=String(f.scope||'').toUpperCase();if(['ALL','ALL_EXP'].includes(s)||set.pack?.expiry==='ALL')return 'ALL_EXP';
 return s==='0DTE'||s==='ODTE'?'0DTE':s||'EXPIRY';
}
const visibleSets=()=>all.filter(z=>state.filter==='all'||scopeOf(z)===state.filter);
const nativeId=x=>String(x.seriesId||x.id);
function gather(){
 const end=Date.now(),ss=[];
 const capture=w.OAReference;if(capture?.rows?.length)ss.push({id:'reference',kind:'reference',label:'Archivio · 12 novembre 2025',models:[capture],scope:'0DTE'});
 const pub=asArray(w.OANative?.vintages?.(end)??w.OANative?.list?.(end)),group=new Map();
 for(const row of pub){
  const key='native:'+nativeId(row);if(!group.has(key))group.set(key,{id:key,kind:'native',label:'Indicatore · '+(row.seriesLabel||row.source||row.label||nativeId(row)),models:[]});
  group.get(key).models.push(row);
 }
 for(const z of group.values()){z.models.sort((a,b)=>stamp(a.asof)-stamp(b.asof)||stamp(a.availableAt)-stamp(b.availableAt));ss.push(z);}
 const packs=asArray(w.ScalpSources?.list?.(end));
 for(const pack of packs)ss.push({id:'flow:'+pack.id,kind:'flow',label:(pack.mode==='observed'?'Flusso osservato':pack.mode==='demo'?'Demo sintetica':'Campione')+' · '+(pack.label||pack.id),pack});
 return ss;
}
function getDefault(sets){
 const now=Date.now(),first=sets.find(z=>z.kind==='flow'&&z.pack.mode==='observed'&&z.pack.frames?.some(f=>now-stamp(f.ts)<300000&&stamp(f.availableAt??f.ts)<=now));
 return first||sets.find(z=>z.kind==='reference')||sets[0]||null;
}
function cancel(){if(deadline)clearTimeout(deadline);deadline=0;}
function schedule(ms){
 cancel();if(!F(ms)||!stock()||doc.hidden||state.clock!=='latest'||set?.kind!=='flow'||set.pack.mode!=='observed'||ms<Date.now())return;
 deadline=setTimeout(()=>{deadline=0;if(stock())refresh();},Math.min(2147483646,Math.max(1,ms+1-Date.now())));
}
function queue(){if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;if(stock())refresh();});}}
function scopeOptions(){
 const avail=new Set(all.map(scopeOf)),o=[['all','Tutte le serie']];
 for(const [k,l] of [['0DTE','0DTE'],['ALL_EXP','ALL_EXP'],['EXPIRY','Altre scadenze']])if(avail.has(k))o.push([k,l]);
 if(!o.some(z=>z[0]===state.filter))state.filter='all';options(id('Scope'),o,state.filter);
}
function nativeTimes(z){
 const frames=z.kind==='flow'?z.pack.frames:z.models;
 return [...new Set(asArray(frames).map(f=>Math.max(stamp(f.ts??f.asof),stamp(f.availableAt??f.ts??f.asof))).filter(F))].sort((a,b)=>a-b);
}
function read(){
 if(!set)return {error:state.clock==='fixed'?(state.scoreLink?'Nessun flusso osservato disponibile al cutoff della scoreboard.':'Serie richiesta assente al cutoff.'):'Nessuna serie disponibile per questo perimetro.'};
 const k=state.clock,now=Date.now();editions=nativeTimes(set);
 if(set.kind==='reference'){
  const m=set.models[0],at=stamp(m.availableAt??m.asof);
  const t=k==='desk'?w.InstitutionalDesk?.clock?.():k==='fixed'?state.fixed:at;
  if(!F(t))return {error:'Prima seleziona una seduta ES nella scoreboard.'};
  return t<at?{error:'La seduta è disponibile il '+et(at)+'.',cutoff:t}:{data:m,cutoff:t};
 }
 if(!editions.length)return {error:'La serie non contiene osservazioni datate.'};
 if(k==='replay'&&!F(state.cut))state.cut=editions.at(-1);
 const t=k==='replay'?state.cut:k==='fixed'?state.fixed:k==='desk'?w.InstitutionalDesk?.clock?.():set.kind==='flow'&&set.pack.mode==='observed'?now:editions.at(-1);
 if(!F(t))return {error:'Seleziona prima una seduta ES nella scoreboard oppure scegli Replay.'};
 if(set.kind==='native'){
  const m=asArray(w.OANative?.list?.(t)).filter(x=>'native:'+nativeId(x)===set.id&&stamp(x.asof)<=t&&stamp(x.availableAt??x.asof)<=t).sort((a,b)=>stamp(b.asof)-stamp(a.asof)||stamp(b.availableAt)-stamp(a.availableAt))[0];
  return m?{data:m,cutoff:t}:{error:'Nessuna edizione pubblicata entro '+et(t)+'.',cutoff:t};
 }
 const companions=asArray(w.ScalpSources?.list?.(t)),pack=companions.find(p=>p.id===set.pack.id);
 if(!pack)return {error:'Nessun flusso disponibile entro '+et(t)+'.',cutoff:t};
 const out=w.ScalpEngine?.analyze?.(pack,{cutoff:t,ds:state.ds,div:state.div,dt:state.dt,band:state.band,maxAgeMinutes:state.scoreLink||state.clock==='desk'?5:undefined,companions});
 if(!out?.ok)return {error:out?.reason||'Dati insufficienti al cutoff selezionato.',cutoff:t};
 const frame=asArray(pack.frames).find(f=>f.ts===out.asof&&f.availableAt===out.availableAt);
 if(!frame)return {error:'Lo snapshot del calcolo è incompleto.',cutoff:t};
 const base=w.OAMetrics?.calculate?.(pack,frame,out,{cutoff:t,companions});let data=base;
 if(base&&state.inferred&&w.OAProfile){
  const nativeScale=state.nativeScale||pack.mode==='demo'&&pack.oaCompatible===true||String(frame.units?.gamma||'').trim().toLowerCase()==='oa gamma'&&String(frame.units?.charm||'').trim().toLowerCase()==='oa charm';
  data=w.OAProfile.apply(base,pack,frame,out,{nativeScale,cutoff:t})||base;
 }
 return data?{data,cutoff:t,pack,out,frame}:{error:'La lettura per strike è indisponibile.',cutoff:t};
}
function renderClock(){
 const staticRef=set?.kind==='reference',o=staticRef?[['latest','Edizione storica'],['desk','Ora scoreboard']]:[['latest',set?.kind==='native'?'Ultima edizione':'Ultima lettura'],['desk','Ora scoreboard'],['replay','Replay']];
 if(state.clock==='fixed')o.push(['fixed','Cutoff del desk']);
 options(id('Clock'),o,state.clock);id('Clock').disabled=!set;
 const replay=state.clock==='replay';id('Replay').hidden=!replay;
 if(replay){
  const at=Math.max(0,editions.indexOf(state.cut));id('Seek').max=String(Math.max(0,editions.length-1));id('Seek').value=String(at);
  id('Prev').disabled=at===0;id('Next').disabled=at>=editions.length-1;
  id('SeekOut').textContent=et(editions[at]);
 }
}
function sourceName(){
 if(set.kind==='reference')return 'Edizione storica';
 if(set.kind==='native'){const data=current?.data;return data?.dataOrigin==='sample'||data?.dataOrigin==='synthetic'?'Edizione importata · campione':'Edizione importata';}
 return set.pack.mode==='demo'?'Simulazione':set.pack.mode==='sample'?'Campione':'Flussi osservati';
}
function mount(){
 const h=doc.getElementById('oaDashboard');
 if(!h)return false;
 if(shell===h&&id('Source'))return true;
 field?.destroy();shell=h;
 const choices=items=>items.map(([key,name])=>opt(key,name)).join('');
 const num=(key,name,initial,min)=>'<label>'+name+'<input id="oa'+key+'" type="number" value="'+initial+'" step="any" '+(min===undefined?'':'min="'+min+'"')+' required></label>';
 const views=[['ladder','Strike Flow Analysis'],['greeks','Greche dealer'],['chart','Grafici'],['session','Quadro di seduta']];
 h.innerHTML='<div class="oa-dash"><nav class="oa-pages" aria-label="Viste scalping">'+views.map(([key,name])=>button('view',name,'',' data-view="'+key+'"')).join('')+button('reference','12 nov 2025','Apri la tabella storica completa in coordinate ES',' class="oa-historical"')+'</nav>'+
 '<div class="oa-command"><label>Fonte<select id="oaSource" aria-label="Fonte e serie"></select></label><label>Scadenze<select id="oaScope"></select></label><label>Orario<select id="oaClock"></select></label><div class="oa-segment" aria-label="Coordinate prezzo">'+button('SPX','SPX','Prezzi indice')+button('ES','ES','Livelli sul future')+'</div>'+button('update','Aggiorna')+button('hub','Data Hub ↗')+'</div>'+
 '<div id="oaReplay" class="oa-replay" hidden><button type="button" data-oa="play" id="oaPlay" aria-label="Riproduci replay" aria-pressed="false">▶</button><button type="button" id="oaPrev" data-oa="prev" aria-label="Edizione precedente">‹</button><input id="oaSeek" type="range" min="0" aria-label="Orario replay"><button type="button" id="oaNext" data-oa="next" aria-label="Edizione successiva">›</button><output id="oaSeekOut"></output></div>'+
 '<div class="oa-metadata"><span id="oaSourceLabel"></span><time id="oaStamp"></time></div><div id="oaEmpty" role="status" hidden></div><div id="oaLoaded"><section class="oa-header" id="oaHeader"></section><div id="oaBanner"></div></div>'+
 '<section id="oaBook" class="oa-strip" aria-labelledby="oaBookTitle"><div class="oa-sectionhead"><h2 id="oaBookTitle">Strike Flow Analysis</h2><span id="oaRowCount"></span></div><div class="oa-filterbar"><label>Zona<select id="oaRange">'+choices([['0','Intera serie'],['150','±150 pt'],['50','±50 pt'],['25','±25 pt'],['10','±10 pt']])+'</select></label><label>Mostra<select id="oaFocus">'+choices([['all','Tutti gli strike'],['confirmed','Retest confermati'],['flip','Flip'],['alert','Alert'],['wall','Gamma wall'],['watch','Watch'],['pin','Target charm']])+'</select></label><label class="uf-find"><span>Cerca</span><input id="oaFind" type="search" placeholder="Strike o segnale"></label>'+button('atm','Vai ad ATM')+'</div>'+
 '<div class="oa-ladderframe" id="oaViewport"><table class="oa-ladder" id="oaLadder" aria-labelledby="oaBookTitle"><thead><tr id="oaHead"></tr></thead><tbody id="oaGrid"></tbody></table></div><div class="oa-gridfoot"><span id="oaRowNote"></span><div id="oaPager" hidden>'+button('page-prev','‹','Strike precedenti')+'<output id="oaPage"></output>'+button('page-next','›','Strike successivi')+'</div></div></section>'+
 '<section class="uf-field" id="oaField" hidden><header class="uf-head"><h2>Flussi per strike</h2><div class="uf-modes" aria-label="Grafico">'+[['profile','Profilo'],['map','Mappa temporale'],['price','Prezzo'],['history','Storico strike']].map(([key,name])=>'<button type="button" data-mode="'+key+'" aria-pressed="'+(key==='profile')+'">'+name+'</button>').join('')+'</div><label class="uf-map-key" hidden>Greca <select aria-label="Greca della mappa"><option value="gamma">Gamma</option><option value="charm">Charm</option><option value="delta">Delta</option><option value="vanna">Vanna</option></select></label><small class="uf-scale"></small></header><div class="uf-scope" tabindex="0" role="group" aria-label="Profilo interattivo" title="Frecce per esplorare e Invio per la scheda strike. Sulla mappa, clic per selezionare e doppio clic per il replay."><canvas class="uf-ink" aria-hidden="true"></canvas><canvas class="uf-back" aria-hidden="true" hidden></canvas><canvas class="uf-axes" aria-hidden="true"></canvas><i class="uf-hair" hidden></i><i class="uf-yhair" hidden></i><span class="uf-empty" hidden></span></div><output class="uf-read"></output></section>'+
 '<section class="oa-session" id="oaSessionView" aria-label="Quadro di seduta" hidden><div id="oaSessionData"><h2>Livelli ed esposizioni</h2><div id="oaContext" class="oa-cards"></div><h2>Momentum e proiezioni</h2><div id="oaDynamics" class="oa-dynamics"></div></div>'+
 '<section id="oaScenario" class="uf-settings" hidden><header><h3>Scenario dealer</h3><span id="oaShockCode"></span></header><form id="oaShockForm">'+num('Ds','Variazione SPX · pt',1)+num('Div','Variazione IV · pt vol',0)+num('Dt','Tempo · min',1,0)+num('Band','Semifascia retest · pt',.5,.000001)+'<button type="submit">Applica</button><output id="oaShockStatus" aria-live="polite"></output></form><div id="oaRules" class="oa-rules" hidden><label>Profilo<select id="oaMethod"><option value="qt">Copertura dealer</option><option value="inferred">Indicatore stimato</option></select></label><label id="oaUnitLabel"><input type="checkbox" id="oaUnits"> Scala indicatore per gamma e charm</label></div></section>'+
 '<section class="oa-import"><header><h3>Archivio indicatore</h3></header><div><label class="oa-file">Importa edizione<input id="oaFile" type="file" accept=".json,application/json"></label>'+button('schema','Tracciato di importazione')+button('backup','Scarica archivio')+button('guide','Guida ai segnali')+'<output id="oaImportStatus" aria-live="polite"></output></div></section></section>'+
 '<dialog id="oaDialog" aria-labelledby="oaDialogTitle" aria-modal="true"><div class="oa-dialog-head"><h2 id="oaDialogTitle">Scheda strike</h2><div id="oaStep">'+button('prior-strike','‹','Strike precedente')+button('next-strike','›','Strike successivo')+'</div>'+button('close','Chiudi ×','Chiudi finestra')+'</div><div id="oaInspect" class="oa-inspect"></div></dialog></div>';
 field=w.DeskStrikeField?.mount?.(id('Field'),(p,inspect=true)=>{if(F(p)){if(inspect)openStrike(p);else pick(p,false);}},(k,t)=>{if(under&&F(t)){stopReplay();state.clock='replay';state.scoreLink=false;state.cut=t;state.fixed=null;state.key=k;refresh();}})||null;
 if(!field){const msg=id('Field').querySelector('.uf-empty');msg.hidden=false;msg.textContent='Grafico non disponibile. I valori sono nella tabella per strike.';}
 h.addEventListener('click',onClick);h.addEventListener('keydown',onKey);
 id('Dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
 id('Dialog').addEventListener('close',()=>{if(!id('Dialog')?.hasAttribute('open'))finishDialog();});
 id('Source').onchange=()=>chooseSource(id('Source').value);
 id('Scope').onchange=()=>{closeDialog(false);stopReplay();state.filter=id('Scope').value;const z=visibleSets();if(!z.some(x=>x.id===state.source))chooseSource(getDefault(z)?.id||'');else refresh();};
 id('Clock').onchange=()=>{closeDialog(false);stopReplay();const last=current?.cutoff;state.clock=id('Clock').value;state.scoreLink=false;state.cut=state.clock==='replay'&&F(last)?editions.filter(t=>t<=last).at(-1)??null:null;state.fixed=null;refresh();};
 id('Seek').oninput=()=>{stopReplay();state.cut=editions[+id('Seek').value];refresh();};
 id('Find').oninput=()=>{state.find=id('Find').value;renderTable();};
 id('Focus').onchange=()=>{state.focus=id('Focus').value;renderTable();};
 id('Range').onchange=()=>{state.range=Number(id('Range').value);renderTable();};
 id('Method').onchange=()=>{state.inferred=id('Method').value==='inferred';refresh();};
 id('Units').onchange=()=>{state.nativeScale=id('Units').checked;refresh();};
 id('ShockForm').onsubmit=e=>{e.preventDefault();const inputs=['Ds','Div','Dt','Band'].map(k=>id(k).value),[ds,div,dt,band]=inputs.map(Number);
  if(!inputs.every(s=>String(s).trim()!=='')||![ds,div,dt,band].every(F)||dt<0||band<=0){id('ShockStatus').textContent='Controlla i valori dello scenario.';return;}
  Object.assign(state,{ds,div,dt,band});id('ShockStatus').textContent='Scenario applicato';refresh();
 };
 id('File').onchange=upload;syncViews();return true;
}

function chooseSource(k){
 closeDialog(false);stopReplay();state.scoreLink=false;
 const demo=all.find(z=>z.id===k)?.pack;
 state.inferred=demo?.mode==='demo'&&demo.oaCompatible===true;state.nativeScale=false;state.source=k;state.clock='latest';state.cut=null;state.fixed=null;state.key=null;state.find='';state.focus='all';
 id('Find').value='';id('Focus').value='all';refresh();
}
function refresh(){
 if(!mount())return;cancel();
 try{
  all=gather();scopeOptions();const z=visibleSets();
  if(state.clock!=='fixed'&&!z.some(x=>x.id===state.source))state.source=getDefault(z)?.id||'';
  options(id('Source'),z.map(s=>[s.id,s.label]),state.source);set=z.find(s=>s.id===state.source)||null;

  const r=read();current=r;renderClock();model=r.data;under=r.pack||null;book=r.out||null;
  id('SourceLabel').textContent=set?sourceName():'';id('Stamp').textContent=F(r.cutoff)?'Cutoff '+et(r.cutoff):'';
  if(!model?.rows?.length){
   showEmpty(r.error||'Nessuna riga disponibile in questa edizione.');return;
  }
  if(!state.coord){let stored;try{stored=w.localStorage?.getItem('quantistes.oa.coordinate');}catch{}state.coord=['ES','SPX'].includes(stored)?stored:nativeCoord();}
  if(state.coord!==nativeCoord()&&!F(basis()))state.coord=nativeCoord();
  syncViews();id('SessionData').hidden=false;id('Empty').hidden=true;id('Loaded').hidden=false;
  for(const c of ['SPX','ES']){
   const b=shell.querySelector('[data-oa="'+c+'"]');b.setAttribute('aria-pressed',String(state.coord===c));b.disabled=c!==nativeCoord()&&!F(basis());
  }
  bookIndex=new Map(asArray(book?.rows).map(r=>[r.strike,r]));rawIndex=new Map(asArray(r.frame?.rows).map(r=>[r.strike,r]));
  rows=asArray(model.rows).filter(r=>F(r.price)).map(rowData).sort((a,b)=>b.price-a.price);
  if(!rows.some(r=>r.price===state.key))state.key=nearest(rows)?.price??null;
  rules();scenarioInput();renderHeader();renderTable();renderPanels();schedule(r.out?.freshThrough);
 }catch(e){
  model=null;under=null;book=null;showEmpty('Serie momentaneamente indisponibile. Controlla fonte e orario.');
 }
}
function nearest(a){
 if(!a.length)return null;const spot=spotNative();
 return F(spot)?a.reduce((l,r)=>Math.abs(r.price-spot)<Math.abs(l.price-spot)?r:l):a[0];
}
function rowName(r){return String(r?.trade||'').toUpperCase();}
function primary(){
 const p=model?.panels;return [p?.convergence?.price,...asArray(p?.charmDaily?.levels).map(x=>x.price),...asArray(p?.charmTactical?.levels).map(x=>x.price)].filter(F);
}
function renderHeader(){
 const p=model.panels||{},h=p.header||{},cv=p.convergence||{},d=basis();
 const nativeRange=Array.isArray(h.range)?h.range.map(display):null;
 const mark=spotNative(),range=nativeRange?.length===2&&nativeRange.every(F)?nativeRange.map(val).join(' – '):F(mark)?[display(mark)-150,display(mark)+150].map(val).join(' – '):'—';
 const ref=set.kind==='reference';
 const stats=[stat(ref?'SPX derivato':'Spot SPX',val(model.spot??(nativeCoord()==='SPX'?h.spot:null)),ref?'Da ES Spot e basis esposta':'Punti indice'),
  stat('ES future',val(model.esSpot??h.es),F(d)?'Basis '+sv(d)+' pt':'Basis assente'),stat('Fascia '+state.coord,range,h.scope||model.expiry),
  stat('Regime',h.regime,[F(h.regimePct)?(under?sv(h.regimePct):val(h.regimePct))+'%':'',h.regimeConfidence,F(h.regimeMinutes)?val(h.regimeMinutes)+'m':''].filter(Boolean).join(' · ')),
  stat('Aggiornamento',et(model.asof),F(h.refreshMinutes)?'Cadenza fonte '+val(h.refreshMinutes)+' min':F(stamp(model.availableAt))?'Disponibile '+et(model.availableAt):'')].join('');
 id('Header').innerHTML=stats;
 const signal=cv.label||cv.status||'',origin=F(cv.price)?' · '+val(display(cv.price))+' '+state.coord:'';
 const stale=under&&book?.reason?'<p class="oa-hold">'+esc(book.reason)+' · Stati tattici sospesi.</p>':'';
 id('Banner').innerHTML='<div class="oa-banner"><div><span>Daily / intraday</span><strong>'+esc(signal||'Convergenza in attesa')+esc(origin)+'</strong></div><p>'+esc([F(cv.daily)?'Charm daily '+sv(cv.daily):'',F(cv.intraday)?'Charm intraday '+sv(cv.intraday):'',ref&&F(h.spot)?'ES Spot pubblicato '+val(h.spot):''].filter(Boolean).join('  ·  '))+'</p></div>'+stale;
}
const schema={
 price:['Strike','Strike nella coordinata selezionata'],delta:['Delta','Delta dealer in contratti ES equivalenti'],gamma:['Gamma/CPT',columnInfo[1]],charm:['Charm',columnInfo[2]],vanna:['Vanna','Variazione del delta per +1 punto di volatilità in ES equivalenti'],caseId:['Caso','Caso A/B e regime globale verificato'],regime:['Regime','Segno della gamma aggregata del dealer'],status:['Conferma','Stato del test del prezzo al cutoff'],
 ...Object.fromEntries(columns.slice(3).map(([k,title],i)=>[k,[title,columnInfo[i+3]]]))
};
const indicatorKeys=columns.map(x=>x[0]);
const greekKeys=['price','delta','gamma','charm','vanna','speed','color','caseId','regime','status','trade','dealerAction'];
schema.speed=['Speed','Variazione della gamma rispetto al sottostante, in unità della fonte'];
schema.color=['Color','Variazione temporale della gamma, in unità della fonte'];
const nativeUnits={delta:'ES eq.',gamma:'ES/pt SPX',charm:'ES/min',vanna:'ES/pt vol'};
const physical=['delta','gamma','charm','vanna'];
let field=null,bookIndex=new Map(),rawIndex=new Map(),chartInput=null,playTimer=0,playing=false;
function scaled(raw,k){
 const f=current?.frame, factor=f?.factors?.[k];
 if(!f||f.perspective!=='dealer'||!['inventory','signed_flow'].includes(f.kind)||!F(raw?.[k])||!F(factor)||factor<=0)return null;
 return raw[k]*factor;
}
function rowData(r){
 const detail=bookIndex.get(r.price),raw=rawIndex.get(r.price);
 return {...r,delta:under?scaled(raw,'delta'):(F(r.delta)?r.delta:null),vanna:under?scaled(raw,'vanna'):(F(r.vanna)?r.vanna:null),
  speed:F(raw?.speed)&&current?.frame?.units?.speed?raw.speed:F(r.speed)?r.speed:null,color:F(raw?.color)&&current?.frame?.units?.color?raw.color:F(r.color)?r.color:null,
  caseId:detail?.caseId||r.caseId||null,regime:detail?.regime||r.regime||null,liveState:detail?.status||r.status||null};
}
function setFields(){return state.view==='greeks'?greekKeys:indicatorKeys;}
function updateField(selected){
 if(!field)return;
 if(!chartInput){const tracks=new Map(shown.map(r=>[r.price,bookIndex.get(r.price)?.history||[]]));
 const mapKeys=under?['gamma','charm','delta','vanna'].filter(k=>[...tracks.values()].some(ticks=>ticks.length>=2&&ticks.some(p=>F(p[k])))):[];
 chartInput={tracks,mapKeys,rows:shown.map(r=>({...r,x:display(r.price),raw:r.price})),chart:book?.chart||[],coord:state.coord,spot:display(spotNative()),
  units:{...nativeUnits,...(!under||model.nativeScale?{gamma:'unità fonte',charm:'unità fonte'}:{})},cadence:under?.intervalMinutes||current?.frame?.intervalMinutes||1,
  historyUnits:current?.frame?.units||{},identity:[state.source,current?.cutoff,state.coord,state.find,state.range,state.focus,state.inferred,state.nativeScale].join('|')};}
 field.update({...chartInput,selected:selected?.price??null,selectedDisplay:display(selected?.price),history:bookIndex.get(selected?.price)?.history||[]});
}
function scenarioInput(){
 const el=id('Scenario');if(!el)return;
 el.hidden=!under;
 if(under)id('ShockCode').textContent='ΔS '+sv(state.ds)+' pt · ΔIV '+sv(state.div)+' pt vol · Δt '+val(state.dt)+' min';
}
function stopReplay(){if(playTimer)clearTimeout(playTimer);playTimer=0;playing=false;const b=id('Play');if(b){b.textContent='▶';b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Riproduci replay');}}
function playReplay(){
 if(playing){stopReplay();return;}
 if(state.clock!=='replay'||!editions.length)return;
 if(state.cut===editions.at(-1)){state.cut=editions[0];refresh();}
 playing=true;id('Play').textContent='Ⅱ';id('Play').setAttribute('aria-pressed','true');id('Play').setAttribute('aria-label','Pausa replay');
 function advance(){
  if(!stock()||doc.hidden||state.clock!=='replay'){stopReplay();return;}
  const i=editions.indexOf(state.cut)+1;if(i<=0||i>=editions.length){stopReplay();return;}
  state.cut=editions[i];refresh();if(i+1===editions.length){stopReplay();return;}playTimer=setTimeout(advance,850);
 }
 playTimer=setTimeout(advance,850);
}
function renderTable(){
 if(!model){renderHead(setFields());const e=id('Grid')?.querySelector('td');if(e)e.setAttribute('colspan',String(setFields().length));return;}
 const mid=spotNative(),pins=new Set(primary()),q=state.find.trim().toLocaleLowerCase('it-IT'),atm=nearest(rows)?.price;
 shown=rows.filter(r=>{
  if(state.range&&F(mid)&&Math.abs(r.price-mid)>state.range)return false;
  const exists=v=>v!=null&&!['','—','-','N/D'].includes(String(v));
  if(state.focus==='flip'&&!exists(r.flip)||state.focus==='alert'&&!exists(r.alert)||state.focus==='wall'&&!String(r.gTag||'').toUpperCase().includes('WALL')||state.focus==='watch'&&!rowName(r).includes('WATCH')||state.focus==='pin'&&!pins.has(r.price)||state.focus==='confirmed'&&r.liveState!=='confermato')return false;
  return !q||[r.price,display(r.price),val(display(r.price)),r.trade,r.dealerAction,r.flip,r.cg,r.gTag,r.velocity,r.alert,r.caseId,r.regime,r.liveState].some(v=>v!=null&&String(v).toLocaleLowerCase('it-IT').includes(q));
 });
 if(shown.length&&!shown.some(r=>r.price===state.key))state.key=nearest(shown)?.price??null;
 const peaks={};
 for(const key of physical.concat(['esgFlow','escFlow','speed','color'])){
  const a=rows.map(r=>r[key]).filter(F).map(Math.abs).filter(v=>v>0).sort((a,b)=>a-b);
  peaks[key]=a[Math.max(0,Math.ceil(.90*a.length)-1)]||1;
 }
 const active=setFields(),page=Math.max(0,Math.floor(shown.findIndex(r=>r.price===state.key)/pageSize)),start=page*pageSize;
 id('Pager').hidden=shown.length<=pageSize;id('Page').textContent=(start+1)+'–'+Math.min(shown.length,start+pageSize)+' / '+shown.length;
 shell.querySelector('[data-oa="page-prev"]').disabled=page===0;shell.querySelector('[data-oa="page-next"]').disabled=start+pageSize>=shown.length;
 renderHead(active);
 function content(r,k){
  if(k==='price')return '<th scope="row" data-field="price"><button type="button" data-oa="select" data-price="'+r.price+'" tabindex="'+(r.price===state.key?0:-1)+'">'+esc(priceFmt.format(display(r.price)))+'</button></th>';
  if(Object.hasOwn(peaks,k)){
   const v=r[k],intensity=F(v)?Math.min(1,Math.abs(v)/peaks[k]):0,amount=+(0.09+intensity*.48).toFixed(3);
   const style=F(v)&&v!==0?' style="--m:'+amount+';--extent:'+Math.round(100*intensity)+'%;--lane:'+(v>0?'73,163,183':'193,107,135')+'"':'';
   const tip=[F(v)?precise.format(v):'Dato assente',k==='gamma'?'CPT '+val(r.cpt):'',k==='delta'||k==='vanna'?nativeUnits[k]:''].filter(Boolean).join(' · ');
   return '<td class="oa-num '+tone(v)+'" data-field="'+k+'" title="'+esc(tip)+'"'+style+'>'+esc(formatQuantity(v))+(k==='gamma'?' <span>/ '+esc(F(r.cpt)?priceFmt.format(r.cpt):'—')+'</span>':'')+'</td>';
  }
  const v=k==='status'?r.liveState:r[k];
  return '<td class="oa-'+k+'" data-field="'+k+'" title="'+esc(label(v))+'">'+(k==='trade'||k==='caseId'?'<b>'+esc(label(v))+'</b>':esc(label(v)))+'</td>';
 }
 id('Grid').innerHTML=shown.slice(start,start+pageSize).map(r=>{
  const mark=['cyan','red'].includes(r.gammaMark)?r.gammaMark:'',signal=['green','orange','up','down'].includes(r.tradeColor)?r.tradeColor:'';
  return '<tr data-gmark="'+mark+'" data-trade-color="'+signal+'" data-k="'+r.price+'" aria-selected="'+(r.price===state.key)+'" data-atm="'+(r.price===atm)+'" data-pin="'+pins.has(r.price)+'">'+active.map(k=>content(r,k)).join('')+'</tr>';
 }).join('')||'<tr><td colspan="'+active.length+'" class="oa-none">Nessuno strike con questi filtri.</td></tr>';
 id('RowCount').textContent=shown.length+' / '+rows.length+' strike · '+state.coord;
 id('RowNote').textContent=[model.profile==='inferred'?'Gamma/CPT · scala indicatore':under?'Gamma/CPT · hedge su +0.25 pt SPX':'',F(atm)?'ATM '+val(display(atm))+' '+state.coord:'','Intensità per colonna · P90',model.profile==='inferred'?'Segnali stimati':under?'Copertura dealer':'Segnali della fonte'].filter(Boolean).join('   ·   ');
 chartInput=null;renderDetails();
}
let dialogKind=null,dialogPrice=null,opener=null;
function syncViews(){
 const v=state.view,ladder=v==='ladder'||v==='greeks';
 id('Book').hidden=!ladder;id('Field').hidden=v!=='chart';id('SessionView').hidden=v!=='session';
 id('BookTitle').textContent=v==='greeks'?'Greche dealer':'Strike Flow Analysis';
 id('Ladder').dataset.view=v==='greeks'?'greeks':'ladder';
 id('Range').value=String(state.range);
 for(const b of shell.querySelectorAll('[data-oa="view"]'))b.setAttribute('aria-pressed',String(b.dataset.view===v));
}
function showView(v){
 if(!['ladder','greeks','chart','session'].includes(v))return;
 closeDialog(false);state.view=v;syncViews();renderTable();
}
function finishDialog(restore=true){
 if(!dialogKind)return;
 const target=opener?.isConnected?opener:(id('Grid')?.querySelector('tr[data-k="'+state.key+'"] button')||shell?.querySelector('[data-oa="view"]'));
 dialogKind=null;dialogPrice=null;opener=null;
 id('Inspect').innerHTML='';
 if(restore&&target)target.focus?.({preventScroll:true});
}
function closeDialog(restore=true){
 if(!dialogKind)return;
 const dlg=id('Dialog');
 if(dlg?.hasAttribute('open')){if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open');}
 finishDialog(restore);
}
function showDialog(kind,el){
 if(!dialogKind)opener=el||doc.activeElement;
 dialogKind=kind;id('Step').hidden=kind!=='strike';
 const dlg=id('Dialog');if(!dlg.hasAttribute('open')){
  if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
  dlg.querySelector('[data-oa="close"]').focus?.({preventScroll:true});
 }
}
function openStrike(price,el){
 if(!F(price)||!model||!shown.some(r=>r.price===price))return false;
 if(!dialogKind)opener=el||doc.activeElement;
 dialogPrice=price;
 if(!pick(price,false))return false;
 showDialog('strike',el);renderDetails();return true;
}
function openGuide(el){
 showDialog('guide',el);id('DialogTitle').textContent='Guida ai segnali';
 id('Inspect').innerHTML=w.OAEntries?.html?.(null,model)||empty('Guida indisponibile.');
}
function stepStrike(delta){
 if(dialogKind!=='strike')return;
 const i=shown.findIndex(r=>r.price===dialogPrice),r=shown[i+delta];
 if(r)openStrike(r.price);
}
function showEmpty(message){
 rows=[];shown=[];bookIndex.clear();rawIndex.clear();chartInput=null;
 closeDialog(false);id('Loaded').hidden=true;id('Empty').hidden=false;id('Empty').innerHTML=empty(message);
 for(const key of ['Header','Banner','Context','Dynamics','RowNote','ShockCode','Page'])id(key).textContent='';
 id('Scenario').hidden=true;id('SessionData').hidden=true;id('Pager').hidden=true;
 for(const coord of ['SPX','ES'])shell.querySelector('[data-oa="'+coord+'"]').disabled=true;
 const active=setFields();renderHead(active);id('Grid').innerHTML='<tr><td colspan="'+active.length+'" class="oa-none">Nessun livello disponibile.</td></tr>';
 id('RowCount').textContent='0 strike';updateField(null);
}
const priceFmt=new Intl.NumberFormat('en-US',{useGrouping:false,minimumFractionDigits:1,maximumFractionDigits:3});
const quantityFmt=new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:5});
const formatQuantity=v=>F(v)?quantityFmt.format(v):'—';
function renderHead(active){
 id('Head').innerHTML=active.map(k=>'<th scope="col" data-field="'+k+'" title="'+esc(k==='gamma'&&under?model?.profile==='inferred'?'Gamma e CPT nella scala indicatore, se disponibile':'Gamma in ES/pt SPX e copertura per +0.25 pt SPX (−0.25 × gamma)':schema[k][1])+'">'+esc(k==='price'&&state.view!=='greeks'?'Price':schema[k][0])+'</th>').join('');
}
function renderDetails(){
 const selected=shown.find(x=>x.price===state.key);
 if(state.view==='chart')updateField(selected);
 if(dialogKind!=='strike')return;
 const r=shown.find(x=>x.price===dialogPrice);
 if(!r){closeDialog(false);return;}
 const i=shown.indexOf(r);shell.querySelector('[data-oa="prior-strike"]').disabled=i<=0;
 shell.querySelector('[data-oa="next-strike"]').disabled=i>=shown.length-1;
 const price=display(r.price),sp=display(spotNative()),p=model.panels||{},detail=bookIndex.get(r.price),st=detail?.status||r.status;
 id('DialogTitle').textContent='Strike '+priceFmt.format(price)+' '+state.coord;
 const origin=!under?'Segnale della fonte':model.profile==='inferred'?'Segnale stimato':'Lettura del flusso';
 const header='<header class="oa-ticket-lead"><div><small>'+esc(origin)+'</small><strong>'+esc(label(r.trade))+'</strong>'+(st?'<span>'+esc(st)+'</span>':'')+'</div><div><small>Distanza spot</small><b>'+esc(F(sp)?sv(price-sp)+' pt':'—')+'</b></div><div><small>Edizione</small><b>'+esc(et(model.asof))+'</b></div></header>';
 let tactical='';
 if(detail){
  const alive=!book.reason&&st!=='sospeso',direction=alive&&detail.status==='confermato'?detail.direction:null;
  const cues=[['Caso e regime',[detail.caseId,book.regime].filter(Boolean).join(' · ')],['Copertura al livello',alive?detail.hedge:book.reason||'Sospesa'],['Condizione',alive?detail.trigger:null],['Invalidazione',alive?detail.invalidation:null],['Stop del retest',alive&&F(detail.stopReference)?priceFmt.format(display(detail.stopReference))+' '+state.coord:null],['Prossimo livello gamma',alive&&F(detail.target)?priceFmt.format(display(detail.target))+' '+state.coord:null]];
  tactical='<section class="uf-ticket"><h3>'+esc(direction?'Retest confermato · '+direction:alive?detail.pattern:'Lettura sospesa')+'</h3><dl>'+cues.filter(z=>z[1]).map(z=>rec(...z)).join('')+'</dl></section>';
  const q=detail.contributions||{},as=x=>F(x)?sv(x)+' ES eq.':null;
  tactical+='<section class="oa-ticket-risk"><h3>Contributi di copertura</h3><dl class="uf-ledger">'+[['−Δ stock',as(detail.stockHedge)],['−Δ nuovi contratti',as(detail.tradeHedge)],['Gamma × shock',as(q.gamma)],['Vanna × shock',as(q.vanna)],['Charm × tempo',as(q.charm)],['Totale incrementale',as(detail.net)],['DP / CP',[sv(detail.dp),sv(detail.cp)].join(' / ')]].map(z=>rec(...z)).join('')+'</dl></section>';
 }
 const guide=under&&(book?.reason||st==='sospeso')?'':w.OAEntries?.html?.(r,model,{price,spot:sp,coord:state.coord,regime:p.tactical?.regime||book?.regime})||'';
 const extra=w.StrikeDiagnostics?.html?.(under,current?.frame,book,detail)||'';
 id('Inspect').innerHTML=header+(r.dealerAction?'<p class="uf-action">'+esc(r.dealerAction)+'</p>':'')+tactical+guide+extra;
}

function pick(p,focus=true){
 const r=shown.find(x=>x.price===p);if(!r)return false;state.key=r.price;
 if(!id('Grid').querySelector('tr[data-k="'+p+'"]'))renderTable();
 for(const tr of id('Grid').querySelectorAll('tr[data-k]')){const sel=Number(tr.dataset.k)===state.key;tr.setAttribute('aria-selected',String(sel));const b=tr.querySelector('button');if(b){b.tabIndex=sel?0:-1;if(sel&&focus){b.focus({preventScroll:true});b.scrollIntoView?.({block:'nearest',inline:'nearest'});}}}
 renderDetails();return true;
}
function reveal(p,button){
 if(!F(p))return;
 if(!rows.some(r=>r.price===p)){id('RowNote').textContent='Livello '+val(display(p))+' '+state.coord+' fuori dagli strike di questa edizione.';id('RowNote').scrollIntoView?.({block:'nearest'});return;}
 if(!shown.some(r=>r.price===p)){
  state.focus='all';state.find='';state.range=0;id('Focus').value='all';id('Find').value='';id('Range').value='0';renderTable();
 }
 openStrike(p,button);
}
function panel(title,body,info,wide=false){
 return '<article class="oa-panel'+(wide?' oa-room':'')+'"><h3>'+esc(title)+'</h3>'+body+(set?.kind==='reference'&&title==='Speed flip'?'<p class="oa-foot">Riepilogo della fonte: 4 conferme. Livelli identificati: 3.</p>':'')+'</article>';
}
function tab(headers,body,alt){
 if(!body.length)return empty(alt||'Valori indisponibili al cutoff.');
 return '<div class="oa-tabwrap"><table class="oa-mini"><thead><tr>'+headers.map(a=>'<th scope="col">'+esc(a)+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
const eVal=v=>esc(val(v)),eSign=v=>esc(sv(v)),eText=v=>esc(label(v)),pcent=v=>F(v)?val(v)+'%':'—';
function renderPanels(){
 const p=model.panels||{},cd=p.charmDaily||{},ct=p.charmTactical||{},t=p.tactical||{},d=p.delta||{},m=p.momentum||{},proj=p.projections||{},s=p.speed||{};
 const rank=['Primario','Secondario','Terziario'];
 const daily=asArray(cd.levels).map((l,i)=>[esc(rank[i]||l.rank),jump(l.price),eSign(l.value),eText(l.label)]);
 const intraday=asArray(ct.levels).map((l,i)=>[esc(l.name||rank[i]||l.rank),jump(l.price),eSign(l.value),esc([l.label,l.aligned===true?'Daily allineato':''].filter(Boolean).join(' · '))]);
 const dt=[...asArray(d.supports).map(l=>['Supporto',l]),...asArray(d.resistances).map(l=>['Resistenza',l])].map(([which,l])=>[which,jump(l.price),eSign(l.distance),eSign(l.delta)]);
 const delta='<dl class="oa-kv">'+rec('Delta netto',sv(d.net))+rec('Bias',d.bias)+rec('Rapporto put/call Δ',val(d.ratio))+'</dl>'+
  tab(['Lato','Livello '+state.coord,'Distanza','Delta'],dt,'Servono livelli delta distinti per lato.')+
  '<p class="oa-foot">Min '+eVal(d.min)+' · Max '+eVal(d.max)+' · Media '+eVal(d.avg)+'</p>';
 const tact='<dl class="oa-kv">'+rec('Regime',t.regime)+rec('Gamma',t.gamma)+rec('Charm',sv(t.charm))+rec('Bias',t.bias)+(F(t.pivot)?rec('Pivot '+state.coord,val(display(t.pivot))):'')+'</dl>'+(t.qualifier?'<p>'+eText(t.qualifier)+'</p>':'')+
  tab(['Livello '+state.coord,'Funzione','Forza'],asArray(t.levels).map(l=>[jump(l.price),eText(l.side),eText(l.strength)]),'Nessun livello tattico disponibile.');
 id('Context').innerHTML=panel('Target charm',tab(['Finestra','Priorità','Livello '+state.coord,'Charm','Lettura'],[...daily.map(a=>['Daily',...a]),...intraday.map(a=>['Intraday',...a])])+(ct.phase?'<p class="oa-tiny">'+eText(ct.phase)+'</p>':''),{notes:[...notesOf(cd),...notesOf(ct)]})+panel('Lettura tattica',tact,t)+panel('Esposizione delta',delta,d);
 const mom=(F(m.focus)?'<p class="oa-tiny">Focus '+jump(m.focus)+' '+state.coord+'</p>':'')+
  tab(['Finestra','Velocità / min','Momentum'],asArray(m.windows).map(z=>[eVal(z.minutes)+'m',eSign(z.velocity),eText(z.label)]),'Storia intraday insufficiente.')+
  tab(['Strike '+state.coord,'Velocità','Stato'],asArray(m.strikes).map(z=>[jump(z.price),eSign(z.velocity),eText(z.state)]),'');
 const pr=(F(proj.focus)?'<p class="oa-tiny">Strike focus '+jump(proj.focus)+' '+state.coord+'</p>':'')+(proj.quality||F(proj.horizon)?'<p class="oa-tiny">'+eText(proj.quality)+(F(proj.horizon)?' · '+eVal(proj.horizon)+' min':'')+'</p>':'')+
  tab(['Orizzonte','Gamma','Charm','Conf.','Conv.','Trend'],asArray(proj.rows).map(z=>['+'+eVal(z.minutes)+'m',eSign(z.gamma),eSign(z.charm),esc(pcent(z.confidence)),esc(pcent(z.convergence)),eText(z.trend)]))+
  (proj.next?'<p class="oa-next"><b>Prossimo evento · +'+eVal(proj.next.minutes)+'m</b> '+esc([proj.next.type,proj.next.description].filter(Boolean).join(' · '))+'</p>':'');
 const gr=[['confirmed','Confermati'],['likely','Zone probabili'],['watch','Watch']],counts=gr.map(([key,name])=>'<span>'+esc(name)+' <b>'+eVal(s.counts?.[key])+'</b></span>').join('');
 const fl=gr.flatMap(([key,title])=>asArray(s[key]).map(z=>[esc(title),jump(z.price),eVal(z.score),eSign(z.distance),F(z.zone)?jump(z.zone):'—',eText(z.regime||z.label)]));
 const sp='<div class="oa-tags">'+counts+'</div>'+tab(['Classe','Livello '+state.coord,'Score','Dist. pt','Zona','Stato'],fl,'Nessun livello speed flip identificato in questa edizione.')+
 (asArray(s.insights).length?'<ul class="oa-foot">'+s.insights.map(z=>'<li>'+jump(z.price)+' '+eText(z.regime)+'</li>').join('')+'</ul>':'');
 id('Dynamics').innerHTML=panel('Momentum del pin',mom,m)+panel('Proiezioni gamma e charm',pr,proj)+panel('Speed flip',sp,s,true);
}
function rules(){
 const box=id('Rules');box.hidden=!under;if(!under)return;
 const f=current.frame,pre=under.mode==='demo'&&under.oaCompatible===true||String(f?.units?.gamma||'').trim().toLowerCase()==='oa gamma'&&String(f?.units?.charm||'').trim().toLowerCase()==='oa charm';
 const mode=state.inferred?'inferred':'qt';id('Method').value=mode;id('Units').checked=!!state.nativeScale||pre;id('Units').disabled=pre;id('UnitLabel').hidden=!state.inferred;
}
function onClick(e){
 const b=e.target.closest?.('[data-oa]');
 if(!b){const tr=e.target.closest?.('tr[data-k]');if(tr&&id('Grid')?.contains(tr)){openStrike(Number(tr.dataset.k),tr.querySelector('button'));return;}
  if(e.target===id('Dialog')){const r=id('Dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}return;}
 if(!shell.contains(b))return;const act=b.dataset.oa,price=Number(b.dataset.price);
 if(act==='close'){closeDialog();return;}
 if(act==='next-strike'||act==='prior-strike'){stepStrike(act==='next-strike'?1:-1);return;}
 if(act==='guide'){openGuide(b);return;}
 if(act==='view'){showView(b.dataset.view);return;}
 if(act==='reference'){state.filter='all';state.coord='ES';state.range=0;state.view='ladder';chooseSource('reference');return;}
 if(act==='select'){openStrike(price,b);return;}
 if(act==='strike'){reveal(price,b);return;}
 if(act==='SPX'||act==='ES'){
  if(!model||act!==nativeCoord()&&!F(basis()))return;state.coord=act;
  try{w.localStorage?.setItem('quantistes.oa.coordinate',act);}catch{}
  refresh();return;
 }
 if(act==='jump'){doc.getElementById(b.dataset.anchor)?.scrollIntoView?.({block:'start'});return;}
 if(act==='atm'){const near=nearest(shown);if(near)pick(near.price);return;}
 if(act==='page-prev'||act==='page-next'){
  const page=Math.floor(shown.findIndex(r=>r.price===state.key)/pageSize),index=(page+(act==='page-next'?1:-1))*pageSize;
  if(index>=0&&index<shown.length){pick(shown[index].price);id('Viewport').scrollTop=0;}return;
 }
 if(act==='update'){refresh();return;}
 if(act==='hub'){doc.getElementById('q15DataButton')?.click();return;}
 if(act==='play'){playReplay();return;}
 if(act==='prev'||act==='next'){stopReplay();const i=editions.indexOf(state.cut),n=i+(act==='next'?1:-1);if(n>=0&&n<editions.length){state.cut=editions[n];refresh();}return;}
 if(act==='schema'||act==='backup'){
  try{
   const t=act==='backup'?w.OANative.backup():w.OANative.template(),text=typeof t==='string'?t:JSON.stringify(t,null,2),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
   const a=doc.createElement('a');a.download=act==='backup'?'Quantistes_Edizioni_Indicatore.json':'Quantistes_Indicatore_Formato.json';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(err){id('ImportStatus').textContent=String(err.message||err);}return;
 }
}
function onKey(e){
 if(dialogKind&&e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDialog();return;}
 const b=e.target.closest?.('[data-oa="select"]');if(!b)return;
 const keys=['ArrowDown','ArrowUp','Home','End','Enter',' '];if(!keys.includes(e.key))return;
 e.preventDefault();if(e.key==='Enter'||e.key===' '){openStrike(Number(b.dataset.price),b);return;}let i=shown.findIndex(r=>r.price===Number(b.dataset.price));
 i=e.key==='ArrowDown'?i+1:e.key==='ArrowUp'?i-1:e.key==='Home'?0:e.key==='End'?shown.length-1:i;
 if(shown.length)pick(shown[Math.max(0,Math.min(shown.length-1,i))].price);
}
async function upload(){
 const file=id('File').files?.[0];if(!file)return;
 id('ImportStatus').textContent='Lettura del file…';id('File').disabled=true;
 try{
  const before=new Set(asArray(w.OANative.list()).map(x=>nativeId(x)+'|'+stamp(x.asof)+'|'+stamp(x.availableAt)));
  const res=await w.OANative.importFile(file);
  const items=asArray(w.OANative.list()),added=items.filter(x=>!before.has(nativeId(x)+'|'+stamp(x.asof)+'|'+stamp(x.availableAt)));
  const first=added.at(-1)||items.find(x=>x.id===res?.id||x.seriesId===res?.seriesId);
  if(first){state.filter='all';chooseSource('native:'+nativeId(first));}else refresh();
  id('ImportStatus').textContent=added.length?added.length+' edizioni consultabili.':'File acquisito. Le edizioni sono visibili dalla loro ora di disponibilità.';
 }catch(err){id('ImportStatus').textContent=String(err?.message||err);}
 finally{id('File').disabled=false;id('File').value='';}
}
function openAt(source,cutoff,strike,coord){
 if(typeof source!=='string'||!F(cutoff))return false;closeDialog(false);state.view='ladder';stopReplay();state.scoreLink=false;
 state.source=source.startsWith('flow:')||source.startsWith('native:')||source==='reference'?source:'flow:'+source;
 state.filter='all';state.clock='fixed';state.fixed=cutoff;state.cut=cutoff;state.key=F(strike)?strike:null;state.find='';state.focus='all';state.range=0;
 state.nativeScale=false;const target=state.source==='flow:oa-scale-demo'?asArray(w.ScalpSources?.list?.(cutoff)).find(p=>p.id===source||'flow:'+p.id===state.source):null;state.inferred=target?.mode==='demo'&&target.oaCompatible===true;
 if(coord==='SPX'||coord==='ES')state.coord=coord;
 w.QuantistesFlatDesk?.go?.('scalp','scalp-indicator');
 if(mount()){id('Find').value='';id('Range').value='0';id('Focus').value='all';refresh();}
 return true;
}
function openScore(cut,id,strike){
  if(!F(cut))return false;
  const ok=openAt(id||'cutoff-osservato',cut,strike);
  state.scoreLink=true;Object.assign(state,{ds:1,div:0,dt:1,band:.5});
  for(const [k,v] of [['Ds',1],['Div',0],['Dt',1],['Band',.5]])if(doc.getElementById('oa'+k))doc.getElementById('oa'+k).value=String(v);
  if(ok){refresh();if(F(strike)&&!book?.reason&&model?.rows?.some(r=>r.price===strike))openStrike(strike);}return ok;
 }
 w.OADashboard=Object.freeze({openAt,openScore,refresh,state:()=>({id:state.source,strike:state.key,cutoff:current?.cutoff,clock:state.clock,coord:state.coord,view:state.view,mode:model?.mode,shown:shown.length})});
w.addEventListener('desk:route',e=>{if(e.detail?.tool==='scalp-indicator')queue();else {closeDialog(false);cancel();stopReplay();}});
for(const k of ['desk:scalp-sources','desk:frame-changed','desk:oa-native'])w.addEventListener(k,()=>{if(stock())queue();});
doc.addEventListener('visibilitychange',()=>{if(doc.hidden){cancel();stopReplay();}else if(stock())queue();});
const start=()=>{if(stock())queue();const done=w.OANative?.ready?.();if(done?.then)done.then(()=>{if(stock())queue();}).catch(()=>{});};
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window,document);

