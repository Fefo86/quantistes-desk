/* QUANTISTES v23. UX-only shell for the *original* Quantistes Hacker Exchange Desk v16.
   Keep all original program scripts intact, including API / CSV parser / numerical models. */
(function(){'use strict';
 const E=id=>document.getElementById(id);
 const stages=[
  ['score','00','COMMAND','Decision & levels'],
  ['market','01','IMPLIED','Chart · skew · Q'],
  ['dealer','02','POSITIONING','Gamma · flow'],
  ['path','03','PHYSICAL','Q/P · paths'],
  ['audit','04','RESEARCH','Qualità delle quotazioni'],
  ['reports','05','REPORT','Fonti istituzionali'],
  ['scalp','06','SCALPING','Flussi per strike']
 ];
 const stageDesc={
  score:'Evidence → confluenza → livelli / TradingView',
  market:'SPX chart / IPPO → CVI skew → Q → livelli',
  dealer:'Inventario firmato → Gamma / Vanna / Charm',
  path:'P fisica → touch → probabilità pathwise',
  audit:'Regimi · qualità delle quotazioni', reports:'Indicatori e fonti istituzionali',scalp:'Copertura dealer e test per strike'
 };
 const state={stage:'score',boot:false,mode:'overview',lastFile:null,lastMeta:'',repeatChanges:0};
 function gotoStage(stage){
  const btn=E('q13Nav')?.querySelector('[data-q13-view="'+stage+'"]');
  if(btn)btn.click();else window.QuantistesConfluence?.go?.(stage);
  requestAnimationFrame(()=>{sync();window.dispatchEvent(new Event('resize'));});
 }
 function getNative(stage){return document.querySelector('[data-q13-panel="'+stage+'"]');}
 function nativeMode(stage,full){
  const pane=getNative(stage),button=pane?.querySelector('.q15-mode-switch button:nth-child('+(full?2:1)+')');
  if(button)button.click();
  return pane;
 }
 function openTool(stage,tool){
  // The native API selects a tool but DOES NOT activate FULL ANALYTICS.
  // Both native operations are necessary; keep original rendering/state logic.
  nativeMode(stage,true);
  const go=window.Quantistes15?.open;
  if(typeof go==='function')go(stage,tool);
  else{gotoStage(stage);const b=getNative(stage)?.querySelector('[data-q15-tool="'+tool+'"]');if(b)b.click();}
  requestAnimationFrame(()=>{sync();window.dispatchEvent(new Event('resize'));});
 }
 function sync(){
  if(!state.boot)return;
  const current=window.QuantistesConfluence?.getState?.()?.stage||state.stage;
  state.stage=current;
  for(const b of document.querySelectorAll('#qlNav [data-ql-stage]')){
   const is=b.dataset.qlStage===current;
   b.classList.toggle('on',is);b.setAttribute('aria-current',is?'page':'false');
  }
  for(const [stage] of stages){
   const pane=getNative(stage);if(!pane)continue;
   const full=pane.classList.contains('q15-native-only');
   const active=pane.querySelector('.q15-instrument')?.getAttribute('data-active-tool')||'';
   for(const b of pane.querySelectorAll('[data-ql-show]')){
    const show=b.dataset.qlShow,sel=show==='overview'?!full:full&&b.dataset.qlTool===active;
    b.classList.toggle('on',sel);b.setAttribute('aria-pressed',sel?'true':'false');
   }
  }
  const result=window.Desk?.state?.result;
  // Refresh the ORIGINAL confluence presentation after the ORIGINAL CVI engine commits.
  // Never re-fit/recompute; only call the old presentation routine once per result.
  if(result&&!window.Desk?.state?.stale&&result!==state.lastResult){
    state.lastResult=result;
    window.QuantistesConfluence?.refresh?.();
  }
  const mode=E('q13RunMode')?.textContent?.trim()||'UNVERIFIED';
  if(E('qlDataStatus'))E('qlDataStatus').innerHTML=result&&!window.Desk?.state?.stale&&result.ws?.qAudit?.passed?'<span class="ql-check">● CVI CALCOLATO</span>':'<b>○ CVI DA CARICARE</b>';
  if(E('qlModeStatus'))E('qlModeStatus').textContent='SORGENTE: '+mode;
  const d=E('dataMeta')?.textContent?.trim(),inp=E('settlement')?.value?.trim();
  const file=state.lastFile;
  const ivNote=/IV nulle|IV non valid/i.test(d||'')?' · IV provider assenti: il CVI usa i premi bid/ask.':'';
  const visibleStatus=file?('ULTIMO CSV: '+file.name+' · '+(d||'in verifica')+ivNote+(inp?' · settlement '+inp:' · SETTLEMENT RICHIESTO')):'Nessun nuovo CSV importato';
  if(E('qlImportStatus')){E('qlImportStatus').textContent=visibleStatus;E('qlImportStatus').classList.toggle('ql-import-ok',!!file && /^\d+\s+righe/.test(d||''));}
  if(E('qlCalcLabel'))E('qlCalcLabel').textContent=inp?'Settlement impostato · pronto per il calcolo.':'Inserisci il settlement SPX (o clicca «Usa spot CSV») prima di calcolare.';
 }
 function populateNav(){
  const el=document.createElement('nav');el.id='qlNav';el.setAttribute('aria-label','Ambienti del desk');
  for(const [stage,no,name,descr] of stages){
   const b=document.createElement('button');b.type='button';b.dataset.qlStage=stage;
   b.innerHTML='<i>'+no+'</i><span>'+name+'<small>'+descr+'</small></span>';
   b.addEventListener('click',()=>gotoStage(stage));el.appendChild(b);
  }
  for(const [id,txt,cb] of [
   ['qlOpenData','▣ DATA HUB',()=>E('q15DataButton')?.click()],
   ['qlFindTools','⌕ FIND',()=>E('q15ToolsButton')?.click()],
   ['qlOpenEvidence','◈ EVIDENCE',()=>{window.QuantistesFlatDesk?.go('score','decision');requestAnimationFrame(()=>document.getElementById('deskLedgerRows')?.closest('table')?.scrollIntoView({block:'center'}));}]
  ]){
   const b=document.createElement('button');b.id=id;b.className='ql-nav-aux';b.type='button';b.innerHTML='<b>'+txt+'</b>';b.addEventListener('click',cb);el.appendChild(b);
  }
  return el;
 }
 function initStages(){
  for(const [stage] of stages){
   if(stage==='reports'||stage==='scalp')continue;
   const pane=getNative(stage);if(!pane)continue;
   const title=pane.querySelector('.q13-screen-title');if(!title)continue;
   const bar=document.createElement('div');bar.className='ql-studio';bar.setAttribute('aria-label','Studi operativi '+stage);
   const start=document.createElement('div');start.className='ql-studio-start';
   const meta=document.createElement('div');meta.className='ql-studio-kicker';meta.textContent='STUDIES // '+stageDesc[stage];
   const overview=document.createElement('button');overview.type='button';overview.dataset.qlShow='overview';overview.textContent=stage==='market'?'◈ CHART + LIVELLI':'◈ PANORAMICA';
   overview.addEventListener('click',()=>{nativeMode(stage,false);sync();window.dispatchEvent(new Event('resize'));});
   start.append(meta,overview);bar.appendChild(start);
   const tools=document.createElement('div');tools.className='ql-studio-tools';
   const nav=pane.querySelector('.q15-instrument .q15-toolnav');
   for(const original of nav?.querySelectorAll('button[data-q15-tool]')||[]){
    const tool=original.dataset.q15Tool;
    const text=original.innerText?.replace(/^\s*\d+[\s\u00a0]*/, '').trim()||tool;
    const b=document.createElement('button');b.type='button';b.dataset.qlShow='tool';b.dataset.qlTool=tool;b.textContent=text;
    b.addEventListener('click',()=>openTool(stage,tool));tools.appendChild(b);
   }
   bar.appendChild(tools);title.after(bar);
  }
 }
 function liftMarket(){
  const pane=getNative('market');if(!pane)return;
  const top=pane.querySelector('.ql-studio');const chart=E('q16AtlasDock'),level=E('q13MarketLevels')?.closest('.q13-panel');
  if(!top||!chart||!level)return;
  top.after(chart);chart.after(level); // move native sections only. Do not clone/calculate.
 }
 function initDataHub(){
  const mount=E('q15ParamsMount'),native=E('terminalSidebar'),calculate=E('calculate'),input=E('csvFile');
  if(!mount||!native||!input||!calculate)return;
  const guide=document.createElement('section');guide.id='qlDataGuide';
  guide.innerHTML='<h3>DATA HUB / SESSIONE SPXW</h3><div>1. Carica il file dal <strong>campo CSV</strong>. 2. Controlla <strong>snapshot ET, scadenza e settlement SPX</strong>. 3. Premi <strong>CALCOLA LIVELLI</strong>. Puoi tornare sul campo CSV e scegliere di nuovo lo stesso file, anche dopo un fit.</div><div id="qlImportStatus" role="status" aria-live="polite">Nessun nuovo CSV importato.</div>';
  mount.insertBefore(guide,native);
  // Single entry to every existing importer: these controls route to native v16,
  // never introduce a duplicate parser or numerical path.
  const sources=document.createElement('section');sources.id='qlFeeds';
  sources.innerHTML='<div class="ql-feeds-title">ALTRI DATI & FEED · ALTRE FONTI</div><div class="ql-feeds-row"><label for="q13SnapshotFile" class="ql-feed-btn">＋ PREZZI ES / VIX · JSON/CSV</label><button type="button" data-ql-feed="connect">○ CONNETTI PREZZI</button><button type="button" data-ql-feed="dealer">Γ DEALER POSITIONS</button><button type="button" data-ql-feed="flow">⇄ OPTIONS / FLOW</button><button type="button" data-ql-feed="surface">◈ MULTI-EXPIRY</button><button type="button" data-ql-feed="history">◷ HISTORICAL REPLAY</button></div>';
  guide.after(sources);
  const hint=document.createElement('p');hint.className='desk-snapshot-hint';hint.textContent='Snapshot prezzi: asof, es_last, vix, vix_asof. Timestamp ISO con fuso. Il bridge legge /snapshot sulla porta locale 8787.';sources.appendChild(hint);
  const receipt=document.createElement('output');receipt.className='desk-snapshot-receipt';receipt.setAttribute('aria-live','polite');sources.appendChild(receipt);
  const label=E('q13SourceMsg'),bridge=E('q13Bridge'),button=sources.querySelector('[data-ql-feed="connect"]');
  const updatePriceState=()=>{receipt.textContent=label?.textContent||'';if(button&&bridge){button.title=bridge.textContent;const on=/CONNESSO|CONNECTED/.test(bridge.textContent);button.textContent=on?'● PREZZI CONNESSI':/OFFLINE/.test(bridge.textContent)?'○ BRIDGE OFFLINE':'○ CONNETTI PREZZI';}};
  if(label&&bridge&&window.MutationObserver){const observer=new MutationObserver(updatePriceState);for(const node of [label,bridge])observer.observe(node,{childList:true,subtree:true,characterData:true});}updatePriceState();

  sources.addEventListener('click',e=>{
    const type=e.target.closest('[data-ql-feed]')?.dataset.qlFeed;
    if(!type)return;
    E('q15SettingsClose')?.click();
    if(type==='connect'){E('q13Bridge')?.click();return;}
    const route={dealer:['dealer',null],flow:['dealer','flows'],surface:['market','volcube'],history:['path','history']}[type];
    if(route){const map={flow:'flow-ops',surface:'volcube',history:'history',dealer:'signed'};if(type==='dealer'){window.QuantistesFlatDesk?.go('dealer','signed');E('q13DealerFile')?.click();}else window.QuantistesFlatDesk?.go(route[0],map[type]);}
  });
  const dock=document.createElement('div');dock.id='qlCalcDock';dock.innerHTML='<span id="qlCalcLabel">Mark su prezzi bid/ask SPXW.</span>';
  mount.appendChild(dock);dock.appendChild(calculate); // moving preserves the actual original event handler
  // Native file controls may otherwise omit the change event when selecting the same filename twice.
  // Reset only the file input's presentation value when the picker opens, NOT Desk.state nor the engine.
  input.addEventListener('click',()=>{input.value='';},{capture:true});
  input.addEventListener('change',()=>{
    // The original v16 handler may reset input.value immediately after parsing.
    // Capture the selection BEFORE that handler executes, without affecting it.
    const fs=Array.from(input.files||[]);
    if(fs.length){state.lastFile=fs.length===1?{name:fs[0].name}:{name:fs.length+' file (multi-CSV)'};state.repeatChanges++;}
    requestAnimationFrame(sync);
  },{capture:true});
  E('settlement')?.addEventListener('input',()=>requestAnimationFrame(sync));
  for(const id of ['dataMeta','statusText']){
   const n=E(id);if(!n)continue;
   new MutationObserver(()=>requestAnimationFrame(sync)).observe(n,{childList:true,characterData:true,subtree:true});
  }
 }
 function init(){
  if(state.boot||!E('q13App')||!E('q13Nav')||!E('q15Settings')||!E('q15ParamsMount'))return;
  const app=E('q13App');
  app.querySelector('.q13-header')?.after(populateNav());
  const status=document.createElement('div');status.id='qlStatusLine';status.innerHTML='<span>WORKFLOW / <b>SPXW / Q · POSIZIONI DEALER · P STORICA ES</b></span><span id="qlDataStatus">○ CVI DA CARICARE</span><span id="qlModeStatus">SORGENTE DA VERIFICARE</span>';
  E('qlNav')?.after(status);
  initStages();liftMarket();initDataHub();
  state.boot=true;
  for(const x of document.querySelectorAll('#q13Nav [data-q13-view]'))x.addEventListener('click',()=>requestAnimationFrame(sync));
  for(const x of document.querySelectorAll('.q15-instrument .q15-toolnav [data-q15-tool],.q15-mode-switch button'))x.addEventListener('click',()=>requestAnimationFrame(sync));
  sync();
  // Native mode changes can originate from the command finder or the original advanced controls.
  const observer=new MutationObserver(()=>requestAnimationFrame(sync));
  for(const [s] of stages){const pane=getNative(s);if(pane)observer.observe(pane,{attributes:true,attributeFilter:['class']});const lab=pane?.querySelector('.q15-instrument');if(lab)observer.observe(lab,{attributes:true,attributeFilter:['data-active-tool']});}
 }
 function start(){if(!E('q13App')){setTimeout(start,100);return}init()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0));else setTimeout(start,0);
 window.QuantistesLayout=Object.freeze({go:gotoStage,tool:openTool,hub:()=>E('q15DataButton')?.click(),state:()=>({...state,nativeScriptsUntouched:true})});
})();
